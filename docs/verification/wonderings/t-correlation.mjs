/**
 * t-correlation.mjs — verification for `web/src/analysis/correlation.js`
 * (plan -002, wave W1, module A).
 *
 *   node docs/verification/wonderings/t-correlation.mjs
 *
 * Exits 0 on success, 1 on any failure. No test framework, no dependency:
 * node builtins only.
 *
 * The headline case is the regression from
 * `docs/verification/wonderings/corr-pairing-bug.mjs`: 18 cases in which Mass is
 * exactly 10 x Height (true r = 1.00) with four cells blanked in four different
 * rows. `insight.js`'s parallel-index pairing reports 0.29. That buggy algorithm
 * is transcribed verbatim below and ASSERTED to still report 0.29, so the test
 * proves the fix against the defect rather than merely asserting a number.
 *
 * The rest is built to be unpassable by a stub:
 *   - the significance floor is checked against seven published critical values
 *     of Pearson's r at alpha = 0.05 two-tailed, so `return 0.576` fails;
 *   - Spearman is checked on a tied series where MIDRANKS and first-index ranks
 *     give measurably different answers, so the easy ranking fails;
 *   - Pearson is checked against a hand-computed value, so returning sign(r) or
 *     a rank correlation fails;
 *   - blanks, whitespace, booleans and non-numeric strings each have a case, so
 *     a naive `+v` coercion fails;
 *   - the module's own source is scanned for browser globals, clocks, randomness
 *     and a default export, so a purity violation fails;
 *   - the real Mammals fixture is used, so a change to it that invalidates the
 *     recorded 2026-08-28 measurements fails here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  pearson, spearman, qualifies, significanceFloor, pValue,
  correlatePairs, pairwiseComplete,
} from '../../../web/src/analysis/correlation.js';
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';

let failures = 0;
let checks = 0;

function ok(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL  ${label}${detail === undefined ? '' : `  -- ${detail}`}`);
}

function near(label, actual, expected, tolerance) {
  ok(label, typeof actual === 'number' && Math.abs(actual - expected) <= tolerance,
    `expected ${expected} +-${tolerance}, got ${actual}`);
}

const section = (name) => console.log(`\n-- ${name} ${'-'.repeat(Math.max(0, 58 - name.length))}`);

// ---------------------------------------------------------------------------
section('the pairing bug: 18 cases, 4 blanks, true r = 1.00');

/** insight.js:34-75, transcribed. Filters blanks PER ATTRIBUTE, then pairs by
 *  parallel index. Kept here so the regression is anchored to the real defect. */
function insightJsCorrelation(rows, a, b) {
  const series = [a, b].map((name) => {
    const raw = rows.map((r) => r[name]).filter((v) => v !== '' && v != null);
    const nums = raw.map(Number).filter(Number.isFinite);
    const mean = nums.reduce((x, y) => x + y, 0) / nums.length;
    const sd = Math.sqrt(nums.reduce((x, y) => x + (y - mean) ** 2, 0) / nums.length) || 1;
    return { mean, sd, values: nums };
  });
  const [A, B] = series;
  const n = Math.min(A.values.length, B.values.length);
  let sxy = 0;
  for (let k = 0; k < n; k++) sxy += (A.values[k] - A.mean) * (B.values[k] - B.mean);
  return +(sxy / (n * A.sd * B.sd)).toFixed(2);
}

// Non-monotone by design: a monotone ramp hides the misalignment.
const PAIRED = [
  [5, 50], [9, 90], [2, 20], [7, 70], [3, 30], [8, 80], [1, 10], [6, 60], [4, 40], [10, 100],
  [5.5, 55], [2.5, 25], [8.5, 85], [3.5, 35], [7.5, 75], [1.5, 15], [9.5, 95], [6.5, 65],
];
const COMPLETE_18 = PAIRED.map(([Height, Mass]) => ({ Height, Mass }));
const GAPPY_18 = COMPLETE_18.map((r, i) => {
  if (i === 2 || i === 9) return { Height: '', Mass: r.Mass };
  if (i === 5 || i === 14) return { Height: r.Height, Mass: '' };
  return r;
});

