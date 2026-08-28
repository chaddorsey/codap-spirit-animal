/**
 * t-realize.mjs — the asserting test for module J of plan `-002` wave W2:
 * `web/src/wonderings/realize.js`.
 *
 *   node docs/verification/wonderings/t-realize.mjs
 *
 * Exits 0 only if every assertion holds; exits 1 otherwise. Dependency-free —
 * node builtins plus the repo's own source, no framework, no npm install.
 *
 * WHAT THIS TEST IS DEFENDING. The W2 completion metric is "`t-realize.mjs`
 * exits 0 and 100 % of emitted strings pass the lint", and that metric alone is
 * satisfiable by a stub: `realize = () => null` emits nothing, so 100 % of
 * nothing passes. Three things are therefore asserted together, and no two of
 * them can be met by the same cheat:
 *
 *   A. COVERAGE — every Observation the SEVEN families emit over the real
 *      12-case Mammals fixture realizes to text. Not a hand-built literal: the
 *      DatasetModel below is built by calling `web/src/analysis/correlation.js`,
 *      `analysis/distribution.js` and `analysis/grouping.js`, so the test moves
 *      when the analysis moves. `() => null` fails here.
 *   B. CLEANLINESS — every one of those strings passes `lintWondering` with the
 *      observation's own `focus`. A realizer that ignores the lint fails here as
 *      soon as an attribute name is unreadable.
 *   C. REACHABILITY — for every family, every variant and every arity, EVERY
 *      phrasing in the table is reached by some key and is itself lint-clean
 *      (section E). A single hard-coded sentence per family fails here, and so
 *      does a table with one dud phrasing in it that the fixture happens never
 *      to select.
 *
 * Plus the refusals (section D), which are the half a stub gets wrong in the
 * other direction: an arity with no template, an unreadable attribute name, a
 * filtering observation with no `evidence.kind`, and a duplicated focus name
 * must each return `null` rather than a malformed sentence.
 *
 * WHY SECTION F RUNS THE PLAN'S OWN STEMS THROUGH THE LINT. `realize.js`'s
 * header claims three of the seven stems in plan `-001`'s family table are not
 * shippable text, and that a fourth passes only on a word-boundary technicality.
 * That claim is load-bearing — it is the reason the phrasings are re-written
 * rather than copied — so it is measured here rather than asserted in prose.
 *
 * Measured 2026-08-28.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import { correlatePairs } from '../../../web/src/analysis/correlation.js';
import { shape } from '../../../web/src/analysis/distribution.js';
import { role, groupSizes, separations } from '../../../web/src/analysis/grouping.js';
import { lintWondering, renderAttributeName } from '../../../web/src/wonderings/lint.js';
import { distributionFamily } from '../../../web/src/wonderings/families/distribution.js';
import { orderingFamily } from '../../../web/src/wonderings/families/ordering.js';
import { relationshipObservations } from '../../../web/src/wonderings/families/relationship.js';
import { secondDimensionObservations } from '../../../web/src/wonderings/families/second-dimension.js';
import { observeComparison } from '../../../web/src/wonderings/families/comparison.js';
import { observeGrouping } from '../../../web/src/wonderings/families/grouping.js';
import { observeFiltering } from '../../../web/src/wonderings/families/filtering.js';
import {
  realize, phrasingHash, PARTIAL_FRAMING_LABEL, REALIZABLE_FAMILIES,
} from '../../../web/src/wonderings/realize.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REALIZE_SRC = join(HERE, '..', '..', '..', 'web', 'src', 'wonderings', 'realize.js');

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(Object.is(a, b), label,
  `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const isNull = (v, label) => ok(v === null, label,
  `expected null, got ${JSON.stringify(v)}`);
const j = (v) => JSON.stringify(v);

/** Number of probe keys used wherever the test has to search the hash space.
 *  512 is far above the largest phrasing list (6), so a table entry that is
 *  never reached in 512 draws is unreachable in practice, not unlucky. */
const PROBE_KEYS = 512;

/** The lint's hard cap, restated here so this test does not import the number
 *  it is checking from the module it is checking. */
