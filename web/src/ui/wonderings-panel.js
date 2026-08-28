/**
 * wonderings-panel.js — the one surface a Wondering is allowed to appear on.
 *
 * WHY THIS IS ITS OWN SURFACE. Dot speaks in `Axolotl.emote()`; a wondering is
 * not Dot speaking. Plan `-001` §R2 (2026-08-28) puts wonderings in a quiet
 * standing panel in the upper-right of the CODAP workspace so that a question
 * the student never asked for cannot be mistaken for the character addressing
 * them, and so that ignoring it costs nothing. It is `pointer-events: none` by
 * decision 7: an ambient prompt that can eat a click has stopped being ambient.
 *
 * WHY IT IS BROWSER CODE IN A WAVE OF PURE MODULES. Every other W1/W2 module is
 * node-testable by construction. This one owns geometry and paint, so it cannot
 * be *entirely*. That distinction was drawn too widely on 2026-08-28 and cost
 * the build a defect (see the `retire()` note below): "needs a browser" is true
 * of colour, layout and computed style, and false of DOM SHAPE, ARIA, timers and
 * teardown. So verification is now in two halves, and neither replaces the other:
 *   - `docs/verification/wonderings/t-panel.mjs` — a node test over a hand-written
 *     DOM shim (no jsdom; the goal forbids new dependencies) with a virtual
 *     clock. It asserts the declared z-index and `pointer-events`, the live
 *     region never holding more than one item, `destroy()` releasing its element,
 *     its resize listener and its timers, and `contentDocument` being re-read at
 *     every measurement rather than remembered.
 *   - `docs/verification/wonderings/panel-notes.md` — the recorded manual
 *     protocol, which carries the measured anchor, the four states' DOM, the
 *     contrast arithmetic, and the things only a browser can decide: COMPUTED
 *     z-index against `#codap` and `#stage`, real hit-testing, and that the
 *     sinking departure looks like weather.
 *
 * WHY IT DOES NOT COPY `ui/dot-badge.js` WHOLESALE. It follows that file's
 * shape — `ensureStyle`, a selector cascade over CODAP's own DOM, cross-iframe
 * reads wrapped in `try/catch`, position measured rather than guessed — but
 * fixes three defects found in it on 2026-08-28:
 *   1. `installDashboardBadge()` returns no `destroy()`, so nothing it installs
 *      can ever be taken back down. This returns one.
 *   2. It adds a `resize` listener it never removes, which outlives the badge
 *      and holds the whole closure alive. This removes its own.
 *   3. It stops re-measuring after 120 s (`setTimeout(… clearInterval …,
 *      120000)`). A class period is 45 minutes; CODAP's tool shelf can change
 *      height at any point in it (a wide-viewport reflow, a browser zoom), so a
 *      panel that stopped measuring at two minutes spends the other 43 in the
 *      wrong place. This re-measures until `destroy()`.
 *
 * WHY THE CONTRAST NUMBERS ARE IN A COMMENT AND NOT A VIBE. "Ambient" is not a
 * licence to be unreadable. The panel therefore has an OPAQUE backplate — with a
 * translucent one no contrast ratio can be computed at all, because the colour
 * underneath is whatever CODAP happens to have drawn. Measured against
 * `--wp-backplate` `#EEF3F6`: body text `#1F2A33` is **13.07:1**, the standing
 * label `#4A5866` is **6.53:1**; both clear WCAG AA's 4.5:1 with room. Ambience
 * is carried by italics, letter-spacing, the absence of chrome and slow motion —
 * never by lowering contrast. See `panel-notes.md` for the arithmetic.
 *
 * WHY THERE IS AN EXIT LAYER. A departing wondering is moved out of the live
 * region and out of normal flow the instant its replacement arrives, into
 * `.wp-exit`. Before 2026-08-28 it simply stayed where it was for the whole
 * 1600 ms sink, which meant a screen reader held TWO questions in one
 * `aria-live` region and the arriving question was pushed down the page by the
 * departing one's block box. The sink itself is unchanged — the fix is about
 * flow and the accessibility tree, not about speed.
 *
 * WHY THE MOTION IS SLOW. A 400 ms opacity crossfade is the documented recipe
 * for change blindness: peripheral vision is poor at low-contrast opacity steps
 * and good at motion. So the *dwell* is slow, not the fade — a wondering rises
 * into place over 1.2 s and sinks away over 1.6 s. It reads as weather rather
 * than as a notification, which is also the aquatic register the character
 * doctrine asks for.
 */

