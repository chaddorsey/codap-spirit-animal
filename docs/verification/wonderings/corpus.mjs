/**
 * corpus.mjs — the review artifact for the Wonderings system (plan -002, W3).
 *
 *   node docs/verification/wonderings/corpus.mjs
 *
 * WHAT IT IS FOR. Nine pure modules each pass their own test. That proves each
 * one does what its owner intended; it does not answer the only question that
 * matters before this ships to a classroom: *what does the whole thing actually
 * SAY?* This script runs the assembled pipeline
 * (`web/src/wonderings/index.js`) over the dataset the tutorials really ship
 * (`web/src/demo/fixture.js`) crossed with eleven hand-written scenes, and writes
 * EVERY (observation -> wondering) triple — plus the refusals a terse column
 * name produces, which the shipping fixture does not exercise at all — to
 * `docs/verification/wonderings/corpus.txt` for a human to read end to end.
 * Plan -002 defers the uptake ledger precisely so that this corpus, and not a
 * metric, is what the shipping decision is made on.
 *
 * IT IS ALSO A TEST. Reading 150 questions is how you find the embarrassing
 * one; the assertions below are how you find the ones that are wrong in a way
 * reading will not catch. Every one of them fails a plausible stub:
 *
 *   - A stub that returns a canned question fails DISTINCT-TEXTS and MENTIONS-FOCUS.
 *   - A stub that ignores the scene fails SCENE-SENSITIVITY (two families are
 *     defined only in the presence of a graph, and must emit nothing without one).
 *   - A stub that skips the identifier rule fails NO-IDENTIFIER: `Mammal` is 12
 *     distinct values over 12 cases and scores eta2 = 1.00 against every numeric.
 *   - A stub that skips the group guards fails NO-ORDER: `Order` is 7 groups over
 *     12 cases with a smallest group of 1.
 *   - A stub that emits a wondering for every numeric fails DECLINES-ON-SLEEP.
 *   - A stub of `insight.js` fails PAIRING-FIX, which drives the PRODUCTION entry
 *     point `analyzeDataset(bridge)` over the 18-case/4-blank regression from
 *     `corr-pairing-bug.mjs` and demands r = 1.00 where the shipped code
 *     reported 0.29 on 2026-08-28.
 *   - Anything nondeterministic fails DETERMINISM, which enumerates twice and
 *     compares the two renderings byte for byte.
 *
 * NO DEPENDENCIES, NO FRAMEWORK, NO BROWSER. `process.exit(1)` on any failure.
 */

import { writeFileSync, readFileSync } from 'node:fs';

import { MAMMALS, MAMMALS_COLLECTION } from '../../../web/src/demo/fixture.js';
import { deriveScene } from '../../../web/src/scene-model.js';
import { lintWondering, renderAttributeName } from '../../../web/src/wonderings/lint.js';
import { REALIZABLE_FAMILIES } from '../../../web/src/wonderings/realize.js';
import { buildDatasetModel, wonderingsFor } from '../../../web/src/wonderings/index.js';
import { analyzeDataset, suggestMoves } from '../../../web/src/insight.js';

/* ------------------------------------------------------------------ *
 * Thresholds. Each is a floor the goal or the plan names, not a number
 * chosen to fit whatever came out.
 * ------------------------------------------------------------------ */

const MIN_TRIPLES = 40;          // triples; the completion metric in docs/GOAL-WONDERINGS-W0-W4.md ("corpus.mjs emits >= 40 triples")
const MIN_DISTINCT_TEXTS = 20;   // distinct wondering strings; realize.js offers 4-7 phrasings per family over 7 families, so anything near 1 means the phrasing hash is not being consulted
const REQUIRED_LINT_RATE = 1;    // fraction, 0..1; the metric is "100% lint-clean" and there is no partial credit — a wondering that fails the lint is one a student would have read
const PAIRING_FIX_R = 1;         // Pearson r; the 18-case/4-blank fixture is a PERFECT y = 10x relationship, so the only correct answer is 1.00. The shipped code returned 0.29 (corr-pairing-bug.mjs, 2026-08-28)
const R_TOLERANCE = 0.005;       // Pearson r; half of the 2-dp rounding insight.js applies before a human reads the number

