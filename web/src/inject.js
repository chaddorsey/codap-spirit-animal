/**
 * inject.js — synthetic input injection into a SAME-ORIGIN CODAP iframe.
 *
 * Phase 9 P0 (docs/PHASE9-SHOWME.md). Implements the protocols verified in
 * docs/SPIKE-SAME-ORIGIN.md EXACTLY — every deviation below was measured,
 * not guessed:
 *
 *  - Toolbar/menu activation is ONE `MouseEvent('click')`. A full
 *    pointerdown/mousedown/pointerup/mouseup/click sequence DOUBLE-TOGGLES
 *    Chakra menus (open then instantly closed).
 *  - Drags are PointerEvents only, `pointerId` constant for the whole drag,
 *    `buttons: 1` on every move, `isPrimary: true`; dnd-kit needs a few px of
 *    travel before it activates.
 *  - `pointerup` MUST be dispatched on the iframe's `window`. Dispatching it
 *    on `document` leaves dnd-kit's drag stuck.
 *  - Every event we dispatch carries `__dotDemo === true` so the demo
 *    driver's cancellation listeners can tell Dot's own input apart from a
 *    student's real mouse (our events are also `isTrusted:false`, but the tag
 *    survives re-dispatch and is explicit).
 *
 * Everything here takes RESOLVED targets — an element, a rect, or a point in
 * iframe-document coordinates. Nothing in this file knows about CODAP
 * semantics; that is the resolver table's job (P2).
 */

export const DEMO_TAG = '__dotDemo';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Element | rect | point -> {x, y} in the injected window's client coords. */
export function toPoint(target) {
  if (!target) throw new TypeError('inject: null target');
  if (typeof target.x === 'number' && typeof target.y === 'number'
      && typeof target.width !== 'number') {
    return { x: target.x, y: target.y };
  }
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  const left = r.left ?? r.x ?? 0;
  const top = r.top ?? r.y ?? 0;
  const w = r.width ?? 0;
  const h = r.height ?? 0;
  return { x: left + w / 2, y: top + h / 2 };
}

/** Element | rect -> DOMRect-ish {left, top, width, height, right, bottom}. */
export function toRect(target) {
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  const left = r.left ?? r.x ?? 0;
  const top = r.top ?? r.y ?? 0;
  const width = r.width ?? 0;
  const height = r.height ?? 0;
  return { left, top, width, height, right: left + width, bottom: top + height,
           x: left, y: top };
}

/** Quadratic bow perpendicular to the straight line — Dot never travels flat. */
function curvePoint(from, to, t, bow) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
    y: u * u * from.y + 2 * u * t * cy + t * t * to.y,
  };
}

/** Ease-in-out so injected drags read as a hand, not a linear tween. */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class InjectAbort extends Error {
  constructor(reason = 'aborted') { super(reason); this.name = 'InjectAbort'; }
}

export class Injector {
  /**
   * @param {Window} win  the SAME-ORIGIN iframe window to inject into
   * @param {object} [opts]
   * @param {() => boolean} [opts.isAborted]  polled between every event
   * @param {(rec) => void}  [opts.onEvent]   every dispatched event (debug log)
   */
  constructor(win, opts = {}) {
    if (!win || !win.document) throw new TypeError('inject: need a same-origin window');
    this.win = win;
    this.doc = win.document;
    this.isAborted = opts.isAborted ?? (() => false);
    this.onEvent = opts.onEvent ?? null;
    // One pointerId for the process lifetime: dnd-kit and PixiJS both track
    // drags by id, and a changing id mid-drag drops the stream.
    this.pointerId = 20260825;
    this.events = [];        // dispatch log (bounded)
  }

  _checkAbort() { if (this.isAborted()) throw new InjectAbort(); }

  /** Elements under a client point, innermost first (for hit-test debugging). */
  elementAt(pt) { return this.doc.elementFromPoint(pt.x, pt.y); }

