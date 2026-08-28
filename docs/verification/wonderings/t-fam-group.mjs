/**
 * t-fam-group.mjs — the asserting test for the three group-shaped wondering
 * families: comparison, grouping, filtering.
 *
 *   node docs/verification/wonderings/t-fam-group.mjs
 *
 * WHY THIS TEST IS SHAPED THE WAY IT IS. These three families were the ones
 * that earned NOTHING before W0, and the reason was never the code — it was
 * that the Mammals fixture's only usable categorical, `Order`, has 7 groups
 * over 12 cases with a smallest group of 1, while `Mammal` is an identifier
 * (cardinality 12 = caseCount). Both produce large, entirely fake eta2 values:
 * 0.69 to 0.97 for `Order`. So the failure mode this test is built to catch is
 * NOT "emits nothing" — it is "emits something, and the something is wrong."
 * A module that simply trusted `separations[].qualifies` would pass a happy-path
 * test and still offer to compare seven means computed from one animal each.
 * Section B therefore hands the families a LYING analysis (every separation
 * marked `qualifies: true`) and requires them to refuse anyway.
 *
 * `web/src/analysis/grouping.js` did not exist when this was written, so the
 * DatasetModel below is built here from `web/src/demo/fixture.js` using the same
 * arithmetic as `docs/verification/wonderings/distribution-shape.mjs`, and
 * section 0 pins it against the numbers that script prints. If module C later
 * disagrees with those numbers, section 0 fails and says so.
 *
 * Measured 2026-08-28 against the 12-case Mammals fixture. Dependency-free,
 * node builtins only. Exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import { observeComparison, COMPARISON_FAMILY, KEY_SEPARATOR } from '../../../web/src/wonderings/families/comparison.js';
import { observeGrouping, GROUPING_FAMILY, KEY_SEPARATOR as GRP_SEP } from '../../../web/src/wonderings/families/grouping.js';
import { observeFiltering, FILTERING_FAMILY, KEY_SEPARATOR as FLT_SEP } from '../../../web/src/wonderings/families/filtering.js';
// The other four families, imported for one assertion only: the key separator
// is a CROSS-family contract, and this is the one test that can see all seven
// at once. `contracts.js:142-147` makes `key` the de-duplication key, the
// novelty key and the W2 phrasing-hash input simultaneously, so two families
// spelling it differently is three bugs. Verification 2026-08-28 found exactly
// that: comparison and filtering joined with `'~'`, relationship and
// second-dimension with `'|'`.
import { KEY_SEPARATOR as DIS_SEP } from '../../../web/src/wonderings/families/distribution.js';
import { KEY_SEPARATOR as ORD_SEP } from '../../../web/src/wonderings/families/ordering.js';
import { KEY_SEPARATOR as REL_SEP } from '../../../web/src/wonderings/families/relationship.js';
import { KEY_SEPARATOR as SD_SEP } from '../../../web/src/wonderings/families/second-dimension.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..', 'web', 'src', 'wonderings', 'families');
const FILES = ['comparison.js', 'grouping.js', 'filtering.js'];

const EPS = 0.0005;              // tolerance for values compared against 2- and 3-decimal expectations

// The gates the reference model applies when it decides `qualifies`. They are
// the analysis's thresholds, restated here because the analysis module is not on
// disk; the families re-check them independently, which is what section B tests.
const REF_ETA2_FLOOR = 0.30;         // unitless 0..1; below this the groups visibly overlap
const REF_GROUP_COUNT_CEILING = 4;   // groups; more than 4 over 12 cases cannot be compared honestly
const REF_MIN_GROUP_SIZE = 3;        // cases; below 3 a group mean is one animal wearing a hat

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n        ' + detail : ''));
  return false;
}
const eq = (a, b, label) => ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
const near = (a, b, label) => ok(Number.isFinite(a) && Math.abs(a - b) < EPS, label,
  'expected ~' + b + ', got ' + JSON.stringify(a));
const deepEq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label,
  'expected ' + JSON.stringify(b) + '\n        got      ' + JSON.stringify(a));
const clone = (v) => JSON.parse(JSON.stringify(v));
const keys = (obs) => obs.map((o) => o.key);

// ---------------------------------------------------------------------------
// The reference DatasetModel, built from the shipping fixture
// ---------------------------------------------------------------------------
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round2 = (x) => Math.round(x * 100) / 100;

/** eta2 — between-group over total variance, exactly as distribution-shape.mjs computes it. */
function eta2(rows, cat, num) {
  const v = rows.map((r) => ({ g: String(r[cat]), v: +r[num] }));
  const grand = mean(v.map((d) => d.v));
  const groups = [...new Set(v.map((d) => d.g))];
  const between = groups.reduce((acc, g) => {
    const gv = v.filter((d) => d.g === g).map((d) => d.v);
    return acc + gv.length * (mean(gv) - grand) ** 2;
  }, 0);
  const total = v.reduce((acc, d) => acc + (d.v - grand) ** 2, 0);
  return round2(between / total);
}

