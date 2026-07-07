/**
 * Whisker — Dot's personal-space sense (Phase 6.1).
 *
 * The overlay is pointer-events:none and the mouse vanishes into the
 * cross-origin iframe, so Dot cannot see the cursor — except right around
 * Dot itself: a small transparent pointer-events:auto halo rides along at
 * Dot's screen position. The moment the cursor enters it, the halo
 * disables itself (pointer-events:none) so everything that follows —
 * including the click the user was reaching for — passes straight through
 * to CODAP, and `onNear(x, y)` fires once. Like a cat noticing someone
 * walking by: one whisker-touch, then it moves out of the way.
 *
 * Never steals input beyond the single mouseenter; re-arms after a pause.
 */

const HALO_PX = 34;            // personal space beyond the body
const REARM_MS = 2500;         // stay inert this long after a touch

export class Whisker {
  constructor(actor, onNear) {
    this.actor = actor;
    this.onNear = onNear;
    this.enabled = true;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;z-index:60;pointer-events:auto;'
      + 'background:transparent;';   // invisible; sits under the debug panel
    el.addEventListener('mouseenter', (e) => this._touched(e));
    document.body.appendChild(el);
    this.el = el;
    this._inertUntil = 0;
  }

  _touched(e) {
    if (!this.enabled) return;
    this.el.style.pointerEvents = 'none';          // let everything through
    this._inertUntil = performance.now() + REARM_MS;
    this.onNear(e.clientX, e.clientY);
  }

  /** Call every frame: follow Dot, re-arm after the pause. */
  update() {
    if (!this.enabled) { this.el.style.pointerEvents = 'none'; return; }
    if (this.el.style.pointerEvents === 'none'
        && performance.now() > this._inertUntil) {
      this.el.style.pointerEvents = 'auto';
    }
    const p = this.actor.getPosition();
    const half = (this.actor.pixelHeight ?? 150) * 0.55 + HALO_PX;
    this.el.style.left = `${p.x - half}px`;
    this.el.style.top = `${p.y - half}px`;
    this.el.style.width = `${half * 2}px`;
    this.el.style.height = `${half * 2}px`;
  }

  dispose() { this.el.remove(); }
}