  _record(type, pt, targetDesc) {
    const rec = { type, x: Math.round(pt?.x ?? -1), y: Math.round(pt?.y ?? -1),
                  target: targetDesc, t: performance.now() };
    this.events.push(rec);
    if (this.events.length > 500) this.events.shift();
    this.onEvent?.(rec);
  }

  _desc(el) {
    if (!el || !el.tagName) return String(el);
    const tid = el.getAttribute?.('data-testid');
    return `${el.tagName.toLowerCase()}${tid ? `[${tid}]` : (el.className ? `.${String(el.className).split(' ')[0]}` : '')}`;
  }

  _dispatch(node, ev, pt) {
    ev[DEMO_TAG] = true;
    this._record(ev.type, pt, this._desc(node === this.win ? null : node) ?? 'window');
    return node.dispatchEvent(ev);
  }

  _mouseEvent(type, pt, extra = {}) {
    const M = this.win.MouseEvent;
    return new M(type, {
      bubbles: true, cancelable: true, composed: true, view: this.win,
      clientX: pt.x, clientY: pt.y, screenX: pt.x, screenY: pt.y,
      button: 0, buttons: 1, detail: 1, ...extra,
    });
  }

  _pointerEvent(type, pt, extra = {}) {
    const P = this.win.PointerEvent ?? this.win.MouseEvent;
    return new P(type, {
      bubbles: true, cancelable: true, composed: true, view: this.win,
      clientX: pt.x, clientY: pt.y, screenX: pt.x, screenY: pt.y,
      pointerId: this.pointerId, pointerType: 'mouse', isPrimary: true,
      button: 0, buttons: 1, pressure: 0.5, width: 1, height: 1, ...extra,
    });
  }