function buildMammalsModel() {
  const rows = MAMMALS;
  const caseCount = rows.length;
  const attrs = [];
  for (const a of MAMMALS_COLLECTION.attrs) {
    if (a.type === 'numeric') {
      const v = rows.map((r) => +r[a.name]).filter((x) => Number.isFinite(x));
      const m = mean(v), s = sd(v);
      attrs.push({
        name: a.name,
        kind: 'numeric',
        role: new Set(v).size === caseCount ? 'identifier' : 'measure',
        n: v.length,
        mean: m, sd: s, median: median(v),
        maxAbsZ: round2(Math.max(...v.map((x) => Math.abs((x - m) / s)))),
        cv: round2(s / m),
      });
    } else {
      const sizes = {};
      for (const r of rows) { const k = String(r[a.name]); sizes[k] = (sizes[k] ?? 0) + 1; }
      const categories = Object.keys(sizes);
      attrs.push({
        name: a.name,
        kind: 'categorical',
        role: categories.length === caseCount ? 'identifier' : 'category',
        n: rows.length,
        cardinality: categories.length,
        categories,
        groupSizes: sizes,
      });
    }
  }
  const separations = [];
  for (const c of attrs.filter((x) => x.kind === 'categorical')) {
    const smallestGroup = Math.min(...Object.values(c.groupSizes));
    for (const n of attrs.filter((x) => x.kind === 'numeric')) {
      const e = eta2(rows, c.name, n.name);
      separations.push({
        cat: c.name, num: n.name, eta2: e,
        groups: c.cardinality, smallestGroup,
        qualifies: c.role !== 'identifier'
          && c.cardinality >= 2 && c.cardinality <= REF_GROUP_COUNT_CEILING
          && smallestGroup >= REF_MIN_GROUP_SIZE
          && e >= REF_ETA2_FLOOR,
      });
    }
  }
  return { context: 'Mammals', caseCount, attrs, pairs: [], separations };
}

const MODEL = buildMammalsModel();
const attrOf = (m, name) => m.attrs.find((a) => a.name === name);
const sepOf = (m, cat, num) => m.separations.find((s) => s.cat === cat && s.num === num);

// Scenes. `derived` is filled in honestly except where a test deliberately lies.
const derivedFor = (graphs, sceneVersion = 1) => {
  const plottedAttrs = [...new Set(graphs.flatMap((g) => [g.x, g.y, g.legend])
    .filter((n) => typeof n === 'string'))];
  return { plottedAttrs, unplottedAttrs: [], attrPairsPlotted: [], sceneVersion };
};
const scene = (graphs) => ({ graphs, derived: derivedFor(graphs) });
const EMPTY_SCENE = scene([]);
const G_SCATTER = { id: 'g1', plotType: 'scatterPlot', x: 'Mass', y: 'Sleep', legend: null, dataContext: 'Mammals' };
const SCATTER_SCENE = scene([G_SCATTER]);

/** Every attribute name an observation actually speaks about or cites. */
const namesUsed = (o) => [...o.focus, o.evidence?.cat, o.evidence?.num, o.evidence?.attr]
  .filter((n) => typeof n === 'string');
const mentions = (obs, name) => obs.some((o) => namesUsed(o).includes(name));

// ---------------------------------------------------------------------------
// 0. The reference model agrees with the committed measurements
// ---------------------------------------------------------------------------
console.log('\n0. reference DatasetModel vs distribution-shape.mjs (2026-08-28)');
console.log('='.repeat(76));
eq(MODEL.caseCount, 12, 'Mammals has 12 cases');
eq(attrOf(MODEL, 'Mammal').role, 'identifier', 'Mammal is an identifier');
eq(attrOf(MODEL, 'Mammal').cardinality, 12, 'Mammal cardinality 12 = caseCount');
eq(attrOf(MODEL, 'Order').cardinality, 7, 'Order has 7 groups');
eq(sepOf(MODEL, 'Order', 'Mass').smallestGroup, 1, 'Order smallest group is 1');
eq(attrOf(MODEL, 'Diet').cardinality, 3, 'Diet has 3 groups');
eq(sepOf(MODEL, 'Diet', 'Mass').smallestGroup, 3, 'Diet smallest group is 3');
near(attrOf(MODEL, 'Mass').maxAbsZ, 3.08, 'Mass max|z| = 3.08 (African Elephant)');
near(attrOf(MODEL, 'Height').maxAbsZ, 2.42, 'Height max|z| = 2.42 — under the 2.5 gate');
near(sepOf(MODEL, 'Diet', 'Sleep').eta2, 0.82, 'eta2 Diet -> Sleep = 0.82');
near(sepOf(MODEL, 'Diet', 'Speed').eta2, 0.59, 'eta2 Diet -> Speed = 0.59');
near(sepOf(MODEL, 'Diet', 'Height').eta2, 0.47, 'eta2 Diet -> Height = 0.47');
near(sepOf(MODEL, 'Diet', 'Mass').eta2, 0.31, 'eta2 Diet -> Mass = 0.31');
near(sepOf(MODEL, 'Diet', 'LifeSpan').eta2, 0.27, 'eta2 Diet -> LifeSpan = 0.27 — under the floor');
eq(MODEL.separations.filter((s) => s.qualifies).length, 4, 'exactly 4 separations qualify');
ok(MODEL.separations.filter((s) => s.qualifies).every((s) => s.cat === 'Diet'),
  'every qualifying separation is a Diet separation');

// ---------------------------------------------------------------------------
// A. MUST-PASS on Mammals
// ---------------------------------------------------------------------------
console.log('\nA. what the three families earn on the shipping fixture');
console.log('='.repeat(76));

