/**
 * t-scene.mjs — the asserting test for `web/src/scene-model.js` (wave W1, I).
 *
 *   node docs/verification/wonderings/t-scene.mjs
 *
 * WHAT THIS IS FOR. The SceneModel's hard part is not "list the graphs". It is
 * the failure mode: the iframe phone drops replies at random, and a dropped
 * `component[id]` reply must NEVER present as "the student deleted that graph".
 * If it did, every wondering anchored to a graph still plainly on screen would
 * be retired for nothing, and the bug would be invisible — the panel would just
 * be quieter than it should be. That behaviour is unreachable from a browser
 * test (you cannot ask CODAP to drop a reply), which is exactly why
 * `scene-model.js` puts its I/O behind an injected `read`. This file is the
 * fake reader, and the drop is scripted.
 *
 * FOUR MUST-PASS CASES, from the module's brief:
 *   1. a graph with x/y/legend yields all three;
 *   2. a univariate graph has `y === null` — not `undefined`, not absent;
 *   3. two graphs on different contexts each carry their own;
 *   4. a dropped reply for one of three components leaves THAT ONE STALE and
 *      the other two UPDATED, with NOTHING reported as removed.
 *
 * WHAT A STUB CANNOT DO. Section D's drop scenario refutes the obvious wrong
 * implementation (replace state with whatever this read returned) and the
 * obvious over-correction (never remove anything) in the same section: section
 * E then deletes a component for real and demands it disappear. Section F pins
 * `sceneVersion` monotone across a sequence containing both. Section A scans the
 * source itself for browser globals and a clock, with the comments stripped
 * first — the module's own prose mentions `performance.now()` and `document`
 * while its code must not.
 *
 * Dependency-free: node builtins only, no framework, no npm install.
 * Written 2026-08-28 against the contracts frozen in
 * `web/src/wonderings/contracts.js`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  deriveScene, createSceneModel, isDriverSuspended, emptyScene, READ_REASONS,
} from '../../../web/src/scene-model.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = join(HERE, '..', '..', '..', 'web', 'src', 'scene-model.js');

/** Characters. Below this the comment stripper ate the code and section A's
 *  "no browser globals" pass would be vacuous. The module is ~9 kB of source. */
