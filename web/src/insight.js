/**
 * Insight — Phase 8 proof of concept (the inverted classifier).
 *
 * Phase 7 classifies data moves the student MADE. This inverts it: analyze
 * the dataset for affordances — intriguing relationships, outliers,
 * groupable structure — cross them with the moves the student has NOT yet
 * tried (state.dataMoves), and rank suggestions. Each suggestion carries a
 * human-readable RATIONALE (surfaced in the "Dot's mind" panel) and an
 * attention target for the wise-attend behavior.
 *
 * Wise-kitten constraints (docs/CHARACTER.md): suggestions are delivered as
 * ATTENTION only — Dot becomes fascinated by exactly the right thing. If
 * the analysis is wrong, it reads as ordinary curiosity; nothing is lost.
 */

const OUTLIER_Z = 1.8;                // |z| beyond this = the lone dot
const STRONG_R = 0.5;                 // |r| beyond this = a relationship
const GROUPABLE_MIN = 2;              // categorical cardinality sweet spot
const GROUPABLE_MAX = 8;

/** Pull the first populated data context and compute its affordances. */
export async function analyzeDataset(bridge) {
  const ctxList = (await bridge.request('get', 'dataContextList'))?.values ?? [];
  for (const ctx of ctxList) {
    const name = ctx.name;
    const items = (await bridge.request('get',
      `dataContext[${name}].itemSearch[*]`))?.values ?? [];
    if (items.length < 4) continue;
    const rows = items.map((it) => it.values ?? {});
    const attrNames = Object.keys(rows[0] ?? {});
    const collections = (await bridge.request('get',
      `dataContext[${name}].collectionList`))?.values ?? [];

    const attrs = attrNames.map((a) => {
      const raw = rows.map((r) => r[a]).filter((v) => v !== '' && v != null);
      const nums = raw.map(Number).filter(Number.isFinite);
      const numeric = nums.length >= raw.length * 0.8 && nums.length > 0;
      if (numeric) {
        const mean = nums.reduce((x, y) => x + y, 0) / nums.length;
        const sd = Math.sqrt(nums.reduce((x, y) => x + (y - mean) ** 2, 0) / nums.length) || 1;
        return { name: a, kind: 'numeric', mean, sd, values: nums };
      }
      const cats = [...new Set(raw.map(String))];
      return { name: a, kind: 'categorical', cardinality: cats.length, categories: cats };
    });

    // outliers: |z| > threshold on any numeric attribute
    const outliers = [];
    for (const a of attrs.filter((x) => x.kind === 'numeric')) {
      rows.forEach((r, i) => {
        const v = Number(r[a.name]);
        if (!Number.isFinite(v)) return;
        const z = (v - a.mean) / a.sd;
        if (Math.abs(z) > OUTLIER_Z) {
          outliers.push({ attr: a.name, caseIndex: i + 1, value: v, z: +z.toFixed(2) });
        }
      });
    }
    outliers.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));

    // pairwise Pearson correlations between numeric attrs
    const numerics = attrs.filter((x) => x.kind === 'numeric');
    const correlations = [];
    for (let i = 0; i < numerics.length; i++) {
      for (let j = i + 1; j < numerics.length; j++) {
        const A = numerics[i], B = numerics[j];
        const n = Math.min(A.values.length, B.values.length);
        if (n < 4) continue;
        let sxy = 0;
        for (let k = 0; k < n; k++) sxy += (A.values[k] - A.mean) * (B.values[k] - B.mean);
        const r = sxy / (n * A.sd * B.sd);
        if (Number.isFinite(r)) correlations.push({ a: A.name, b: B.name, r: +r.toFixed(2) });
      }
    }
    correlations.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

    return {
      context: name, caseCount: rows.length, attrs, outliers, correlations,
      groupables: attrs.filter((x) => x.kind === 'categorical'
        && x.cardinality >= GROUPABLE_MIN && x.cardinality <= GROUPABLE_MAX),
      isHierarchical: collections.length > 1,
      hasFormulas: false,           // refined below if attribute info available
      at: performance.now() / 1000,
    };
  }
  return null;
}

/**
 * The inverted classifier: affordances × moves-not-yet-tried → ranked
 * suggestions { move, key, score, rationale, target }. Novelty dominates
 * (an untried move class scores double); strength (|z|, |r|, cardinality
 * fit) breaks ties.
 */
export function suggestMoves(analysis, dataMoves) {
  if (!analysis) return [];
  const tried = (m) => (dataMoves?.get?.(m)?.count ?? 0) > 0;
  const novelty = (m) => (tried(m) ? 1 : 2);
  const out = [];

  for (const g of analysis.groupables) {
    out.push({
      move: 'grouping', key: `grouping:${g.name}`,
      score: novelty('grouping') * (1 + 1 / Math.abs(g.cardinality - 3.5)),
      target: { kind: 'graph-middle', attr: g.name },
      rationale: `"${g.name}" is categorical with ${g.cardinality} values and `
        + `${tried('grouping') ? 'hasn’t been used to group yet' : 'no grouping has been tried'}`
        + ` — dropping it into the middle of a graph would split the points into ${g.cardinality} colored groups.`,
    });
  }
  for (const o of analysis.outliers.slice(0, 2)) {
    out.push({
      move: 'filtering', key: `outlier:${o.attr}:${o.caseIndex}`,
      score: novelty('filtering') * Math.abs(o.z),
      target: { kind: 'outlier-point', attr: o.attr, value: o.value },
      rationale: `Case ${o.caseIndex}’s ${o.attr} (${o.value}) sits ${Math.abs(o.z)} SDs from the mean `
        + `— the lone dot apart from its herd. Worth a stare; filtering could isolate or exclude it.`,
    });
  }
  for (const c of analysis.correlations.filter((x) => Math.abs(x.r) > STRONG_R).slice(0, 2)) {
    out.push({
      move: 'calculating', key: `rel:${c.a}:${c.b}`,
      score: 1.2 * Math.abs(c.r),
      target: { kind: 'attr-pair', a: c.a, b: c.b },
      rationale: `${c.a} and ${c.b} move together (r=${c.r}) — plotting one against the other, `
        + `or calculating their ratio, might expose the pattern.`,
    });
  }
  if (!analysis.isHierarchical && analysis.groupables.length) {
    const g = analysis.groupables[0];
    out.push({
      move: 'hierarchy', key: `hierarchy:${g.name}`,
      score: novelty('hierarchy') * 1.1,
      target: { kind: 'table-left', attr: g.name },
      rationale: `The table is flat. Dragging "${g.name}" leftward would nest the ${analysis.caseCount} cases `
        + `under ${g.cardinality} parent cards — structure worth seeing.`,
    });
  }
  if (tried('grouping') && !tried('summarizing')) {
    out.push({
      move: 'summarizing', key: 'summarize-after-group',
      score: 2.4,
      target: { kind: 'graph-measure' },
      rationale: `Groups exist but no summary measure yet — a mean per group (Measure palette) `
        + `is the classic next move after grouping.`,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
