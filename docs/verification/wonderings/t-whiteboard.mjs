/**
 * t-whiteboard.mjs — the student's own wonderings.
 *
 *   node docs/verification/wonderings/t-whiteboard.mjs
 *
 * Written against the CONTRACT, not against the implementation. The build this
 * follows produced 18 tests a stub would pass because each agent tested the code
 * it had just written (docs/verification/wonderings/BUILD-VERIFICATION.md), so
 * every assertion here names a behaviour the design requires and several assert
 * the REFUSAL rather than the firing — a detector that fires on everything is
 * worth nothing.
 */
import {
  STEMS, STEM_IDS, stemById, candidatesFor, renderStem, createWondering,
  investigationState, nudgeTarget, boardSummary,
  UNTOUCHED, PARTIAL, INVESTIGATED,
  NUDGE_AFTER_SEC, NUDGE_COOLDOWN_SEC, MAX_NUDGES,
} from '../../../web/src/wonderings/whiteboard-model.js';

let fails = 0;
const ok = (cond, what) => {
  if (cond) { console.log(`  PASS  ${what}`); }
  else { console.log(`  FAIL  ${what}`); fails++; }
};
const eq = (a, b, what) => ok(a === b, `${what}  (got ${JSON.stringify(a)})`);

// A dataset shaped like the Mammals fixture after U0 added Diet.
const ATTRS = [
  { name: 'Mammal', kind: 'categorical', role: 'identifier', cardinality: 12 },
  { name: 'Diet', kind: 'categorical', role: 'category', cardinality: 3 },
  { name: 'Sleep', kind: 'numeric', role: 'measure' },
  { name: 'Mass', kind: 'numeric', role: 'measure' },
  { name: 'Height', kind: 'numeric', role: 'measure' },
];
const scene = (graphs) => ({ graphs, derived: { plottedAttrs: [], unplottedAttrs: [], attrPairsPlotted: [], sceneVersion: 1 } });
const EMPTY = scene([]);

console.log('\nA. stems and slots');
eq(STEMS.length, 6, 'six stems');
ok(STEMS.every((s) => s.slots.length >= 1 && s.slots.length <= 2), 'every stem has 1 or 2 slots');
ok(new Set(STEM_IDS).size === STEM_IDS.length, 'stem ids are unique');
ok(STEMS.every((s) => s.slots.length === 1 || s.middle), 'a 2-slot stem has connective text');
eq(stemById('nope'), null, 'unknown stem id returns null, does not throw');

console.log('\nB. the picker refuses identifiers — the rule the analysis side also applies');
const distr = stemById('distribution');
ok(!candidatesFor(distr, 0, ATTRS).includes('Mammal'), 'identifier is NOT offered for a numeric slot');
const group = stemById('grouping');
const groupCands = candidatesFor(group, 0, ATTRS);
ok(!groupCands.includes('Mammal'), 'identifier is NOT offered for a categorical slot');
ok(groupCands.includes('Diet'), 'Diet IS offered for a categorical slot');
ok(!groupCands.includes('Sleep'), 'a numeric is NOT offered for a categorical slot');
eq(candidatesFor(distr, 0, ATTRS).length, 3, 'three numerics offered (Sleep, Mass, Height)');
const compare = stemById('comparison');
ok(candidatesFor(compare, 0, ATTRS).every((n) => n !== 'Diet'), 'comparison slot 0 wants a numeric');
ok(candidatesFor(compare, 1, ATTRS).includes('Diet'), 'comparison slot 1 wants a categorical');
eq(candidatesFor(distr, 9, ATTRS).length, 0, 'a slot index that does not exist yields nothing');
eq(candidatesFor(null, 0, ATTRS).length, 0, 'a null stem yields nothing');

console.log('\nC. writing one');
const w1 = createWondering('relationship', ['Sleep', 'Mass'], 100);
ok(w1 !== null, 'a filled 2-slot stem creates a wondering');
eq(w1.text, 'How does Sleep go with Mass?', 'it renders as a sentence');
eq(w1.focus.length, 2, 'it carries both focus columns');
eq(createWondering('relationship', ['Sleep'], 0), null, 'a HALF-filled stem is refused');
eq(createWondering('relationship', ['Sleep', ''], 0), null, 'an empty slot is refused');
eq(createWondering('relationship', ['Sleep', 'Sleep'], 0), null, 'the same column twice is refused');
eq(createWondering('nope', ['Sleep'], 0), null, 'an unknown stem is refused');
eq(createWondering('relationship', ['Sleep', 'Mass'], 0).key,
   createWondering('relationship', ['Sleep', 'Mass'], 999).key,
   'the key ignores when it was written, so one wondering is one wondering');
ok(renderStem(distr, []).includes('____'), 'an unfilled stem shows a blank, not a broken sentence');