const cmp = observeComparison(MODEL, EMPTY_SCENE);
eq(cmp.length, 4, 'comparison emits 4 observations (one per qualifying measure)');
deepEq(keys(cmp), [
  'comparison:Mammals:Sleep|Diet',
  'comparison:Mammals:Speed|Diet',
  'comparison:Mammals:Height|Diet',
  'comparison:Mammals:Mass|Diet',
], 'comparison keys, strongest first');
near(cmp[0].strength, 0.82, 'strongest comparison is Sleep, strength = eta2 = 0.82');
near(cmp[3].strength, 0.31, 'weakest comparison is Mass, strength = eta2 = 0.31');
deepEq(cmp[0].focus, ['Sleep', 'Diet'], 'comparison focus is [measure, category]');
eq(cmp[0].family, COMPARISON_FAMILY, 'comparison observations carry family "comparison"');
ok(!mentions(cmp, 'Mammal'), 'comparison never names the identifier Mammal');
ok(!mentions(cmp, 'Order'), 'comparison never names Order (7 groups, smallest 1)');
ok(!mentions(cmp, 'LifeSpan'), 'comparison declines LifeSpan (eta2 0.27 under the floor)');

const grp = observeGrouping(MODEL, SCATTER_SCENE);
eq(grp.length, 1, 'grouping emits 1 observation for a Mass-by-Sleep scatter');
eq(grp[0].key, 'grouping:Mammals:Diet', 'grouping key names only the categorical');
deepEq(grp[0].focus, ['Diet'], 'grouping focus is [category] — the graph is spoken as "that"');
eq(grp[0].evidence.num, 'Sleep', 'grouping cites its strongest separation among the plotted measures');
near(grp[0].strength, 0.82, 'grouping strength = eta2 of Diet -> Sleep');
eq(grp[0].scope.componentId, 'g1', 'grouping anchors to the graph it is about');
eq(grp[0].family, GROUPING_FAMILY, 'grouping observations carry family "grouping"');
ok(!mentions(grp, 'Mammal') && !mentions(grp, 'Order'), 'grouping never offers Mammal or Order');

const flt = observeFiltering(MODEL, EMPTY_SCENE);
eq(flt.length, 2, 'filtering emits 2 observations: one subgroup, one outlier');
const fMass = flt.find((o) => o.key === 'filtering:Mammals:Mass');
const fDiet = flt.find((o) => o.key === 'filtering:Mammals:Diet');
ok(!!fMass, 'filtering emits for Mass — the African Elephant outlier');
eq(fMass?.evidence.kind, 'outlier', 'the Mass observation is kind "outlier"');
near(fMass?.evidence.maxAbsZ, 3.08, 'the Mass observation cites |z| = 3.08');
near(fMass?.strength, 0.616, 'Mass outlier strength maps |z| 3.08 to 0.616');
eq(fMass?.family, FILTERING_FAMILY, 'filtering observations carry family "filtering"');
ok(!!fDiet, 'filtering also emits a subgroup observation for Diet');
eq(fDiet?.evidence.kind, 'subgroup', 'the Diet observation is kind "subgroup"');
near(fDiet?.strength, 0.82, 'Diet subgroup strength = eta2 of its best separation');
ok(!flt.some((o) => ['Height', 'Sleep', 'Speed', 'LifeSpan'].includes(o.focus[0])),
  'no other numeric earns an outlier (next highest |z| is Height at 2.42)');
ok(!mentions(flt, 'Mammal') && !mentions(flt, 'Order'), 'filtering never offers Mammal or Order');

// ---------------------------------------------------------------------------
// B. The identifier rule and the group guards, against a LYING analysis
// ---------------------------------------------------------------------------
console.log('\nB. gates that must hold even when `qualifies` is wrong');
console.log('='.repeat(76));

const LIAR = clone(MODEL);
for (const s of LIAR.separations) s.qualifies = true;
const lcmp = observeComparison(LIAR, EMPTY_SCENE);
const lgrp = observeGrouping(LIAR, SCATTER_SCENE);
const lflt = observeFiltering(LIAR, EMPTY_SCENE);
ok(!mentions(lcmp, 'Order') && !mentions(lgrp, 'Order') && !mentions(lflt, 'Order'),
  'qualifies:true on Order changes nothing — 7 groups over 12 cases, smallest 1');
ok(!mentions(lcmp, 'Mammal') && !mentions(lgrp, 'Mammal') && !mentions(lflt, 'Mammal'),
  'qualifies:true on Mammal changes nothing — it is an identifier');
ok(!mentions(lcmp, 'LifeSpan'), 'qualifies:true on Diet -> LifeSpan is still refused by the eta2 floor');
eq(lcmp.length, 4, 'the lying model still yields exactly 4 comparisons');
eq(lgrp.length, 1, 'the lying model still yields exactly 1 grouping');
eq(lflt.length, 2, 'the lying model still yields exactly 2 filterings');

const NO_ROLE = clone(MODEL);
for (const a of NO_ROLE.attrs) delete a.role;
deepEq(keys(observeComparison(NO_ROLE, EMPTY_SCENE)), keys(cmp),
  'identifier caught by cardinality === caseCount when `role` is absent (comparison)');
eq(observeGrouping(NO_ROLE, SCATTER_SCENE).length, 1, 'same, grouping');
eq(observeFiltering(NO_ROLE, EMPTY_SCENE).length, 2, 'same, filtering');

