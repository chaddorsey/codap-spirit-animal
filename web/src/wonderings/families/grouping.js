/**
 * grouping.js — the Grouping wondering family.
 *
 *   "How would that look grouped by ___?"
 *
 * WHY THIS FAMILY NEEDS THE SCENE, AND THE OTHER TWO DO NOT. The stem contains
 * the word "that". It is deictic: it points at a graph the student is looking
 * at. With nothing on screen the sentence is not merely weak, it has no
 * referent — "How would that look grouped by Diet?" asked of an empty workspace
 * is a question about nothing. So this family is gated on BOTH the data (a
 * categorical that genuinely separates a measure) and the scene (a graph, in
 * this data context, already showing that measure, and not already grouped by
 * that categorical). Comparison and filtering are about the dataset and emit
 * with an empty scene; this one does not, and that difference is the family's
 * whole character. Plan `-001` states the same requirement for the
 * second-dimension family ("a univariate plot exists").
 *
 * WHY IT EARNED NOTHING BEFORE W0. Measured 2026-08-28
 * (`docs/verification/wonderings/distribution-shape.mjs`), the shipping Mammals
 * fixture had one identifier (`Mammal`, cardinality 12 over 12 cases) and one
 * usable categorical (`Order`, 7 groups over 12 cases, smallest group 1). eta2
 * for `Order` runs 0.69–0.97 and every value is inflated by the group count;
 * grouping a 12-dot plot into 7 colours produces confetti, not a comparison.
 * W0's `Diet` column (plant 5, meat 4, both 3) is the whole fix. After it:
 *
 *     Diet -> Sleep   eta2 = 0.82      Diet -> Height   eta2 = 0.47
 *     Diet -> Speed   eta2 = 0.59      Diet -> Mass     eta2 = 0.31
 *     Diet -> LifeSpan eta2 = 0.27  declined — the groups visibly overlap
 *
 * so a graph of Mass against Sleep earns exactly one grouping wondering, about
 * `Diet`, at strength 0.82 (its best qualifying separation with an attribute
 * that graph actually shows). `Order` and `Mammal` are refused, as they must be.
 *
 * WHY THE GATES ARE RE-CHECKED HERE. `web/src/analysis/grouping.js` publishes
 * `separations[].qualifies` and this module requires it. It then re-checks the
 * structural guards — identifier, group count, smallest group — because those
 * decide whether the SENTENCE can be honest rather than whether the statistic
 * is significant. The eta2 floor is re-checked on a deliberate asymmetry: if the
 * analysis raises its floor this module never disagrees; if it lowers one, this
 * module declines. Failing toward silence is the house rule
 * (`web/src/data-moves.js`: prefer UNDER-cheering).
 *
 * WHERE EACH RE-CHECK LIVES, corrected 2026-08-28. The structural guards are
 * ATTRIBUTE-level and the statistical ones are SEPARATION-level, and this file
 * used to apply the attribute-level ones twice: once in `candidates` / `shown`
 * inside `observeGrouping`, and again inside `qualifying`. The second copy was
 * unreachable — `bestSeparation` only ever sees a `sep` whose `cat` came from
 * `candidates` and whose `num` is in `shown` — so it was dead code claiming to
 * be load-bearing, which is worse than either. It is gone. The identifier rule,
 * the kind rule, the cardinality range and the smallest-group floor are now
 * enforced in exactly ONE place each, on the attributes, before any separation
 * is looked at; `qualifying` holds only what lives on the separation itself.
 * `candidates` is taken from `byName.values()` rather than from `attrs` so that
 * the object `candidates` cleared is provably the same object `byName` returns
 * even when a malformed dataset repeats an attribute name.
 *
 * TWO CROSS-FAMILY RULES, DECIDED ONCE 2026-08-28 AND APPLIED IN ALL SEVEN
 * FAMILY FILES; the full argument is in `relationship.js`'s header.
 *
 *   KEY SEPARATOR IS `'|'`, not the `'~'` this file used until 2026-08-28.
 *   `contracts.js:142-147` makes `key` the de-duplication key, the novelty key
 *   and the W2 phrasing-hash input at once, so two families spelling the same
 *   shape differently is three bugs. `KEY_SEPARATOR` is exported by all seven
 *   so a test can assert ONE spelling.
 *
 *   `graph.dataContext == null` DOES NOT BELONG TO THIS CONTEXT — which is what
 *   `graphsInContext` below already did.
 *
 * PURITY. `(DatasetModel, SceneModel) => Observation[]` per
 * `web/src/wonderings/contracts.js`. No browser globals, no clock, no
 * randomness, no text. The helpers at the bottom are duplicated in
 * `comparison.js` and `filtering.js` on purpose — this wave's rule is ONE
 * MODULE, ONE FILE, ONE OWNER, and a shared helper file would have no owner.
 */

