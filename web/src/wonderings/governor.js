/**
 * governor.js — the Wonderings rate governor (plan `-001`, "The Wondering
 * Engine (R9)"; plan `-002` wave W1, module H).
 *
 * WHY THIS FILE EXISTS, AND WHY ITS CORE RULE IS BACKWARDS.
 * The obvious governor rewards engagement: the busier the student, the more the
 * system says. This one does the opposite. `docs/CHARACTER.md:105-107` is
 * binding — *"Never interrupt flow"* — so **a student in flow gets FEWER
 * wonderings, not more.** The moment of need is the stall, not the streak. Every
 * threshold below is arranged around that inversion: flow SUPPRESSES, churn
 * SUPPRESSES, and the two states that earn a wondering are the settled pause
 * after a data move and the stall.
 *
 * WHAT IT READS. `web/src/behavior-engine.js:65-84` already owns a self-tested
 * student model, so this module reuses the engine's STATE and none of its
 * LIFECYCLE (plan `-001` gives three reasons: an intervention is momentary where
 * a wondering persists; the engine cancels on student action, which is exactly
 * when a wondering should stay; and `_evaluate` refuses to fire while
 * `actor.oneShot || actor.motion`, so a zoomie would silence wonderings for
 * nothing). Fields read, never written: `lastActionAt`, `recentMoves` (ring of
 * 10 `{move, kind, at}`), `componentChurn` (timestamps of create/delete),
 * `idleSeconds`, `mood`, `dataMoves`. This module MUST NOT be imported by
 * `behavior-engine.js`; the dependency runs one way only.
 *
 * WHY TIME IS A PARAMETER. `nowSeconds` is passed in on every call and no clock
 * is read here. That is what makes de-escalation testable at all: the must-pass
 * metric is that the interval lengthens across three consecutive unacted
 * wonderings, which would otherwise take twelve minutes of wall clock to
 * observe. Callers must pass the SAME monotonic seconds base the engine writes
 * into `lastActionAt` — i.e. `behavior-engine.js`'s exported
 * `now() = performance.now() / 1000`, never `Date.now()`. Every window here
 * tests BOTH ends, so a caller that gets the base wrong produces timestamps in
 * the future that count as nothing rather than as permanent activity — see
 * `insideWindow`. The mismatch still fails, but it fails toward silence instead
 * of presenting as a student in perpetual crisis.
 *
 * A DELIBERATE NON-READ. `engineState.idleSeconds` is a live getter that calls
 * `performance.now()` inside itself (`behavior-engine.js:81-83`). Reading it
 * would smuggle a clock into a pure module, so idle is computed here as
 * `nowSeconds - lastActionAt`, and `idleSeconds` is consulted ONLY as a fallback
 * for hand-built states that carry no `lastActionAt` (tests, the corpus script).
 *
 * DE-ESCALATION, AND WHY AN OFFER COUNTS AS UNACTED UNTIL PROVEN OTHERWISE.
 * Each unacted wondering LENGTHENS the interval before the next — the opposite
 * of the behaviour engine's escalation, justified by `docs/PHASE7.md`'s
 * under-cheer rule and by the one study that measured it, which found prompting
 * decays motivation over time whether or not it is faded. The reducer therefore
 * increments `consecutiveUnacted` on `offered` ALREADY, without waiting for a
 * later `unacted` report (which increments too, and is the fade-only caller's
 * only signal — see `governorReducer`):
 * the ledger and uptake instrumentation are DELIBERATELY out of scope for this
 * build (plan `-002`, "What is deliberately NOT in this build"), so an `acted`
 * signal may never arrive at all, and a governor that only slowed down when told
 * to would never slow down. Presuming silence and letting `acted` reset the
 * count fails in the quiet direction, which is the direction this project
 * always chooses.
 *
 * ADJUSTABLE WITHOUT BECOMING IMPURE, AND WITHOUT BEING TRUSTED. R9 asks for
 * live tuning. Module-level mutable state would destroy purity, so the defaults
 * are exported frozen as `GOVERNOR_CONSTANTS` and an override map may be carried
 * on `governorState.tuning`. The dashboard writes the state; this module only
 * ever reads it — and validates it. Because the dashboard writes it, `tuning` is
 * untrusted INPUT, not configuration: every override is clamped to the range in
 * `GOVERNOR_TUNING_RANGES` and anything non-finite is discarded. The bound that
 * matters is `DE_ESCALATION_FACTOR >= 1`; a factor of 0.5 was measured
 * 2026-08-28 to turn three unacted wonderings into an ELEVEN-second interval,
 * i.e. de-escalation running backwards, which is the one thing this module
 * cannot be allowed to do.
 *
 * TWO OPTIONS CONSIDERED AND REJECTED, so they are not re-proposed:
 *   1. Gating on `mood` generally (curious → talk more). Rejected: wonderings
 *      are ambient and explicitly NOT the character speaking (plan `-001` R4),
 *      so coupling them to the character's felt-only dials would blur the one
 *      line the doctrine keeps sharp. `mood.sleepy` survives as the single
 *      exception, used only to tell ABANDONMENT from a stall — see
 *      `DORMANT_SLEEPY`.
 *   2. Reusing `ACTION_GRACE_SEC = 0.35` (`behavior-engine.js:29`) as a
 *      don't-interrupt floor. Rejected as dead code: nothing here can offer
 *      below `SETTLED_IDLE_SEC = 10 s`, which is thirty times larger, so the
 *      grace check could never once decide anything.
 *
 * PURE. No browser globals, no `Date.now()`, no `Math.random()`, no
 * `performance.now()`, no mutation of either argument. Named exports only.
 * Evidence for the thresholds is the 2026-08-28 measurement set in
 * `docs/verification/wonderings/`; the test is
 * `docs/verification/wonderings/t-governor.mjs`.
 */

