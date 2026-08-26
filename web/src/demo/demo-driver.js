/**
 * demo-driver.js — Dot performs a real CODAP action, then undoes it.
 *
 * Phase 9 P1 (docs/PHASE9-SHOWME.md). This file owns the choreography; it
 * does NOT own the event protocols (web/src/inject.js) and it does NOT own
 * what to demonstrate (P2's DemoScript).
 *
 * Two architectural decisions, both measured, both load-bearing:
 *
 * 1. **The driver does not use `moveTo()` for the carry.** `character.js`
 *    `update()` re-calls `faceToward()` every motion frame and its arrival
 *    ritual snaps `targetFacing` back to 0 — either would unwind a held 3/4
 *    turn mid-demonstration. Instead the driver sets Dot's position directly
 *    each frame from the same cursor sample that produced the injected
 *    pointer event, with `facingOverride` set for the demo's duration.
 *
 * 2. **The paw is placed analytically, not chased.** Each frame the driver
 *    reads where the paw actually is (`axo.pawScreen`), subtracts Dot's body
 *    position to get the pose's paw offset, and puts the body at
 *    `cursor − offset`. Translation does not change that offset, so the paw
 *    lands ON the cursor in the same frame — no feedback gain, no settling,
 *    no oscillation. The residual is only what the pose animated between two
 *    frames, which is what the P1 ≤10px metric actually measures.
 *
 * Revert is state-diff driven and performed as VISIBLE Undo taps: Dot swims
 * to the toolbar, taps Undo, and the student watches the change unwind. The
 * diff decides how many taps and — critically — when to STOP, so a student
 * action that landed on the undo stack mid-demo is never undone.
 */
import { DemoCursor } from './cursor.js';
import { CursorPath, arcPath, runPath } from './timeline.js';
import { coerce, validate, DemoValidationError } from './demo-lang.js';
import { resolveTarget, evalCondition, TargetNotFound } from './resolvers.js';

/**
 * Verbs that can change the document. Only these are followed by a state
 * snapshot for the mutation cap — see the note in runScript().
 */
const MUTATING_VERBS = new Set([
  'tap', 'openMenu', 'choose', 'drag', 'marquee', 'type', 'carryCsv',
  'clearSelection', 'waitFor',
]);

/** Safety caps for externally authored scripts (a script is untrusted input). */
export const CAPS = {
  steps: 40,          // also enforced by the schema
  mutations: 10,      // measured by LIVE STATE DIFF, never by counting events
  wallClockSec: 60,
  undoClicks: 8,
};

/**
 * Cancellation channels 1 and 3 from the work order. Channel 2 (trusted
 * pointermove during an injected drag) was measured HARMLESS in P0 — 9-10
 * confirmed trusted moves interleaved into a live drag, drop committed 2/2 —
 * so it is deliberately NOT wired. That is a recorded P0 result, not an
 * oversight.
 *
 * The grace period matters: the click that STARTS a demo (a "Show me." link,
 * or the debug button) is itself a trusted pointerdown, and without a grace
 * it would cancel the demo it just started.
 */
class CancelWatch {
  constructor(onCancel, { graceMs = 500 } = {}) {
    this.onCancel = onCancel;
    this.armAt = performance.now() + graceMs;
    this.docs = [];
    this.handler = (e) => {
      if (e.__dotDemo || !e.isTrusted) return;      // our own input
      if (performance.now() < this.armAt) return;   // the click that started us
      this.onCancel(`student ${e.type}`);
    };
  }

  watch(doc) {
    if (!doc || this.docs.includes(doc)) return;
    this.docs.push(doc);
    for (const t of ['pointerdown', 'keydown']) {
      doc.addEventListener(t, this.handler, true);
    }
  }

