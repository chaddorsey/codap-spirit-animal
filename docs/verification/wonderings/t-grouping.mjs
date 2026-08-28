/**
 * t-grouping.mjs — the test for `web/src/analysis/grouping.js` (wave W1, module C).
 *
 *   node docs/verification/wonderings/t-grouping.mjs        # exit 0 = pass
 *
 * Dependency-free by rule: no framework, no npm install, no runner. Exits 1 on
 * the first failed assertion group, after printing every failure it found.
 *
 * What it is really guarding. `against-real-fixture.mjs` measured, 2026-08-28,
 * that `Mammal` scores eta² = 1.00 against EVERY numeric in the Mammals
 * fixture, because cardinality 12 over 12 cases makes between-group variance
 * identical to total variance. Any implementation that ranks separations by
 * eta² alone will therefore put the one meaningless answer first on nearly
 * every real dataset. So the assertions below are not about the arithmetic
 * being right — they are about the arithmetic being REFUSED for the right
 * stated reason, before the group-count ceiling ever gets a look at it.
 *
 * Written to be hostile to a stub: a module that always refuses fails the
 * 4-group and Diet cases; one that always accepts fails Mammal, Order and the
 * weak-separation case; one that rounds eta² to two decimals fails the
 * hand-computed 24/28; one that hard-codes the fixture fails the synthetics.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import {
  role, eta2, separates, separations, groupSizes, cardinality, columnNames,
  GROUP_COUNT_CEILING, MIN_GROUP_SIZE, ETA2_FLOOR, MIN_GROUPS,
  MIN_SEPARATION_CASES, MIN_SERIAL_KEY_CASES, IDENTIFIER_DISTINCT_FRACTION,
} from '../../../web/src/analysis/grouping.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, '../../../web/src/analysis/grouping.js');

let failures = 0;
let checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : `  (${detail})`}`);
}
const eq = (a, b, label) => ok(Object.is(a, b), label, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (a, b, tol, label) =>
  ok(typeof a === 'number' && Math.abs(a - b) <= tol, label, `got ${a}, want ${b} +/- ${tol}`);

const NUMERICS = MAMMALS_COLLECTION.attrs.filter((a) => a.type === 'numeric').map((a) => a.name);
const col = (name) => MAMMALS.map((r) => r[name]);

console.log('t-grouping — web/src/analysis/grouping.js');
console.log('='.repeat(72));

// --- 1. thresholds are the ones the plan and the measurements agreed on ------
console.log('\n1. thresholds');
eq(GROUP_COUNT_CEILING, 4, 'GROUP_COUNT_CEILING === 4');
eq(MIN_GROUP_SIZE, 3, 'MIN_GROUP_SIZE === 3');
eq(ETA2_FLOOR, 0.30, 'ETA2_FLOOR === 0.30');
eq(MIN_GROUPS, 2, 'MIN_GROUPS === 2');
ok(MIN_SEPARATION_CASES >= 4, 'MIN_SEPARATION_CASES >= 4', MIN_SEPARATION_CASES);
ok(MIN_SERIAL_KEY_CASES >= 4, 'MIN_SERIAL_KEY_CASES >= 4', MIN_SERIAL_KEY_CASES);
// The identifier rule must be TOLERANT (a near-unique column still names its
// cases) without swallowing the fixture's 5-distinct-of-6 case, which is a
// category. That pins the fraction into (5/6, 11/12] = (0.833, 0.917].
ok(IDENTIFIER_DISTINCT_FRACTION > 5 / 6 && IDENTIFIER_DISTINCT_FRACTION <= 11 / 12,
  'IDENTIFIER_DISTINCT_FRACTION is in (0.833, 0.917]', IDENTIFIER_DISTINCT_FRACTION);
ok(IDENTIFIER_DISTINCT_FRACTION < 1,
  'IDENTIFIER_DISTINCT_FRACTION is NOT exact equality — one blank cannot defeat the rule',
  IDENTIFIER_DISTINCT_FRACTION);

// --- 2. role() on the real fixture -------------------------------------------
console.log('\n2. role() on the Mammals fixture (12 cases)');
eq(role('Mammal', col('Mammal'), MAMMALS.length), 'identifier',
  'Mammal is an IDENTIFIER (cardinality 12 === caseCount 12)');
eq(role('Order', col('Order'), MAMMALS.length), 'category', 'Order is a category');
eq(role('Diet', col('Diet'), MAMMALS.length), 'category', 'Diet is a category');
for (const n of NUMERICS) {
  eq(role(n, col(n), MAMMALS.length), 'measure', `${n} is a measure`);
}
eq(cardinality(MAMMALS, 'Mammal'), 12, 'cardinality(Mammal) === 12');
eq(cardinality(MAMMALS, 'Order'), 7, 'cardinality(Order) === 7');
eq(cardinality(MAMMALS, 'Diet'), 3, 'cardinality(Diet) === 3');

// --- 2b. one missing name does not stop a column naming its cases ------------
// The identifier rule is the ONLY thing standing between the wondering families
// and eta2 = 1.00 on every numeric (see section 5). Under exact equality
// (`distinct === caseCount`) a single blank cell demotes `Mammal` to a
// category, at which point 11 groups over 12 cases becomes a legitimate
// grouping refused only by the group-count ceiling — and the ceiling's refusal
// says "try a coarser grouping", which is the wrong advice about a name column.
console.log('\n2b. the identifier rule survives a blank and a duplicate');
{
  const blanked = col('Mammal').map((v, i) => (i === 3 ? '' : v));
  eq(blanked.filter((v) => v !== '').length, 11, 'the blanked column has 11 names left');
  eq(role('Mammal', blanked, MAMMALS.length), 'identifier',
    'blanking ONE Mammal name leaves the column an IDENTIFIER (11 of 12 distinct)');

  const rowsBlank = MAMMALS.map((r, i) => (i === 3 ? { ...r, Mammal: '' } : r));
  for (const n of NUMERICS) {
    const s = separates(rowsBlank, 'Mammal', n);
    eq(s.reason, 'identifier',
      `with one name blank, Mammal x ${n} is still refused as an IDENTIFIER`);
  }
  // ...and this is not pedantry: the tautology it protects us from is still here.
  near(eta2(rowsBlank, 'Mammal', 'Mass'), 1, 1e-9,
    'because eta2(Mammal, Mass) is still 1.00 over the 11 named cases');
  ok(separations(rowsBlank).every((s) => s.cat !== 'Mammal'),
    'and a part-blank Mammal is still never offered as a grouping');

  // A duplicate name is the same kind of near-miss and must be tolerated too.
  const dupNamed = col('Mammal').map((v, i) => (i === 3 ? col('Mammal')[0] : v));
  eq(new Set(dupNamed).size, 11, 'the duplicated column has 11 distinct names');
  eq(role('Mammal', dupNamed, MAMMALS.length), 'identifier',
    'one repeated name also leaves the column an identifier');

  // The floor, stated as a rule rather than as a fixture accident: 18 of 20 is
  // an identifier, 17 of 20 is a category.
  const names20 = Array.from({ length: 20 }, (_, i) => `case-${i}`);
  eq(role('Name', names20.map((v, i) => (i < 2 ? '' : v)), 20), 'identifier',
    '18 distinct over 20 cases (0.90) is an identifier');
  eq(role('Name', names20.map((v, i) => (i < 3 ? '' : v)), 20), 'category',
    '17 distinct over 20 cases (0.85) is not');
  // Coverage, not just uniqueness: three names and nine blanks is a category,
  // however distinct those three are.
  eq(role('Sparse2', ['a', 'b', 'c', '', '', '', '', '', '', '', '', ''], 12), 'category',
    '3 distinct over 12 cases stays a category');
}

// --- 3. role() on synthetics --------------------------------------------------
console.log('\n3. role() on synthetic columns');
const N12 = Array.from({ length: 12 }, (_, i) => i + 1);
eq(role('CaseID', N12, 12), 'identifier', 'a 1..12 serial key over 12 cases is an identifier');
eq(role('CaseID', N12.map((v) => v + 1000), 12), 'identifier', '1001..1012 is also a serial key');
eq(role('Score', [10, 20, 30, 40, 50, 60], 6), 'measure',
  'distinct-but-gapped integers are a measure, not a key');
eq(role('Tiny', [1, 2, 3], 3), 'measure',
  `a ${MIN_SERIAL_KEY_CASES > 3 ? 'sub-floor' : ''} 1..3 column is too short to read as a key`);
eq(role('Mass2', [1.5, 2.5, 3.5, 4.5, 5.5, 6.5], 6), 'measure',
  'an all-distinct CONTINUOUS column stays a measure (the false-negative trap)');
eq(role('Blank', ['', null, undefined, '   '], 4), 'category', 'an all-blank column is a category');
eq(role('Sparse', ['a', 'b', 'c', '', '', '', '', '', '', '', '', ''], 12), 'category',
  '3 distinct values over 12 cases is a category, not an identifier');
eq(role('Nameish', ['a', 'b', 'c']), 'identifier',
  'caseCount defaults to the non-blank count');
eq(role('Mixed', ['1', '2', 'n/a', '2', '5', '6'], 6), 'category',
  'one non-numeric value makes the whole column categorical');
eq(role('Strings', ['1', '2', '3', '5', '8', '13'], 6), 'measure',
  'numeric STRINGS are still measures (CODAP delivers strings)');
eq(role('Rating', [1, 4, 5, 2, 3, 6], 6), 'measure',
  'a small-integer measurement that happens to permute 1..6 is NOT an identifier');
eq(role('Mixed2', ['1', '2', 'n/a', '4', '5', '6'], 6), 'identifier',
  'but 6 distinct values over 6 cases is an identifier whatever they look like');

// --- 4. eta² arithmetic, hand-computed ---------------------------------------
console.log('\n4. eta() arithmetic');
const HAND = [
  { g: 'a', v: 1 }, { g: 'a', v: 2 }, { g: 'a', v: 3 },
  { g: 'b', v: 5 }, { g: 'b', v: 6 }, { g: 'b', v: 7 },
];
// means 2 and 6, grand 4; between = 3*4 + 3*4 = 24; total = 9+4+1+1+4+9 = 28.
const hand = eta2(HAND, 'g', 'v');
near(hand, 24 / 28, 1e-12, 'eta2 === 24/28 exactly (hand-computed)');
ok(hand !== 0.86 && hand !== 0.857, 'eta2 is NOT rounded to 2 or 3 decimals', hand);

const SAME = [
  { g: 'a', v: 1 }, { g: 'a', v: 2 }, { g: 'a', v: 3 },
  { g: 'b', v: 1 }, { g: 'b', v: 2 }, { g: 'b', v: 3 },
];
near(eta2(SAME, 'g', 'v'), 0, 1e-12, 'identical group means give eta2 = 0');

const SPLIT = [
  { g: 'a', v: 1 }, { g: 'a', v: 1 }, { g: 'a', v: 1 },
  { g: 'b', v: 3 }, { g: 'b', v: 3 }, { g: 'b', v: 3 },
];
near(eta2(SPLIT, 'g', 'v'), 1, 1e-12, 'zero within-group variance gives eta2 = 1');

const FLAT = HAND.map((r) => ({ g: r.g, v: 5 }));
eq(eta2(FLAT, 'g', 'v'), 0, 'a numeric with no variance at all gives 0, not NaN');

// blanks are dropped pairwise, not row-wise, and must not shift the answer
const HAND_BLANKS = [
  ...HAND,
  { g: 'a', v: '' }, { g: 'b', v: null }, { g: '', v: 99 }, { g: '   ', v: -99 },
  { g: 'c', v: 'n/a' },
];
near(eta2(HAND_BLANKS, 'g', 'v'), 24 / 28, 1e-12, 'blank cells and unparseable values are ignored');

eq(eta2([{ g: 'a', v: 1 }, { g: 'b', v: 2 }, { g: 'a', v: 3 }], 'g', 'v'), null,
  `fewer than ${MIN_SEPARATION_CASES} complete cases returns null, not 0`);
eq(eta2(HAND.map((r) => ({ g: 'only', v: r.v })), 'g', 'v'), null,
  'a single group returns null (one group is not a comparison)');
eq(eta2([], 'g', 'v'), null, 'no rows returns null');

// --- 5. the identifier rule is what refuses Mammal ---------------------------
console.log('\n5. Mammal: eta2 = 1.00 everywhere, refused as an identifier');
for (const n of NUMERICS) {
  const e = eta2(MAMMALS, 'Mammal', n);
  near(e, 1, 1e-9, `eta2(Mammal, ${n}) === 1.00 — the tautology is real`);
  const s = separates(MAMMALS, 'Mammal', n);
  ok(s.qualifies === false, `Mammal x ${n} does not qualify`, JSON.stringify(s));
  eq(s.reason, 'identifier', `Mammal x ${n} is refused for being an IDENTIFIER`);
  near(s.eta2, 1, 1e-9, `Mammal x ${n} still REPORTS its eta2 (the guard refused it, not the number)`);
}

// --- 6. Order is refused by the group-count ceiling --------------------------
console.log('\n6. Order: 7 groups over 12 cases, smallest 1');
{
  const s = separates(MAMMALS, 'Order', 'Mass');
  eq(s.groups, 7, 'Order has 7 groups');
  eq(s.smallestGroup, 1, 'Order has a smallest group of 1');
  ok(s.groups > GROUP_COUNT_CEILING, 'Order exceeds the group-count ceiling');
  ok(s.smallestGroup < MIN_GROUP_SIZE, 'Order is also under the min group size');
  ok(s.qualifies === false, 'Order x Mass does not qualify');
  eq(s.reason, 'too-many-groups', 'Order is refused on group count');
  for (const n of NUMERICS) {
    ok(separates(MAMMALS, 'Order', n).qualifies === false,
      `Order x ${n} is suppressed`, JSON.stringify(separates(MAMMALS, 'Order', n)));
  }
}

// --- 7. Diet (added by W0) passes the guards and yields an eta² --------------
console.log('\n7. Diet: 3 groups, smallest 3 — the one honest categorical');
{
  const sizes = groupSizes(MAMMALS, 'Diet');
  eq(sizes.plant, 5, 'Diet: plant has 5');
  eq(sizes.meat, 4, 'Diet: meat has 4');
  eq(sizes.both, 3, 'Diet: both has 3');

  const s = separates(MAMMALS, 'Diet', 'Sleep');
  eq(s.groups, 3, 'Diet x Sleep: 3 groups');
  eq(s.smallestGroup, 3, 'Diet x Sleep: smallest group 3');
  ok(s.groups <= GROUP_COUNT_CEILING, 'Diet clears the group-count ceiling');
  ok(s.smallestGroup >= MIN_GROUP_SIZE, 'Diet clears the min group size');
  ok(s.qualifies === true, 'Diet x Sleep QUALIFIES', JSON.stringify(s));
  eq(s.reason, null, 'a qualifying separation carries no refusal reason');
  ok(s.eta2 > ETA2_FLOOR, 'Diet x Sleep clears the eta2 floor', s.eta2);
  near(s.eta2, 0.8213, 0.005, 'Diet x Sleep eta2 is the measured 0.821 (2026-08-28)');
  eq(s.n, 12, 'Diet x Sleep uses all 12 cases');

  const earned = NUMERICS.filter((n) => separates(MAMMALS, 'Diet', n).qualifies);
  ok(earned.length > 0, 'Diet earns at least one comparison', earned.join(', '));
  console.log(`       (Diet earns: ${earned.join(', ')})`);
}

// --- 8. the guards, one at a time, on synthetics ------------------------------
console.log('\n8. each guard fires on its own case');
// `v` steps by 3 rather than 1 so the synthetic measure is never a consecutive
// integer run — otherwise role() reads it as a serial key, which is correct
// behaviour but not what these cases are testing.
const build = (groups, perGroup, spread) => {
  const rows = [];
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < perGroup; i++) rows.push({ c: `g${g}`, v: g * spread + i * 3 });
  }
  return rows;
};
{
  const four = build(4, 3, 100);                       // 4 groups x 3, far apart
  const s4 = separates(four, 'c', 'v');
  eq(s4.groups, 4, 'ceiling is inclusive: 4 groups is allowed');
  ok(s4.qualifies === true, '4 well-separated groups of 3 QUALIFY', JSON.stringify(s4));

  const five = separates(build(5, 3, 100), 'c', 'v');
  eq(five.groups, 5, '5 groups counted');
  ok(five.qualifies === false, '5 groups do not qualify');
  eq(five.reason, 'too-many-groups', '5 groups refused on the ceiling');

  const thin = separates([
    { c: 'a', v: 1 }, { c: 'a', v: 2 }, { c: 'a', v: 3 },
    { c: 'b', v: 90 }, { c: 'b', v: 91 },
  ], 'c', 'v');
  eq(thin.smallestGroup, 2, 'a 2-case group is counted');
  ok(thin.qualifies === false, 'a group of 2 does not qualify despite a huge eta2');
  eq(thin.reason, 'group-too-small', 'refused on min group size');
  ok(thin.eta2 > 0.9, 'and it really did have a huge eta2', thin.eta2);

  const weak = separates([
    { c: 'a', v: 1 }, { c: 'a', v: 4 }, { c: 'a', v: 5 },
    { c: 'b', v: 2 }, { c: 'b', v: 3 }, { c: 'b', v: 6 },
  ], 'c', 'v');
  eq(weak.groups, 2, 'interleaved: 2 groups');
  eq(weak.smallestGroup, 3, 'interleaved: both groups have 3');
  ok(weak.eta2 < ETA2_FLOOR, 'interleaved groups score under the eta2 floor', weak.eta2);
  ok(weak.qualifies === false, 'interleaved groups do not qualify');
  eq(weak.reason, 'weak-separation',
    'refused on the eta2 floor — the guards all passed');

  const one = separates(build(1, 6, 100), 'c', 'v');
  eq(one.reason, 'insufficient-data', 'a single group is insufficient data');

  // 5 rows, 2 groups, but only 3 COMPLETE pairs — blanks are what makes it thin.
  const tiny = separates([
    { c: 'a', v: 1 }, { c: 'a', v: 20 }, { c: 'a', v: '' },
    { c: 'b', v: null }, { c: 'b', v: 300 },
  ], 'c', 'v');
  eq(tiny.n, 3, 'only 3 complete pairs survive the blanks');
  eq(tiny.reason, 'insufficient-data',
    `fewer than ${MIN_SEPARATION_CASES} complete pairs is insufficient data`);

  const flat = separates(build(2, 3, 0).map((r) => ({ c: r.c, v: 5 })), 'c', 'v');
  eq(flat.eta2, 0, 'no variance to explain gives eta2 0');
  eq(flat.reason, 'weak-separation', 'and it is refused as weak, not as a crash');

  const backwards = separates(four, 'v', 'c');
  ok(backwards.qualifies === false, 'grouping BY the numeric does not qualify');
  ok(backwards.reason === 'not-a-category' || backwards.reason === 'not-a-measure',
    'grouping by a measure is refused by role', backwards.reason);

  const numAsMeasure = separates(MAMMALS, 'Diet', 'Order');
  ok(numAsMeasure.qualifies === false, 'a categorical cannot be the measure');
  eq(numAsMeasure.reason, 'not-a-measure', 'refused: Order is not a measure');
}

// --- 9. declared roles override inference ------------------------------------
console.log('\n9. roles override');
{
  // Zip codes parse as numbers but are categories; 3 groups of 4.
  const ZIP = [];
  for (const z of [94110, 94112, 94114]) for (let i = 0; i < 4; i++) {
    ZIP.push({ Zip: z, Rent: z === 94110 ? 1000 + i : z === 94112 ? 2000 + i : 3000 + i });
  }
  ok(separates(ZIP, 'Zip', 'Rent').qualifies === false,
    'without a declared role, a numeric grouping column is refused');
  const forced = separates(ZIP, 'Zip', 'Rent', { roles: { Zip: 'category', Rent: 'measure' } });
  ok(forced.qualifies === true, 'a DECLARED category qualifies', JSON.stringify(forced));
  eq(forced.groups, 3, 'declared-category grouping still counts 3 groups');

  const forcedId = separates(MAMMALS, 'Diet', 'Sleep', { roles: { Diet: 'identifier' } });
  eq(forcedId.reason, 'identifier', 'a declared identifier is refused even when the data looks fine');
}

// --- 10. separations() over the whole fixture --------------------------------
console.log('\n10. separations() over the Mammals fixture');
{
  const names = columnNames(MAMMALS);
  eq(names[0], 'Mammal', 'columnNames is in first-seen order');
  eq(names.length, 8, 'the fixture has 8 columns');

  const all = separations(MAMMALS);
  const cats = [...new Set(all.map((s) => s.cat))];
  ok(!cats.includes('Mammal'), 'Mammal is never offered as a grouping', cats.join(','));
  eq(cats.join(','), 'Order,Diet', 'the only groupings offered are Order and Diet');
  eq(all.length, 2 * NUMERICS.length, 'one entry per categorical x numeric');

  const qualifying = all.filter((s) => s.qualifies);
  ok(qualifying.length > 0, 'the fixture earns at least one separation', qualifying.length);
  ok(qualifying.every((s) => s.cat === 'Diet'),
    'every qualifying separation is a Diet one',
    qualifying.map((s) => `${s.cat}->${s.num}`).join(', '));
  console.log(`       (earned: ${qualifying.map((s) => `${s.cat}->${s.num}`).join(', ')})`);

  // determinism: same input, byte-identical output, twice.
  eq(JSON.stringify(separations(MAMMALS)), JSON.stringify(all),
    'separations() is deterministic across calls');
}

// --- 11. it does not crash on garbage ----------------------------------------
console.log('\n11. degenerate inputs');
{
  const bad = [null, undefined, 42, 'nope', {}, { c: 'a' }, { v: 1 }];
  const s = separates(bad, 'c', 'v');
  ok(s && s.qualifies === false, 'malformed rows are refused, not thrown on');
  eq(eta2(undefined, 'c', 'v'), null, 'undefined rows return null');
  eq(role('x', undefined, 0), 'category', 'undefined values return a role, not a throw');
  eq(separations([]).length, 0, 'no rows means no separations');
}

// --- 12. purity, enforced against the source text ----------------------------
console.log('\n12. purity of the module source');
{
  const src = readFileSync(MODULE_PATH, 'utf8');
  const banned = [
    [/\bDate\s*\.\s*now\b/, 'Date.now'],
    [/\bnew\s+Date\b/, 'new Date'],
    [/\bMath\s*\.\s*random\b/, 'Math.random'],
    [/\bperformance\s*\.\s*now\b/, 'performance.now'],
    [/\bdocument\s*\./, 'document.'],
    [/\bwindow\s*\./, 'window.'],
    [/\blocalStorage\b/, 'localStorage'],
    [/\bfetch\s*\(/, 'fetch('],
    [/\bexport\s+default\b/, 'export default'],
    [/^\s*import\s/m, 'import (the module must have no dependencies)'],
  ];
  for (const [re, label] of banned) ok(!re.test(src), `source contains no ${label}`);
  ok(/^\/\*\*/.test(src), 'source opens with a JSDoc header');
  ok(/2026-08-28/.test(src), 'the JSDoc header carries dated evidence');
}

console.log(`\n${'='.repeat(72)}`);
console.log(`${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`FAILED: ${failures} check(s)`);
  process.exit(1);
}
console.log('t-grouping: PASS');