const CONTEXT = 'Mammals';
const ATTR_NAMES = MAMMALS_COLLECTION.attrs.map((a) => a.name);
const DECLARED_KINDS = Object.fromEntries(
  MAMMALS_COLLECTION.attrs.map((a) => [a.name, a.type]),
);

/* ------------------------------------------------------------------ *
 * The scenes.
 *
 * Hand-written CODAP component literals, run through the real
 * `deriveScene()` rather than hand-built SceneModels, so that the shape the
 * families see here is the shape `createSceneModel` produces in the browser.
 * The empty, table-only and foreign-context scenes are not filler: two
 * families are defined only in the presence of a graph IN THIS CONTEXT, and
 * "emits nothing" is the assertion they exist to support.
 * ------------------------------------------------------------------ */

const SCENES = [
  ['empty', []],
  ['table-only', [
    { id: 10, type: 'caseTable', name: 'Mammals', dataContext: CONTEXT },
  ]],
  ['univariate-mass', [
    { id: 11, type: 'graph', plotType: 'dotPlot', xAttributeName: 'Mass', dataContext: CONTEXT },
  ]],
  ['univariate-sleep', [
    { id: 12, type: 'graph', plotType: 'dotPlot', xAttributeName: 'Sleep', dataContext: CONTEXT },
  ]],
  ['univariate-height', [
    { id: 13, type: 'graph', plotType: 'dotPlot', xAttributeName: 'Height', dataContext: CONTEXT },
  ]],
  ['bivariate-mass-sleep', [
    { id: 14, type: 'graph', plotType: 'scatterPlot', xAttributeName: 'Mass',
      yAttributeName: 'Sleep', dataContext: CONTEXT },
  ]],
  ['bivariate-height-mass', [
    { id: 15, type: 'graph', plotType: 'scatterPlot', xAttributeName: 'Height',
      yAttributeName: 'Mass', dataContext: CONTEXT },
  ]],
  ['legend-diet', [
    { id: 16, type: 'graph', plotType: 'scatterPlot', xAttributeName: 'Height',
      yAttributeName: 'Sleep', legendAttributeName: 'Diet', dataContext: CONTEXT },
  ]],
  ['two-graphs', [
    { id: 17, type: 'graph', plotType: 'dotPlot', xAttributeName: 'LifeSpan', dataContext: CONTEXT },
    { id: 18, type: 'graph', plotType: 'scatterPlot', xAttributeName: 'Mass',
      yAttributeName: 'Speed', dataContext: CONTEXT },
  ]],
  ['empty-graph', [
    { id: 19, type: 'graph', dataContext: CONTEXT },
  ]],
  ['foreign-context', [
    // A graph on somebody else's data. Every family must ignore it: a wondering
    // about Mammals anchored to a graph of Cats would be a lie about the screen.
    { id: 20, type: 'graph', plotType: 'scatterPlot', xAttributeName: 'Weight',
      yAttributeName: 'Age', dataContext: 'Cats' },
  ]],
];

/* ------------------------------------------------------------------ *
 * Enumeration
 * ------------------------------------------------------------------ */

const dataset = buildDatasetModel(MAMMALS, {
  context: CONTEXT,
  attributeNames: ATTR_NAMES,
  declaredKinds: DECLARED_KINDS,
});

/* ------------------------------------------------------------------ *
 * The refusal probe.
 *
 * The shipping fixture has friendly column names, so it produces NO
 * suppressions at all — which means running only against it would leave the
 * refusal path completely unexercised, and a corpus of 176 successes would
 * quietly be evidence for a gate that does not work.
 *
 * `Ms_kg` and `msleep` are not invented: they are the real column names of the
 * `msleep` dataset the CODAP Mammals sample derives from, and terse names like
 * them are what a student's own imported CSV looks like. `renderAttributeName`
 * refuses both ("ms", "msleep" are not readable words) and there IS NO REPAIR
 * PATH — nothing in this system knows what a column is short for — so the whole
 * wondering must be suppressed rather than guessed at.
 * ------------------------------------------------------------------ */