ok('the defect is still 0.29 under the old algorithm',
  insightJsCorrelation(GAPPY_18, 'Height', 'Mass') === 0.29,
  `got ${insightJsCorrelation(GAPPY_18, 'Height', 'Mass')}`);

const fixed = pearson(GAPPY_18, 'Height', 'Mass');
ok('MUST PASS: 18 cases / 4 blanks gives r = 1.00',
  fixed !== null && fixed.r.toFixed(2) === '1.00', JSON.stringify(fixed));
near('  ...and it is exactly 1, not merely close', fixed?.r, 1, 1e-12);
ok('  ...over the 14 cases that survive pairwise deletion', fixed?.n === 14, `n = ${fixed?.n}`);
ok('  ...where the complete data also gives 1.00',
  pearson(COMPLETE_18, 'Height', 'Mass')?.n === 18
  && Math.abs(pearson(COMPLETE_18, 'Height', 'Mass').r - 1) < 1e-12);

// A single blank, in each column in turn — the everyday case.
const oneBlankX = COMPLETE_18.map((r, i) => (i === 4 ? { Height: '', Mass: r.Mass } : r));
const oneBlankY = COMPLETE_18.map((r, i) => (i === 11 ? { Height: r.Height, Mass: '' } : r));
near('one blank in x still gives r = 1', pearson(oneBlankX, 'Height', 'Mass')?.r, 1, 1e-12);
near('one blank in y still gives r = 1', pearson(oneBlankY, 'Height', 'Mass')?.r, 1, 1e-12);
ok('one blank drops exactly one case', pearson(oneBlankX, 'Height', 'Mass')?.n === 17);

// The two series are dropped TOGETHER, which is the whole fix.
const pc = pairwiseComplete(GAPPY_18, 'Height', 'Mass');
ok('pairwiseComplete keeps the series aligned',
  pc.xs.length === pc.ys.length && pc.xs.every((v, i) => Math.abs(pc.ys[i] - 10 * v) < 1e-12),
  JSON.stringify(pc));

// ---------------------------------------------------------------------------
section('Pearson: known values, symmetry, order-invariance');

const HAND = [
  { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 5 },
];
// Sxy = 6, Sxx = 10, Syy = 6  =>  r = 6 / sqrt(60)
near('hand-computed r = 6/sqrt(60)', pearson(HAND, 'x', 'y')?.r, 6 / Math.sqrt(60), 1e-12);
ok('  ...which is 0.7746, not 1 and not a rank correlation',
  pearson(HAND, 'x', 'y').r.toFixed(4) === '0.7746');

const NEG = [{ x: 1, y: 9 }, { x: 2, y: 7 }, { x: 3, y: 5 }, { x: 4, y: 3 }, { x: 5, y: 1 }];
near('perfect negative gives r = -1', pearson(NEG, 'x', 'y')?.r, -1, 1e-12);

ok('r is symmetric in its arguments',
  pearson(HAND, 'x', 'y').r === pearson(HAND, 'y', 'x').r);

const shuffled = [HAND[3], HAND[0], HAND[4], HAND[2], HAND[1]];
near('r is invariant to row order', pearson(shuffled, 'x', 'y')?.r, 6 / Math.sqrt(60), 1e-12);

near('r is invariant to a linear rescale of x',
  pearson(HAND.map((d) => ({ x: 100 * d.x + 7, y: d.y })), 'x', 'y')?.r,
  6 / Math.sqrt(60), 1e-12);

ok('|r| never exceeds 1', [COMPLETE_18, GAPPY_18, HAND, NEG]
  .every((rows) => {
    const p = pearson(rows, Object.keys(rows[0])[0], Object.keys(rows[0])[1]);
    return p === null || Math.abs(p.r) <= 1;
  }));

// ---------------------------------------------------------------------------
section('Spearman: curvature, and MIDRANKS for ties');

