/**
 * t-panel.mjs — the asserting test for `web/src/ui/wonderings-panel.js` (W2, module K).
 *
 *   node docs/verification/wonderings/t-panel.mjs
 *
 * WHY THIS FILE EXISTS. Plan `-002` gave module K a *manual browser protocol*
 * (`panel-notes.md` §6) as its only verification, on the reasoning that the panel
 * owns geometry and paint and therefore cannot be node-tested. That reasoning is
 * half right and it cost the build: the 2026-08-28 adversarial verification found
 * the panel holding TWO items in one `aria-live` region for `SINK_MS` (1600 ms)
 * on an A -> B change, with the retiring one still in normal flow — a defect that
 * needs no pixels to see, only a DOM. Everything in this file is a property that
 * a hand-written object graph can decide. What genuinely needs a browser is listed
 * as a human step in `panel-notes.md` §6 and is NOT faked here.
 *
 * NO NEW DEPENDENCY. The goal's boundaries forbid adding an npm package or a test
 * runner, so jsdom is out. The shim below is ~180 lines of plain objects
 * implementing exactly the surface the module touches: createElement / append /
 * remove / replaceChildren / classList / dataset / style / setAttribute,
 * getElementById by tree walk, a `querySelectorAll` that answers from a
 * pre-registered selector table, and a **virtual clock** so 1600 ms of sinking
 * costs no wall time and the assertions are deterministic.
 *
 * Seven groups:
 *   A. stacking and pointer contract, read out of the injected <style>.
 *   B. the DOM shape: label a SIBLING of the live region, ARIA attributes exact.
 *   C. show() / clear(): at most one item in the live region, ever.
 *   D. THE DEFECT. A -> B never puts two items in the live region, and the
 *      retiring one leaves normal flow immediately. Sampled across the whole
 *      1600 ms sink, not just at the ends.
 *   E. destroy() releases the element, the resize listener, the poll and the
 *      pending animation timers, and is idempotent.
 *   F. `contentDocument` is read FRESH at every measurement — asserted by
 *      SWAPPING the frame's document underneath a live panel and watching the
 *      measurement follow it. This is the `docs/DRAG-GHOST-CONUNDRUM.md` §0 trap
 *      (about:blank is same-origin, so a cached dead document stays "valid").
 *   G. hygiene: no innerHTML, no default export, the `thinking === idle` paint
 *      invariant (zero `[data-state` selectors in the CSS).
 *
 * Dependency-free, node builtins only. Written 2026-08-28.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWonderingsPanel } from '../../../web/src/ui/wonderings-panel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL_SRC_PATH = join(HERE, '..', '..', '..', 'web', 'src', 'ui', 'wonderings-panel.js');
const PANEL_SRC = readFileSync(PANEL_SRC_PATH, 'utf8');

/** Mirrors of the module's own constants. Deliberately RE-DECLARED, not imported:
 *  the module exports only the factory, and a test that imported the constant
 *  would assert the code against itself. These are the contract's numbers, from
 *  `panel-notes.md` §1 and §5. */
const EXPECT_Z_INDEX = 40;      // strictly between #codap (auto) and #stage (50)
const EXPECT_SINK_MS = 1600;    // ms departure
const EXPECT_REPOSITION_MS = 2000; // ms poll cadence
const EXPECT_FALLBACK_TOP_PX = 60; // px when nothing can be measured
const EXPECT_SHELF_GAP_PX = 10; // px of air below the shelf

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); return true; }
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}
const eq = (a, b, label) => ok(
  Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), label,
  `expected ${JSON.stringify(b)}\n        got      ${JSON.stringify(a)}`);

// ===========================================================================
// The DOM shim. Plain objects; nothing here pretends to lay anything out.
// ===========================================================================

