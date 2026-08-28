/**
 * t-w0-contracts-fixture.mjs — W0's asserting test.
 *
 *   node docs/verification/wonderings/t-w0-contracts-fixture.mjs
 *
 * The other five scripts in this directory PRINT; they exit 0 whatever they
 * find. This one ASSERTS and exits 1. It exists because W0's two outputs are
 * pure coordination: `web/src/wonderings/contracts.js` is the only thing making
 * ten parallel agents agree on field names, and the `Diet` column in
 * `web/src/demo/fixture.js` is the only thing that lets three wondering
 * families earn anything at all. Both fail SILENTLY — a renamed contract field
 * or a re-balanced Diet column produces no error, just modules that quietly
 * disagree and families that quietly emit nothing.
 *
 * Three groups of assertion:
 *   A. contracts.js declares every typedef and every field of the frozen block,
 *      and carries no runtime logic.
 *   B. the fixture's Diet column meets its stated gates, and the schema in
 *      MAMMALS_COLLECTION agrees exactly with the keys in MAMMALS.
 *   C. the numbers the four committed verification scripts quote are UNCHANGED,
 *      and group comparison is now earned — the whole point of W0.
 *
 * Dependency-free, node builtins only. Measured 2026-08-28.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACTS = join(HERE, '..', '..', '..', 'web', 'src', 'wonderings', 'contracts.js');

const GROUP_COUNT_CEILING = 4;   // groups; more than 4 over 12 cases cannot be compared honestly
const MIN_GROUP_SIZE = 3;        // cases; below 3 a group "mean" is one animal wearing a hat
const ETA2_FLOOR = 0.30;         // unitless 0..1; below this the groups visibly overlap
const EPS = 0.005;               // tolerance for values the scripts print to 2 decimals

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(a === b, label, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const near = (a, b, label) => ok(Math.abs(a - b) < EPS, label, `expected ~${b}, got ${a}`);
const same = (got, want, label) => ok(
  got.length === want.length && want.every((w) => got.includes(w)),
  label, `expected [${want.join(', ')}], got [${got.join(', ')}]`);

// ---------------------------------------------------------------------------
// A. contracts.js
// ---------------------------------------------------------------------------
console.log('\nA. contracts.js — the frozen shapes');
console.log('='.repeat(76));

const src = readFileSync(CONTRACTS, 'utf8');

/** Split into JSDoc blocks and index the ones that declare a @typedef. */
const typedefs = {};
for (const raw of src.split('/**').slice(1)) {
  const block = raw.split('*/')[0];
  const m = block.match(/@typedef\s+\{([\s\S]*?)\}\s+(\w+)/);
  if (m) typedefs[m[2]] = { block, type: m[1] };
}

/** Brace-balanced @property scan — the type expressions contain nested `{}`. */
function properties(block) {
  const out = {};
  const re = /@property\s+\{/g;
  let m;
  while ((m = re.exec(block))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < block.length && depth > 0) {
      if (block[i] === '{') depth++;
      else if (block[i] === '}') depth--;
      i++;
    }
    const type = block.slice(m.index + m[0].length, i - 1);
    const name = block.slice(i).match(/^\s*\[?([\w.]+)/);
    if (name) out[name[1]] = type;
  }
  return out;
}

const EXPECTED = {
  Attr: ['name', 'kind', 'role', 'n', 'mean', 'sd', 'median', 'skew',
    'gapFrac', 'maxAbsZ', 'cv', 'cardinality', 'categories', 'groupSizes'],
  DatasetModel: ['context', 'caseCount', 'attrs', 'pairs', 'separations'],
  SceneModel: ['graphs', 'derived'],
  Observation: ['family', 'key', 'dataContext', 'focus', 'evidence',
    'strength', 'novelty', 'scope'],
  Wondering: ['id', 'text', 'observation', 'shownAt', 'state'],
};

for (const [name, fields] of Object.entries(EXPECTED)) {
  if (!ok(typedefs[name] != null, `@typedef ${name} is declared`)) continue;
  same(Object.keys(properties(typedefs[name].block)), fields,
    `${name} declares exactly its ${fields.length} contract fields`);
}

// The nested shapes carry field names too, and they are just as load-bearing.
const NESTED = [
  ['DatasetModel', 'pairs', ['a', 'b', 'r', 'rho', 'n', 'qualifies']],
  ['DatasetModel', 'separations', ['cat', 'num', 'eta2', 'groups', 'smallestGroup', 'qualifies']],
  ['SceneModel', 'graphs', ['id', 'plotType', 'x', 'y', 'legend', 'dataContext']],
  ['SceneModel', 'derived', ['plottedAttrs', 'unplottedAttrs', 'attrPairsPlotted', 'sceneVersion']],
  ['Observation', 'scope', ['componentId']],
];
for (const [tdef, prop, keys] of NESTED) {
  const type = typedefs[tdef] ? properties(typedefs[tdef].block)[prop] : undefined;
  const missing = type == null ? keys : keys.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(type));
  ok(missing.length === 0, `${tdef}.${prop} names ${keys.length} inner fields`,
    `missing: ${missing.join(', ')}`);
}

