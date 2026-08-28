/**
 * comparison.js — the Comparison wondering family.
 *
 *   "How do the means of ___ compare?"
 *
 * WHY THIS EXISTS, AND WHY IT LOOKED IMPOSSIBLE. Plan `-001` lists seven
 * wondering families; this one and `grouping.js` were the two that earned
 * NOTHING on the dataset the tutorials actually ship. Measured 2026-08-28
 * (`docs/verification/wonderings/distribution-shape.mjs`), the Mammals fixture
 * had exactly two categoricals: `Mammal`, cardinality 12 over 12 cases — an
 * IDENTIFIER, 12 groups of one — and `Order`, 7 groups over 12 cases with a
 * smallest group of 1. `Order` produces gorgeous-looking eta2 values (0.69 to
 * 0.97 across the five numerics) and every one of them is a lie: eta2 rises
 * mechanically with group count, and a "mean" over one animal is that animal
 * wearing a hat. W0 added a 3-group `Diet` column (plant 5, meat 4, both 3) for
 * this reason, and after it four comparisons are honestly earned:
 *
 *     Diet -> Sleep     eta2 = 0.82   EARNED
 *     Diet -> Speed     eta2 = 0.59   EARNED
 *     Diet -> Height    eta2 = 0.47   EARNED
 *     Diet -> Mass      eta2 = 0.31   EARNED
 *     Diet -> LifeSpan  eta2 = 0.27   declined — the groups visibly overlap
 *     Order -> anything               declined — 7 groups, smallest 1
 *     Mammal -> anything              declined — identifier
 *
 * The declines are the point. A family that emitted on `Order` would be a stem
 * generator with a statistics library bolted on; `docs/DATA-MOVES.md` §3 and
 * `web/src/data-moves.js` state the house rule this follows — prefer
 * UNDER-cheering, because a missed wondering is invisible and a wrong one is
 * noise.
 *
 * WHY THE GATES ARE RE-CHECKED HERE. `web/src/analysis/grouping.js` already
 * publishes `separations[].qualifies`, and this module requires it to be true.
 * It then re-checks the STRUCTURAL guards — identifier, group count, group size
 * — itself, because those are not statistical judgments but questions about
 * whether the SENTENCE is honest: no rhetorical question can compare 7 means
 * computed from 1 case each, whatever any eta2 threshold says. The eta2 floor is
 * re-checked too, on the deliberate asymmetry that if the analysis ever RAISES
 * its floor this module never disagrees, and if it ever LOWERS it this module
 * declines — failing in the under-cheering direction.
 *
 * PURITY. `(DatasetModel, SceneModel) => Observation[]` per
 * `web/src/wonderings/contracts.js`. No browser globals, no clock, no
 * randomness, no text — realization is W2's job (`wonderings/realize.js`) and
 * the voice rule forbids statistics in the sentence, so the numbers below travel
 * in `evidence` and are rendered only as provenance into "Dot's mind".
 *
 * TWO CROSS-FAMILY RULES, DECIDED ONCE 2026-08-28 AND APPLIED IN ALL SEVEN
 * FAMILY FILES; the full argument is in `relationship.js`'s header.
 *
 *   KEY SEPARATOR IS `'|'`, not the `'~'` this file used until 2026-08-28.
 *   `contracts.js:142-147` makes `key` the de-duplication key, the novelty key
 *   and the W2 phrasing-hash input at the same time, so two families spelling
 *   the same shape differently is three bugs at once. `'|'` won because it was
 *   already the only spelling declared as a named constant with a stated
 *   meaning. `KEY_SEPARATOR` is exported by all seven families so a test can
 *   assert ONE spelling rather than seven that happen to agree.
 *
 *   `graph.dataContext == null` DOES NOT BELONG TO THIS CONTEXT — which is what
 *   `graphsInContext` below already did, and is now what `relationship.js` and
 *   `second-dimension.js` do too.
 *
 * The small helpers at the bottom are duplicated in `grouping.js` and
 * `filtering.js` rather than shared. That is deliberate: the build rule for this
 * wave is ONE MODULE, ONE FILE, ONE OWNER, and a shared helper file would be a
 * fourth file with no owner.
 */

const ETA2_FLOOR = 0.30;          // unitless 0..1 (fraction of variance between groups); below this the groups visibly overlap on a plot, so "compare the means" points at nothing a student could see. Diet -> LifeSpan sits at 0.27 and is refused.
const GROUP_COUNT_CEILING = 4;    // groups; more than 4 groups over a 12-case dataset cannot be compared honestly, and eta2 inflates with group count. Refuses Mammals' `Order` (7).
const MIN_GROUP_COUNT = 2;        // groups; one group is not a comparison, it is a mean.
const MIN_GROUP_SIZE = 3;         // cases; below 3 a group "mean" is one animal wearing a hat. Refuses `Order` (smallest group 1) a second way.
const PLOTTED_NOVELTY_PENALTY = 0.8;  // unitless 0..1; fraction of novelty removed when every attribute named is already on screen. Leaves 0.2 rather than 0, because seeing an attribute plotted is not the same as having been asked this question about it.

/** The family id written into every Observation this module emits. */
export const COMPARISON_FAMILY = 'comparison';

/**
 * The one separator between attribute names inside `Observation.key`, shared by
 * all seven families (see the header). Exported so a test can assert one
 * spelling across the seven rather than seven spellings that happen to agree.
 */
export const KEY_SEPARATOR = '|';     // literal; the sole join character in Observation.key

