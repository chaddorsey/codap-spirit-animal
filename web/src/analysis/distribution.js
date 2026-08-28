/**
 * distribution.js — the four shape tells of one numeric attribute.
 *
 * WHY THIS FILE EXISTS. The Distribution and Ordering wondering families are
 * the only two that need no second attribute and no scene, so they are the ones
 * that fire most often — which makes them the ones most able to embarrass the
 * system. "What does the distribution of Sleep look like?" is a fine sentence
 * and a worthless question: Sleep is evenly spread, and there is nothing there
 * to see. The whole point of this module is the DECLINE. It answers one
 * question — does this column have a shape worth looking at? — and on the
 * fixture the tutorials actually ship it says no about one column in five.
 *
 * PROVENANCE. The arithmetic is promoted from
 * `docs/verification/wonderings/distribution-shape.mjs`, the exploratory script
 * that established the four tells and their thresholds against the 12-case
 * Mammals fixture (`web/src/demo/fixture.js`). Measured 2026-08-28, and
 * re-asserted by `docs/verification/wonderings/t-distribution.mjs`:
 *
 *   attribute   skew    gapFrac   maxAbsZ    cv      tells
 *   LifeSpan    0.694   0.390     1.855    0.693     gap
 *   Height      1.168   0.289     2.419    0.869     skewed
 *   Mass        2.419   0.617     3.079    1.995     skewed, gap, outlier, spread
 *   Sleep       0.476   0.348     2.109    0.615     NONE
 *   Speed      -0.047   0.358     1.962    0.398     gap
 *
 * Two things in that table govern the code below.
 *
 * FIRST, NO ROUNDING. `distribution-shape.mjs` rounded `gapFrac` to two
 * decimals. Sleep's largest gap is 0.3483 of its range — 0.0017 under the
 * floor. Rounded to two decimals that is 0.35, and any comparison written `>=`
 * rather than `>`, or any rounding that went up rather than to-nearest, would
 * have fired the gap tell on the one attribute whose refusal the whole design
 * rests on. So: full precision, strict `>`, and the boundary is tested.
 *
 * SECOND, EVERY THRESHOLD IS INDEPENDENTLY REACHED. Mass fires all four,
 * Height fires only `skewed`, LifeSpan and Speed fire only `gap`, Sleep fires
 * none. No fixture attribute isolates `outlier` or `spread`, so the test
 * carries a synthetic case for each; without them a stub that ignored two of
 * the four thresholds would still pass on Mammals.
 *
 * WHAT `cv` IS MEASURED AGAINST, AND WHY IT CHANGED ON 2026-08-28.
 * `cv` is `sd / mean(|x|)`, not `sd / mean`. The adversarial verification of
 * 2026-08-28 (`docs/verification/wonderings/BUILD-VERIFICATION.md`) found two
 * defects that are one defect: `spread` was the only tell of the four that
 * could tell a column from its own reflection, and the only one that could be
 * earned by a column with nothing in it.
 *
 *   - MEASURED: `tells(Mass)` was `['skewed','gap','outlier','spread']` while
 *     `tells(Mass.map(v => -v))` — an identically shaped column — was
 *     `['skewed','gap','outlier']`, because a negated column has a negative
 *     mean, hence a negative `sd/mean`, and `cv > 1.5` is false for every
 *     negative number.
 *   - MEASURED: a 12-value column flatter than Sleep on all three other
 *     measures (skew 0.014 vs 0.476, gapFrac 0.101 vs 0.348, max|z| 1.618 vs
 *     2.109) earned `spread` outright, because its values fall either side of
 *     zero and its mean is 0.01, making `sd/mean` 347.
 *
 * TWO FIXES WERE AVAILABLE and only one of them is a fix. Gating `|cv|` on the
 * mean being far from zero cannot work: `|sd/mean| > 1.5` IS the statement
 * `|mean| < sd/1.5`, so the gate contradicts the tell. Restricting `cv` to
 * strictly one-sided columns cannot work either, because `tellsFromShape` is
 * contractually given an `Attr` — `{n, skew, gapFrac, maxAbsZ, cv}` — from
 * which no zero crossing is visible. So the DENOMINATOR changed instead:
 *
 *   - For a one-sided column, `mean(|x|)` IS `|mean|`, so `cv` is the textbook
 *     coefficient of variation exactly where the textbook defines it (ratio
 *     scale, one sign) — every Mammals numeric, and every recorded measurement
 *     in the table above, is unchanged.
 *   - It cannot be driven to zero by cancellation. `mean(|x|)` is 0 only when
 *     every value is 0, which is a constant column with sd 0 and no tells.
 *   - It is unchanged by negating the column, so `spread` mirrors like the
 *     other three.
 *   - It is BOUNDED: `sd / mean|x| <= max|x| / rms <= sqrt(n)`, where the old
 *     ratio was unbounded. A column cannot earn `spread` unless its largest
 *     magnitude is at least 1.5 times its root-mean-square — unless something
 *     in it really is far out.
 *
 * A CONSEQUENCE WORTH KNOWING: on a one-sided column, `spread` cannot fire
 * ALONE. Measured 2026-08-28 by hill-climbing over 8-, 12-, 16- and 20-value
 * non-negative columns, the largest cv attainable while |g1| <= 1,
 * gapFrac <= 0.35 and max|z| <= 2.5 all hold is about 1.50. On ratio data a
 * large cv always drags a skew, a gap or an outlier along with it, which is why
 * `t-distribution.mjs`'s spread-only case straddles zero.
 *
 * WHAT THIS MODULE IS NOT. It does not decide whether a wondering is worth
 * saying — it reports shape, and the Distribution and Ordering families
 * (`web/src/wonderings/families/`) decide. It knows nothing about attribute
 * names, contexts, scenes or English.
 *
 * PURITY. No browser globals, no clock, no randomness, no I/O. Same input,
 * same output, forever. Input arrays are never mutated (`shape` sorts a copy —
 * an in-place sort would silently reorder the caller's cases).
 */

