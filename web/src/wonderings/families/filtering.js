/**
 * filtering.js — the Filtering wondering family.
 *
 *   "What if we only looked at ___?"
 *
 * TWO WAYS TO EARN IT, AND WHY BOTH ARE NEEDED. Filtering is the move that
 * makes a dataset legible when one case, or one kind of case, is doing all the
 * work. So an observation is earned either by
 *
 *   'outlier'  — a numeric whose max |z| clears 2.5. Measured 2026-08-28
 *                (`docs/verification/wonderings/distribution-shape.mjs`), the
 *                Mammals fixture has exactly one: `Mass`, |z| = 3.08, the
 *                African Elephant at 6654 kg against a mean of 931.5 and a
 *                population sd of 1858.8. Every other numeric declines —
 *                Height 2.42, Sleep 2.11, Speed 1.96, LifeSpan 1.86 — and the
 *                declining is the point. A plot of Mass is one dot far right
 *                and eleven dots piled at the origin; "what if we only looked
 *                at the rest?" is the question that unpiles it.
 *   'subgroup' — a categorical that genuinely separates a measure, so that
 *                looking at one group at a time is a real analytic move rather
 *                than an arbitrary slice. On Mammals that is `Diet` (3 groups,
 *                plant 5 / meat 4 / both 3), best separation Diet -> Sleep at
 *                eta2 = 0.82. `Order` (7 groups over 12 cases, smallest 1) and
 *                `Mammal` (cardinality 12 = caseCount, an identifier) are
 *                refused: filtering to a subgroup of one is filtering to a case.
 *
 * Consumers must branch on `evidence.kind`, which is `'outlier'` or
 * `'subgroup'`. The two read differently in English — one narrows away a case,
 * the other narrows to a group — and W2's realizer needs to know which it has.
 *
 * WHY THE n FLOOR EXISTS EVEN THOUGH IT NEVER FIRES ON MAMMALS. With a
 * population sd, max |z| is bounded above by (n - 1) / sqrt(n). At n = 8 that
 * bound is 2.47, below the 2.5 gate, so under 8 cases NO attribute can ever
 * qualify as an outlier however extreme it looks. The floor is stated rather
 * than left implicit so the arithmetic does not have to be rediscovered by
 * whoever next wonders why a 5-case dataset is silent. At n = 12 the bound is
 * 3.175 — `Mass`'s 3.08 is close to the ceiling, which is itself the honest
 * description of one case dominating twelve.
 *
 * WHY THE GATES ARE RE-CHECKED HERE. The subgroup half requires
 * `separations[].qualifies` from `web/src/analysis/grouping.js`, then re-checks
 * the structural guards — identifier, group count, smallest group — itself,
 * because those decide whether the SENTENCE could be honest rather than whether
 * the statistic is significant. The eta2 floor is re-checked on a deliberate
 * asymmetry: a raised analysis floor never conflicts, a lowered one makes this
 * module decline. Failing toward silence is the house rule
 * (`web/src/data-moves.js`: prefer UNDER-cheering).
 *
 * TWO CROSS-FAMILY RULES, DECIDED ONCE 2026-08-28 AND APPLIED IN ALL SEVEN
 * FAMILY FILES; the full argument is in `relationship.js`'s header.
 *
 *   KEY SEPARATOR IS `'|'`, not the `'~'` this file used until 2026-08-28.
 *   `contracts.js:142-147` makes `key` the de-duplication key, the novelty key
 *   and the W2 phrasing-hash input at once, so two families spelling the same
 *   shape differently is three bugs. `KEY_SEPARATOR` is exported by all seven
 *   so a test can assert ONE spelling. This family's `focus` is a single name,
 *   so the separator never actually appears in a key it mints — it is declared
 *   here anyway, because a family that quietly used a different one the day it
 *   grew a second focus attribute is exactly how the disagreement started.
 *
 *   `graph.dataContext == null` DOES NOT BELONG TO THIS CONTEXT — which is what
 *   `graphsInContext` below already did.
 *
 * PURITY. `(DatasetModel, SceneModel) => Observation[]` per
 * `web/src/wonderings/contracts.js`. No browser globals, no clock, no
 * randomness, no text. The helpers at the bottom are duplicated in
 * `comparison.js` and `grouping.js` on purpose — this wave's rule is ONE
 * MODULE, ONE FILE, ONE OWNER, and a shared helper file would have no owner.
 */

