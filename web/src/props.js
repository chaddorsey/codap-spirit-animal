import * as THREE from 'three';

/**
 * PointDouble — a visual stand-in for one plotted CODAP point (Phase 5,
 * bat-a-point). The real point never moves: this double spawns exactly on
 * top of it, gets batted away in a little arc, springs back elastically to
 * land where it started, and is removed. Kitten physics, zero data risk.
 */
const DEFAULT_POINT_COLOR = 0xe6805b;   // CODAP's default point orange

/** CODAP's color strings arrive in whatever format the document stored —
 *  '#rrggbb', 'rgb(...)', '', or absent. An unparseable string must NOT
 *  fall through to THREE's white default (the "white dot" bug): start from
 *  the fallback and let a successful parse overwrite it. */
export const parsePointColor = (color, fallback = DEFAULT_POINT_COLOR) => {
  if (typeof color === 'number') return new THREE.Color(color);
  const c = new THREE.Color(fallback);
  if (typeof color === 'string' && color.trim()) {
    try { c.set(color.trim()); } catch { c.set(fallback); }
  }
  return c;
};

export class PointDouble {
  constructor(stage, px, py,
    { radius = 7, color = DEFAULT_POINT_COLOR, coverColor = null } = {}) {
    this.stage = stage;
    this.origin = { x: px, y: py };
    this.pos = { x: px, y: py };
    const geo = new THREE.CircleGeometry(radius / stage.pixelsPerUnit, 24);
    const mat = new THREE.MeshBasicMaterial({ color: parsePointColor(color) });
    this.mesh = new THREE.Mesh(geo, mat);
    // face the ortho camera on +X, sit slightly in front of the character
    this.mesh.rotation.y = Math.PI / 2;
    // the REAL point never moves — while the double flies, a background-
    // colored patch sits over it (behind the character plane, so the paw
    // sweeps in front) to complete the "the point itself flew" illusion
    if (coverColor != null) {
      const cgeo = new THREE.CircleGeometry((radius + 1.5) / stage.pixelsPerUnit, 24);
      const cmat = new THREE.MeshBasicMaterial(
        { color: parsePointColor(coverColor, 0xffffff) });
      this.cover = new THREE.Mesh(cgeo, cmat);
      this.cover.rotation.y = Math.PI / 2;
      const w = stage.worldFromScreen(px, py);
      this.cover.position.set(w.x - 0.5, w.y, w.z);
      stage.scene.add(this.cover);
    }
    this._place(px, py);
    stage.scene.add(this.mesh);
  }

  _place(px, py) {
    const w = this.stage.worldFromScreen(px, py);
    this.mesh.position.set(w.x + 2.5, w.y, w.z);
    this.pos = { x: px, y: py };
  }

  _tween(sec, step) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = () => {
        if (!this.mesh.parent) return resolve();      // removed mid-tween
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        step(k);
        if (k >= 1) return resolve();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  /** Batted: a quick arc out with a squash at the moment of impact. */
  batTo(dx, dy, sec = 0.3) {
    const from = { ...this.pos };
    return this._tween(sec, (k) => {
      const e = 1 - (1 - k) ** 2;                     // fast out, decelerating
      const arc = -40 * Math.sin(Math.PI * e);        // lofted path
      this._place(from.x + dx * e, from.y + dy * e + arc);
      const sq = 1 + 0.5 * Math.max(0, 1 - k * 4);    // impact squash
      this.mesh.scale.set(1, 1 / sq, sq);
    });
  }

  /** Elastic return to the exact spawn point (over the real dot). */
  springBack(sec = 0.55) {
    const from = { ...this.pos };
    return this._tween(sec, (k) => {
      // overshooting elastic ease toward the origin
      const e = 1 - Math.exp(-5 * k) * Math.cos(3 * Math.PI * k);
      this._place(from.x + (this.origin.x - from.x) * e,
        from.y + (this.origin.y - from.y) * e);
      this.mesh.scale.setScalar(1);
    });
  }

  remove() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this.cover) {
      this.cover.parent?.remove(this.cover);
      this.cover.geometry.dispose();
      this.cover.material.dispose();
    }
  }
}
