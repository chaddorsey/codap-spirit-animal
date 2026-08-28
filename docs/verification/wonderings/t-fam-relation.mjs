/**
 * t-fam-relation.mjs — W1 module E: the two relationship-shaped wondering
 * families.
 *
 *   node docs/verification/wonderings/t-fam-relation.mjs
 *
 * Covers `web/src/wonderings/families/relationship.js` ("How does ___ go with
 * ___?") and `web/src/wonderings/families/second-dimension.js` ("Does ___
 * matter here too?"). Dependency-free: no framework, no npm install, exits 1 on
 * the first failure and 0 only when every case passes.
 *
 * The DatasetModel for the Mammals cases is BUILT HERE from the real shipping
 * fixture (`web/src/demo/fixture.js`) by a pairwise-complete Pearson/Spearman
 * written out below, because `web/src/analysis/correlation.js` (W1 module A) is
 * being written in parallel and may not be on disk. The arithmetic mirrors
 * `docs/verification/wonderings/against-real-fixture.mjs`, which is committed
 * and reproducible, and the values it produces are asserted as literals
 * (`Height x Sleep` r = -0.74, rho = -0.79, n = 12) so that a change to the
 * fixture's numbers fails loudly here instead of silently moving the answer.
 *
 * The qualification rule used to build the fixture model is |r| >= 0.576, the
 * n = 12 significance floor recorded in `web/src/wonderings/contracts.js`,
 * which two of the ten numeric pairs clear. Whether Spearman may also qualify a
 * pair is module A's decision, not this module's: the families read
 * `pair.qualifies` and never re-decide it, which is exactly what the
 * qualifies-false case below proves.
 *
 * ANTI-STUB. A module that returned a constant array, ignored its arguments, or
 * hardcoded `Height x Sleep` fails: the same functions are asked for [] eleven
 * times, are asked to emit all ten pairs when all ten qualify, and are asked to
 * change their focus order, novelty, anchor and key as the scene changes.
 */
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  relationshipObservations, observe as relationshipObserve, FAMILY_NAME as REL_FAMILY,
} from '../../../web/src/wonderings/families/relationship.js';
import {
  secondDimensionObservations, observe as secondDimensionObserve, FAMILY_NAME as SD_FAMILY,
} from '../../../web/src/wonderings/families/second-dimension.js';

// ------------------------------------------------------------------ harness
let failures = 0;
let checks = 0;
function ok(cond, label) {
  checks++;
  if (cond) { console.log(`  ok   ${label}`); return true; }
  failures++;
  console.log(`  FAIL ${label}`);
  return false;
}
const j = (v) => JSON.stringify(v);
function eq(actual, expected, label) {
  return ok(j(actual) === j(expected), `${label}  (got ${j(actual)}, want ${j(expected)})`);
}
function section(name) { console.log(`\n${name}\n${'-'.repeat(name.length)}`); }

// -------------------------------------------------- the analysis, inline
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2))) || 1;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const num = (v) => (v !== '' && v != null && Number.isFinite(+v) ? +v : null);

/** Pairwise-complete Pearson, rounded to 2dp exactly as against-real-fixture.mjs does. */
function corr(rows, x, y) {
  const p = rows.filter((r) => num(r[x]) !== null && num(r[y]) !== null);
  if (p.length < 4) return null;
  const X = p.map((r) => +r[x]); const Y = p.map((r) => +r[y]);
  const mx = mean(X); const my = mean(Y);
  const s = X.map((v, i) => (v - mx) * (Y[i] - my)).reduce((a, b) => a + b, 0);
  return { r: +(s / (X.length * sd(X) * sd(Y))).toFixed(2), n: p.length };
}
function spearman(rows, x, y) {
  const p = rows.filter((r) => num(r[x]) !== null && num(r[y]) !== null);
  const rank = (vals) => { const s = [...vals].sort((a, b) => a - b); return vals.map((v) => s.indexOf(v) + 1); };
  const rx = rank(p.map((r) => +r[x])); const ry = rank(p.map((r) => +r[y]));
  return corr(rx.map((v, i) => ({ a: v, b: ry[i] })), 'a', 'b');
}

const SIGNIFICANCE_FLOOR_N12 = 0.576;   // |r|; the n = 12 floor recorded in contracts.js

