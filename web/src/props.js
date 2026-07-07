import * as THREE from 'three';

/**
 * PointDouble — a visual stand-in for one plotted CODAP point (Phase 5,
 * bat-a-point). The real point never moves: this double spawns exactly on
 * top of it, gets batted away in a little arc, springs back elastically to
 * land where it started, and is removed. Kitten physics, zero data risk.
 */
export class PointDouble {
  constructor(stage, px, py, { radius = 7, color = 0xe6805b } = {}) {
    this.stage = stage;
    this.origin = { x: px, y: py };
    this.pos = { x: px, y: py };
    const geo = new THREE.CircleGeometry(radius / stage.pixelsPerUnit, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: typeof color === 'string' ? new THREE.Color(color) : color,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    // face the ortho camera on +X, sit slightly in front of the character
    this.mesh.rotation.y = Math.PI / 2;
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
  }
}
