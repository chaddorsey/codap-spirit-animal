/**
 * t-governor.mjs — the asserting test for `web/src/wonderings/governor.js`
 * (plan `-002` wave W1, module H).
 *
 *   node docs/verification/wonderings/t-governor.mjs        # exits 1 on any failure
 *
 * WHAT IT IS DEFENDING. Three claims, in the order the goal states them:
 *
 *   MP1  nothing is offered above the flow threshold — the inverted core rule,
 *        `docs/CHARACTER.md:105-107`, "never interrupt flow";
 *   MP2  something IS offered within the stall threshold of a simulated stall —
 *        the stall is the moment of need;
 *   MP3  the interval lengthens MONOTONICALLY across three consecutive unacted
 *        wonderings — de-escalation, not escalation.
 *
 * WHY IT IS BUILT THE WAY IT IS. Each must-pass is asserted TWICE: once against
 * the module's own arithmetic (`intervalSeconds`) and once behaviourally, by
 * stepping a simulated clock one second at a time and watching what
 * `shouldOffer` actually does. The arithmetic check alone would pass for a
 * module whose gate never consulted the interval; the behavioural check alone
 * would pass for one whose growth was an accident of rounding.
 *
 * DELIBERATELY STUB-HOSTILE. `return { offer: true }` dies on MP1 and on the
 * thrash/dormant precedence cases; `return { offer: false }` dies on MP2; a
 * fixed interval dies on MP3; a governor that secretly read a clock dies on the
 * translation-invariance case (section G), which shifts every timestamp by
 * 1,000,000 s and demands identical output; a governor that mutated its inputs
 * dies on section B, which passes it deep-frozen objects in an ES module, where
 * writing to a frozen object throws.
 *
 * Dependency-free: node builtins only, no framework, no npm install.
 * Written 2026-08-28 against the shapes in `web/src/behavior-engine.js:65-84`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  shouldOffer, governorReducer, initialGovernorState, intervalSeconds,
  activityState, GOVERNOR_CONSTANTS, ACTIVITY_STATES,
} from '../../../web/src/wonderings/governor.js';
import * as GOVERNOR_MODULE from '../../../web/src/wonderings/governor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..', 'web', 'src', 'wonderings', 'governor.js');

const STEP_SEC = 1;          // seconds; simulation granularity, matching behavior-engine's TICK_INTERVAL_SEC
const SIM_HORIZON_SEC = 4000; // seconds; long enough for four de-escalated intervals (90+162+292+525) with room to spare
const BIG_SHIFT_SEC = 1e6;   // seconds; the offset used to prove no wall clock is being read
const EPS = 1e-9;            // tolerance for float comparisons of interval arithmetic

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(
  a === b, label, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const near = (a, b, label) => ok(
  Math.abs(a - b) < EPS, label, `expected ~${b}, got ${a}`);
const section = (title) => {
  console.log(`\n${title}`);
  console.log('='.repeat(76));
};

const K = GOVERNOR_CONSTANTS;

/** Deep-freeze so any mutation of an argument throws inside the module. */
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/**
 * A `BehaviorEngine.state`-shaped literal (`behavior-engine.js:65-84`).
 * Only the fields the governor is allowed to read are populated.
 */
function engine({ lastActionAt = 0, moves = [], churn = [], sleepy = 0.1 } = {}) {
  return deepFreeze({
    lastActionAt,
    recentMoves: moves,
    componentChurn: churn,
    dataMoves: {},
    mood: { playful: 0.5, curious: 0.5, sleepy, mischievous: 0 },
  });
}

/** `n` data moves ending at `endAt`, one every `everySec`. */
const moveRing = (n, endAt, everySec = 5) => Array.from(
  { length: n }, (_, i) => ({ move: 'filtering', kind: 'out', at: endAt - (n - 1 - i) * everySec }),
);

/**
 * Step a simulated clock until the governor offers. Returns the time of the
 * offer, or `null` if it never offers inside the horizon.
 */