const OUTLIER_Z_FLOOR = 2.5;      // standard deviations; |z| above this is the tell the four committed verification scripts use for "dominated by one case". Mammals' Mass clears it at 3.08; nothing else does.
const OUTLIER_Z_FULL = 5.0;       // standard deviations; the |z| at which strength saturates at 1. Beyond 5 sd the case is not more interesting, only further away.
const OUTLIER_BASE_STRENGTH = 0.5;    // unitless 0..1; strength assigned at exactly the floor. Not 0: an attribute only gets here by already having a real outlier, so the weakest qualifying case is still half-convincing.
const MIN_N_FOR_OUTLIER = 8;      // cases; with a population sd, max |z| <= (n - 1)/sqrt(n), which is 2.47 at n = 8 — below the floor. Under 8 cases the outlier gate is arithmetically unreachable.
const ETA2_FLOOR = 0.30;          // unitless 0..1 (fraction of variance between groups); below this the groups overlap, so looking at one of them is an arbitrary slice rather than a move. Diet -> LifeSpan sits at 0.27 and is refused.
const GROUP_COUNT_CEILING = 4;    // groups; more than 4 groups over 12 cases makes each subgroup too thin to look at alone, and eta2 inflates with group count. Refuses Mammals' `Order` (7).
const MIN_GROUP_COUNT = 2;        // groups; filtering to the only group is filtering to everything.
const MIN_GROUP_SIZE = 3;         // cases; filtering to a subgroup of 1 or 2 is filtering to a case. Refuses `Order` (smallest group 1) a second way.
const PLOTTED_NOVELTY_PENALTY = 0.8;  // unitless 0..1; fraction of novelty removed when everything named is already on screen. Leaves 0.2 rather than 0 — seeing the attribute is not the same as having been asked this question about it.

/** The family id written into every Observation this module emits. */
export const FILTERING_FAMILY = 'filtering';

/**
 * The one separator between attribute names inside `Observation.key`, shared by
 * all seven families (see the header). Exported so a test can assert one
 * spelling across the seven rather than seven spellings that happen to agree.
 */
export const KEY_SEPARATOR = '|';     // literal; the sole join character in Observation.key

/**
 * Filtering observations for one dataset and one scene.
 *
 * Emits at most one observation per attribute: one per numeric carrying an
 * outlier, and one per categorical worth slicing by (its strongest qualifying
 * separation wins, ties broken alphabetically on the measure). `focus` is a
 * single attribute name in both cases, because the stem has one blank; which
 * kind of blank it is lives in `evidence.kind`.
 *
 * Unlike `grouping.js`, this family does not need the scene: an outlier is
 * worth filtering whether or not anyone is looking at it — arguably most worth
 * it when the graph IS up and the outlier is squashing the axis. The scene only
 * sets `novelty` and picks `scope.componentId`.
 *
 * Declines, in full: attributes with no `maxAbsZ` or no `n`; fewer than 8
 * non-blank cases; |z| at or below 2.5; identifiers, on either half; separations
 * with `qualifies !== true`, eta2 below the floor, group count outside `[2, 4]`,
 * smallest group under 3, or an attribute missing from `attrs` — which cannot be
 * checked against the identifier rule and is therefore refused.
 *
 * @param {import('../contracts.js').DatasetModel} dataset
 * @param {import('../contracts.js').SceneModel} [scene]
 * @returns {import('../contracts.js').Observation[]} strongest first, then by key
 */
export function observeFiltering(dataset, scene) {
  const context = typeof dataset?.context === 'string' ? dataset.context : '';
  const attrs = Array.isArray(dataset?.attrs) ? dataset.attrs : null;
  if (!context || !attrs) return [];

  const byName = indexByName(attrs);
  const caseCount = Number.isFinite(dataset.caseCount) ? dataset.caseCount : null;
  const graphs = graphsInContext(scene, context);
  const plotted = plottedNames(graphs);
  const out = [];

  // --- one case doing all the work ----------------------------------------
  for (const a of attrs) {
    if (!a || typeof a.name !== 'string' || a.kind !== 'numeric') continue;
    if (isIdentifier(a, caseCount)) continue;
    if (!Number.isFinite(a.n) || a.n < MIN_N_FOR_OUTLIER) continue;
    if (!Number.isFinite(a.maxAbsZ) || a.maxAbsZ <= OUTLIER_Z_FLOOR) continue;
    out.push(observation(context, [a.name],
      { kind: 'outlier', attr: a.name, maxAbsZ: a.maxAbsZ, n: a.n },
      outlierStrength(a.maxAbsZ), plotted, graphs));
  }

  // --- one kind of case worth looking at alone ----------------------------
  const separations = Array.isArray(dataset.separations) ? dataset.separations : [];
  const best = new Map();
  for (const sep of separations) {
    if (!sliceable(sep, byName, caseCount)) continue;
    const prev = best.get(sep.cat);
    if (!prev || sep.eta2 > prev.eta2 || (sep.eta2 === prev.eta2 && sep.num < prev.num)) {
      best.set(sep.cat, sep);
    }
  }
  for (const sep of best.values()) {
    out.push(observation(context, [sep.cat],
      { kind: 'subgroup', cat: sep.cat, num: sep.num, eta2: sep.eta2,
        groups: sep.groups, smallestGroup: sep.smallestGroup },
      round3(clamp01(sep.eta2)), plotted, graphs));
  }

  return sortObservations(out);
}