const MAX_CHARS = 70;

// ---------------------------------------------------------------------------
// The real Mammals DatasetModel, built by the real analysis modules.
// ---------------------------------------------------------------------------
function mammalsModel() {
  const rows = MAMMALS;
  const caseCount = rows.length;
  const roles = {};
  const attrs = [];
  for (const a of MAMMALS_COLLECTION.attrs) {
    const values = rows.map((r) => r[a.name]);
    const inferred = role(a.name, values, caseCount);
    // CODAP's declared type wins over inference for `kind`; `role` is the
    // analysis's own conclusion and is left alone except that a declared
    // numeric which is not an identifier is a measure by definition.
    roles[a.name] = a.type === 'numeric' && inferred !== 'identifier' ? 'measure' : inferred;
    if (a.type === 'numeric') {
      const s = shape(values);
      attrs.push({
        name: a.name, kind: 'numeric', role: roles[a.name], n: s.n,
        mean: s.mean, sd: s.sd, median: s.median, skew: s.skew,
        gapFrac: s.gapFrac, maxAbsZ: s.maxAbsZ, cv: s.cv,
      });
    } else {
      const sizes = groupSizes(rows, a.name);
      const categories = Object.keys(sizes);
      attrs.push({
        name: a.name, kind: 'categorical', role: roles[a.name],
        n: values.filter((v) => v != null && v !== '').length,
        cardinality: categories.length, categories, groupSizes: sizes,
      });
    }
  }
  const numerics = attrs.filter((a) => a.kind === 'numeric' && a.role !== 'identifier').map((a) => a.name);
  const cats = attrs.filter((a) => a.kind === 'categorical' && a.role !== 'identifier').map((a) => a.name);
  return {
    context: 'Mammals', caseCount, attrs,
    pairs: correlatePairs(rows, numerics),
    separations: separations(rows, cats, numerics, { roles }),
  };
}

const DATASET = mammalsModel();
const attrOf = (name) => DATASET.attrs.find((a) => a.name === name);

const derivedFor = (graphs) => ({
  plottedAttrs: [...new Set(graphs.flatMap((g) => [g.x, g.y, g.legend])
    .filter((n) => typeof n === 'string'))],
  unplottedAttrs: [], attrPairsPlotted: [], sceneVersion: 1,
});
const scene = (graphs) => ({ graphs, derived: derivedFor(graphs) });

/** Three scenes, because three of the seven families are gated on the screen:
 *  second-dimension needs a univariate plot, grouping needs any graph showing a
 *  measure, and the rest emit with an empty workspace. */
const SCENES = {
  empty: scene([]),
  dotplot: scene([{ id: 'g1', plotType: 'dotPlot', x: 'Sleep', y: null, legend: null, dataContext: 'Mammals' }]),
  scatter: scene([{ id: 'g2', plotType: 'scatterPlot', x: 'Mass', y: 'Sleep', legend: null, dataContext: 'Mammals' }]),
};

const FAMILIES = {
  distribution: distributionFamily,
  ordering: orderingFamily,
  relationship: relationshipObservations,
  'second-dimension': secondDimensionObservations,
  comparison: observeComparison,
  grouping: observeGrouping,
  filtering: observeFiltering,
};

// ---------------------------------------------------------------------------
console.log('\nA. the DatasetModel under test is the real one');
console.log('='.repeat(76));

eq(DATASET.caseCount, 12, 'Mammals has 12 cases');
eq(attrOf('Mammal').role, 'identifier', '`Mammal` is an identifier (cardinality 12 of 12)');
eq(attrOf('Diet').cardinality, 3, '`Diet` has 3 groups (added in W0)');
eq(DATASET.pairs.filter((p) => p.qualifies).length, 2,
  'exactly 2 numeric pairs clear the n = 12 significance floor');
eq(DATASET.separations.filter((s) => s.qualifies).length, 4,
  'exactly 4 categorical x numeric separations qualify, all on `Diet`');
