/**
 * timeline.js — the one clock a demonstration runs on (Phase 9 P1).
 *
 * A demo's cursor never teleports and never travels in a straight machine
 * line: it follows a Catmull-Rom spline through the waypoints the script
 * names, paced by a named profile. The driver samples this ONCE per frame and
 * uses that single sample for the injected pointer event, the paw-print
 * sprite, and Dot's body — which is why the paw cannot drift away from what
 * the UI is doing.
 */

/** Catmull-Rom through p0..p3 at local t (uniform parameterization). */
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2
           + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** MOTION.md in one line: attack, cruise, sharp late brake. */
const PROFILES = {
  // teaching: unhurried, clearly readable, a beat of hesitation at the end
  teaching: (u) => (u < 0.18 ? (u / 0.18) ** 2 * 0.18
    : u > 0.82 ? 0.82 + (1 - ((1 - u) / 0.18) ** 1.6) * 0.18
    : u),
  // brisk: she already knows where she's going
  brisk: (u) => (u < 0.12 ? (u / 0.12) ** 2 * 0.12
    : u > 0.9 ? 0.9 + (1 - ((1 - u) / 0.1) ** 2) * 0.1
    : u),
  linear: (u) => u,
};

export class CursorPath {
  /** @param {Array<{x,y}>} waypoints at least two */
  constructor(waypoints) {
    if (!waypoints || waypoints.length < 2) {
      throw new Error('CursorPath needs at least two waypoints');
    }
    this.pts = waypoints.map((p) => ({ x: p.x, y: p.y }));
    // duplicate the ends so the spline starts and finishes exactly on them
    this.ctrl = [this.pts[0], ...this.pts, this.pts[this.pts.length - 1]];
    // cumulative chord length for roughly constant-speed sampling
    this.seg = [];
    let total = 0;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const d = Math.hypot(this.pts[i + 1].x - this.pts[i].x,
                           this.pts[i + 1].y - this.pts[i].y);
      this.seg.push(d);
      total += d;
    }
    this.length = total || 1;
  }

  /** Position at normalized arc position u in [0, 1]. */
  at(u) {
    const target = Math.max(0, Math.min(1, u)) * this.length;
    let acc = 0;
    for (let i = 0; i < this.seg.length; i++) {
      if (acc + this.seg[i] >= target || i === this.seg.length - 1) {
        const local = this.seg[i] ? (target - acc) / this.seg[i] : 0;
        return catmull(this.ctrl[i], this.ctrl[i + 1], this.ctrl[i + 2],
                       this.ctrl[i + 3], Math.max(0, Math.min(1, local)));
      }
      acc += this.seg[i];
    }
    return this.pts[this.pts.length - 1];
  }
}

/**
 * Run `path` over `sec` seconds, calling `onSample(pt, u)` once per animation
 * frame. Resolves at the end; rejects if `isAborted()` goes true, so a
 * cancelled demo stops mid-travel instead of finishing politely.
 */
export function runPath(path, sec, onSample, { profile = 'teaching', isAborted } = {}) {
  const ease = PROFILES[profile] ?? PROFILES.teaching;
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const frame = () => {
      if (isAborted?.()) return reject(new Error('demo aborted'));
      const u = Math.min(1, (performance.now() - t0) / (sec * 1000));
      const pt = path.at(ease(u));
      onSample(pt, u);
      if (u >= 1) return resolve(pt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * A gentle bowed two-point path — what `goto` and `tap` travel along. The bow
 * is perpendicular to the straight line, sized as a fraction of the distance
 * and capped, so short hops stay tidy and long crossings arc like a swim.
 */
export function arcPath(from, to, { bow = 0.18, maxBow = 90 } = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const amt = Math.min(maxBow, len * bow);
  const mid = { x: (from.x + to.x) / 2 + (-dy / len) * amt,
                y: (from.y + to.y) / 2 + (dx / len) * amt };
  return new CursorPath([from, mid, to]);
}

export { PROFILES };
