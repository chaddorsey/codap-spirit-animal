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

// RE-MEASURED 2026-08-28 against the REPAIRED lint. The first measurement was
// taken against a lint with two defects BUILD-VERIFICATION.md then recorded and
// `web/src/wonderings/lint.js` has since fixed: the second-person rule matched
// `what does ` and falsely refused the DISTRIBUTION stem, and the statistical
// vocabulary matched only `\bmean\b` so the COMPARISON stem passed on the
// plural. Both verdicts have flipped, and the count did not: three of seven are
// still not shippable, but they are now the three that use the editorial `we`
// plus the one that states a statistic. The design conclusion is unchanged and
// better supported — the phrasings in `realize.js` avoid `we` and avoid the word
// `mean` in any number, and the lint now agrees about the second.
const STEMS = [
  ['distribution', 'What does the distribution of mass look like?', ['Mass'], true],
  ['ordering', 'What if we sort by mass?', ['Mass'], false],
  ['relationship', 'How does height go with sleep?', ['Height', 'Sleep'], true],
  ['second-dimension', 'Does height matter here too?', ['Height'], true],
  ['comparison', 'How do the means of sleep compare?', ['Sleep'], false],
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
ok(!lintWondering('How do the means of sleep compare?', ['Sleep']).ok
  && !lintWondering('How does the mean of sleep compare?', ['Sleep']).ok,
  'the comparison stem is refused in the singular AND the plural — no technicality left');
ok(STEMS.filter(([, , , expectedOk]) => !expectedOk).every(([, text]) => /\bwe\b/.test(text)
  || !lintWondering(text, []).ok),
  'every refused stem is refused for a stated reason, not by accident');
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
console.log('\nH. the four defects BUILD-VERIFICATION.md recorded against this module');
console.log('='.repeat(76));

// --- H1. key -> text is a FUNCTION -----------------------------------------
// The old section C could not see this: every one of its assertions re-realizes
// the SAME object, so a realizer that hashed `focus.join('|')` and ignored `key`
// entirely passed it. The property the module's own header NAMES is that two
// DISTINCT observations sharing a key read the same way. Provable from the
// shipped corpus: `corpus.txt` triples 4 and 36 both carry key
// `relationship:Mammals:Height|Mass` and both select `rel-story`, and they read
// "Might height and mass be telling one story?" and "Might mass and height be
// telling one story?" — because `families/relationship.js` sorts the names into
// the key but orders `focus` by what is on screen.
{
  const HEIGHT_MASS = 'relationship:Mammals:Height|Mass';
  const base = {
    family: 'relationship', key: HEIGHT_MASS, dataContext: 'Mammals',
    evidence: { r: 0.587, rho: 0.817, n: 12 }, strength: 0.82, novelty: 1,
    scope: { componentId: null },
  };
  const shipped = realize({ ...base, focus: ['Height', 'Mass'] });    // corpus triple 4
  const swapped = realize({ ...base, focus: ['Mass', 'Height'] });    // corpus triple 36
  ok(shipped !== null && swapped !== null, 'both corpus orderings of Height|Mass realize');
  eq(swapped?.text, shipped?.text,
    'corpus triples 4 and 36 share a key and must read identically');
  eq(swapped?.provenance.phrasing, shipped?.provenance.phrasing,
    'they also share the phrasing (they always did — the names were in the other order)');

  // The general property, over every two-name observation the real families
  // emit: if the key names both attributes, permuting `focus` cannot change the
  // sentence, because the key is unchanged and the key is the identity.
  let permuted = 0;
  let stable = 0;
  for (const { observation } of REALIZED) {
    if (!Array.isArray(observation.focus) || observation.focus.length !== 2) continue;
    const tokens = String(observation.key).split(/[:|~]/);
    if (!observation.focus.every((f) => tokens.filter((t) => t === f).length === 1)) continue;
    permuted++;
    const other = realize({ ...observation, focus: [observation.focus[1], observation.focus[0]] });
    if (eq(other?.text, realize(observation)?.text,
      `permuting focus leaves ${observation.key} unchanged`)) stable++;
  }
  ok(permuted >= 4, `the fixture supplies ${permuted} two-name keys to permute`);
  eq(stable, permuted, 'every permutable observation read the same both ways');

  // ...and the orderings a family DECLARED are still honoured. `focus[0]` of a
  // second-dimension observation is the off-screen partner and `focus[1]` the
  // plotted attribute (that file calls the asymmetry load-bearing), and its key
  // records the same order, so nothing may be reordered here.
  const sec = realize({
    family: 'second-dimension', key: 'second-dimension:Mammals:Height|Mass',
    dataContext: 'Mammals', focus: ['Height', 'Mass'], evidence: {},
    strength: 0.82, novelty: 1, scope: { componentId: 'g1' },
  });
  ok(sec !== null && sec.provenance.names[0] === 'height' && sec.provenance.names[1] === 'mass',
    'second-dimension keeps partner-then-plotted, the order its key declares',
    j(sec && sec.provenance.names));
  const secOther = realize({
    family: 'second-dimension', key: 'second-dimension:Mammals:Mass|Height',
    dataContext: 'Mammals', focus: ['Mass', 'Height'], evidence: {},
    strength: 0.82, novelty: 1, scope: { componentId: 'g1' },
  });
  ok(secOther !== null && secOther.provenance.names[0] === 'mass',
    'the mirrored second-dimension key speaks its own order — different key, different text');
  ok(secOther && sec && secOther.text !== sec.text,
    'two DIFFERENT keys are free to read differently');
}

// --- H2. no name may escape through the prototype chain ---------------------
// `PHRASINGS[observation.family]` walked the prototype chain, so a family
// colliding with an `Object.prototype` member reached a non-array and THREW,
// and a column named `__proto__` rendered to "proto" and was spoken.
const PROTOTYPE_NAMES = Object.getOwnPropertyNames(Object.prototype);
ok(PROTOTYPE_NAMES.includes('constructor') && PROTOTYPE_NAMES.includes('__proto__'),
  `Object.prototype supplies ${PROTOTYPE_NAMES.length} hostile names to try`);

function realizeSafely(observation) {
  try { return { threw: null, result: realize(observation) }; }
  catch (err) { return { threw: String(err && err.message), result: undefined }; }
}

{
  let threw = 0;
  let spoke = 0;
  for (const name of PROTOTYPE_NAMES) {
    // As a family: with and without an `evidence.kind` that is itself an own
    // member of whatever the prototype chain hands back.
    for (const kind of [undefined, 'keys', 'toString', 'name', 'length']) {
      const r = realizeSafely({
        family: name, key: `${name}:Mammals:Mass`, dataContext: 'Mammals',
        focus: ['Mass'], evidence: kind === undefined ? {} : { kind },
        strength: 0.5, novelty: 0.5, scope: { componentId: null },
      });
      if (r.threw !== null) { threw++; console.log(`  FAIL  realize(family:${j(name)}, kind:${j(kind)}) threw ${r.threw}`); failures++; }
      else if (r.result !== null) { spoke++; console.log(`  FAIL  family ${j(name)} realized to ${j(r.result.text)}`); failures++; }
    }
    // As a column name.
    const asFocus = realizeSafely({
      family: 'distribution', key: `distribution:Mammals:${name}`, dataContext: 'Mammals',
      focus: [name], evidence: {}, strength: 0.5, novelty: 0.5, scope: { componentId: null },
    });
    if (asFocus.threw !== null) { threw++; console.log(`  FAIL  realize(focus:[${j(name)}]) threw ${asFocus.threw}`); failures++; }
    else if (asFocus.result !== null) { spoke++; console.log(`  FAIL  column ${j(name)} realized to ${j(asFocus.result.text)}`); failures++; }
  }
  ok(threw === 0, `no Object.prototype member name throws (${PROTOTYPE_NAMES.length} tried as family and as column)`);
  ok(spoke === 0, 'no Object.prototype member name is spoken');
}
isNull(realizeSafely(obs({ family: 'constructor', evidence: { kind: 'keys' } })).result,
  'family "constructor" with a kind that IS an own member of Object returns null');
isNull(realizeSafely(obs({ focus: ['__proto__'], key: 'distribution:Mammals:__proto__' })).result,
  'a column named __proto__ is not spoken as "proto"');
// A second name beside a hostile one must not rescue the sentence.
isNull(realizeSafely(obs({ family: 'relationship', focus: ['Mass', '__proto__'], key: 'relationship:Mammals:Mass|__proto__' })).result,
  'one hostile name of two suppresses the whole wondering');

// --- H3. the duplicate-focus guard compares what is SPOKEN ------------------
// The guard's own comment says "how does mass go with mass?" must never ship.
// It compared RAW names, so two spellings of one column walked through it.
for (const pair of [['LifeSpan', 'Life_Span'], ['Mass', 'mass'], ['Height', ' Height'],
  ['Life_Span', 'life span'], ['LifeSpan', 'LIFE_SPAN']]) {
  const rendered = pair.map((p) => renderAttributeName(p).text);
  ok(rendered[0].toLowerCase() === rendered[1].toLowerCase(),
    `  precondition: ${j(pair)} both render to "${rendered[0]}"`);
  isNull(realize(obs({ family: 'relationship', focus: pair, key: `relationship:Mammals:${pair.join('|')}` })),
    `two spellings of one column return null: ${j(pair)}`);
  isNull(realize(obs({ family: 'second-dimension', focus: pair, key: `second-dimension:Mammals:${pair.join('|')}` })),
    `  ...in second-dimension too: ${j(pair)}`);
}
// The control: two names that render DIFFERENTLY still realize.
ok(realize(obs({ family: 'relationship', focus: ['LifeSpan', 'Height'], key: 'relationship:Mammals:Height|LifeSpan' })) !== null,
  'two genuinely different names still realize');

// --- H4. a column name may not state a statistic ----------------------------
// The lint bans statistical vocabulary in the SENTENCE, at word boundaries.
// The other half of every sentence is a column name nobody reviewed, and the
// lint's `\bmean\b` and `\bstrong\w*\b` do not match the forms a column takes.
const STATISTICAL_COLUMNS = [
  // `Avg` is deliberately absent: it renders to `avg`, whose coda `vg` is not
  // English, so the readability rule already suppresses it and it would prove
  // nothing here.
  'Means', 'Mean', 'Strength', 'Averages', 'Average', 'Medians',
  'Correlation', 'Outliers', 'Trend', 'Variance', 'Deviation',
];
for (const name of STATISTICAL_COLUMNS) {
  ok(renderAttributeName(name).readable,
    `  precondition: "${name}" renders readably ("${renderAttributeName(name).text}")`);
  // Suppression must be total, not a phrasing that happens to be unlucky: no
  // key anywhere in the hash space may find words for it.
  let spoken = null;
  for (let i = 0; i < PROBE_KEYS && spoken === null; i++) {
    for (const family of ['distribution', 'ordering', 'grouping']) {
      const r = realize({
        family, key: `${family}:Probe:${i}`, dataContext: 'Mammals', focus: [name],
        evidence: {}, strength: 0.5, novelty: 0.5, scope: { componentId: null },
      });
      if (r !== null) { spoken = `${family}: ${r.text}`; break; }
    }
  }
  isNull(spoken, `a column named "${name}" is never spoken`);
}
// Two names, one of them statistical: the whole wondering goes.
isNull(realize(obs({ family: 'relationship', focus: ['Mass', 'Strength'], key: 'relationship:Mammals:Mass|Strength' })),
  'one statistical name of two suppresses the whole relationship wondering');
// The control: the rule is WHOLE WORDS of the rendered name, not substrings.
// `Demeanor` contains `mean` and is an ordinary word; suppressing it would be
// the rule eating the dataset. (`Meaning` is deliberately not used here: it
// begins with `mean`, so whether it survives is `lint.js`'s call, not this
// module's, and this test must not lock another agent's file into place.)
for (const name of ['Demeanor', 'Model', 'Speed', 'TrendLine']) {
  const r = realize(obs({ focus: [name], key: `distribution:Mammals:${name}` }));
  if (name === 'TrendLine') {
    isNull(r, `"${name}" renders to "trend line" and states a statistic — suppressed`);
  } else {
    ok(r !== null, `"${name}" is an ordinary word and still speaks: ${r && r.text}`);
  }
}
// And nothing the real fixture emits states a statistic in a name.
ok(!REALIZED.some((r) => /\b(means?|medians?|averages?|avg|strengths?|outliers?|trends?|variances?|deviations?|correlations?)\b/i.test(r.text)),
  'no wondering from the real fixture states a statistic, in a name or otherwise');

// ---------------------------------------------------------------------------
console.log('\nI. ten example wonderings from the Mammals fixture');
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