// ---------------------------------------------------------------- constants

/**
 * Stacking order in the HOST document. `#codap` (the iframe) has no `z-index`
 * at all and stacks by document order; `#stage` (Dot's canvas) is 50. 40 is
 * therefore strictly above every CODAP component and strictly below Dot, which
 * is the required sandwich: the panel floats over the workspace, Dot floats
 * over the panel. The upper-right also holds `.dot-badge` (120) and the
 * Dashboard (100, `top:68px right:8px`); both are developer affordances and
 * both are expected to cover this panel while open.
 */
const Z_INDEX = 40;                 // unitless stacking order; must stay 0 < z < 50

const EDGE_GAP_PX = 12;             // px inset from the frame's right edge — clear of CODAP's component shadows
const SHELF_GAP_PX = 10;            // px of air between the tool shelf's bottom and the panel's top
const CONTROL_PAD_PX = 6;           // px added when we could only find a control INSIDE the shelf, not the shelf
const FALLBACK_TOP_PX = 60;         // px below the frame top when nothing can be measured; CODAP v3's shelf measured ~50 px tall (2026-08-28)
const MIN_TOP_PX = 8;               // px floor, so a bad measurement can never park the panel off-screen upward
const BOTTOM_SAFETY_PX = 96;        // px of viewport that must remain below the panel's top, else clamp

const MIN_SHELF_HEIGHT_PX = 12;     // px; a match shorter than this is not a toolbar
const MIN_SHELF_WIDTH_PX = 80;      // px; the shelf CONTAINER spans most of the window
const MIN_CONTROL_WIDTH_PX = 8;     // px; a single shelf BUTTON is small — same floor dot-badge.js uses for Help
const MAX_SHELF_TOP_PX = 160;       // px from the frame's top; below this the match is a component, not chrome

/**
 * Re-measure for the whole session. dot-badge.js polls at the same cadence but
 * gives up at 120 000 ms; a class period is ~45 min, so this interval is
 * cleared only by `destroy()`. 2 s costs one `getBoundingClientRect` per tick
 * and writes styles only when the computed position actually changed.
 */
const REPOSITION_MS = 2000;         // ms between re-measurements; runs until destroy()

const RISE_MS = 1200;               // ms entrance: slow enough to be caught in peripheral vision
const RISE_DISTANCE_PX = 14;        // px the wondering travels UP as it arrives
const SINK_MS = 1600;               // ms departure: longer than the entrance, so leaving is never startling
const SINK_DISTANCE_PX = 18;        // px the wondering travels DOWN as it goes
const REDUCED_MOTION_MS = 600;      // ms fade used when the OS asks for reduced motion — still not a 400 ms blink

const PANEL_MAX_WIDTH_PX = 320;     // px; matches Dot's Dashboard so the corner has one measure
const PANEL_MIN_WIDTH_PX = 190;     // px; below this the standing label wraps
const LABEL_FONT_PX = 14;           // px; the goal's legibility floor is 14
const BODY_FONT_PX = 15;            // px; the wondering itself is the thing to be read, so it is the larger of the two

/** The four states. `thinking` is deliberately a synonym of `idle` in paint. */
const STATES = ['hidden', 'idle', 'thinking', 'showing'];

const STYLE_ID = 'wonderings-panel-style';

/**
 * CODAP v3's tool shelf, most specific first. The container `[data-testid=
 * "tool-shelf"]` is the one `web/src/inject.js:403` already relies on, so it is
 * load-bearing elsewhere in this codebase and not a guess.
 */
const SHELF_SELECTORS = [
  '[data-testid="tool-shelf"]',
  '[data-testid^="tool-shelf"]:not([data-testid*="button"])',
  '.tool-shelf',
];

/**
 * Last resort: a control known to live IN the shelf. dot-badge.js measures the
 * Help control this way; undo/redo are the same row. We add CONTROL_PAD_PX
 * because a button's bottom sits above the shelf's own bottom padding.
 */
const SHELF_CONTROL_SELECTORS = [
  '[data-testid="tool-shelf-button-undo"]',
  '[data-testid="tool-shelf-button-redo"]',
  '[data-testid*="help" i]',
  '[title*="help" i]',
  '[aria-label*="help" i]',
];