const ETA2_FLOOR = 0.30;          // unitless 0..1 (fraction of variance between groups); below this the colours overlap on the plot and the grouping shows the student nothing. Diet -> LifeSpan sits at 0.27 and is refused.
const GROUP_COUNT_CEILING = 4;    // groups; a legend with more than 4 colours over a 12-case plot is confetti, and eta2 inflates with group count. Refuses Mammals' `Order` (7).
const MIN_GROUP_COUNT = 2;        // groups; grouping into one group is not grouping.
const MIN_GROUP_SIZE = 3;         // cases; a colour worn by fewer than 3 dots reads as an outlier, not as a group. Refuses `Order` (smallest group 1) a second way.
const PLOTTED_NOVELTY_PENALTY = 0.8;  // unitless 0..1; fraction of novelty removed when the categorical is already on screen elsewhere. Leaves 0.2 rather than 0, because using an attribute on another graph is not the same as having been asked this question.

/** The family id written into every Observation this module emits. */
export const GROUPING_FAMILY = 'grouping';

/**
 * The one separator between attribute names inside `Observation.key`, shared by
 * all seven families (see the header). Exported so a test can assert one
 * spelling across the seven rather than seven spellings that happen to agree.
 */
export const KEY_SEPARATOR = '|';     // literal; the sole join character in Observation.key

/**
 * Grouping observations for one dataset and one scene.
 *
 * At most ONE observation per categorical, however many graphs would earn it:
 * `key` is `grouping:context:cat` because the rendered sentence names only the
 * categorical, and `contracts.js` requires the key to be the de-duplication key,
 * the novelty key and the phrasing-hash input at once. When two graphs earn the
 * same categorical the stronger separation wins and carries its own graph in
 * `scope.componentId`; an exact tie keeps the earlier graph in scene order.
 *
 * `focus` is `[categorical]` — the stem has one blank and the graph is spoken as
 * "that". The measure that earned it travels in `evidence.num` so provenance can
 * show why, without putting a statistic in the sentence.
 *
 * Declines, in full: no `separations`; no graph in this data context; a graph
 * with no numeric on an axis; the categorical already on that graph's x, y or
 * legend; `qualifies !== true`; eta2 below the floor; group count outside
 * `[2, 4]`; smallest group under 3; the attribute missing from `attrs` (it
 * matches no candidate and no shown measure, so the identifier rule cannot be
 * checked and the answer is no); or an identifier.
 *
 * @param {import('../contracts.js').DatasetModel} dataset
 * @param {import('../contracts.js').SceneModel} [scene]
 * @returns {import('../contracts.js').Observation[]} strongest first, then by key
 */