/** A DatasetModel over the shipping Mammals fixture. `qualifies` = |r| >= floor. */
function mammalsModel({ qualifyAll = false } = {}) {
  const byKind = (t) => MAMMALS_COLLECTION.attrs.filter((a) => a.type === t).map((a) => a.name);
  const NUMERIC = byKind('numeric');
  const CATEGORICAL = byKind('categorical');
  const attrs = [];
  for (const name of CATEGORICAL) {
    const vals = MAMMALS.map((r) => String(r[name]));
    const categories = [...new Set(vals)];
    const groupSizes = {};
    for (const v of vals) groupSizes[v] = (groupSizes[v] ?? 0) + 1;
    attrs.push({
      name, kind: 'categorical',
      role: categories.length === MAMMALS.length ? 'identifier' : 'category',
      n: vals.length, cardinality: categories.length, categories, groupSizes,
    });
  }
  for (const name of NUMERIC) {
    const v = MAMMALS.map((r) => +r[name]);
    attrs.push({
      name, kind: 'numeric', role: 'measure', n: v.length,
      mean: mean(v), sd: sd(v), median: median(v),
    });
  }
  const pairs = [];
  for (let i = 0; i < NUMERIC.length; i++) {
    for (let k = i + 1; k < NUMERIC.length; k++) {
      const c = corr(MAMMALS, NUMERIC[i], NUMERIC[k]);
      const s = spearman(MAMMALS, NUMERIC[i], NUMERIC[k]);
      pairs.push({
        a: NUMERIC[i], b: NUMERIC[k], r: c.r, rho: s.r, n: c.n,
        qualifies: qualifyAll || Math.abs(c.r) >= SIGNIFICANCE_FLOOR_N12,
      });
    }
  }
  return { context: 'Mammals', caseCount: MAMMALS.length, attrs, pairs, separations: [] };
}

const scene = (graphs = [], plottedAttrs = [], attrPairsPlotted = [], sceneVersion = 1) => ({
  graphs,
  derived: {
    plottedAttrs,
    unplottedAttrs: MAMMALS_COLLECTION.attrs.map((a) => a.name).filter((n) => !plottedAttrs.includes(n)),
    attrPairsPlotted,
    sceneVersion,
  },
});
const EMPTY_SCENE = scene();
const graph = (id, x, y, { legend = null, dataContext = 'Mammals', plotType = 'graph' } = {}) => ({
  id, plotType, x, y, legend, dataContext,
});

/** Every Observation field the contract requires, with its type and range. */
function shapeErrors(o, family) {
  const e = [];
  if (o?.family !== family) e.push(`family=${j(o?.family)}`);
  if (typeof o?.key !== 'string' || o.key.split(':').length !== 3) e.push(`key=${j(o?.key)}`);
  if (typeof o?.dataContext !== 'string' || !o.dataContext) e.push('dataContext');
  if (!Array.isArray(o?.focus) || o.focus.length !== 2 || o.focus.some((n) => typeof n !== 'string' || !n)) e.push(`focus=${j(o?.focus)}`);
  if (!o?.evidence || typeof o.evidence !== 'object') e.push('evidence');
  if (typeof o?.strength !== 'number' || !(o.strength >= 0 && o.strength <= 1)) e.push(`strength=${j(o?.strength)}`);
  if (typeof o?.novelty !== 'number' || !(o.novelty >= 0 && o.novelty <= 1)) e.push(`novelty=${j(o?.novelty)}`);
  if (!o?.scope || !('componentId' in o.scope)) e.push('scope.componentId');
  if ('text' in (o ?? {})) e.push('carries text — realization belongs to W2');
  if (!o?.key?.startsWith(`${family}:`)) e.push('key not namespaced by family');
  return e;
}
const keysOf = (obs) => obs.map((o) => o.key);
const find = (obs, key) => obs.find((o) => o.key === key);

