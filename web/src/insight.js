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
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE WAS REWRITTEN (2026-08-28, plan -002 wave W3)
 *
 * The statistics this module computed inline were WRONG IN PRODUCTION, and
 * `wise-attend` (`web/src/behaviors.js:1159`) has been ranking on them. Two
 * defects, both measured, both now delegated to the pure modules under
 * `web/src/analysis/`:
 *
 *  1. THE PAIRING BUG. The old correlation took `A.values` and `B.values` —
 *     two arrays each built by dropping that column's OWN blanks — and walked
 *     them by a shared index over `Math.min(lenA, lenB)`. Once either column
 *     had a blank the two series were out of step, so `xs[k]` and `ys[k]` were
 *     different cases. Measured by
 *     `docs/verification/wonderings/corr-pairing-bug.mjs`: a PERFECT y = 2x
 *     relationship over 18 cases with 4 blank cells reported **r = 0.29**.
 *     It also divided by `n * sdA * sdB` with `sd` defaulting to 1 for a
 *     constant column, so a constant column produced a finite fake r rather
 *     than no answer. `web/src/analysis/correlation.js::correlatePairs` drops a
 *     case from BOTH series or from neither, and returns the same regression at
 *     **r = 1.00**.
 *
 *  2. NO IDENTIFIER RULE. Every categorical column was a candidate grouping,
 *     judged only on cardinality. `docs/verification/wonderings/against-real-fixture.mjs`
 *     measured what that costs: `Mammal` — 12 distinct values over 12 cases —
 *     scores **eta2 = 1.00 against every numeric in the fixture**, because a
 *     column that names each case explains all of its variation by definition.
 *     A perfect score on a meaningless grouping outranks every real finding.
 *     `web/src/analysis/grouping.js::role` refuses it structurally
 *     (`cardinality === caseCount`), and `separations()` reports it as
 *     `{ eta2: 1, qualifies: false, reason: 'identifier' }` so the "Dot's mind"
 *     panel shows the refusal rather than silently omitting the row.
 *
 * The exported SIGNATURES are unchanged — `analyzeDataset(bridge)` and
 * `suggestMoves(analysis, dataMoves)` are called from `web/src/codap-main.js`
 * and read from `web/src/behaviors.js` — and every field the two call sites
 * already read (`context`, `caseCount`, `attrs[].name/.kind/.cardinality`,
 * `outliers`, `correlations`, `groupables`, `isHierarchical`) still exists with
 * the same meaning. Three fields are ADDED: `attrs[].role`, `separations`, and
 * `rows`. See `analyzeDataset`'s return docs for why `rows` is there and what
 * a long-lived caller must do with it.
 *
 * This module is NOT pure — it talks to the CODAP bridge and reads
 * `performance.now()`. All of the arithmetic it used to own now lives in the
 * pure, node-tested modules under `web/src/analysis/`, which is the point.
 */

import { correlatePairs, qualifies } from './analysis/correlation.js';
import { role, separations, ETA2_FLOOR } from './analysis/grouping.js';

const OUTLIER_Z = 1.8;                // |z| from the mean beyond which a case reads as "the lone dot"; unitless SDs. Kept from the original at Chad's calibration on the Mammals fixture (African Elephant, Mass 6654, z = 2.9)
const GROUPABLE_MIN = 2;              // categories; below 2 there is nothing to compare
const GROUPABLE_MAX = 8;              // categories; above 8 a legend is unreadable at CODAP's default graph size. NOTE this is LOOSER than `analysis/grouping.js::GROUP_COUNT_CEILING` (4), which gates a WONDERING; Dot merely looking at a 7-group legend is cheap, a question about it is not
const IDEAL_CARDINALITY = 3.5;        // categories; the midpoint of 3-4 groups, where a colored legend reads best. Only used to rank groupables against each other
const MIN_CASES_FOR_ANALYSIS = 4;     // cases; below this every downstream floor (MIN_PAIRWISE_N = 4, MIN_SEPARATION_CASES = 4) refuses anyway, so the context is skipped whole
const NUMERIC_PARSE_RATIO = 0.8;      // fraction, 0..1, of NON-BLANK cells that must parse as finite numbers before a column is typed numeric. Unchanged from the original classifier: one typo must not demote a measurement column
const MAX_OUTLIER_SUGGESTIONS = 2;    // suggestions; two lone dots is already two more than a student asked for
const MAX_RELATIONSHIP_SUGGESTIONS = 2; // suggestions; same reason