// --- thresholds ------------------------------------------------------------
// Each is a bar the data must CLEAR (strict `>`). At the bar exactly, the
// attribute is unremarkable: a tell that fires on its own threshold is a tell
// that fires on Sleep.

/** Unitless Fisher-Pearson g1. |g1| > 1 is the conventional "markedly skewed"
 *  line, and it is where Mammals splits: Height 1.17 and Mass 2.42 read as
 *  lopsided to the eye, LifeSpan 0.69 and Sleep 0.48 do not. Unreachable below
 *  n = 4, since |g1| <= (n-2)/sqrt(n-1) for population moments. */
export const SKEW_ABS_FLOOR = 1;

/** Unitless, 0..1 — the largest gap between sorted values divided by the full
 *  range. > 0.35 means more than a third of the span is empty, i.e. the values
 *  come in clumps. Mass 0.62 (nothing lives between 2547 kg and the elephant)
 *  clears it; Sleep 0.348 does not, by 0.0017. */
export const GAP_FRAC_FLOOR = 0.35;

/** Unitless standard deviations from the mean, using the POPULATION sd. > 2.5
 *  is the outlier tell: Mass 3.08 is the African Elephant. Note the ceiling
 *  max|z| <= (n-1)/sqrt(n), which puts this tell out of reach below n = 9 —
 *  small datasets cannot have outliers, and should not be told they do. */
export const MAX_ABS_Z_FLOOR = 2.5;

/** Unitless ratio sd / mean|x| (see `shape`). > 1.5 means the spread is half
 *  again the typical MAGNITUDE of the values, so "typical value" has stopped
 *  meaning anything. Mass 2.00 clears it and is the only Mammals attribute that
 *  does. Unchanged by the 2026-08-28 change of denominator: every Mammals
 *  numeric is strictly positive, where mean|x| and mean are the same number. */
export const CV_FLOOR = 1.5;

/** Cases (non-blank). Below 4, |g1| > 1 is mathematically unreachable and a
 *  "gap" is a statement about three points rather than about a distribution,
 *  so no tell may fire at all. Deliberately a floor on the TELLS, not on the
 *  arithmetic: `shape()` still reports what it measured. */
export const MIN_TELL_CASES = 4;