console.log('\nD. investigation — the REFUSALS matter as much as the firings');
const oneSlot = createWondering('distribution', ['Sleep'], 0);
eq(investigationState(oneSlot, EMPTY), UNTOUCHED, 'empty workspace: untouched');
eq(investigationState(oneSlot, scene([{ x: 'Mass', y: null }])), UNTOUCHED,
   'an UNRELATED graph does NOT count as investigating');
eq(investigationState(oneSlot, scene([{ x: 'Sleep', y: null }])), INVESTIGATED,
   'a 1-slot wondering is investigated once its column is plotted');

eq(investigationState(w1, EMPTY), UNTOUCHED, '2-slot: empty workspace is untouched');
eq(investigationState(w1, scene([{ x: 'Sleep', y: null }])), PARTIAL,
   '2-slot: ONE column plotted is PARTIAL — begun, not answered');
eq(investigationState(w1, scene([{ x: 'Sleep', y: 'Mass' }])), INVESTIGATED,
   '2-slot: both on ONE graph is investigated');
eq(investigationState(w1, scene([{ x: 'Sleep', y: null }, { x: 'Mass', y: null }])), INVESTIGATED,
   'both plotted, even on separate graphs, counts');
eq(investigationState(w1, scene([{ x: 'Height', y: 'Diet' }])), UNTOUCHED,
   'a graph naming NEITHER column is untouched');
eq(investigationState(oneSlot, EMPTY, new Set(['Sleep'])), INVESTIGATED,
   'a DATA MOVE on the column counts, with no graph at all');
eq(investigationState(w1, EMPTY, new Set(['Sleep'])), PARTIAL,
   'a data move on one of two is partial');
eq(investigationState(oneSlot, scene([{ x: null, y: null, legend: 'Sleep' }])), INVESTIGATED,
   'a LEGEND counts as plotting it');

console.log('\nE. the nudge is bounded, cooled, and de-escalating');
const fresh = () => [createWondering('relationship', ['Sleep', 'Mass'], 0)];
eq(nudgeTarget(fresh(), EMPTY, new Set(), 10), null,
   'no nudge before the wondering has been ignored long enough');
ok(nudgeTarget(fresh(), EMPTY, new Set(), NUDGE_AFTER_SEC[UNTOUCHED] + 1) !== null,
   `a nudge once untouched for ${NUDGE_AFTER_SEC[UNTOUCHED]}s`);
eq(nudgeTarget(fresh(), scene([{ x: 'Sleep', y: 'Mass' }]), new Set(), 9999), null,
   'NEVER nudge a wondering that has been investigated');
const partialAt = NUDGE_AFTER_SEC[UNTOUCHED] + 1;
eq(nudgeTarget(fresh(), scene([{ x: 'Sleep', y: null }]), new Set(), partialAt), null,
   'a PARTIAL wondering waits longer than an untouched one before nudging');
ok(nudgeTarget(fresh(), scene([{ x: 'Sleep', y: null }]), new Set(), NUDGE_AFTER_SEC[PARTIAL] + 1) !== null,
   'but it does nudge eventually — begun-and-abandoned is the case this exists for');
const cooled = fresh(); cooled[0].lastNudgeAt = 1000;
eq(nudgeTarget(cooled, EMPTY, new Set(), 1000 + NUDGE_COOLDOWN_SEC - 1), null,
   'no second nudge inside the cooldown');
const spent = fresh(); spent[0].nudges = MAX_NUDGES;
eq(nudgeTarget(spent, EMPTY, new Set(), 99999), null,
   `never more than ${MAX_NUDGES} nudges — under-nudge, per PHASE7`);
eq(nudgeTarget([], EMPTY, new Set(), 9999), null, 'an empty board never nudges');
const two = [createWondering('distribution', ['Sleep'], 0), createWondering('distribution', ['Mass'], 500)];
eq(nudgeTarget(two, EMPTY, new Set(), 5000).wondering.focus[0], 'Sleep',
   'the longest-ignored wondering is chosen');

console.log('\nF. the dashboard summary is the intra-student diversity measure');
const board = [
  createWondering('relationship', ['Sleep', 'Mass'], 0),
  createWondering('distribution', ['Height'], 0),
  createWondering('grouping', ['Diet'], 0),
];
const s = boardSummary(board, scene([{ x: 'Height', y: null }]), new Set());
eq(s.written, 3, 'counts what was written');
eq(s.distinctAttrs, 4, 'counts DISTINCT columns named — Sleep, Mass, Height, Diet');
eq(s.distinctStems, 3, 'counts distinct stems used');
eq(s[INVESTIGATED], 1, 'Height is plotted, so one is investigated');
eq(s[UNTOUCHED], 2, 'the other two are untouched');
eq(boardSummary([], EMPTY, new Set()).written, 0, 'an empty board summarises to zero');
eq(boardSummary(null, EMPTY, new Set()).written, 0, 'junk input does not throw');

console.log(`\n${'='.repeat(70)}`);
if (fails) { console.log(`t-whiteboard: ${fails} FAILED`); process.exit(1); }
console.log('t-whiteboard OK — stems fill, identifiers refused, investigation detected, nudge bounded.');
