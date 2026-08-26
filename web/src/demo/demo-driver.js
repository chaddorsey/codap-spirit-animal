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
  /** One API call with a timeout, retried — the phone drops replies. */
  async api(action, resource, values, { tries = 4, timeoutMs = 3000 } = {}) {
    for (let i = 0; i < tries; i++) {
      if (this.aborted) throw new DemoAbort();
      const res = await Promise.race([
        this.bridge.request(action, resource, values),
        sleep(timeoutMs).then(() => null),
      ]);
      if (res) return res;
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
  async snapshot() {
    const list = await this.api('get', 'componentList');
    const out = { components: [], selection: null };
    for (const item of list?.values ?? []) {
      const c = await this.api('get', `component[${item.id}]`);
      const v = c?.values ?? {};
      out.components.push({
        id: item.id, type: item.type, title: v.title,
        left: v.position?.left, top: v.position?.top,
        w: v.dimensions?.width, h: v.dimensions?.height,
        x: v.xAttributeName ?? null, y: v.yAttributeName ?? null,
        legend: v.legendAttributeName ?? null,
        xLo: v.xLowerBound ?? null, xHi: v.xUpperBound ?? null,
      });
    }
    out.components.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return out;
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
      for (const f of ['title', 'left', 'top', 'w', 'h', 'x', 'y', 'legend', 'xLo', 'xHi']) {
        if (JSON.stringify(c[f]) !== JSON.stringify(b[f])) {
          out.push({ kind: 'changed', id, field: f, from: b[f], to: c[f] });
        }
      }
    }
    for (const [id, b] of baseById) {
      if (!nowById.has(id)) out.push({ kind: 'removed', id, type: b.type });
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
    this.base = await this.snapshot();

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
  async dragAttribute(srcEl, dstEl, opts = {}) {
    this._checkAbort();
    const sr = srcEl.getBoundingClientRect();
    const start = this._toHost({ x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 });
    await this.goTo(start, { sec: 0.8 });
    await sleep(160);
    this._checkAbort();
    const dst = this._center(dstEl);
    this.axo.lookAt(dst.x, dst.y);
    this.timelineActive = true;
    this.phase = 'drag';
    try {
      return await this.inj.dragAttribute(srcEl, dstEl, {
        steps: 26, stepMs: 34, settleMs: 320,
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
    const fr = this.iframe.getBoundingClientRect();
    return { x: pt.x + fr.left, y: pt.y + fr.top };
  }

  // --------------------------------------------------------------- revert
  /**
   * Undo everything THIS demo did, as visible paw taps on the toolbar Undo
   * button, and stop the moment the diff stops shrinking — that is what
   * protects a student change that landed on the undo stack mid-demo.
   */
  async revert({ embodied = true, cap = 8 } = {}) {
    const doc = this.iframe.contentDocument;
    const undo = doc.querySelector('[data-testid="tool-shelf-button-undo"]');
    if (!undo) { this.log('revert: no Undo button found'); return { residue: null }; }

    let d = this.diff(await this.snapshot(), this.base);
    if (!d.length) return { clicks: 0, residue: [] };

    if (embodied && !this.aborted) {
      await this.goTo(this._center(undo), { sec: 0.9 });
      await sleep(160);
    }

    let clicks = 0;
    let prev = d.length;
    while (d.length && clicks < cap) {
      if (embodied && !this.aborted) {
        await this.tap(undo, { clickOpts: { full: false } });
      } else {
        await this.inj.click(undo, { full: false });
        await sleep(700);
      }
      clicks += 1;
      d = this.diff(await this.snapshot(), this.base);
      if (d.length >= prev) {
        // Undo is now reverting something that is NOT ours. STOP.
        this.log(`revert: diff stopped shrinking at ${d.length} — stopping`);
        break;
      }
      prev = d.length;
    }
    if (d.length) this.log(`revert residue: ${JSON.stringify(d)}`);
    return { clicks, residue: d };
  }
}
