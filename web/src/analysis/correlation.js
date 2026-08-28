/**
 * correlation.js — pairwise-complete Pearson, Spearman, and the n-dependent
 * significance floor. Pure arithmetic: no DOM, no clock, no randomness, no I/O.
 *
 * WHY THIS FILE EXISTS — the bug it retires.
 *
 * `web/src/insight.js` (lines 34-75, unchanged since 2026-07-07) builds each
 * attribute's value list by filtering blanks INDEPENDENTLY per attribute, then
 * correlates the two lists BY PARALLEL INDEX:
 *
 *     const raw  = rows.map((r) => r[a]).filter((v) => v !== '' && v != null);
 *     ...
 *     const n = Math.min(A.values.length, B.values.length);
 *     for (let k = 0; k < n; k++) sxy += (A.values[k] - A.mean) * (B.values[k] - B.mean);
 *
 * A single blank cell shortens one list and shifts every value after it up by
 * one row, so from that row on, each x is paired with the WRONG y. Measured
 * 2026-08-28 with `docs/verification/wonderings/corr-pairing-bug.mjs`: an
 * 18-case dataset in which Mass is exactly 10 x Height — a perfect relationship,
 * true r = 1.00 — reports **r = 0.29** once four cells are blank in four
 * different rows. Two of those blanks are in Height and two in Mass, which is an
 * utterly ordinary classroom dataset. This is a live defect corrupting
 * `wise-attend` today, and it is the reason no wondering may be built on
 * `insight.js`'s numbers.
 *
 * The fix is PAIRWISE-COMPLETE deletion: drop a case only when EITHER value is
 * missing, and drop it from both series at once, so index k always refers to one
 * case. Reference implementation:
 * `docs/verification/wonderings/observation-feasibility.mjs::corr`. On the same
 * 18-case/4-blank regression this module returns r = 1.00 over n = 14.
 *
 * WHY SPEARMAN IS HERE TOO. Mammals is savagely skewed — `Mass` runs 0.023 to
 * 6654 with max|z| well past 2.5 (measured 2026-08-28,
 * `docs/verification/wonderings/against-real-fixture.mjs`) — and Pearson
 * understates any relationship that is monotone but curved. The gap
 * |rho| - |r| is the curvature tell the `relationship` family reads. Ties are
 * broken with MIDRANKS (the average of the ranks a tied block spans), not with
 * the first-index ranks the exploratory scripts used: Mammals has genuine ties
 * (`Mass` 0.023 twice, `Speed` 40 four times) and first-index ranking invents an
 * ordering the data does not contain. Midranks are the textbook definition;
 * rho values in the older exploratory scripts may differ slightly for this
 * reason, and the midrank value is the correct one.
 *
 * WHY THE FLOOR IS COMPUTED AND NOT TABULATED. `insight.js` uses a flat
 * `STRONG_R = 0.5`. At n = 12 — the size of the fixture the tutorials ship, and
 * a realistic classroom size — the two-tailed 5% critical value of r is 0.576,
 * so `STRONG_R` sits BELOW the floor and calls noise a finding. A single
 * hardcoded 0.576 would be just as wrong the moment a student has 8 cases
 * (floor 0.707) or 100 (floor 0.195). So the floor is derived, per n, from the
 * same distribution a t-table is printed from:
 *
 *     t = r * sqrt(df / (1 - r^2)),  df = n - 2
 *     two-tailed p = I_{df/(df + t^2)}(df/2, 1/2) = I_{1 - r^2}(df/2, 1/2)
 *
 * (the identity df/(df + t^2) = 1 - r^2 falls straight out of the substitution),
 * where I is the regularized incomplete beta function, implemented below by
 * Lanczos log-gamma and a Lentz continued fraction. `significanceFloor(n)`
 * inverts that relation numerically. It reproduces the published table:
 * df 3 -> 0.878, df 5 -> 0.754, df 10 -> 0.576, df 20 -> 0.423, df 100 -> 0.195,
 * all asserted in `docs/verification/wonderings/t-correlation.mjs`.
 *
 * A NOTE ON WHAT IS NOT ROUNDED. `r` and `rho` are returned at full double
 * precision. The exploratory scripts rounded to 2 dp; a consumer that wants that
 * can round. Rounding here would destroy the curvature gap, which is routinely
 * a few hundredths, and no wondering text ever shows a statistic anyway
 * (docs/CHARACTER.md voice rule) — the numbers exist to rank and to gate.
 */