const TERSE_RENAMES = { Mass: 'Ms_kg', Sleep: 'msleep' };
const TERSE_CONTEXT = 'MammalsTerse';
const TERSE_ATTR_NAMES = ATTR_NAMES.map((n) => TERSE_RENAMES[n] ?? n);
const TERSE_ROWS = MAMMALS.map((row) => Object.fromEntries(
  Object.entries(row).map(([k, v]) => [TERSE_RENAMES[k] ?? k, v]),
));
const TERSE_KINDS = Object.fromEntries(
  MAMMALS_COLLECTION.attrs.map((a) => [TERSE_RENAMES[a.name] ?? a.name, a.type]),
);
const TERSE_SCENES = [
  ['terse-empty', []],
  ['terse-scatter', [
    { id: 30, type: 'graph', plotType: 'scatterPlot', xAttributeName: 'Height',
      yAttributeName: 'Ms_kg', dataContext: TERSE_CONTEXT },
  ]],
];

const terseDataset = buildDatasetModel(TERSE_ROWS, {
  context: TERSE_CONTEXT,
  attributeNames: TERSE_ATTR_NAMES,
  declaredKinds: TERSE_KINDS,
});

/**
 * Every triple, in a fixed order. A triple is one (scene, observation,
 * outcome): either the wondering the observation was given, or the refusal it
 * earned instead. The refusals are half of what the corpus is for.
 */
function enumerate(ds = dataset, scenes = SCENES, attrNames = ATTR_NAMES) {
  const triples = [];
  for (const [sceneName, components] of scenes) {
    const scene = deriveScene(components, {
      attributeNames: attrNames,
      sceneVersion: 1,
    });
    const { observations, wonderings, suppressed } = wonderingsFor(ds, scene);
    const byKey = new Map();
    for (const w of [...wonderings, ...suppressed]) byKey.set(w.observation.key, w);
    for (const o of observations) {
      const w = byKey.get(o.key);
      triples.push({ scene: sceneName, observation: o, wondering: w ?? null });
    }
  }
  return triples;
}

/** One triple as the lines a human reads. Pure — no clock, no paths, no cwd. */
function renderTriple(t, index) {
  const o = t.observation;
  const w = t.wondering;
  const ev = Object.entries(o.evidence ?? {})
    .map(([k, v]) => `${k}=${typeof v === 'number' ? Number(v.toFixed(3)) : JSON.stringify(v)}`)
    .join(' ');
  const head = `${String(index + 1).padStart(3, ' ')}. [${t.scene}] ${o.family}`
    + `  focus=${(o.focus ?? []).join(' × ')}`
    + `  strength=${Number((o.strength ?? 0).toFixed(3))}`
    + `  novelty=${Number((o.novelty ?? 0).toFixed(3))}`;
  const why = `       key: ${o.key}\n       evidence: ${ev || '(none)'}`;
  if (!w) return `${head}\n${why}\n       -> NO OUTCOME (bug: observation lost between stages)`;
  if (w.state === 'suppressed') {
    return `${head}\n${why}\n       -> SUPPRESSED: ${w.provenance.reason}`;
  }
  const lint = lintWondering(w.text, o.focus);
  return `${head}\n${why}\n       -> "${w.text}"`
    + `\n          phrasing=${w.provenance.phrasing} attempts=${w.provenance.attempts}`
    + ` of ${w.provenance.phrasingCount}  lint=${lint.ok ? 'clean' : lint.violations.join('; ')}`;
}

