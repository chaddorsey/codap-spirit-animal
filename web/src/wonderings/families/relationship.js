/**
 * relationship.js — the "How does ___ go with ___?" wondering family.
 *
 * WHY THIS FAMILY EXISTS. It is the only family that says something about two
 * attributes at once, and on the dataset the tutorials actually ship it is the
 * one that rescues an attribute the other families throw away. Measured
 * 2026-08-28 over the 12-case Mammals fixture (`web/src/demo/fixture.js`,
 * reproduce with `docs/verification/wonderings/against-real-fixture.mjs`):
 * `Sleep` earns NO distribution wondering — it is evenly spread, no skew, no
 * gap, no outlier — and yet `Height x Sleep` is the strongest relationship in
 * the dataset at r = -0.74, rho = -0.79, n = 12. The families are
 * complementary, not redundant, and this is the evidence for that claim.
 *
 * WHAT IT REFUSES, AND WHY THE REFUSALS ARE THE POINT. At n = 12 the
 * significance floor is |r| >= 0.576; two of the ten numeric pairs clear it.
 * This module does not compute that floor and must never re-decide it: the
 * arithmetic lives in exactly one place (`web/src/analysis/correlation.js`,
 * wave W1 module A) and arrives here as `pair.qualifies`. A family that emits
 * on `qualifies === false` is a bug, because a wondering must be EARNED
 * (`docs/plans/2026-08-28-002-feat-wonderings-parallel-build-plan.md`). Three
 * further refusals are this module's own:
 *
 *   1. An `identifier` is never half of a relationship. Mammals' `Mammal` is
 *      cardinality 12 over 12 cases; a numeric row-id correlates with anything
 *      that was entered in order, and wondering aloud about it is the exact
 *      embarrassment `Attr.role` was added to prevent.
 *   2. A pair the student is ALREADY looking at earns nothing. If both names
 *      sit on the axes of one graph, the question has been asked by the screen.
 *      That is what `SceneModel.derived.attrPairsPlotted` is for.
 *   3. Fewer than MIN_COMPLETE_PAIRS complete rows is not a shape. The floor is
 *      applied here as well as in the analysis because `qualifies` is one
 *      boolean and this family would rather decline twice than speak once.
 *
 * ONE OPEN SEAM, RECORDED NOT RESOLVED (2026-08-28). Plan `-001` states this
 * family's gate as "|r| OR |rho| clears the n-floor", and `correlatePairs` in
 * `web/src/analysis/correlation.js` sets `qualifies` from PEARSON ALONE,
 * documenting the difference in its own header. On Mammals that is 2 qualifying
 * pairs rather than 5: `Mass x Sleep` (r = -0.47, rho = -0.79) and
 * `LifeSpan x Height` (r = 0.47, rho = 0.75) are monotone relationships Pearson
 * misses. This module reads `qualifies` and does NOT widen the gate, because
 * `web/src/wonderings/contracts.js` says the analysis decides whether evidence
 * clears its own gate and a family emitting on `qualifies === false` is a bug.
 * Widening is a one-line change at the analysis end (`qualifies(r, n) ||
 * qualifies(rho, n)`), which is where the arithmetic belongs and where one
 * change fixes every family at once. It is a decision for W3, not for this file.
 *
 * PURE. No browser globals, no clock, no randomness — same inputs, same
 * outputs, forever. That is what makes the W3 corpus reproducible and this file
 * testable in node (`docs/verification/wonderings/t-fam-relation.mjs`).
 *
 * EXPORTS. `relationshipObservations` is the name; `observe` is an alias so a
 * caller doing `import * as relationship` can use one spelling across all seven
 * families. There is deliberately no default export.
 *
 * The small scene helpers below are duplicated in `second-dimension.js` rather
 * than shared through a third file. That is deliberate: the build rule is ONE
 * MODULE, ONE FILE, ONE OWNER, and a shared helper file would be an unowned
 * eleventh module.
 */

const FAMILY = 'relationship';        // Observation.family, spelled as in contracts.js
const KEY_SEPARATOR = '|';            // separator between attribute names inside Observation.key
const MIN_COMPLETE_PAIRS = 4;         // cases; below 4 rows with BOTH values present a correlation is an accident, not a shape (floor used by docs/verification/wonderings/observation-feasibility.mjs)
const PLOTTED_NOVELTY_PENALTY = 0.5;  // unitless 0..1; novelty is cut by half this per focus attribute already on screen, so a pair the student half-knows ranks below one they have not met
const FOCUS_SIZE = 2;                 // attributes named by this family; the divisor for the novelty penalty
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
 * May this attribute be half of a relationship? Numeric, and not an identifier.
 * Tested as `role !== 'identifier'` rather than `role === 'measure'` on purpose:
 * the dangerous case is the identifier, and a partially-populated `Attr` from a
 * future analysis must not silently switch this family off.
 */
const isPairable = (attr) => !!attr && attr.kind === 'numeric' && attr.role !== 'identifier';