const NO_CARD = clone(MODEL);
for (const a of NO_CARD.attrs) { delete a.cardinality; delete a.groupSizes; }
deepEq(keys(observeComparison(NO_CARD, EMPTY_SCENE)), keys(cmp),
  'identifier caught by `role` when cardinality and groupSizes are absent (comparison)');
eq(observeGrouping(NO_CARD, SCATTER_SCENE).length, 1, 'same, grouping');

const BLIND = clone(MODEL);
for (const a of BLIND.attrs) { delete a.role; delete a.cardinality; delete a.groupSizes; }
for (const s of BLIND.separations) s.qualifies = true;
const bcmp = observeComparison(BLIND, EMPTY_SCENE);
ok(!mentions(bcmp, 'Mammal'), 'with role AND cardinality gone AND a lying qualifies, the '
  + 'separation`s own groups=12 still refuses Mammal');
ok(!mentions(bcmp, 'Order'), 'and groups=7 still refuses Order');

const NO_DIET_ATTR = clone(MODEL);
NO_DIET_ATTR.attrs = NO_DIET_ATTR.attrs.filter((a) => a.name !== 'Diet');
eq(observeComparison(NO_DIET_ATTR, EMPTY_SCENE).length, 0,
  'a separation naming an attribute absent from `attrs` is refused, not trusted (comparison)');
eq(observeGrouping(NO_DIET_ATTR, SCATTER_SCENE).length, 0, 'same, grouping');
eq(observeFiltering(NO_DIET_ATTR, EMPTY_SCENE).length, 1,
  'same, filtering — only the Mass outlier survives');

const UNQUALIFIED = clone(MODEL);
for (const s of UNQUALIFIED.separations) s.qualifies = false;
eq(observeComparison(UNQUALIFIED, EMPTY_SCENE).length, 0, 'no qualifying separation, no comparison');
eq(observeGrouping(UNQUALIFIED, SCATTER_SCENE).length, 0, 'no qualifying separation, no grouping');
eq(observeFiltering(UNQUALIFIED, EMPTY_SCENE).length, 1,
  'no qualifying separation leaves filtering with the outlier alone');

const NO_SEPS = clone(MODEL);
delete NO_SEPS.separations;
eq(observeComparison(NO_SEPS, EMPTY_SCENE).length, 0, 'no separations array at all, no comparison');
eq(observeGrouping(NO_SEPS, SCATTER_SCENE).length, 0, 'no separations array at all, no grouping');
eq(observeFiltering(NO_SEPS, EMPTY_SCENE).length, 1,
  'filtering still finds the outlier without any separations');

// ---------------------------------------------------------------------------
// C. The scene is load-bearing
// ---------------------------------------------------------------------------
console.log('\nC. scene sensitivity');
console.log('='.repeat(76));

eq(observeGrouping(MODEL, EMPTY_SCENE).length, 0,
  'grouping declines with nothing on screen — "that" has no referent');
eq(observeGrouping(MODEL, undefined).length, 0, 'grouping declines with no scene at all');
eq(observeComparison(MODEL, undefined).length, 4, 'comparison does not need a scene');
eq(observeFiltering(MODEL, undefined).length, 2, 'filtering does not need a scene');

const legendScene = scene([{ id: 'g2', plotType: 'dotPlot', x: 'Mass', y: null, legend: 'Diet', dataContext: 'Mammals' }]);
eq(observeGrouping(MODEL, legendScene).length, 0,
  'grouping declines when the graph is already grouped by that categorical');
const cmpLegend = observeComparison(MODEL, legendScene);
ok(!cmpLegend.some((o) => o.key === 'comparison:Mammals:Mass|Diet'),
  'comparison suppresses a pair already shown together (Mass by Diet legend)');
eq(cmpLegend.length, 3, 'the other three comparisons survive');

const catAxisScene = scene([{ id: 'g3', plotType: 'dotPlot', x: 'Diet', y: null, legend: null, dataContext: 'Mammals' }]);
eq(observeGrouping(MODEL, catAxisScene).length, 0,
  'grouping declines when the graph has no numeric on an axis');

const otherContext = scene([{ id: 'g4', plotType: 'scatterPlot', x: 'Weight', y: 'Age', legend: null, dataContext: 'Cats' }]);
eq(observeGrouping(MODEL, otherContext).length, 0, 'a graph of another data context is not "that"');
ok(observeComparison(MODEL, otherContext).every((o) => o.novelty === 1),
  'a graph of another data context does not discount novelty here');

const twoGraphs = scene([
  { id: 'gA', plotType: 'dotPlot', x: 'Sleep', y: null, legend: null, dataContext: 'Mammals' },
  { id: 'gB', plotType: 'dotPlot', x: 'Diet', y: null, legend: null, dataContext: 'Mammals' },
]);
const cmpTwo = observeComparison(MODEL, twoGraphs);
const sleepTwo = cmpTwo.find((o) => o.key === 'comparison:Mammals:Sleep|Diet');
ok(!!sleepTwo, 'two attributes on two SEPARATE graphs are not "shown together"');
near(sleepTwo?.novelty, 0.2, 'but both being on screen drops novelty to 0.2');
eq(sleepTwo?.scope.componentId, 'gA', 'comparison anchors to the graph showing its measure');
eq(observeGrouping(MODEL, twoGraphs).length, 1, 'grouping earns Diet from the Sleep dot plot');
eq(observeGrouping(MODEL, twoGraphs)[0].scope.componentId, 'gA', 'and anchors to that dot plot');