/** CODAP delivers empty cells as `''`, `null`, or a missing key; whitespace counts. */
function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * Finite number or `null`. Stricter than `+v` deliberately and for the same
 * reason as `analysis/correlation.js`: `Number('')` is 0 and `Number(true)` is
 * 1, so a lax coercion turns blanks into observations at the origin and
 * checkboxes into measurements.
 */
function toNumber(v) {
  if (v == null || typeof v === 'boolean' || typeof v === 'object') return null;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Pull the first populated data context and compute its affordances. */
export async function analyzeDataset(bridge) {
  const ctxList = (await bridge.request('get', 'dataContextList'))?.values ?? [];
  for (const ctx of ctxList) {
    const name = ctx.name;
    const items = (await bridge.request('get',
      `dataContext[${name}].itemSearch[*]`))?.values ?? [];
    if (items.length < MIN_CASES_FOR_ANALYSIS) continue;
    const rows = items.map((it) => it.values ?? {});
    const attrNames = Object.keys(rows[0] ?? {});
    const collections = (await bridge.request('get',
      `dataContext[${name}].collectionList`))?.values ?? [];

    const caseCount = rows.length;

    // Kind AND role, together. `role()` is the authority on `'identifier'` and
    // is used unmodified — that is the whole reason `analysis/grouping.js`
    // exists. The reconciliation below is the same one
    // `web/src/wonderings/index.js::attrRole` performs, and for the same
    // reason: `role()` insists a measure parse 100% while the kind test allows
    // NUMERIC_PARSE_RATIO, so one unparseable cell in a real measurement column
    // would otherwise demote it out of every correlation.
    const attrs = attrNames.map((a) => {
      const values = rows.map((r) => r[a]);
      const present = values.filter((v) => !isBlank(v));
      const nums = present.map(toNumber).filter((n) => n !== null);
      const numeric = present.length > 0
        && nums.length >= present.length * NUMERIC_PARSE_RATIO;
      const inferred = role(a, values, caseCount);
      // An identifier is never overridden in either direction: refusing wrongly
      // costs one suggestion, accepting wrongly costs a sentence about African
      // Elephant's mean.
      const kindRole = inferred === 'identifier' ? 'identifier'
        : (numeric ? 'measure' : (inferred === 'measure' ? 'category' : inferred));

      if (numeric) {
        const mean = nums.reduce((x, y) => x + y, 0) / nums.length;
        const sd = Math.sqrt(nums.reduce((x, y) => x + (y - mean) ** 2, 0) / nums.length) || 1;
        return { name: a, kind: 'numeric', role: kindRole, mean, sd, values: nums };
      }
      const cats = [...new Set(present.map(String))];
      return {
        name: a, kind: 'categorical', role: kindRole,
        cardinality: cats.length, categories: cats,
      };
    });

    const roles = {};
    for (const a of attrs) roles[a.name] = a.role;

    // Measures only. A serial `id` column parses as numeric and would otherwise
    // be hunted for outliers and correlated against everything it indexes.
    const measures = attrs.filter((x) => x.kind === 'numeric' && x.role === 'measure');

    // outliers: |z| > threshold on any numeric MEASURE
    const outliers = [];
    for (const a of measures) {
      rows.forEach((r, i) => {
        const v = toNumber(r[a.name]);
        if (v === null) return;
        const z = (v - a.mean) / a.sd;
        if (Math.abs(z) > OUTLIER_Z) {
          outliers.push({ attr: a.name, caseIndex: i + 1, value: v, z: +z.toFixed(2) });
        }
      });
    }
    outliers.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));

    // Pairwise-complete Pearson AND Spearman — defect 1, fixed by delegation.
    // `r` stays rounded to 2 dp because it is quoted verbatim in a rationale
    // string a human reads; `rFull`, `rho`, `n` and `qualifies` carry the
    // unrounded truth for anything that ranks or gates on it.
    const correlations = correlatePairs(rows, measures.map((x) => x.name))
      .map((p) => ({
        a: p.a, b: p.b, r: +p.r.toFixed(2), rFull: p.r,
        rho: p.rho, n: p.n, qualifies: p.qualifies,
      }))
      .sort((x, y) => Math.abs(y.rFull) - Math.abs(x.rFull));

    const groupables = attrs.filter((x) => x.kind === 'categorical'
      && x.role !== 'identifier'                      // defect 2, fixed
      && x.cardinality >= GROUPABLE_MIN && x.cardinality <= GROUPABLE_MAX);

    // Every categorical crossed with every numeric measure — INCLUDING the
    // identifiers, so the mind panel can show `Mammal: eta2 1.00 REFUSED
    // (identifier)` rather than silently dropping the row a reader would go
    // looking for. `roles` is passed so the guards use the classification above
    // rather than re-inferring it from the values.
    const seps = separations(
      rows,
      attrs.filter((x) => x.kind === 'categorical').map((x) => x.name),
      measures.map((x) => x.name),
      { roles },
    );

    return {
      context: name, caseCount, attrs, outliers, correlations,
      separations: seps,
      groupables,
      isHierarchical: collections.length > 1,
      hasFormulas: false,           // refined below if attribute info available
      at: performance.now() / 1000,
      /**
       * The raw case list, so a caller that needs the full `DatasetModel`
       * (`web/src/wonderings/index.js::buildDatasetModel`) does not have to
       * repeat the `itemSearch` round trip. A caller that STORES this object
       * for the life of the session must drop `rows` first — see
       * `codap-main.js`, which destructures it away before assigning to
       * `engine.state.insight`.
       */
      rows,
      attrNames,
      /** Inferred kinds, keyed by name; `buildDatasetModel` takes these as declared. */
      declaredKinds: Object.fromEntries(attrs.map((x) => [x.name, x.kind])),
    };
  }
  return null;
}