// ==========================================================================
section('0. the fixture the assertions below quote (regression on fixture.js)');
const M = mammalsModel();
const hs = M.pairs.find((p) => p.a === 'Height' && p.b === 'Sleep');
const hm = M.pairs.find((p) => p.a === 'Height' && p.b === 'Mass');
eq([hs.r, hs.rho, hs.n], [-0.74, -0.79, 12], 'Height x Sleep is r=-0.74, rho=-0.79, n=12');
eq([hm.r, hm.rho, hm.n], [0.59, 0.81, 12], 'Height x Mass is r=0.59, rho=0.81, n=12');
eq(M.pairs.filter((p) => p.qualifies).map((p) => `${p.a}x${p.b}`), ['HeightxMass', 'HeightxSleep'],
  '2 of the 10 numeric pairs clear |r| >= 0.576');
ok(M.pairs.length === 10, '10 numeric pairs in all');
ok(M.attrs.find((a) => a.name === 'Mammal').role === 'identifier', 'Mammal is an identifier (12 of 12)');

// ==========================================================================
section('1. relationship on Mammals, empty scene — MUST emit Height x Sleep');
const rel0 = relationshipObservations(M, EMPTY_SCENE);
eq(keysOf(rel0), ['relationship:Mammals:Height|Mass', 'relationship:Mammals:Height|Sleep'],
  'exactly the two qualifying pairs, strongest first');
const relHS = find(rel0, 'relationship:Mammals:Height|Sleep');
ok(!!relHS, 'Height x Sleep is emitted');
if (relHS) {
  eq(shapeErrors(relHS, 'relationship'), [], 'the Observation satisfies the contract shape');
  eq(relHS.focus, ['Height', 'Sleep'], 'focus is both names, deterministically ordered');
  eq(relHS.dataContext, 'Mammals', 'dataContext carried through');
  eq([relHS.evidence.r, relHS.evidence.rho, relHS.evidence.n], [-0.74, -0.79, 12],
    'evidence carries the measured r, rho and n');
  eq(relHS.evidence.curvature, 0.05, 'evidence carries the curvature gap |rho|-|r|');
  eq(relHS.strength, 0.79, 'strength is the stronger of |r| and |rho|');
  eq(relHS.novelty, 1, 'novelty is 1 when neither attribute is on screen');
  eq(relHS.scope.componentId, null, 'no component to anchor to in an empty scene');
}
ok(rel0.every((o) => o.strength >= SIGNIFICANCE_FLOOR_N12), 'every emitted pair clears the floor');
ok(rel0[0].strength >= rel0[1].strength, 'sorted by strength, descending');
ok(!keysOf(rel0).some((k) => /LifeSpan|Speed/.test(k)),
  'DECLINES on the 8 pairs that did not qualify (LifeSpan x Sleep rho=-0.68 among them)');
eq(REL_FAMILY, 'relationship', 'FAMILY_NAME export');
ok(relationshipObserve === relationshipObservations, '`observe` alias is the same function');

// ==========================================================================
section('2. relationship reads the scene');
const gSleep = graph('g1', 'Sleep', null);
const rel1 = relationshipObservations(M, scene([gSleep], ['Sleep']));
const rel1HS = find(rel1, 'relationship:Mammals:Height|Sleep');
ok(!!rel1HS, 'a univariate Sleep plot does not suppress the pair');
if (rel1HS) {
  eq(rel1HS.focus, ['Sleep', 'Height'], 'the on-screen attribute speaks first');
  eq(rel1HS.novelty, 0.75, 'novelty drops when one focus attribute is already on screen');
  eq(rel1HS.scope.componentId, 'g1', 'anchored to the graph showing one of its attributes');
}
const rel1HM = find(rel1, 'relationship:Mammals:Height|Mass');
if (ok(!!rel1HM, 'the untouched pair is still emitted')) {
  eq(rel1HM.novelty, 1, '...and its novelty is unchanged');
  eq(rel1HM.scope.componentId, null, '...and it is anchored to nothing');
}

const rel2 = relationshipObservations(M, scene([graph('g2', 'Sleep', 'Height')], ['Sleep', 'Height'], [['Sleep', 'Height']]));
eq(keysOf(rel2), ['relationship:Mammals:Height|Mass'],
  'a pair already on one graph earns nothing — the screen asked it already');

const rel3 = relationshipObservations(M, scene([graph('g3', 'Height', 'Sleep')], ['Height', 'Sleep']));
eq(keysOf(rel3), ['relationship:Mammals:Height|Mass'],
  'suppression works from raw axes too, with attrPairsPlotted empty and axes reversed');