// y = x^3 is perfectly monotone but not linear: rho = 1 while r < 1.
const CUBIC = Array.from({ length: 12 }, (_, i) => ({ x: i + 1, y: (i + 1) ** 3 }));
near('monotone-but-curved gives rho = 1', spearman(CUBIC, 'x', 'y')?.rho, 1, 1e-12);
ok('  ...while Pearson understates it', pearson(CUBIC, 'x', 'y').r < 0.93,
  `r = ${pearson(CUBIC, 'x', 'y').r}`);
ok('  ...so the curvature gap is positive',
  Math.abs(spearman(CUBIC, 'x', 'y').rho) - Math.abs(pearson(CUBIC, 'x', 'y').r) > 0.06);

// x ranks as midranks [1, 2.5, 2.5, 4]; y as [1.5, 1.5, 3, 4].
// Sxy = 3.75, Sxx = 4.5, Syy = 4.5  =>  rho = 3.75 / 4.5 = 0.8333...
const TIED = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 4 }];
near('ties use midranks: rho = 3.75/4.5', spearman(TIED, 'x', 'y')?.rho, 3.75 / 4.5, 1e-12);
ok('  ...and NOT first-index ranks, which would give 0.8389',
  Math.abs(spearman(TIED, 'x', 'y').rho - 0.838866) > 1e-3,
  `got ${spearman(TIED, 'x', 'y').rho}`);

const ALL_TIED_X = [{ x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }];
ok('a wholly tied series has no rank correlation', spearman(ALL_TIED_X, 'x', 'y') === null);
ok('  ...and no Pearson correlation either', pearson(ALL_TIED_X, 'x', 'y') === null);

// Spearman must be pairwise-complete too: rank AFTER dropping, not before.
const GAPPY_CUBIC = CUBIC.map((d, i) => (i === 3 ? { x: '', y: d.y } : d));
near('Spearman drops incomplete cases before ranking',
  spearman(GAPPY_CUBIC, 'x', 'y')?.rho, 1, 1e-12);
ok('  ...and reports the surviving n', spearman(GAPPY_CUBIC, 'x', 'y')?.n === 11);

ok('rho is symmetric in its arguments',
  spearman(TIED, 'x', 'y').rho === spearman(TIED, 'y', 'x').rho);

// ---------------------------------------------------------------------------
section('the significance floor, against a published r-table');

// Critical values of Pearson's r, alpha = 0.05 two-tailed, by degrees of
// freedom (df = n - 2). Standard printed table; each is t/sqrt(t^2+df).
const R_TABLE = [
  [1, 0.997], [2, 0.950], [3, 0.878], [4, 0.811], [5, 0.754],
  [8, 0.632], [10, 0.576], [18, 0.444], [20, 0.423], [30, 0.349], [100, 0.195],
];
for (const [df, expected] of R_TABLE) {
  near(`floor at df = ${String(df).padStart(3)} (n = ${df + 2})`,
    significanceFloor(df + 2), expected, 0.0006);
}
ok('the fixture-size floor is 0.576 to three places',
  significanceFloor(12).toFixed(3) === '0.576', significanceFloor(12));
ok('the floor falls as n grows', [4, 5, 6, 10, 12, 20, 50, 100, 500]
  .every((n, i, all) => i === 0 || significanceFloor(n) < significanceFloor(all[i - 1])));
ok('no floor exists below n = 3', significanceFloor(2) === null && significanceFloor(1) === null);

// ---------------------------------------------------------------------------
section('qualifies()');

ok('n = 12: 0.58 clears the floor', qualifies(0.58, 12) === true);
ok('n = 12: 0.57 does not', qualifies(0.57, 12) === false);
ok("n = 12: insight.js's STRONG_R = 0.5 does NOT clear it — the documented defect",
  qualifies(0.5, 12) === false);
ok('the gate is sign-blind', qualifies(-0.74, 12) === true && qualifies(0.74, 12) === true);
ok('a strong r over few cases still fails: 0.9 at n = 4', qualifies(0.9, 4) === false);
ok('  ...but 0.96 at n = 4 passes', qualifies(0.96, 4) === true);
ok('a weak r over many cases passes: 0.2 at n = 102', qualifies(0.2, 102) === true);
ok('  ...and 0.19 at n = 102 does not', qualifies(0.19, 102) === false);
ok('n below the pairwise minimum never qualifies',
  [0, 1, 2, 3].every((n) => qualifies(0.999, n) === false));
