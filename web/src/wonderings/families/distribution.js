/**
 * families/distribution.js — "What does the distribution of ___ look like?"
 *
 * WHY THIS FILE EXISTS. The stem form governs WHO FILLS THE BLANK; it never
 * means the system is guessing. This module is the gate that makes that true
 * for the distribution family: it emits an Observation only when the shape of
 * an attribute's values is actually remarkable, and it emits NOTHING otherwise.
 * Declining is the point. Measured 2026-08-28 against the 12-case Mammals
 * fixture (`web/src/demo/fixture.js`, reproducible with
 * `node docs/verification/wonderings/distribution-shape.mjs`), exactly 4 of the
 * 5 numeric attributes earn a tell — `LifeSpan`, `Height`, `Mass`, `Speed` —
 * and `Sleep` earns none, because its values are evenly spread: its largest gap
 * is 0.348 of the range (just under the 0.35 gate), its skewness is 0.48, its
 * largest |z| is 2.11 and its coefficient of variation is 0.62. A module that
 * emitted on `Sleep` would be a stem generator, not an analysis.
 *
 * THE FOUR TELLS come from the family table in plan `-001`: |skew| > 1, a
 * largest gap over 35% of the range, |z| > 2.5, or cv > 1.5. ANY ONE qualifies,
 * because they describe four genuinely different ways a distribution can be
 * worth a second look — a tail, a cluster split, a lone outlier, and spread
 * that swamps the centre. `Mass` fires all four; `Speed` fires only the gap.
 *
 * THE THRESHOLDS ARE DUPLICATED in `families/ordering.js` DELIBERATELY. The two
 * files are separately owned units under the ONE MODULE, ONE FILE, ONE OWNER
 * rule of plan `-002`; neither imports the other, so each can be read, tested
 * and broken on its own. The shared source of truth is the family table in plan
 * `-001` and the gates in `docs/verification/wonderings/distribution-shape.mjs`,
 * not either of these files.
 *
 * PURITY. `(DatasetModel, SceneModel) => Observation[]`, per the
 * `WonderingFamily` typedef in `../contracts.js`. No I/O, no clock, no
 * randomness, no browser globals. Same inputs, same outputs, forever — which is
 * what makes the W3 corpus reproducible and this module testable in node.
 *
 * THIS MODULE EMITS NO TEXT. An Observation is a claim the data supports; words
 * are the W2 realizer's job (`web/src/wonderings/realize.js`). Nothing here
 * knows how the question is phrased, and `evidence` must never reach the
 * sentence — the voice rule forbids statistics in the text.
 */

/** The family name written into every Observation this module emits. */
export const DISTRIBUTION_FAMILY = 'distribution';

const SKEW_TELL = 1.0;          // unitless Fisher-Pearson g1; |g1| > 1 is the conventional "markedly skewed" line, and is what distribution-shape.mjs measured with
const GAP_FRAC_TELL = 0.35;     // fraction of the range, 0..1; a gap wider than a third of the range is a cluster split you can see without a computer
const MAX_ABS_Z_TELL = 2.5;     // standard deviations; below 2.5 a "far" point is unremarkable in 12 cases, above it the eye already found it (Mammals' African Elephant is 2.99)
const CV_TELL = 1.5;            // unitless sd/mean; above 1.5 the spread swamps the centre, so "typical" stops meaning anything (Mammals' Mass is 2.06)

const MIN_CASES_FOR_SHAPE = 5;  // non-blank cases; below 5 there are at most 4 gaps and skewness is one point's opinion, so shape statistics describe noise. The smallest dataset the tutorials ship is 12.

const BASE_STRENGTH = 0.45;         // unitless 0..1; one earned tell. Deliberately below 0.5 so a single-tell finding never outranks a two-tell one from another family.
const STRENGTH_PER_EXTRA_TELL = 0.15; // unitless 0..1 per additional independent tell; four tells reach 0.90 and none reaches 1.0, because certainty is not on offer
const NOVELTY_PLACEHOLDER = 0.5;    // unitless 0..1; constant until W3 owns per-session history. A pure module cannot know what this student has already been shown.

/** Clamp to the 0..1 the Observation contract requires of `strength`. */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Is this attribute one whose SHAPE is a meaningful thing to ask about?
 *
 * `role === 'identifier'` is refused outright: one distinct value per case has
 * no distribution worth a question. A missing `role` is allowed through, and a
 * missing `n` is not — `n` is a required field of the `Attr` contract, so its
 * absence means the object is malformed, whereas `role` merely being absent
 * costs information and should not silently mute the whole family.
 */