// ---- activity classification ----------------------------------------------
const FLOW_WINDOW_SEC = 60;        // seconds; plan -001 says flow is "several moves in the last minute"
const FLOW_MOVE_COUNT = 3;         // data moves; "several" = 3 of the 10-entry `recentMoves` ring
const SETTLED_IDLE_SEC = 10;       // seconds since the last action before work counts as "landed and settled"; it is ONE line seen from both sides — above it flow has ended, below it a pause has not yet begun
const STALL_IDLE_SEC = 45;         // seconds of unbroken idle that mark the moment of need; well under the engine's 5-minute sleepy ramp so a stall is caught long before Dot drowses
const PAUSE_AFTER_MOVE_SEC = 180;  // seconds; a pause is only a pause if real work preceded it, so the last data move must be this recent
const THRASH_WINDOW_SEC = 30;      // seconds; window over `componentChurn` timestamps
const THRASH_CHURN_COUNT = 4;      // component create/delete events inside the window that mean thrashing, not exploring; the engine keeps 20, so this can never saturate
const DORMANT_SLEEPY = 0.9;        // 0..1 on the engine's felt-only sleepy dial; reached only after ~4.5 min of UNBROKEN idle (rise 0.003/s, wake factor 0.3), i.e. abandonment rather than a stall — offering into an empty room would spend de-escalation budget on nobody

// ---- rate, and its de-escalation ------------------------------------------
const BASE_INTERVAL_SEC = 90;      // seconds between wonderings while they are being taken up; the floor, never the norm
const DE_ESCALATION_FACTOR = 1.8;  // unitless multiplier applied per consecutive unacted wondering — each one ignored makes the next wait 80% longer
const MAX_INTERVAL_SEC = 900;      // seconds (15 min) ceiling; 90 x 1.8^n first exceeds it at n = 4, so growth is STRICT across the three consecutive unacted wonderings the metric names, and flat thereafter

/**
 * Inclusive `[min, max]` bounds for every tunable, exported so the dashboard
 * that writes `governorState.tuning` can show the same range this module
 * enforces. An override outside its range is CLAMPED to the nearest bound; one
 * that is not a finite number is REJECTED and the default stands. Each bound
 * below is the value past which a setting stops tuning the governor and starts
 * disabling it — see `clampTuning`.
 */