// The union members are the vocabulary every family and the realizer share.
const unionOf = (tdef, prop) => {
  const t = typedefs[tdef] ? properties(typedefs[tdef].block)[prop] : '';
  return [...String(t).matchAll(/'([^']+)'/g)].map((m) => m[1]);
};
same(unionOf('Attr', 'kind'), ['numeric', 'categorical'], "Attr.kind is 'numeric'|'categorical'");
same(unionOf('Attr', 'role'), ['measure', 'identifier', 'category'],
  "Attr.role is 'measure'|'identifier'|'category'");
same(unionOf('Wondering', 'state'), ['pending', 'shown', 'faded', 'suppressed'],
  'Wondering.state is the four-state union');

ok(typedefs.WonderingFamily != null, '@typedef WonderingFamily (the family signature) is declared');
const famType = typedefs.WonderingFamily?.type ?? '';
ok(/DatasetModel/.test(famType) && /SceneModel/.test(famType) && /Observation\[\]/.test(famType),
  'WonderingFamily is (DatasetModel, SceneModel) => Observation[]', famType.trim());

// No runtime logic, and no impurity. Judge the CODE, not the prose: strip the
// block comments first, or every doc sentence would be a false positive.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
ok(!/\b(function|class|const|let|var|if|for|return)\b/.test(code),
  'contracts.js carries no runtime logic', `code left after stripping comments: ${code}`);
ok(!/\b(document|window|localStorage|performance|Date\s*\.\s*now|Math\s*\.\s*random)\b/.test(code),
  'contracts.js touches no browser global, clock or RNG');
ok(!/export\s+default/.test(src), 'contracts.js has no default export');

const ns = await import('../../../web/src/wonderings/contracts.js');
same(Object.keys(ns), [], 'contracts.js exports no runtime value');

// ---------------------------------------------------------------------------
// B. the fixture
// ---------------------------------------------------------------------------
console.log('\nB. fixture.js — the Diet column');
console.log('='.repeat(76));

eq(MAMMALS.length, 12, 'MAMMALS still has 12 cases');
ok(MAMMALS.every((r) => typeof r.Diet === 'string' && r.Diet.length > 0),
  'every case has a non-empty Diet');

const dietSizes = {};
for (const r of MAMMALS) dietSizes[r.Diet] = (dietSizes[r.Diet] ?? 0) + 1;
const dietValues = Object.keys(dietSizes).sort();
eq(dietValues.length, 3, 'Diet has EXACTLY 3 distinct values');
ok(Object.values(dietSizes).every((n) => n >= MIN_GROUP_SIZE),
  `every Diet group has >= ${MIN_GROUP_SIZE} cases`, JSON.stringify(dietSizes));
ok(dietValues.length <= GROUP_COUNT_CEILING,
  `Diet is under the group-count ceiling of ${GROUP_COUNT_CEILING}`);
console.log(`        group sizes: ${JSON.stringify(dietSizes)}`);

// Biology, spot-checked where getting it wrong would be visible to a student.
const dietOf = Object.fromEntries(MAMMALS.map((r) => [r.Mammal, r.Diet]));
for (const [animal, want] of [['African Elephant', 'plant'], ['Asian Elephant', 'plant'],
  ['Cow', 'plant'], ['Giraffe', 'plant'], ['Donkey', 'plant'],
  ['Lion', 'meat'], ['Jaguar', 'meat'], ['Gray Wolf', 'meat'], ['Big Brown Bat', 'meat'],
  ['Human', 'both'], ['Chimpanzee', 'both'], ['Mouse', 'both']]) {
  eq(dietOf[animal], want, `${animal} eats ${want}`);
}

// Schema and data must agree in BOTH directions: a column declared but absent
// from the rows, or present in the rows but undeclared, breaks the CODAP import.
const declared = MAMMALS_COLLECTION.attrs.map((a) => a.name);
same(declared, Object.keys(MAMMALS[0]), 'MAMMALS_COLLECTION.attrs matches the case keys');
ok(MAMMALS.every((r) => declared.every((d) => d in r)),
  'every declared attribute is present in every case');
eq(MAMMALS_COLLECTION.attrs.find((a) => a.name === 'Diet')?.type, 'categorical',
  "Diet is declared type 'categorical'");

// ---------------------------------------------------------------------------
// C. what the change was for — and what it must not have broken
// ---------------------------------------------------------------------------
console.log('\nC. measurements');
console.log('='.repeat(76));

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;
const col = (n) => MAMMALS.map((r) => +r[n]);
// Every statistic below takes an ATTRIBUTE NAME, not an array — one convention,
// so a name/array mix-up cannot silently produce a plausible wrong number.
const skew = (n) => { const v = col(n), m = mean(v), s = sd(v);
  return mean(v.map((x) => ((x - m) / s) ** 3)); };