function isShapeable(attr) {
  if (!attr || typeof attr.name !== 'string' || attr.name === '') return false;
  if (attr.kind !== 'numeric') return false;
  if (attr.role === 'identifier' || attr.role === 'category') return false;
  if (!Number.isFinite(attr.n) || attr.n < MIN_CASES_FOR_SHAPE) return false;
  return true;
}

/**
 * Which of the four tells this attribute earns, as stable string labels.
 *
 * Every test is `Number.isFinite` first, which is what disposes of the
 * degenerate cases without special-casing them: an all-identical column has a
 * zero range and a `NaN` gapFrac, and a column whose mean is 0 has an infinite
 * cv. Neither is a tell; both would otherwise compare as `> threshold` or throw
 * the ranking off.
 */
function tellsFor(attr) {
  const tells = [];
  if (Number.isFinite(attr.skew) && Math.abs(attr.skew) > SKEW_TELL) tells.push('skew');
  if (Number.isFinite(attr.gapFrac) && attr.gapFrac > GAP_FRAC_TELL) tells.push('gap');
  if (Number.isFinite(attr.maxAbsZ) && Math.abs(attr.maxAbsZ) > MAX_ABS_Z_TELL) tells.push('outlier');
  if (Number.isFinite(attr.cv) && Math.abs(attr.cv) > CV_TELL) tells.push('spread');
  return tells;
}

/**
 * Is this attribute's distribution ALREADY on screen?
 *
 * A graph with one axis holding the attribute and the other empty is a dot plot
 * — it *is* the distribution. Asking what it looks like while the student is
 * looking straight at it is the wondering equivalent of reading the label out
 * loud. A scatterplot does not count: there the attribute is a coordinate, and
 * its own shape is exactly what gets lost.
 *
 * `== null` rather than `=== null` on purpose: the contract says an empty axis
 * is `null`, but a snapshot that simply omitted the key must read as empty too.
 */
function isDistributionOnScreen(scene, context, name) {
  const graphs = Array.isArray(scene?.graphs) ? scene.graphs : [];
  return graphs.some((g) => g && g.dataContext === context
    && ((g.x === name && g.y == null) || (g.y === name && g.x == null)));
}

/** Only the finite tell values, so provenance never renders a NaN. */
function evidenceFor(attr, tells) {
  const ev = { n: attr.n, tells };
  if (Number.isFinite(attr.skew)) ev.skew = attr.skew;
  if (Number.isFinite(attr.gapFrac)) ev.gapFrac = attr.gapFrac;
  if (Number.isFinite(attr.maxAbsZ)) ev.maxAbsZ = attr.maxAbsZ;
  if (Number.isFinite(attr.cv)) ev.cv = attr.cv;
  return ev;
}

/**
 * The distribution family.
 *
 * @param {import('../contracts.js').DatasetModel} dataset
 * @param {import('../contracts.js').SceneModel} [scene]
 * @returns {import('../contracts.js').Observation[]}
 *   Strongest first, ties broken by attribute name ascending, so two runs over
 *   the same data produce byte-identical output. Empty when nothing qualifies —
 *   the normal and frequent case.
 */
export function distributionFamily(dataset, scene) {
  const context = dataset?.context;
  // Without a context the `family:context:attrs` key is not stable, and the key
  // is the de-duplication key, the novelty key AND the W2 phrasing hash input.
  // Decline rather than mint an ambiguous one.
  if (typeof context !== 'string' || context === '') return [];
  const attrs = Array.isArray(dataset.attrs) ? dataset.attrs : [];

  const out = [];
  for (const attr of attrs) {
    if (!isShapeable(attr)) continue;
    if (isDistributionOnScreen(scene, context, attr.name)) continue;
    const tells = tellsFor(attr);
    if (tells.length === 0) continue;
    out.push({
      family: DISTRIBUTION_FAMILY,
      key: `${DISTRIBUTION_FAMILY}:${context}:${attr.name}`,
      dataContext: context,
      focus: [attr.name],
      evidence: evidenceFor(attr, tells),
      strength: clamp01(BASE_STRENGTH + STRENGTH_PER_EXTRA_TELL * (tells.length - 1)),
      novelty: NOVELTY_PLACEHOLDER,
      scope: { componentId: null },   // about the dataset, not about any one component
    });
  }

  out.sort((p, q) => (q.strength - p.strength) || (p.focus[0] < q.focus[0] ? -1 : p.focus[0] > q.focus[0] ? 1 : 0));
  return out;
}