ok(DATASET.separations.filter((s) => s.qualifies).every((s) => s.cat === 'Diet'),
  'no separation on `Order` (7 groups) or `Mammal` (identifier) qualifies');

// ---------------------------------------------------------------------------
console.log('\nB. every observation the seven families emit realizes, lint-clean');
console.log('='.repeat(76));

/** One entry per distinct observation key, across all families and scenes. */
const REALIZED = [];
const perFamily = new Map();

for (const [family, observe] of Object.entries(FAMILIES)) {
  const seen = new Set();
  const rows = [];
  for (const [sceneName, sc] of Object.entries(SCENES)) {
    for (const observation of observe(DATASET, sc)) {
      if (seen.has(observation.key)) continue;
      seen.add(observation.key);
      const before = j(observation);
      const result = realize(observation);
      if (result === null) {
        failures++;
        console.log(`  FAIL  ${family} (${sceneName}) ${observation.key} realized to null`);
        continue;
      }
      if (j(observation) !== before) {
        failures++;
        console.log(`  FAIL  realize() mutated the observation ${observation.key}`);
      }
      rows.push({ family, sceneName, observation, ...result });
      REALIZED.push({ family, sceneName, observation, ...result });
    }
  }
  perFamily.set(family, rows);
}

for (const family of REALIZABLE_FAMILIES) {
  const rows = perFamily.get(family) ?? [];
  ok(rows.length > 0, `family ${family} produced at least one wondering`,
    'the family emitted no observation on the Mammals fixture in any of the three scenes');
}

let cleanCount = 0;
for (const { family, observation, text, provenance } of REALIZED) {
  const verdict = lintWondering(text, observation.focus);
  if (!ok(verdict.ok, `lint-clean: ${text}`, `${family}: ${verdict.violations.join('; ')}`)) continue;
  cleanCount++;
  ok(text.length <= MAX_CHARS && text.trim() === text && text.endsWith('?'),
    `well-formed (${text.length} chars): ${text}`);
  // The sentence must actually NAME what the observation is about. This is the
  // assertion a template that quietly dropped a slot would fail.
  for (const raw of observation.focus) {
    const rendered = renderAttributeName(raw);
    ok(text.toLowerCase().includes(rendered.text),
      `names "${rendered.text}" (from ${raw}) in: ${text}`);
  }
  // Provenance carries the evidence for "Dot's mind", and carries a COPY.
  eq(provenance.family, observation.family, `provenance names the family for ${observation.key}`);
  eq(provenance.key, observation.key, `provenance carries the key ${observation.key}`);
  eq(j(provenance.evidence), j(observation.evidence ?? {}),
    `provenance carries the evidence for ${observation.key}`);
  ok(provenance.evidence !== observation.evidence,
    `provenance.evidence is a copy, not the family's object (${observation.key})`);
  eq(provenance.framing, 'partial', `provenance records partial framing for ${observation.key}`);
}
eq(cleanCount, REALIZED.length,
  `100% of emitted strings pass the lint (${cleanCount}/${REALIZED.length})`);
ok(REALIZED.length >= 14, `the fixture yields a reviewable number of wonderings (${REALIZED.length})`);

// A realizer that always picked phrasing 0 would still pass everything above.
const distinctPhrasings = new Set(REALIZED.map((r) => r.provenance.phrasing));
ok(distinctPhrasings.size >= 7,
  `the fixture's wonderings use ${distinctPhrasings.size} distinct phrasings, not one per family`,
  [...distinctPhrasings].join(', '));

// ---------------------------------------------------------------------------
console.log('\nC. the same observation always reads the same way');
console.log('='.repeat(76));

for (const { observation, text } of REALIZED) {
  const again = realize(observation);
  eq(again?.text, text, `identical on a second call: ${text}`);
  // Structural identity, not object identity: a rebuilt observation carrying
  // the same key must read the same, because the corpus is rebuilt each run.
  const rebuilt = JSON.parse(j(observation));
  eq(realize(rebuilt)?.text, text, `identical for a rebuilt observation: ${observation.key}`);
}