// --- tell names ------------------------------------------------------------
// Stable strings, because they cross a module boundary: the Distribution and
// Ordering families switch on them. Kept lowercase and vocabulary-free of
// English phrasing, which is the realizer's job (W2), not this module's.

export const TELL_SKEWED = 'skewed';    // one tail is much longer than the other
export const TELL_GAP = 'gap';          // the values clump, with empty space between
export const TELL_OUTLIER = 'outlier';  // at least one value sits far from the rest
export const TELL_SPREAD = 'spread';    // spread is large relative to the centre

/** Every tell name, in the order `tells()` reports them. Frozen so a consumer
 *  cannot reorder the shared vocabulary for everyone else. */
export const TELL_NAMES = Object.freeze([TELL_SKEWED, TELL_GAP, TELL_OUTLIER, TELL_SPREAD]);

// --- numeric coercion ------------------------------------------------------

/**
 * The non-blank, finite values of a column, as numbers.
 *
 * CODAP hands back cell values as strings as often as numbers, and blanks as
 * `''`, `null` or a missing key. `+''` and `+null` are both `0`, and a column
 * of blanks read that way looks like a column of zeroes with a perfect
 * distribution — so blanks are rejected BEFORE coercion, never after.
 * Booleans are rejected too: `+true === 1` is a coincidence, not a measurement.
 *
 * @param {Array<*>} values Raw cell values.
 * @returns {number[]} Finite numbers only, in input order.
 */
function finiteNumbers(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const v of values) {
    if (typeof v === 'number') { if (Number.isFinite(v)) out.push(v); continue; }
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '') continue;
      const n = Number(t);
      if (Number.isFinite(n)) out.push(n);
    }
    // null, undefined, boolean, object, NaN, Infinity: not a measurement.
  }
  return out;
}

const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Population standard deviation — the sample sd would make every threshold
 *  above n-dependent in a second, hidden way. */
function sdOf(a, m) {
  return Math.sqrt(meanOf(a.map((v) => (v - m) ** 2)));
}

function medianOf(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- the shape ------------------------------------------------------------

/**
 * Measure one numeric column.
 *
 * Every statistic is `null` — never `NaN`, never a plausible-looking zero —
 * when it is undefined for the input: too few values, or a constant column
 * (sd 0) whose skew and z-scores are 0/0, or an all-zero column whose cv has
 * no magnitude to divide by. Consumers must test `!= null`, exactly as
 * `web/src/wonderings/contracts.js` says, because `0` is a legitimate skew.
 *
 * `cv` is `sd / mean(|x|)` and is therefore never negative and never
 * `Infinity`; a mean of exactly 0 is an ordinary column here, not a division by
 * zero. See WHAT `cv` IS MEASURED AGAINST in the file header. `contracts.js`
 * describes the field as "sd / mean … meaningless when mean is near 0", which
 * was written before the 2026-08-28 fix and is stale; the two agree on every
 * one-sided column, which is every column the fixture contains.
 *
 * `gapFrac` and `gapAt` are the exception worth naming: a constant column has
 * range 0, and its largest gap is reported as `gapFrac: 0, gapAt: null` rather
 * than as the 0/0 it arithmetically is. A column with no space between its
 * values genuinely has no gap.
 *
 * @param {Array<*>} values Raw cell values for one attribute, blanks included.
 * @returns {{n: number, mean: (number|null), sd: (number|null),
 *            median: (number|null), skew: (number|null), gapFrac: (number|null),
 *            gapAt: (number[]|null), maxAbsZ: (number|null), cv: (number|null)}}
 *   `n` is the count of non-blank finite values. `gapAt` is the `[lo, hi]` pair
 *   of sorted values that brackets the largest gap — provenance for the "Dot's
 *   mind" panel, and the reason a gap tell can be shown to be about real
 *   numbers rather than about an index.
 */
export function shape(values) {
  const v = finiteNumbers(values);
  const n = v.length;
  const empty = {
    n, mean: null, sd: null, median: null, skew: null,
    gapFrac: null, gapAt: null, maxAbsZ: null, cv: null,
  };
  if (n === 0) return empty;

  const mean = meanOf(v);
  const sd = sdOf(v, mean);
  const sorted = [...v].sort((a, b) => a - b);   // copy: never reorder the caller's array
  const median = medianOf(sorted);

  // Largest gap as a fraction of range. Defined for n >= 1 whatever the sd is:
  // a single value, like a constant column, has a range of 0 and no gap.
  const range = sorted[n - 1] - sorted[0];
  let widest = 0;
  let gapAt = null;
  for (let i = 1; i < n; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > widest) { widest = g; gapAt = [sorted[i - 1], sorted[i]]; }
  }
  const gapFrac = range === 0 ? 0 : widest / range;
  if (range === 0) gapAt = null;

  // Everything below is a moment about the mean, and dividing by sd = 0 is how
  // a constant column turns into NaN and a NaN turns into a false tell.
  const skew = sd === 0 ? null : meanOf(v.map((x) => ((x - mean) / sd) ** 3));
  const maxAbsZ = sd === 0 ? null : Math.max(...v.map((x) => Math.abs((x - mean) / sd)));
  // Spread relative to the typical MAGNITUDE, not to the signed mean. See the
  // WHAT `cv` IS MEASURED AGAINST note in the file header for why.
  const meanAbs = meanOf(v.map(Math.abs));
  const cv = meanAbs === 0 ? null : sd / meanAbs;

  return { n, mean, sd, median, skew, gapFrac, gapAt, maxAbsZ, cv };
}

