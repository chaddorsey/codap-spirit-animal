/**
 * t-distribution.mjs — the asserting test for `web/src/analysis/distribution.js`
 * (plan -002, wave W1, module B).
 *
 *   node docs/verification/wonderings/t-distribution.mjs
 *
 * WHAT THIS PROTECTS. The Distribution and Ordering wondering families need no
 * partner attribute and no scene, so they fire more often than any other pair,
 * and the only thing standing between them and a stream of empty questions is
 * this module's willingness to say NOTHING. On the shipping Mammals fixture,
 * `Mass` earns all four tells and `Sleep` earns none — and Sleep's refusal is
 * decided by 0.0017 of gap fraction. A rounding step, a `>=`, or a relaxed
 * threshold all look like tidying and all end with Dot asking what the
 * distribution of Sleep looks like.
 *
 * FIVE GROUPS OF ASSERTION:
 *   A. the module is pure and self-contained, and its thresholds are UNCHANGED
 *   B. the Mammals fixture measures exactly what plan -001 and -002 quote
 *   C. each of the four thresholds is INDEPENDENTLY wired, proven with cases
 *      that fire exactly one tell, plus the boundary at exactly 0.35
 *   D. degenerate columns (blank, constant, single, tiny) yield no NaN and no
 *      tell
 *   E. `tellsFromShape` behaves on the `Attr` shapes the families will hand it
 *
 * WHY A STUB CANNOT PASS. Four of the arrays below have exactly 12 values and
 * produce four different answers (`[]`, `['spread']`, `['skewed','gap',
 * 'outlier','spread']`, `['gap']`), so nothing keyed on length works. Each
 * threshold has a case that fires it alone and a near-miss case that does not,
 * so no constant, and no three-of-four subset, works. Sign is tested in both
 * directions, so `skew > 1` instead of `|skew| > 1` fails.
 *
 * Dependency-free, node builtins only. Measured 2026-08-28.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import {
  shape, tells, tellsFromShape,
  SKEW_ABS_FLOOR, GAP_FRAC_FLOOR, MAX_ABS_Z_FLOOR, CV_FLOOR, MIN_TELL_CASES,
  TELL_SKEWED, TELL_GAP, TELL_OUTLIER, TELL_SPREAD, TELL_NAMES,
} from '../../../web/src/analysis/distribution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = join(HERE, '..', '..', '..', 'web', 'src', 'analysis', 'distribution.js');

const EPS = 5e-4;   // tolerance for values quoted to 3 decimals in the plans

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(a === b, label,
  `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const near = (a, b, label) => ok(typeof a === 'number' && Math.abs(a - b) < EPS, label,
  `expected ~${b}, got ${JSON.stringify(a)}`);
const list = (got, want, label) => ok(
  Array.isArray(got) && got.length === want.length && want.every((w, i) => got[i] === w),
  label, `expected [${want.join(', ')}], got ${JSON.stringify(got)}`);

const col = (name) => MAMMALS.map((r) => r[name]);

// ---------------------------------------------------------------------------
// A. the module itself
// ---------------------------------------------------------------------------
console.log('\nA. distribution.js — purity, self-containment, thresholds');
console.log('='.repeat(76));

const src = readFileSync(MODULE, 'utf8');
// Judge the CODE, not the prose: the header talks about clocks and browsers.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

ok(!/\b(document|window|localStorage|sessionStorage|navigator|fetch|performance)\b/.test(code),
  'touches no browser global');
ok(!/\bDate\s*\.\s*now\b|\bnew\s+Date\b|\bMath\s*\.\s*random\b/.test(code),
  'uses no clock and no randomness');
ok(!/export\s+default/.test(src), 'has no default export');
ok(!/^\s*import\s/m.test(code), 'imports nothing — a standalone pure module');

// Module-level constants must be SCREAMING_SNAKE (the plan's house rule), and
// each must carry a comment: a threshold with no stated rationale is a magic
// number waiting to be "tuned".
const exportedConsts = [...src.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
ok(exportedConsts.length > 0 && exportedConsts.every((n) => /^[A-Z][A-Z0-9_]*$/.test(n)),
  `every exported constant is SCREAMING_SNAKE (${exportedConsts.length} of them)`,
  exportedConsts.join(', '));

// The thresholds are the design. Changing one silently rewrites which columns
// earn a wondering, so they are pinned here, in the test, on purpose.
eq(SKEW_ABS_FLOOR, 1, 'SKEW_ABS_FLOOR is 1');
eq(GAP_FRAC_FLOOR, 0.35, 'GAP_FRAC_FLOOR is 0.35');
eq(MAX_ABS_Z_FLOOR, 2.5, 'MAX_ABS_Z_FLOOR is 2.5');
eq(CV_FLOOR, 1.5, 'CV_FLOOR is 1.5');
eq(MIN_TELL_CASES, 4, 'MIN_TELL_CASES is 4');
list([...TELL_NAMES], [TELL_SKEWED, TELL_GAP, TELL_OUTLIER, TELL_SPREAD],
  'TELL_NAMES is the four tells in report order');
ok(Object.isFrozen(TELL_NAMES), 'TELL_NAMES is frozen — shared vocabulary, not a scratch array');
list([TELL_SKEWED, TELL_GAP, TELL_OUTLIER, TELL_SPREAD],
  ['skewed', 'gap', 'outlier', 'spread'],
  'the tell names are the strings the families switch on');

// Purity in behaviour, not just in source: sorting the caller's array in place
// would silently reorder the student's cases everywhere else.
const mine = col('Mass').slice();
const before = JSON.stringify(mine);
shape(mine);
eq(JSON.stringify(mine), before, 'shape() does not mutate its input');
eq(JSON.stringify(shape(col('Mass'))), JSON.stringify(shape(col('Mass'))),
  'shape() is deterministic — same input, same output');

// ---------------------------------------------------------------------------
// B. the Mammals fixture — the measurements plan -001 and -002 quote
// ---------------------------------------------------------------------------
console.log('\nB. Mammals — 4 of 5 numerics earn a tell, Sleep earns none');
console.log('='.repeat(76));

const mass = shape(col('Mass'));
eq(mass.n, 12, 'Mass has 12 non-blank values');
near(mass.mean, 931.5205, 'Mass mean is 931.52');
near(mass.sd, 1858.7595, 'Mass sd (population) is 1858.76');
eq(mass.median, 137.5, 'Mass median is 137.5 (the midpoint of 100 and 175)');
near(mass.skew, 2.4190, 'Mass skew g1 is 2.419');
near(mass.gapFrac, 0.6172, 'Mass largest gap is 61.7% of range');
near(mass.maxAbsZ, 3.0787, 'Mass max|z| is 3.079 — the African Elephant');
near(mass.cv, 1.9954, 'Mass cv is 1.995');
list(mass.gapAt, [2547, 6654], 'Mass gapAt brackets the empty stretch above the Asian Elephant');
list(tells(col('Mass')), [TELL_SKEWED, TELL_GAP, TELL_OUTLIER, TELL_SPREAD],
  'Mass earns ALL FOUR tells, in TELL_NAMES order');

const sleep = shape(col('Sleep'));
near(sleep.skew, 0.4756, 'Sleep skew g1 is 0.476');
near(sleep.gapFrac, 0.3483, 'Sleep largest gap is 34.83% of range');
near(sleep.maxAbsZ, 2.1087, 'Sleep max|z| is 2.109');
near(sleep.cv, 0.6152, 'Sleep cv is 0.615');
list(tells(col('Sleep')), [], 'Sleep earns ZERO tells — the decline the design rests on');

// THE ROUNDING TRAP. distribution-shape.mjs rounded gapFrac to two decimals,
// which turns Sleep's 0.3483 into exactly the floor. Rounding plus `>=` fires
// the gap tell on Sleep; rounding plus `>` survives by luck. Neither is
// allowed: the module must carry full precision.
ok(sleep.gapFrac < GAP_FRAC_FLOOR && Math.abs(sleep.gapFrac - 0.35) > 1e-6,
  'Sleep gapFrac is NOT rounded to 0.35 — full precision, decided by 0.0017',
  `got ${sleep.gapFrac}`);

const NUMERIC = MAMMALS_COLLECTION.attrs.filter((a) => a.type === 'numeric').map((a) => a.name);
eq(NUMERIC.length, 5, 'the fixture still declares 5 numeric attributes');
const earned = NUMERIC.filter((n) => tells(col(n)).length > 0);
list(earned, ['LifeSpan', 'Height', 'Mass', 'Speed'],
  'distribution earns on exactly 4 of the 5 numerics');

// Complementarity, per plan -001: the four earners do NOT all earn for the same
// reason. If they did, three of the four thresholds would be dead code.
list(tells(col('Height')), [TELL_SKEWED], 'Height earns SKEWED alone (g1 1.168)');
list(tells(col('LifeSpan')), [TELL_GAP], 'LifeSpan earns GAP alone (0.390 of range)');
list(tells(col('Speed')), [TELL_GAP], 'Speed earns GAP alone (0.358 of range)');
near(shape(col('Height')).skew, 1.1677, 'Height skew g1 is 1.168');
near(shape(col('LifeSpan')).gapFrac, 0.3896, 'LifeSpan gapFrac is 0.390');
near(shape(col('Speed')).gapFrac, 0.3582, 'Speed gapFrac is 0.358');

// A blank cell must not be read as a zero. `+''` and `+null` are both 0, and a
// column read that way looks like a beautifully distributed pile of zeroes.
const massWithBlanks = col('Mass').map((v, i) => (i % 4 === 3 ? ['', null, undefined][i % 3] : v));
eq(shape(massWithBlanks).n, 9, 'blanks are excluded from n, not coerced to 0');
ok(shape(massWithBlanks).mean > 100,
  'a column read with blanks-as-zero would have collapsed its mean',
  `mean ${shape(massWithBlanks).mean}`);
eq(shape(['1', '2', '3', '4']).n, 4, 'numeric strings are read as numbers (CODAP sends strings)');
near(shape(['1', '2', '3', '4']).mean, 2.5, 'numeric-string column means 2.5');

// ---------------------------------------------------------------------------
// C. each threshold, wired independently
// ---------------------------------------------------------------------------
console.log('\nC. the four thresholds — isolated, and at the boundary');
console.log('='.repeat(76));

// GAP, exactly at the floor. 35/100 is exactly the double 0.35, so this is a
// true equality test of `>` versus `>=`.
const AT_35 = [0, 10, 20, 30, 65, 75, 85, 100];
const OVER_35 = [0, 10, 20, 30, 66, 76, 86, 100];
eq(shape(AT_35).gapFrac, 0.35, 'the boundary case has gapFrac exactly 0.35');
list(tells(AT_35), [], 'gapFrac EXACTLY at the floor earns nothing (strict >)');
list(tells(OVER_35), [TELL_GAP], 'gapFrac 0.36 earns GAP and nothing else');

// SKEW, alone, in both signs. The mirrored array must earn the same tell:
// `skew > 1` instead of `Math.abs(skew) > 1` dies here.
const RIGHT_TAIL = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 11, 13, 16];
const LEFT_TAIL = RIGHT_TAIL.map((v) => -v);
const NEARLY_SKEWED = [1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10];
list(tells(RIGHT_TAIL), [TELL_SKEWED], 'a right tail (g1 1.038) earns SKEWED alone');
list(tells(LEFT_TAIL), [TELL_SKEWED], 'the mirrored left tail (g1 -1.038) earns SKEWED too');
ok(shape(LEFT_TAIL).skew < -1, 'the mirrored case really is negatively skewed',
  `skew ${shape(LEFT_TAIL).skew}`);
list(tells(NEARLY_SKEWED), [], 'g1 0.905 — just under the floor — earns nothing');

// OUTLIER, alone. Symmetric so skew stays 0; dense core so the gap stays under
// 0.35; centred far from 0 so cv stays small. The pair differs only in how many
// points sit in the tails, which is what moves max|z| across 2.5.
const CORE = [];
for (let x = 90; x <= 110; x++) CORE.push(x);
const ONE_EACH_END = [70, ...CORE, 130];
const TWO_EACH_END = [70, 70, ...CORE, 130, 130];
list(tells(ONE_EACH_END), [TELL_OUTLIER], 'max|z| 2.838 earns OUTLIER alone');
list(tells(TWO_EACH_END), [], 'max|z| 2.269 — under the floor — earns nothing');
ok(shape(ONE_EACH_END).gapFrac < GAP_FRAC_FLOOR
  && Math.abs(shape(ONE_EACH_END).skew) < SKEW_ABS_FLOOR
  && shape(ONE_EACH_END).cv < CV_FLOOR,
  'the outlier case really is isolated (no gap, no skew, no spread)',
  JSON.stringify(shape(ONE_EACH_END)));

// SPREAD, alone. Same values shifted by +1: the deviations, and therefore skew,
// gap and z, are identical — only the mean moves, so only cv changes. A module
// that fired SPREAD on sd rather than on sd/mean fails the second line.
const WIDE = [-3, -2, -1, 0, 0, 1, 1, 2, 2, 3, 4, 5];
const SHIFTED = WIDE.map((v) => v + 1);
list(tells(WIDE), [TELL_SPREAD], 'cv 2.273 earns SPREAD alone');
list(tells(SHIFTED), [], 'the same spread about a larger mean (cv 1.137) earns nothing');
near(shape(WIDE).sd, shape(SHIFTED).sd, 'the shifted case has an identical sd');

// A stub keyed on array length cannot survive these four: all 12 values.
eq(col('Mass').length, 12, 'Mass has 12 values');
eq(WIDE.length, 12, 'the spread-only case has 12 values');
eq(NEARLY_SKEWED.length, 12, 'the near-miss skew case has 12 values');
eq(col('Sleep').length, 12, 'Sleep has 12 values');
list([tells(col('Mass')).length, tells(WIDE).length, tells(NEARLY_SKEWED).length,
  tells(col('Sleep')).length], [4, 1, 0, 0],
  'those four 12-value columns earn 4, 1, 0 and 0 tells respectively');

// ---------------------------------------------------------------------------
// D. degenerate columns
// ---------------------------------------------------------------------------
console.log('\nD. degenerate columns — no NaN, no divide-by-zero, no tell');
console.log('='.repeat(76));

const noNaN = (s, label) => ok(
  Object.values(s).every((v) => v === null || (Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v))),
  label, JSON.stringify(s));

const emptyShape = shape([]);
eq(emptyShape.n, 0, 'an empty column has n 0');
noNaN(emptyShape, 'an empty column produces no NaN');
list(tells([]), [], 'an empty column earns nothing');

const allBlank = shape([null, '', undefined, '   ']);
eq(allBlank.n, 0, 'an all-blank column has n 0 — blanks are not zeroes');
noNaN(allBlank, 'an all-blank column produces no NaN');
list(tells([null, '', undefined, '   ']), [], 'an all-blank column earns nothing');

const constant = shape([5, 5, 5, 5, 5]);
eq(constant.n, 5, 'a constant column has n 5');
eq(constant.sd, 0, 'a constant column has sd 0');
eq(constant.skew, null, 'a constant column reports skew null, not NaN (0/0)');
eq(constant.maxAbsZ, null, 'a constant column reports max|z| null, not NaN');
eq(constant.gapFrac, 0, 'a constant column has gapFrac 0 — no space between values');
eq(constant.gapAt, null, 'a constant column has no gapAt');
noNaN(constant, 'a constant column produces no NaN');
list(tells([5, 5, 5, 5, 5]), [], 'a constant column earns nothing');

const single = shape([7]);
eq(single.n, 1, 'a single value has n 1');
noNaN(single, 'a single value produces no NaN');
list(tells([7]), [], 'a single value earns nothing');

// A mean of exactly 0 is a division by zero, and 1/0 is Infinity, not an error.
const zeroMean = shape([-2, -1, 0, 1, 2]);
eq(zeroMean.mean, 0, 'the zero-mean column really has mean 0');
eq(zeroMean.cv, null, 'cv is null when the mean is 0 — never Infinity');
list(tells([-2, -1, 0, 1, 2]), [], 'the zero-mean column earns nothing');

// Below MIN_TELL_CASES nothing fires, however dramatic the arithmetic looks.
const TINY = [1, 2, 100];
ok(shape(TINY).gapFrac > 0.9, 'the 3-value column has a gap of 99% of its range',
  `gapFrac ${shape(TINY).gapFrac}`);
list(tells(TINY), [], `3 values earn nothing — under MIN_TELL_CASES (${MIN_TELL_CASES})`);
list(tells([1, 2, 3, 100]), [TELL_SKEWED, TELL_GAP, TELL_SPREAD],
  'the same shape at 4 values does earn — the floor is on n, not on the numbers');

// Junk must be rejected, not coerced. `+true === 1` is a coincidence.
const junky = shape([1, 2, 3, 4, true, false, {}, [9], NaN, Infinity, -Infinity, 'abc', '']);
eq(junky.n, 4, 'booleans, objects, arrays, NaN, Infinity and text are all rejected');
near(junky.mean, 2.5, 'the junk column measures only its four real numbers');

// ---------------------------------------------------------------------------
// E. tellsFromShape — the entry point the families use on an Attr
// ---------------------------------------------------------------------------
console.log('\nE. tellsFromShape — over Attr-shaped literals');
console.log('='.repeat(76));

// contracts.js gives Attr exactly these field names, so a family may pass an
// Attr straight in without reshaping it.
list(tellsFromShape({ name: 'Mass', kind: 'numeric', role: 'measure', n: 12,
  skew: 2.419, gapFrac: 0.6172, maxAbsZ: 3.0787, cv: 1.9954 }),
  [TELL_SKEWED, TELL_GAP, TELL_OUTLIER, TELL_SPREAD],
  'an Attr-shaped literal for Mass earns all four');
list(tellsFromShape({ name: 'Sleep', kind: 'numeric', role: 'measure', n: 12,
  skew: 0.4756, gapFrac: 0.3483, maxAbsZ: 2.1087, cv: 0.6152 }),
  [], 'an Attr-shaped literal for Sleep earns nothing');

// Missing and null fields must earn nothing. This is the `null > -1` trap: in
// JavaScript `null` compares as 0, so any threshold below zero would fire on an
// unmeasured column, and `undefined` comparisons are false only by luck.
list(tellsFromShape({ n: 12 }), [], 'an Attr with no measurements earns nothing');
list(tellsFromShape({ n: 12, skew: null, gapFrac: null, maxAbsZ: null, cv: null }),
  [], 'an Attr whose measurements are all null earns nothing');
list(tellsFromShape({ n: 12, skew: NaN, gapFrac: NaN, maxAbsZ: NaN, cv: NaN }),
  [], 'an Attr whose measurements are NaN earns nothing');
list(tellsFromShape({ n: 3, skew: 9, gapFrac: 0.99, maxAbsZ: 9, cv: 9 }),
  [], 'an Attr under MIN_TELL_CASES earns nothing however strong the numbers');
list(tellsFromShape({ skew: 9, gapFrac: 0.99, maxAbsZ: 9, cv: 9 }),
  [], 'an Attr with no n at all earns nothing');
list(tellsFromShape(null), [], 'tellsFromShape(null) returns [] rather than throwing');
list(tellsFromShape(undefined), [], 'tellsFromShape(undefined) returns []');
list(tellsFromShape('nonsense'), [], 'tellsFromShape of a non-object returns []');
list(tells(null), [], 'tells(null) returns [] rather than throwing');
list(tells('nonsense'), [], 'tells of a non-array returns []');

// Every field must be read from the shape it was given, not from a closure over
// the last call: a family may hold several Attrs at once.
const attrs = [
  { n: 12, skew: 0, gapFrac: 0, maxAbsZ: 0, cv: 0 },
  { n: 12, skew: 0, gapFrac: 0.9, maxAbsZ: 0, cv: 0 },
  { n: 12, skew: 0, gapFrac: 0, maxAbsZ: 0, cv: 0 },
];
list(attrs.map((a) => tellsFromShape(a).join(',')), ['', TELL_GAP, ''],
  'tellsFromShape holds no state between calls');

console.log('\n' + '='.repeat(76));
if (failures) {
  console.log(`FAILED — ${failures} assertion(s).`);
  process.exit(1);
}
console.log('B OK — four tells, four independent thresholds; Mass earns all four '
  + 'and Sleep earns none.');