// The hash must depend on the key and nothing else.
eq(phrasingHash('distribution:Mammals:Mass'), phrasingHash('distribution:Mammals:Mass'),
  'phrasingHash is a function of its input');
ok(phrasingHash('distribution:Mammals:Mass') !== phrasingHash('distribution:Mammals:Sleep'),
  'phrasingHash separates two real keys');
{
  const base = { family: 'distribution', key: 'distribution:Mammals:Mass', dataContext: 'Mammals', focus: ['Mass'], evidence: {}, strength: 0.9, novelty: 0.5, scope: { componentId: null } };
  const moved = { ...base, strength: 0.1, novelty: 0.0, scope: { componentId: 'g9' }, evidence: { n: 12 } };
  eq(realize(moved)?.text, realize(base)?.text,
    'phrasing depends on `key` alone — not on strength, novelty, scope or evidence');
  const other = { ...base, key: 'distribution:Mammals:Sleep', focus: ['Sleep'] };
  ok(realize(other)?.provenance.phrasing !== undefined, 'a different key still realizes');
}

// ---------------------------------------------------------------------------
console.log('\nD. the refusals — null, never a malformed sentence');
console.log('='.repeat(76));

const obs = (over) => ({
  family: 'distribution', key: 'distribution:Mammals:Mass', dataContext: 'Mammals',
  focus: ['Mass'], evidence: {}, strength: 0.5, novelty: 0.5,
  scope: { componentId: null }, ...over,
});

// An attribute in `focus` with no template slot. Both directions.
isNull(realize(obs({ focus: ['Mass', 'Sleep'] })),
  'distribution with TWO focus names has no template slot for the second');
isNull(realize(obs({ family: 'ordering', focus: ['Mass', 'Sleep'] })),
  'ordering with two focus names returns null');
isNull(realize(obs({ family: 'grouping', focus: ['Diet', 'Order'] })),
  'grouping with two focus names returns null');
isNull(realize(obs({ family: 'relationship', focus: ['Mass'], key: 'relationship:Mammals:Mass' })),
  'relationship with ONE focus name returns null (no one-slot phrasing exists)');
isNull(realize(obs({ family: 'filtering', focus: ['Mass', 'Diet'], evidence: { kind: 'outlier' } })),
  'filtering with two focus names returns null');

// Unreadable attribute names — the rule the lint exists for.
for (const bad of ['Ht_cm', 'msleep', 'body_wt', 'bmi', 'x', 'AnExtremelyLongColumnNameIndeed']) {
  isNull(realize(obs({ focus: [bad], key: `distribution:Mammals:${bad}` })),
    `unreadable attribute name "${bad}" suppresses the wondering`);
}
isNull(realize(obs({ family: 'relationship', focus: ['Height', 'Ht_cm'], key: 'relationship:Mammals:Height|Ht_cm' })),
  'one unreadable name of two suppresses the whole relationship wondering');

// The filtering variants.
isNull(realize(obs({ family: 'filtering', focus: ['Mass'], evidence: {} })),
  'filtering with no `evidence.kind` returns null (the two kinds read differently)');
isNull(realize(obs({ family: 'filtering', focus: ['Mass'], evidence: { kind: 'sideways' } })),
  'filtering with an unknown `evidence.kind` returns null');
ok(realize(obs({ family: 'filtering', focus: ['Mass'], evidence: { kind: 'outlier' } })) !== null,
  'filtering WITH kind=outlier realizes');
ok(realize(obs({ family: 'filtering', focus: ['Diet'], evidence: { kind: 'subgroup' } })) !== null,
  'filtering WITH kind=subgroup realizes');

// Shape guards.
isNull(realize(obs({ family: 'wondering-about-wonderings' })), 'an unknown family returns null');
isNull(realize(obs({ family: 'relationship', focus: ['Mass', 'Mass'] })),
  'a duplicated focus name returns null ("how does mass go with mass?" is lint-clean and empty)');