/**
 * The inverted classifier: affordances × moves-not-yet-tried → ranked
 * suggestions { move, key, score, rationale, target }. Novelty dominates
 * (an untried move class scores double); strength (|z|, |r|, cardinality
 * fit) breaks ties.
 *
 * TWO GATES CHANGED with the 2026-08-28 rewrite:
 *
 *  - Relationships were gated on a flat `|r| > 0.5`. They are now gated on the
 *    n-floor computed by `analysis/correlation.js` — `|r| >= 0.576` at n = 12,
 *    higher for smaller n — because a flat threshold calls noise a finding on a
 *    small dataset and misses a real one on a large. The gate is `r OR rho`,
 *    matching `web/src/wonderings/families/relationship.js`: Mammals is skewed
 *    enough that Pearson misses monotone relationships Spearman sees
 *    (Mass × Sleep: r = -0.467, rho = -0.775).
 *  - Groupings are ranked by MEASURED separation when one exists. A column that
 *    actually splits a numeric (eta2 >= ETA2_FLOOR) outranks one that merely has
 *    a pleasant number of categories.
 */
export function suggestMoves(analysis, dataMoves) {
  if (!analysis) return [];
  const tried = (m) => (dataMoves?.get?.(m)?.count ?? 0) > 0;
  const novelty = (m) => (tried(m) ? 1 : 2);
  const out = [];

  /** The strongest qualifying separation this categorical achieves, or null. */
  const bestSeparation = (cat) => (analysis.separations ?? [])
    .filter((s) => s.cat === cat && s.qualifies)
    .sort((x, y) => y.eta2 - x.eta2)[0] ?? null;

  for (const g of analysis.groupables) {
    const sep = bestSeparation(g.name);
    out.push({
      move: 'grouping', key: `grouping:${g.name}`,
      score: novelty('grouping')
        * (1 + 1 / Math.abs(g.cardinality - IDEAL_CARDINALITY))
        // A grouping that demonstrably separates a numeric is worth more than
        // one that merely looks tidy. Bounded by construction: eta2 is 0..1.
        * (sep ? 1 + sep.eta2 : 1),
      target: { kind: 'graph-middle', attr: g.name },
      rationale: `"${g.name}" is categorical with ${g.cardinality} values and `
        + `${tried('grouping') ? 'hasn’t been used to group yet' : 'no grouping has been tried'}`
        + ` — dropping it into the middle of a graph would split the points into ${g.cardinality} colored groups.`
        + (sep
          ? ` It really does separate ${sep.num} (eta²=${sep.eta2.toFixed(2)}, above the ${ETA2_FLOOR} floor).`
          : ''),
    });
  }
  for (const o of analysis.outliers.slice(0, MAX_OUTLIER_SUGGESTIONS)) {
    out.push({
      move: 'filtering', key: `outlier:${o.attr}:${o.caseIndex}`,
      score: novelty('filtering') * Math.abs(o.z),
      target: { kind: 'outlier-point', attr: o.attr, value: o.value },
      rationale: `Case ${o.caseIndex}’s ${o.attr} (${o.value}) sits ${Math.abs(o.z)} SDs from the mean `
        + `— the lone dot apart from its herd. Worth a stare; filtering could isolate or exclude it.`,
    });
  }
  const earned = analysis.correlations.filter(
    (x) => x.qualifies || qualifies(x.rho, x.n),
  );
  for (const c of earned.slice(0, MAX_RELATIONSHIP_SUGGESTIONS)) {
    out.push({
      move: 'calculating', key: `rel:${c.a}:${c.b}`,
      score: 1.2 * Math.abs(c.rFull ?? c.r),
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