const CSS = `
/* One opaque backplate. NOT translucent: a see-through panel makes the
   contrast ratio a function of whatever CODAP drew underneath, i.e. unknown,
   i.e. unverifiable. Ambience comes from the italic, the spacing and the
   motion — never from transparency. */
.wonderings-panel {
  position: fixed;
  z-index: ${Z_INDEX};
  pointer-events: none;
  box-sizing: border-box;
  max-width: ${PANEL_MAX_WIDTH_PX}px;
  min-width: ${PANEL_MIN_WIDTH_PX}px;
  padding: 9px 14px 11px;
  border-radius: 10px;
  background: #EEF3F6;
  /* A hairline shadow, not a border: the panel must separate from a white
     graph without reading as another CODAP component with a title bar. */
  box-shadow: 0 1px 12px rgba(15, 30, 45, .10);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wonderings-panel[hidden] { display: none; }
/* Belt and braces: nothing inside may become a click target either. */
.wonderings-panel * { pointer-events: none; }

/* The standing label. Persists in idle, thinking and showing — it is what
   makes an arriving question legible as "a wondering" rather than as an alert.
   #4A5866 on #EEF3F6 = 6.53:1. */
.wonderings-panel .wp-label {
  margin: 0;
  font-size: ${LABEL_FONT_PX}px;
  font-weight: 600;
  letter-spacing: .06em;
  line-height: 1.3;
  color: #4A5866;
}

/* The stack: one positioned box holding the live region and the exit layer on
   top of each other, so a departing wondering can be lifted OUT OF FLOW without
   moving. 'flow-root' keeps .wp-item's 7px top margin inside the stack, which is
   what makes the in-flow item and the absolutely-positioned exit item land on
   the same baseline — the departure must not jump when it starts. */
.wonderings-panel .wp-stack {
  position: relative;
  display: flow-root;
}

/* The live region. Empty in idle and thinking; one child in showing. NEVER two:
   a retiring wondering is moved to .wp-exit at the moment its replacement is
   appended here, so a screen reader is never handed two questions at once. */
.wonderings-panel .wp-live { display: block; }

/* The exit layer. Out of normal flow (so the arriving wondering is not pushed
   down the page for the 1600 ms of the sink) and outside the live region (so the
   departing one is no longer in the accessibility tree at all). Contained by
   .wp-stack, which is 'position: relative'. */
.wonderings-panel .wp-exit {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

/* The wondering. #1F2A33 on #EEF3F6 = 13.07:1. Weight 400, 15px — the goal's
   floors are 400 and 14px, and this clears both. */
.wonderings-panel .wp-item {
  margin: 7px 0 0;
  font-size: ${BODY_FONT_PX}px;
  font-weight: 400;
  font-style: italic;
  line-height: 1.5;
  color: #1F2A33;
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity ${RISE_MS}ms cubic-bezier(.22, .61, .36, 1),
    transform ${RISE_MS}ms cubic-bezier(.22, .61, .36, 1);
}
/* Arriving: starts below and transparent, then rises. */
.wonderings-panel .wp-item.is-entering {
  opacity: 0;
  transform: translateY(${RISE_DISTANCE_PX}px);
}
/* Leaving: sinks away, slower than it arrived. */
.wonderings-panel .wp-item.is-leaving {
  opacity: 0;
  transform: translateY(${SINK_DISTANCE_PX}px);
  transition-duration: ${SINK_MS}ms;
}

@media (prefers-reduced-motion: reduce) {
  /* Drop the travel, keep the slowness. A 400 ms crossfade is the change-blind
     case we are avoiding, so the reduced-motion path is still ${REDUCED_MOTION_MS} ms. */
  .wonderings-panel .wp-item,
  .wonderings-panel .wp-item.is-entering,
  .wonderings-panel .wp-item.is-leaving {
    transform: none;
    transition-duration: ${REDUCED_MOTION_MS}ms;
  }
}
`;

/**
 * How many live panels a given document is hosting. `destroy()` removes the
 * shared <style> only when the last one goes, so two panels in one document
 * cannot un-style each other.
 * @type {WeakMap<Document, number>}
 */
const STYLE_USERS = new WeakMap();

function ensureStyle(doc) {
  STYLE_USERS.set(doc, (STYLE_USERS.get(doc) ?? 0) + 1);
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(el);
}

function releaseStyle(doc) {
  const n = (STYLE_USERS.get(doc) ?? 1) - 1;
  if (n > 0) { STYLE_USERS.set(doc, n); return; }
  STYLE_USERS.delete(doc);
  doc.getElementById(STYLE_ID)?.remove();
}

