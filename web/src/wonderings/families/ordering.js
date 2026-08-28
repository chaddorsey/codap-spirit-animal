/**
 * families/ordering.js — "What if we sort by ___?"
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A COPY OF `distribution.js`. The two
 * families read the same four shape tells produced by `web/src/analysis/
 * distribution.js`, but they make different claims, so they run on different
 * subsets of them. The ordering claim is narrow and falsifiable: *sorting the
 * table reveals structure the unsorted table hides.* Exactly two of the four
 * tells support it:
 *
 *   - a LARGE GAP — sorting puts the two clusters on either side of it into
 *     adjacent blocks of rows, which is the only way a 12-row table shows a
 *     cluster split at all;
 *   - a HEAVY TAIL (|skew| > 1) — sorting collects the tail at one end, where
 *     it reads as a run of rows rather than as scattered large numbers.
 *
 * The other two tells are DELIBERATELY not ordering tells. A lone outlier
 * (`maxAbsZ`) needs no sort: one extreme value in 12 rows is already the thing
 * you notice, and the distribution family has it covered. A high coefficient of
 * variation (`cv`) is a statement about scale, not about order — sorting a
 * widely-spread but evenly-spaced column reveals nothing, because there is
 * nothing hidden in it. If this module ever emits where only `maxAbsZ` or `cv`
 * fired, it has stopped being an analysis and become a second stem for the same
 * finding.
 *
 * MEASURED 2026-08-28 against the 12-case Mammals fixture
 * (`web/src/demo/fixture.js`; reproduce with `node docs/verification/wonderings/
 * distribution-shape.mjs`, section SORT-WORTHINESS): 4 of the 5 numerics are
 * worth sorting — `LifeSpan` (gap 0.39 of range), `Height` (skew 1.17), `Mass`
 * (both), `Speed` (gap 0.36) — and `Sleep` is not: gap 0.348, skew 0.48. That
 * refusal is the module's most important behaviour.
 *
 * THE THRESHOLDS ARE NOT HERE — corrected 2026-08-28. This file used to
 * re-declare `SKEW_TELL` and `GAP_FRAC_TELL` and re-implement the two
 * comparisons, on the argument that ONE MODULE, ONE FILE, ONE OWNER made each
 * family stand alone. That argument was wrong about which thing is the module:
 * plan `-002` puts the arithmetic in exactly ONE place, and it is
 * `web/src/analysis/distribution.js`. What is separately owned is the CLAIM —
 * that sorting reveals hidden structure — and the claim is expressed here, by
 * accepting only two of the analysis's four tells. `families/distribution.js`
 * accepts all four; that difference is the whole distinction between the two
 * families, and it is now the ONLY difference between them.
 *
 * THE TELL NAMES ARE THIS FAMILY'S, mapped from the analysis's. The analysis
 * says `'skewed'` because it is describing a distribution; this family says
 * `'tail'` because it is describing what a sort would put where. The mapping is
 * one table, `ORDERING_TELL_NAMES`, and it is also the accept-list: a tell with
 * no entry is a tell this family does not claim.
 *
 * PURITY. `(DatasetModel, SceneModel) => Observation[]`, per the
 * `WonderingFamily` typedef in `../contracts.js`. No I/O, no clock, no
 * randomness, no browser globals. The one import is a pure leaf module with the
 * same guarantees.
 *
 * TWO CROSS-FAMILY RULES, DECIDED ONCE 2026-08-28 AND APPLIED IN ALL SEVEN
 * FAMILY FILES; the full argument is in `relationship.js`'s header.
 *   KEY SEPARATOR IS `'|'` — see `KEY_SEPARATOR` below.
 *   `graph.dataContext == null` DOES NOT BELONG TO THIS CONTEXT, which is what
 *   `isOrderOnScreen` below already required. `web/src/scene-model.js` emits
 *   `null` only for a graph with nothing dropped on it, and such a graph is not
 *   a dot plot of anything.
 *
 * THIS MODULE EMITS NO TEXT — words are the W2 realizer's job, and `evidence`
 * must never reach the sentence.
 */

import { tellsFromShape, TELL_GAP, TELL_SKEWED } from '../../analysis/distribution.js';

/** The family name written into every Observation this module emits. */
export const ORDERING_FAMILY = 'ordering';

/**
 * The one separator between attribute names inside `Observation.key`, shared by
 * all seven families. Exported so a test can assert one spelling across the
 * seven rather than seven spellings that happen to agree. This family's `focus`
 * is a single name, so the separator never appears in a key it mints; it is
 * declared anyway, for the same reason `families/distribution.js` declares it.
 */
export const KEY_SEPARATOR = '|';   // literal; the sole join character in Observation.key

/**
 * The analysis tells this family claims, mapped to the words it uses for them.
 * ALSO the accept-list: `outlier` and `spread` are absent on purpose, and their
 * absence is the module's whole argument (see the header). A `Map` rather than
 * an object literal so a tell named `__proto__` could never reach a prototype.
 */
const ORDERING_TELL_NAMES = new Map([
  [TELL_GAP, 'gap'],      // sorting puts the clusters either side of the gap into adjacent blocks of rows
  [TELL_SKEWED, 'tail'],  // sorting collects the long tail at one end, where it reads as a run rather than as scattered large numbers
]);