  stop() {
    for (const doc of this.docs) {
      for (const t of ['pointerdown', 'keydown']) {
        doc.removeEventListener(t, this.handler, true);
      }
    }
    this.docs = [];
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Seconds from the start of `tap_L`/`tap_R` to the paw's first contact.
 *
 * MEASURED, not assumed (P1). The clip flicks the hand with `sin(4·pi·u)`
 * over u = (t − 0.35)/0.5 of a 1.4 s clip (pipeline/02_build_clips.py
 * `_tap_for`), predicting peaks at 0.578 s and 0.928 s. Sampling the paw's
 * projected position every frame through a live `tap_R` and taking the
 * deviation from the reached-and-held pose put the two flick peaks at
 * **0.590 s and 0.923 s** — so 0.59 it is.
 *
 * bat-a-point's 0.19 s does NOT transfer: different clip, different flick.
 * The screen-space excursion of the flick is only ~13 px because most of the
 * motion is toward the camera, which an orthographic view cannot show — that
 * is why this had to be measured on the tip, not eyeballed.
 */
export const TAP_CONTACT_SEC = 0.59;

export class DemoAbort extends Error {
  constructor(reason = 'demo aborted') { super(reason); this.name = 'DemoAbort'; }
}

export class DemoDriver {
  /**
   * @param {object} deps
   * @param {import('../character.js').Axolotl} deps.axo
   * @param {object} deps.stage
   * @param {object} deps.bridge     CodapBridge (API assertions + revert)
   * @param {import('../inject.js').Injector} deps.inj
   * @param {HTMLIFrameElement} deps.iframe
   * @param {(s: string) => void} [deps.log]
   */
  constructor({ axo, stage, bridge, inj, iframe, log = () => {} }) {
    this.axo = axo;
    this.stage = stage;
    this.bridge = bridge;
    this.inj = inj;
    this.iframe = iframe;
    this.log = log;
    this.cursor = new DemoCursor(stage);
    this.cursorPt = null;      // THE sample: sprite, Dot and injection share it
    this.side = 'L';
    this.active = false;
    this.aborted = false;
    this.freeze = false;       // true while a tap clip animates the arm
    this.recording = false;
    this.timelineActive = false;  // true only while a path/drag is sampling
    this.phase = 'idle';
    this.samples = [];         // TIMELINE ticks — the P1 acceptance metric
    this.allSamples = [];      // every tick, phase-labelled, for diagnosis
  }

  // ------------------------------------------------------------- API glue
  /**
   * One API call with a timeout.
   *
   * READS are retried — the iframe phone drops replies at random and a lost
   * `get` reply is free to ask again. WRITES ARE NOT. A `create` whose reply
   * was dropped still HAPPENED, and re-sending it makes a second component:
   * one `create component graph` came back as FOUR graphs before this was
   * fixed (measured 2026-08-25, and almost certainly the cause of the
   * "unexplained four graphs" recorded in the P0 table). Verify a write with
   * a follow-up read instead of retrying it — that is what get-verify-retry
   * always meant.
   */
  async api(action, resource, values, opts = {}) {
    const isRead = action === 'get' || action === 'notify';
    const { tries = isRead ? 4 : 1, timeoutMs = isRead ? 3000 : 6000 } = opts;
    for (let i = 0; i < tries; i++) {
      if (this.aborted) throw new DemoAbort();
      const res = await Promise.race([
        this.bridge.request(action, resource, values),
        sleep(timeoutMs).then(() => null),
      ]);
      if (res) return res;
      if (!isRead) {
        this.log(`api: ${action} ${resource} got no reply — NOT retried (writes `
          + 'are not idempotent); verify with a read instead');
        return null;
      }
      await sleep(150);
    }
    return null;
  }

  async waitFor(fn, { timeoutSec = 6, pollMs = 200, what = 'condition' } = {}) {
    const deadline = performance.now() + timeoutSec * 1000;
    for (;;) {
      if (this.aborted) throw new DemoAbort();
      let v = null;
      try { v = await fn(); } catch { v = null; }
      if (v) return v;
      if (performance.now() > deadline) throw new Error(`timeout (${timeoutSec}s): ${what}`);
      await sleep(pollMs);
    }
  }

  // ------------------------------------------------------- document state
  /**
   * The revert authority. Everything a demo can change and a diff can see:
   * which components exist, where they are, what is on their axes, and what
   * is selected. NOT notification counts (they drop — gotcha #5).
   */
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxAgeMs=0] reuse a recent snapshot instead of
   *   re-reading. A snapshot costs N+1 API round trips, and `waitFor` polls
   *   it in a loop — without this, a Drag demo spent most of its 60 s budget
   *   asking CODAP the same question (measured: it blew the wall-clock cap).
   */
  async snapshot({ maxAgeMs = 0 } = {}) {
    if (maxAgeMs > 0 && this._snap
        && performance.now() - this._snap.at < maxAgeMs) {
      return this._snap.value;
    }
    const list = await this.api('get', 'componentList');
    const contexts = await this.api('get', 'dataContextList');
    const out = {
      components: [],
      // `carrycsv` creates a whole dataset, which no component field would
      // show — the diff has to be able to see it to know it is still there.
      contexts: (contexts?.values ?? []).map((c) => c.name).sort(),
    };
    // Fetch the components CONCURRENTLY. A snapshot is taken after every step
    // and polled inside `waitFor`, so N+1 serial round trips over a phone that
    // sometimes takes seconds to answer was the single biggest cost in a demo
    // — enough to push the `Drag` demonstration past its 60 s cap.
    const items = list?.values ?? [];
    const props = await Promise.all(
      items.map((item) => this.api('get', `component[${item.id}]`)));
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const v = props[i]?.values ?? {};
      out.components.push({
        id: item.id, type: item.type, title: v.title,
        left: v.position?.left, top: v.position?.top,
        w: v.dimensions?.width, h: v.dimensions?.height,
        x: v.xAttributeName ?? null, y: v.yAttributeName ?? null,
        legend: v.legendAttributeName ?? null,
        xLo: v.xLowerBound ?? null, xHi: v.xUpperBound ?? null,
        // Hiding cases changes nothing the component list or the axes show, so
        // without this the diff is BLIND to it: a HideUnselected demo left 74
        // cases hidden in the student's document and reported residue 0.
        hidden: Array.isArray(v.hiddenCases) ? v.hiddenCases.length : 0,
        onlySelected: !!v.displayOnlySelectedCases,
      });
    }
    out.components.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    this._snap = { at: performance.now(), value: out };
    return out;
  }

  /** Stable identity for a diff entry, so "is this ours?" is answerable. */
  static diffKey(d) {
    return `${d.kind}:${d.id ?? d.name ?? ''}:${d.field ?? ''}`;
  }

  /** Entry-wise difference; length 0 means "back where we started". */
  diff(now, base) {
    const key = (c) => String(c.id);
    const baseById = new Map(base.components.map((c) => [key(c), c]));
    const nowById = new Map(now.components.map((c) => [key(c), c]));
    const out = [];
    for (const [id, c] of nowById) {
      const b = baseById.get(id);
      if (!b) { out.push({ kind: 'added', id, type: c.type }); continue; }
      for (const f of ['title', 'left', 'top', 'w', 'h', 'x', 'y', 'legend',
                       'xLo', 'xHi', 'hidden', 'onlySelected']) {
        if (JSON.stringify(c[f]) !== JSON.stringify(b[f])) {
          out.push({ kind: 'changed', id, field: f, from: b[f], to: c[f] });
        }
      }
    }
    for (const [id, b] of baseById) {
      if (!nowById.has(id)) out.push({ kind: 'removed', id, type: b.type });
    }
    for (const name of now.contexts ?? []) {
      if (!(base.contexts ?? []).includes(name)) {
        out.push({ kind: 'contextAdded', name });
      }
    }
    for (const name of base.contexts ?? []) {
      if (!(now.contexts ?? []).includes(name)) {
        out.push({ kind: 'contextRemoved', name });
      }
    }
    return out;
  }