const rel4 = relationshipObservations(M, scene([graph('g4', 'Sleep', null), graph('g5', 'Height', null)], ['Sleep', 'Height']));
const rel4HS = find(rel4, 'relationship:Mammals:Height|Sleep');
if (ok(!!rel4HS, 'two separate univariate plots do NOT count as plotted together')) {
  eq(rel4HS.novelty, 0.5, '...but both being on screen halves novelty');
  eq(rel4HS.focus, ['Height', 'Sleep'], '...and with both on screen the order falls back to sorted');
}

const relOther = relationshipObservations(M, scene([graph('gX', 'Sleep', 'Height', { dataContext: 'Cats' })], [], []));
ok(find(relOther, 'relationship:Mammals:Height|Sleep') === undefined,
  'a graph in ANOTHER context still suppresses — over-counting the screen is the safe direction');
eq(find(relOther, 'relationship:Mammals:Height|Mass').scope.componentId, null,
  'but a foreign-context graph is never used as the anchor');

// ==========================================================================
section('3. relationship refuses');
const IDENT = {
  context: 'Rows', caseCount: 12,
  attrs: [
    { name: 'CaseIndex', kind: 'numeric', role: 'identifier', n: 12 },
    { name: 'Mass', kind: 'numeric', role: 'measure', n: 12 },
    { name: 'Grade', kind: 'categorical', role: 'category', n: 12, cardinality: 3 },
  ],
  pairs: [{ a: 'CaseIndex', b: 'Mass', r: 0.99, rho: 0.99, n: 12, qualifies: true }],
  separations: [],
};
eq(relationshipObservations(IDENT, EMPTY_SCENE), [], 'an identifier is never half of a relationship, r=0.99 or not');

const withPair = (over) => ({
  context: 'Rows', caseCount: 12,
  attrs: [
    { name: 'A', kind: 'numeric', role: 'measure', n: 12 },
    { name: 'B', kind: 'numeric', role: 'measure', n: 12 },
  ],
  pairs: [{ a: 'A', b: 'B', r: 0.99, rho: 0.99, n: 12, qualifies: true, ...over }],
  separations: [],
});
eq(relationshipObservations(withPair({ qualifies: false }), EMPTY_SCENE), [],
  'qualifies:false is never overridden, however large r is');
eq(relationshipObservations(withPair({ qualifies: 'yes' }), EMPTY_SCENE), [],
  'qualifies must be exactly true — a truthy string is not evidence');
eq(relationshipObservations(withPair({ n: 3 }), EMPTY_SCENE), [],
  'fewer than 4 complete rows is not a shape');
eq(relationshipObservations(withPair({ b: 'Ghost' }), EMPTY_SCENE), [],
  'an attribute absent from attrs is unverifiable, so unusable');
eq(relationshipObservations(withPair({ r: null, rho: null }), EMPTY_SCENE), [],
  'a pair with no coefficient at all earns nothing');
eq(relationshipObservations(withPair({ a: 'B' }), EMPTY_SCENE), [],
  'an attribute paired with itself earns nothing');
ok(relationshipObservations(withPair({ r: null }), EMPTY_SCENE).length === 1,
  'rho alone is still evidence when r is missing');
eq(relationshipObservations(null, EMPTY_SCENE), [], 'a missing dataset earns nothing');
eq(relationshipObservations({ context: 'X', attrs: [], pairs: [], separations: [] }, EMPTY_SCENE), [],
  'a dataset with no pairs earns nothing');
ok(relationshipObservations(M).length === 2, 'a missing scene is read as an empty one');
ok(relationshipObservations(M, {}).length === 2, 'a scene with no graphs and no derived block is tolerated');

// ==========================================================================
section('4. second-dimension: empty scene emits NOTHING, Sleep plot names Height');
eq(secondDimensionObservations(M, EMPTY_SCENE), [], 'an empty scene earns nothing at all');
eq(SD_FAMILY, 'second-dimension', 'FAMILY_NAME export');
ok(secondDimensionObserve === secondDimensionObservations, '`observe` alias is the same function');