/** Graphs belonging to this data context. A graph with no stated context is kept. */
function graphsInContext(scene, context) {
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  return graphs.filter((g) => g && (g.dataContext == null || g.dataContext === context));
}

/**
 * Every attribute name visible anywhere on screen. Union of the derived rollup
 * and the raw axes, across ALL contexts — the conservative direction, since the
 * cost of over-counting is one wondering not said and the cost of under-counting
 * is wondering aloud about something already on the screen.
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

/** Unordered name pairs already shown together, stored both ways round. */
function pairsPlottedTogether(scene) {
  const out = new Set();
  const add = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return;
    out.add(a + KEY_SEPARATOR + b);
    out.add(b + KEY_SEPARATOR + a);
  };
  const derived = Array.isArray(scene?.derived?.attrPairsPlotted) ? scene.derived.attrPairsPlotted : [];
  for (const p of derived) if (Array.isArray(p)) add(p[0], p[1]);
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  for (const g of graphs) add(g?.x, g?.y);
  return out;
}

/** The graph a wondering about `focus` is anchored to, or null if it is about the dataset. */
function anchorComponentId(graphs, focus) {
  for (const g of graphs) {
    for (const n of [g?.x, g?.y, g?.legend]) {
      if (typeof n === 'string' && focus.includes(n)) return g.id ?? null;
    }
  }
  return null;
}

/**
 * "How does ___ go with ___?" — one Observation per numeric pair whose evidence
 * the analysis has already judged sufficient and which the student is not
 * already looking at.
 *
 * Returns `[]` when nothing is earned, which is the normal case.
 * Sorted strongest first; ties broken by `key`, so the order is total and
 * repeatable. Neither argument is mutated.
 *
 * @param {Object} dataset DatasetModel (see web/src/wonderings/contracts.js)
 * @param {Object} [scene] SceneModel; a missing scene is read as an empty one
 * @returns {Object[]} Observation[]
 */
export function relationshipObservations(dataset, scene) {
  const context = typeof dataset?.context === 'string' ? dataset.context : '';
  const pairs = Array.isArray(dataset?.pairs) ? dataset.pairs : [];
  if (!context || pairs.length === 0) return [];

  const attrs = attrIndex(dataset);
  const onScreen = namesOnScreen(scene);
  const together = pairsPlottedTogether(scene);
  const graphs = graphsInContext(scene, context);

  const out = [];
  const seen = new Set();

  for (const p of pairs) {
    if (!p || p.qualifies !== true) continue;               // refusal 0: not earned
    const { a, b } = p;
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a === b) continue;
    if (!isPairable(attrs.get(a)) || !isPairable(attrs.get(b))) continue;   // refusal 1: identifier / unknown
    if (together.has(a + KEY_SEPARATOR + b)) continue;       // refusal 2: already on one graph

    const n = finite(p.n);
    if (n === null || n < MIN_COMPLETE_PAIRS) continue;      // refusal 3: too few complete rows
    const r = finite(p.r);
    const rho = finite(p.rho);
    if (r === null && rho === null) continue;

    const [first, second] = [a, b].slice().sort();
    const key = FAMILY + ':' + context + ':' + first + KEY_SEPARATOR + second;
    if (seen.has(key)) continue;
    seen.add(key);

    // Speaking order: whichever attribute is already on screen leads, so the
    // question starts from what the student is looking at. With neither or both
    // on screen there is no such anchor, and sorted order keeps focus and key
    // in agreement.
    const shown = [first, second].filter((name) => onScreen.has(name));
    const focus = shown.length === 1
      ? [shown[0], shown[0] === first ? second : first]
      : [first, second];

    const absR = r === null ? 0 : Math.abs(r);
    const absRho = rho === null ? 0 : Math.abs(rho);

    out.push({
      family: FAMILY,
      key,
      dataContext: context,
      focus,
      evidence: {
        r,
        rho,
        n,
        // |rho| - |r|: the curvature tell. Positive means the linear coefficient
        // understates a relationship that is real but bent (Mammals'
        // `Mass x Sleep`: r = -0.47, rho = -0.79, gap 0.32).
        curvature: r === null || rho === null ? null : round(absRho - absR),
      },
      // Strength is the strongest of the two coefficients: already 0..1,
      // monotone in the evidence, and it does not throw away a curved pair that
      // Pearson alone ranks low. Ranking only — never shown to the student.
      strength: clamp01(round(Math.max(absR, absRho))),
      // Novelty here is novelty against the SCREEN. Session-level novelty (has
      // this been said before?) is the engine's job in W3; a pure family has no
      // history to read.
      novelty: clamp01(round(1 - PLOTTED_NOVELTY_PENALTY * (shown.length / FOCUS_SIZE))),
      scope: { componentId: anchorComponentId(graphs, focus) },
    });
  }

  out.sort((x, y) => (y.strength - x.strength) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return out;
}

export { relationshipObservations as observe };

/** The `Observation.family` value this module emits. */
export const FAMILY_NAME = FAMILY;
