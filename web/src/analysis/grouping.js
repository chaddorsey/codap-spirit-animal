/**
 * grouping.js — does a categorical attribute actually separate a numeric one,
 * and is it the kind of column a student should be invited to group by at all?
 *
 * WHY THIS FILE EXISTS. The comparison, grouping and filtering wondering
 * families all rest on one question — "do these groups differ?" — and eta²
 * answers it badly on its own. Measured 2026-08-28 against the 12-case Mammals
 * fixture (`web/src/demo/fixture.js`), reproducible from
 * `docs/verification/wonderings/against-real-fixture.mjs`:
 *
 *   - `Mammal` scores **eta² = 1.00 against every numeric attribute** — Mass,
 *     Sleep, Speed, all of them. That is not a finding, it is a tautology:
 *     `Mammal` has cardinality 12 over 12 cases, so every "group" is one animal
 *     and the between-group variance IS the total variance. A system that
 *     ranked separations by eta² alone would rank the meaningless one first,
 *     every time, on every dataset with a name column — i.e. nearly all of them.
 *   - `Order` has **7 groups over 12 cases with a smallest group of 1**. Its
 *     eta² is respectable and equally worthless: a "mean" over one animal is
 *     one animal wearing a hat, and eta² rises mechanically with group count.
 *   - `Diet` (added in wave W0) is the fixture's one honest categorical:
 *     3 groups sized 5 / 4 / 3, and eta² ≈ 0.82 against `Sleep`.
 *
 * So this module is three rules, not one statistic:
 *
 *   1. IDENTIFIER EXCLUSION — `cardinality === caseCount` means the column
 *      names the cases rather than describing them. Excluded EVERYWHERE, and
 *      excluded BEFORE the group-count ceiling, so the refusal is attributed to
 *      the right cause in the provenance panel.
 *   2. GROUP-COUNT CEILING — more groups than `GROUP_COUNT_CEILING` cannot be
 *      compared honestly at these case counts.
 *   3. MINIMUM GROUP SIZE — a group below `MIN_GROUP_SIZE` has no mean worth
 *      speaking about.
 *
 * Only after all three does the eta² floor apply. `separates()` therefore
 * always reports the statistic it computed alongside the reason it refused:
 * `Mammal` comes back as `{ eta2: 1, qualifies: false, reason: 'identifier' }`,
 * which is the whole point — the guard is what saves us, not the number.
 *
 * PURITY. No browser globals, no clock, no randomness. Same rows in, same
 * numbers out, forever; that is what makes the wondering corpus reproducible.
 *
 * ROUNDING. `eta2()` returns FULL PRECISION and is compared to `ETA2_FLOOR`
 * unrounded. Rounding first (as the exploratory scripts in
 * `docs/verification/wonderings/` do for display) would silently move the gate:
 * 0.2951 displays as 0.30 and would then pass a 0.30 floor. Callers that want
 * two decimals round at the point of display.
 *
 * Shapes: see `web/src/wonderings/contracts.js` (`Attr.role`,
 * `DatasetModel.separations`). Nothing is imported from it — it is typedefs
 * only, by design.
 */

// --- thresholds -------------------------------------------------------------

/** groups; above this, group means cannot be compared honestly at 12–100 cases. */
export const GROUP_COUNT_CEILING = 4;

/** cases per group; below 3 a "group mean" is one or two cases wearing a hat. */
export const MIN_GROUP_SIZE = 3;

/** unitless 0..1; below this the groups visibly overlap and "they differ" is a lie. */
export const ETA2_FLOOR = 0.30;

/** groups; one group is not a comparison, so eta² needs at least two. */
export const MIN_GROUPS = 2;

/** cases with BOTH values present; below 4, between-group variance is noise, not signal. */
export const MIN_SEPARATION_CASES = 4;

/**
 * cases; a numeric column is only read as a serial key at or above this length.
 * Below it, "1, 2, 3" is as likely to be a measurement as an index.
 */
export const MIN_SERIAL_KEY_CASES = 4;

// --- value helpers ----------------------------------------------------------

/** CODAP delivers empty cells as '', null or undefined; whitespace counts as empty. */
function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * Number or null. Deliberately stricter than `+v`: `+true` is 1 and `+[]` is 0,
 * and a boolean or array silently becoming a measurement is exactly the kind of
 * bug that produces a confident wondering about nothing.
 */