/** Two-tailed significance level, unitless probability. 0.05 is the
 *  convention the printed r-tables this module must reproduce are built on. */
const ALPHA_TWO_TAILED = 0.05;

/** Cases, count. Fewer than 4 complete pairs cannot support a claim about a
 *  relationship at any effect size (df = 2 needs |r| >= 0.950), and 3 points
 *  put r within a rounding error of 1 by accident. Matches the floor used by
 *  the reference implementation in observation-feasibility.mjs. */
const MIN_PAIRWISE_N = 4;

/** Degrees of freedom, count. df = n - 2; below 1 the t distribution the floor
 *  is derived from is not defined, so no p-value exists. */
const MIN_DF = 1;

/** Iterations, count. Lentz's method for the beta continued fraction converges
 *  in well under 100 for the a, b, x this module ever produces; 300 is a
 *  generous ceiling that keeps a pathological input from spinning. */
const BETACF_MAX_ITERATIONS = 300;

/** Relative tolerance, unitless. 3e-16 is about double-precision epsilon —
 *  iterate until the correction stops changing the answer at all. */
const BETACF_EPSILON = 3e-16;

/** Floor on |denominator|, unitless. Guards a division by a value that
 *  underflowed to exactly 0 mid-continued-fraction (Numerical Recipes' FPMIN). */
const BETACF_TINY = 1e-300;

/** Iterations, count. Bisection on |r| in [0, 1); each step halves the bracket,
 *  so 80 steps take a width-1 interval to about 1e-24 — far below double
 *  precision, i.e. the returned floor is exact to the last representable bit. */
const FLOOR_BISECTION_ITERATIONS = 80;

/** Lanczos parameter g, unitless. The classic g = 7 / 9-coefficient set, good
 *  to about 15 significant digits — more than the beta function needs here. */
const LANCZOS_G = 7;

/** Lanczos series coefficients, unitless. Fixed constants of the g = 7
 *  approximation; they are not tunable and mean nothing individually. */
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/**
 * Coerce one cell to a finite number, or `null` if it is not data.
 *
 * Stricter than `+v` on purpose. `Number('')` is 0 and `Number('  ')` is 0, so
 * a blank cell silently becomes a real observation at the origin; `Number(true)`
 * is 1, so a checkbox column becomes a measure. Every one of those is a case
 * that must be DROPPED from a pairwise-complete correlation, not counted.
 */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;                       // booleans, dates, objects: not measures
}

/**
 * The cases where BOTH attributes are present, as two aligned series.
 *
 * This one function is the whole bug fix: a case is dropped from BOTH series or
 * from neither, so `xs[k]` and `ys[k]` are always the same case.
 *
 * @param {Array<Object>} rows
 * @param {string} x
 * @param {string} y
 * @returns {{xs: number[], ys: number[], n: number}}
 */
export function pairwiseComplete(rows, x, y) {
  const xs = [];
  const ys = [];
  if (!Array.isArray(rows)) return { xs, ys, n: 0 };
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const xv = toNumber(row[x]);
    if (xv === null) continue;
    const yv = toNumber(row[y]);
    if (yv === null) continue;
    xs.push(xv);
    ys.push(yv);
  }
  return { xs, ys, n: xs.length };
}