  // --------------------------------------------------------- frame driving
  /**
   * Called once per animation frame by the host loop, AFTER `axo.update(dt)`
   * so the skeleton is current. See the class comment for why this is an
   * analytic placement rather than a chase.
   */
  tick() {
    if (!this.active || !this.cursorPt) return;
    const paw = this.axo.pawScreen(this.side);
    if (!paw) return;
    if (!this.freeze) {
      const body = this.axo.getPosition();
      const offX = paw.x - body.x;
      const offY = paw.y - body.y;
      this.axo.setPosition(this.cursorPt.x - offX, this.cursorPt.y - offY);
    }
    if (this.recording) {
      const p = this.axo.pawScreen(this.side);
      const rec = {
        t: +performance.now().toFixed(1), phase: this.phase,
        paw: { x: +p.x.toFixed(1), y: +p.y.toFixed(1) },
        cursor: { x: +this.cursorPt.x.toFixed(1), y: +this.cursorPt.y.toFixed(1) },
        dist: +Math.hypot(p.x - this.cursorPt.x, p.y - this.cursorPt.y).toFixed(2),
      };
      this.allSamples.push(rec);
      // The P1 acceptance is over TIMELINE ticks — the carry. During a tap the
      // paw deliberately leaves the print (that IS the tap), and during the
      // teaching beat nothing is moving at all; both are reported separately
      // rather than folded into the carry number.
      if (this.timelineActive) this.samples.push(rec);
    }
  }

  /** Max paw↔cursor distance — the P1 acceptance, plus everything else seen. */
  syncReport() {
    const stat = (arr) => {
      if (!arr.length) return { samples: 0, max: null, mean: null };
      let max = 0; let sum = 0;
      for (const s of arr) { max = Math.max(max, s.dist); sum += s.dist; }
      return { samples: arr.length, max: +max.toFixed(2),
               mean: +(sum / arr.length).toFixed(2) };
    };
    const byPhase = {};
    for (const s of this.allSamples) (byPhase[s.phase] ??= []).push(s);
    return {
      ...stat(this.samples),                       // timeline ticks only
      tapContactError: this.tapErrors ?? [],
      all: stat(this.allSamples),
      phases: Object.fromEntries(
        Object.entries(byPhase).map(([k, v]) => [k, stat(v)])),
    };
  }

  // ------------------------------------------------------------- lifecycle
  /**
   * Take the stage: hold the pointing pose, show the paw print where Dot's
   * paw already is, and snapshot the document.
   *
   * @param {{x,y}} firstTarget  what she is about to go to — used ONLY to
   *   pick the flank she approaches from, so she never covers it.
   */
  async begin(firstTarget, { side } = {}) {
    if (this.active) throw new Error('a demo is already running');
    this.active = true;
    this.aborted = false;
    this.freeze = false;
    this.timelineActive = false;
    this.phase = 'idle';
    this.samples = [];
    this.allSamples = [];
    this.tapErrors = [];
    this.stepTimings = [];
    this._refreshFrameRect();
    // ids/names this demo creates itself — the ONLY things revert is allowed
    // to delete outright when Undo will not reach them
    this.created = { contexts: [], components: [] };
    // Diff entries this demo is RESPONSIBLE for, keyed. Revert undoes these
    // and nothing else — see the redo-guard in revert().
    this.ownKeys = new Set();
    this._dataContext = null;
    this.base = await this.snapshot();
    this.baseSelection = await this.selectionCount().catch(() => 0);

    // Stand on the side with more room: left of a target in the right half of
    // the screen, right of one in the left half.
    this.side = side ?? (firstTarget.x > window.innerWidth / 2 ? 'L' : 'R');
    this.axo.stop(0.15);
    this.axo.facingOverride = true;
    this.axo.targetFacing = (this.side === 'L' ? 1 : -1) * Math.PI * 0.38;
    await this.axo.play(this.side === 'L' ? 'point_L' : 'point_R', { hold: true });
    await sleep(260);                       // let the reach settle before we read it

    // The print starts under the paw wherever Dot happens to be — the travel
    // to the first target is then a real carry, not a teleport.
    const paw = this.axo.pawScreen(this.side);
    this.cursorPt = { x: paw.x, y: paw.y };
    this.cursor.show(paw.x, paw.y);
    this.axo.lookAt(firstTarget.x, firstTarget.y);
    return this.base;
  }

  /** Give the stage back. Always runs, including on abort. */
  async end() {
    this.recording = false;
    this.cursor.hide();
    this.axo.facingOverride = false;
    this.axo.release(0.3);
    this.axo.clearGaze();
    this.axo.targetFacing = 0;
    this.axo.setBase('idle');
    this.active = false;
    this.cursorPt = null;
  }

  abort(reason = 'cancelled') {
    this.aborted = true;
    this.abortReason = reason;
  }

  _checkAbort() { if (this.aborted) throw new DemoAbort(this.abortReason); }