const cmpScatter = observeComparison(MODEL, SCATTER_SCENE);
near(cmpScatter.find((o) => o.key === 'comparison:Mammals:Mass|Diet')?.novelty, 0.6,
  'novelty 0.6 when one of the two named attributes is on screen');
near(cmpScatter.find((o) => o.key === 'comparison:Mammals:Height|Diet')?.novelty, 1,
  'novelty 1 when neither is');
const fltScatter = observeFiltering(MODEL, SCATTER_SCENE);
eq(fltScatter.find((o) => o.key === 'filtering:Mammals:Mass')?.scope.componentId, 'g1',
  'filtering anchors to the graph that is showing the outlier');
near(fltScatter.find((o) => o.key === 'filtering:Mammals:Mass')?.novelty, 0.2,
  'and discounts its novelty accordingly');
eq(fltScatter.find((o) => o.key === 'filtering:Mammals:Diet')?.scope.componentId, null,
  'a dataset-level filtering observation anchors to nothing');

// `derived` is a cache of `graphs`; the modules read `graphs`, which is the
// thing that heals monotonically. A stale or wrong rollup must not move them.
const LYING_SCENE = { graphs: [], derived: { plottedAttrs: ['Mass', 'Diet', 'Sleep'], unplottedAttrs: [], attrPairsPlotted: [['Mass', 'Diet']], sceneVersion: 9 } };
eq(observeGrouping(MODEL, LYING_SCENE).length, 0, 'a lying `derived` cannot invent a graph');
deepEq(keys(observeComparison(MODEL, LYING_SCENE)), keys(cmp),
  'a lying `derived` cannot suppress a comparison');
ok(observeComparison(MODEL, LYING_SCENE).every((o) => o.novelty === 1),
  'a lying `derived` cannot discount novelty');

// grouping must find a separation with an attribute THIS graph shows
const sleepOnly = scene([{ id: 'g5', plotType: 'dotPlot', x: 'LifeSpan', y: null, legend: null, dataContext: 'Mammals' }]);
eq(observeGrouping(MODEL, sleepOnly).length, 0,
  'grouping declines when Diet separates other measures but not the plotted one');

// ---------------------------------------------------------------------------
// D. Determinism, purity, robustness
// ---------------------------------------------------------------------------
console.log('\nD. determinism, purity, robustness');
console.log('='.repeat(76));

const SHUFFLED = clone(MODEL);
SHUFFLED.attrs.reverse();
SHUFFLED.separations.reverse();
SHUFFLED.separations.push(SHUFFLED.separations.shift());
deepEq(observeComparison(SHUFFLED, SCATTER_SCENE), observeComparison(MODEL, SCATTER_SCENE),
  'comparison output does not depend on input order');
deepEq(observeGrouping(SHUFFLED, SCATTER_SCENE), observeGrouping(MODEL, SCATTER_SCENE),
  'grouping output does not depend on input order');
deepEq(observeFiltering(SHUFFLED, SCATTER_SCENE), observeFiltering(MODEL, SCATTER_SCENE),
  'filtering output does not depend on input order');

const snapshot = JSON.stringify(MODEL);
const sceneSnapshot = JSON.stringify(SCATTER_SCENE);
observeComparison(MODEL, SCATTER_SCENE);
observeGrouping(MODEL, SCATTER_SCENE);
observeFiltering(MODEL, SCATTER_SCENE);
eq(JSON.stringify(MODEL), snapshot, 'no family mutates the dataset it is given');
eq(JSON.stringify(SCATTER_SCENE), sceneSnapshot, 'no family mutates the scene it is given');
deepEq(observeComparison(MODEL, SCATTER_SCENE), observeComparison(MODEL, SCATTER_SCENE),
  'two consecutive calls agree exactly');

for (const [name, fn] of [['comparison', observeComparison], ['grouping', observeGrouping], ['filtering', observeFiltering]]) {
  let threw = null;
  const results = [];
  for (const bad of [undefined, null, {}, { context: 'X' }, { context: 'X', attrs: 'nope' },
    { context: '', attrs: [], separations: [] }, { attrs: [], separations: [] }]) {
    try { results.push(fn(bad, undefined)); } catch (e) { threw = e; break; }
  }
  ok(!threw, name + ' survives malformed datasets', threw ? String(threw) : '');
  ok(results.every((r) => Array.isArray(r) && r.length === 0), name + ' returns [] for every malformed dataset');
  let threw2 = null;
  try { fn(MODEL, { graphs: 'nope' }); fn(MODEL, { graphs: [null, {}] }); } catch (e) { threw2 = e; }
  ok(!threw2, name + ' survives a malformed scene', threw2 ? String(threw2) : '');
}