const MIN_STRIPPED_SOURCE_CHARS = 1500;

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (got, want, label) => ok(
  Object.is(got, want), label,
  `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const deep = (got, want, label) => ok(
  JSON.stringify(got) === JSON.stringify(want), label,
  `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * A fake CODAP that answers `get componentList` and `get component[id]`, and
 * can be told to drop replies. Mirrors `DemoDriver.api()`'s contract exactly:
 * a dropped reply resolves to `null`, never rejects.
 */
function fakeCodap(components) {
  const state = {
    components: components.map((c) => ({ ...c })),
    dropIds: new Set(),     // component ids whose detail reply vanishes
    dropList: false,        // componentList reply vanishes
    refuseList: false,      // componentList answers success:false
    listReply: undefined,   // when set, the LITERAL componentList reply (any shape)
    calls: [],
  };
  const read = async (action, resource) => {
    state.calls.push(`${action} ${resource}`);
    if (resource === 'componentList') {
      if (state.listReply !== undefined) return state.listReply;
      if (state.dropList) return null;
      if (state.refuseList) return { success: false, values: { error: 'nope' } };
      return {
        success: true,
        values: state.components.map((c) => ({ id: c.id, type: c.type, title: c.title ?? '' })),
      };
    }
    const m = /^component\[(.+)\]$/.exec(resource);
    if (m) {
      const id = m[1];
      if (state.dropIds.has(id)) return null;
      const c = state.components.find((k) => String(k.id) === id);
      if (!c) return { success: false, values: { error: 'not found' } };
      return { success: true, values: { ...c } };
    }
    return null;
  };
  const listCalls = () => state.calls.filter((s) => s.endsWith('componentList')).length;
  const patch = (id, fields) => {
    const c = state.components.find((k) => String(k.id) === String(id));
    Object.assign(c, fields);
  };
  return { state, read, listCalls, patch };
}

const THREE = [
  { id: 1, type: 'graph', dataContext: 'Mammals', xAttributeName: 'Mass', yAttributeName: 'Sleep', legendAttributeName: 'Diet' },
  { id: 2, type: 'graph', dataContext: 'Mammals', xAttributeName: 'Height', yAttributeName: null, legendAttributeName: null },
  { id: 3, type: 'graph', dataContext: 'Cats', xAttributeName: 'Weight', yAttributeName: 'Age', legendAttributeName: null },
];

const MAMMALS_ATTRS = ['Mammal', 'Order', 'Diet', 'LifeSpan', 'Height', 'Mass', 'Sleep', 'Speed'];

const byIdOf = (scene, id) => scene.graphs.find((g) => String(g.id) === String(id));

// ===========================================================================
console.log('\nA. the module itself — purity, exports, no clock');
console.log('='.repeat(76));
// ===========================================================================

const rawSrc = readFileSync(MODULE_PATH, 'utf8');
const code = rawSrc
  .replace(/\/\*[\s\S]*?\*\//g, ' ')          // block comments (incl. the header)
  .replace(/^\s*\/\/.*$/gm, ' ')              // whole-line comments
  .replace(/([^:'"`\\])\/\/[^\n]*$/gm, '$1'); // trailing comments

ok(code.length >= MIN_STRIPPED_SOURCE_CHARS,
  `comment stripper left real code (${code.length} chars)`,
  'below the floor the globals scan below proves nothing');

for (const bad of ['document', 'window', 'localStorage', 'navigator',
  'performance', 'Date.now', 'Math.random', 'setTimeout', 'setInterval',
  'requestAnimationFrame', 'fetch(']) {
  ok(!code.includes(bad), `no \`${bad}\` in executable code`);
}
ok(!/export\s+default/.test(rawSrc), 'named exports only — no default export');
for (const name of ['deriveScene', 'createSceneModel', 'isDriverSuspended',
  'emptyScene', 'READ_REASONS']) {
  ok(new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${name}\\b`).test(rawSrc),
    `exports \`${name}\``);
}
// The measured rule: suspend on driver.active, NOT on driver.phase.
ok(/driver\.active\s*===\s*true/.test(code),
  'isDriverSuspended reads `driver.active`');
ok(!/driver\.phase/.test(code) && !/\.phase\b/.test(code),
  'isDriverSuspended never reads `.phase` — it returns to idle after every tap');
ok(!/\.aborted\b/.test(code),
  'never reads `.aborted` — it latches after an abort and would suspend forever');

// ===========================================================================
console.log('\nB. deriveScene — the four must-pass shapes');
console.log('='.repeat(76));
// ===========================================================================

const scene = deriveScene(THREE, { attributeNames: MAMMALS_ATTRS });

// (1) a graph with x/y/legend yields all three
const g1 = byIdOf(scene, 1);
ok(!!g1, 'graph 1 present');
eq(g1.x, 'Mass', 'graph 1 x');
eq(g1.y, 'Sleep', 'graph 1 y');
eq(g1.legend, 'Diet', 'graph 1 legend');
eq(g1.dataContext, 'Mammals', 'graph 1 dataContext');
eq(g1.plotType, 'scatterPlot', 'graph 1 plotType inferred bivariate');

// (2) a univariate graph has y NULL — not undefined, not absent
const g2 = byIdOf(scene, 2);
ok(Object.prototype.hasOwnProperty.call(g2, 'y'), 'univariate graph HAS a `y` key');
ok(g2.y === null, 'univariate graph y is null');
ok(g2.y !== undefined, 'univariate graph y is not undefined');
ok(g2.legend === null, 'univariate graph legend is null');
eq(g2.plotType, 'dotPlot', 'univariate plotType inferred');

// (3) two graphs on different contexts each carry their own
const g3 = byIdOf(scene, 3);
eq(g3.dataContext, 'Cats', 'graph 3 carries its own dataContext');
eq(g1.dataContext, 'Mammals', 'graph 1 still carries Mammals');
ok(g1.dataContext !== g3.dataContext, 'the two contexts are not merged');
deep([g3.x, g3.y], ['Weight', 'Age'], 'graph 3 carries its own axes');

// contract-shape guards
deep(Object.keys(g1), ['id', 'plotType', 'x', 'y', 'legend', 'dataContext'],
  'graph entry has exactly the contract fields, in contract order');
deep(Object.keys(scene), ['graphs', 'derived'], 'SceneModel has exactly graphs + derived');
deep(Object.keys(scene.derived),
  ['plottedAttrs', 'unplottedAttrs', 'attrPairsPlotted', 'sceneVersion'],
  'derived has exactly the contract fields');

// ===========================================================================
console.log('\nC. deriveScene — the derived rollups');
console.log('='.repeat(76));
// ===========================================================================

deep(scene.derived.plottedAttrs, ['Age', 'Diet', 'Height', 'Mass', 'Sleep', 'Weight'],
  'plottedAttrs is the sorted union across graphs, legend included');
deep(scene.derived.unplottedAttrs, ['Mammal', 'Order', 'LifeSpan', 'Speed'],
  'unplottedAttrs is the dataset list minus plotted, in dataset order');
deep(scene.derived.attrPairsPlotted,
  [['Age', 'Weight'], ['Diet', 'Mass'], ['Diet', 'Sleep'], ['Mass', 'Sleep']],
  'attrPairsPlotted: every co-displayed pair, alphabetised and sorted');
eq(scene.derived.sceneVersion, 0, 'sceneVersion defaults to 0 (never read)');

// The constraint that matters: the scene alone does not know the dataset.
const noAttrs = deriveScene(THREE);
deep(noAttrs.derived.unplottedAttrs, [],
  'without an attribute list, unplottedAttrs is [] — no source is invented');
deep(noAttrs.derived.plottedAttrs, scene.derived.plottedAttrs,
  'plottedAttrs needs no dataset — it comes from the scene');

// univariate graphs contribute no pair; a legend-only pair still counts
deep(deriveScene([THREE[1]]).derived.attrPairsPlotted, [],
  'a univariate graph shows no pair');
deep(deriveScene([{ id: 9, type: 'graph', xAttributeName: 'Mass', legendAttributeName: 'Diet' }])
  .derived.attrPairsPlotted, [['Diet', 'Mass']],
  'x-with-legend IS a pair the student can already see');

// non-graph components are ignored, not an error
const mixed = deriveScene([
  ...THREE,
  { id: 4, type: 'caseTable', dataContext: 'Mammals' },
  { id: 5, type: 'slider' },
  null, 'nonsense', 42,
], { attributeNames: MAMMALS_ATTRS });
eq(mixed.graphs.length, 3, 'case tables, sliders and junk produce no graphs');
deep(mixed.derived.plottedAttrs, scene.derived.plottedAttrs,
  'a case table on Mammals does not make its attributes "plotted"');

// empty axes, blank strings, and the DemoDriver.snapshot() field names
const emptyGraph = deriveScene([{ id: 7, type: 'graph', xAttributeName: '', yAttributeName: '   ' }]);
eq(emptyGraph.graphs[0].x, null, 'blank string x becomes null');
eq(emptyGraph.graphs[0].plotType, 'empty', 'a graph with no axes is plotType "empty"');
eq(emptyGraph.graphs[0].dataContext, null, 'a graph with no context has dataContext null');
const shortNames = deriveScene([{ id: 8, type: 'Graph', x: 'Mass', y: 'Sleep', legend: 'Diet' }]);
deep([shortNames.graphs[0].x, shortNames.graphs[0].y, shortNames.graphs[0].legend],
  ['Mass', 'Sleep', 'Diet'],
  'accepts DemoDriver.snapshot()\'s short field names and mixed-case type');
eq(deriveScene([{ id: 6, type: 'graph', xAttributeName: 'Mass', plotType: 'binnedDotPlot' }])
  .graphs[0].plotType, 'binnedDotPlot', 'a declared plotType beats inference');

// determinism and purity
const permuted = deriveScene([THREE[2], THREE[0], THREE[1]], { attributeNames: MAMMALS_ATTRS });
deep(permuted, scene, 'input order does not change the output (sorted by id)');
deep(deriveScene(THREE, { attributeNames: MAMMALS_ATTRS }), scene, 'same input, same output');
eq(deriveScene([], { sceneVersion: 12 }).derived.sceneVersion, 12,
  'sceneVersion is carried through unchanged — the pure core never increments it');

const frozen = THREE.map((c) => Object.freeze({ ...c }));
Object.freeze(frozen);
const beforeJson = JSON.stringify(frozen);
let threw = null;
try { deriveScene(frozen, { attributeNames: Object.freeze([...MAMMALS_ATTRS]) }); } catch (e) { threw = e; }
ok(threw === null, 'deriveScene does not write to its inputs (deep-frozen input)',
  threw ? String(threw) : '');
eq(JSON.stringify(frozen), beforeJson, 'inputs are byte-identical after the call');

// emptyScene
const blank = emptyScene(MAMMALS_ATTRS);
deep(blank.graphs, [], 'emptyScene has no graphs');
eq(blank.derived.sceneVersion, 0, 'emptyScene is version 0 — never observed');
deep(blank.derived.unplottedAttrs, MAMMALS_ATTRS, 'emptyScene: everything is unplotted');

// ===========================================================================
console.log('\nD. createSceneModel — a dropped reply is NOT a deletion');
console.log('='.repeat(76));
// ===========================================================================

const codap = fakeCodap(THREE);
const model = await createSceneModel({ read: codap.read, attributeNames: MAMMALS_ATTRS });

eq(model.scene.graphs.length, 3, 'primes with all three graphs, no browser involved');
eq(model.sceneVersion, 1, 'a successful first read takes sceneVersion 0 -> 1');
eq(model.health.lastReason, READ_REASONS.OK, 'first read reason is ok');
deep(byIdOf(model.scene, 2).x, 'Height', 'graph 2 seen at x = Height');

// The student changes all three. CODAP drops the reply for component 2 only.
codap.patch(1, { legendAttributeName: null });
codap.patch(2, { yAttributeName: 'Sleep' });
codap.patch(3, { xAttributeName: 'Coat' });
codap.state.dropIds.add('2');
const versionBeforeDrop = model.sceneVersion;
const partial = await model.refresh();

eq(partial.ok, false, 'a partial read does not claim to be ok');
eq(partial.reason, READ_REASONS.PARTIAL, 'reason discriminates "reply lost"');
deep(partial.staleIds, [2], 'the dropped component is named in staleIds');
deep(partial.removedIds, [], 'NOTHING is reported as removed');
eq(model.scene.graphs.length, 3, 'all three graphs survive the drop');
// the dropped one is STALE — its last affirmatively observed values, untouched
eq(byIdOf(model.scene, 2).x, 'Height', 'the stale graph keeps its last observed x');
eq(byIdOf(model.scene, 2).y, null, 'the stale graph does NOT pick up the unseen change');
// the other two are UPDATED
eq(byIdOf(model.scene, 1).legend, null, 'graph 1 updated: legend cleared');
eq(byIdOf(model.scene, 3).x, 'Coat', 'graph 3 updated: x is now Coat');
eq(model.sceneVersion, versionBeforeDrop + 1, 'the observed change still bumps the version');
eq(model.health.droppedReplies, 1, 'the drop is counted, not hidden');

// A read where the LIST itself is lost teaches nothing at all.
codap.state.dropIds.clear();
codap.state.dropList = true;
const sceneBeforeListDrop = JSON.stringify(model.scene);
const versionBeforeListDrop = model.sceneVersion;
const lost = await model.refresh();
eq(lost.reason, READ_REASONS.LIST_DROPPED, 'a lost componentList is its own reason');
eq(lost.ok, false, 'a lost list is not ok');
deep(lost.removedIds, [], 'a lost list removes nothing');
eq(JSON.stringify(model.scene), sceneBeforeListDrop, 'the scene is untouched');
eq(model.sceneVersion, versionBeforeListDrop, 'sceneVersion does not move on a failed read');

codap.state.dropList = false;
codap.state.refuseList = true;
const refused = await model.refresh();
eq(refused.reason, READ_REASONS.LIST_REFUSED, 'success:false is distinguishable from no reply');
eq(JSON.stringify(model.scene), sceneBeforeListDrop, 'a refusal removes nothing either');
codap.state.refuseList = false;

// ===========================================================================
console.log('\nD2. a MALFORMED componentList is a failed read, not a mass deletion');
console.log('='.repeat(76));
// ===========================================================================
// Section D scripted the two failures the author thought of: the reply that
// never came, and the reply that said no. The third — a reply that CAME and was
// GARBAGE — is the dangerous one, because `Array.isArray(list.values) ? … : []`
// turns it into an authoritative "there is nothing on screen", which retires
// every visible wondering with reason `scene-gone`. Constraint 2 of the module
// header ("absence requires affirmative observation") does not care which
// message the absence arrived in. A shape we cannot read is not an observation.

ok(typeof READ_REASONS.LIST_MALFORMED === 'string',
  'READ_REASONS names a MALFORMED reason at all');
ok(new Set(Object.values(READ_REASONS)).size === Object.keys(READ_REASONS).length,
  'every READ_REASON is a distinct string — "lost", "refused" and "malformed" '
  + 'must be discriminable from the console');

/** Every shape CODAP might hand back that is NOT a readable component list. */
const MALFORMED_LIST_REPLIES = [
  ['{}', {}],
  ['{success:true}', { success: true }],
  ['{success:true, values:null}', { success: true, values: null }],
  ["{success:true, values:'nonsense'}", { success: true, values: 'nonsense' }],
  ['{success:true, values:{}} (object, not array)', { success: true, values: {} }],
  ['{values:[…]} with no success field', { values: [{ id: 1, type: 'graph' }] }],
  ['a bare string', 'nonsense'],
  ['a bare number', 42],
  ['a bare array', [{ id: 1, type: 'graph' }]],
  ['a boolean', true],
];

const cM = fakeCodap(THREE);
const mM = await createSceneModel({ read: cM.read, attributeNames: MAMMALS_ATTRS });
eq(mM.scene.graphs.length, 3, 'primed with three graphs before the garbage arrives');
const goodSceneJson = JSON.stringify(mM.scene);
const goodVersion = mM.sceneVersion;

for (const [label, reply] of MALFORMED_LIST_REPLIES) {
  cM.state.listReply = reply;
  const r = await mM.refresh();
  eq(r.reason, READ_REASONS.LIST_MALFORMED, `${label} → reason LIST_MALFORMED`);
  eq(r.ok, false, `${label} → not ok`);
  eq(r.changed, false, `${label} → nothing changed`);
  deep(r.removedIds, [], `${label} → removes NOTHING`);
  deep(r.staleIds, [], `${label} → nothing is even claimed stale`);
  eq(mM.scene.graphs.length, 3, `${label} → all three graphs survive`);
  eq(JSON.stringify(mM.scene), goodSceneJson, `${label} → the scene is byte-identical`);
  eq(mM.sceneVersion, goodVersion, `${label} → sceneVersion does not move`);
}

// A garbage reply must not cost a fan-out either: nothing was listed to read.
const detailCallsDuringGarbage = cM.state.calls
  .slice(cM.state.calls.indexOf('get componentList') + 1)
  .filter((s) => s.startsWith('get component['));
ok(detailCallsDuringGarbage.length === 3,
  'a malformed list issues no per-component reads (only the 3 from priming)',
  `saw ${detailCallsDuringGarbage.length}`);

// It also has to HEAL: garbage is not a latch.
cM.state.listReply = undefined;
const healed = await mM.refresh();
eq(healed.reason, READ_REASONS.OK, 'a good reply after the garbage reads OK again');
eq(mM.scene.graphs.length, 3, 'and still sees three graphs');
eq(mM.sceneVersion, goodVersion, 'an unchanged scene still does not bump the version');

// THE OVER-CORRECTION, refuted in the same section: `{success:true, values:[]}`
// is WELL-FORMED and IS affirmative evidence. "Reject anything that empties the
// scene" would pass every assertion above and break real deletion.
cM.state.listReply = { success: true, values: [] };
const emptied = await mM.refresh();
eq(emptied.reason, READ_REASONS.OK, 'an affirmative EMPTY list is a well-formed reply');
eq(emptied.ok, true, 'and it is ok');
deep(emptied.removedIds.map(Number).sort(), [1, 2, 3],
  'and it really does remove all three');
eq(mM.scene.graphs.length, 0, 'the scene is empty because we were TOLD it is empty');
eq(mM.sceneVersion, goodVersion + 1, 'an observed emptying bumps the version');
cM.state.listReply = undefined;

// Health counts the failure rather than hiding it.
ok(mM.health.listFailures >= MALFORMED_LIST_REPLIES.length,
  'every malformed reply is counted as a list failure',
  `listFailures = ${mM.health.listFailures}`);

// ===========================================================================
console.log('\nE. createSceneModel — removal DOES happen, on affirmative evidence');
console.log('='.repeat(76));
// ===========================================================================

// Refute the over-correction: "never remove anything" would pass section D.
codap.state.components = codap.state.components.filter((c) => c.id !== 3);
const removedRead = await model.refresh();
eq(removedRead.ok, true, 'a complete read is ok');
eq(removedRead.reason, READ_REASONS.OK, 'reason ok');
deep(removedRead.removedIds, [3], 'a successful list that omits a graph REMOVES it');
eq(model.scene.graphs.length, 2, 'the deleted graph is gone from the scene');
ok(!byIdOf(model.scene, 3), 'graph 3 is no longer present');
ok(model.scene.derived.plottedAttrs.every((a) => a !== 'Coat' && a !== 'Age'),
  'the deleted graph\'s attributes are no longer plotted');

// ===========================================================================
console.log('\nF. sceneVersion — monotone, and only on an observed change');
console.log('='.repeat(76));
// ===========================================================================

const c2 = fakeCodap(THREE);
const m2 = await createSceneModel({ read: c2.read, attributeNames: MAMMALS_ATTRS, prime: false });
eq(m2.sceneVersion, 0, 'prime:false leaves sceneVersion at 0 — nothing observed yet');
eq(m2.scene.graphs.length, 0, 'and the scene empty');
eq(c2.listCalls(), 0, 'prime:false issues zero reads');

const versions = [m2.sceneVersion];
const r1 = await m2.refresh();
versions.push(m2.sceneVersion);
eq(r1.changed, true, 'first read is a change (empty -> three graphs)');
eq(m2.sceneVersion, 1, 'version 1 after the first successful read');

const r2 = await m2.refresh();
versions.push(m2.sceneVersion);
eq(r2.changed, false, 'an identical read is not a change');
eq(m2.sceneVersion, 1, 'an unchanged scene does NOT bump the version');

c2.state.dropIds.add('1');
c2.state.dropIds.add('2');
c2.state.dropIds.add('3');
const r3 = await m2.refresh();
versions.push(m2.sceneVersion);
eq(r3.reason, READ_REASONS.PARTIAL, 'every detail reply dropped is still only partial');
deep(r3.removedIds, [], 'and still removes nothing');
eq(m2.sceneVersion, 1, 'a fully dropped fan-out does not bump the version');
eq(m2.scene.graphs.length, 3, 'and the scene is fully preserved');

c2.state.dropIds.clear();
c2.patch(2, { yAttributeName: 'Mass' });
await m2.refresh();
versions.push(m2.sceneVersion);
eq(m2.sceneVersion, 2, 'a real change bumps it again');

let monotone = true;
for (let i = 1; i < versions.length; i++) if (versions[i] < versions[i - 1]) monotone = false;
ok(monotone, `sceneVersion is monotone across the whole sequence [${versions.join(', ')}]`);

// the version the caller reads is the one embedded in the scene it holds
eq(m2.scene.derived.sceneVersion, m2.sceneVersion,
  'scene.derived.sceneVersion agrees with the controller');

// ===========================================================================
console.log('\nG. suspension — driver.active, never driver.phase');
console.log('='.repeat(76));
// ===========================================================================

ok(isDriverSuspended({ active: true, phase: 'idle' }) === true,
  'active:true, phase:"idle" IS suspended — phase returns to idle after every tap');
ok(isDriverSuspended({ active: false, phase: 'drag' }) === false,
  'active:false, phase:"drag" is NOT suspended — phase is not the signal');
ok(isDriverSuspended({ active: false, phase: 'idle', aborted: true }) === false,
  'a latched `aborted` does not suspend forever');
ok(isDriverSuspended(null) === false, 'no driver is not suspended');
ok(isDriverSuspended(undefined) === false, 'undefined driver is not suspended');

const c3 = fakeCodap(THREE);
const driver = { active: false, phase: 'idle' };
const m3 = await createSceneModel({
  read: c3.read,
  attributeNames: MAMMALS_ATTRS,
  isSuspended: () => isDriverSuspended(driver),
});
const callsBeforeSuspend = c3.state.calls.length;
const versionBeforeSuspend = m3.sceneVersion;
driver.active = true;                      // a demo starts
c3.state.components = [];                  // and tears the document apart
const suspended = await m3.refresh();
eq(suspended.reason, READ_REASONS.SUSPENDED, 'refresh reports SUSPENDED');
eq(suspended.ok, false, 'a suspended refresh is not ok');
eq(c3.state.calls.length, callsBeforeSuspend, 'ZERO reads issued while suspended');
eq(m3.scene.graphs.length, 3, 'the demo\'s document surgery is not mistaken for the student\'s');
eq(m3.sceneVersion, versionBeforeSuspend, 'and the version does not move');
eq(m3.health.suspends, 1, 'the suspension is counted');

driver.active = false;                     // demo over, revert done
await m3.refresh();
eq(m3.scene.graphs.length, 0, 'once unsuspended it observes the truth');

// ===========================================================================
console.log('\nH. read discipline — concurrent, de-duplicated, get-only');
console.log('='.repeat(76));
// ===========================================================================

const c4 = fakeCodap(THREE);
const m4 = await createSceneModel({ read: c4.read, attributeNames: MAMMALS_ATTRS, prime: false });
const both = await Promise.all([m4.refresh(), m4.refresh(), m4.refresh()]);
eq(c4.listCalls(), 1, 'three overlapping refresh() calls issue ONE componentList read');
ok(both[0] === both[1] && both[1] === both[2], 'and they all resolve to the same result');
eq(m4.sceneVersion, 1, 'and produce one version bump, not three');

const detailCalls = c4.state.calls.filter((s) => s.startsWith('get component['));
eq(detailCalls.length, 3, 'one detail read per listed component');
ok(c4.state.calls.every((s) => s.startsWith('get ')),
  'every call is a `get` — this module never writes');

await m4.refresh();
eq(c4.listCalls(), 2, 'a later refresh does issue a fresh read (the latch releases)');

// a reader that throws is a dropped reply, not a crash
const m5 = await createSceneModel({
  read: async () => { throw new Error('phone exploded'); },
  prime: false,
});
const boom = await m5.refresh();
eq(boom.reason, READ_REASONS.LIST_DROPPED, 'a throwing reader reads as a dropped reply');
eq(m5.sceneVersion, 0, 'and teaches nothing');

// attributeNames as a live function — the student can add a column
const c6 = fakeCodap([THREE[1]]);
let attrs = ['Height', 'Mass'];
const m6 = await createSceneModel({ read: c6.read, attributeNames: () => attrs });
deep(m6.scene.derived.unplottedAttrs, ['Mass'], 'unplotted from the first attribute list');
attrs = ['Height', 'Mass', 'Sleep'];
c6.patch(2, { legendAttributeName: 'Mass' });
await m6.refresh();
deep(m6.scene.derived.unplottedAttrs, ['Sleep'],
  'a re-read picks up both the new column and the newly plotted one');

// a missing reader is a programming error, not a silent no-op
let ctorThrew = false;
try { await createSceneModel({}); } catch { ctorThrew = true; }
ok(ctorThrew, 'createSceneModel without a `read` throws rather than pretending');

// ===========================================================================
console.log('\n' + '='.repeat(76));
if (failures) {
  console.log(`FAILED — ${failures} assertion(s).`);
  process.exit(1);
}
console.log('t-scene OK — pure derivation, monotone healing, a dropped reply is '
  + 'stale and never a deletion, sceneVersion monotone, suspends on driver.active.');