ok('garbage never qualifies', [NaN, Infinity, undefined, null, 'x']
  .every((bad) => qualifies(bad, 12) === false && qualifies(0.9, bad) === false));

const floor12 = significanceFloor(12);
ok('qualifies agrees with significanceFloor on both sides of the boundary',
  qualifies(floor12 + 1e-6, 12) === true && qualifies(floor12 - 1e-6, 12) === false);

near('p-value of a perfect correlation is 0', pValue(1, 12), 0, 1e-15);
near('p-value of no correlation is 1', pValue(0, 12), 1, 1e-12);
near('p at the floor is alpha', pValue(floor12, 12), 0.05, 1e-9);
ok('p falls as |r| rises', [0, 0.2, 0.4, 0.6, 0.8, 1]
  .every((r, i, all) => i === 0 || pValue(r, 12) < pValue(all[i - 1], 12)));
ok('p is undefined below df = 1', pValue(0.9, 2) === null);
ok('an impossible r has no p', pValue(1.5, 12) === null);

// ---------------------------------------------------------------------------
section('non-data cells are dropped, not coerced');

const DIRTY = [
  { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 5 },
  { x: '', y: 99 },          // blank string: +'' is 0, would be a fake origin case
  { x: '   ', y: 99 },       // whitespace: +'   ' is 0 too
  { x: null, y: 99 },
  { x: undefined, y: 99 },
  { x: true, y: 99 },        // +true is 1
  { x: 'n/a', y: 99 },
  { x: NaN, y: 99 },
  { x: 6, y: '' },
];
const dirty = pearson(DIRTY, 'x', 'y');
ok('only the 5 genuinely complete cases survive', dirty?.n === 5, `n = ${dirty?.n}`);
near('  ...so the perfect relationship is not corrupted', dirty?.r, 1, 1e-12);

ok('numeric strings ARE data',
  pearson([{ x: '1', y: 1 }, { x: '2', y: 2 }, { x: '3', y: 3 }, { x: '4', y: 4 }], 'x', 'y')
    ?.n === 4);
ok('negative and decimal strings are data',
  pearson([{ x: '-1.5', y: 1 }, { x: '2', y: 2 }, { x: '3.25', y: 3 }, { x: '4', y: 4 }], 'x', 'y')
    ?.n === 4);
ok('a missing attribute name yields nothing',
  pearson(HAND, 'x', 'nope') === null && spearman(HAND, 'nope', 'y') === null);
ok('too few complete cases yields null',
  pearson([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 4 }], 'x', 'y') === null);
ok('  ...and exactly 4 is enough',
  pearson([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 4 }, { x: 4, y: 3 }], 'x', 'y')?.n === 4);
ok('junk input does not throw',
  pearson([], 'x', 'y') === null
  && pearson(null, 'x', 'y') === null
  && pearson([null, undefined, 3, 'x'], 'x', 'y') === null
  && spearman(undefined, 'x', 'y') === null);

// ---------------------------------------------------------------------------
section('correlatePairs over the real Mammals fixture');

const NUMERIC = MAMMALS_COLLECTION.attrs.filter((a) => a.type === 'numeric').map((a) => a.name);
const pairs = correlatePairs(MAMMALS, NUMERIC);

ok(`${NUMERIC.length} numerics give ${(NUMERIC.length * (NUMERIC.length - 1)) / 2} pairs`,
  pairs.length === (NUMERIC.length * (NUMERIC.length - 1)) / 2, `got ${pairs.length}`);
ok('every pair carries the contract fields',
  pairs.every((p) => typeof p.a === 'string' && typeof p.b === 'string'
    && Number.isFinite(p.r) && Number.isFinite(p.rho)
    && Number.isInteger(p.n) && typeof p.qualifies === 'boolean'));