const BANNED = [
  [/\bDate\s*\.\s*now\b/, 'Date.now'],
  [/\bMath\s*\.\s*random\b/, 'Math.random'],
  [/\bperformance\b/, 'performance'],
  [/\bwindow\b/, 'window'],
  [/\bdocument\b/, 'document'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bnew\s+Date\b/, 'new Date'],
  [/\bexport\s+default\b/, 'export default'],
  [/\brequire\s*\(/, 'require('],
];
for (const f of FILES) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const [re, label] of BANNED) ok(!re.test(code), f + ' contains no ' + label);
  ok(/^\/\*\*[\s\S]*?2026-08-28[\s\S]*?\*\//.test(raw.trim()),
    f + ' opens with a JSDoc header carrying dated evidence');
  ok(/\bexport function observe[A-Z]/.test(raw), f + ' exports a named observe* function');
  ok(!/\u0000/.test(raw), f + ' contains no NUL bytes');
  const numericConsts = raw.split('\n').filter((l) => /^const [A-Z][A-Z0-9_]* = -?[0-9.]+;/.test(l));
  ok(numericConsts.length >= 4, f + ' declares its thresholds as module constants ('
    + numericConsts.length + ')');
  ok(numericConsts.every((l) => /;\s+\/\/ \S+/.test(l)),
    f + ' gives every numeric constant a trailing unit-and-rationale comment');
}

// ---------------------------------------------------------------------------
// E. Contract conformance
// ---------------------------------------------------------------------------
console.log('\nE. every observation matches contracts.js');
console.log('='.repeat(76));

const ALL = [...observeComparison(MODEL, SCATTER_SCENE), ...observeGrouping(MODEL, SCATTER_SCENE),
  ...observeFiltering(MODEL, SCATTER_SCENE)];
eq(ALL.length, 7, 'seven observations across the three families on this scene');
const names = new Set(MODEL.attrs.map((a) => a.name));
let bad = null;
for (const o of ALL) {
  const why = (m) => { if (!bad) bad = o.key + ': ' + m; };
  if (!['comparison', 'grouping', 'filtering'].includes(o.family)) why('bad family');
  if (typeof o.key !== 'string' || !new RegExp('^' + o.family + ':Mammals:[^:]+$').test(o.key)) why('bad key');
  if (o.dataContext !== 'Mammals') why('bad dataContext');
  if (!Array.isArray(o.focus) || !o.focus.length) why('bad focus');
  if (!o.focus.every((n) => names.has(n))) why('focus names an attribute not in the dataset');
  if (o.key !== o.family + ':Mammals:' + o.focus.join(KEY_SEPARATOR)) why('key does not spell out focus');
  if (!o.evidence || typeof o.evidence !== 'object' || !Object.keys(o.evidence).length) why('bad evidence');
  if (!(o.strength >= 0 && o.strength <= 1)) why('strength out of range');
  if (!(o.novelty >= 0 && o.novelty <= 1)) why('novelty out of range');
  if (!o.scope || !('componentId' in o.scope)) why('bad scope');
  if ('text' in o) why('an observation carries text — realization is W2 s job');
  for (const v of Object.values(o.evidence)) {
    if (typeof v === 'string' && /\s\w+\s/.test(v)) why('evidence contains prose: ' + v);
  }
}
ok(!bad, 'every observation conforms to the Observation contract', bad ?? '');
eq(new Set(ALL.map((o) => o.key)).size, ALL.length, 'keys are unique within a run');

// ---------------------------------------------------------------------------
// F. Boundaries — the exact value at which each gate opens
// ---------------------------------------------------------------------------
console.log('\nF. gate boundaries on synthetic datasets');
console.log('='.repeat(76));

/** A minimal model: one categorical with `groups` equal groups of `size`, one numeric. */
function synth({ groups, size, eta2: e }) {
  const caseCount = groups * size;
  const groupSizes = {};
  for (let i = 0; i < groups; i++) groupSizes['g' + i] = size;
  return {
    context: 'Synth', caseCount, pairs: [],
    attrs: [
      { name: 'Cat', kind: 'categorical', role: 'category', n: caseCount,
        cardinality: groups, categories: Object.keys(groupSizes), groupSizes },
      { name: 'Num', kind: 'numeric', role: 'measure', n: caseCount, mean: 1, sd: 1, maxAbsZ: 1 },
    ],
    separations: [{ cat: 'Cat', num: 'Num', eta2: e, groups, smallestGroup: size, qualifies: true }],
  };
}
const synthScene = scene([{ id: 's1', plotType: 'dotPlot', x: 'Num', y: null, legend: null, dataContext: 'Synth' }]);
const counts = (m) => [observeComparison(m, synthScene).length, observeGrouping(m, synthScene).length,
  observeFiltering(m, synthScene).length];

deepEq(counts(synth({ groups: 4, size: 3, eta2: 0.5 })), [1, 1, 1], '4 groups of 3 at eta2 0.50 — all three earn');
deepEq(counts(synth({ groups: 5, size: 3, eta2: 0.5 })), [0, 0, 0], '5 groups is over the ceiling — none earn');
deepEq(counts(synth({ groups: 3, size: 2, eta2: 0.5 })), [0, 0, 0], 'a smallest group of 2 — none earn');
deepEq(counts(synth({ groups: 1, size: 6, eta2: 0.9 })), [0, 0, 0], 'a single group is not a comparison');
deepEq(counts(synth({ groups: 3, size: 3, eta2: 0.30 })), [1, 1, 1], 'eta2 exactly at the 0.30 floor earns');
deepEq(counts(synth({ groups: 3, size: 3, eta2: 0.29 })), [0, 0, 0], 'eta2 at 0.29 does not');