export const GOVERNOR_TUNING_RANGES = Object.freeze({
  // seconds; below ~5 s no ring of moves can span the window, above 10 min "recent" is meaningless
  FLOW_WINDOW_SEC: Object.freeze([5, 600]),
  // moves; 0 would make EVERY state in-flow and silence the module forever, 10 is the ring's capacity
  FLOW_MOVE_COUNT: Object.freeze([1, 10]),
  // seconds; 0 would erase the settled line entirely
  SETTLED_IDLE_SEC: Object.freeze([1, 600]),
  // seconds; 0 would make every state a stall, 30 min is past any plausible moment of need
  STALL_IDLE_SEC: Object.freeze([1, 1800]),
  // seconds; a pause must still be attributable to real work, and an hour is not
  PAUSE_AFTER_MOVE_SEC: Object.freeze([5, 3600]),
  // seconds; window over `componentChurn`
  THRASH_WINDOW_SEC: Object.freeze([5, 600]),
  // events; 1 would call a single component create "thrashing", the engine keeps at most 20
  THRASH_CHURN_COUNT: Object.freeze([2, 20]),
  // 0..1 on the sleepy dial; the engine's wake floor is 0.1, so any threshold at or below it reads EVERY awake student as abandoned
  DORMANT_SLEEPY: Object.freeze([0.2, 1]),
  // seconds; under 5 s wonderings would stack faster than they can be read, 15 min is the ceiling's own scale
  BASE_INTERVAL_SEC: Object.freeze([5, 900]),
  // unitless; **the load-bearing bound** — below 1 each unacted wondering would SHORTEN the wait, inverting de-escalation into escalation and breaking `docs/CHARACTER.md:105-107`
  DE_ESCALATION_FACTOR: Object.freeze([1, 5]),
  // seconds; 0 would mean no quiet period at all, 2 h is a whole class period of silence
  MAX_INTERVAL_SEC: Object.freeze([10, 7200]),
});

/** Default rate constants, frozen. Override per-session via `governorState.tuning`. */
export const GOVERNOR_CONSTANTS = Object.freeze({
  FLOW_WINDOW_SEC,
  FLOW_MOVE_COUNT,
  SETTLED_IDLE_SEC,
  STALL_IDLE_SEC,
  PAUSE_AFTER_MOVE_SEC,
  THRASH_WINDOW_SEC,
  THRASH_CHURN_COUNT,
  DORMANT_SLEEPY,
  BASE_INTERVAL_SEC,
  DE_ESCALATION_FACTOR,
  MAX_INTERVAL_SEC,
});

/**
 * The six activity states. The first four are silent; only `natural-pause` and
 * `stalled` can earn a wondering, and even they must still clear the interval.
 */
export const ACTIVITY_STATES = Object.freeze([
  'thrashing', 'dormant', 'in-flow', 'settling', 'natural-pause', 'stalled',
]);