const sd1 = secondDimensionObservations(M, scene([gSleep], ['Sleep']));
eq(keysOf(sd1), ['second-dimension:Mammals:Height|Sleep'], 'a univariate Sleep plot earns exactly one');
if (sd1.length === 1) {
  eq(shapeErrors(sd1[0], 'second-dimension'), [], 'the Observation satisfies the contract shape');
  eq(sd1[0].focus, ['Height', 'Sleep'], 'focus[0] is the OFF-SCREEN partner — it names Height');
  eq(sd1[0].evidence.plotted, 'Sleep', 'evidence records which attribute is already on an axis');
  eq([sd1[0].evidence.r, sd1[0].evidence.rho, sd1[0].evidence.n], [-0.74, -0.79, 12], 'evidence carries the pair');
  eq(sd1[0].strength, 0.79, 'strength is the stronger of |r| and |rho|');
  eq(sd1[0].novelty, 1, 'novelty is 1: the partner is off screen by construction');
  eq(sd1[0].scope.componentId, 'g1', 'anchored to the graph with the empty axis');
}

const sdY = secondDimensionObservations(M, scene([graph('gy', null, 'Sleep')], ['Sleep']));
eq(keysOf(sdY), ['second-dimension:Mammals:Height|Sleep'], 'a dot plot on the vertical axis counts too');
eq(sdY[0].scope.componentId, 'gy', '...anchored to that graph');

const sdHeight = secondDimensionObservations(M, scene([graph('gh', 'Height', null)], ['Height']));
eq(keysOf(sdHeight), ['second-dimension:Mammals:Mass|Height', 'second-dimension:Mammals:Sleep|Height'],
  'a univariate Height plot has two qualifying partners, strongest first');
ok(sdHeight[0].strength >= sdHeight[1].strength, 'sorted by strength, descending');
ok(sdHeight[0].key !== sd1[0].key,
  'the key is asymmetric: Height-plotted-wants-Sleep is not Sleep-plotted-wants-Height');

// ==========================================================================
section('5. second-dimension refuses');
eq(secondDimensionObservations(M, scene([graph('g2', 'Sleep', 'Height')], ['Sleep', 'Height'])), [],
  'a graph with BOTH axes filled is not a univariate plot');
eq(secondDimensionObservations(M, scene([graph('g4', 'Sleep', null), graph('g5', 'Height', null)], ['Sleep', 'Height'])).map((o) => o.key),
  ['second-dimension:Mammals:Mass|Height'],
  'a partner already on another graph is not offered; the other direction still is');
eq(secondDimensionObservations(M, scene([graph('gl', 'Sleep', null, { legend: 'Height' })], ['Sleep', 'Height'])), [],
  'a partner sitting in a legend counts as on screen');
eq(secondDimensionObservations(M, scene([graph('gc', 'Sleep', null, { dataContext: 'Cats' })], [])), [],
  'a univariate graph of ANOTHER data context earns nothing here');
eq(secondDimensionObservations(M, scene([graph('gd', 'Diet', null), graph('gs', 'Speed', null)], ['Diet', 'Speed'])), [],
  'a categorical axis has no pairs, and Speed has no qualifying partner');
eq(secondDimensionObservations(IDENT, scene([graph('gi', 'Mass', null)], ['Mass'])), [],
  'an identifier is never offered as the second dimension');
eq(secondDimensionObservations(withPair({ qualifies: false }), scene([graph('g', 'A', null)], ['A'])), [],
  'qualifies:false is never overridden');
eq(secondDimensionObservations(withPair({ n: 3 }), scene([graph('g', 'A', null)], ['A'])), [],
  'fewer than 4 complete rows is not a shape');
eq(secondDimensionObservations(withPair({ r: null, rho: null }), scene([graph('g', 'A', null)], ['A'])), [],
  'a pair with no coefficient at all earns nothing — Number(null) is 0, and 0 is not evidence');
eq(secondDimensionObservations(withPair({ r: '', rho: undefined }), scene([graph('g', 'A', null)], ['A'])), [],
  '...nor does a blank coefficient');
eq(relationshipObservations(withPair({ r: '', rho: undefined }), EMPTY_SCENE), [],
  '...in either family');
eq(secondDimensionObservations(null, scene([gSleep], ['Sleep'])), [], 'a missing dataset earns nothing');
eq(secondDimensionObservations(M, null), [], 'a missing scene earns nothing');
eq(secondDimensionObservations(M, scene([graph('ga', 'Sleep', null), graph('gb', 'Sleep', null)], ['Sleep'])).length, 1,
  'two graphs of the same attribute say it once (de-duplicated by key)');