function nextOfferAt(state, gov, fromSec, horizon = SIM_HORIZON_SEC) {
  for (let t = fromSec; t <= fromSec + horizon; t += STEP_SEC) {
    if (shouldOffer(state, gov, t).offer) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
section('A. module discipline — pure, named exports, documented constants');
// ---------------------------------------------------------------------------
const rawSrc = readFileSync(SRC, 'utf8');
// Strip comments first: the header DISCUSSES `Date.now()` and `performance.now()`
// by name, so a scan of the raw text would fail on its own documentation.
const code = rawSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const banned of ['Date.now', 'Math.random', 'performance.', 'window.',
  'document.', 'localStorage', 'globalThis', 'setTimeout', 'setInterval']) {
  ok(!code.includes(banned), `code contains no \`${banned}\``);
}
ok(!/export\s+default/.test(code), 'no default export in source');
eq(GOVERNOR_MODULE.default, undefined, 'module namespace has no `default`');
for (const name of ['shouldOffer', 'governorReducer', 'initialGovernorState',
  'intervalSeconds', 'activityState', 'GOVERNOR_CONSTANTS', 'ACTIVITY_STATES']) {
  eq(typeof GOVERNOR_MODULE[name], name === name.toUpperCase() ? 'object' : 'function',
    `exports \`${name}\``);
}
ok(rawSrc.slice(0, 200).includes('/**'), 'file opens with a JSDoc header');
ok(/2026-08-28/.test(rawSrc), 'header carries dated evidence');

// every numeric module-level constant is SCREAMING_SNAKE and carries a trailing
// comment giving its unit and rationale
const constLines = rawSrc.split('\n').filter((l) => /^const\s+[A-Za-z_]/.test(l));
ok(constLines.length > 0, 'module declares module-level constants');
for (const line of constLines) {
  const name = line.match(/^const\s+([A-Za-z_][A-Za-z0-9_]*)/)[1];
  ok(/^[A-Z][A-Z0-9_]*$/.test(name), `constant \`${name}\` is SCREAMING_SNAKE`);
  ok(/;\s*\/\/\s*\S/.test(line), `constant \`${name}\` carries a trailing unit/rationale comment`);
}
ok(Object.isFrozen(GOVERNOR_CONSTANTS), 'GOVERNOR_CONSTANTS is frozen');
ok(ACTIVITY_STATES.length === 6, 'six activity states are named');

// ---------------------------------------------------------------------------
section('B. purity — arguments are never mutated, output never varies by call');
// ---------------------------------------------------------------------------
const frozenEngine = engine({ lastActionAt: 0, moves: moveRing(4, 100) });
const frozenGov = deepFreeze({ ...initialGovernorState(), lastOfferAt: 50, consecutiveUnacted: 2 });
let threw = null;
try {
  shouldOffer(frozenEngine, frozenGov, 200);
  activityState(frozenEngine, 200, K);
  intervalSeconds(frozenGov);
  governorReducer(frozenGov, { type: 'offered', at: 200 });
} catch (e) { threw = e; }
ok(threw === null, 'no write to a deep-frozen engineState or governorState', String(threw));

const a = shouldOffer(frozenEngine, frozenGov, 200);
const b = shouldOffer(frozenEngine, frozenGov, 200);
ok(a.offer === b.offer && a.reason === b.reason, 'shouldOffer is deterministic across calls');

const before = initialGovernorState();
const snapshot = JSON.stringify(before);
const after = governorReducer(before, { type: 'offered', at: 10 });
eq(JSON.stringify(before), snapshot, 'reducer leaves its input state untouched');
ok(after !== before, 'reducer returns a new object');
eq(after.consecutiveUnacted, 1, 'an offer counts as unacted immediately');
eq(after.offers, 1, 'offer count increments');
eq(after.lastOfferAt, 10, 'lastOfferAt records the offer time');

// ---------------------------------------------------------------------------
section('C. MP1 — a student in flow is never offered anything');
// ---------------------------------------------------------------------------
const FLOW_NOW = 1000;
// The governor is at its most eager here: it has never offered, so no interval
// can be doing the suppressing. Only the flow rule can.
const eagerGov = initialGovernorState();
let flowOffers = 0;
for (let moves = K.FLOW_MOVE_COUNT; moves <= 10; moves += 1) {
  for (let idle = 0; idle < K.SETTLED_IDLE_SEC; idle += 1) {
    const st = engine({ lastActionAt: FLOW_NOW - idle, moves: moveRing(moves, FLOW_NOW - idle) });
    const r = shouldOffer(st, eagerGov, FLOW_NOW);
    if (r.offer) flowOffers += 1;
  }
}
eq(flowOffers, 0, 'MP1: zero offers across 8 move-counts x 10 idle values above the flow threshold');
eq(activityState(engine({ lastActionAt: FLOW_NOW - 2, moves: moveRing(5, FLOW_NOW - 2) }), FLOW_NOW, K),
  'in-flow', 'MP1: five moves and 2 s idle classifies as in-flow');
eq(shouldOffer(engine({ lastActionAt: FLOW_NOW - 2, moves: moveRing(5, FLOW_NOW - 2) }), eagerGov, FLOW_NOW).reason,
  'in-flow', 'MP1: the refusal names flow as its reason');
// and flow keeps suppressing however long the session has run
ok(nextOfferAt(engine({ lastActionAt: FLOW_NOW, moves: moveRing(5, FLOW_NOW) }),
  eagerGov, FLOW_NOW, K.SETTLED_IDLE_SEC - 1) === null,
'MP1: no offer anywhere inside the settled window while moves keep landing');

// suppression precedence: thrashing and dormancy outrank even a long stall
const stalledPlusChurn = engine({
  lastActionAt: 0,
  churn: [971, 980, 990, 999, 1000],
});
eq(activityState(stalledPlusChurn, 1000, K), 'thrashing', 'thrashing outranks a stall');
eq(shouldOffer(stalledPlusChurn, eagerGov, 1000).offer, false, 'thrashing student is left alone');
const dormant = engine({ lastActionAt: 0, sleepy: 0.95 });
eq(activityState(dormant, 1000, K), 'dormant', 'a deeply sleepy dial reads as abandonment');
eq(shouldOffer(dormant, eagerGov, 1000).offer, false, 'nothing is offered into an empty room');
// three churn events is exploring, not thrashing — the gate must be a real gate
const someChurn = engine({ lastActionAt: 0, churn: [980, 990, 1000] });
eq(activityState(someChurn, 1000, K), 'stalled', 'churn below the ceiling does not suppress');

// ---------------------------------------------------------------------------
section('D. MP2 — a simulated stall is answered within the stall threshold');
// ---------------------------------------------------------------------------
// No recentMoves at all, so `natural-pause` cannot fire and the offer, when it
// comes, can only be the stall rule.
const stalling = engine({ lastActionAt: 0, moves: [] });
const firstOffer = nextOfferAt(stalling, initialGovernorState(), 0, 300);
ok(firstOffer !== null, 'MP2: an offer eventually arrives during a stall');
ok(firstOffer >= K.STALL_IDLE_SEC && firstOffer <= K.STALL_IDLE_SEC + STEP_SEC,
  `MP2: first offer lands at the stall threshold (${K.STALL_IDLE_SEC}s)`, `got ${firstOffer}s`);
eq(shouldOffer(stalling, initialGovernorState(), K.STALL_IDLE_SEC).reason, 'stalled',
  'MP2: the offer names the stall as its reason');
let earlyOffers = 0;
for (let t = 0; t < K.STALL_IDLE_SEC; t += STEP_SEC) {
  if (shouldOffer(stalling, initialGovernorState(), t).offer) earlyOffers += 1;
}
eq(earlyOffers, 0, 'MP2: nothing is offered before the stall threshold');

// ---------------------------------------------------------------------------
section('E. the natural pause — work landed, then quiet');
// ---------------------------------------------------------------------------
const PAUSE_NOW = 2000;
const settledIdle = K.SETTLED_IDLE_SEC + 5;
const paused = engine({
  lastActionAt: PAUSE_NOW - settledIdle,
  moves: moveRing(4, PAUSE_NOW - settledIdle),
});
eq(activityState(paused, PAUSE_NOW, K), 'natural-pause', 'work then quiet reads as a natural pause');
const pauseResult = shouldOffer(paused, initialGovernorState(), PAUSE_NOW);
ok(pauseResult.offer && pauseResult.reason === 'natural-pause',
  'the pause after a data move is offered into');
// quiet that no work preceded is not a pause
const coldQuiet = engine({ lastActionAt: PAUSE_NOW - settledIdle, moves: [] });
eq(activityState(coldQuiet, PAUSE_NOW, K), 'settling', 'quiet without prior work is not a pause');
eq(shouldOffer(coldQuiet, initialGovernorState(), PAUSE_NOW).offer, false,
  'no offer into quiet that no data move earned');
// a stale data move does not keep earning pauses forever
const stalePause = engine({
  lastActionAt: PAUSE_NOW - settledIdle,
  moves: moveRing(2, PAUSE_NOW - K.PAUSE_AFTER_MOVE_SEC - 60),
});
eq(activityState(stalePause, PAUSE_NOW, K), 'settling', 'a data move older than the pause window expires');

// ---------------------------------------------------------------------------
section('F. MP3 — the interval lengthens monotonically across three unacted');
// ---------------------------------------------------------------------------
// F1: the arithmetic.
let gov = initialGovernorState();
near(intervalSeconds(gov), K.BASE_INTERVAL_SEC, 'a fresh governor waits the base interval');
const arithmetic = [];
for (let i = 0; i < 3; i += 1) {
  gov = governorReducer(gov, { type: 'offered', at: i * 1000 });
  arithmetic.push(intervalSeconds(gov));
}
eq(gov.consecutiveUnacted, 3, 'three offers with no uptake counted as three unacted');
ok(arithmetic[0] < arithmetic[1] && arithmetic[1] < arithmetic[2],
  'MP3 (arithmetic): interval strictly increases over three unacted wonderings',
  `got ${arithmetic.map((v) => v.toFixed(1)).join(' -> ')}`);
ok(arithmetic[0] > K.BASE_INTERVAL_SEC, 'the first unacted wondering already lengthens the wait');
ok(arithmetic.every((v) => v <= K.MAX_INTERVAL_SEC), 'the interval never exceeds its ceiling');

// F2: the behaviour. A student stalled for the whole simulation, so the ONLY
// thing that can move the offer times apart is the de-escalating interval.
const longStall = engine({ lastActionAt: 0, moves: [] });
let simGov = initialGovernorState();
const offerTimes = [];
let t = 0;
for (let i = 0; i < 4; i += 1) {
  const at = nextOfferAt(longStall, simGov, t);
  if (at === null) break;
  offerTimes.push(at);
  simGov = governorReducer(simGov, { type: 'offered', at });
  t = at + STEP_SEC;
}
eq(offerTimes.length, 4, 'four wonderings were offered during the long stall');
const gaps = offerTimes.slice(1).map((v, i) => v - offerTimes[i]);
ok(gaps.length === 3 && gaps[0] < gaps[1] && gaps[1] < gaps[2],
  'MP3 (behaviour): the observed gap between consecutive offers strictly grows',
  `gaps ${gaps.join('s, ')}s at t=${offerTimes.join(', ')}`);
for (let i = 0; i < gaps.length; i += 1) {
  const expected = Math.min(
    K.MAX_INTERVAL_SEC, K.BASE_INTERVAL_SEC * (K.DE_ESCALATION_FACTOR ** (i + 1)),
  );
  ok(gaps[i] >= expected && gaps[i] < expected + 2 * STEP_SEC,
    `gap ${i + 1} matches the de-escalated interval (~${expected.toFixed(0)}s)`, `got ${gaps[i]}s`);
}

// F3: uptake resets the de-escalation, and only uptake does.
const acted = governorReducer(gov, { type: 'acted', at: 5000 });
near(intervalSeconds(acted), K.BASE_INTERVAL_SEC, 'uptake resets the interval to the base');
eq(acted.lastOfferAt, gov.lastOfferAt, 'uptake does not restart the quiet period');
eq(governorReducer(acted, { type: 'unacted' }).consecutiveUnacted, 1,
  'an explicit unacted report re-arms de-escalation');
// the ceiling holds
const saturated = { ...initialGovernorState(), consecutiveUnacted: 50 };
near(intervalSeconds(saturated), K.MAX_INTERVAL_SEC, 'the interval saturates at its ceiling');

// F4: MP3 through the OTHER door. The header names one caller for `unacted`:
// "a caller that reports fades without reporting offers". For that caller
// `unacted` is the ONLY de-escalation signal it ever sends, so MP3 must hold
// over a run of `unacted` events exactly as it holds over a run of `offered`
// ones. Asserted against the CONTRACT (each report lengthens the wait), not
// against whatever the reducer happens to compute.
let fadeGov = initialGovernorState();
const fadeCounts = [];
const fadeIntervals = [];
for (let i = 0; i < 4; i += 1) {
  fadeGov = governorReducer(fadeGov, { type: 'unacted' });
  fadeCounts.push(fadeGov.consecutiveUnacted);
  fadeIntervals.push(intervalSeconds(fadeGov));
}
eq(JSON.stringify(fadeCounts), JSON.stringify([1, 2, 3, 4]),
  'four fade reports count as four unacted wonderings');
ok(fadeIntervals[0] < fadeIntervals[1] && fadeIntervals[1] < fadeIntervals[2],
  'MP3 (fade-only caller): the interval strictly grows across three unacted reports',
  `got ${fadeIntervals.map((v) => v.toFixed(2)).join(' -> ')}`);
ok(fadeIntervals[3] >= fadeIntervals[2], 'a fourth fade never shortens the wait',
  `got ${fadeIntervals[2].toFixed(2)} -> ${fadeIntervals[3].toFixed(2)}`);
ok(fadeIntervals.every((v) => v <= K.MAX_INTERVAL_SEC + EPS),
  'fade-driven de-escalation still respects the ceiling');
// the two doors agree: n fades and n offers put the governor at the same rate
let offerGov = initialGovernorState();
for (let i = 0; i < 3; i += 1) offerGov = governorReducer(offerGov, { type: 'offered', at: i });
let fadeGov3 = initialGovernorState();
for (let i = 0; i < 3; i += 1) fadeGov3 = governorReducer(fadeGov3, { type: 'unacted' });
near(intervalSeconds(fadeGov3), intervalSeconds(offerGov),
  'three fades and three offers de-escalate to the same interval');
// and the behavioural half: a fade-only caller's offers really do spread apart
const fadeStall = engine({ lastActionAt: 0, moves: [] });
let simFade = initialGovernorState();
const fadeOfferTimes = [];
let ft = 0;
for (let i = 0; i < 4; i += 1) {
  const at = nextOfferAt(fadeStall, simFade, ft);
  if (at === null) break;
  fadeOfferTimes.push(at);
  // a caller that reports the FADE but not the OFFER: it must still slow down.
  simFade = { ...governorReducer(simFade, { type: 'unacted' }), lastOfferAt: at };
  ft = at + STEP_SEC;
}
const fadeGaps = fadeOfferTimes.slice(1).map((v, i) => v - fadeOfferTimes[i]);
ok(fadeGaps.length === 3 && fadeGaps[0] < fadeGaps[1] && fadeGaps[1] < fadeGaps[2],
  'MP3 (fade-only, behavioural): observed gaps between offers strictly grow',
  `gaps ${fadeGaps.join('s, ')}s at t=${fadeOfferTimes.join(', ')}`);

// ---------------------------------------------------------------------------
section('G. time is a parameter — no clock is read anywhere');
// ---------------------------------------------------------------------------
const shiftedEngine = engine({ lastActionAt: BIG_SHIFT_SEC + 0, moves: moveRing(4, BIG_SHIFT_SEC + 100) });
const baseEngine = engine({ lastActionAt: 0, moves: moveRing(4, 100) });
const shiftedGov = { ...initialGovernorState(), lastOfferAt: BIG_SHIFT_SEC + 50, consecutiveUnacted: 2 };
const baseGov = { ...initialGovernorState(), lastOfferAt: 50, consecutiveUnacted: 2 };
let mismatches = 0;
for (let d = 0; d <= 600; d += 5) {
  const x = shouldOffer(baseEngine, baseGov, 100 + d);
  const y = shouldOffer(shiftedEngine, shiftedGov, BIG_SHIFT_SEC + 100 + d);
  if (x.offer !== y.offer || x.reason !== y.reason) mismatches += 1;
}
eq(mismatches, 0, 'shifting every timestamp by 1e6 s changes nothing (121 sample points)');
// a state carrying only the engine's live `idleSeconds` getter still works
eq(activityState({ idleSeconds: K.STALL_IDLE_SEC + 1, recentMoves: [], componentChurn: [] }, 0, K),
  'stalled', 'idleSeconds is honoured as a fallback when lastActionAt is absent');

// G2. THE SILENT FAILURE THIS HEADER ALREADY WARNS ABOUT. If a caller passes
// `Date.now()`-based timestamps against a `performance.now()`-based clock (or
// vice versa) every stamp lands in the FUTURE. A window is an interval with two
// ends; testing only the upper one makes every future stamp "recent", so the
// mismatch reads as permanent activity instead of failing loudly.
eq(activityState({ componentChurn: [1e6, 1e6, 1e6, 1e6], lastActionAt: 0 }, 100, K), 'stalled',
  'churn stamped in the future is not counted as churn');
eq(activityState(
  engine({ lastActionAt: 998, moves: moveRing(5, BIG_SHIFT_SEC) }), 1000, K), 'settling',
'data moves stamped in the future do not read as flow');
eq(activityState(
  engine({ lastActionAt: 1000 - K.SETTLED_IDLE_SEC - 5, moves: moveRing(2, BIG_SHIFT_SEC) }), 1000, K),
'settling', 'a data move stamped in the future does not earn a natural pause');
// the boundary itself: a stamp exactly at `now` is inside, one strictly after is out
eq(activityState({ componentChurn: [1000, 1000, 1000, 1000], lastActionAt: 0 }, 1000, K), 'thrashing',
  'churn stamped exactly at `now` is inside the window');
eq(activityState({ componentChurn: [1001, 1000, 1000, 1000], lastActionAt: 0 }, 1000, K), 'stalled',
  'one churn stamp a second in the future drops the count below the gate');

// G3. THE CLOCK MUST NOT BE TOUCHED THROUGH A GETTER. On a real
// `BehaviorEngine.state`, `idleSeconds` is a defineProperty getter that calls
// `performance.now()` (`behavior-engine.js:81-82`), so merely READING the
// property smuggles a clock into a module whose header promises none. A state
// carrying `lastActionAt` must never reach for it.
let clockTouches = 0;
const spyState = {
  lastActionAt: 900,
  recentMoves: moveRing(4, 980),
  componentChurn: [],
  mood: { sleepy: 0.1 },
};
Object.defineProperty(spyState, 'idleSeconds', {
  get: () => { clockTouches += 1; return 0; }, enumerable: true,
});
activityState(spyState, 1000, K);
shouldOffer(spyState, initialGovernorState(), 1000);
eq(clockTouches, 0, 'idleSeconds is never read when lastActionAt is present (no clock via getter)');

// ---------------------------------------------------------------------------
section('H. adjustable — tuning overrides are read from state, not globals');
// ---------------------------------------------------------------------------
const tuned = { ...initialGovernorState(), tuning: { STALL_IDLE_SEC: 5, BASE_INTERVAL_SEC: 10 } };
near(intervalSeconds(tuned), 10, 'a tuned base interval is honoured');
const tunedFirst = nextOfferAt(engine({ lastActionAt: 0, moves: [] }), tuned, 0, 100);
ok(tunedFirst !== null && tunedFirst <= 5 + STEP_SEC,
  'a tuned stall threshold fires earlier, even when tuned below the settled line',
  `got ${tunedFirst}`);
// untouched defaults are unaffected — no global mutation
near(intervalSeconds(initialGovernorState()), K.BASE_INTERVAL_SEC,
  'tuning one state does not leak into another');
eq(K.STALL_IDLE_SEC, GOVERNOR_CONSTANTS.STALL_IDLE_SEC, 'GOVERNOR_CONSTANTS still holds its defaults');

// H2. `governorState.tuning` is written by the DASHBOARD — it is untrusted
// input, not a constant. The invariant that must survive any value a dashboard
// can put there is the module's whole purpose: MORE unacted wonderings NEVER
// means a SHORTER wait. Asserted against the invariant, not against the clamp.
const invert = { ...initialGovernorState(), consecutiveUnacted: 3, tuning: { DE_ESCALATION_FACTOR: 0.5 } };
ok(intervalSeconds(invert) >= K.BASE_INTERVAL_SEC - EPS,
  'a sub-1 de-escalation factor cannot invert de-escalation into escalation',
  `three unacted wonderings yielded ${intervalSeconds(invert).toFixed(2)}s, shorter than the base ${K.BASE_INTERVAL_SEC}s`);

const HOSTILE_TUNINGS = [
  { label: 'inverting factor', tuning: { DE_ESCALATION_FACTOR: 0.5 } },
  { label: 'zero factor', tuning: { DE_ESCALATION_FACTOR: 0 } },
  { label: 'negative factor', tuning: { DE_ESCALATION_FACTOR: -2 } },
  { label: 'absurd factor', tuning: { DE_ESCALATION_FACTOR: 1e9 } },
  { label: 'negative base', tuning: { BASE_INTERVAL_SEC: -100 } },
  { label: 'zero base', tuning: { BASE_INTERVAL_SEC: 0 } },
  { label: 'negative ceiling', tuning: { MAX_INTERVAL_SEC: -1 } },
  { label: 'zero ceiling', tuning: { MAX_INTERVAL_SEC: 0 } },
  { label: 'all three hostile', tuning: { BASE_INTERVAL_SEC: -5, DE_ESCALATION_FACTOR: 0.1, MAX_INTERVAL_SEC: -9 } },
  { label: 'non-numeric factor', tuning: { DE_ESCALATION_FACTOR: '0.5' } },
  { label: 'NaN factor', tuning: { DE_ESCALATION_FACTOR: Number.NaN } },
  { label: 'infinite factor', tuning: { DE_ESCALATION_FACTOR: Number.POSITIVE_INFINITY } },
];
for (const { label, tuning } of HOSTILE_TUNINGS) {
  const series = [0, 1, 2, 3, 4, 5].map(
    (n) => intervalSeconds({ ...initialGovernorState(), consecutiveUnacted: n, tuning }));
  ok(series.every((v) => Number.isFinite(v) && v > 0),
    `tuning "${label}": every interval is a positive finite number`, `got ${series.join(', ')}`);
  ok(series.every((v, i) => i === 0 || v >= series[i - 1] - EPS),
    `tuning "${label}": the interval never SHRINKS as unacted grows`, `got ${series.join(' -> ')}`);
  ok(series.every((v) => v <= K.MAX_INTERVAL_SEC * 10),
    `tuning "${label}": the interval stays inside a sane ceiling`, `got ${series.join(', ')}`);
}
// an out-of-range activity threshold cannot make a class of student unreachable
const hostileActivity = { ...initialGovernorState(), tuning: { THRASH_CHURN_COUNT: -1, DORMANT_SLEEPY: -1 } };
const plainStall = engine({ lastActionAt: 0, moves: [] });
ok(shouldOffer(plainStall, hostileActivity, 1000).offer,
  'a negative thrash/dormant threshold cannot silence the governor forever',
  `reason ${shouldOffer(plainStall, hostileActivity, 1000).reason}`);
// a tuning key the module does not know is ignored outright
const stray = { ...initialGovernorState(), tuning: { NOT_A_CONSTANT: 1, __proto__: { BASE_INTERVAL_SEC: 1 } } };
near(intervalSeconds(stray), K.BASE_INTERVAL_SEC, 'unknown and inherited tuning keys are ignored');

// ---------------------------------------------------------------------------
section('I. reducer edge cases');
// ---------------------------------------------------------------------------
const someState = governorReducer(initialGovernorState(), { type: 'offered', at: 1 });
eq(governorReducer(someState, { type: 'nonsense' }), someState, 'an unknown event is the identity');
eq(governorReducer(someState, undefined), someState, 'a missing event is the identity');
eq(governorReducer(undefined, { type: 'offered', at: 3 }).offers, 1,
  'a missing state is treated as the initial state');
const resetKeepsTuning = governorReducer({ ...someState, tuning: { BASE_INTERVAL_SEC: 7 } }, { type: 'reset' });
eq(resetKeepsTuning.consecutiveUnacted, 0, 'reset clears de-escalation');
eq(resetKeepsTuning.offers, 0, 'reset clears the offer count');
near(intervalSeconds(resetKeepsTuning), 7, 'reset preserves the session tuning');
eq(shouldOffer(engine({ lastActionAt: 0 }), initialGovernorState(), Number.NaN).offer, false,
  'a nonsense clock offers nothing');
eq(activityState({}, 1000, K), 'settling', 'an empty state classifies as settling, not stalled');

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(76)}`);
if (failures) {
  console.log(`FAILED — ${failures} assertion${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('OK — governor.js: flow silences, the stall is answered, and each');
console.log('     unacted wondering lengthens the wait before the next.');