/** A usable number — not `undefined`, not `null`, not `NaN`. */
function finite(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * Bring one override inside its documented range, or reject it.
 *
 * `governorState.tuning` is written by the DASHBOARD, which makes it untrusted
 * input rather than configuration. Trusting a finite number was enough to
 * invert the module's single purpose: `{DE_ESCALATION_FACTOR: 0.5}` turned each
 * unacted wondering into a SHORTER wait, so three ignored wonderings brought the
 * interval down from 90 s to 11.25 s — the governor talking over the student
 * precisely because the student was not listening, against
 * `docs/CHARACTER.md:105-107`. Measured 2026-08-28.
 *
 * Out of range is clamped rather than rejected because a dashboard slider that
 * silently snapped back to a default would read as broken; clamping keeps the
 * setting's direction while refusing its extremity.
 *
 * @returns {number} the value to use for `key`.
 */
function clampTuning(key, value) {
  if (!finite(value)) return GOVERNOR_CONSTANTS[key];
  const range = GOVERNOR_TUNING_RANGES[key];
  if (!range) return GOVERNOR_CONSTANTS[key];
  return Math.min(range[1], Math.max(range[0], value));
}

/**
 * Resolve the rate constants for a state, applying its validated `tuning`
 * overrides. Only OWN, KNOWN keys are consulted — an inherited `BASE_INTERVAL_SEC`
 * arriving through `__proto__` is not a setting anyone chose.
 */
function constantsFor(governorState) {
  const tuning = governorState?.tuning;
  if (!tuning || typeof tuning !== 'object') return GOVERNOR_CONSTANTS;
  const merged = { ...GOVERNOR_CONSTANTS };
  for (const key of Object.keys(GOVERNOR_CONSTANTS)) {
    if (!Object.prototype.hasOwnProperty.call(tuning, key)) continue;
    merged[key] = clampTuning(key, tuning[key]);
  }
  return merged;
}

/**
 * Seconds since the student last acted. Computed from `lastActionAt` against
 * the caller's clock; `idleSeconds` is only a fallback, because on a real
 * engine state it is a getter that reads `performance.now()`.
 */
function idleFrom(engineState, nowSeconds) {
  const last = engineState?.lastActionAt;
  if (finite(last) && finite(nowSeconds)) return Math.max(0, nowSeconds - last);
  const idle = engineState?.idleSeconds;
  return finite(idle) ? Math.max(0, idle) : 0;
}

/**
 * Is a timestamp `age` seconds old inside a window `windowSec` wide?
 *
 * BOTH ends are tested, and the lower one is the point. A window is an interval;
 * checking only `age <= windowSec` accepts every NEGATIVE age, i.e. every
 * timestamp in the future. That is exactly the shape a clock-base mismatch takes
 * — a caller passing `Date.now()` seconds against `lastActionAt` written from
 * `performance.now()` puts every stamp ~1.7e9 s in the future — and it fails
 * SILENTLY in the loud direction: measured 2026-08-28,
 * `activityState({componentChurn: [1e6 x 4], lastActionAt: 0}, 100)` returned
 * `thrashing`, so a mismatched clock presented as a student in crisis and
 * suppressed the module forever. With the lower bound it reads `stalled`, which
 * is what a state with no real activity in it should read as.
 */
function insideWindow(age, windowSec) { return age >= 0 && age <= windowSec; }

/** Count entries of a timestamp-bearing array inside `[now - window, now]`. */
function countSince(entries, at, nowSeconds, windowSec) {
  if (!Array.isArray(entries)) return 0;
  let n = 0;
  for (const entry of entries) {
    const t = at(entry);
    if (finite(t) && insideWindow(nowSeconds - t, windowSec)) n += 1;
  }
  return n;
}

/** Timestamp of the most recent data move, or `null` if there has never been one. */
function lastMoveAt(engineState) {
  const moves = engineState?.recentMoves;
  if (!Array.isArray(moves)) return null;
  let latest = null;
  for (const m of moves) {
    if (finite(m?.at) && (latest === null || m.at > latest)) latest = m.at;
  }
  return latest;
}

/**
 * Classify what the student is doing, with no reference to when we last spoke.
 *
 * Order matters: the two suppressing states outrank everything, because a
 * thrashing or absent student must be left alone however long it has been.
 *
 * @param {Object} engineState  `BehaviorEngine.state` (or a literal of the same shape).
 * @param {number} nowSeconds   Monotonic seconds, same base as `lastActionAt`.
 * @param {Object} [tuning]     Resolved constants; defaults to `GOVERNOR_CONSTANTS`.
 * @returns {'thrashing'|'dormant'|'in-flow'|'settling'|'natural-pause'|'stalled'}
 */
export function activityState(engineState, nowSeconds, tuning = GOVERNOR_CONSTANTS) {
  const K = tuning;
  const churn = countSince(
    engineState?.componentChurn, (t) => t, nowSeconds, K.THRASH_WINDOW_SEC,
  );
  if (churn >= K.THRASH_CHURN_COUNT) return 'thrashing';

  const sleepy = engineState?.mood?.sleepy;
  if (finite(sleepy) && sleepy >= K.DORMANT_SLEEPY) return 'dormant';

  const idle = idleFrom(engineState, nowSeconds);
  // The stall is tested BEFORE the settled line even though the defaults make
  // the two impossible to confuse (45 s vs 10 s). Tuning can invert them, and
  // when it does the stall must win: idle past the stall threshold is the
  // moment of need by definition, and no amount of past activity makes a
  // student who has done nothing for that long still be in flow.
  if (idle >= K.STALL_IDLE_SEC) return 'stalled';

  const moves = countSince(
    engineState?.recentMoves, (m) => m?.at, nowSeconds, K.FLOW_WINDOW_SEC,
  );
  if (idle < K.SETTLED_IDLE_SEC) {
    // Busy AND recently active is flow; briefly quiet after little work is not
    // a pause yet, it is just the gap between two clicks.
    return moves >= K.FLOW_MOVE_COUNT ? 'in-flow' : 'settling';
  }

  const last = lastMoveAt(engineState);
  if (last !== null && insideWindow(nowSeconds - last, K.PAUSE_AFTER_MOVE_SEC)) return 'natural-pause';
  return 'settling';
}

/** A fresh governor state. Nothing offered yet, nothing ignored yet. */
export function initialGovernorState() {
  return {
    lastOfferAt: null,       // seconds, caller's clock; null = never offered
    lastActedAt: null,       // seconds; when a wondering was last taken up
    offers: 0,               // lifetime count, for the dashboard
    consecutiveUnacted: 0,   // the de-escalation exponent
  };
}

/**
 * How long the governor will stay quiet after its last offer, given how many
 * wonderings in a row have gone unacted. Grows geometrically and is capped.
 *
 * @param {Object} [governorState]
 * @returns {number} seconds
 */
export function intervalSeconds(governorState) {
  const K = constantsFor(governorState);
  const unacted = Math.max(
    0, finite(governorState?.consecutiveUnacted) ? governorState.consecutiveUnacted : 0,
  );
  return Math.min(
    K.MAX_INTERVAL_SEC,
    K.BASE_INTERVAL_SEC * (K.DE_ESCALATION_FACTOR ** unacted),
  );
}

/**
 * Should a wondering be offered right now?
 *
 * @param {Object} engineState    `BehaviorEngine.state`; read, never mutated.
 * @param {Object} governorState  This module's own state; read, never mutated.
 * @param {number} nowSeconds     Monotonic seconds, same base as `lastActionAt`.
 * @returns {{offer: boolean, reason: string}} `reason` is one of
 *   `thrashing | dormant | in-flow | settling | too-soon | natural-pause | stalled`.
 *   The last two are the only ones that ever accompany `offer: true`.
 */
export function shouldOffer(engineState, governorState, nowSeconds) {
  if (!finite(nowSeconds)) return { offer: false, reason: 'settling' };
  const K = constantsFor(governorState);
  const state = activityState(engineState, nowSeconds, K);

  if (state !== 'natural-pause' && state !== 'stalled') {
    return { offer: false, reason: state };
  }

  const lastOfferAt = governorState?.lastOfferAt;
  if (finite(lastOfferAt)) {
    const waited = nowSeconds - lastOfferAt;
    if (waited < intervalSeconds(governorState)) return { offer: false, reason: 'too-soon' };
  }
  return { offer: true, reason: state };
}

/**
 * The governor's pure reducer: `(state, event) -> state`. Never mutates, always
 * returns a new object when something changed, and returns the SAME object for
 * an event it does not recognise.
 *
 * Events:
 *   `{ type: 'offered', at }` — a wondering was put on screen. Counts as
 *      unacted immediately (see the header): uptake reporting may never exist.
 *   `{ type: 'acted', at }`   — the student did something the wondering asked
 *      about. Resets the de-escalation exponent to 0; does NOT restart the
 *      interval, because acting on a wondering is not a reason to go quiet.
 *   `{ type: 'unacted' }`     — an explicit report that a shown wondering was
 *      ignored. It INCREMENTS, exactly as `offered` does, because the caller it
 *      exists for reports fades and not offers, and for that caller this is the
 *      only de-escalation signal there is; an idempotent version gave it one
 *      step and then a flat interval forever (measured 2026-08-28:
 *      162 -> 162 -> 162 -> 162 s over four fades). The cost is that a caller
 *      reporting BOTH an offer and its fade counts that wondering twice and so
 *      de-escalates at 1.8² per wondering. That is deliberate: double-counting
 *      errs toward silence, and silence is the direction this project always
 *      chooses. Callers should report one or the other, not both.
 *   `{ type: 'reset' }`       — new document / new session.
 *
 * @param {Object} governorState
 * @param {{type: string, at?: number}} event
 * @returns {Object} the next state
 */
export function governorReducer(governorState, event) {
  const prev = governorState ?? initialGovernorState();
  const type = event?.type;
  const at = finite(event?.at) ? event.at : null;

  if (type === 'offered') {
    return {
      ...prev,
      lastOfferAt: at ?? prev.lastOfferAt ?? null,
      offers: (finite(prev.offers) ? prev.offers : 0) + 1,
      consecutiveUnacted: (finite(prev.consecutiveUnacted) ? prev.consecutiveUnacted : 0) + 1,
    };
  }
  if (type === 'acted') {
    return { ...prev, lastActedAt: at ?? prev.lastActedAt ?? null, consecutiveUnacted: 0 };
  }
  if (type === 'unacted') {
    const already = finite(prev.consecutiveUnacted) ? prev.consecutiveUnacted : 0;
    return { ...prev, consecutiveUnacted: already + 1 };
  }
  if (type === 'reset') {
    return prev.tuning ? { ...initialGovernorState(), tuning: prev.tuning } : initialGovernorState();
  }
  return prev;
}