  /**
   * Resolve on the frame's next RENDERED frame, or after `maxMs`.
   *
   * This is how an injected drag stays in step with CODAP. `setTimeout` does
   * not: while CODAP blocks the main thread the timers just queue, then fire
   * in a burst, so the whole drag is dispatched before CODAP has drawn
   * anything. Reported live — the "Age" drag preview sits frozen at the pill
   * while Dot is already at the graph, and the ghost only appears once CODAP
   * catches up. A requestAnimationFrame cannot fire while the thread is
   * blocked, so awaiting one paces us to CODAP's real throughput.
   */
  _frame({ maxMs = 2500 } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (how) => { if (!settled) { settled = true; resolve(how); } };
      const t = setTimeout(() => done('timeout'), maxMs);
      this.win.requestAnimationFrame(() => { clearTimeout(t); done('frame'); });
    });
  }

  /**
   * Re-send our own position after the STUDENT's mouse has moved mid-drag.
   *
   * Blocking their events cannot win: CODAP registered its listeners when the
   * page loaded, and our shield registers at drag start, so at the same node
   * and phase CODAP is always ahead of us in the queue. Traced live —
   * 235 trusted moves reached `frameWindow` capture before the shield could
   * stop them. So instead of trying to be first, be LAST: after their move
   * lands, immediately restate where Dot's paw is. The drag snaps back.
   */
  reassert(pt) {
    if (!pt) return;
    this._dispatch(this.doc, this._pointerEvent('pointermove', pt), pt);
    this._dispatch(this.doc, this._mouseEvent('mousemove', pt), pt);
  }

  // ---------------------------------------------------------------- P1/P2
  /**
   * CODAP v3.1.0 needs TWO different click shapes, measured in P0:
   *
   *  - tool-shelf buttons and open menu items: ONE `MouseEvent('click')`.
   *    The full pointer sequence DOUBLE-TOGGLES a Chakra menu (open, then
   *    instantly closed) — the spike's original finding, still true.
   *  - everything inside a component — title bars, case-table attribute
   *    pills, inspector buttons: the FULL pointer+mouse sequence. A lone
   *    `click` leaves `aria-expanded="false"` and never focuses the tile
   *    (measured: pill menu 0/1 opens on click, 1/1 on the full sequence).
   *
   * `full: 'auto'` (the default) applies that rule; pass `true`/`false` to
   * override when a resolver knows better.
   */
  needsFullSequence(el) {
    if (!el?.closest) return true;
    if (el.closest('[data-testid="tool-shelf"]')) return false;
    if (el.getAttribute?.('role') === 'menuitem' || el.closest('[role="menu"]')) return false;
    return true;
  }

  async click(target, { at, full = 'auto', hover = true } = {}) {
    this._checkAbort();
    const pt = at ?? toPoint(target);
    const el = target?.dispatchEvent ? target : this.elementAt(pt);
    if (!el) throw new Error(`inject.click: nothing at ${Math.round(pt.x)},${Math.round(pt.y)}`);
    const useFull = full === 'auto' ? this.needsFullSequence(el) : !!full;
    if (hover) {
      this._dispatch(el, this._pointerEvent('pointerover', pt, { buttons: 0, pressure: 0 }), pt);
      this._dispatch(el, this._mouseEvent('mouseover', pt, { buttons: 0 }), pt);
      this._dispatch(el, this._pointerEvent('pointermove', pt, { buttons: 0, pressure: 0 }), pt);
      this._dispatch(el, this._mouseEvent('mousemove', pt, { buttons: 0 }), pt);
    }
    if (useFull) {
      this._dispatch(el, this._pointerEvent('pointerdown', pt), pt);
      this._dispatch(el, this._mouseEvent('mousedown', pt), pt);
      this._dispatch(el, this._pointerEvent('pointerup', pt, { buttons: 0, pressure: 0 }), pt);
      this._dispatch(el, this._mouseEvent('mouseup', pt, { buttons: 0 }), pt);
    }
    this._dispatch(el, this._mouseEvent('click', pt, { buttons: 0 }), pt);
    return el;
  }

  /**
   * Open a menu. Shape is decided by `needsFullSequence`: tool-shelf menus
   * take one click, a case-table attribute pill takes the full sequence.
   */
  async menuOpen(target, opts = {}) { return this.click(target, opts); }

  /** Pick an item in an OPEN menu — one click, and never matched by text. */
  async menuChoose(target, opts = {}) { return this.click(target, { ...opts, full: false }); }

  /**
   * Chakra popper open-state. The menu LIST stays mounted; when closed it is
   * EMPTY (tool-shelf menus) and/or its popper wrapper is `visibility: hidden`.
   * Both are checked, and the visibility walk goes all the way to <html> —
   * a 4-level walk missed the wrapper on axis menus (measured P0).
   */
  isMenuOpen(listEl) {
    if (!listEl?.isConnected) return false;
    if (!listEl.querySelector('[role="menuitem"]')) return false;
    for (let n = listEl; n && n !== this.doc.documentElement; n = n.parentElement) {
      const s = this.win.getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none') return false;
    }
    return listEl.getBoundingClientRect().height > 0;
  }

  /** Items of an open menu, in DOM order. NEVER matched by text (gotcha #2). */
  menuItems(listEl) { return [...(listEl?.querySelectorAll('[role="menuitem"]') ?? [])]; }

  // ------------------------------------------------------------------ P3/P4
  /**
   * Drag from -> to.
   *
   * CODAP v3.1.0 uses FOUR different drag stacks and each one listens
   * somewhere else. All four were characterized in P0 by dispatching every
   * combination and reading the effect back through the API; the named
   * wrappers below (`dragAttribute`, `dragTile`, `dragAxis`, `marquee`,
   * `pointDrag`) each pin the combination that works. Do not "simplify" them
   * into one call — they are genuinely different:
   *
   *   dnd-kit  (attribute pills -> drop zones): PointerEvents, down on the
   *            `[aria-roledescription=draggable]` wrapper, moves on document,
   *            up on DOCUMENT. Up on `window` leaves the drop uncommitted
   *            even though the zone shows `over`.
   *   React    (tile title-bar move): PointerEvents dispatched on the SOURCE
   *            ELEMENT for down, every move, and up. React's delegated root
   *            never sees the handler unless the element is in the path.
   *   d3-drag  (axis pan / dilate via `rect.dragRect.*`): MOUSE events only.
   *            Pointer events do nothing at all.
   *   PixiJS   (plot canvas: point click, marquee, point drag): PointerEvents
   *            on the canvas, moves on document.
   *
   * @param {Element|rect|point} from
   * @param {Element|rect|point} to
   * @param {object} [opts]
   * @param {number} [opts.steps=14]     pointermove count (spike used ~14)
   * @param {number} [opts.stepMs=40]    ms between moves
   * @param {number} [opts.bow=0]        perpendicular curve, px
   * @param {number} [opts.holdMs=90]    pause after pointerdown before moving
   * @param {number} [opts.settleMs=140] pause at the destination before up
   * @param {(pt, i, n) => void} [opts.onStep]  ONE timeline: the driver moves
   *        Dot and the paw-print sprite from this same sample (P1).
   * @param {'document'|'window'|'source'} [opts.moveTarget='document']
   * @param {'document'|'window'|'source'} [opts.upOn='document']
   * @param {'pointer'|'mouse'|'both'} [opts.events='both']
   * @returns {Promise<{from, to, samples}>}
   */
  async dragPointer(from, to, opts = {}) {
    const {
      steps = 14, stepMs = 40, bow = 0, holdMs = 90, settleMs = 140,
      onStep = null, upOn = 'document', moveTarget = 'document',
      events = 'both', useHandle = true, startAt = null,
      paceByFrame = true,
    } = opts;
    const wantPointer = events !== 'mouse';
    const wantMouse = events !== 'pointer';
    this._checkAbort();
    // `startAt` lets a caller press on an element but at a specific point —
    // e.g. the empty left end of a title bar rather than its title button.
    const a = startAt ?? toPoint(from);
    const b = toPoint(to);
    const raw = from?.dispatchEvent ? from : this.elementAt(toPoint(from));
    // Canvas drags (marquee, point drag) must NOT climb to a draggable
    // ancestor — the graph tile itself is draggable and would move instead.
    const startEl = useHandle ? dragHandleFor(raw) : raw;
    if (!startEl) throw new Error(`inject.drag: nothing at ${Math.round(a.x)},${Math.round(a.y)}`);

    const nodeFor = (which) =>
      which === 'source' ? startEl : (which === 'window' ? this.win : this.doc);

    const samples = [];
    // hover first: some sensors want the pointer "over" the handle
    if (wantPointer) {
      this._dispatch(startEl, this._pointerEvent('pointerover', a, { buttons: 0, pressure: 0 }), a);
      this._dispatch(startEl, this._pointerEvent('pointermove', a, { buttons: 0, pressure: 0 }), a);
      this._dispatch(startEl, this._pointerEvent('pointerdown', a), a);
    }
    if (wantMouse) this._dispatch(startEl, this._mouseEvent('mousedown', a), a);
    onStep?.(a, 0, steps);
    samples.push({ ...a, phase: 'down' });
    await sleep(holdMs);

    const moveNode = nodeFor(moveTarget);
    for (let i = 1; i <= steps; i++) {
      this._checkAbort();
      const t = easeInOut(i / steps);
      const pt = bow ? curvePoint(a, b, t, bow)
                     : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      // buttons:1 on every move — dnd-kit drops moves without a held button
      if (wantPointer) this._dispatch(moveNode, this._pointerEvent('pointermove', pt), pt);
      if (wantMouse) this._dispatch(moveNode, this._mouseEvent('mousemove', pt), pt);
      onStep?.(pt, i, steps);
      samples.push({ ...pt, phase: 'move' });
      // Wait for a real frame as well as the nominal gap, so the next move is
      // only sent once CODAP has had the chance to draw this one. Keeps the
      // drag preview under the paw instead of frozen at the pill.
      if (paceByFrame) await Promise.all([sleep(stepMs), this._frame()]);
      else await sleep(stepMs);
    }

    await sleep(settleMs);
    if (paceByFrame) await this._frame();     // draw the last position before release
    this._checkAbort();
    // P0 CORRECTION to the spike: for dnd-kit the release must be dispatched
    // on the iframe's **document**. `window` leaves the drop un-committed
    // (the zone shows `over`, the attribute never lands) — measured
    // 2026-08-25, both targets run back to back, 2× each.
    const upNode = nodeFor(upOn);
    if (wantPointer) {
      this._dispatch(upNode, this._pointerEvent('pointerup', b, { buttons: 0, pressure: 0 }), b);
    }
    if (wantMouse) this._dispatch(upNode, this._mouseEvent('mouseup', b, { buttons: 0 }), b);
    samples.push({ ...b, phase: 'up' });
    return { from: a, to: b, samples };
  }

  // --- named recipes: one per drag stack, each pinned by P0 measurement ---

  /**
   * dnd-kit: case-table attribute pill (or axis label) -> a drop zone.
   *
   * FEW MOVES. CODAP re-runs its collision detection over every droppable on
   * each `pointermove`, and the cost is badly super-linear — measured on one
   * page, same drag, all three landing correctly:
   *
   *     26 moves -> 40.7 s        14 moves -> 18.7 s        8 moves -> 3.2 s
   *
   * That, not the API and not our renderer, is what was pushing demos past
   * their 60 s cap. dnd-kit needs only a few px of travel to activate and a
   * final position to drop on; smoothness belongs to the paw and the paw
   * print, which ride the same timeline and are redrawn per frame.
   */
  async dragAttribute(from, to, opts = {}) {
    return this.dragPointer(from, to, {
      steps: 8, stepMs: 60, useHandle: true,
      moveTarget: 'document', upOn: 'document', ...opts,
    });
  }

  /** React handlers: move a component by its title bar. */
  async dragTile(titleBarEl, to, opts = {}) {
    return this.dragPointer(titleBarEl, to, {
      steps: 14, stepMs: 30, useHandle: false, events: 'pointer',
      moveTarget: 'source', upOn: 'source', ...opts,
    });
  }

  /**
   * d3-drag: axis pan / rescale. `dragRectEl` is one of
   * `rect.dragRect.h-translate` (pan), `.h-lower-dilate`, `.h-upper-dilate`
   * (and the `v-` twins on the left axis). MOUSE events only — pointer
   * events have no effect whatsoever on these (measured P0).
   */
  async dragAxis(dragRectEl, dx, dy = 0, opts = {}) {
    const a = toPoint(dragRectEl);
    return this.dragPointer(dragRectEl, { x: a.x + dx, y: a.y + dy }, {
      steps: 12, stepMs: 30, useHandle: false, events: 'mouse',
      moveTarget: 'window', upOn: 'window', ...opts,
    });
  }

  // -------------------------------------------------------------------- P6
  /** Marquee-select: a drag on empty plot canvas, corner to corner. */
  async marquee(fromPt, toPt, opts = {}) {
    return this.dragPointer(fromPt, toPt,
      { steps: 10, stepMs: 35, useHandle: false, ...opts });
  }

  // -------------------------------------------------------------------- P10
  /** Point drag on a PixiJS canvas: same protocol, canvas-relative points. */
  async pointDrag(fromPt, toPt, opts = {}) {
    return this.dragPointer(fromPt, toPt, { steps: 8, stepMs: 25, holdMs: 60,
                                            settleMs: 80, useHandle: false, ...opts });
  }

  // --------------------------------------------------------------------- P7
  /**
   * Type text into a focusable element at ~`cps` chars/sec.
   * React-controlled inputs ignore a plain `el.value = …`; the native setter
   * plus an `input` event is the standard escape hatch.
   */
  async typeText(target, text, { cps = 6, clear = true, tap = true } = {}) {
    this._checkAbort();
    const el = target?.dispatchEvent ? target : this.elementAt(toPoint(target));
    if (!el) throw new Error('inject.typeText: no element');
    if (tap) await this.click(el);
    el.focus?.();
    const isField = 'value' in el;
    const proto = el instanceof this.win.HTMLTextAreaElement
      ? this.win.HTMLTextAreaElement.prototype : this.win.HTMLInputElement.prototype;
    const setValue = isField
      ? Object.getOwnPropertyDescriptor(proto, 'value')?.set?.bind(el)
      : null;
    if (clear && isField) {
      setValue ? setValue('') : (el.value = '');
      this._dispatch(el, new this.win.Event('input', { bubbles: true }), null);
    }
    const delay = Math.max(20, 1000 / cps);
    for (const ch of text) {
      this._checkAbort();
      const K = this.win.KeyboardEvent;
      const init = { bubbles: true, cancelable: true, composed: true, view: this.win,
                     key: ch, code: `Key${ch.toUpperCase()}`, charCode: ch.charCodeAt(0),
                     keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0) };
      this._dispatch(el, new K('keydown', init), null);
      this._dispatch(el, new K('keypress', init), null);
      if (isField) {
        setValue ? setValue(el.value + ch) : (el.value += ch);
        this._dispatch(el, new this.win.InputEvent('input',
          { bubbles: true, composed: true, data: ch, inputType: 'insertText' }), null);
      } else if (el.isContentEditable) {
        el.textContent += ch;
        this._dispatch(el, new this.win.InputEvent('input',
          { bubbles: true, composed: true, data: ch, inputType: 'insertText' }), null);
      }
      this._dispatch(el, new K('keyup', init), null);
      await sleep(delay);
    }
    return el;
  }

  /** Press a bare key (Enter/Escape/Tab) at the current focus. */
  async pressKey(key, target = null) {
    this._checkAbort();
    const el = target ?? this.doc.activeElement ?? this.doc.body;
    const K = this.win.KeyboardEvent;
    const init = { bubbles: true, cancelable: true, composed: true, view: this.win,
                   key, code: key };
    this._dispatch(el, new K('keydown', init), null);
    this._dispatch(el, new K('keyup', init), null);
    return el;
  }

  // ------------------------------------------------------------------ utils
  /** Poll `fn` until truthy. Returns its value, or throws on timeout. */
  async waitFor(fn, { timeoutSec = 5, pollMs = 100, what = 'condition' } = {}) {
    const deadline = performance.now() + timeoutSec * 1000;
    for (;;) {
      this._checkAbort();
      let v;
      try { v = await fn(); } catch { v = null; }
      if (v) return v;
      if (performance.now() > deadline) {
        throw new Error(`inject.waitFor timeout (${timeoutSec}s): ${what}`);
      }
      await sleep(pollMs);
    }
  }

  /** Query the injected document (never the host's). */
  $(sel) { return this.doc.querySelector(sel); }
  $$(sel) { return [...this.doc.querySelectorAll(sel)]; }
}

/**
 * dnd-kit listens on the element it marked draggable, not on whatever visual
 * child sits on top of it. In CODAP a case-table attribute pill is a Chakra
 * MENU BUTTON nested inside the draggable
 * `div[data-testid=codap-column-header-content][aria-roledescription=draggable]`
 * — pressing the button opens the menu instead of starting a drag (measured
 * P0: dragging from the button never activated; from the wrapper it did).
 */
export function dragHandleFor(el) {
  if (!el?.closest) return el;
  return el.closest('[aria-roledescription="draggable"]') ?? el;
}

/** True when `iframe`'s document is reachable (same-origin feature detect). */
export function sameOrigin(iframe) {
  try { return !!iframe?.contentDocument?.body; } catch { return false; }
}

export { sleep };