isNull(realize(obs({ focus: [] })), 'an empty focus returns null');
isNull(realize(obs({ focus: ['   '] })), 'a blank focus name returns null');
isNull(realize(obs({ focus: [null] })), 'a non-string focus entry returns null');
isNull(realize(obs({ family: 42 })), 'a non-string family returns null');
isNull(realize(null), 'null returns null');
isNull(realize(undefined), 'undefined returns null');
isNull(realize('distribution'), 'a string returns null');
isNull(realize(7), 'a number returns null');
isNull(realize({}), 'an empty object returns null');

// ---------------------------------------------------------------------------
console.log('\nE. every phrasing in the table is reachable AND lint-clean');
console.log('='.repeat(76));

/**
 * One probe per (family, variant, arity) the module offers. `focus` uses real
 * Mammals names so the rendered text is the text a student would see.
 */
const PROBES = [
  { label: 'distribution/1', family: 'distribution', focus: ['LifeSpan'], evidence: {} },
  { label: 'ordering/1', family: 'ordering', focus: ['LifeSpan'], evidence: {} },
  { label: 'relationship/2', family: 'relationship', focus: ['LifeSpan', 'Height'], evidence: {} },
  { label: 'second-dimension/2', family: 'second-dimension', focus: ['LifeSpan', 'Height'], evidence: {} },
  { label: 'second-dimension/1', family: 'second-dimension', focus: ['LifeSpan'], evidence: {} },
  { label: 'comparison/2', family: 'comparison', focus: ['LifeSpan', 'Diet'], evidence: {} },
  { label: 'comparison/1', family: 'comparison', focus: ['LifeSpan'], evidence: {} },
  { label: 'grouping/1', family: 'grouping', focus: ['Diet'], evidence: {} },
  { label: 'filtering/outlier', family: 'filtering', focus: ['LifeSpan'], evidence: { kind: 'outlier' } },
  { label: 'filtering/subgroup', family: 'filtering', focus: ['Diet'], evidence: { kind: 'subgroup' } },
];

let totalPhrasings = 0;
for (const probe of PROBES) {
  const found = new Map();     // phrasing id -> text
  let expected = null;
  for (let i = 0; i < PROBE_KEYS; i++) {
    const result = realize({ ...probe, key: `${probe.family}:Probe:${i}` });
    if (result === null) { failures++; console.log(`  FAIL  ${probe.label} realized to null on probe ${i}`); break; }
    expected = result.provenance.phrasingCount;
    if (!found.has(result.provenance.phrasing)) found.set(result.provenance.phrasing, result.text);
  }
  ok(expected !== null && found.size === expected,
    `${probe.label}: all ${expected} phrasings reachable (${found.size} seen in ${PROBE_KEYS} keys)`);
  ok(expected > 1, `${probe.label}: more than one phrasing exists (${expected})`);
  totalPhrasings += found.size;
  for (const [id, text] of found) {
    const verdict = lintWondering(text, probe.focus);
    ok(verdict.ok, `  ${probe.label}/${id}: ${text}`, verdict.violations.join('; '));
    for (const raw of probe.focus) {
      ok(text.toLowerCase().includes(renderAttributeName(raw).text),
        `  ${probe.label}/${id} names ${raw}`);
    }
  }
}
ok(totalPhrasings >= 40, `the phrasing table holds ${totalPhrasings} distinct phrasings`);