function meanOf(values) {
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

/**
 * Pearson r over two already-aligned series. Computed as
 * Sxy / sqrt(Sxx * Syy) rather than as a ratio of standard deviations, so the
 * population-vs-sample choice cannot get out of step between numerator and
 * denominator. Returns `null` when either series has zero variance.
 */
function pearsonOfSeries(xs, ys) {
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < xs.length; k++) {
    const dx = xs[k] - mx;
    const dy = ys[k] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;      // a constant column has no shape
  const r = sxy / Math.sqrt(sxx * syy);
  // Accumulated rounding can push a perfect relationship a hair past +-1.
  if (r > 1) return 1;
  if (r < -1) return -1;
  return r;
}

/**
 * Pairwise-complete Pearson correlation.
 *
 * @param {Array<Object>} rows Case list; blanks may be '', null or undefined.
 * @param {string} x Attribute name.
 * @param {string} y Attribute name.
 * @returns {{r: number, n: number}|null} `null` when fewer than
 *   MIN_PAIRWISE_N complete cases exist, or when either series is constant.
 */
export function pearson(rows, x, y) {
  const { xs, ys, n } = pairwiseComplete(rows, x, y);
  if (n < MIN_PAIRWISE_N) return null;
  const r = pearsonOfSeries(xs, ys);
  if (r === null) return null;
  return { r, n };
}

/**
 * Midranks of a series: tied values all take the average of the ranks their
 * block spans, so `[10, 20, 20, 30]` ranks as `[1, 2.5, 2.5, 4]`. Ranking by
 * first index instead would claim one of the 20s precedes the other, which the
 * data does not say.
 */
function midranks(values) {
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => (a.v - b.v) || (a.i - b.i));
  const ranks = new Array(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start + 1;
    while (end < order.length && order[end].v === order[start].v) end++;
    // Ranks are 1-based, so positions start..end-1 span ranks start+1..end.
    const shared = (start + 1 + end) / 2;
    for (let k = start; k < end; k++) ranks[order[k].i] = shared;
    start = end;
  }
  return ranks;
}

/**
 * Pairwise-complete Spearman rank correlation, tie-corrected.
 *
 * Ranks are taken AFTER incomplete cases are dropped — ranking first would let
 * a case that is about to be discarded shift every rank above it.
 *
 * @param {Array<Object>} rows
 * @param {string} x
 * @param {string} y
 * @returns {{rho: number, n: number}|null} `null` under the same conditions as
 *   `pearson`, plus when one series is entirely tied (all ranks equal).
 */
export function spearman(rows, x, y) {
  const { xs, ys, n } = pairwiseComplete(rows, x, y);
  if (n < MIN_PAIRWISE_N) return null;
  const rho = pearsonOfSeries(midranks(xs), midranks(ys));
  if (rho === null) return null;
  return { rho, n };
}

/** Lanczos log-gamma. Only ever called with a positive argument here. */
function logGamma(z) {
  let x = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    x += LANCZOS_COEFFICIENTS[i] / (z + i - 1);
  }
  const t = z + LANCZOS_G - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x);
}

/** Continued fraction for the incomplete beta, by the modified Lentz method. */
function betaContinuedFraction(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < BETACF_TINY) d = BETACF_TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= BETACF_MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < BETACF_TINY) d = BETACF_TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < BETACF_TINY) c = BETACF_TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < BETACF_TINY) d = BETACF_TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < BETACF_TINY) c = BETACF_TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < BETACF_EPSILON) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b), 0..1. */
function incompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-tailed p-value for a correlation of `r` observed over `n` complete cases,
 * under the null hypothesis that the true correlation is 0.
 *
 * Exact (up to the beta function's ~1e-15), not a table lookup:
 * p = I_{1 - r^2}(df/2, 1/2) with df = n - 2. See the file header for the
 * derivation from t = r * sqrt(df / (1 - r^2)).
 *
 * This is a RANKING AND GATING quantity. It is never shown to a student, and it
 * is not a claim about the world — 12 mammals are not a random sample of
 * anything. It answers only "is this shape stronger than this little data would
 * routinely throw up by chance?".
 *
 * @param {number} r
 * @param {number} n
 * @returns {number|null} p in 0..1, or `null` if the inputs cannot support one.
 */
export function pValue(r, n) {
  if (!Number.isFinite(r) || !Number.isFinite(n)) return null;
  if (Math.abs(r) > 1) return null;
  const df = n - 2;
  if (df < MIN_DF) return null;
  const rr = Math.min(1, Math.abs(r));
  return incompleteBeta(df / 2, 0.5, 1 - rr * rr);
}

/**
 * The smallest |r| that clears the two-tailed 5% floor at `n` complete cases —
 * the critical value a printed r-table would give, computed rather than copied.
 *
 * Found by bisection because p is strictly decreasing in |r| on [0, 1]:
 * p(0) = 1 and p(1) = 0, so the root is bracketed by construction.
 *
 * @param {number} n
 * @returns {number|null} `null` when n is too small for a p-value to exist.
 */
export function significanceFloor(n) {
  if (!Number.isFinite(n) || n - 2 < MIN_DF) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < FLOOR_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (pValue(mid, n) > ALPHA_TWO_TAILED) lo = mid; else hi = mid;
  }
  return hi;
}