/** The whole corpus as one deterministic string. */
function renderCorpus(triples, probe) {
  const shown = triples.filter((t) => t.wondering && t.wondering.state !== 'suppressed');
  const refused = triples.filter((t) => !t.wondering || t.wondering.state === 'suppressed');
  const distinct = new Set(shown.map((t) => t.wondering.text));
  const perFamily = {};
  for (const t of triples) perFamily[t.observation.family] = (perFamily[t.observation.family] ?? 0) + 1;

  const out = [];
  out.push('WONDERINGS CORPUS — every observation the pipeline earns, and what it said');
  out.push('='.repeat(78));
  out.push('');
  out.push('Generated by: node docs/verification/wonderings/corpus.mjs');
  out.push(`Dataset:      ${CONTEXT} fixture, ${MAMMALS.length} cases, `
    + `${ATTR_NAMES.length} attrs (${ATTR_NAMES.join(', ')})`);
  out.push(`Scenes:       ${SCENES.length} (${SCENES.map(([n]) => n).join(', ')})`);
  out.push(`Triples:      ${triples.length}  (${shown.length} spoken, ${refused.length} refused)`);
  out.push(`Distinct wording: ${distinct.size}`);
  out.push(`By family:    ${Object.entries(perFamily).sort()
    .map(([f, n]) => `${f}=${n}`).join(' ')}`);
  out.push('');
  out.push('The dataset the whole corpus is derived from');
  out.push('-'.repeat(78));
  for (const a of dataset.attrs) {
    const extra = a.kind === 'numeric'
      ? `n=${a.n} mean=${Number((a.mean ?? 0).toFixed(3))} skew=${Number((a.skew ?? 0).toFixed(3))}`
        + ` gapFrac=${Number((a.gapFrac ?? 0).toFixed(3))} maxAbsZ=${Number((a.maxAbsZ ?? 0).toFixed(3))}`
        + ` cv=${Number((a.cv ?? 0).toFixed(3))}`
      : `cardinality=${a.cardinality} groups=${JSON.stringify(a.groupSizes)}`;
    out.push(`  ${a.name.padEnd(10)} ${a.kind.padEnd(12)} ${a.role.padEnd(11)} ${extra}`);
  }
  out.push('');
  out.push('  pairs (| r | >= the n-floor is marked *):');
  for (const p of dataset.pairs) {
    out.push(`    ${p.a} × ${p.b}: r=${p.r.toFixed(3)} rho=${p.rho.toFixed(3)} `
      + `n=${p.n}${p.qualifies ? ' *' : ''}`);
  }
  out.push('  separations (eta², and why each was refused):');
  for (const s of dataset.separations) {
    out.push(`    ${s.cat} × ${s.num}: eta²=${s.eta2.toFixed(3)} groups=${s.groups} `
      + `smallest=${s.smallestGroup} n=${s.n} `
      + `${s.qualifies ? '* QUALIFIES' : `REFUSED (${s.reason})`}`);
  }
  out.push('');
  out.push('The triples');
  out.push('='.repeat(78));
  let scene = null;
  triples.forEach((t, i) => {
    if (t.scene !== scene) {
      scene = t.scene;
      out.push('');
      out.push(`--- scene: ${scene} ${'-'.repeat(Math.max(0, 60 - scene.length))}`);
    }
    out.push(renderTriple(t, i));
  });
  out.push('');
  out.push('Every distinct thing this system can say about this dataset');
  out.push('-'.repeat(78));
  for (const text of [...distinct].sort()) out.push(`  ${text}`);
  out.push('');
  out.push('');
  out.push('REFUSAL PROBE — the same dataset with two terse column names');
  out.push('='.repeat(78));
  out.push(`Mass -> Ms_kg, Sleep -> msleep. Neither renders as readable English, and`);
  out.push('there is no repair path, so every wondering about either must be suppressed');
  out.push('rather than guessed at. The shipping fixture suppresses nothing, so without');
  out.push('this section the suppression gate would be entirely unexercised.');
  out.push('');
  const probeRefused = probe.filter((t) => !t.wondering || t.wondering.state === 'suppressed');
  out.push(`${probe.length} triples, ${probeRefused.length} suppressed, `
    + `${probe.length - probeRefused.length} spoken.`);
  let probeScene = null;
  probe.forEach((t, i) => {
    if (t.scene !== probeScene) {
      probeScene = t.scene;
      out.push('');
      out.push(`--- scene: ${probeScene} ${'-'.repeat(Math.max(0, 60 - probeScene.length))}`);
    }
    out.push(renderTriple(t, i));
  });
  out.push('');
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) { console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`); return true; }
  console.error(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  failures += 1;
  return false;
}

const triples = enumerate();
const spoken = triples.filter((t) => t.wondering && t.wondering.state !== 'suppressed');
const probe = enumerate(terseDataset, TERSE_SCENES, TERSE_ATTR_NAMES);
const corpus = renderCorpus(triples, probe);
const outPath = new URL('./corpus.txt', import.meta.url);
writeFileSync(outPath, corpus, 'utf8');

console.log(`\nWonderings corpus — ${SCENES.length} scenes over the ${MAMMALS.length}-case `
  + `${CONTEXT} fixture\n${'='.repeat(72)}`);
console.log(`written: docs/verification/wonderings/corpus.txt (${corpus.length} bytes)\n`);

// --- 1. size ---------------------------------------------------------------
check('SIZE — at least the metric\'s triple count',
  triples.length >= MIN_TRIPLES,
  `${triples.length} triples (>= ${MIN_TRIPLES}), ${spoken.length} spoken`);

// --- 2. lint ---------------------------------------------------------------
// Independently re-linted here. `realize()` lints before it returns, so this
// asserts the gate is actually wired, not that the lint agrees with itself.
const dirty = spoken.filter((t) => !lintWondering(t.wondering.text, t.observation.focus).ok);
check('LINT — 100% of spoken wonderings pass the lint',
  spoken.length > 0 && dirty.length / spoken.length <= 1 - REQUIRED_LINT_RATE,
  `${spoken.length - dirty.length}/${spoken.length} clean`
    + (dirty.length ? `; first bad: "${dirty[0].wondering.text}"` : ''));

// --- 3. every wondering is about its own focus -----------------------------
// The lint already refuses a name NOT in focus. This is the other direction:
// every attribute the observation claims to be about must appear in the
// sentence. A canned question passes the lint and fails here.
const unmentioned = spoken.filter((t) => !(t.observation.focus ?? []).every((raw) => {
  const r = renderAttributeName(raw);
  return r.readable && t.wondering.text.toLowerCase().includes(r.text.toLowerCase());
}));
check('MENTIONS-FOCUS — every focus attribute appears in its own wondering',
  unmentioned.length === 0,
  unmentioned.length
    ? `${unmentioned.length} do not, e.g. ${unmentioned[0].observation.focus} -> "${unmentioned[0].wondering.text}"`
    : `all ${spoken.length}`);

// --- 4. variety ------------------------------------------------------------
const distinctTexts = new Set(spoken.map((t) => t.wondering.text));
check('DISTINCT-TEXTS — the phrasing hash actually spreads',
  distinctTexts.size >= MIN_DISTINCT_TEXTS,
  `${distinctTexts.size} distinct strings (>= ${MIN_DISTINCT_TEXTS})`);

// --- 5. family coverage ----------------------------------------------------
const families = new Set(triples.map((t) => t.observation.family));
const missing = REALIZABLE_FAMILIES.filter((f) => !families.has(f));
check('FAMILY-COVERAGE — all seven families are exercised',
  missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')}` : REALIZABLE_FAMILIES.join(', '));