// The retry walk: a phrasing that fails the lint must be skipped, not shipped.
// Two long-but-readable names push five of the six relationship phrasings past
// the 70-character cap, leaving exactly one that fits.
{
  const LONG = ['SleeperCarriageWeight', 'ScatteredForestCover'];
  let retried = null;
  for (let i = 0; i < PROBE_KEYS && retried === null; i++) {
    const r = realize({ family: 'relationship', key: `relationship:Long:${i}`, focus: LONG, evidence: {} });
    if (r && r.provenance.attempts > 1) retried = r;
  }
  ok(retried !== null, 'a lint failure is retried with the next phrasing, not shipped');
  if (retried) {
    ok(retried.provenance.rejected.length === retried.provenance.attempts - 1,
      `every skipped phrasing is recorded (${retried.provenance.rejected.length} rejected)`);
    ok(retried.provenance.rejected.every((r) => r.violations.some((v) => v.startsWith('too long'))),
      'the recorded refusals say why', j(retried.provenance.rejected.map((r) => r.violations)));
    ok(lintWondering(retried.text, LONG).ok,
      `the text finally returned is lint-clean: ${retried.text}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\nF. plan -001's own stems, measured against this build's lint");
console.log('='.repeat(76));

const STEMS = [
  ['distribution', 'What does the distribution of mass look like?', ['Mass'], false],
  ['ordering', 'What if we sort by mass?', ['Mass'], false],
  ['relationship', 'How does height go with sleep?', ['Height', 'Sleep'], true],
  ['second-dimension', 'Does height matter here too?', ['Height'], true],
  ['comparison', 'How do the means of sleep compare?', ['Sleep'], true],
  ['grouping', 'How would that look grouped by diet?', ['Diet'], true],
  ['filtering', 'What if we only looked at diet?', ['Diet'], false],
];
let stemFailures = 0;
for (const [family, text, focus, expectedOk] of STEMS) {
  const verdict = lintWondering(text, focus);
  if (!verdict.ok) stemFailures++;
  eq(verdict.ok, expectedOk, `stem ${family}: "${text}" is ${expectedOk ? 'lint-clean' : 'REFUSED'}`);
}
eq(stemFailures, 3, 'three of the seven stems in the family table are not shippable text');
ok(lintWondering('How do the means of sleep compare?', ['Sleep']).ok
  && !lintWondering('How does the mean of sleep compare?', ['Sleep']).ok,
  'the comparison stem survives only because `\\bmean\\b` misses the plural');
ok(!REALIZED.some((r) => /\bmeans?\b/i.test(r.text)),
  'no emitted wondering uses the word "mean" or "means"');

// ---------------------------------------------------------------------------
console.log('\nG. purity, framing, and the module contract');
console.log('='.repeat(76));

const src = readFileSync(REALIZE_SRC, 'utf8');
const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const BANNED = [
  [/\bDate\.now\b/, 'Date.now()'],
  [/\bMath\.random\b/, 'Math.random()'],
  [/\bperformance\b/, 'performance'],
  [/\blocalStorage\b/, 'localStorage'],
  [/(^|[^.\w])document\b/m, 'document'],
  [/(^|[^.\w])window\b/m, 'window'],
  [/\bexport\s+default\b/, 'a default export'],
];
for (const [re, what] of BANNED) ok(!re.test(body), `realize.js contains no ${what}`);
ok(src.startsWith('/**'), 'realize.js opens with a JSDoc header');
ok(/from '\.\/lint\.js'/.test(body), 'realize.js imports the lint (the only permitted gate)');

eq(typeof PARTIAL_FRAMING_LABEL, 'string', 'PARTIAL_FRAMING_LABEL is exported for the panel');
ok(/many/i.test(PARTIAL_FRAMING_LABEL),
  `the standing framing says the panel is partial: "${PARTIAL_FRAMING_LABEL}"`);
// Framing is the PANEL's job: paying for it per sentence would spend the
// 70-character budget on an apology and repeat with every wondering.
ok(!REALIZED.some((r) => /some of many|one of many/i.test(r.text)),
  'no wondering carries the framing in its own text — the panel holds it');
eq(REALIZABLE_FAMILIES.length, 7, 'REALIZABLE_FAMILIES names all seven families');
ok(REALIZABLE_FAMILIES.every((f) => f in FAMILIES),
  'REALIZABLE_FAMILIES matches the families actually on disk');

// ---------------------------------------------------------------------------
console.log('\nH. ten example wonderings from the Mammals fixture');
console.log('='.repeat(76));
for (const r of REALIZED.slice(0, 10)) {
  console.log(`  ${r.family.padEnd(17)} ${r.provenance.phrasing.padEnd(13)} ${r.text}`);
}
console.log(`\n  (${REALIZED.length} wonderings in total, all lint-clean)`);

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(76));
if (failures) {
  console.log(`FAILED — ${failures} assertion${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('OK — web/src/wonderings/realize.js holds.');