/** A minimal model with one numeric carrying an outlier of `z` over `n` cases. */
const outlierModel = (z, n) => ({
  context: 'Synth', caseCount: n, pairs: [], separations: [],
  attrs: [{ name: 'Num', kind: 'numeric', role: 'measure', n, mean: 1, sd: 1, maxAbsZ: z }],
});
eq(observeFiltering(outlierModel(2.51, 12), EMPTY_SCENE).length, 1, '|z| 2.51 earns a filtering');
eq(observeFiltering(outlierModel(2.50, 12), EMPTY_SCENE).length, 0, '|z| exactly 2.50 does not');
eq(observeFiltering(outlierModel(2.60, 8), EMPTY_SCENE).length, 1, '8 non-blank cases is enough');
eq(observeFiltering(outlierModel(2.60, 7), EMPTY_SCENE).length, 0,
  '7 is not — with a population sd, max |z| <= (n-1)/sqrt(n) = 2.27 there anyway');
near(observeFiltering(outlierModel(5.0, 12), EMPTY_SCENE)[0].strength, 1, '|z| 5 saturates strength at 1');
near(observeFiltering(outlierModel(9.9, 12), EMPTY_SCENE)[0].strength, 1, 'and beyond 5 it stays at 1');
near(observeFiltering(outlierModel(2.6, 12), EMPTY_SCENE)[0].strength, 0.52, '|z| 2.6 maps to 0.52');

const idNumeric = outlierModel(4, 12);
idNumeric.attrs[0].role = 'identifier';
eq(observeFiltering(idNumeric, EMPTY_SCENE).length, 0, 'an identifier numeric earns no filtering');
const idByCard = outlierModel(4, 12);
delete idByCard.attrs[0].role;
idByCard.attrs[0].cardinality = 12;
eq(observeFiltering(idByCard, EMPTY_SCENE).length, 0,
  'nor does one whose cardinality equals the case count');
const noZ = outlierModel(4, 12);
delete noZ.attrs[0].maxAbsZ;
eq(observeFiltering(noZ, EMPTY_SCENE).length, 0, 'an attribute with no maxAbsZ earns nothing');

// ---------------------------------------------------------------------------
// G. The identifier rule where it is the ONLY guard
// ---------------------------------------------------------------------------
// Added 2026-08-28. Section B tests the identifier rule only through `Mammal`,
// where `groups === 12` is over the ceiling and `smallestGroup === 1` is under
// the floor — so two other guards refuse it first and deleting the identifier
// check entirely left the suite green. These cases are built so that EVERY
// other gate passes and `role`/`cardinality` is the single thing standing
// between the input and an observation.
console.log('\nG. the identifier rule, unmasked');
console.log('='.repeat(76));

/**
 * 3 groups of 3, eta2 0.5, smallest group 3 — a separation that clears every
 * numeric gate this family has. `over` corrupts exactly one attribute.
 */
function honestSynth({ catOver = {}, numOver = {}, caseCount = 9 } = {}) {
  return {
    context: 'Synth', caseCount, pairs: [],
    attrs: [
      { name: 'Cat', kind: 'categorical', role: 'category', n: 9,
        cardinality: 3, categories: ['a', 'b', 'c'], groupSizes: { a: 3, b: 3, c: 3 }, ...catOver },
      { name: 'Num', kind: 'numeric', role: 'measure', n: 9, mean: 1, sd: 1, maxAbsZ: 1, ...numOver },
    ],
    separations: [{ cat: 'Cat', num: 'Num', eta2: 0.5, groups: 3, smallestGroup: 3, qualifies: true }],
  };
}
const gScene = scene([{ id: 'sg', plotType: 'dotPlot', x: 'Num', y: null, legend: null, dataContext: 'Synth' }]);

// CONTROL first: with nothing corrupted, all three families earn. Every `0`
// below is therefore the identifier rule and nothing else.
deepEq([observeComparison(honestSynth(), gScene).length, observeGrouping(honestSynth(), gScene).length,
  observeFiltering(honestSynth(), gScene).length], [1, 1, 1],
'CONTROL: an honest 3-groups-of-3 separation earns from all three families');

const catIsIdRole = honestSynth({ catOver: { role: 'identifier' } });
eq(observeComparison(catIsIdRole, gScene).length, 0,
  'comparison refuses an identifier CATEGORICAL on `role` alone — groups 3, smallest 3, eta2 0.50 all pass');
eq(observeGrouping(catIsIdRole, gScene).length, 0, 'same, grouping');
eq(observeFiltering(catIsIdRole, gScene).length, 0, 'same, filtering');

// `cardinality === caseCount` is the definition; with `role` absent it is the
// only signal left. 3 categories over 3 cases, groups still 3, smallest 3.
const catIsIdCard = honestSynth({ caseCount: 3, catOver: { role: undefined } });
eq(observeComparison(catIsIdCard, gScene).length, 0,
  'comparison refuses a categorical whose cardinality equals caseCount, with `role` absent');
eq(observeGrouping(catIsIdCard, gScene).length, 0, 'same, grouping');
eq(observeFiltering(catIsIdCard, gScene).length, 0, 'same, filtering');

const numIsId = honestSynth({ numOver: { role: 'identifier' } });
eq(observeComparison(numIsId, gScene).length, 0,
  'comparison refuses an identifier MEASURE — you cannot compare the means of a row id');