// --- 6. the identifier rule ------------------------------------------------
// `Mammal` is 12 distinct values over 12 cases: eta2 = 1.00 against every
// numeric, and a meaningless grouping. It must never reach a student.
const identifierLeaks = triples.filter((t) => (t.observation.focus ?? []).includes('Mammal'));
check('NO-IDENTIFIER — "Mammal" is never the subject of any observation',
  identifierLeaks.length === 0,
  identifierLeaks.length ? `${identifierLeaks.length} leaked` : 'clean across every scene');
const mammalSeps = dataset.separations.filter((s) => s.cat === 'Mammal');
check('NO-IDENTIFIER — and it is refused BY NAME, not merely absent',
  mammalSeps.length > 0 && mammalSeps.every((s) => !s.qualifies && s.reason === 'identifier'
    && s.eta2 === 1),
  `${mammalSeps.length} separations, all eta²=1.00 and refused as "identifier"`);

// --- 7. the group guards ---------------------------------------------------
// `Order` is 7 groups over 12 cases, smallest group 1 — above the ceiling of 4
// and below the floor of 3. It is the reason W0 had to add `Diet`.
const orderLeaks = triples.filter((t) => (t.observation.focus ?? []).includes('Order'));
check('NO-ORDER — 7 groups over 12 cases earns nothing',
  orderLeaks.length === 0,
  orderLeaks.length ? `${orderLeaks.length} leaked` : 'clean across every scene');

// --- 8. distribution declines ----------------------------------------------
const distFocus = new Set(triples
  .filter((t) => t.observation.family === 'distribution')
  .flatMap((t) => t.observation.focus ?? []));
check('EARNS-ON-MASS — the far outlier earns a distribution observation',
  distFocus.has('Mass'), `distribution speaks about: ${[...distFocus].sort().join(', ')}`);
check('DECLINES-ON-SLEEP — an unremarkable column earns nothing',
  !distFocus.has('Sleep'), 'Sleep has no distribution tell and is silent');

// --- 9. scene sensitivity --------------------------------------------------
// Two families are DEFINED by the screen. If they fire on an empty scene they
// are not reading it.
const inScene = (scene, family) => triples
  .filter((t) => t.scene === scene && t.observation.family === family).length;