export function observeGrouping(dataset, scene) {
  const context = typeof dataset?.context === 'string' ? dataset.context : '';
  const attrs = Array.isArray(dataset?.attrs) ? dataset.attrs : null;
  const separations = Array.isArray(dataset?.separations) ? dataset.separations : null;
  if (!context || !attrs || !separations) return [];

  const byName = indexByName(attrs);
  const caseCount = Number.isFinite(dataset.caseCount) ? dataset.caseCount : null;
  const graphs = graphsInContext(scene, context);
  if (!graphs.length) return [];                       // "that" has no referent
  const plotted = plottedNames(graphs);

  // Candidate groupers, filtered ONCE on everything knowable from `attrs`
  // alone: this is the sole enforcement of the identifier rule, the kind rule,
  // the cardinality range and the smallest-group floor for the categorical.
  // Taken from `byName.values()` rather than from `attrs` so that the object
  // cleared here is provably the same object `byName.get(sep.cat)` returns,
  // even if a malformed dataset repeats a name.
  const candidates = [...byName.values()].filter((a) => a.kind === 'categorical'
    && !isIdentifier(a, caseCount)
    && !(Number.isFinite(a.cardinality)
      && (a.cardinality < MIN_GROUP_COUNT || a.cardinality > GROUP_COUNT_CEILING))
    && !(smallestGroupSize(a) !== null && smallestGroupSize(a) < MIN_GROUP_SIZE));

  const best = new Map();   // cat name -> { sep, graph }
  for (const g of graphs) {
    // The sole enforcement of the kind and identifier rules for the MEASURE: a
    // separation is only ever considered against a name that survived here.
    const shown = [g.x, g.y].filter((n) => typeof n === 'string' && byName.get(n)?.kind === 'numeric'
      && !isIdentifier(byName.get(n), caseCount));
    if (!shown.length) continue;                       // nothing on the axes to group
    const occupied = new Set([g.x, g.y, g.legend].filter((n) => typeof n === 'string'));
    for (const cat of candidates) {
      if (occupied.has(cat.name)) continue;            // already grouped by it
      const sep = bestSeparation(separations, cat.name, shown);
      if (!sep) continue;
      const prev = best.get(cat.name);
      if (!prev || sep.eta2 > prev.sep.eta2) best.set(cat.name, { sep, graph: g });
    }
  }

  const out = [];
  for (const [name, { sep, graph }] of best) {
    const focus = [name];
    out.push({
      family: GROUPING_FAMILY,
      key: `${GROUPING_FAMILY}:${context}:${focus.join(KEY_SEPARATOR)}`,
      dataContext: context,
      focus,
      evidence: {
        cat: name,
        num: sep.num,
        eta2: sep.eta2,
        groups: sep.groups,
        smallestGroup: sep.smallestGroup,
        plotType: typeof graph.plotType === 'string' ? graph.plotType : null,
      },
      strength: round3(clamp01(sep.eta2)),
      novelty: noveltyFor(focus, plotted),
      scope: { componentId: graph.id ?? null },
    });
  }
  return sortObservations(out);
}

/**
 * The strongest qualifying separation between `cat` and any measure the graph is
 * showing, or null. Restricting to `shown` is what makes the wondering about
 * THIS graph: `Diet` separating an attribute nobody is looking at would not make
 * "that" look like anything.
 */
function bestSeparation(separations, cat, shown) {
  let best = null;
  for (const sep of separations) {
    if (!sep || sep.cat !== cat || typeof sep.num !== 'string') continue;
    if (!shown.includes(sep.num)) continue;
    if (!qualifying(sep)) continue;
    if (!best || sep.eta2 > best.eta2 || (sep.eta2 === best.eta2 && sep.num < best.num)) best = sep;
  }
  return best;
}

/**
 * Every gate that lives ON THE SEPARATION ITSELF, and only those.
 *
 * The attribute-level rules — identifier, kind, cardinality range, smallest
 * group — are NOT re-checked here. They are enforced once, on the attributes,
 * by `candidates` and `shown` in `observeGrouping`, and every `sep` that
 * reaches this function has already been matched against both. A second copy
 * here was unreachable; see the header. `groups` and `smallestGroup` are
 * checked because they are the SEPARATION's own report of the split, which a
 * disagreeing analysis could state differently from the attribute's
 * `cardinality` and `groupSizes`.
 */
function qualifying(sep) {
  if (sep.qualifies !== true) return false;
  if (!Number.isFinite(sep.eta2) || sep.eta2 < ETA2_FLOOR) return false;
  if (!Number.isFinite(sep.groups)) return false;
  if (sep.groups < MIN_GROUP_COUNT || sep.groups > GROUP_COUNT_CEILING) return false;
  if (!Number.isFinite(sep.smallestGroup) || sep.smallestGroup < MIN_GROUP_SIZE) return false;
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
 * `cardinality === caseCount` is its definition. Either one is disqualifying, so
 * a model carrying only one of the two fields still cannot slip an identifier
 * through and offer to group 12 cases into 12 colours.
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

/**
 * Graphs belonging to this data context. A graph of some other context is not
 * "that": grouping it by an attribute it does not have is impossible.
 */
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
