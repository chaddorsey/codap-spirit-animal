/**
 * BehaviorEngine — Phase 4.
 *
 * Consumes CodapBridge semantic events plus a clock tick; owns the student
 * model (known components with bounds + timestamps, selection, drag state,
 * idle time); arbitrates behaviors defined as data in behaviors.js.
 *
 * Engine rules (each covered by selfTest()):
 *   - one intervention at a time; higher priority wins ties;
 *   - a behavior on cooldown never fires;
 *   - escalation variants fire only after `escalation.after` subtle firings
 *     went un-acted-on (a behavior's `satisfied()` resets the counter);
 *   - any fresh student action cancels an in-flight intervention within ~1s
 *     and returns the character to idle (actor.stop()).
 *
 * Exposed as window.__engine with an inspectable .state (codap-main.js).
 */

export const now = () => performance.now() / 1000; // seconds, monotonic

export class Cancelled extends Error {
  constructor() { super('intervention cancelled'); }
}

// Actions this soon after an intervention starts are (part of) the action
// that *triggered* it — the bridge emits a specific event and then an
// 'activity' event for the same CODAP message, and they must not cancel
// the intervention they just started.
const ACTION_GRACE_SEC = 0.35;
const TICK_INTERVAL_SEC = 1;      // time-based triggers evaluated at this rate
const BOUNDS_RETRIES = 10;        // componentList lags creates by seconds
const BOUNDS_RETRY_MS = 600;

