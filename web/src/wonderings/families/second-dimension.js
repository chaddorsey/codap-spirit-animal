/**
 * second-dimension.js — the "Does ___ matter here too?" wondering family.
 *
 * WHY THIS FAMILY EXISTS. Every other family is about the dataset; this one is
 * about the SCREEN. It fires only when the student has made a univariate plot —
 * one attribute on one axis, the other axis empty — and the plotted attribute
 * has a partner, off screen, that the analysis already judged worth a
 * relationship. It is the smallest possible next move: not "make a new graph",
 * just "there is a second axis, and something is qualified to go on it."
 *
 * DATED EVIDENCE. Measured 2026-08-28 over the 12-case Mammals fixture
 * (`web/src/demo/fixture.js`; reproduce with
 * `docs/verification/wonderings/against-real-fixture.mjs`): at n = 12 the
 * significance floor is |r| >= 0.576, and `Height x Sleep` clears it at
 * r = -0.74, rho = -0.79. So a lone dot plot of `Sleep` — the CODAP tutorials'
 * commonest first graph, and an attribute that earns NO distribution wondering
 * because it is evenly spread — earns exactly one second-dimension wondering,
 * naming `Height`. Nothing else in the dataset qualifies as `Sleep`'s partner.
 *
 * WHAT IT REFUSES.
 *   0. Nothing without a qualifying pair. `pair.qualifies` is computed once, in
 *      `web/src/analysis/correlation.js` (W1 module A), and is never re-decided
 *      here; a family that emits on `qualifies === false` is a bug.
 *   1. Nothing without a univariate graph IN THIS DATA CONTEXT. An empty scene
 *      earns nothing, and neither does a scatter plot: two filled axes mean the
 *      question has already been asked by the screen.
 *   2. Never a partner that is already visible. If the attribute is on another
 *      graph's axis or in a legend, "does it matter here too" is answerable by
 *      looking, and this family has nothing to add.
 *   3. Never an identifier. Mammals' `Mammal` is cardinality 12 over 12 cases;
 *      a numeric row-id would correlate with anything entered in order.
 *
 * THE ASYMMETRY IS LOAD-BEARING. `Observation.focus[0]` is the OFF-SCREEN
 * partner — the name that fills the blank — and `focus[1]` is the attribute
 * already on the axis. So `key` orders names by role, not alphabetically, which
 * is the opposite of the sibling `relationship` family: "Sleep is plotted, does
 * Height matter here too?" and "Height is plotted, does Sleep matter here too?"
 * are two different wonderings about one pair, and they must not collide on one
 * de-duplication key.
 *
 * ONE OPEN SEAM, RECORDED NOT RESOLVED (2026-08-28). `pair.qualifies` as
 * `web/src/analysis/correlation.js` computes it is a PEARSON-only gate, while
 * plan `-001` states the gate for the relationship-shaped families as "|r| OR
 * |rho|". This family therefore offers `Height` for a `Sleep` plot but not
 * `Mass` (r = -0.47, rho = -0.79). The fix, if wanted, belongs at the analysis
 * end where the arithmetic lives; see the longer note in the sibling
 * `relationship.js`. It is a decision for W3, not for this file.
 *
 * PURE. No browser globals, no clock, no randomness. Testable in node:
 * `docs/verification/wonderings/t-fam-relation.mjs`.
 *
 * EXPORTS. `secondDimensionObservations`, aliased `observe` so a caller doing
 * `import * as secondDimension` can use one spelling across all seven families.
 * No default export.
 *
 * The scene helpers below are duplicated from `relationship.js` rather than
 * shared through a third file: the build rule is ONE MODULE, ONE FILE, ONE
 * OWNER, and a shared helper file would be an unowned eleventh module.
 */

const FAMILY = 'second-dimension';    // Observation.family, spelled as in contracts.js
const KEY_SEPARATOR = '|';            // separator between attribute names inside Observation.key
const MIN_COMPLETE_PAIRS = 4;         // cases; below 4 rows with BOTH values present a correlation is an accident, not a shape (floor used by docs/verification/wonderings/observation-feasibility.mjs)
const OFFSCREEN_PARTNER_NOVELTY = 1;  // unitless 0..1; the partner is off screen BY CONSTRUCTION, so within one scene there is nothing to discount — session-level novelty is the W3 engine's job
const ROUND_DECIMALS = 2;             // decimal places for derived numbers, so two runs compare byte-identically

const round = (v) => Math.round(v * 10 ** ROUND_DECIMALS) / 10 ** ROUND_DECIMALS;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// `Number(null)` and `Number('')` are 0, not NaN, so a missing coefficient
// would otherwise read as a perfect zero correlation. Caught 2026-08-28 by
// t-fam-relation.mjs, which asserted that a pair with r = null and rho = null
// earns nothing and found it emitting strength 0.
const finite = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Attr lookup by name. Absent from `attrs` means unverifiable, which means unusable. */
function attrIndex(dataset) {
  const map = new Map();
  const attrs = Array.isArray(dataset?.attrs) ? dataset.attrs : [];
  for (const a of attrs) if (a && typeof a.name === 'string') map.set(a.name, a);
  return map;
}

/**
 * May this attribute go on an axis of a relationship? Numeric, not an
 * identifier. Tested as `role !== 'identifier'` rather than `role === 'measure'`
 * on purpose: the dangerous case is the identifier, and a partially-populated
 * `Attr` from a future analysis must not silently switch this family off.
 */
