/**
 * watch-drag-dom.js — `window.__dotWatch`, a DOM witness for the drag window.
 *
 * WHY THIS EXISTS. On 2026-08-27 Chad's machine produced:
 *
 *     [dot-drag] NEVER STARTED after 12017ms
 *
 * with NO accompanying "of which Nms was a frozen main thread" line. That line
 * prints whenever `_awaitPreviewEl` has to extend its deadline, so its absence
 * is positive evidence that the polls arrived on time and **the main thread was
 * running**. dnd-kit simply did not produce `.dnd-kit-drag-overlay` within 12 s
 * on a page that was not stalled. Every starvation explanation dies there.
 *
 * But Chad also reports seeing "a black Age rectangle" appear at the pill at
 * the moment Dot presses. Something IS rendered. It is not our own ghost — the
 * only ghost the wrapper draws is the three.js CSV card in `cursor.js`, used
 * exclusively by `carrycsv`. So either the overlay exists under a class our
 * selector misses, or CODAP renders something else entirely and the overlay
 * genuinely never arrives.
 *
 * Guessing from here is cheap and wrong. This records what actually appears.
 *
 * USAGE, in the wrapper page's console:
 *
 *     __dotWatch.start()          // then click "Show me." on the scatterplot task
 *     __dotWatch.report()         // after it finishes or bails
 *
 * `report()` prints copy-pasteable text, not objects — the console collapses
 * objects to {…} and they cannot be copied out (the lesson of b70e734).
 */

const nowMs = () => Math.round(performance.now());