function toNumber(v) {
  if (v == null || typeof v === 'boolean' || typeof v === 'object') return null;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/**
 * A numeric column that is a case index in disguise: every value a distinct
 * integer, one per case, with no holes, IN ROW ORDER (1..n, or 1001..1012).
 *
 * Rejected alternative, recorded so it is not re-proposed: applying the bare
 * `cardinality === caseCount` rule to numerics as well. It would have called
 * `Mass` an identifier the moment two mammals stopped sharing a value, and
 * excluding a real measurement from every correlation and distribution
 * wondering is a far worse error than tolerating an index column.
 *
 * The ascending-order clause was added 2026-08-28 after `t-grouping.mjs`
 * caught the rule without it misclassifying a 6-case column of values
 * 1, 4, 5, 2, 3, 6 — a perfectly ordinary small-integer MEASUREMENT that
 * happens to be a permutation of 1..6 — as an identifier. The asymmetry is
 * deliberate: a missed index column merely gets treated as a measure, while a
 * missed measure is silently excluded from every wondering family there is.
 * A CaseID re-sorted out of ascending order is therefore read as a measure,
 * and that is the cheaper of the two mistakes.
 */
function isSerialKey(nums, caseCount) {
  if (nums.length !== caseCount || caseCount < MIN_SERIAL_KEY_CASES) return false;
  if (!nums.every(Number.isInteger)) return false;
  // Consecutive-ascending already implies "distinct, one per case, no holes".
  for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) return false;
  return true;
}

/** Column names in first-seen order — deterministic, unlike `Object.keys` over a merge. */
export function columnNames(rows) {
  const seen = [];
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object') continue;
    for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k);
  }
  return seen;
}

// --- role -------------------------------------------------------------------

/**
 * What is this column FOR: `'identifier'` | `'category'` | `'measure'`?
 *
 * `attrName` is accepted for signature stability and diagnostics and is
 * DELIBERATELY not used as a heuristic. Name-sniffing (`/id$/`, `/name/`) was
 * rejected: it is language-bound, it silently mis-fires on real attributes
 * ("Nameplate Rating", "Madrid"), and the structural rule below already catches
 * the case that matters.
 *
 * @param {string} attrName
 * @param {Array<*>} values      One entry per case, blanks included.
 * @param {number} [caseCount]   Total cases; defaults to the number of non-blank values.
 * @returns {'identifier'|'category'|'measure'}
 */
export function role(attrName, values, caseCount) {
  const present = (values ?? []).filter((v) => !isBlank(v));
  const total = Number.isFinite(caseCount) && caseCount > 0 ? caseCount : present.length;

  // No evidence at all. 'category' is the safe answer: it can never be plotted
  // as a measure, and every group guard below refuses it on group count anyway.
  if (present.length === 0) return 'category';

  const nums = present.map(toNumber);
  if (nums.every((n) => n !== null)) {
    return isSerialKey(nums, total) ? 'identifier' : 'measure';
  }

  const distinct = new Set(present.map((v) => String(v))).size;
  return distinct === total ? 'identifier' : 'category';
}

// --- group shape ------------------------------------------------------------

/** Rows where the category is present AND the numeric parses, as `{ g, v }`. */
function usablePairs(rows, cat, num) {
  const out = [];
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object') continue;
    if (isBlank(r[cat])) continue;
    const v = toNumber(r[num]);
    if (v === null) continue;
    out.push({ g: String(r[cat]), v });
  }
  return out;
}

/**
 * Cases per category, keyed by the category string, in first-seen order.
 * When `num` is given, only cases whose numeric value is present are counted —
 * a group whose measurements are all blank contributes nothing to a comparison.
 */
export function groupSizes(rows, cat, num) {
  const sizes = {};
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object') continue;
    if (isBlank(r[cat])) continue;
    if (num != null && toNumber(r[num]) === null) continue;
    const g = String(r[cat]);
    sizes[g] = (sizes[g] ?? 0) + 1;
  }
  return sizes;
}

/** Distinct non-blank values of a column. */
export function cardinality(rows, cat) {
  const seen = new Set();
  for (const r of rows ?? []) {
    if (!r || typeof r !== 'object') continue;
    if (!isBlank(r[cat])) seen.add(String(r[cat]));
  }
  return seen.size;
}

// --- eta² -------------------------------------------------------------------

/**
 * eta² = between-group sum of squares / total sum of squares, 0..1: the share
 * of a numeric's variation that knowing the group explains.
 *
 * Returns `null` when there is not enough paired data to mean anything
 * (< `MIN_SEPARATION_CASES` complete cases, or fewer than `MIN_GROUPS` groups),
 * which is deliberately distinct from `0` — "no answer" and "no separation" are
 * different claims. Returns `0` when the numeric has no variance at all: there
 * is nothing for the grouping to explain.
 *
 * Full precision, not rounded — see the ROUNDING note in the file header.
 *
 * @param {Array<Object>} rows
 * @param {string} cat  Categorical attribute name.
 * @param {string} num  Numeric attribute name.
 * @returns {number|null}
 */
