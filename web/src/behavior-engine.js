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
      selection: null,                // { context, count, at }
      drag: null,                     // { phase, attribute, position, at }
      lastActionAt: now(),
      active: null,                   // { id, escalated, startedAt, token }
    };
    Object.defineProperty(state, 'idleSeconds', {
      get: () => now() - state.lastActionAt, enumerable: true,
    });
    this.state = state;

    for (const b of behaviors) this.add(b);

    if (bridge) {
      const types = ['component:create', 'component:delete', 'component:move',
        'component:resize', 'component:attributeChange', 'selection', 'drag'];
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

  /** Drive time-based triggers; call from the render loop with dt seconds. */
  tick(dt) {
    this._tickAccum += dt;
    if (this._tickAccum < TICK_INTERVAL_SEC) return;
    this._tickAccum = 0;
    this._evaluate({ type: 'tick', detail: {} });
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
    if (s.active && now() - s.active.startedAt > ACTION_GRACE_SEC) {
      this.cancelActive('student action');
    }
  }

  _updateModel(type, detail, real) {
    const s = this.state;
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
      if (real) this._fetchBounds(detail.id);
      else if (detail.bounds && s.components.has(detail.id)) {
        s.components.get(detail.id).bounds = detail.bounds;
      }
    } else if (type === 'component:attributeChange') {
      const c = s.components.get(detail.id);
      if (c) c.attrsAssigned = (c.attrsAssigned ?? 0) + 1;
    } else if (type === 'selection') {
      s.selection = { ...detail, at: now() };
    } else if (type === 'drag') {
      s.drag = { ...detail, at: now() };
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
    const active = { id: b.id, escalated, startedAt: now(), token };
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
    return { event, mem, sleep, untilCancelled, waitFor, engine: this };
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
    } finally {
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