  /**
   * A wait that NOTICES a cancellation. A plain `sleep(9000)` inside a
   * teaching beat swallows the student's cancel for nine seconds — long
   * enough here for the wall-clock cap to fire first and report the wrong
   * cause. Dot has to retreat when the student touches something, not when
   * she happens to finish waiting.
   */
  async _sleep(ms) {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      this._checkAbort();
      await sleep(Math.min(100, until - performance.now()));
    }
    this._checkAbort();
  }

  // -------------------------------------------------------------- motions
  /** Travel the cursor (and therefore Dot) to a screen point along an arc. */
  async goTo(pt, { sec = 0.9, profile = 'teaching' } = {}) {
    this._checkAbort();
    const from = this.cursorPt ?? pt;
    if (Math.hypot(pt.x - from.x, pt.y - from.y) < 2) return;   // already there
    const path = arcPath(from, pt);
    this.axo.lookAt(pt.x, pt.y);
    this.timelineActive = true;
    this.phase = 'travel';
    try {
      await runPath(path, sec, (p) => {
        this.cursorPt = p;
        this.cursor.moveTo(p.x, p.y);
      }, { profile, isAborted: () => this.aborted });
    } finally {
      this.timelineActive = false;
      this.phase = 'idle';
    }
    this.cursorPt = { ...pt };
    this.cursor.moveTo(pt.x, pt.y);
  }

  /**
   * Tap: the paw comes down on the target and the injected click fires at the
   * clip's contact frame. The body is frozen for the clip's duration so the
   * flick reads as a push INTO the UI rather than the body backing away.
   */
  async tap(el, { at, clickOpts } = {}) {
    this._checkAbort();
    const r = el.getBoundingClientRect();
    const pt = at ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const target = this._toHost(pt);
    await this.goTo(target, { sec: 0.75 });
    await sleep(140);                       // the beat before she commits
    this._checkAbort();

    this.phase = 'tap';
    // The paw stays LOCKED to the print through the wind-up. `tap_L/R` swings
    // the arm from the pointing pose out to horizontal — a ~40px excursion —
    // so a frozen body puts the paw 20-42px off the button at the very moment
    // the click fires (measured, P1). Keeping the lock instead makes the body
    // settle into the press while the paw stays planted, and the flick's
    // ~13px shows up as a little forward push. Freeze only AFTER contact, so
    // the retract does not drag her backwards.
    const clip = this.axo.play(this.side === 'L' ? 'tap_L' : 'tap_R');
    const t0 = performance.now();
    // press feedback on the paw print, peaking at contact
    const press = () => {
      const dt = (performance.now() - t0) / 1000;
      const k = Math.max(0, 1 - Math.abs(dt - TAP_CONTACT_SEC) / 0.18);
      this.cursor.press(k);
      if (dt < TAP_CONTACT_SEC + 0.25) requestAnimationFrame(press);
      else this.cursor.press(0);
    };
    requestAnimationFrame(press);

    await sleep(TAP_CONTACT_SEC * 1000);
    this._checkAbort();
    // Where the paw actually is at the moment the click fires. The whole tap
    // clip swings the arm through a wide arc, so mid-clip the paw is far from
    // the print by design; what has to be true is that it is ON the target at
    // CONTACT. Recorded per tap, reported by syncReport().
    const pawNow = this.axo.pawScreen(this.side);
    (this.tapErrors ??= []).push(
      +Math.hypot(pawNow.x - this.cursorPt.x, pawNow.y - this.cursorPt.y).toFixed(2));
    await this.inj.click(el, clickOpts);
    this.log?.(`tap -> ${el.getAttribute?.('data-testid') ?? el.tagName}`);
    if (this.debugHoldAtContactMs) await sleep(this.debugHoldAtContactMs);
    this.freeze = true;                    // let the retract play without drag
    await clip;
    this.freeze = false;
    this.phase = 'idle';
    this.axo.play(this.side === 'L' ? 'point_L' : 'point_R', { hold: true });
    await sleep(240);              // let the reach settle before the next carry
  }

  /**
   * Drag: ONE timeline. `inject.dragPointer` fires the pointer events and
   * calls back with each sample; that same sample moves the paw print and
   * Dot. CODAP renders its own native drag preview underneath, so the student
   * sees Dot's paw, the paw print and the real UI feedback travelling
   * together.
   */
  /**
   * @param {Element} srcEl
   * @param {Element|{x,y}} dstElOrPoint  a resolver may hand us a POINT when
   *   the zone's centre is under another tile (see resolvers.clearPointIn)
   */
  /**
   * Wait until the page is actually drawing again, up to `maxMs`.
   *
   * A drag started while CODAP is still building a freshly created graph costs
   * five to ten times what the same drag costs a moment later (measured on one
   * page, same script: 39.5 s vs 8.0 s), because every injected pointermove
   * queues behind that work. Frames are the honest signal — the API answers
   * long before the page is responsive.
   */
  async _waitForIdle({ maxMs = 4000, frameMs = 60, need = 3 } = {}) {
    const deadline = performance.now() + maxMs;
    let good = 0;
    let last = performance.now();
    while (good < need && performance.now() < deadline) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      good = (now - last) <= frameMs ? good + 1 : 0;
      last = now;
    }
    return good >= need;
  }

  async dragAttribute(srcEl, dstElOrPoint, opts = {}) {
    this._checkAbort();
    await this._waitForIdle();
    const sr = srcEl.getBoundingClientRect();
    const start = this._toHost({ x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 });
    await this.goTo(start, { sec: 0.8 });
    await sleep(160);
    this._checkAbort();
    const dstPt = dstElOrPoint?.getBoundingClientRect
      ? (() => { const r = dstElOrPoint.getBoundingClientRect();
                 return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()
      : dstElOrPoint;
    const dst = this._toHost(dstPt);
    this.axo.lookAt(dst.x, dst.y);
    this.timelineActive = true;
    this.phase = 'drag';
    try {
      return await this.inj.dragAttribute(srcEl, dstElOrPoint, {
        // few injected moves, for the reason in inject.dragAttribute
        steps: 12, stepMs: 55, settleMs: 320,
        onStep: (pt) => {
          const h = this._toHost(pt);
          this.cursorPt = h;
          this.cursor.moveTo(h.x, h.y);
        },
        ...opts,
      });
    } finally {
      this.timelineActive = false;
      this.phase = 'idle';
    }
  }

  _center(el) {
    const r = el.getBoundingClientRect();
    return this._toHost({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  /**
   * CODAP client coords -> host page coords. The wrapper's iframe fills the
   * viewport at (0,0) today, but never assume it: read the frame's rect.
   */
  _toHost(pt) {
    // CACHED. This runs per injected pointermove, and
    // `iframe.getBoundingClientRect()` forces a synchronous layout flush of
    // the whole page — including everything CODAP has pending mid-drag. That
    // single call was the difference between a 3 s drag in isolation and a
    // 58 s drag inside a demo. The frame does not move during a demo; the
    // rect is refreshed when one begins.
    const fr = this._frameRect ?? this._refreshFrameRect();
    return { x: pt.x + fr.left, y: pt.y + fr.top };
  }

  _refreshFrameRect() {
    const r = this.iframe.getBoundingClientRect();
    this._frameRect = { left: r.left, top: r.top };
    return this._frameRect;
  }

  // --------------------------------------------------------------- revert
  /**
   * Undo everything THIS demo did, as visible paw taps on the toolbar Undo
   * button, and stop the moment the diff stops shrinking — that is what
   * protects a student change that landed on the undo stack mid-demo.
   */
  async revert({ embodied = true, cap = CAPS.undoClicks } = {}) {
    const doc = this.iframe.contentDocument;
    const undo = doc.querySelector('[data-testid="tool-shelf-button-undo"]');
    if (!undo) { this.log('revert: no Undo button found'); return { residue: null }; }

    let d = this.diff(await this.snapshot(), this.base);
    if (!d.length) return { clicks: 0, redone: false, residue: [], ownResidue: [] };

    if (embodied && !this.aborted) {
      await this.goTo(this._center(undo), { sec: 0.9 });
      await sleep(160);
    }

    // Ours vs theirs. The work order's rule — "stop when the diff stops
    // shrinking" — does not actually protect a student change that landed ON
    // TOP of ours: undoing THEIR graph shrinks the diff too, so the loop would
    // sail past it and destroy their work. The rule that does protect them is
    // to watch the FOREIGN part of the diff: if an Undo click made a change
    // that is not ours disappear, we just undid the student. Redo it at once
    // (P0 measured redo restores 6/6 primitives exactly) and stop, residue and
    // all. Recorded in docs/verification/phase9/P2-NOTES.md.
    const isOwn = (e) => this.ownKeys.has(DemoDriver.diffKey(e));
    const foreignCount = (list) => list.filter((e) => !isOwn(e)).length;

    const ownKeySig = (list) =>
      list.filter(isOwn).map(DemoDriver.diffKey).sort().join('|');

    let clicks = 0;
    let redone = false;
    let prevOwn = ownKeySig(d);
    let foreign = foreignCount(d);
    while (d.some(isOwn) && clicks < cap) {
      if (embodied && !this.aborted) {
        await this.tap(undo, { clickOpts: { full: false } });
      } else {
        await this.inj.click(undo, { full: false });
        await sleep(700);
      }
      clicks += 1;
      const next = this.diff(await this.snapshot(), this.base);
      if (foreignCount(next) < foreign) {
        const redo = doc.querySelector('[data-testid="tool-shelf-button-redo"]');
        if (redo) {
          await this.inj.click(redo, { full: false });
          await sleep(800);
          redone = true;
        }
        this.log('revert: that Undo hit the STUDENT\'s change — redone, stopping');
        d = this.diff(await this.snapshot(), this.base);
        break;
      }
      // Progress is measured on OUR entries, not on the diff's total length.
      // An undo also nudges things it did not cause — clearing an axis moves
      // the bounds — so a length-based stall check saw "no progress" after a
      // click that had plainly worked and stopped with the demo's own graph
      // still on screen. Stop only when nothing of ours moved at all.
      const nextOwn = ownKeySig(next);
      if (nextOwn === prevOwn) {
        this.log(`revert: that Undo changed nothing of ours — stopping (${next.length} left)`);
        d = next;
        break;
      }
      prevOwn = nextOwn;
      foreign = foreignCount(next);
      d = next;
    }

    // Targeted inverse ops for residue Undo could not reach — and ONLY for
    // changes this demo is responsible for. This is what happens after the
    // redo-guard stops the Undo loop: the student's change is on top of the
    // stack, so Dot cannot undo her own without destroying theirs, but she can
    // still put back the specific field she changed.
    // Our own restore can knock a NEIGHBOURING field loose — clearing x made
    // CODAP promote Mass to y — and that new drift is ours to clean up even
    // though no demo step created it. Fields on a component this revert has
    // already written to therefore count as ours for the remaining passes;
    // fields on components it has NOT touched still do not.
    const revertTouched = new Set();
    const ownNow = (e) => isOwn(e)
      || (e.kind === 'changed' && revertTouched.has(e.id));

    for (let pass = 0; pass < 3 && d.some(ownNow); pass++) {
      const beforeKeys = d.filter(ownNow).map(DemoDriver.diffKey).sort().join('|');
      const changedByComponent = new Map();
      for (const item of d) {
        if (!ownNow(item)) continue;
        if (item.kind === 'contextAdded' && this.created.contexts.includes(item.name)) {
          await this.api('delete', `dataContext[${item.name}]`);
        } else if (item.kind === 'added' && this.created.components.includes(item.id)) {
          await this.api('delete', `component[${item.id}]`);
        } else if (item.kind === 'changed') {
          if (!changedByComponent.has(item.id)) changedByComponent.set(item.id, []);
          changedByComponent.get(item.id).push(item);
        }
      }
      for (const [id, items] of changedByComponent) {
        revertTouched.add(id);
        await this._restoreComponent(id, items);
      }
      await sleep(600);
      d = this.diff(await this.snapshot(), this.base);
      const afterKeys = d.filter(ownNow).map(DemoDriver.diffKey).sort().join('|');
      if (afterKeys === beforeKeys) break;    // nothing moved: stop and report
    }
    // Selection is not on the undo stack at all (P0: 6 clicks, no change), so
    // it always needs its inverse.
    const sel = await this.selectionCount().catch(() => 0);
    if (sel > 0 && !this.baseSelection) {
      const dc = await this.dataContextName();
      if (dc) await this.api('create', `dataContext[${dc}].selectionList`, []);
    }

    if (d.length) this.log(`revert residue: ${JSON.stringify(d)}`);
    return { clicks, redone, residue: d, ownResidue: d.filter(isOwn) };
  }

  /**
   * Put one component field back to its demo-start value through the API.
   * Verified live: `update component[id] { xAttributeName: null }` clears an
   * axis, which is the case that actually comes up (a demo assigns an
   * attribute, a student acts on top of it, Undo is no longer safe to use).
   */
  async _restoreComponent(id, items) {
    const API_FIELD = {
      x: 'xAttributeName', y: 'yAttributeName', legend: 'legendAttributeName',
      title: 'title', xLo: 'xLowerBound', xHi: 'xUpperBound',
      onlySelected: 'displayOnlySelectedCases',
    };
    const base = this.base.components.find((c) => String(c.id) === String(id));
    const values = {};
    const fields = [];
    for (const item of items) {
      if (item.field === 'left' || item.field === 'top') {
        values.position = { left: base?.left, top: base?.top };
      } else if (item.field === 'w' || item.field === 'h') {
        values.dimensions = { width: base?.w, height: base?.h };
      } else if (item.field === 'hidden') {
        // Only an empty base is reconstructible — we record how MANY cases
        // were hidden, not which. Restoring to "nothing hidden" covers every
        // real demo; anything else is reported as residue rather than guessed.
        if (item.from) continue;
        values.hiddenCases = [];
      } else if (API_FIELD[item.field]) {
        values[API_FIELD[item.field]] = item.from ?? null;
      } else {
        continue;
      }
      fields.push(item.field);
    }
    if (!fields.length) return false;
    // ONE update per component, all fields at once: clearing x on its own made
    // CODAP promote the remaining attribute to y, so a field-at-a-time restore
    // chases its own tail (measured while building the cancel test).
    const r = await this.api('update', `component[${id}]`, values);
    this.log(`revert: targeted inverse ${fields.join('+')} on ${id} `
      + `(${r?.success ? 'ok' : 'FAILED'})`);
    return !!r?.success;
  }

  // ================================================================ P2: run
  /**
   * Resolver context. `components` is always needed; graph props and items
   * are only fetched for `point:` targets, which are the only ones that need
   * data values to place themselves.
   */
  async _targetCtx(spec) {
    const ctx = { doc: this.iframe.contentDocument };
    ctx.components = (await this.api('get', 'componentList'))?.values ?? [];
    if (String(spec).startsWith('point')) {
      const graphs = ctx.components.filter((c) => /graph/i.test(c.type));
      const gid = graphs[graphs.length - 1]?.id;
      ctx.graphProps = gid ? (await this.api('get', `component[${gid}]`))?.values : null;
      const dc = ctx.graphProps?.dataContext ?? 'Mammals';
      ctx.items = (await this.api('get', `dataContext[${dc}].itemSearch[*]`))?.values ?? [];
    }
    return ctx;
  }

  async _resolve(spec) {
    return resolveTarget(spec, await this._targetCtx(spec));
  }

  /** Move Dot to the other flank mid-demo (the `beside` hint on `goto`). */
  async _setSide(side) {
    if (side === this.side) return;
    this.side = side;
    this.axo.targetFacing = (side === 'L' ? 1 : -1) * Math.PI * 0.38;
    await this.axo.play(side === 'L' ? 'point_L' : 'point_R', { hold: true });
    await sleep(220);
  }

  /**
   * The document's data context. Never hard-code a name: tutorial 1 is
   * `mammals`, tutorial 2 is `nhanes`, the debug fixture is `Mammals`, and a
   * script should not have to care which document it is running in.
   */
  async dataContextName() {
    if (this._dataContext) return this._dataContext;
    const list = (await this.api('get', 'dataContextList'))?.values ?? [];
    this._dataContext = list[0]?.name ?? null;
    return this._dataContext;
  }

  async selectionCount(context) {
    const dc = context ?? await this.dataContextName();
    if (!dc) return 0;
    const r = await this.api('get', `dataContext[${dc}].selectionList`);
    return r?.success ? (r.values ?? []).length : 0;
  }

  /**
   * Execute one script. Accepts line notation, a JSON string, or an object;
   * VALIDATES FIRST so a malformed script is rejected with a typed error and
   * zero Dot movement, then runs it under the safety caps.
   */
  async runScript(input, { allowLeaveChanges = false, embodiedRevert = true } = {}) {
    // ---- validate before anything moves -------------------------------
    const script = coerce(input);                     // throws typed errors
    if (script.leaveChanges && !allowLeaveChanges) {
      throw new DemoValidationError(
        'leaveChanges requires the caller to pass allowLeaveChanges');
    }
    const steps = [...script.steps];
    if (!script.leaveChanges && !steps.some((s) => s.do === 'revert')) {
      steps.push({ do: 'revert' });                   // revert is not optional
    }
    if (steps.length > CAPS.steps) {
      throw new DemoValidationError(
        `${steps.length} steps exceeds the cap of ${CAPS.steps}`);
    }

    // ---- run ----------------------------------------------------------
    const firstTarget = steps.find((s) => s.target || s.from);
    const firstSpec = firstTarget?.target ?? firstTarget?.from;
    let anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (firstSpec) {
      try { anchor = this._center((await this._resolve(firstSpec)).el); }
      catch { /* side choice falls back to screen centre */ }
    }

    const watch = new CancelWatch((why) => this.abort(why));
    const startedAt = performance.now();
    let reverted = null;
    let error = null;
    await this.begin(anchor);
    this.recording = true;
    watch.watch(this.iframe.contentDocument);
    watch.watch(document);
    for (const f of this.iframe.contentDocument.querySelectorAll('iframe')) {
      try { watch.watch(f.contentDocument); } catch { /* cross-origin plugin */ }
    }

    try {
      for (const step of steps) {
        this._checkAbort();
        if (performance.now() - startedAt > CAPS.wallClockSec * 1000) {
          throw new Error(`demo exceeded ${CAPS.wallClockSec}s wall clock`);
        }
        const stepT0 = performance.now();
        await this._step(step);
        (this.stepTimings ??= []).push(
          { step: step.do, ms: Math.round(performance.now() - stepT0) });
        if (step.do === 'revert') { reverted = this._lastRevert; continue; }
        // Claim what changed as OURS (so revert knows what it may undo) and
        // enforce the mutation cap by LIVE STATE DIFF, never by counting
        // notifications — those drop (gotcha #5).
        //
        // Only after a step that CAN mutate the document, though. A snapshot
        // costs a round trip per component and `say`/`beat`/`goto`/`peer`
        // cannot change anything, so snapshotting after them spent wall clock
        // on a question whose answer could not have changed — enough to push
        // demos past the 60 s cap on a slow phone. A `waitFor` has just polled
        // one, so the 500 ms cache serves it.
        if (!MUTATING_VERBS.has(step.do)) continue;
        const d = this.diff(
          await this.snapshot({ maxAgeMs: step.do === 'waitFor' ? 500 : 0 }), this.base);
        for (const e of d) this.ownKeys.add(DemoDriver.diffKey(e));
        if (d.length > CAPS.mutations) {
          throw new Error(
            `demo made ${d.length} document changes, cap is ${CAPS.mutations}`);
        }
      }
      if (script.inverseSteps?.length) {
        for (const s of script.inverseSteps) await this._step(s);
      }
      return { ok: true, demo: script.demo, sync: this.syncReport(),
               revert: reverted, timings: this.stepTimings,
               sec: +((performance.now() - startedAt) / 1000).toFixed(1) };
    } catch (err) {
      error = err;
      // A cancelled or broken demo still cleans up after itself — an abandoned
      // demo must never strand mutations in a student's document.
      this.aborted = false;                  // let the revert's API calls run
      try {
        this._lastRevert = await this.revert({ embodied: false });
      } catch (e2) {
        this.log(`revert after failure ALSO failed: ${e2.message}`);
      }
      throw err;
    } finally {
      watch.stop();
      this.recording = false;
      if (error) { try { this.axo.play('startle'); } catch { /* noop */ } }
      await this.end();
    }
  }

  async _step(step) {
    this._checkAbort();
    switch (step.do) {
      case 'say':
        this.axo.emote(step.emote);
        await this._sleep(220);
        return;

      case 'pose':
        await this.axo.play(step.clip);
        return;

      case 'beat':
        await this._sleep(step.sec * 1000);
        return;

      case 'goTo': {
        const t = await this._resolve(step.target);
        if (step.beside === 'left') await this._setSide('L');
        else if (step.beside === 'right') await this._setSide('R');
        await this.goTo(t.at ? this._toHost(t.at) : this._center(t.el));
        return;
      }

      case 'peer': {
        const t = await this._resolve(step.target);
        const c = t.at ? this._toHost(t.at) : this._center(t.el);
        this.axo.lookAt(c.x, c.y);
        // A glance, not a scene: start the tilt and move on. Awaiting the whole
        // clip spent ~1.9 s of the demo's wall-clock budget on a look.
        this.axo.play('head_tilt');
        await this._sleep(600);
        return;
      }

      case 'tap':
      case 'openMenu':
      case 'choose': {
        const t = await this._resolve(step.target);
        await this.tap(t.el, {
          at: t.at,
          clickOpts: { full: t.clickShape === 'single' ? false
                        : t.clickShape === 'full' ? true : 'auto' },
        });
        return;
      }

      case 'drag': {
        const from = await this._resolve(step.from);
        const to = await this._resolve(step.to);
        return this._dragByKind(from, to, step.profile);
      }

      case 'marquee': {
        const t = await this._resolve(step.target);
        // a resolver may hand back a NAMED SUB-REGION (plotQuad) rather than
        // the whole element — "a subset of the points", not all of them
        const r = t.rect ?? t.el.getBoundingClientRect();
        const a = this._toHost({ x: r.left + 6, y: r.top + 6 });
        const b = this._toHost({ x: r.right - 6, y: r.bottom - 6 });
        await this.goTo(a, { sec: 0.7 });
        this.timelineActive = true;
        this.phase = 'drag';
        try {
          await this.inj.marquee({ x: r.left + 6, y: r.top + 6 },
                                 { x: r.right - 6, y: r.bottom - 6 }, {
            steps: 10, stepMs: 55,
            onStep: (pt) => {
              const h = this._toHost(pt);
              this.cursorPt = h;
              this.cursor.moveTo(h.x, h.y);
            },
          });
        } finally { this.timelineActive = false; this.phase = 'idle'; }
        this.cursorPt = b;
        return;
      }

      case 'type': {
        const t = await this._resolve(step.target);
        await this.tap(t.el, { clickOpts: { full: true } });
        const input = await this.inj.waitFor(
          () => this.iframe.contentDocument
            .querySelector('[data-testid="component-title-bar"] input')
            ?? t.el.querySelector?.('input'),
          { timeoutSec: 3, what: 'a text field' });
        await this.inj.typeText(input, step.text, { cps: 8, tap: false });
        await this.inj.pressKey('Enter', input);
        await sleep(400);
        return;
      }

      case 'carryCsv':
        return this._carryCsv(step.to);

      case 'waitFor': {
        const deadline = performance.now() + step.timeoutSec * 1000;
        const needsSelection = /^selection/.test(step.cond);
        for (;;) {
          this._checkAbort();
          const now = await this.snapshot({ maxAgeMs: 400 });
          const extra = needsSelection
            ? { selectionCount: await this.selectionCount() } : {};
          if (evalCondition(step.cond, this.base, now, extra)) return;
          if (performance.now() > deadline) {
            throw new Error(`waitFor "${step.cond}" timed out after ${step.timeoutSec}s`);
          }
          await this._sleep(500);
        }
      }

      case 'clearSelection': {
        const dc = await this.dataContextName();
        if (dc) await this.api('create', `dataContext[${dc}].selectionList`, []);
        await sleep(300);
        return;
      }

      case 'revert':
        this._lastRevert = await this.revert();
        return;

      default:
        throw new DemoValidationError(`no interpreter for verb "${step.do}"`);
    }
  }

  /** Route a drag to the stack that owns the target (see the P0 table). */
  async _dragByKind(from, to, profile) {
    const kind = from.dragKind ?? 'attribute';
    if (kind === 'tile') {
      const start = this._center(from.el);
      const end = to.at ? this._toHost(to.at) : this._center(to.el);
      await this.goTo(start, { sec: 0.8 });
      await sleep(140);
      const r = from.el.getBoundingClientRect();
      const at = { x: r.left + 16, y: r.top + r.height / 2 };
      this.cursorPt = this._toHost(at);
      this.cursor.moveTo(this.cursorPt.x, this.cursorPt.y);
      this.timelineActive = true;
      this.phase = 'drag';
      try {
        await this.inj.dragTile(from.el,
          { x: at.x + (end.x - start.x), y: at.y + (end.y - start.y) }, {
          startAt: at, steps: 12, stepMs: 55,
          onStep: (pt) => {
            const h = this._toHost(pt);
            this.cursorPt = h;
            this.cursor.moveTo(h.x, h.y);
          },
        });
      } finally { this.timelineActive = false; this.phase = 'idle'; }
      return;
    }
    if (kind === 'axis') {
      const r = from.el.getBoundingClientRect();
      await this.goTo(this._center(from.el), { sec: 0.8 });
      const end = to.at ? to.at : (() => {
        const tr = to.el.getBoundingClientRect();
        return { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };
      })();
      this.timelineActive = true;
      this.phase = 'drag';
      try {
        await this.inj.dragAxis(from.el, end.x - (r.left + r.width / 2), 0, {
          onStep: (pt) => {
            const h = this._toHost(pt);
            this.cursorPt = h;
            this.cursor.moveTo(h.x, h.y);
          },
        });
      } finally { this.timelineActive = false; this.phase = 'idle'; }
      return;
    }
    // attribute (dnd-kit) — the tutorial centrepiece. `to.at` is the resolver's
    // reachable point, which is NOT the zone's centre when a tile overlaps it.
    return this.dragAttribute(from.dragEl ?? from.el, to.at ?? to.el,
      profile === 'brisk' ? { steps: 8, stepMs: 40 } : {});
  }

  /**
   * `carrycsv` — the P8 mechanism, fallback-first BY DESIGN (scope review).
   * Dot carries a CSV ghost to the drop point and the bridge API commits the
   * import at touch-down; no synthetic `DataTransfer` file-drop is attempted
   * unless Chad rejects a recording of this (a bail-out item, not a decision
   * for this phase).
   */
  /**
   * Open a case table on `contextName` and make sure it actually BOUND.
   *
   * Creating a case table too soon after `dataContextFromURL` returns
   * `success: true` and yields an EMPTY, unbound table — no columns, no
   * attribute pills, and `component[id]` has no `dataContext` field at all.
   * `update component[id] { dataContext }` does not repair it (also
   * `success: true`, also no effect). The only cure measured is to wait for
   * the context's attributes to be readable and then create the table, so
   * that is what this does — and it VERIFIES by looking for the pills, since
   * "success" plainly does not mean bound.
   */
  async _ensureBoundTable(contextName) {
    const doc = this.iframe.contentDocument;
    const pillCount = () =>
      doc.querySelectorAll('[data-testid^="codap-attribute-button"]').length;
    // 1. wait until the context really has attributes
    await this.waitFor(async () => {
      const dc = await this.api('get', `dataContext[${contextName}]`);
      return dc?.values?.collections?.[0]?.attrs?.length ? dc.values : null;
    }, { timeoutSec: 8, what: `${contextName} attributes` });
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = new Set(((await this.api('get', 'componentList'))?.values ?? [])
        .map((c) => String(c.id)));
      const made = await this.api('create', 'component', {
        type: 'caseTable', dataContext: contextName,
        position: { left: 6, top: 6 }, dimensions: { width: 620, height: 220 },
      });
      for (let waited = 0; waited < 2600 && pillCount() === 0; waited += 200) {
        await sleep(200);
      }
      // The reply is often dropped, and an id we never learned is an id revert
      // cannot clean up — so find the table by diffing rather than trusting it.
      let id = made?.success ? made.values.id : null;
      if (id == null) {
        const found = ((await this.api('get', 'componentList'))?.values ?? [])
          .find((c) => /caseTable/i.test(c.type) && !before.has(String(c.id)));
        id = found?.id ?? null;
      }
      if (id != null) this.created.components.push(id);
      if (pillCount() > 0) return id;
      this.log(`case table came up unbound (attempt ${attempt + 1}) — retrying`);
      if (id != null) await this.api('delete', `component[${id}]`);
      await sleep(1200);
    }
    throw new Error(`could not open a bound case table on ${contextName}`);
  }

  async _carryCsv(toSpec) {
    const payload = this.csvPayload;
    if (!payload) throw new Error('carrycsv: no csvPayload configured');
    const to = await this._resolve(toSpec);
    const dst = to.at ? this._toHost(to.at) : this._center(to.el);
    this.cursor.ghost = true;
    try {
      await this.goTo(dst, { sec: 1.4, profile: 'teaching' });
      await sleep(250);
      const before = new Set(((await this.api('get', 'dataContextList'))?.values ?? [])
        .map((c) => c.name));

      let made;
      if (payload.url) {
        // The faithful version: import the tutorial's OWN csv, the same way a
        // real drop does. Short reply window on purpose — the result is
        // verified by reading dataContextList either way, so waiting the full
        // write timeout for a reply buys nothing but wall clock.
        made = await this.api('create', 'dataContextFromURL',
          { URL: payload.url, title: payload.title }, { timeoutMs: 2500 });
      } else {
        made = await this.api('create', 'dataContext', payload.context);
        if (made?.success) {
          await this.api('create', `dataContext[${payload.context.name}].item`, payload.items);
          const table = await this.api('create', 'component', {
            type: 'caseTable', dataContext: payload.context.name,
            position: { left: 40, top: 320 }, dimensions: { width: 460, height: 200 },
          });
          if (table?.success) this.created.components.push(table.values.id);
        }
      }
      // A null reply is NOT a failure — writes are never retried (they are not
      // idempotent), so the only honest way to find out whether an import
      // landed is to look. Measured: `create dataContextFromURL` regularly
      // exceeds the 6 s reply window while succeeding anyway.
      if (!made?.success) {
        const landed = await this.waitFor(async () => {
          const names = ((await this.api('get', 'dataContextList'))?.values ?? [])
            .map((c) => c.name);
          return names.some((n) => !before.has(n)) ? names : null;
        }, { timeoutSec: 10, what: 'the imported data context to appear' })
          .catch(() => null);
        if (!landed) {
          throw new Error(`carrycsv: import failed ${JSON.stringify(made?.values ?? null)}`);
        }
        this.log('carrycsv: no reply, but the import landed — continuing');
      }
      // Identify what actually appeared rather than trusting a name we chose:
      // dataContextFromURL names the context from the file.
      await sleep(900);
      const fresh = [];
      for (const c of ((await this.api('get', 'dataContextList'))?.values ?? [])) {
        if (!before.has(c.name)) { this.created.contexts.push(c.name); fresh.push(c.name); }
      }
      // A real file drop opens a case table. `dataContextFromURL` on v3.1.0
      // does NOT (measured — same blind spot as the missing notification, see
      // docs/verification/phase9/BAILOUTS.md), so the demonstration has to open
      // one itself or it does not look like the thing the student will do.
      const comps = (await this.api('get', 'componentList'))?.values ?? [];
      if (fresh.length && !comps.some((c) => /caseTable/i.test(c.type))) {
        await this._ensureBoundTable(fresh[0]);
      }
      return made;
    } finally {
      this.cursor.ghost = false;
    }
  }
}