const cv = (n) => sd(col(n)) / mean(col(n));
const maxAbsZ = (n) => { const v = col(n), m = mean(v), s = sd(v);
  return Math.max(...v.map((x) => Math.abs((x - m) / s))); };
function biggestGapFrac(n) {
  const s = [...col(n)].sort((x, y) => x - y);
  let best = 0;
  for (let i = 1; i < s.length; i++) best = Math.max(best, s[i] - s[i - 1]);
  return best / (s[s.length - 1] - s[0]);
}
function pearson(x, y) {
  const X = col(x), Y = col(y), mx = mean(X), my = mean(Y);
  return X.map((v, i) => (v - mx) * (Y[i] - my)).reduce((a, b) => a + b, 0)
    / (X.length * sd(X) * sd(Y));
}
function eta2(cat, num) {
  const v = MAMMALS.map((r) => ({ g: String(r[cat]), v: +r[num] }));
  const grand = mean(v.map((d) => d.v));
  const between = [...new Set(v.map((d) => d.g))].reduce((acc, g) => {
    const gv = v.filter((d) => d.g === g).map((d) => d.v);
    return acc + gv.length * (mean(gv) - grand) ** 2;
  }, 0);
  return between / v.reduce((acc, d) => acc + (d.v - grand) ** 2, 0);
}

// C1 — regression guard. These are the numbers the four committed scripts and
// plan -001 quote. If a later edit to the fixture moves one of them, the
// documented measurements silently become lies; this is where that is caught.
near(Math.max(...col('Mass')), 6654, 'Mass still peaks at 6654 (the elephant outlier)');
near(maxAbsZ('Mass'), 3.08, 'Mass max|z| is still 3.08');
near(skew('Mass'), 2.42, 'Mass skew g1 is still 2.42');
near(biggestGapFrac('Mass'), 0.62, 'Mass largest gap is still 62% of range');
near(pearson('Height', 'Sleep'), -0.74, 'Height x Sleep r is still -0.74');
near(pearson('Height', 'Mass'), 0.59, 'Height x Mass r is still 0.59');
near(eta2('Order', 'Sleep'), 0.97, 'Order -> Sleep eta2 is still 0.97');

const NUMERIC = MAMMALS_COLLECTION.attrs.filter((a) => a.type === 'numeric').map((a) => a.name);
const earnsDistribution = (n) =>
  Math.abs(skew(n)) > 1 || biggestGapFrac(n) > 0.35 || maxAbsZ(n) > 2.5 || cv(n) > 1.5;
same(NUMERIC.filter(earnsDistribution), ['LifeSpan', 'Height', 'Mass', 'Speed'],
  'distribution still earns on 4 of 5 numerics');
ok(!earnsDistribution('Sleep'), 'distribution still DECLINES on Sleep');

// C2 — the point of W0. Group comparison was 0 before Diet existed.
const CATEGORICAL = MAMMALS_COLLECTION.attrs.filter((a) => a.type === 'categorical').map((a) => a.name);
const sizesOf = (c) => { const o = {}; for (const r of MAMMALS) o[String(r[c])] = (o[String(r[c])] ?? 0) + 1; return o; };
const groupable = CATEGORICAL.filter((c) => {
  const s = sizesOf(c);
  const k = Object.keys(s).length;
  return k > 1 && k < MAMMALS.length && k <= GROUP_COUNT_CEILING
    && Math.min(...Object.values(s)) >= MIN_GROUP_SIZE;
});
same(groupable, ['Diet'], 'Diet is the ONLY groupable categorical');
ok(!groupable.includes('Mammal'), 'Mammal is still refused — it is an identifier (12 of 12)');
ok(!groupable.includes('Order'), 'Order is still refused — 7 groups, smallest 1');

const earnedComparisons = groupable.flatMap((c) => NUMERIC
  .filter((n) => eta2(c, n) >= ETA2_FLOOR).map((n) => `${c} -> ${n}`));
ok(earnedComparisons.length > 0,
  `group-comparison wonderings earned: ${earnedComparisons.length} (was 0)`,
  'this is W0\'s entire reason for existing');
console.log(`        ${earnedComparisons.join(', ')}`);

// The families must stay complementary, not redundant — Sleep earns no
// distribution wondering yet is the strongest separation. If a future Diet
// re-balancing made every numeric separate, the analysis would stop declining,
// which is the difference between understanding a dataset and generating text.
ok(earnedComparisons.length < NUMERIC.length,
  'group comparison still DECLINES on at least one numeric',
  `earned on all ${NUMERIC.length}`);
ok(eta2('Diet', 'Sleep') >= ETA2_FLOOR && !earnsDistribution('Sleep'),
  'Sleep separates by Diet though it earns no distribution wondering (complementary)');

console.log('\n' + '='.repeat(76));
if (failures) {
  console.log(`FAILED — ${failures} assertion(s).`);
  process.exit(1);
}
console.log('W0 OK — contracts frozen, Diet column earns group comparison, '
  + 'documented measurements unchanged.');