// ---- mood drift rates (per second; see docs/CHARACTER.md "Mood") ----
const SLEEPY_RISE_PER_IDLE_SEC = 0.003;   // ~5 min of idle to fully sleepy
const SLEEPY_WAKE_FACTOR = 0.3;           // sharp drop on any student action
const PLAYFUL_BUMP_PER_ACTION = 0.06;     // activity bursts energize
const PLAYFUL_DECAY_PER_SEC = 0.002;
const CURIOUS_DECAY_PER_SEC = 0.01;
const CURIOUS_SPIKE = {                   // new-thing events spike curiosity
  'component:create': 0.35, 'selection': 0.2, 'drag': 0.2,
  'component:attributeChange': 0.25, 'cases:change': 0.1,
};
const MISCHIEF_RISE_PER_SEC = 0.005;      // "unspent energy": accrues while
const MISCHIEF_PLAYFUL_GATE = 0.6;        // playful is high...
const MISCHIEF_DECAY_PER_SEC = 0.005;     // ...drains when it isn't
// felt-only influence on locomotion: playful swims faster, sleepy slower
const SPEED_PLAYFUL_GAIN = 0.2;
const SPEED_SLEEPY_LOSS = 0.3;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class BehaviorEngine {
  constructor(actor, bridge, behaviors = [], { log = () => {} } = {}) {
    this.actor = actor;
    this.bridge = bridge;
    this.log = log;
    this.enabled = true;
    this.behaviors = [];              // priority-sorted, highest first
    this._meta = new Map();           // id -> { lastFiredAt, fires, ignored, mem }
    this._tickAccum = 0;
    this._simSeq = 0;

    const state = {
      components: new Map(),          // id -> { id, type, title, bounds, createdAt,
                                      //         attrsAssigned, preexisting }
      dataContexts: new Map(),        // name -> { name, caseEvents, lastCasesAt }
      componentChurn: [],             // timestamps of recent create/delete events
      selection: null,                // { context, count, at }
      drag: null,                     // { phase, attribute, position, at }
      lastActionAt: now(),
      active: null,                   // { id, escalated, startedAt, token }
      // felt-only mood dials (0..1) — see docs/CHARACTER.md; drift in tick,
      // event bumps in _onEvent/_studentActed; never shown to students
      mood: { playful: 0.5, curious: 0.5, sleepy: 0.1, mischievous: 0 },
    };
    Object.defineProperty(state, 'idleSeconds', {
      get: () => now() - state.lastActionAt, enumerable: true,
    });
    this.state = state;

    for (const b of behaviors) this.add(b);

    if (bridge) {
      const types = ['component:create', 'component:delete', 'component:move',
        'component:resize', 'component:attributeChange', 'selection', 'drag',
        'cases:change'];
      for (const t of types) {
        bridge.addEventListener(t, (e) => this._onEvent(t, e.detail ?? {}, true));
      }
      // every CODAP message counts as a student action, even unmapped ones
      bridge.addEventListener('activity', () => this._studentActed());
      bridge.addEventListener('connected', () => this._seedComponents());
    }
  }

  add(behavior) {
    this.behaviors.push(behavior);
    this.behaviors.sort((a, b) => b.priority - a.priority);
    this._meta.set(behavior.id, { lastFiredAt: -Infinity, fires: 0, ignored: 0, mem: {} });
  }

  /** Drive time-based triggers + mood drift; call from the render loop. */
  tick(dt) {
    this._tickAccum += dt;
    if (this._tickAccum < TICK_INTERVAL_SEC) return;
    this._tickMood(this._tickAccum);
    this._tickAccum = 0;
    this._evaluate({ type: 'tick', detail: {} });
  }

  _tickMood(dt) {
    const m = this.state.mood;
    m.sleepy = clamp01(m.sleepy
      + (this.state.idleSeconds > 5 ? SLEEPY_RISE_PER_IDLE_SEC * dt : 0));
    m.playful = clamp01(m.playful - PLAYFUL_DECAY_PER_SEC * dt);
    m.curious = clamp01(m.curious - CURIOUS_DECAY_PER_SEC * dt);
    m.mischievous = clamp01(m.mischievous
      + (m.playful > MISCHIEF_PLAYFUL_GATE ? MISCHIEF_RISE_PER_SEC : -MISCHIEF_DECAY_PER_SEC) * dt);
    // felt-only locomotion influence (additive Axolotl property)
    this.actor.speedFactor = 1 + SPEED_PLAYFUL_GAIN * m.playful - SPEED_SLEEPY_LOSS * m.sleepy;
  }

  /** Inject a synthetic bridge event (debug panel / selfTest). Updates the
   *  student model exactly as the real event would. `detail.bounds` may be
   *  supplied for component:create since there is no real tile to query. */
  simulate(type, detail = {}) {
    this.log(`⌁ simulate ${type}`);
    this._onEvent(type, { ...detail }, false);
  }

  /** Fire a behavior now, bypassing trigger + cooldown. Respects the
   *  one-at-a-time rule by cleanly cancelling any active intervention. */
  forceFire(id) {
    const b = this.behaviors.find((x) => x.id === id);
    if (!b) return false;
    if (this.state.active) this.cancelActive(`force-fire ${id}`);
    this._fire(b, this._meta.get(id), { type: 'force', detail: {} }, true);
    return true;
  }

  /** Cancel the in-flight intervention (if any) and return the character
   *  to idle. Synchronous — the active slot is free when this returns. */
  cancelActive(reason) {
    const a = this.state.active;
    if (!a) return false;
    this.state.active = null;
    a.token.cancelled = true;
    for (const f of a.token.callbacks) { try { f(); } catch { /* noop */ } }
    try { this.actor.stop?.(); } catch { /* noop */ }
    const b = this.behaviors.find((x) => x.id === a.id);
    try { b?.onCancel?.(this.actor, this.state); } catch { /* noop */ }
    this.log(`✕ ${a.id} cancelled (${reason})`);
    return true;
  }

  // ------------------------------------------------------------ internals

  _onEvent(type, detail, real) {
    this._updateModel(type, detail, real);
    const spike = CURIOUS_SPIKE[type];
    if (spike) this.state.mood.curious = clamp01(this.state.mood.curious + spike);
    this._studentActed();
    const event = { type, detail };
    for (const b of this.behaviors) {
      if (b.satisfied?.(this.state, event)) this._meta.get(b.id).ignored = 0;
    }
    this._evaluate(event);
  }

  _studentActed() {
    const s = this.state;
    s.lastActionAt = now();
    s.mood.sleepy = clamp01(s.mood.sleepy * SLEEPY_WAKE_FACTOR);
    s.mood.playful = clamp01(s.mood.playful + PLAYFUL_BUMP_PER_ACTION);
    // ignoreActivity behaviors accompany continuous student action (e.g.
    // following a drag) — they self-terminate instead of being cancelled
    if (s.active && !s.active.ignoreActivity && now() > s.active.graceUntil) {
      this.cancelActive('student action');
    }
  }

  _updateModel(type, detail, real) {
    const s = this.state;
    if (type === 'component:create' || type === 'component:delete') {
      // model-owned churn history: triggers can't miss events that a
      // higher-priority behavior consumed in the same evaluation
      s.componentChurn.push(now());
      if (s.componentChurn.length > 20) s.componentChurn.shift();
    }
    if (type === 'component:create') {
      if (detail.id == null) detail.id = `sim-${++this._simSeq}`;
      s.components.set(detail.id, {
        id: detail.id, type: detail.type ?? 'unknown',
        title: detail.title ?? '', bounds: detail.bounds ?? null,
        createdAt: now(), attrsAssigned: 0, preexisting: false,
      });
      if (real && !detail.bounds) this._fetchBounds(detail.id);
    } else if (type === 'component:delete') {
      s.components.delete(detail.id);
    } else if (type === 'component:move' || type === 'component:resize') {
      const c = s.components.get(detail.id);
      if (c) c.lastInteractionAt = now();
      if (real) this._fetchBounds(detail.id);
      else if (detail.bounds && c) c.bounds = detail.bounds;
    } else if (type === 'component:attributeChange') {
      const c = s.components.get(detail.id);
      if (c) {
        c.attrsAssigned = (c.attrsAssigned ?? 0) + 1;
        c.lastInteractionAt = now();
      }
    } else if (type === 'selection') {
      s.selection = { ...detail, at: now() };
    } else if (type === 'drag') {
      s.drag = { ...detail, at: now() };
    } else if (type === 'cases:change') {
      const name = detail.context ?? 'unknown';
      const dc = s.dataContexts.get(name)
        ?? { name, caseEvents: 0, lastCasesAt: 0 };
      if (detail.operation === 'createCases' || detail.operation === 'createItems') {
        dc.caseEvents++;
        dc.lastCasesAt = now();
      }
      s.dataContexts.set(name, dc);
    }
  }

  _evaluate(event) {
    if (!this.enabled || this.state.active) return;
    for (const b of this.behaviors) {          // highest priority first
      const m = this._meta.get(b.id);
      if (now() - m.lastFiredAt < (b.cooldownSec ?? 0)) continue;
      let hit = false;
      try { hit = !!b.trigger(this.state, event, m.mem); }
      catch (err) { console.warn(`trigger ${b.id} threw`, err); }
      if (hit) { this._fire(b, m, event); return; }
    }
  }

  _fire(b, m, event, forced = false) {
    const escalated = !!(b.escalation && m.ignored >= b.escalation.after);
    m.lastFiredAt = now();
    m.fires++;
    const token = { cancelled: false, callbacks: [] };
    // interventions triggered by a student event must not be cancelled by the
    // notification burst of that same gesture; clock/forced firings have no
    // triggering action, so any fresh action cancels them immediately
    const triggeredByAction = event.type !== 'tick' && event.type !== 'force';
    const startedAt = now();
    const active = {
      id: b.id, escalated, startedAt, token,
      graceUntil: startedAt + (triggeredByAction ? ACTION_GRACE_SEC : 0),
      ignoreActivity: !!b.ignoreActivity,
    };
    this.state.active = active;
    this.log(`▶ ${b.id}${escalated ? ' ESCALATED' : ''}${forced ? ' (forced)' : ''}`);

    const actor = this._guardedActor(token);
    const ctx = this._makeCtx(token, event, m.mem);
    const runFn = escalated ? b.escalation.run : b.run;
    return Promise.resolve()
      .then(() => runFn.call(b, actor, this.state, ctx))
      .then(() => {
        // completed without the student acting: a subtle firing was ignored
        if (!token.cancelled && b.escalation && !escalated) m.ignored++;
        if (!token.cancelled && escalated) m.ignored = 0;
      })
      .catch((err) => {
        if (!(err instanceof Cancelled)) console.warn(`behavior ${b.id} failed`, err);
      })
      .finally(() => {
        if (this.state.active === active) {
          this.state.active = null;
          this.log(`■ ${b.id} done`);
        }
      });
  }

  /** Actor proxy: every method throws Cancelled once the token is cancelled,
   *  so a run() sequence stops at its next step after cancellation.
   *  (cancelActive() also calls actor.stop(), which resolves any in-flight
   *  moveTo/play promise the sequence is awaiting.) */
  _guardedActor(token) {
    return new Proxy(this.actor, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => {
          if (token.cancelled) throw new Cancelled();
          return v.apply(target, args);
        };
      },
    });
  }

  _makeCtx(token, event, mem) {
    const onCancel = (f) => token.callbacks.push(f);
    const sleep = (sec) => new Promise((res, rej) => {
      if (token.cancelled) return rej(new Cancelled());
      const t = setTimeout(res, sec * 1000);
      onCancel(() => { clearTimeout(t); rej(new Cancelled()); });
    });
    const untilCancelled = () => new Promise((_res, rej) => onCancel(() => rej(new Cancelled())));
    const waitFor = async (fn, { timeoutSec = 6, intervalMs = 250 } = {}) => {
      const deadline = now() + timeoutSec;
      for (;;) {
        const v = fn();
        if (v) return v;
        if (now() >= deadline) return null;
        await sleep(intervalMs / 1000);
      }
    };
    // weighted random choice for performance variety; weights default uniform.
    // Behaviors compute mood-based weights themselves (state.mood is theirs).
    const pick = (options, weights) => {
      const w = weights ?? options.map(() => 1);
      let total = 0;
      for (const x of w) total += Math.max(0, x);
      if (total <= 0) return options[0];
      let r = Math.random() * total;
      for (let i = 0; i < options.length; i++) {
        r -= Math.max(0, w[i]);
        if (r <= 0) return options[i];
      }
      return options[options.length - 1];
    };
    return { event, mem, sleep, untilCancelled, waitFor, pick, engine: this };
  }

  /** Unregister a behavior (debug/selfTest hygiene). */
  remove(id) {
    const i = this.behaviors.findIndex((b) => b.id === id);
    if (i < 0) return false;
    if (this.state.active?.id === id) this.cancelActive(`remove ${id}`);
    this.behaviors.splice(i, 1);
    this._meta.delete(id);
    return true;
  }

  async _seedComponents() {
    const comps = await this.bridge.components().catch(() => []);
    for (const c of comps) {
      if (this.state.components.has(c.id)) continue;
      // preexisting components have unknown attribute state — behaviors that
      // depend on attrsAssigned must not assume 0 means "empty" for these
      this.state.components.set(c.id, {
        ...c, createdAt: now(), attrsAssigned: 0, preexisting: true,
      });
    }
  }

  /** componentList can lag a create notification by several seconds. */
  async _fetchBounds(targetId) {
    for (let i = 0; i < BOUNDS_RETRIES; i++) {
      if (i) await new Promise((r) => setTimeout(r, BOUNDS_RETRY_MS));
      const comps = await this.bridge.components().catch(() => []);
      for (const c of comps) {
        const known = this.state.components.get(c.id);
        if (known) { known.bounds = c.bounds; known.type = c.type; known.title = c.title; }
        else {
          this.state.components.set(c.id, {
            ...c, createdAt: now(), attrsAssigned: 0, preexisting: true,
          });
        }
      }
      if (this.state.components.get(targetId)?.bounds) return;
    }
  }

  // ------------------------------------------------------------ debug

  debugInfo() {
    return this.behaviors.map((b) => {
      const m = this._meta.get(b.id);
      return {
        id: b.id, priority: b.priority,
        cooldownRemaining: Math.max(0, (b.cooldownSec ?? 0) - (now() - m.lastFiredAt)),
        fires: m.fires, ignored: m.ignored,
        escalateAfter: b.escalation?.after ?? null,
      };
    });
  }

  /** Backdate component creation times (test nudge-empty-graph quickly). */
  debugAgeComponents(sec) {
    for (const c of this.state.components.values()) c.createdAt -= sec;
  }

  /** Backdate the last student action (test idle-companion quickly). */
  debugIdle(sec) { this.state.lastActionAt -= sec; }

  /**
   * Phase 4 smoke test: fires each behavior via simulation/force,
   * asserts one-at-a-time, cooldown-blocks-refire, cancel-on-activity.
   * Resolves with { pass, passed, total, results }. Restores engine
   * counters/mem afterwards so a live session isn't polluted.
   */
  async selfTest() {
    const results = [];
    const check = (name, ok) => {
      results.push({ name, ok: !!ok });
      this.log(`${ok ? '✓' : '✗'} ${name}`);
    };
    const rest = (sec) => new Promise((r) => setTimeout(r, sec * 1000));
    const savedEnabled = this.enabled;
    const savedLastAction = this.state.lastActionAt;
    const savedMeta = new Map([...this._meta].map(([id, m]) => [id, {
      lastFiredAt: m.lastFiredAt, fires: m.fires, ignored: m.ignored,
      mem: JSON.parse(JSON.stringify(m.mem)),
    }]));
    const simIds = ['st-cool', 'st-cool2'];
    this.enabled = true;
    try {
      this.cancelActive('selfTest');

      // 1. every behavior can fire (force path)
      for (const b of this.behaviors) {
        this.forceFire(b.id);
        check(`force-fire ${b.id} becomes active`, this.state.active?.id === b.id);
        this.cancelActive('selfTest');
        await rest(0.05);
      }

      // 2. one intervention at a time
      this.forceFire('idle-companion');
      this._evaluate({ type: 'component:create', detail: { id: 'st-oaat', type: 'graph' } });
      check('one-at-a-time: trigger while active does not preempt',
        this.state.active?.id === 'idle-companion');
      this.forceFire('greet-new-component');
      check('force-fire replaces active cleanly (exactly one active)',
        this.state.active?.id === 'greet-new-component');
      this.cancelActive('selfTest');

      // 3. cooldown blocks a refire
      const greet = this._meta.get('greet-new-component');
      if (greet) greet.lastFiredAt = -Infinity;
      const bounds = { x: innerWidth * 0.3, y: innerHeight * 0.35, w: 320, h: 220 };
      this.simulate('component:create', { id: 'st-cool', type: 'graph', bounds });
      check('simulated create fires greet-new-component',
        this.state.active?.id === 'greet-new-component');
      this.cancelActive('selfTest');
      this.simulate('component:create', { id: 'st-cool2', type: 'graph', bounds });
      check('cooldown blocks immediate refire', this.state.active === null);

      // 4. fresh student action cancels an in-flight intervention within ~1s
      const nudge = this._meta.get('nudge-empty-graph');
      if (nudge) nudge.lastFiredAt = -Infinity;
      this.forceFire('nudge-empty-graph');
      check('nudge-empty-graph active for cancel test',
        this.state.active?.id === 'nudge-empty-graph');
      await rest(ACTION_GRACE_SEC + 0.2);
      this.simulate('selection', { context: 'selfTest', count: 1 });
      await rest(0.1);
      check('student action cancels in-flight intervention (≤1s)',
        this.state.active === null);

      // 5. mood: drift + event bumps
      const mood = this.state.mood;
      const savedMood = { ...mood };
      Object.assign(mood, { playful: 0.5, curious: 0.5, sleepy: 0.2, mischievous: 0 });
      this.state.lastActionAt = now() - 30;         // idle enough to drowse
      this._tickMood(30);                            // simulate 30s of drift
      check('mood drifts on tick (sleepy rises while idle)', mood.sleepy > 0.2);
      const sleepyBefore = mood.sleepy;
      const playfulBefore = mood.playful;
      this.simulate('selection', { context: 'selfTest', count: 1 });
      check('student action wakes (sleepy drops, playful bumps)',
        mood.sleepy < sleepyBefore && mood.playful > playfulBefore);

      // 6. mood-gated trigger blocks below threshold, fires above
      this.add({
        id: 'st-mood-gate', priority: 1, cooldownSec: 0,
        trigger: (s, e) => e.type === 'tick' && s.mood.playful > 0.7,
        run: async () => {},
      });
      mood.playful = 0.2;
      this._evaluate({ type: 'tick', detail: {} });
      check('mood-gated trigger blocked below threshold',
        this.state.active?.id !== 'st-mood-gate');
      this.cancelActive('selfTest');
      mood.playful = 0.9;
      this._evaluate({ type: 'tick', detail: {} });
      check('mood-gated trigger fires above threshold',
        this.state.active?.id === 'st-mood-gate');
      this.cancelActive('selfTest');
      this.remove('st-mood-gate');
      Object.assign(mood, savedMood);

      // 7. ctx.pick respects weights
      const ctx = this._makeCtx({ cancelled: false, callbacks: [] }, {}, {});
      const picks = new Set(Array.from({ length: 20 }, () => ctx.pick(['a', 'b'], [1, 0])));
      check('ctx.pick honors zero weights', picks.size === 1 && picks.has('a'));
    } finally {
      this.remove('st-mood-gate');
      this.cancelActive('selfTest');
      for (const id of simIds) this.state.components.delete(id);
      for (const [id, m] of savedMeta) Object.assign(this._meta.get(id), m);
      this.state.lastActionAt = savedLastAction;
      this.enabled = savedEnabled;
      try { this.actor.stop?.(); } catch { /* noop */ }
    }
    const passed = results.filter((r) => r.ok).length;
    const summary = { pass: passed === results.length, passed, total: results.length, results };
    this.log(`selfTest: ${summary.pass ? 'PASS' : 'FAIL'} (${passed}/${results.length})`);
    return summary;
  }
}
