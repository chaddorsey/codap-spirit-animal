/**
 * dot-badge.js — Dot's head as a reusable UI mark, plus X * Dot's Dashboard.
 *
 * The character itself is a .glb, so there is no head image to reuse. This is a
 * hand-drawn SVG of the same silhouette: round head, three gill fronds a side,
 * two eyes. It is deliberately a separate module because the badge is wanted in
 * more than one place — the Dashboard now, the tutorial launchpad
 * next — and the connected/disconnected convention should mean the same thing
 * everywhere it appears.
 *
 * THE CONVENTION: **solid means Dot is connected, outline means she is not.**
 * Colour reinforces it (teal / amber, matching the panel's existing `#conn`
 * styling) but the fill is the signal, so it still reads when colour does not
 * survive — greyscale, a projector, or a colour-blind viewer.
 */

/**
 * 40×40. A mascot mark in the Snoo/Octocat vein: few shapes, generous weight,
 * readable as a silhouette at any size.
 *
 * THE GILLS ARE SIX DISTINCT BLOBS, NOT STROKES. Drawn as thin lines they read
 * as spider legs; drawn as thick lines they read as spikes. They are near-round
 * ellipses set on a circle of radius 12 about the head centre at ±35° and 0°, so
 * each one overlaps the head enough to look attached while keeping clear air
 * between its neighbours — the fan has to be countable at 28px, not just at 160.
 */
export const DOT_HEAD_SVG = `
<svg class="dot-head" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <g class="gills">
    <ellipse class="frond" cx="10.2" cy="13.1" rx="3.9" ry="3.0" transform="rotate(-35 10.2 13.1)"/>
    <ellipse class="frond" cx="8.0"  cy="20.0" rx="3.9" ry="3.0"/>
    <ellipse class="frond" cx="10.2" cy="26.9" rx="3.9" ry="3.0" transform="rotate(35 10.2 26.9)"/>
    <ellipse class="frond" cx="29.8" cy="13.1" rx="3.9" ry="3.0" transform="rotate(35 29.8 13.1)"/>
    <ellipse class="frond" cx="32.0" cy="20.0" rx="3.9" ry="3.0"/>
    <ellipse class="frond" cx="29.8" cy="26.9" rx="3.9" ry="3.0" transform="rotate(-35 29.8 26.9)"/>
  </g>
  <ellipse class="head" cx="20" cy="20" rx="10.4" ry="9.6"/>
  <circle class="eye" cx="16.2" cy="18.6" r="1.9"/>
  <circle class="eye" cx="23.8" cy="18.6" r="1.9"/>
  <path class="smile" d="M17 24.1c1.6 1.5 4.4 1.5 6 0"/>
</svg>`;

const STYLE_ID = 'dot-badge-style';

const CSS = `
.dot-head { width: 100%; height: 100%; display: block; overflow: visible;
  stroke-linejoin: round; }
.dot-head .smile { fill: none; stroke-linecap: round; stroke-width: 1.8; }

/* OUTLINE — not connected. The state the mark has to carry, so the head and
   the fronds share one weight and read as a single drawn shape. */
.dot-mark { color: #b45309; }
.dot-mark .head,
.dot-mark .frond { fill: none; stroke: currentColor; stroke-width: 2; }
.dot-mark .eye { fill: currentColor; }
.dot-mark .smile { stroke: currentColor; }

/* SOLID — connected. Fronds keep a hairline of their own so the fan does not
   collapse into one blob where they overlap the head. */
.dot-mark.is-connected { color: #0b7285; }
.dot-mark.is-connected .head { fill: currentColor; stroke: none; }
.dot-mark.is-connected .frond { fill: currentColor; stroke: currentColor;
  stroke-width: 1.2; }
.dot-mark.is-connected .eye { fill: #fff; }
.dot-mark.is-connected .smile { stroke: #fff; }

/* The clickable badge that collapses Dot's Dashboard down to a mark.
   No ring and no fill: it sits in CODAP's own toolbar next to Help, so any
   chrome of its own would read as a foreign object bolted onto the app. The
   head IS the button. Position is set from JS — see placeLeftOfHelp(). */
.dot-badge { position: fixed; top: 6px; right: 8px; z-index: 120;
  width: 44px; height: 44px; padding: 0; box-sizing: border-box;
  border: none; background: transparent; cursor: pointer; line-height: 0;
  transition: transform .12s ease, opacity .12s ease; opacity: .92; }
.dot-badge:hover { transform: scale(1.08); opacity: 1; }
.dot-badge:focus-visible { outline: 2px solid currentColor; outline-offset: 3px;
  border-radius: 8px; }
.dot-badge[aria-expanded="true"] { opacity: 1; }
`;

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.appendChild(el);
}