function makeClock() {
  let now = 0;
  let seq = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = seq++; timers.set(id, { at: now + (Number(ms) || 0), fn, every: 0 }); return id; },
    setInterval(fn, ms) { const id = seq++; timers.set(id, { at: now + (Number(ms) || 0), fn, every: Number(ms) || 0 }); return id; },
    clearTimeout(id) { timers.delete(id); },
    clearInterval(id) { timers.delete(id); },
    pending: () => timers.size,
    intervalCount: () => [...timers.values()].filter((t) => t.every > 0).length,
    advance(ms) {
      const target = now + ms;
      for (let guard = 0; ; guard += 1) {
        if (guard > 10000) throw new Error('t-panel: timer storm');
        let pick = null;
        for (const [id, t] of timers) {
          if (t.at <= target && (pick === null || t.at < timers.get(pick).at)) pick = id;
        }
        if (pick === null) break;
        const t = timers.get(pick);
        now = t.at;
        if (t.every > 0) t.at = now + t.every; else timers.delete(pick);
        t.fn();
      }
      now = target;
    },
  };
}

class ShimClassList {
  constructor(el) { this.el = el; }
  get _set() { return new Set(String(this.el.className || '').split(/\s+/).filter(Boolean)); }
  _write(s) { this.el.className = [...s].join(' '); }
  add(...cs) { const s = this._set; cs.forEach((c) => s.add(c)); this._write(s); }
  remove(...cs) { const s = this._set; cs.forEach((c) => s.delete(c)); this._write(s); }
  contains(c) { return this._set.has(c); }
}

class ShimElement {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.className = '';
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.dataset = Object.create(null);
    this.style = Object.create(null);
    this.hidden = false;
    this._text = '';
    this.classList = new ShimClassList(this);
  }
  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
  }
  set textContent(v) { this._text = String(v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...kids) { kids.forEach((k) => this.appendChild(k)); }
  replaceChildren(...kids) {
    this.children.forEach((c) => { c.parentNode = null; });
    this.children = [];
    kids.forEach((k) => this.appendChild(k));
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  querySelectorAll() { return []; }
}

function makeHostDocument(clock) {
  const listeners = new Map();
  const frames = [];
  const doc = {
    _all: [],
    createElement(tag) { const el = new ShimElement(tag, doc); doc._all.push(el); return el; },
    getElementById(id) {
      const walk = (node) => {
        if (node.id === id) return node;
        for (const c of node.children) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      return walk(doc.documentElement);
    },
  };
  doc.documentElement = new ShimElement('html', doc);
  doc.head = new ShimElement('head', doc);
  doc.body = new ShimElement('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);

  const view = {
    innerWidth: 1024,
    innerHeight: 768,
    setTimeout: (fn, ms) => clock.setTimeout(fn, ms),
    clearTimeout: (id) => clock.clearTimeout(id),
    setInterval: (fn, ms) => clock.setInterval(fn, ms),
    clearInterval: (id) => clock.clearInterval(id),
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((f) => f !== fn));
    },
    _listenerCount: (type) => (listeners.get(type) ?? []).length,
    _dispatch: (type) => (listeners.get(type) ?? []).slice().forEach((f) => f()),
    _flushFrames(times = 3) {
      for (let i = 0; i < times; i += 1) {
        const batch = frames.splice(0, frames.length);
        batch.forEach((f) => f());
      }
    },
  };
  doc.defaultView = view;
  return { doc, view };
}

/** A stand-in for CODAP's inner document. `sel -> [rects]` is pre-registered. */
function makeCodapDocument(href, selectorTable = {}) {
  const d = {
    location: { href },
    body: {},
    querySelectorAll(sel) {
      const rects = selectorTable[sel] ?? [];
      return rects.map((r) => ({ getBoundingClientRect: () => r }));
    },
  };
  return d;
}

const rect = (top, height, width) => ({
  top, height, width, bottom: top + height, left: 0, right: width,
});

/**
 * An iframe stand-in whose `contentDocument` is a GETTER: it counts reads and
 * returns whatever `_doc` currently is. This is the only way to prove the module
 * re-reads rather than remembers.
 */
function makeFrame(initialDoc) {
  const f = {
    _doc: initialDoc,
    _reads: 0,
    _throw: false,
    getBoundingClientRect: () => rect(0, 768, 1024),
  };
  Object.defineProperty(f, 'contentDocument', {
    get() {
      f._reads += 1;
      if (f._throw) throw new Error('cross-origin');
      return f._doc;
    },
  });
  return f;
}

// --------------------------------------------------------------- CSS helpers

/** The <style> the module injected into a shim document. */
function styleTextOf(doc) {
  const el = doc.getElementById('wonderings-panel-style');
  return el ? el.textContent : '';
}

/** CSS with block comments removed, so a commented-out rule cannot satisfy a test. */
const stripCssComments = (css) => String(css).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Body of the rule whose selector list is EXACTLY `selector`.
 * Walks every `sel { … }` pair rather than regex-matching in place, so
 * `.wonderings-panel` cannot be satisfied by `.wonderings-panel[hidden]` or by
 * `.wonderings-panel .wp-item`.
 */
function ruleBody(css, selector) {
  const want = selector.replace(/\s+/g, ' ').trim();
  const src = stripCssComments(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[1].replace(/\s+/g, ' ').trim() === want) return m[2];
  }
  return null;
}

