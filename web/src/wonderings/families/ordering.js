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
 * THRESHOLDS ARE DUPLICATED from `families/distribution.js` DELIBERATELY. Under
 * plan `-002`'s ONE MODULE, ONE FILE, ONE OWNER rule these are separately owned
 * units and neither imports the other, so each stands alone. The shared source
 * of truth is the family table in plan `-001` and the gates in
 * `distribution-shape.mjs`, not either of these two files.
 *
 * PURITY. `(DatasetModel, SceneModel) => Observation[]`, per the
 * `WonderingFamily` typedef in `../contracts.js`. No I/O, no clock, no
 * randomness, no browser globals.
 *
 * THIS MODULE EMITS NO TEXT — words are the W2 realizer's job, and `evidence`
 * must never reach the sentence.
 */

/** The family name written into every Observation this module emits. */
export const ORDERING_FAMILY = 'ordering';

const SKEW_TELL = 1.0;        // unitless Fisher-Pearson g1; |g1| > 1 is the conventional "markedly skewed" line, and is what distribution-shape.mjs measured with
const GAP_FRAC_TELL = 0.35;   // fraction of the range, 0..1; a gap wider than a third of the range becomes two visible blocks of rows once sorted

const MIN_CASES_FOR_SHAPE = 5; // non-blank cases; below 5 there are at most 4 gaps and skewness is one point's opinion. Sorting 4 rows reveals nothing that reading them does not.

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
 * The two tells that support the ordering claim, as stable string labels.
 *
 * `Number.isFinite` first, which is what disposes of the degenerate columns
 * without special-casing them: an all-identical column has a zero range and so
 * a `NaN` gapFrac, and a constant column has an undefined skew.
 */
function tellsFor(attr) {
  const tells = [];
  if (Number.isFinite(attr.gapFrac) && attr.gapFrac > GAP_FRAC_TELL) tells.push('gap');
  if (Number.isFinite(attr.skew) && Math.abs(attr.skew) > SKEW_TELL) tells.push('tail');
  return tells;
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
      key: `${ORDERING_FAMILY}:${context}:${attr.name}`,
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