/**
 * A standalone mark, for anywhere that wants to show Dot's state without the
 * panel — the launchpad's per-tutorial cards, for instance.
 * @returns {{el: HTMLElement, setConnected: (on: boolean) => void}}
 */
export function createDotMark({ size = 24, doc = document, title = 'Dot' } = {}) {
  ensureStyle(doc);
  const el = doc.createElement('span');
  el.className = 'dot-mark';
  el.style.cssText = `display:inline-block;width:${size}px;height:${size}px;line-height:0`;
  el.innerHTML = DOT_HEAD_SVG;
  el.title = title;
  return {
    el,
    setConnected: (on) => {
      el.classList.toggle('is-connected', !!on);
      el.title = on ? `${title} — connected` : `${title} — not connected`;
    },
  };
}

/**
 * Collapse Dot's Dashboard down to a head badge in the corner in the corner.
 *
 * Starts closed: the Dashboard is a developer affordance and the demo is the point
 * of the page, so the default view should be CODAP with Dot in it and nothing
 * else. Escape closes, because a panel that covers the corner of the app should
 * always have a way out that does not require aiming.
 *
 * @param {HTMLElement} panel   the panel to show and hide
 * @param {object}      [opts]
 * @param {boolean}     [opts.open=false]  initial state
 * @returns {{setConnected: (on:boolean)=>void, open:()=>void, close:()=>void,
 *            toggle:()=>void, badge:HTMLElement}}
 */
export function installDashboardBadge(panel, { open = false, doc = document,
                                               frame = null } = {}) {
  ensureStyle(doc);

  const badge = doc.createElement('button');
  badge.className = 'dot-badge dot-mark';
  badge.type = 'button';
  badge.innerHTML = DOT_HEAD_SVG;
  badge.setAttribute('aria-controls', panel.id || 'panel');
  doc.body.appendChild(badge);

  /**
   * Sit just left of CODAP's Help control, measured rather than guessed.
   *
   * We are same-origin with CODAP, so the honest thing is to find the control
   * and read its rect — a hard-coded offset would drift the moment CODAP's
   * toolbar changes, and this badge is meant to look like it belongs to the
   * toolbar rather than to float near it. Falls back to the top-right corner
   * when the control cannot be found, which is also the cross-origin case.
   */
  const HELP_SELECTORS = [
    '[data-testid*="help" i]',
    '[title*="help" i]',
    '[aria-label*="help" i]',
  ];
  const findHelp = () => {
    let d = null;
    try { d = frame?.contentDocument; } catch { return null; }
    if (!d) return null;
    for (const sel of HELP_SELECTORS) {
      let els = [];
      try { els = [...d.querySelectorAll(sel)]; } catch { continue; }
      // the toolbar one is the topmost visible match
      const vis = els.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 8 && r.height > 8 && r.top < 120;
      }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (vis[0]) return vis[0];
    }
    return null;
  };
  const placeLeftOfHelp = () => {
    const help = findHelp();
    if (!help || !frame) { badge.style.removeProperty('left'); badge.style.right = '8px'; return; }
    const fr = frame.getBoundingClientRect();
    const hr = help.getBoundingClientRect();
    const size = badge.offsetWidth || 44;
    const left = fr.left + hr.left - size - 6;
    const top = fr.top + hr.top + (hr.height - size) / 2;
    badge.style.removeProperty('right');
    badge.style.left = `${Math.max(4, Math.round(left))}px`;
    badge.style.top = `${Math.max(2, Math.round(top))}px`;
  };
  placeLeftOfHelp();
  // CODAP's toolbar arrives late and moves on resize; re-measuring is cheap and
  // a badge parked in the wrong place is worse than a timer.
  const reposition = setInterval(placeLeftOfHelp, 2000);
  doc.defaultView?.addEventListener('resize', placeLeftOfHelp);
  setTimeout(() => clearInterval(reposition), 120000);   // settle, then stop

  let isOpen = null;
  const apply = (next) => {
    if (next === isOpen) return;
    isOpen = next;
    panel.hidden = !next;
    badge.setAttribute('aria-expanded', String(next));
    badge.setAttribute('aria-label', next ? "Hide Dot's Dashboard"
                                          : "Show Dot's Dashboard");
  };
  apply(open);

  badge.addEventListener('click', () => apply(!isOpen));
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) apply(false); });

  return {
    badge,
    reposition: placeLeftOfHelp,
    open: () => apply(true),
    close: () => apply(false),
    toggle: () => apply(!isOpen),
    setConnected: (on) => {
      badge.classList.toggle('is-connected', !!on);
      badge.title = on ? 'Dot is connected to CODAP' : 'Dot is not connected to CODAP';
    },
  };
}