export function eta2(rows, cat, num) {
  const pairs = usablePairs(rows, cat, num);
  if (pairs.length < MIN_SEPARATION_CASES) return null;

  const byGroup = new Map();
  for (const p of pairs) {
    if (!byGroup.has(p.g)) byGroup.set(p.g, []);
    byGroup.get(p.g).push(p.v);
  }
  if (byGroup.size < MIN_GROUPS) return null;

  const grand = mean(pairs.map((p) => p.v));
  const total = pairs.reduce((acc, p) => acc + (p.v - grand) ** 2, 0);
  if (total === 0) return 0;

  let between = 0;
  for (const vals of byGroup.values()) between += vals.length * (mean(vals) - grand) ** 2;
  return between / total;
}

// --- the gate ---------------------------------------------------------------

/**
 * @typedef {Object} Separation
 * @property {string} cat
 * @property {string} num
 * @property {number} eta2           0..1, full precision. 0 when undefined.
 * @property {number} groups         Groups among the complete cases.
 * @property {number} smallestGroup  0 when there are no complete cases.
 * @property {Object.<string, number>} groupSizes
 * @property {number} n              Complete cases (both values present).
 * @property {boolean} qualifies     True only when every guard AND the eta² floor pass.
 * @property {string|null} reason    Why it was refused; `null` when it qualifies.
 */

/**
 * Apply the guards. `reason` is one of:
 *   'identifier'       — `cardinality === caseCount`; the column names cases.
 *   'not-a-category'   — the grouping column reads as a measure.
 *   'not-a-measure'    — the numeric column does not read as a measure.
 *   'insufficient-data'— too few complete cases, or fewer than two groups.
 *   'too-many-groups'  — above `GROUP_COUNT_CEILING`.
 *   'group-too-small'  — some group below `MIN_GROUP_SIZE`.
 *   'weak-separation'  — guards passed, eta² below `ETA2_FLOOR`.
 *
 * The order is load-bearing. `Mammal` fails the identifier rule AND the group
 * ceiling; it must be reported as `'identifier'`, because "12 groups is too
 * many" invites the student to try a coarser grouping of a column that should
 * never be grouped at all.
 *
 * @param {Array<Object>} rows
 * @param {string} cat
 * @param {string} num
 * @param {{roles?: Object.<string,'identifier'|'category'|'measure'>}} [options]
 *   `roles` overrides inference — pass CODAP's declared kinds when they are
 *   available, since a column of zip codes is categorical no matter how it
 *   parses.
 * @returns {Separation}
 */
export function separates(rows, cat, num, options = {}) {
  const all = Array.isArray(rows) ? rows : [];
  const caseCount = all.length;
  const overrides = options.roles ?? {};
  const catRole = overrides[cat] ?? role(cat, all.map((r) => r?.[cat]), caseCount);
  const numRole = overrides[num] ?? role(num, all.map((r) => r?.[num]), caseCount);

  const sizes = groupSizes(all, cat, num);
  const counts = Object.values(sizes);
  const groups = counts.length;
  const n = counts.reduce((a, b) => a + b, 0);
  const value = eta2(all, cat, num);

  const base = {
    cat, num, eta2: value ?? 0, groups,
    smallestGroup: groups ? Math.min(...counts) : 0,
    groupSizes: sizes, n, qualifies: false, reason: null,
  };
  const refuse = (reason) => ({ ...base, qualifies: false, reason });

  if (catRole === 'identifier') return refuse('identifier');
  if (catRole === 'measure') return refuse('not-a-category');
  if (numRole !== 'measure') return refuse('not-a-measure');
  if (value === null || groups < MIN_GROUPS) return refuse('insufficient-data');
  if (groups > GROUP_COUNT_CEILING) return refuse('too-many-groups');
  if (base.smallestGroup < MIN_GROUP_SIZE) return refuse('group-too-small');
  if (value < ETA2_FLOOR) return refuse('weak-separation');
  return { ...base, qualifies: true, reason: null };
}

/**
 * Every categorical × numeric combination, in a deterministic order, ready for
 * `DatasetModel.separations`. Names default to whatever `role()` concludes,
 * scanning columns in first-seen order; identifiers are never offered as
 * groupings, so they do not appear as `cat` at all.
 *
 * @param {Array<Object>} rows
 * @param {string[]} [catNames]
 * @param {string[]} [numNames]
 * @param {{roles?: Object.<string,'identifier'|'category'|'measure'>}} [options]
 * @returns {Separation[]}
 */
export function separations(rows, catNames, numNames, options = {}) {
  const all = Array.isArray(rows) ? rows : [];
  const overrides = options.roles ?? {};
  const roleOf = (name) =>
    overrides[name] ?? role(name, all.map((r) => r?.[name]), all.length);

  const names = columnNames(all);
  const cats = catNames ?? names.filter((nm) => roleOf(nm) === 'category');
  const nums = numNames ?? names.filter((nm) => roleOf(nm) === 'measure');

  const out = [];
  for (const c of cats) for (const nm of nums) out.push(separates(all, c, nm, options));
  return out;
}