const isPairable = (attr) => !!attr && attr.kind === 'numeric' && attr.role !== 'identifier';

/** Graphs belonging to this data context. A graph with no stated context is kept. */
function graphsInContext(scene, context) {
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  return graphs.filter((g) => g && (g.dataContext == null || g.dataContext === context));
}

/**
 * The attribute on a univariate graph, or null. Univariate means EXACTLY ONE of
 * `x` and `y` is filled — either one, because CODAP puts a dot plot on the
 * vertical axis just as readily as the horizontal. `plotType` is deliberately
 * not consulted: it carries several spellings for the same axis configuration,
 * and the axes are the fact.
 */
function univariateAttr(graph) {
  const x = typeof graph?.x === 'string' && graph.x ? graph.x : null;
  const y = typeof graph?.y === 'string' && graph.y ? graph.y : null;
  if (x && !y) return x;
  if (y && !x) return y;
  return null;
}

/**
 * Every attribute name visible anywhere on screen. Union of the derived rollup
 * and the raw axes, across ALL contexts — the conservative direction, since the
 * cost of over-counting is one wondering not said and the cost of
 * under-counting is naming something the student can already see.
 */
function namesOnScreen(scene) {
  const out = new Set();
  const plotted = Array.isArray(scene?.derived?.plottedAttrs) ? scene.derived.plottedAttrs : [];
  for (const n of plotted) if (typeof n === 'string' && n) out.add(n);
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  for (const g of graphs) {
    for (const n of [g?.x, g?.y, g?.legend]) if (typeof n === 'string' && n) out.add(n);
  }
  return out;
}

/**
 * "Does ___ matter here too?" — one Observation per (univariate graph x
 * qualifying off-screen partner).
 *
 * Returns `[]` when nothing is earned, which is the normal case and the whole
 * of the empty-scene case. Sorted strongest first; ties broken by `key`, so the
 * order is total and repeatable. Neither argument is mutated.
 *
 * @param {Object} dataset DatasetModel (see web/src/wonderings/contracts.js)
 * @param {Object} [scene] SceneModel; a missing scene is read as an empty one
 * @returns {Object[]} Observation[]
 */
export function secondDimensionObservations(dataset, scene) {
  const context = typeof dataset?.context === 'string' ? dataset.context : '';
  const pairs = Array.isArray(dataset?.pairs) ? dataset.pairs : [];
  if (!context || pairs.length === 0) return [];

  const univariate = graphsInContext(scene, context)
    .map((g) => ({ graph: g, plotted: univariateAttr(g) }))
    .filter((u) => u.plotted !== null);
  if (univariate.length === 0) return [];        // refusal 1: no univariate plot, nothing to extend

  const attrs = attrIndex(dataset);
  const onScreen = namesOnScreen(scene);

  const out = [];
  const seen = new Set();

  for (const { graph, plotted } of univariate) {
    if (!isPairable(attrs.get(plotted))) continue;    // refusal 3: identifier / unknown / categorical axis

    for (const p of pairs) {
      if (!p || p.qualifies !== true) continue;       // refusal 0: not earned
      const { a, b } = p;
      if (typeof a !== 'string' || typeof b !== 'string' || a === b) continue;
      const partner = a === plotted ? b : b === plotted ? a : null;
      if (!partner) continue;
      if (onScreen.has(partner)) continue;            // refusal 2: already visible
      if (!isPairable(attrs.get(partner))) continue;  // refusal 3

      const n = finite(p.n);
      if (n === null || n < MIN_COMPLETE_PAIRS) continue;
      const r = finite(p.r);
      const rho = finite(p.rho);
      if (r === null && rho === null) continue;

      // Ordered by ROLE, not alphabetically: the blank comes first. See the
      // asymmetry note in the header.
      const key = FAMILY + ':' + context + ':' + partner + KEY_SEPARATOR + plotted;
      if (seen.has(key)) continue;                    // two graphs of the same attribute say it once
      seen.add(key);

      const absR = r === null ? 0 : Math.abs(r);
      const absRho = rho === null ? 0 : Math.abs(rho);

      out.push({
        family: FAMILY,
        key,
        dataContext: context,
        focus: [partner, plotted],
        evidence: {
          r,
          rho,
          n,
          // Which attribute is already on an axis. Provenance for the "Dot's
          // mind" panel; never rendered into the wondering text.
          plotted,
          // |rho| - |r|: the curvature tell. Positive means the linear
          // coefficient understates a relationship that is real but bent.
          curvature: r === null || rho === null ? null : round(absRho - absR),
        },
        // Strength is the stronger of the two coefficients: already 0..1,
        // monotone in the evidence, and it does not throw away a curved pair
        // that Pearson alone ranks low. Ranking only — never shown.
        strength: clamp01(round(Math.max(absR, absRho))),
        novelty: OFFSCREEN_PARTNER_NOVELTY,
        // Anchored to the graph that earned it: this wondering is about that
        // component's empty axis, and dies with it.
        scope: { componentId: graph.id ?? null },
      });
    }
  }

  out.sort((x, y) => (y.strength - x.strength) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return out;
}

export { secondDimensionObservations as observe };

/** The `Observation.family` value this module emits. */
export const FAMILY_NAME = FAMILY;