/**
 * Does this correlation clear the floor? Sign-blind: a strong negative
 * relationship is exactly as interesting as a strong positive one.
 *
 * Equivalent to `Math.abs(r) >= significanceFloor(n)`, but evaluated straight
 * from the p-value so no bisection tolerance sits between the two.
 *
 * @param {number} r
 * @param {number} n Complete pairs, NOT the dataset's case count.
 * @returns {boolean} `false` — never `null` — when the inputs cannot be judged,
 *   because "cannot be judged" and "not earned" have the same consequence: no
 *   wondering.
 */
export function qualifies(r, n) {
  if (!Number.isFinite(n) || n < MIN_PAIRWISE_N) return false;
  const p = pValue(r, n);
  if (p === null) return false;
  return p <= ALPHA_TWO_TAILED;
}

/**
 * Every unordered pair of the named numeric attributes, as `DatasetModel.pairs`
 * (see `web/src/wonderings/contracts.js`).
 *
 * Pairs whose correlation is undefined — too few complete cases, or a constant
 * column — are OMITTED rather than emitted with `qualifies: false`, because
 * there is no `r` to put in the record. Order is deterministic: input order,
 * i < j, so the same dataset always yields the same array.
 *
 * `qualifies` here is the PEARSON gate only, `|r| >= significanceFloor(n)`,
 * exactly as `contracts.js` defines the field ("|r| >= 0.576 at n = 12") and
 * exactly as it was measured on 2026-08-28: 2 of the 10 Mammals pairs clear it,
 * Height x Mass (r = 0.587) and Height x Sleep (r = -0.740). The relationship
 * family's stated gate is broader — "|r| OR |rho| clears the n-floor", which 5
 * of the 10 pairs clear, because Mammals is skewed enough that Pearson misses
 * monotone relationships Spearman sees (Mass x Sleep: r = -0.467, rho = -0.775).
 * That broader gate is deliberately NOT baked in here, because a family reading
 * `qualifies` must get what the frozen contract promised. A family that wants
 * the OR rule computes it in one line from fields already in the record:
 * `p.qualifies || qualifies(p.rho, p.n)` — `qualifies` is a function of any
 * correlation coefficient and n, not of Pearson specifically.
 *
 * @param {Array<Object>} rows
 * @param {string[]} numericNames Names of the attributes with kind 'numeric'.
 *   Identifiers and categoricals must already have been excluded by the caller.
 * @returns {Array<{a: string, b: string, r: number, rho: number, n: number, qualifies: boolean}>}
 */
export function correlatePairs(rows, numericNames) {
  const out = [];
  if (!Array.isArray(rows) || !Array.isArray(numericNames)) return out;
  for (let i = 0; i < numericNames.length; i++) {
    for (let j = i + 1; j < numericNames.length; j++) {
      const a = numericNames[i];
      const b = numericNames[j];
      const p = pearson(rows, a, b);
      if (p === null) continue;
      const s = spearman(rows, a, b);
      out.push({
        a,
        b,
        r: p.r,
        // Unreachable in practice: Pearson is defined only when both series
        // vary, and a series that varies cannot have constant midranks.
        rho: s === null ? p.r : s.rho,
        n: p.n,
        qualifies: qualifies(p.r, p.n),
      });
    }
  }
  return out;
}