/** Assemble one Observation. `focus` is always a single name for this family. */
function observation(context, focus, evidence, strength, plotted, graphs) {
  return {
    family: FILTERING_FAMILY,
    key: `${FILTERING_FAMILY}:${context}:${focus.join(KEY_SEPARATOR)}`,
    dataContext: context,
    focus,
    evidence,
    strength,
    novelty: noveltyFor(focus, plotted),
    scope: { componentId: anchorShowing(graphs, focus[0]) },
  };
}

/**
 * Linear from `OUTLIER_BASE_STRENGTH` at the floor to 1 at `OUTLIER_Z_FULL`.
 * Mammals' `Mass` (|z| = 3.08) lands at 0.616.
 */
function outlierStrength(z) {
  const span = OUTLIER_Z_FULL - OUTLIER_Z_FLOOR;
  const above = (z - OUTLIER_Z_FLOOR) / span;
  return round3(clamp01(OUTLIER_BASE_STRENGTH + (1 - OUTLIER_BASE_STRENGTH) * above));
}

/** Is this separation strong and thick enough that one group is worth seeing alone? */
function sliceable(sep, byName, caseCount) {
  if (!sep || typeof sep.cat !== 'string' || typeof sep.num !== 'string') return false;
  if (sep.qualifies !== true) return false;
  if (!Number.isFinite(sep.eta2) || sep.eta2 < ETA2_FLOOR) return false;
  if (!Number.isFinite(sep.groups)) return false;
  if (sep.groups < MIN_GROUP_COUNT || sep.groups > GROUP_COUNT_CEILING) return false;
  if (!Number.isFinite(sep.smallestGroup) || sep.smallestGroup < MIN_GROUP_SIZE) return false;
  const cat = byName.get(sep.cat);
  const num = byName.get(sep.num);
  if (!cat || !num) return false;                      // unverifiable => refused
  if (cat.kind !== 'categorical' || num.kind !== 'numeric') return false;
  if (isIdentifier(cat, caseCount) || isIdentifier(num, caseCount)) return false;
  if (Number.isFinite(cat.cardinality)
      && (cat.cardinality < MIN_GROUP_COUNT || cat.cardinality > GROUP_COUNT_CEILING)) return false;
  if (smallestGroupSize(cat) !== null && smallestGroupSize(cat) < MIN_GROUP_SIZE) return false;
  return true;
}

// --- shared shape helpers (duplicated per the one-file-one-owner rule) ------

/** @returns {Map<string, object>} attributes by name, ignoring malformed entries. */
function indexByName(attrs) {
  const m = new Map();
  for (const a of attrs) if (a && typeof a.name === 'string') m.set(a.name, a);
  return m;
}

/**
 * The identifier rule, checked two ways. `role` is the analysis's conclusion;
 * `cardinality === caseCount` is its definition. Either is disqualifying, so a
 * model carrying only one of the two fields still cannot produce "what if we
 * only looked at African Elephant?".
 */
function isIdentifier(attr, caseCount) {
  if (!attr) return false;
  if (attr.role === 'identifier') return true;
  return caseCount !== null && Number.isFinite(attr.cardinality) && attr.cardinality === caseCount;
}

/** Smallest category size from `groupSizes`, or null when the field is absent. */
function smallestGroupSize(attr) {
  const sizes = attr.groupSizes;
  if (!sizes || typeof sizes !== 'object') return null;
  const values = Object.values(sizes).filter((v) => Number.isFinite(v));
  return values.length ? Math.min(...values) : null;
}

/** Graphs belonging to this data context; a graph of another context is not evidence about this one. */
function graphsInContext(scene, context) {
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  return graphs.filter((g) => g && g.dataContext === context);
}

/**
 * Every attribute name visible on those graphs. Read from `graphs` rather than
 * `derived.plottedAttrs`: `derived` is a cache of exactly this, and the scene
 * heals monotonically, so the rollup may describe a different moment.
 */
function plottedNames(graphs) {
  const out = new Set();
  for (const g of graphs) for (const n of [g.x, g.y, g.legend]) if (typeof n === 'string') out.add(n);
  return out;
}

/** First graph in scene order showing this attribute on an axis, else null. */
function anchorShowing(graphs, name) {
  for (const g of graphs) if (g.x === name || g.y === name) return g.id ?? null;
  return null;
}

/** 1 when nothing named is on screen, down to 0.2 when all of it is. */
function noveltyFor(focus, plotted) {
  if (!focus.length) return 1;
  const seen = focus.filter((n) => plotted.has(n)).length;
  return round3(1 - PLOTTED_NOVELTY_PENALTY * (seen / focus.length));
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Strongest first; `key` breaks ties so the order never depends on input order. */
function sortObservations(list) {
  return list.sort((a, b) => (b.strength - a.strength) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