// --- the tells ------------------------------------------------------------

/**
 * Which tells a already-measured shape earns.
 *
 * Separate from `tells()` because by the time the wondering families run, the
 * numbers live on an `Attr` (`contracts.js`) and the raw column is long gone —
 * an `Attr` carries `n`, `skew`, `gapFrac`, `maxAbsZ` and `cv` under exactly
 * these names, so a family can pass one straight in.
 *
 * A missing or non-finite field earns nothing. That is the load-bearing
 * behaviour: `null > 1` is `false` in JavaScript but `null > -1` is `true`, and
 * a negative-threshold comparison against a null would fire a tell on a column
 * that was never measured.
 *
 * @param {{n?: number, skew?: (number|null), gapFrac?: (number|null),
 *          maxAbsZ?: (number|null), cv?: (number|null)}} s
 * @returns {string[]} Tell names, in `TELL_NAMES` order. `[]` is normal.
 */
export function tellsFromShape(s) {
  if (s == null || typeof s !== 'object') return [];
  if (!Number.isFinite(s.n) || s.n < MIN_TELL_CASES) return [];

  const num = (x) => (Number.isFinite(x) ? x : null);
  const skew = num(s.skew);
  const gapFrac = num(s.gapFrac);
  const maxAbsZ = num(s.maxAbsZ);
  const cv = num(s.cv);

  const out = [];
  if (skew !== null && Math.abs(skew) > SKEW_ABS_FLOOR) out.push(TELL_SKEWED);
  if (gapFrac !== null && gapFrac > GAP_FRAC_FLOOR) out.push(TELL_GAP);
  if (maxAbsZ !== null && maxAbsZ > MAX_ABS_Z_FLOOR) out.push(TELL_OUTLIER);
  // `Math.abs`, like the skew line, and for the same reason: a tell that can
  // tell a column from its own reflection is not a tell about shape. `shape()`
  // never returns a negative cv, so this is belt and braces — but a family that
  // computed sd/mean for itself would hand one in, and before 2026-08-28
  // `web/src/wonderings/index.js` did exactly that via `shape`.
  if (cv !== null && Math.abs(cv) > CV_FLOOR) out.push(TELL_SPREAD);
  return out;
}

/**
 * Which tells a raw column earns. The one call the wondering families need.
 *
 * @param {Array<*>} values Raw cell values, blanks included.
 * @returns {string[]} Tell names in `TELL_NAMES` order; `[]` when the column
 *   has no shape worth a question. On Mammals, `Sleep` returns `[]`, and that
 *   refusal is the module working, not the module failing.
 */
export function tells(values) {
  return tellsFromShape(shape(values));
}