check('SCENE-SENSITIVITY — grouping is silent with no graph',
  inScene('empty', 'grouping') === 0 && inScene('table-only', 'grouping') === 0,
  'empty and table-only scenes emit no grouping observation');
check('SCENE-SENSITIVITY — grouping speaks once a graph exists',
  inScene('bivariate-height-mass', 'grouping') > 0,
  `${inScene('bivariate-height-mass', 'grouping')} on the height × mass scatterplot`);
check('SCENE-SENSITIVITY — second-dimension needs a univariate plot',
  inScene('empty', 'second-dimension') === 0
    && inScene('bivariate-height-mass', 'second-dimension') === 0
    && inScene('univariate-height', 'second-dimension') > 0,
  `empty=0, bivariate=0, univariate-height=${inScene('univariate-height', 'second-dimension')}`);
check('FOREIGN-CONTEXT — a graph of somebody else\'s data anchors nothing',
  inScene('foreign-context', 'grouping') === 0
    && inScene('foreign-context', 'second-dimension') === 0,
  'a Cats scatterplot earns no Mammals wondering');

// --- 10. the refusal path --------------------------------------------------
// An unreadable column name must SILENCE the wondering, not produce a sentence
// with "ms kg" in it. A stub that never consults the lint speaks anyway.
const probeRefusals = probe.filter((t) => t.wondering?.state === 'suppressed');
const probeSpoken = probe.filter((t) => t.wondering && t.wondering.state !== 'suppressed');
check('REFUSAL-PATH — a terse column name suppresses its wonderings outright',
  probeRefusals.length > 0
    && probeRefusals.every((t) => t.wondering.text === ''
      && t.wondering.provenance.reason === 'no phrasing survived the lint'),
  `${probeRefusals.length} of ${probe.length} suppressed, every one with empty text`);
check('REFUSAL-PATH — every suppression names an unreadable attribute',
  probeRefusals.every((t) => (t.observation.focus ?? [])
    .some((raw) => !renderAttributeName(raw).readable)),
  `${probeRefusals.length} suppressions, all traceable to Ms_kg or msleep`);
check('REFUSAL-PATH — and the readable columns still speak in the same dataset',
  probeSpoken.length > 0
    && probeSpoken.every((t) => lintWondering(t.wondering.text, t.observation.focus).ok),
  `${probeSpoken.length} still spoken, all lint-clean`);
const leakedTerse = probeSpoken.filter((t) => /ms kg|msleep|Ms_kg/i.test(t.wondering.text));
check('REFUSAL-PATH — no unreadable fragment reaches a rendered sentence',
  leakedTerse.length === 0,
  leakedTerse.length ? `leaked: "${leakedTerse[0].wondering.text}"` : 'clean');

// --- 11. determinism -------------------------------------------------------
// Byte-identical on two runs, and identical to what was just written to disk.
const second = renderCorpus(enumerate(), enumerate(terseDataset, TERSE_SCENES, TERSE_ATTR_NAMES));
check('DETERMINISM — two enumerations are byte-identical',
  second === corpus, `${corpus.length} bytes both times`);
check('DETERMINISM — the file on disk is what was rendered',
  readFileSync(outPath, 'utf8') === corpus, 'corpus.txt round-trips');

/* ------------------------------------------------------------------ *
 * The production path: insight.js
 *
 * THE POINT OF THE WHOLE UNIT. `analyzeDataset(bridge)` is what
 * `web/src/codap-main.js` calls and what feeds `wise-attend`
 * (`web/src/behaviors.js:1159`). Everything above proves the NEW pipeline is
 * sound; these prove the OLD one stopped being wrong.
 * ------------------------------------------------------------------ */

/** A CodapBridge stand-in: one data context, whatever rows it is given. */
function fakeBridge(name, rows, collections = [{ name }]) {
  return {
    async request(action, resource) {
      if (resource === 'dataContextList') return { values: [{ name }] };
      if (resource === `dataContext[${name}].itemSearch[*]`) {
        return { values: rows.map((v) => ({ values: v })) };
      }
      if (resource === `dataContext[${name}].collectionList`) return { values: collections };
      return null;
    },
  };
}