/** Declared value of `prop` inside a rule body, trimmed, or null. */
function decl(body, prop) {
  if (body == null) return null;
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
  return m ? m[1].trim() : null;
}

/** Every element under `root` carrying class `cls`. */
function byClass(root, cls) {
  const out = [];
  const walk = (n) => {
    if (n.classList && n.classList.contains(cls)) out.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(root);
  return out;
}

/** Build a panel over a fresh shim world. */
function world({ frameDoc = null, state = 'hidden', label = 'Wonderings' } = {}) {
  const clock = makeClock();
  const { doc, view } = makeHostDocument(clock);
  const frame = frameDoc === null ? null : makeFrame(frameDoc);
  const panel = createWonderingsPanel({ doc, frame, state, label });
  return { clock, doc, view, frame, panel };
}

// ===========================================================================
// A. Stacking and pointer contract
// ===========================================================================
console.log('\nA. stacking and pointer contract (read from the injected <style>)');
console.log('='.repeat(76));
{
  const { doc, panel } = world();
  const css = styleTextOf(doc);
  ok(css.length > 0, 'a <style> with id wonderings-panel-style is injected');

  const body = ruleBody(css, '.wonderings-panel');
  ok(body !== null, '.wonderings-panel rule exists');
  const z = Number(decl(body, 'z-index'));
  eq(z, EXPECT_Z_INDEX, `.wonderings-panel declares z-index ${EXPECT_Z_INDEX}`);
  ok(z > 0 && z < 50,
    'z-index is strictly between #codap (auto, stacks by document order) and #stage (50)',
    `got ${z}`);
  eq(decl(body, 'pointer-events'), 'none', '.wonderings-panel declares pointer-events: none');
  eq(decl(body, 'position'), 'fixed', '.wonderings-panel is position: fixed');
  eq(decl(ruleBody(css, '.wonderings-panel *'), 'pointer-events'), 'none',
    'every descendant is pointer-events: none too (belt and braces, decision 7)');

  // The element itself must not re-open what the class closed.
  eq(panel.el.style.zIndex ?? null, null, 'no inline z-index overriding the rule');
  eq(panel.el.style.pointerEvents ?? null, null, 'no inline pointer-events overriding the rule');
  panel.destroy();
}

// ===========================================================================
// B. DOM shape and ARIA
// ===========================================================================
console.log('\nB. DOM shape and ARIA');
console.log('='.repeat(76));
{
  const { doc, panel } = world({ state: 'idle', label: 'Wonderings' });
  const root = panel.el;
  eq(root.parentNode === doc.body, true, 'the panel mounts into the HOST body, not CODAP');
  eq(root.className, 'wonderings-panel', 'root carries the class');

  const labels = byClass(root, 'wp-label');
  const lives = byClass(root, 'wp-live');
  eq(labels.length, 1, 'exactly one standing label');
  eq(lives.length, 1, 'exactly one live region');
  const [labelEl] = labels;
  const [live] = lives;
  eq(labelEl.textContent, 'Wonderings', 'the label renders its text');
  eq(live.contains(labelEl), false,
    'the label is a SIBLING of the live region, never inside it (else "Wonderings" is re-announced with every question)');

  eq(live.getAttribute('aria-live'), 'polite', 'aria-live=polite');
  eq(live.getAttribute('aria-atomic'), 'false', 'aria-atomic=false');
  eq(live.getAttribute('aria-relevant'), 'additions',
    'aria-relevant=additions — this is what keeps the sinking departure silent');
  eq(root.dataset.state, 'idle', 'data-state reflects the state');
  panel.destroy();
}

// ===========================================================================
// C. show() / clear()
// ===========================================================================
console.log('\nC. show() / clear(): at most one item in the live region');
console.log('='.repeat(76));
{
  const { clock, panel, view } = world({ state: 'hidden' });
  const live = byClass(panel.el, 'wp-live')[0];

  eq(panel.show('Does mass go with life span?'), null, 'show() while hidden is a no-op returning null');
  eq(live.children.length, 0, '...and puts nothing in the live region');

  panel.setState('idle');
  eq(live.children.length, 0, 'idle: the live region is empty');

  const a = panel.show('Does mass go with life span?');
  ok(a !== null, 'show() while idle returns the element');
  eq(live.children.length, 1, 'showing: EXACTLY one item in the live region');
  eq(live.children[0].textContent, 'Does mass go with life span?', 'the item carries the text');
  eq(panel.getState(), 'showing', 'state becomes showing');
  view._flushFrames();
  eq(a.classList.contains('is-entering'), false, 'the entering class is dropped after two frames (it rises)');

  const again = panel.show('Does mass go with life span?');
  eq(again === a, true, 'the same text reuses the same node (stable FNV-1a key) rather than re-announcing');
  eq(live.children.length, 1, '...and the live region still holds exactly one item');

  panel.clear();
  eq(live.children.length, 0,
    'clear(): the retiring item leaves the live region IMMEDIATELY, not after SINK_MS');
  eq(a.getAttribute('aria-hidden'), 'true', 'the retiring item is out of the accessibility tree');
  eq(panel.getState(), 'idle', 'clear() falls back to idle');

  clock.advance(EXPECT_SINK_MS + 100);
  eq(panel.el.contains(a), false, 'after SINK_MS the retiring node is gone from the panel entirely');
  eq(live.children.length, 0, 'the live region is still empty');
  panel.destroy();
}

// ===========================================================================
// D. THE DEFECT: A -> B must never hold two items in one live region
// ===========================================================================
console.log('\nD. the A -> B handover');
console.log('='.repeat(76));
{
  const { clock, doc, view, panel } = world({ state: 'idle' });
  const css = styleTextOf(doc);
  const live = byClass(panel.el, 'wp-live')[0];

  const a = panel.show('Does mass go with life span?');
  view._flushFrames();
  const b = panel.show('What if the heaviest animals are also the slowest?');
  view._flushFrames();

  eq(live.children.length, 1,
    'IMMEDIATELY after the handover the live region holds ONE item, not two');
  eq(live.children[0] === b, true, 'the one item is the ARRIVING wondering');
  eq(live.contains(a), false, 'the retiring wondering is no longer inside the live region');
  eq(a.getAttribute('aria-hidden'), 'true', 'the retiring wondering is aria-hidden');
  eq(b.getAttribute('aria-hidden'), null, 'the arriving wondering is NOT aria-hidden');
  eq(a.classList.contains('is-leaving'), true, 'the retiring wondering still sinks (motion preserved)');

  // OUT OF FLOW: either it is absolutely positioned itself, or it now lives in a
  // container the stylesheet positions absolutely inside a positioned ancestor.
  const holder = a.parentNode;
  ok(holder !== null && holder !== live, 'the retiring wondering moved to a separate holder');
  const ruleForClass = (cls) => (cls
    ? ruleBody(css, `.${cls}`) ?? ruleBody(css, `.wonderings-panel .${cls}`)
    : null);
  const firstClass = (n) => String(n?.className ?? '').split(/\s+/).filter(Boolean)[0] ?? '';
  const holderClass = firstClass(holder);
  const posOnItem = a.style.position ?? null;
  const posOnHolder = decl(ruleForClass(holderClass), 'position');
  ok(posOnItem === 'absolute' || posOnHolder === 'absolute',
    'the retiring wondering is OUT OF NORMAL FLOW (absolute), so it cannot push the arriving one down',
    `item style.position=${posOnItem}  holder .${holderClass} position=${posOnHolder}`);

  // An `absolute` box with no positioned ancestor escapes to the viewport, which
  // would drop the sinking wondering somewhere over CODAP. Walk up to the root.
  let contained = posOnItem === 'absolute';
  for (let n = holder?.parentNode; n && !contained; n = n.parentNode) {
    const p = n === panel.el
      ? decl(ruleBody(css, '.wonderings-panel'), 'position')
      : decl(ruleForClass(firstClass(n)), 'position');
    if (p === 'relative' || p === 'absolute' || p === 'fixed') contained = true;
    if (n === panel.el) break;
  }
  ok(contained,
    'that absolute box has a POSITIONED ancestor, so it sinks over the panel rather than escaping to the viewport');

  // Sampled across the whole sink, because the original defect was a 1600 ms window.
  let worst = live.children.length;
  for (let t = 0; t <= EXPECT_SINK_MS + 200; t += 100) {
    clock.advance(100);
    worst = Math.max(worst, live.children.length);
  }
  eq(worst, 1, 'across the entire 1600 ms sink the live region never held more than one item');
  eq(panel.el.contains(a), false, 'the retired wondering is removed once the sink completes');
  eq(live.children.length, 1, 'the arriving wondering is still there');
  panel.destroy();
}
{
  // setState('hidden') must empty everything, including anything mid-sink.
  const { panel, view, doc } = world({ state: 'idle' });
  const live = byClass(panel.el, 'wp-live')[0];
  const a = panel.show('Does mass go with life span?');
  view._flushFrames();
  panel.show('What if the heaviest animals are also the slowest?');
  panel.setState('hidden');
  eq(live.children.length, 0, 'hidden: the live region is emptied');
  eq(byClass(panel.el, 'wp-item').length, 0,
    'hidden: no item is left anywhere in the panel, mid-sink or not');
  eq(panel.el.hidden, true, 'hidden: the root carries the hidden attribute');
  void a; void doc;
  panel.destroy();
}

// ===========================================================================
// E. destroy()
// ===========================================================================
console.log('\nE. destroy() releases everything it took');
console.log('='.repeat(76));
{
  const { clock, doc, view, panel } = world({ state: 'idle', frameDoc: makeCodapDocument('http://localhost:5199/codap/') });
  eq(view._listenerCount('resize'), 1, 'a resize listener is installed');
  eq(clock.intervalCount(), 1, 'a reposition poll is installed');
  panel.show('Does mass go with life span?');   // leaves a pending rAF/timer trail
  panel.clear();                                 // leaves a pending SINK_MS timer
  ok(clock.pending() >= 2, 'there are pending timers before destroy', `pending=${clock.pending()}`);

  panel.destroy();
  eq(doc.body.contains(panel.el), false, 'destroy() removes the element from the document');
  eq(view._listenerCount('resize'), 0, 'destroy() REMOVES the resize listener (dot-badge.js defect 2)');
  eq(clock.intervalCount(), 0, 'destroy() clears the reposition poll');
  eq(clock.pending(), 0, 'destroy() clears every pending animation timer');
  eq(styleTextOf(doc), '', 'destroy() removes the shared <style> when the last panel goes');

  const beforeTop = panel.el.style.top;
  view._dispatch('resize');
  clock.advance(10 * EXPECT_REPOSITION_MS);
  eq(panel.el.style.top, beforeTop, 'nothing repositions after destroy()');
  eq(panel.show('anything?'), null, 'show() after destroy() is a no-op');
  panel.destroy();
  ok(true, 'destroy() is idempotent (a second call does not throw)');
}
{
  // Two panels in one document must not un-style each other.
  const clock = makeClock();
  const { doc } = makeHostDocument(clock);
  const p1 = createWonderingsPanel({ doc, state: 'idle' });
  const p2 = createWonderingsPanel({ doc, state: 'idle' });
  p1.destroy();
  ok(styleTextOf(doc).length > 0, 'the shared <style> survives while a second panel still uses it');
  p2.destroy();
  eq(styleTextOf(doc), '', '...and goes when the last one does');
}

// ===========================================================================
// F. contentDocument is READ FRESH at every measurement
// ===========================================================================
console.log('\nF. contentDocument is never cached (DRAG-GHOST-CONUNDRUM §0)');
console.log('='.repeat(76));
{
  // Starts as about:blank — same-origin, readable, and DEAD. The whole trap.
  const dead = makeCodapDocument('about:blank');
  const alive = makeCodapDocument('http://localhost:5199/codap/', {
    '[data-testid="tool-shelf"]': [rect(0, 90, 1000)],   // bottom = 90
  });
  const { clock, frame, panel } = world({ frameDoc: dead, state: 'idle' });

  const readsAfterMount = frame._reads;
  ok(readsAfterMount >= 1, 'the frame document is read at mount', `reads=${readsAfterMount}`);
  eq(panel.el.style.top, `${EXPECT_FALLBACK_TOP_PX}px`,
    'an about:blank frame is treated as unmeasurable and the panel falls back');

  // Swap the document underneath the live panel — exactly what CODAP does when it
  // finishes loading. A cached reference would keep measuring the dead one forever.
  frame._doc = alive;
  clock.advance(EXPECT_REPOSITION_MS + 10);
  ok(frame._reads > readsAfterMount, 'the poll re-reads contentDocument rather than a remembered one',
    `reads ${readsAfterMount} -> ${frame._reads}`);
  eq(panel.el.style.top, `${90 + EXPECT_SHELF_GAP_PX}px`,
    'the measurement FOLLOWS the swapped-in document (shelf bottom 90 + 10 gap)');

  // ...and it must not remember the shelf ELEMENT either.
  alive.querySelectorAll = (sel) => (sel === '[data-testid="tool-shelf"]'
    ? [{ getBoundingClientRect: () => rect(0, 120, 1000) }] : []);
  clock.advance(EXPECT_REPOSITION_MS + 10);
  eq(panel.el.style.top, `${120 + EXPECT_SHELF_GAP_PX}px`,
    'the shelf ELEMENT is re-queried too, not remembered');

  // A cross-origin frame throws on access; that must degrade, not crash.
  frame._throw = true;
  clock.advance(EXPECT_REPOSITION_MS + 10);
  eq(panel.el.style.top, `${EXPECT_FALLBACK_TOP_PX}px`,
    'a frame that throws on contentDocument falls back instead of throwing');
  panel.destroy();
}

// ===========================================================================
// G. hygiene
// ===========================================================================
console.log('\nG. hygiene');
console.log('='.repeat(76));
{
  ok(!/innerHTML\s*=|insertAdjacentHTML|\.outerHTML\s*=/.test(PANEL_SRC),
    'the source never WRITES innerHTML/outerHTML (wondering text is student-adjacent and goes in as text)');
  ok(!/export\s+default/.test(PANEL_SRC), 'named exports only — no default export');

  const { doc, panel } = world({ state: 'idle' });
  const css = styleTextOf(doc);
  ok(!/\[data-state/.test(css),
    'ZERO [data-state] selectors in the CSS — `thinking` must be visually identical to `idle`');
  const item = ruleBody(css, '.wonderings-panel .wp-item');
  ok(item !== null && /transition/.test(item), 'the item still declares a transition (the slow dwell survives)');
  const leaving = ruleBody(css, '.wonderings-panel .wp-item.is-leaving');
  ok(leaving !== null && /transition-duration\s*:\s*1600ms/.test(leaving),
    'the departure is still the deliberate 1600 ms sink, not a 400 ms crossfade');
  ok(/translateY\(\s*18px\s*\)/.test(leaving ?? ''), 'the departure still SINKS (translateY +18px)');

  // A wondering must never be interpreted as markup.
  panel.setState('idle');
  const evil = panel.show('<b>Does mass go with life span?</b>');
  eq(evil.textContent, '<b>Does mass go with life span?</b>', 'text is set verbatim, as text');
  panel.destroy();
}

console.log(`\n${'='.repeat(76)}`);
if (failures) {
  console.log(`FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('OK — every assertion passed');