eq(observeGrouping(numIsId, gScene).length, 0, 'same, grouping');
eq(observeFiltering(numIsId, gScene).length, 0, 'same, filtering');

const catNotCategorical = honestSynth({ catOver: { kind: 'numeric' } });
eq(observeComparison(catNotCategorical, gScene).length, 0,
  'comparison refuses to group by an attribute CODAP calls numeric, whatever the separation says');
const numNotNumeric = honestSynth({ numOver: { kind: 'categorical' } });
eq(observeComparison(numNotNumeric, gScene).length, 0, '...and refuses a categorical as the measure');
eq(observeGrouping(numNotNumeric, gScene).length, 0, 'same, grouping');

// ---------------------------------------------------------------------------
// H. One key separator across all seven families; no dead guard in grouping
// ---------------------------------------------------------------------------
console.log('\nH. cross-family key contract, and grouping has no unreachable guard');
console.log('='.repeat(76));

const SEPARATORS = [['comparison', KEY_SEPARATOR], ['grouping', GRP_SEP], ['filtering', FLT_SEP],
  ['distribution', DIS_SEP], ['ordering', ORD_SEP], ['relationship', REL_SEP], ['second-dimension', SD_SEP]];
for (const [name, sep] of SEPARATORS) eq(sep, '|', name + '.js exports KEY_SEPARATOR = "|"');
eq(new Set(SEPARATORS.map(([, s]) => s)).size, 1, 'all seven families agree on one separator');

// THE STATED PATTERN, for every family: `family ':' context ':' names.join(sep)`
// where `names` is the focus attributes in a deterministic order. Asserted here
// as a permutation of `focus`, because `relationship` sorts its two names while
// the rest speak them in focus order.
let patternBad = null;
for (const o of ALL) {
  const parts = o.key.split(':');
  const why = (m) => { if (!patternBad) patternBad = o.key + ': ' + m; };
  if (parts.length !== 3) { why('not family:context:names'); continue; }
  if (parts[0] !== o.family) why('first part is not the family');
  if (parts[1] !== o.dataContext) why('second part is not dataContext');
  const namesInKey = parts[2].split(KEY_SEPARATOR);
  if (JSON.stringify([...namesInKey].sort()) !== JSON.stringify([...o.focus].sort())) why('names are not focus');
  if (o.key.includes('~')) why("still uses the old '~' separator");
}
ok(!patternBad, 'every key matches the one stated pattern', patternBad ?? '');

// The other half of the cross-family decision: a graph whose `dataContext` is
// `null` does not belong to this context. `web/src/scene-model.js:70-75` emits
// `null` deliberately, and only for a graph with nothing dropped on it. These
// three families already required strict equality; `relationship.js` and
// `second-dimension.js` were changed to match, and the assertion is stated here
// so the three cannot drift the other way.
const NULL_CONTEXT_SCENE = scene([{ id: 'gnull', plotType: 'dotPlot', x: 'Sleep', y: null, legend: null, dataContext: null }]);
eq(observeGrouping(MODEL, NULL_CONTEXT_SCENE).length, 0,
  'a graph with no stated data context is not "that" — grouping declines');
ok(observeComparison(MODEL, NULL_CONTEXT_SCENE).every((o) => o.novelty === 1
  && o.scope.componentId === null),
'a graph with no stated data context neither discounts novelty nor anchors a comparison');
ok(observeFiltering(MODEL, NULL_CONTEXT_SCENE).every((o) => o.scope.componentId === null),
  '...nor anchors a filtering');

// The dead guard. `bestSeparation` in grouping.js only ever sees a `sep` whose
// `cat` came from the `candidates` filter and whose `num` is in `shown`, and
// both of those already applied the identifier rule, the kind rule, the
// cardinality range and the smallest-group floor. The copy inside `qualifying`
// was therefore unreachable while the header claimed it was load-bearing.
// A behavioural test cannot see this — the behaviour is identical either way —
// so it is asserted at the source, paired with section G above, which proves
// the rules themselves still hold.
const groupingSrc = readFileSync(join(SRC, 'grouping.js'), 'utf8');
const qualifyingAt = groupingSrc.indexOf('function qualifying(');
ok(qualifyingAt > 0, 'grouping.js still has a `qualifying` function to inspect');
let depth = 0; let end = qualifyingAt;
for (let i = groupingSrc.indexOf('{', qualifyingAt); i < groupingSrc.length; i++) {
  if (groupingSrc[i] === '{') depth++;
  else if (groupingSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const qualifyingBody = groupingSrc.slice(qualifyingAt, end + 1)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
for (const dead of ['isIdentifier', 'smallestGroupSize', 'cardinality', '.kind', 'byName']) {
  ok(!qualifyingBody.includes(dead),
    'grouping.js `qualifying` no longer re-checks ' + dead + ' — unreachable there, enforced on the attributes',
    qualifyingBody);
}
// ...and the rules must still exist SOMEWHERE in the file. Deleting the dead
// copy must not become an excuse for deleting the live one.
for (const live of ['isIdentifier', 'smallestGroupSize', 'cardinality']) {
  ok(groupingSrc.includes(live), 'grouping.js still enforces ' + live + ' somewhere');
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(76));
if (failures) {
  console.log('FAILED — ' + failures + ' assertion' + (failures === 1 ? '' : 's'));
  process.exit(1);
}
console.log('OK — comparison, grouping and filtering all earn exactly what the data supports');