/**
 * FNV-1a over the normalised text. Gives each wondering a STABLE key, so
 * `show()` called twice with the same text does not tear down and re-announce
 * an item the student is already reading. Not a hash for security; collisions
 * would merely mean two different wonderings share a node, and at one item on
 * screen at a time that is unreachable.
 */
function keyOf(text) {
  const s = String(text).trim().replace(/\s+/g, ' ');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Read CODAP's document FRESH, every time, inside try/catch.
 *
 * NEVER CACHE `contentDocument`. On 2026-08-27 a cached one cost this project
 * weeks: `about:blank` is same-origin, so a reference taken before CODAP
 * finished loading stayed same-origin and stayed dead for the life of the page
 * (`docs/DRAG-GHOST-CONUNDRUM.md` §0). The same trap applies to any element we
 * measure, so we re-query rather than remembering the shelf node.
 */
function liveDoc(frame) {
  let d = null;
  try { d = frame?.contentDocument ?? null; } catch { return null; }  // cross-origin
  if (!d) return null;
  try {
    const href = d.location?.href ?? '';
    if (href === 'about:blank' || href === '') return null;
    return d.body ? d : null;
  } catch { return null; }
}

/** Topmost plausible match for one selector cascade, or null. */
function topmostMatch(d, selectors, minWidth) {
  for (const sel of selectors) {
    let els = [];
    try { els = [...d.querySelectorAll(sel)]; } catch { continue; }  // bad selector in an old engine
    const plausible = els
      .map((e) => { try { return e.getBoundingClientRect(); } catch { return null; } })
      .filter((r) => r
        && r.height >= MIN_SHELF_HEIGHT_PX
        && r.width >= minWidth
        && r.top < MAX_SHELF_TOP_PX
        && r.bottom > 0)
      .sort((a, b) => a.top - b.top);
    if (plausible[0]) return plausible[0];
  }
  return null;
}

/**
 * The tool shelf's bottom edge in CODAP-document coordinates, or null when it
 * cannot be measured (cross-origin, not yet rendered, markup changed).
 * MEASURED, never hardcoded — a fixed offset drifts the moment CODAP's toolbar
 * changes, which is exactly the failure dot-badge.js avoids for Help.
 */
function measureShelfBottom(frame) {
  const d = liveDoc(frame);
  if (!d) return null;
  const shelf = topmostMatch(d, SHELF_SELECTORS, MIN_SHELF_WIDTH_PX);
  if (shelf) return shelf.bottom;
  const control = topmostMatch(d, SHELF_CONTROL_SELECTORS, MIN_CONTROL_WIDTH_PX);
  if (control) return control.bottom + CONTROL_PAD_PX;
  return null;
}

// ------------------------------------------------------------------ factory

/**
 * Create the Wonderings panel and attach it to `doc.body`.
 *
 * Nothing is injected into CODAP's DOM — the panel lives in the HOST document
 * and is positioned over the iframe, which is why it can be `z-index: 40` in
 * the first place and why removing it cannot disturb CODAP's own state.
 *
 * @param {object}       opts
 * @param {Document}     [opts.doc=document]  host document to mount into
 * @param {HTMLIFrameElement|null} [opts.frame=null]  the CODAP iframe, measured
 *   for the tool shelf. Omit it and the panel falls back to FALLBACK_TOP_PX.
 * @param {string}       [opts.label='Wonderings']  the standing label
 * @param {'hidden'|'idle'|'thinking'|'showing'} [opts.state='hidden']
 * @returns {{
 *   el: HTMLElement,
 *   show: (text: string) => HTMLElement|null,
 *   clear: () => void,
 *   setState: (state: string) => void,
 *   getState: () => string,
 *   reposition: () => void,
 *   destroy: () => void,
 * }}
 */
export function createWonderingsPanel({ doc = document, frame = null,
                                        label = 'Wonderings',
                                        state = 'hidden' } = {}) {
  if (!doc?.body) throw new Error('createWonderingsPanel: doc has no body');
  ensureStyle(doc);

  const root = doc.createElement('div');
  root.className = 'wonderings-panel';

  // The standing label sits OUTSIDE the live region on purpose: inside it, the
  // word "Wonderings" would be re-announced with every arriving question.
  const labelEl = doc.createElement('div');
  labelEl.className = 'wp-label';
  labelEl.textContent = label;

  // aria-relevant="additions" is what keeps the SINKING DEPARTURE silent: a
  // removal is not announced, so a wondering that ages out does not interrupt
  // the student a second time on its way out. aria-atomic="false" means only
  // the new child is read, not the label plus the child.
  const live = doc.createElement('div');
  live.className = 'wp-live';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'false');
  live.setAttribute('aria-relevant', 'additions');

  // The exit layer is a SIBLING of the live region, not a child of it. A
  // wondering on its way out is moved here, which is simultaneously the two
  // things it needs to be: out of the live region (so the arriving question is
  // the only thing announced) and out of normal flow (so it does not push the
  // arriving question down the page while it sinks).
  const exit = doc.createElement('div');
  exit.className = 'wp-exit';
  exit.setAttribute('aria-hidden', 'true');

  const stack = doc.createElement('div');
  stack.className = 'wp-stack';
  stack.append(live, exit);

  root.append(labelEl, stack);
  doc.body.appendChild(root);

  const view = doc.defaultView;
  const timers = new Set();
  let destroyed = false;
  let current = null;                 // the settled wondering element, if any
  let lastTop = null;
  let lastRight = null;
  let currentState = null;

  const later = (fn, ms) => {
    const id = (view ?? globalThis).setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const nextFrame = (fn) => {
    if (view?.requestAnimationFrame) { view.requestAnimationFrame(() => view.requestAnimationFrame(fn)); }
    else later(fn, 32);
  };

  // ------------------------------------------------------------ positioning

  /**
   * Park the panel below CODAP's tool shelf, inset from the frame's right edge.
   * Writes styles only when the numbers actually changed, so a 2 s poll running
   * for a whole class period costs a read and a comparison, not a reflow.
   */
  function reposition() {
    if (destroyed) return;
    let fr = null;
    try { fr = frame?.getBoundingClientRect?.() ?? null; } catch { fr = null; }
    const viewW = view?.innerWidth ?? 0;
    const viewH = view?.innerHeight ?? 0;
    const frameTop = fr ? fr.top : 0;
    const frameRight = fr ? fr.right : viewW;

    const shelfBottom = measureShelfBottom(frame);
    let top = frameTop + (shelfBottom === null ? FALLBACK_TOP_PX : shelfBottom + SHELF_GAP_PX);
    top = Math.max(MIN_TOP_PX, top);
    if (viewH > BOTTOM_SAFETY_PX) top = Math.min(top, viewH - BOTTOM_SAFETY_PX);
    const right = Math.max(EDGE_GAP_PX, viewW - frameRight + EDGE_GAP_PX);

    const t = Math.round(top);
    const r = Math.round(right);
    if (t !== lastTop) { root.style.top = `${t}px`; lastTop = t; }
    if (r !== lastRight) { root.style.right = `${r}px`; lastRight = r; }
  }

  reposition();
  // DEFECT 3 FIXED: no `setTimeout(clearInterval, 120000)`. CODAP's shelf can
  // reflow at any point in a 45-minute period, so this runs until destroy().
  const repositionTimer = (view ?? globalThis).setInterval(reposition, REPOSITION_MS);
  // DEFECT 2 FIXED: kept in a named binding so removeEventListener can undo it.
  const onResize = () => reposition();
  view?.addEventListener('resize', onResize);

  // ---------------------------------------------------------------- content

  /**
   * Sink an item away and remove it.
   *
   * THE MOVE TO `.wp-exit` IS THE POINT, and it happens NOW, not after SINK_MS.
   * Verified 2026-08-28: leaving the retiring node in `.wp-live` put two
   * questions in one `aria-live` region for the whole 1600 ms sink, and — because
   * `.wp-item` is a block `<p>` and `is-leaving` only changes opacity and
   * transform — kept its box in normal flow, pushing the ARRIVING wondering 30-odd
   * px down the page and then letting it snap back. Moving the node here fixes
   * both at once: `.wp-exit` is outside the live region and outside normal flow.
   * `aria-hidden` stays as a second line of defence for a reader that re-scans
   * the subtree mid-exit; `aria-relevant="additions"` means the move itself (a
   * removal, as far as the live region is concerned) is silent.
   *
   * The sink is untouched — `is-leaving` still runs for SINK_MS with the same
   * travel. Plan `-001` chose a slow dwell and a sinking departure over a fast
   * crossfade deliberately, because a 400 ms opacity fade is change-blind.
   */
  function retire(el) {
    if (!el || el.dataset.retiring === '1') return;
    el.dataset.retiring = '1';
    el.setAttribute('aria-hidden', 'true');
    // Hold the backplate at its old height for the duration of the sink, so
    // taking the item out of flow does not snap the panel shorter under a
    // wondering that is still visibly on screen. Guarded: `offsetHeight` is a
    // layout read and is absent in a headless shim.
    const h = Number(el.offsetHeight);
    if (Number.isFinite(h) && h > 0) stack.style.minHeight = `${h}px`;
    exit.appendChild(el);                   // out of the live region, out of flow
    el.classList.remove('is-entering');
    el.classList.add('is-leaving');
    later(() => {
      el.remove();
      if (!exit.children.length) stack.style.minHeight = '';
    }, SINK_MS);
  }

  /**
   * Show one wondering. Returns the element, or null when nothing was shown.
   *
   * Two deliberate no-ops:
   *  - **while `hidden`**: `hidden` means the student has wonderings switched
   *    off (no `?wonderings=1`, or the Dashboard toggle is off). A wondering
   *    that finishes computing just after they switched off must not appear.
   *    Callers that want it visible call `setState('idle')` first.
   *  - **same text as the item already showing**: the key is stable, so a
   *    repeat is not re-announced and the student's reading is not interrupted.
   */
  function show(text) {
    if (destroyed) return null;
    const str = String(text ?? '').trim();
    if (!str) return null;
    if (currentState === 'hidden') return null;

    const key = keyOf(str);
    if (current && current.dataset.key === key && current.dataset.retiring !== '1') {
      setState('showing');
      return current;
    }

    retire(current);

    const item = doc.createElement('p');
    item.className = 'wp-item is-entering';
    item.dataset.key = key;
    item.textContent = str;                 // textContent, never innerHTML
    live.appendChild(item);
    current = item;
    // Two frames, so the browser has laid the element out in its entering
    // position before the transition to the settled one begins. One frame is
    // enough in most engines and not in all of them.
    nextFrame(() => { if (!destroyed) item.classList.remove('is-entering'); });

    setState('showing');
    return item;
  }

  /** Retire whatever is showing and fall back to the label-only look. */
  function clear() {
    if (destroyed) return;
    retire(current);
    current = null;
    if (currentState === 'showing') setState('idle');
  }

  /**
   * `hidden` | `idle` | `thinking` | `showing`.
   *
   * `thinking` IS `idle` to look at. A spinner in a quiet panel is an alert,
   * and an alert is precisely what a wondering must not be; the state exists so
   * the engine can reason about itself and so the Dashboard can report it, not
   * so the student can watch us work. The only difference on the page is the
   * `data-state` attribute, which no rule in CSS above targets — that is the
   * invariant `panel-notes.md` asks the manual protocol to check.
   */
  function setState(next) {
    if (destroyed) return;
    if (!STATES.includes(next)) throw new Error(`wonderings-panel: unknown state ${next}`);
    if (next === currentState) return;
    currentState = next;
    root.dataset.state = next;
    root.hidden = next === 'hidden';
    if (next === 'hidden') {
      // Leaving the DOM behind a `hidden` attribute takes the live region out
      // of the accessibility tree; an item left inside would be announced when
      // the panel came back. Remove it outright rather than sinking it, since
      // nothing is on screen to animate.
      if (current) { current.remove(); current = null; }
      live.replaceChildren();
      // Anything mid-sink goes too: it is not on screen to animate, and a node
      // left in the exit layer would reappear the moment the panel came back.
      exit.replaceChildren();
      stack.style.minHeight = '';
    } else {
      reposition();
    }
  }

  setState(STATES.includes(state) ? state : 'hidden');

  // ---------------------------------------------------------------- teardown

  /**
   * DEFECT 1 FIXED: dot-badge.js returns no way to take itself down. This
   * releases every resource it took — the poll, the resize listener, every
   * pending animation timeout, the element, and the shared <style> once the
   * last panel in this document is gone. Idempotent.
   */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    (view ?? globalThis).clearInterval(repositionTimer);
    view?.removeEventListener('resize', onResize);
    for (const id of timers) (view ?? globalThis).clearTimeout(id);
    timers.clear();
    current = null;
    root.remove();
    releaseStyle(doc);
  }

  return {
    el: root,
    show,
    clear,
    setState,
    getState: () => currentState,
    reposition,
    destroy,
  };
}
