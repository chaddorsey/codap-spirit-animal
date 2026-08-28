/**
 * t-fam-shape.mjs — the asserting test for module D of plan `-002` wave W1:
 * `web/src/wonderings/families/distribution.js` and `families/ordering.js`.
 *
 *   node docs/verification/wonderings/t-fam-shape.mjs
 *
 * Exits 0 only if every assertion holds; exits 1 otherwise. Dependency-free —
 * node builtins plus the repo's own fixture, no framework, no npm install.
 *
 * WHAT THIS TEST IS DEFENDING. Two failure modes, and they pull in opposite
 * directions. A family that emits nothing is a dead feature; a family that
 * emits on everything is a stem generator wearing an analysis's clothes. So the
 * headline assertions are a matched pair, both against the real 12-case Mammals
 * fixture: distribution MUST emit for `Mass`, and MUST NOT emit for `Sleep`.
 *
 * WHY A LOCAL REFERENCE IMPLEMENTATION. `web/src/analysis/distribution.js`
 * (module B) is being written by another agent right now, so this test computes
 * the four shape tells itself — mean, population sd, Fisher-Pearson skewness,
 * largest-gap fraction, max |z| and cv — and hands the modules a `DatasetModel`
 * built to the frozen `Attr` contract in `web/src/wonderings/contracts.js`.
 * The arithmetic below is an INDEPENDENT restatement of the reference in
 * `docs/verification/wonderings/distribution-shape.mjs`; if module B disagrees
 * with it, that disagreement is the finding.
 *
 * WHY THE KNIFE-EDGE CASES. Section E hands each family a synthetic attribute
 * carrying exactly one tell, just under and just over each threshold, and
 * requires the emission to flip. That is what a stub cannot survive: a module
 * that returns one Observation per numeric attribute passes "emits for Mass"
 * and fails everything in E, and a module that returns `[]` fails A outright.
 * Section E also proves the two families are NOT the same module twice — an
 * outlier-only or spread-only attribute must earn a distribution wondering and
 * must NOT earn an ordering one.
 *
 * Measured 2026-08-28.
 */
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { distributionFamily, DISTRIBUTION_FAMILY } from '../../../web/src/wonderings/families/distribution.js';
import { orderingFamily, ORDERING_FAMILY } from '../../../web/src/wonderings/families/ordering.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..', 'web', 'src', 'wonderings', 'families');

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(Object.is(a, b), label,
  `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sameSet = (got, want, label) => ok(
  got.length === want.length && want.every((w) => got.includes(w)),
  label, `expected [${[...want].sort().join(', ')}], got [${[...got].sort().join(', ')}]`);

// ---------------------------------------------------------------------------
// Reference statistics — independent restatement of distribution-shape.mjs.
// ---------------------------------------------------------------------------
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const skew = (a) => { const m = mean(a), s = sd(a); return s === 0 ? 0 : mean(a.map((v) => ((v - m) / s) ** 3)); };
const maxAbsZ = (a) => { const m = mean(a), s = sd(a); return s === 0 ? 0 : Math.max(...a.map((v) => Math.abs((v - m) / s))); };
function gapFrac(a) {
  const s = [...a].sort((x, y) => x - y);
  const range = s[s.length - 1] - s[0];
  let best = 0;
  for (let i = 1; i < s.length; i++) best = Math.max(best, s[i] - s[i - 1]);
  return best / range;                       // NaN when every value is identical — deliberately not special-cased
}

/** Build a contract-shaped DatasetModel from rows + a declared schema. */
function modelFrom(context, rows, schema) {
  const attrs = schema.map(({ name, type }) => {
    const raw = rows.map((r) => r[name]).filter((v) => v !== '' && v != null);
    if (type === 'numeric') {
      const v = raw.map(Number);
      const distinct = new Set(v).size;
      const m = mean(v), s = sd(v);
      return {
        name, kind: 'numeric', n: v.length,
        role: distinct === rows.length ? 'identifier' : 'measure',
        mean: m, sd: s, median: NaN, skew: skew(v),
        gapFrac: gapFrac(v), maxAbsZ: maxAbsZ(v), cv: s / m,
      };
    }
    const sizes = {};
    for (const r of rows) sizes[String(r[name])] = (sizes[String(r[name])] ?? 0) + 1;
    const cats = Object.keys(sizes);
    return {
      name, kind: 'categorical', n: raw.length,
      role: cats.length === rows.length ? 'identifier' : 'category',
      cardinality: cats.length, categories: cats, groupSizes: sizes,
    };
  });
  return { context, caseCount: rows.length, attrs, pairs: [], separations: [] };
}

const EMPTY_SCENE = { graphs: [], derived: { plottedAttrs: [], unplottedAttrs: [], attrPairsPlotted: [], sceneVersion: 1 } };
const sceneWith = (...graphs) => ({
  graphs,
  derived: { plottedAttrs: [], unplottedAttrs: [], attrPairsPlotted: [], sceneVersion: 1 },
});

const MAMMALS_MODEL = modelFrom('Mammals', MAMMALS, MAMMALS_COLLECTION.attrs);
const focusNames = (obs) => obs.map((o) => o.focus[0]);

// ---------------------------------------------------------------------------
// A. The real fixture — the must-pass pair
// ---------------------------------------------------------------------------
console.log('\nA. Mammals — earned, and declined');
console.log('='.repeat(76));

const dObs = distributionFamily(MAMMALS_MODEL, EMPTY_SCENE);
const oObs = orderingFamily(MAMMALS_MODEL, EMPTY_SCENE);
const dNames = focusNames(dObs);
const oNames = focusNames(oObs);

console.log(`  distribution -> [${dNames.join(', ')}]`);
console.log(`  ordering     -> [${oNames.join(', ')}]`);

ok(dNames.includes('Mass'), 'distribution EMITS for Mass (4 tells: skew, gap, outlier, spread)');
ok(!dNames.includes('Sleep'), 'distribution DECLINES on Sleep (gap 0.348 < 0.35, skew 0.48, |z| 2.11, cv 0.62)');
sameSet(dNames, ['LifeSpan', 'Height', 'Mass', 'Speed'],
  'distribution earns on exactly 4 of the 5 numerics — the measured 2026-08-28 answer');

ok(oNames.includes('Mass'), 'ordering EMITS for Mass');
ok(!oNames.includes('Sleep'), 'ordering DECLINES on Sleep');
sameSet(oNames, ['LifeSpan', 'Height', 'Mass', 'Speed'],
  'ordering earns on exactly 4 of the 5 numerics — matches SORT-WORTHINESS');

ok(!dNames.includes('Mammal') && !oNames.includes('Mammal'),
  'neither family touches `Mammal` (an identifier, cardinality 12 of 12)');
ok(!dNames.some((n) => ['Order', 'Diet'].includes(n)) && !oNames.some((n) => ['Order', 'Diet'].includes(n)),
  'neither family touches a categorical (`Order`, `Diet`)');

// Mass fires all four tells; Speed fires only the gap. Strength must reflect that.
const massD = dObs.find((o) => o.focus[0] === 'Mass');
const speedD = dObs.find((o) => o.focus[0] === 'Speed');
ok(massD.strength > speedD.strength,
  'distribution strength ranks 4-tell Mass above 1-tell Speed',
  `Mass ${massD.strength} vs Speed ${speedD.strength}`);
sameSet(massD.evidence.tells, ['skew', 'gap', 'outlier', 'spread'], 'Mass evidence names all four tells');
sameSet(speedD.evidence.tells, ['gap'], 'Speed evidence names only the gap tell');
ok(dObs.every((o, i) => i === 0 || dObs[i - 1].strength >= o.strength),
  'distribution output is sorted strongest-first');
ok(oObs.every((o, i) => i === 0 || oObs[i - 1].strength >= o.strength),
  'ordering output is sorted strongest-first');

// ---------------------------------------------------------------------------
// B. Observation contract conformance
// ---------------------------------------------------------------------------
console.log('\nB. Observation shape — the frozen contract');
console.log('='.repeat(76));

const FIELDS = ['family', 'key', 'dataContext', 'focus', 'evidence', 'strength', 'novelty', 'scope'];
let shapeBad = [];
for (const [fam, obs] of [[DISTRIBUTION_FAMILY, dObs], [ORDERING_FAMILY, oObs]]) {
  for (const o of obs) {
    for (const f of FIELDS) if (!(f in o)) shapeBad.push(`${o.key}: missing ${f}`);
    if (o.family !== fam) shapeBad.push(`${o.key}: family ${o.family} !== ${fam}`);
    if (o.key !== `${fam}:Mammals:${o.focus[0]}`) shapeBad.push(`bad key ${o.key}`);
    if (o.dataContext !== 'Mammals') shapeBad.push(`${o.key}: dataContext ${o.dataContext}`);
    if (!Array.isArray(o.focus) || o.focus.length !== 1) shapeBad.push(`${o.key}: focus not a 1-name array`);
    if (!(o.strength >= 0 && o.strength <= 1)) shapeBad.push(`${o.key}: strength ${o.strength} outside 0..1`);
    if (!(o.novelty >= 0 && o.novelty <= 1)) shapeBad.push(`${o.key}: novelty ${o.novelty} outside 0..1`);
    if (!o.scope || !('componentId' in o.scope)) shapeBad.push(`${o.key}: scope.componentId missing`);
    if ('text' in o) shapeBad.push(`${o.key}: emitted TEXT — the realizer owns words, not the family`);
    for (const [k, v] of Object.entries(o.evidence)) {
      if (typeof v === 'number' && !Number.isFinite(v)) shapeBad.push(`${o.key}: evidence.${k} is ${v}`);
    }
  }
}
eq(shapeBad.length, 0, 'every Observation conforms to the contract');
if (shapeBad.length) console.log(`        ${shapeBad.join('\n        ')}`);

eq(DISTRIBUTION_FAMILY, 'distribution', 'DISTRIBUTION_FAMILY is the contract name');
eq(ORDERING_FAMILY, 'ordering', 'ORDERING_FAMILY is the contract name');
ok(dObs.length > 0 && new Set(dObs.map((o) => o.key)).size === dObs.length, 'distribution keys are unique');
ok(oObs.length > 0 && new Set(oObs.map((o) => o.key)).size === oObs.length, 'ordering keys are unique');

// ---------------------------------------------------------------------------
// C. The empty case — the frequent, correct one
// ---------------------------------------------------------------------------
console.log('\nC. Nothing qualifies -> []');
console.log('='.repeat(76));

// Evenly spaced 10..120: skew 0, gapFrac 0.091, max|z| 1.59, cv 0.53. No tell.
const EVEN = Array.from({ length: 12 }, (_, i) => ({ Id: `r${i}`, Even: (i + 1) * 10 }));
const evenModel = modelFrom('Flat', EVEN, [{ name: 'Id', type: 'categorical' }, { name: 'Even', type: 'numeric' }]);
const evenAttr = evenModel.attrs.find((a) => a.name === 'Even');
console.log(`  Even: skew ${evenAttr.skew.toFixed(3)} gapFrac ${evenAttr.gapFrac.toFixed(3)} ` +
  `max|z| ${evenAttr.maxAbsZ.toFixed(3)} cv ${evenAttr.cv.toFixed(3)}`);
eq(distributionFamily(evenModel, EMPTY_SCENE).length, 0, 'distribution emits [] on an evenly spread column');
eq(orderingFamily(evenModel, EMPTY_SCENE).length, 0, 'ordering emits [] on an evenly spread column');

const noAttrs = { context: 'Empty', caseCount: 0, attrs: [], pairs: [], separations: [] };
eq(distributionFamily(noAttrs, EMPTY_SCENE).length, 0, 'distribution emits [] on a dataset with no attributes');
eq(orderingFamily(noAttrs, EMPTY_SCENE).length, 0, 'ordering emits [] on a dataset with no attributes');

// ---------------------------------------------------------------------------
// D. Ineligible attributes
// ---------------------------------------------------------------------------
console.log('\nD. Refusals that do not depend on the tells');
console.log('='.repeat(76));

/** A synthetic attribute that screams on all four tells, with overrides. */
const loud = (over = {}) => ({
  name: 'X', kind: 'numeric', role: 'measure', n: 12,
  mean: 100, sd: 400, median: 10, skew: 3.0, gapFrac: 0.8, maxAbsZ: 3.2, cv: 4.0, ...over,
});
const wrap = (attr, context = 'Ctx') => ({ context, caseCount: 12, attrs: [attr], pairs: [], separations: [] });

for (const [label, attr] of [
  ['role identifier', loud({ role: 'identifier' })],
  ['role category', loud({ role: 'category' })],
  ['kind categorical', loud({ kind: 'categorical' })],
  ['n = 4 (below the 5-case floor)', loud({ n: 4 })],
  ['n missing', loud({ n: undefined })],
  ['name empty', loud({ name: '' })],
]) {
  eq(distributionFamily(wrap(attr), EMPTY_SCENE).length, 0, `distribution refuses: ${label}`);
  eq(orderingFamily(wrap(attr), EMPTY_SCENE).length, 0, `ordering refuses: ${label}`);
}
eq(distributionFamily(wrap(loud({ role: undefined })), EMPTY_SCENE).length, 1,
  'distribution allows a missing `role` through (fails open, not silent)');
eq(orderingFamily(wrap(loud({ role: undefined })), EMPTY_SCENE).length, 1,
  'ordering allows a missing `role` through (fails open, not silent)');
eq(distributionFamily(wrap(loud(), ''), EMPTY_SCENE).length, 0,
  'distribution refuses a dataset with no context (the key would not be stable)');
eq(orderingFamily(wrap(loud(), ''), EMPTY_SCENE).length, 0,
  'ordering refuses a dataset with no context (the key would not be stable)');

// ---------------------------------------------------------------------------
// E. Knife edges — one tell at a time, just under and just over
// ---------------------------------------------------------------------------
console.log('\nE. Threshold discipline, and the two families are not the same module');
console.log('='.repeat(76));

/** Quiet on all four tells; the caller turns exactly one on. */
const quiet = (over = {}) => ({
  name: 'X', kind: 'numeric', role: 'measure', n: 12,
  mean: 100, sd: 20, median: 100, skew: 0.1, gapFrac: 0.10, maxAbsZ: 1.5, cv: 0.2, ...over,
});
const dCount = (attr) => distributionFamily(wrap(attr), EMPTY_SCENE).length;
const oCount = (attr) => orderingFamily(wrap(attr), EMPTY_SCENE).length;

const EDGES = [
  // field,     below,  above,  distribution-above, ordering-above
  ['skew', 0.99, 1.01, 1, 1],
  ['skew', -0.99, -1.01, 1, 1],          // the tell is on |skew|, so a left tail counts too
  ['gapFrac', 0.34, 0.36, 1, 1],
  ['maxAbsZ', 2.4, 2.6, 1, 0],           // outlier: distribution only
  ['cv', 1.4, 1.6, 1, 0],                // spread:  distribution only
];
for (const [field, below, above, dAbove, oAbove] of EDGES) {
  eq(dCount(quiet({ [field]: below })), 0, `distribution: ${field} = ${below} does not qualify`);
  eq(oCount(quiet({ [field]: below })), 0, `ordering:     ${field} = ${below} does not qualify`);
  eq(dCount(quiet({ [field]: above })), dAbove, `distribution: ${field} = ${above} -> ${dAbove}`);
  eq(oCount(quiet({ [field]: above })), oAbove, `ordering:     ${field} = ${above} -> ${oAbove}`);
}
// Exactly on the threshold is NOT over it — the gates are strict `>`, which is
// why Sleep's 0.348 gap and the 0.35 line are safe from a rounding change.
eq(dCount(quiet({ gapFrac: 0.35 })), 0, 'distribution: gapFrac exactly 0.35 does not qualify (strict >)');
eq(oCount(quiet({ gapFrac: 0.35 })), 0, 'ordering:     gapFrac exactly 0.35 does not qualify (strict >)');
eq(dCount(quiet({ skew: 1.0 })), 0, 'distribution: skew exactly 1.0 does not qualify (strict >)');

// The discriminator, stated as a whole-family claim rather than a count.
const outlierOnly = distributionFamily(wrap(quiet({ maxAbsZ: 3.0 })), EMPTY_SCENE);
eq(outlierOnly.length, 1, 'an outlier-only column earns a DISTRIBUTION wondering');
sameSet(outlierOnly[0].evidence.tells, ['outlier'], 'and its evidence names only the outlier tell');
eq(orderingFamily(wrap(quiet({ maxAbsZ: 3.0 })), EMPTY_SCENE).length, 0,
  'and earns NO ordering wondering — sorting reveals nothing a lone outlier has not already shown');
eq(orderingFamily(wrap(quiet({ cv: 5.0 })), EMPTY_SCENE).length, 0,
  'a spread-only column earns NO ordering wondering — cv is scale, not order');

// Strength must rise with the number of independent tells, in both families.
const d1 = distributionFamily(wrap(quiet({ gapFrac: 0.6 })), EMPTY_SCENE)[0].strength;
const d2 = distributionFamily(wrap(quiet({ gapFrac: 0.6, skew: 2 })), EMPTY_SCENE)[0].strength;
const d4 = distributionFamily(wrap(quiet({ gapFrac: 0.6, skew: 2, maxAbsZ: 3, cv: 2 })), EMPTY_SCENE)[0].strength;
ok(d1 < d2 && d2 < d4 && d4 <= 1, 'distribution strength rises monotonically with tell count',
  `${d1} < ${d2} < ${d4}`);
const o1 = orderingFamily(wrap(quiet({ gapFrac: 0.6 })), EMPTY_SCENE)[0].strength;
const o2 = orderingFamily(wrap(quiet({ gapFrac: 0.6, skew: 2 })), EMPTY_SCENE)[0].strength;
ok(o1 < o2 && o2 <= 1, 'ordering strength rises with tell count', `${o1} < ${o2}`);

// ---------------------------------------------------------------------------
// F. Degenerate numbers must not leak
// ---------------------------------------------------------------------------
console.log('\nF. Degenerate columns');
console.log('='.repeat(76));

// All twelve values identical: range 0, so gapFrac is 0/0 and cv is 0/x.
const FLAT = Array.from({ length: 12 }, (_, i) => ({ Id: `r${i}`, Same: 7 }));
const flatModel = modelFrom('Flat', FLAT, [{ name: 'Id', type: 'categorical' }, { name: 'Same', type: 'numeric' }]);
ok(Number.isNaN(flatModel.attrs.find((a) => a.name === 'Same').gapFrac), 'the reference does produce NaN gapFrac here');
eq(distributionFamily(flatModel, EMPTY_SCENE).length, 0, 'distribution emits [] on an all-identical column');
eq(orderingFamily(flatModel, EMPTY_SCENE).length, 0, 'ordering emits [] on an all-identical column');

for (const [label, over] of [
  ['NaN everywhere', { skew: NaN, gapFrac: NaN, maxAbsZ: NaN, cv: NaN }],
  ['Infinity cv (mean 0)', { mean: 0, cv: Infinity, skew: 0.1, gapFrac: 0.1, maxAbsZ: 1 }],
  ['-Infinity cv', { mean: -0, cv: -Infinity, skew: 0.1, gapFrac: 0.1, maxAbsZ: 1 }],
  ['tells absent', { skew: undefined, gapFrac: undefined, maxAbsZ: undefined, cv: undefined }],
  ['tells as strings', { skew: '9', gapFrac: '9', maxAbsZ: '9', cv: '9' }],
]) {
  eq(dCount(quiet(over)), 0, `distribution emits [] on: ${label}`);
  eq(oCount(quiet(over)), 0, `ordering emits [] on: ${label}`);
}

let threw = null;
try {
  distributionFamily(undefined, undefined);
  orderingFamily(undefined, undefined);
  distributionFamily({}, {});
  orderingFamily({}, {});
  distributionFamily({ context: 'C', attrs: null }, { graphs: null });
  orderingFamily({ context: 'C', attrs: null }, { graphs: null });
  distributionFamily({ context: 'C', attrs: [null, undefined, 3] }, EMPTY_SCENE);
  orderingFamily({ context: 'C', attrs: [null, undefined, 3] }, EMPTY_SCENE);
} catch (e) { threw = e; }
ok(threw === null, 'neither family throws on undefined / malformed input', String(threw));
eq(distributionFamily(MAMMALS_MODEL).length, 4, 'distribution works with the scene argument omitted entirely');
eq(orderingFamily(MAMMALS_MODEL).length, 4, 'ordering works with the scene argument omitted entirely');

// ---------------------------------------------------------------------------
// G. The scene actually matters
// ---------------------------------------------------------------------------
console.log('\nG. Scene sensitivity');
console.log('='.repeat(76));

const dotPlot = { id: 7, plotType: 'dotPlot', x: 'Mass', y: null, legend: null, dataContext: 'Mammals' };
const scatter = { id: 8, plotType: 'scatterPlot', x: 'Mass', y: 'Sleep', legend: null, dataContext: 'Mammals' };
const yDotPlot = { id: 9, plotType: 'dotPlot', x: null, y: 'Mass', legend: null, dataContext: 'Mammals' };
const foreign = { id: 10, plotType: 'dotPlot', x: 'Mass', y: null, legend: null, dataContext: 'Cats' };

ok(!focusNames(distributionFamily(MAMMALS_MODEL, sceneWith(dotPlot))).includes('Mass'),
  'distribution declines on Mass while a Mass dot plot is on screen');
ok(!focusNames(orderingFamily(MAMMALS_MODEL, sceneWith(dotPlot))).includes('Mass'),
  'ordering declines on Mass while a Mass dot plot is on screen');
ok(!focusNames(distributionFamily(MAMMALS_MODEL, sceneWith(yDotPlot))).includes('Mass'),
  'the y axis counts too');
ok(focusNames(distributionFamily(MAMMALS_MODEL, sceneWith(dotPlot))).includes('Speed'),
  'the other three attributes are unaffected');
ok(focusNames(distributionFamily(MAMMALS_MODEL, sceneWith(scatter))).includes('Mass'),
  'a scatterplot does NOT suppress — the marginal shape is what gets lost there');
ok(focusNames(orderingFamily(MAMMALS_MODEL, sceneWith(scatter))).includes('Mass'),
  'a scatterplot does NOT suppress ordering either');
ok(focusNames(distributionFamily(MAMMALS_MODEL, sceneWith(foreign))).includes('Mass'),
  'a dot plot in a DIFFERENT data context does not suppress');
eq(distributionFamily(MAMMALS_MODEL, sceneWith(dotPlot, scatter, foreign)).length, 3,
  'suppression survives a mixed scene');

// ---------------------------------------------------------------------------
// H. Determinism and purity
// ---------------------------------------------------------------------------
console.log('\nH. Determinism and purity');
console.log('='.repeat(76));

const j = (x) => JSON.stringify(x);
eq(j(distributionFamily(MAMMALS_MODEL, EMPTY_SCENE)), j(dObs), 'distribution is byte-identical across runs');
eq(j(orderingFamily(MAMMALS_MODEL, EMPTY_SCENE)), j(oObs), 'ordering is byte-identical across runs');

// Reversing the attribute order must not reorder the output: the sort is on
// (strength desc, name asc), not on input order.
const reversed = { ...MAMMALS_MODEL, attrs: [...MAMMALS_MODEL.attrs].reverse() };
eq(j(distributionFamily(reversed, EMPTY_SCENE)), j(dObs), 'distribution output is independent of attribute order');
eq(j(orderingFamily(reversed, EMPTY_SCENE)), j(oObs), 'ordering output is independent of attribute order');

// The family must not mutate what it is handed.
const before = j(MAMMALS_MODEL);
distributionFamily(MAMMALS_MODEL, EMPTY_SCENE);
orderingFamily(MAMMALS_MODEL, EMPTY_SCENE);
eq(j(MAMMALS_MODEL), before, 'neither family mutates the DatasetModel');

const BANNED = [
  [/\bDate\.now\b/, 'Date.now()'],
  [/\bMath\.random\b/, 'Math.random()'],
  [/\bperformance\b/, 'performance'],
  [/\blocalStorage\b/, 'localStorage'],
  [/(^|[^.\w])document\b/m, 'document'],
  [/(^|[^.\w])window\b/m, 'window'],
  [/\bexport\s+default\b/, 'a default export'],
];
for (const file of ['distribution.js', 'ordering.js']) {
  const src = readFileSync(join(SRC, file), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [re, what] of BANNED) ok(!re.test(body), `${file} contains no ${what}`);
  ok(!/\bimport\b/.test(body), `${file} imports nothing at runtime (contracts.js is types only)`);
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(76));
if (failures) {
  console.log(`FAILED — ${failures} assertion${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('OK — families/distribution.js and families/ordering.js hold.');