/**
 * Comparison observations for one dataset and one scene.
 *
 * At most ONE observation per numeric measure: the categorical that separates it
 * best wins, ties broken alphabetically. Without that cap two qualifying
 * categoricals would produce two observations that a realizer speaking only
 * `focus[0]` would render as the same English sentence.
 *
 * `focus` is `[measure, category]` — in speaking order, so a realizer may say
 * "How do the means of Mass compare across Diet?" or, using `focus[0]` alone,
 * "How do the means of Mass compare?". Both are honest; the first is better.
 *
 * Declines, in full: no `separations` array; `qualifies !== true`; eta2 below
 * the floor; group count outside `[2, 4]`; smallest group under 3; either
 * attribute missing from `attrs` (the identifier rule cannot be checked, so the
 * answer is no); either attribute an identifier; or the pair is ALREADY on
 * screen together, which is the case `contracts.js` describes as wondering aloud
 * about something the student is looking at.
 *
 * @param {import('../contracts.js').DatasetModel} dataset
 * @param {import('../contracts.js').SceneModel} [scene]
 * @returns {import('../contracts.js').Observation[]} strongest first, then by key
 */
export function observeComparison(dataset, scene) {
  const context = typeof dataset?.context === 'string' ? dataset.context : '';
  const attrs = Array.isArray(dataset?.attrs) ? dataset.attrs : null;
  const separations = Array.isArray(dataset?.separations) ? dataset.separations : null;
  if (!context || !attrs || !separations) return [];

  const byName = indexByName(attrs);
  const caseCount = Number.isFinite(dataset.caseCount) ? dataset.caseCount : null;
  const graphs = graphsInContext(scene, context);
  const plotted = plottedNames(graphs);
  const together = plottedPairKeys(graphs);

  // One winner per measure. Strictly-greater comparison keeps the first-seen
  // separation on an exact tie, and the alphabetical tie-break below makes the
  // result independent of the order `separations` happens to arrive in.
  const best = new Map();
  for (const sep of separations) {
    if (!comparable(sep, byName, caseCount)) continue;
    if (together.has(pairKey(sep.num, sep.cat))) continue;
    const prev = best.get(sep.num);
    if (!prev || sep.eta2 > prev.eta2 || (sep.eta2 === prev.eta2 && sep.cat < prev.cat)) {
      best.set(sep.num, sep);
    }
  }

  const out = [];
  for (const sep of best.values()) {
    const focus = [sep.num, sep.cat];
    out.push({
      family: COMPARISON_FAMILY,
      key: `${COMPARISON_FAMILY}:${context}:${focus.join(KEY_SEPARATOR)}`,
      dataContext: context,
      focus,
      evidence: {
        cat: sep.cat,
        num: sep.num,
        eta2: sep.eta2,
        groups: sep.groups,
        smallestGroup: sep.smallestGroup,
      },
      strength: round3(clamp01(sep.eta2)),
      novelty: noveltyFor(focus, plotted),
      scope: { componentId: anchorShowing(graphs, sep.num) },
    });
  }
  return sortObservations(out);
}

/**
 * Does one separation clear every gate this family imposes?
 * `qualifies` is the analysis's verdict; everything else is this module
 * refusing to build a sentence that could not be honest.
 */
function comparable(sep, byName, caseCount) {
  if (!sep || typeof sep.cat !== 'string' || typeof sep.num !== 'string') return false;
  if (sep.qualifies !== true) return false;
  if (!Number.isFinite(sep.eta2) || sep.eta2 < ETA2_FLOOR) return false;
  if (!Number.isFinite(sep.groups)) return false;
  if (sep.groups < MIN_GROUP_COUNT || sep.groups > GROUP_COUNT_CEILING) return false;
  if (!Number.isFinite(sep.smallestGroup) || sep.smallestGroup < MIN_GROUP_SIZE) return false;

  const cat = byName.get(sep.cat);
  const num = byName.get(sep.num);
  if (!cat || !num) return false;                       // unverifiable => refused
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
 * `cardinality === caseCount` is its definition. Either one is disqualifying, so
 * a model that carries only one of the two fields still cannot slip an
 * identifier through.
 */
function isIdentifier(attr, caseCount) {
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
 * Graphs belonging to this data context. A graph of some other context says
 * nothing about this dataset and must not suppress or anchor anything.
 */
function graphsInContext(scene, context) {
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  return graphs.filter((g) => g && g.dataContext === context);
}

/**
 * Every attribute name visible on those graphs. Read from `graphs` rather than
 * from `derived.plottedAttrs`: `derived` is a cache of exactly this, and
 * `contracts.js` says the scene heals monotonically, so the rollup may describe
 * a scene newer or older than the graph list it was rolled up from.
 */
function plottedNames(graphs) {
  const out = new Set();
  for (const g of graphs) for (const n of [g.x, g.y, g.legend]) if (typeof n === 'string') out.add(n);
  return out;
}

/** Order-free identity for an unordered pair of attribute names. */
function pairKey(a, b) { return JSON.stringify([a, b].sort()); }

/**
 * Unordered attribute pairs already shown together on one graph. x-with-legend
 * counts: a dot plot of Mass coloured by Diet IS the comparison, so asking for
 * it would be wondering aloud about what is on screen.
 */
function plottedPairKeys(graphs) {
  const out = new Set();
  for (const g of graphs) {
    const names = [g.x, g.y, g.legend].filter((n) => typeof n === 'string');
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (names[i] !== names[j]) out.add(pairKey(names[i], names[j]));
      }
    }
  }
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