/** Compact, greppable description of an element. */
function describe(el) {
  if (!el || el.nodeType !== 1) return String(el);
  const testid = el.getAttribute?.('data-testid');
  const cls = String(el.className?.baseVal ?? el.className ?? '').trim().slice(0, 60);
  let rect = '';
  try {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) {
      rect = ` @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    }
  } catch { /* detached */ }
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return `${el.tagName.toLowerCase()}`
    + (testid ? `[${testid}]` : '')
    + (cls ? `.${cls.replace(/\s+/g, '.')}` : '')
    + rect
    + (text ? ` "${text}"` : '');
}

/**
 * Is this element a plausible "drag ghost"? Deliberately broad: the point is to
 * catch whatever CODAP renders, INCLUDING things our production selector misses.
 */
function looksLikeGhost(el) {
  if (!el || el.nodeType !== 1) return false;
  const cls = String(el.className?.baseVal ?? el.className ?? '').toLowerCase();
  if (/drag|overlay|ghost|preview|dnd/.test(cls)) return true;
  const testid = (el.getAttribute?.('data-testid') ?? '').toLowerCase();
  return /drag|overlay|ghost|preview/.test(testid);
}

/**
 * Every document a ghost could live in: the wrapper, CODAP, and every nested
 * plugin iframe.
 *
 * The first version of this watcher attached only to `inj.doc` and recorded
 * ZERO events across 76 s — not even the `pointerdown` we ourselves dispatch —
 * while Chad watched the ghost card appear on screen at about 40 s. An
 * instrument that cannot see our own events is not evidence of absence, it is a
 * bug. Cast the net over everything reachable and re-scan, because CODAP mounts
 * plugin iframes after load.
 */
function allDocs(rootDoc) {
  const out = [];
  const add = (d) => {
    if (!d || out.includes(d)) return;
    out.push(d);
    let frames = [];
    try { frames = [...d.querySelectorAll('iframe')]; } catch { return; }
    for (const f of frames) {
      try { add(f.contentDocument); } catch { /* cross-origin */ }
    }
  };
  try { add(document); } catch { /* no-op */ }
  add(rootDoc);
  return out;
}

export function installDragDomWatcher(getDoc) {
  const state = { on: false, t0: 0, rows: [], obs: null, timer: null, seenSelectors: new Map() };

  const log = (kind, detail) => state.rows.push([nowMs() - state.t0, kind, detail]);

  const start = () => {
    const doc = getDoc();
    if (!doc) { console.log('[dot-watch] no CODAP document yet'); return; }
    stop();
    state.on = true;
    state.t0 = nowMs();
    state.rows = [];
    state.seenSelectors = new Map();

    // 1. every element added or removed, in EVERY reachable document
    const docs = allDocs(doc);
    log('INIT', `watching ${docs.length} document(s): `
      + docs.map((d) => (d.location?.href ?? '?').slice(-42)).join(' | '));
    state.obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (looksLikeGhost(n)) log('ADD ', describe(n));
        }
        for (const n of m.removedNodes) {
          if (n.nodeType !== 1) continue;
          if (looksLikeGhost(n)) log('DEL ', describe(n));
        }
      }
    });
    state.docs = docs;
    for (const d of docs) {
      try { if (d.body) state.obs.observe(d.body, { childList: true, subtree: true }); }
      catch { /* detached */ }
    }

    // 2. poll the production selector AND some likely alternates, so a missed
    //    class name shows up as "this one existed and ours did not"
    const CANDIDATES = [
      '.dnd-kit-drag-overlay',
      '[class*="drag-overlay"]',
      '[class*="dragOverlay"]',
      '[class*="drag-preview"]',
      '[data-testid*="drag"]',
      '[class*="codap-attribute-button"][class*="drag"]',
    ];
    state.timer = setInterval(() => {
      // re-scan for documents: CODAP mounts plugin iframes after load, and the
      // ghost may not live where we first looked
      const live = allDocs(getDoc());
      for (const d of live) {
        if (!state.docs.includes(d)) {
          state.docs.push(d);
          try { if (d.body) state.obs.observe(d.body, { childList: true, subtree: true }); } catch { /* no */ }
          log('DOC+', `new document: ${(d.location?.href ?? '?').slice(-50)}`);
        }
      }
      for (const d of live) {
        const tag = d === getDoc() ? 'codap' : (d === document ? 'wrapper' : 'nested');
        for (const sel of CANDIDATES) {
          let el = null;
          try { el = d.querySelector(sel); } catch { continue; }
          const key = `${tag}::${sel}`;
          const was = state.seenSelectors.get(key) ?? false;
          if (el && !was) { state.seenSelectors.set(key, true); log('SEL+', `[${tag}] ${sel}  ->  ${describe(el)}`); }
          else if (!el && was) { state.seenSelectors.set(key, false); log('SEL-', `[${tag}] ${sel} gone`); }
        }
      }
    }, 100);

    // 3. exceptions thrown inside anyone's listeners. `dispatchEvent` runs
    //    listeners synchronously and SWALLOWS what they throw, reporting only
    //    to the frame's error handler — which nothing was listening to.
    for (const d of docs) {
      const win = d.defaultView;
      if (!win) continue;
      try {
        win.addEventListener('error', (e) => {
          log('THROW', `${e.message} @ ${String(e.filename ?? '').slice(-40)}:${e.lineno}`);
        }, true);
        win.addEventListener('unhandledrejection', (e) => {
          log('REJEC', String(e.reason?.message ?? e.reason).slice(0, 120));
        }, true);
      } catch { /* cross-origin */ }
    }

    // 4. the pointer lifecycle, in EVERY document. Logged unconditionally: the
    //    previous version recorded nothing at all, and "we never even saw our
    //    own pointerdown" is the fact that exposed it as broken.
    for (const d of docs) {
      const tag = d === doc ? 'codap' : (d === document ? 'wrapper' : 'nested');
      for (const t of ['pointerdown', 'pointerup', 'pointercancel',
                       'gotpointercapture', 'lostpointercapture', 'dragstart', 'drop']) {
        try {
          d.addEventListener(t, (e) => {
            log(e.isTrusted ? 'REAL' : 'ours', `[${tag}] ${t} id=${e.pointerId ?? '-'} `
              + `primary=${e.isPrimary ?? '-'} btn=${e.button ?? '-'} on ${describe(e.target)}`);
          }, true);
        } catch { /* detached */ }
      }
    }

    console.log('[dot-watch] recording — click "Show me." now, then __dotWatch.report()');
  };

  const stop = () => {
    state.on = false;
    if (state.obs) { state.obs.disconnect(); state.obs = null; }
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  };

  const report = () => {
    stop();
    const lines = state.rows.map(([t, kind, detail]) =>
      `${String(t).padStart(7)}ms  ${kind}  ${detail}`);
    const ghostEver = state.rows.some((r) => r[1] === 'SEL+' && r[2].startsWith('.dnd-kit-drag-overlay'));
    console.log(
      `[dot-watch] ${state.rows.length} events over ${nowMs() - state.t0}ms\n`
      + `production selector '.dnd-kit-drag-overlay' EVER matched: ${ghostEver ? 'YES' : 'NO'}\n`
      + '----------------------------------------------------------------\n'
      + (lines.join('\n') || '(nothing — no ghost-ish element ever appeared)')
      + '\n----------------------------------------------------------------');
    return state.rows.length;
  };

  return { start, stop, report, get rows() { return state.rows; } };
}