ok('no pair correlates an attribute with itself', pairs.every((p) => p.a !== p.b));
ok('no unordered pair appears twice',
  new Set(pairs.map((p) => [p.a, p.b].sort().join('|'))).size === pairs.length);
ok('the fixture has no blanks, so every pair is n = 12', pairs.every((p) => p.n === 12));

// Recorded 2026-08-28 (contracts.js, plan -001 measurement 5): 2 of 10 pairs
// clear the Pearson floor of 0.576 at n = 12.
const clearing = pairs.filter((p) => p.qualifies);
ok('exactly 2 pairs clear the Pearson floor', clearing.length === 2,
  clearing.map((p) => `${p.a}x${p.b}=${p.r.toFixed(3)}`).join(', '));
const names = clearing.map((p) => [p.a, p.b].sort().join(' x ')).sort();
ok('  ...and they are Height x Mass and Height x Sleep',
  names.join(' ; ') === 'Height x Mass ; Height x Sleep', names.join(' ; '));

const heightSleep = pairs.find((p) => p.a === 'Height' && p.b === 'Sleep');
near('Height x Sleep is r = -0.74, as plan -001 records', heightSleep?.r, -0.74, 0.005);

// The relationship family's broader gate, computed from the record's own fields.
const eitherGate = pairs.filter((p) => p.qualifies || qualifies(p.rho, p.n));
ok('the |r| OR |rho| gate clears 5 pairs, because Mammals is skewed',
  eitherGate.length === 5, `got ${eitherGate.length}`);
const massSleep = pairs.find((p) => p.a === 'Mass' && p.b === 'Sleep');
ok('  ...including Mass x Sleep, which Pearson alone misses',
  massSleep.qualifies === false && qualifies(massSleep.rho, massSleep.n) === true,
  `r=${massSleep?.r.toFixed(3)} rho=${massSleep?.rho.toFixed(3)}`);

ok('correlatePairs is deterministic',
  JSON.stringify(correlatePairs(MAMMALS, NUMERIC)) === JSON.stringify(pairs));
ok('a constant column is omitted, not emitted as r = 0',
  correlatePairs(MAMMALS.map((r) => ({ ...r, Flat: 7 })), [...NUMERIC, 'Flat'])
    .every((p) => p.a !== 'Flat' && p.b !== 'Flat'));
ok('correlatePairs tolerates junk arguments',
  correlatePairs(null, NUMERIC).length === 0
  && correlatePairs(MAMMALS, null).length === 0
  && correlatePairs(MAMMALS, []).length === 0);

// ---------------------------------------------------------------------------
section('purity of the module source');

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../../web/src/analysis/correlation.js', import.meta.url)), 'utf8');
// Strip the JSDoc/comment prose so a word appearing in an explanation is not a
// violation; only executable text is scanned.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const banned of ['Date.now', 'Math.random', 'performance.now', 'localStorage',
  'document', 'window', 'globalThis', 'fetch(', 'require(']) {
  ok(`source is free of ${banned}`, !CODE.includes(banned));
}
ok('no default export', !/export\s+default/.test(CODE));
ok('imports nothing', !/^\s*import\s/m.test(CODE));
ok('module-level constants are SCREAMING_SNAKE',
  (CODE.match(/^const\s+([A-Za-z_$][\w$]*)/gm) ?? [])
    .every((decl) => /^const\s+[A-Z][A-Z0-9_]*$/.test(decl)),
  (CODE.match(/^const\s+([A-Za-z_$][\w$]*)/gm) ?? []).join(', '));

// Determinism across a fresh module instance: same inputs, same bits.
const AGAIN = await import('../../../web/src/analysis/correlation.js');
ok('a second import agrees to the last bit',
  AGAIN.pearson(GAPPY_18, 'Height', 'Mass').r === fixed.r
  && AGAIN.significanceFloor(12) === significanceFloor(12));

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(64)}`);
if (failures > 0) {
  console.error(`t-correlation: ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`t-correlation: all ${checks} checks passed`);