// The exact regression from corr-pairing-bug.mjs: 18 cases, a PERFECT
// Mass = 10 × Height relationship, and 4 blank cells in 4 different rows — two
// missing Height, two missing Mass. The shipped code reported r = 0.29 because
// it walked two independently-compacted arrays by a shared index.
const PAIRED = [
  [5, 50], [9, 90], [2, 20], [7, 70], [3, 30], [8, 80], [1, 10], [6, 60], [4, 40], [10, 100],
  [5.5, 55], [2.5, 25], [8.5, 85], [3.5, 35], [7.5, 75], [1.5, 15], [9.5, 95], [6.5, 65],
];
const GAPPY = PAIRED.map(([h, m], i) => {
  if (i === 2 || i === 9) return { Height: '', Mass: m };
  if (i === 5 || i === 14) return { Height: h, Mass: '' };
  return { Height: h, Mass: m };
});

const gappyAnalysis = await analyzeDataset(fakeBridge('Regression', GAPPY));
const hm = gappyAnalysis?.correlations?.find(
  (c) => (c.a === 'Height' && c.b === 'Mass') || (c.a === 'Mass' && c.b === 'Height'),
);
check('PAIRING-FIX — analyzeDataset() reports the perfect relationship as perfect',
  !!hm && Math.abs(hm.rFull - PAIRING_FIX_R) <= R_TOLERANCE,
  hm ? `r=${hm.r} rho=${hm.rho.toFixed(2)} n=${hm.n} (was 0.29 on 2026-08-28)`
    : 'no Height × Mass correlation at all');
check('PAIRING-FIX — and it drops each blank case from BOTH series',
  !!hm && hm.n === PAIRED.length - 4,
  hm ? `n=${hm.n} complete pairs of ${PAIRED.length} cases` : '—');

// The identifier rule, in the production path this time.
const mammalsAnalysis = await analyzeDataset(fakeBridge(CONTEXT, MAMMALS));
const mammalAttr = mammalsAnalysis?.attrs?.find((a) => a.name === 'Mammal');
check('IDENTIFIER-RULE — analyzeDataset() types "Mammal" as an identifier',
  mammalAttr?.role === 'identifier', `role=${mammalAttr?.role}`);
check('IDENTIFIER-RULE — and never offers it as a grouping',
  !(mammalsAnalysis?.groupables ?? []).some((g) => g.name === 'Mammal'),
  `groupables: ${(mammalsAnalysis?.groupables ?? []).map((g) => g.name).join(', ') || 'none'}`);
const prodMammalSeps = (mammalsAnalysis?.separations ?? []).filter((s) => s.cat === 'Mammal');
check('IDENTIFIER-RULE — but still REPORTS the refusal, with its eta²',
  prodMammalSeps.length > 0
    && prodMammalSeps.every((s) => s.eta2 === 1 && !s.qualifies && s.reason === 'identifier'),
  `${prodMammalSeps.length} rows, each eta²=1.00 REFUSED (identifier)`);

// And the suggestions the character actually acts on are still non-empty:
// a fix that silenced wise-attend entirely would be a regression of its own.
const suggestions = suggestMoves(mammalsAnalysis, new Map());
check('WISE-ATTEND — the fixed analysis still produces ranked suggestions',
  suggestions.length > 0 && suggestions.every((s) => Number.isFinite(s.score) && s.rationale),
  `${suggestions.length} suggestions, top = [${suggestions[0]?.move}] ${suggestions[0]?.key}`);
check('WISE-ATTEND — and none of them is about the identifier column',
  !suggestions.some((s) => s.key.includes('Mammal') || s.target?.attr === 'Mammal'),
  suggestions.map((s) => s.key).join(', '));

/* ------------------------------------------------------------------ *
 * Verdict
 * ------------------------------------------------------------------ */

console.log(`\n${'='.repeat(72)}`);
if (failures > 0) {
  console.error(`CORPUS FAILED — ${failures} check(s). See docs/verification/wonderings/corpus.txt.`);
  process.exit(1);
}
console.log(`CORPUS OK — ${triples.length} triples (${spoken.length} spoken, `
  + `${triples.length - spoken.length} refused), ${distinctTexts.size} distinct wordings, `
  + `100% lint-clean; plus a ${probe.length}-triple refusal probe in which `
  + `${probeRefusals.length} are suppressed for an unreadable column name.`);
console.log('Read docs/verification/wonderings/corpus.txt before shipping this to anyone.');