// ==========================================================================
section('6. both families read their arguments (anti-stub)');
const ALL = mammalsModel({ qualifyAll: true });
eq(relationshipObservations(ALL, EMPTY_SCENE).length, 10,
  'relationship emits all 10 pairs when the analysis qualifies all 10');
ok(relationshipObservations(ALL, EMPTY_SCENE).every((o, i, arr) => i === 0 || arr[i - 1].strength >= o.strength),
  '...still sorted by strength');
// Speed's four pairs, measured 2026-08-28: LifeSpan r=-0.12 rho=-0.21,
// Sleep r=0.07 rho=0.12, Mass r=-0.09 rho=0.07, Height r=0.06 rho=-0.08.
// Ranked by max(|r|, |rho|) that is 0.21, 0.12, 0.09, 0.08 — an order no
// alphabetical or fixture-order stub reproduces.
eq(secondDimensionObservations(ALL, scene([graph('g1', 'Speed', null)], ['Speed'])).map((o) => o.focus[0]),
  ['LifeSpan', 'Sleep', 'Mass', 'Height'],
  'second-dimension offers every qualifying partner of Speed, strongest first');

const CATS = {
  context: 'Cats', caseCount: 5,
  attrs: [
    { name: 'Weight', kind: 'numeric', role: 'measure', n: 5 },
    { name: 'Age', kind: 'numeric', role: 'measure', n: 5 },
  ],
  pairs: [{ a: 'Weight', b: 'Age', r: 0.88, rho: 0.9, n: 5, qualifies: true }],
  separations: [],
};
eq(keysOf(relationshipObservations(CATS, EMPTY_SCENE)), ['relationship:Cats:Age|Weight'],
  'the key is namespaced by data context, not hardcoded to Mammals');
eq(secondDimensionObservations(CATS, scene([graph('c1', 'Age', null, { dataContext: 'Cats' })], ['Age'])).map((o) => o.key),
  ['second-dimension:Cats:Weight|Age'], '...for both families');

// ==========================================================================
section('7. purity, determinism, no mutation');
const before = { d: j(M), s: j(EMPTY_SCENE) };
const runA = j(relationshipObservations(M, EMPTY_SCENE)) + j(secondDimensionObservations(M, scene([gSleep], ['Sleep'])));
const runB = j(relationshipObservations(M, EMPTY_SCENE)) + j(secondDimensionObservations(M, scene([gSleep], ['Sleep'])));
ok(runA === runB, 'two runs over the same input are byte-identical');
ok(j(M) === before.d && j(EMPTY_SCENE) === before.s, 'neither argument is mutated');

const FORBIDDEN = [
  [/\bdocument\b/, 'document'], [/\bwindow\b/, 'window'], [/\blocalStorage\b/, 'localStorage'],
  [/Date\s*\.\s*now/, 'Date.now'], [/new\s+Date\b/, 'new Date'],
  [/Math\s*\.\s*random/, 'Math.random'], [/performance\s*\./, 'performance.'],
  [/\bexport\s+default\b/, 'export default'], [/\brequire\s*\(/, 'require('],
  [/\bfetch\s*\(/, 'fetch('],
];
const here = fileURLToPath(new URL('.', import.meta.url));
for (const rel of ['relationship.js', 'second-dimension.js']) {
  const src = readFileSync(`${here}../../../web/src/wonderings/families/${rel}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/^\s*\/\/[^\n]*$/gm, ' ');     // whole-line comments
  const hits = FORBIDDEN.filter(([re]) => re.test(src)).map(([, name]) => name);
  eq(hits, [], `${rel} is pure: no ${FORBIDDEN.map(([, n]) => n).join(', ')}`);
  ok(/export\s+function\s+\w+Observations/.test(src), `${rel} exports a named function`);
  ok(!/\bimport\b/.test(src), `${rel} imports nothing — it is a leaf module`);
}

// ==========================================================================
console.log(`\n${'='.repeat(60)}`);
console.log(`${checks - failures} / ${checks} checks passed`);
if (failures) {
  console.log(`FAILED: ${failures} check(s) — see FAIL lines above.`);
  process.exit(1);
}
console.log('PASS — t-fam-relation.mjs');