const MIN_CASES_FOR_SHAPE = 5; // non-blank cases; below 5 there are at most 4 gaps and skewness is one point's opinion. Sorting 4 rows reveals nothing that reading them does not. STRICTER than analysis/distribution.js's MIN_TELL_CASES of 4, deliberately: that is where a tell becomes arithmetically possible, this is where sorting becomes worth a student's attention.

const BASE_STRENGTH = 0.45;          // unitless 0..1; one earned tell, matching the distribution family so the two rank against each other on the same scale
const STRENGTH_PER_EXTRA_TELL = 0.20; // unitless 0..1; only two tells exist here, so the second is worth more than it is in the four-tell distribution family
const NOVELTY_PLACEHOLDER = 0.5;     // unitless 0..1; constant until W3 owns per-session history. A pure module cannot know what this student has already been shown.

/** Clamp to the 0..1 the Observation contract requires of `strength`. */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Is this attribute one you could sort a table by and learn something?
 *
 * `role === 'identifier'` is refused: sorting by a column with one distinct
 * value per case reorders the rows and reveals nothing about the data. A
 * missing `role` is allowed through; a missing `n` is not, because `n` is a
 * required field of the `Attr` contract and its absence means malformed input.
 */
function isSortable(attr) {
  if (!attr || typeof attr.name !== 'string' || attr.name === '') return false;
  if (attr.kind !== 'numeric') return false;
  if (attr.role === 'identifier' || attr.role === 'category') return false;
  if (!Number.isFinite(attr.n) || attr.n < MIN_CASES_FOR_SHAPE) return false;
  return true;
}

/**
 * The tells that support the ordering claim, in this family's words.
 *
 * The measuring is `tellsFromShape`'s: an `Attr` carries `n`, `skew`, `gapFrac`,
 * `maxAbsZ` and `cv` under exactly the names it reads, and it is what disposes
 * of the degenerate columns without special-casing them — an all-identical
 * column has a zero range and so a `NaN` gapFrac, and a constant column has an
 * undefined skew. The filtering is this family's: only `gap` and `tail` are
 * claims about ORDER.
 *
 * Reported in `TELL_NAMES` order (`tail` before `gap`), which is the analysis's
 * order rather than this file's former one. `evidence.tells` is provenance for
 * "Dot's mind" and nothing switches on the order.
 */
function tellsFor(attr) {
  const out = [];
  for (const tell of tellsFromShape(attr)) {
    const word = ORDERING_TELL_NAMES.get(tell);
    if (word !== undefined) out.push(word);
  }
  return out;
}

/**
 * Is the hidden structure already visible?
 *
 * A graph with this attribute on one axis and the other axis empty is a dot
 * plot: the values are already laid out along a number line, so the gap and the
 * tail — the only two things this family claims sorting would reveal — are not
 * hidden. The claim would be false, so decline. A scatterplot does not count:
 * there the student is reading a bivariate pattern, and the marginal run of
 * cases is not what is on offer.
 *
 * `== null` rather than `=== null` on purpose: the contract says an empty axis
 * is `null`, but a snapshot that simply omitted the key must read as empty too.
 */
function isOrderOnScreen(scene, context, name) {
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  return graphs.some((g) => g && g.dataContext === context
    && ((g.x === name && g.y == null) || (g.y === name && g.x == null)));
}

/** Only the finite tell values, so provenance never renders a NaN. */
function evidenceFor(attr, tells) {
  const ev = { n: attr.n, tells };
  if (Number.isFinite(attr.gapFrac)) ev.gapFrac = attr.gapFrac;
  if (Number.isFinite(attr.skew)) ev.skew = attr.skew;
  return ev;
}

/**
 * The ordering family.
 *
 * @param {import('../contracts.js').DatasetModel} dataset
 * @param {import('../contracts.js').SceneModel} [scene]
 * @returns {import('../contracts.js').Observation[]}
 *   Strongest first, ties broken by attribute name ascending, so two runs over
 *   the same data produce byte-identical output. Empty when nothing qualifies.
 */
export function orderingFamily(dataset, scene) {
  const context = dataset?.context;
  // Without a context the `family:context:attrs` key is not stable, and the key
  // is the de-duplication key, the novelty key AND the W2 phrasing hash input.
  if (typeof context !== 'string' || context === '') return [];
  const attrs = Array.isArray(dataset.attrs) ? dataset.attrs : [];

  const out = [];
  for (const attr of attrs) {
    if (!isSortable(attr)) continue;
    if (isOrderOnScreen(scene, context, attr.name)) continue;
    const tells = tellsFor(attr);
    if (tells.length === 0) continue;
    out.push({
      family: ORDERING_FAMILY,
      key: `${ORDERING_FAMILY}:${context}:${[attr.name].join(KEY_SEPARATOR)}`,
      dataContext: context,
      focus: [attr.name],
      evidence: evidenceFor(attr, tells),
      strength: clamp01(BASE_STRENGTH + STRENGTH_PER_EXTRA_TELL * (tells.length - 1)),
      novelty: NOVELTY_PLACEHOLDER,
      scope: { componentId: null },   // about the dataset's table, not about any one component
    });
  }

  out.sort((p, q) => (q.strength - p.strength) || (p.focus[0] < q.focus[0] ? -1 : p.focus[0] > q.focus[0] ? 1 : 0));
  return out;
}
