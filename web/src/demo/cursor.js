import * as THREE from 'three';

/**
 * DemoCursor — the glowing paw-print that marks where Dot is "touching" the
 * real UI during a demonstration (Phase 9 P1).
 *
 * It is deliberately NOT a mouse arrow: the student's own cursor is an arrow,
 * and the two must never be confused. One pad + four toes, Dot's pink, with a
 * soft halo behind it so it reads over CODAP's white plot areas and over the
 * blue tile title bars alike.
 *
 * It lives on the same three.js overlay as Dot and is driven from the SAME
 * timeline sample as her body — one clock, zero drift.
 */
const PINK = 0xff6fa5;
const HALO = 0xffd6e6;

export class DemoCursor {
  constructor(stage, { scale = 1 } = {}) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.group.rotation.y = Math.PI / 2;          // face the ortho camera
    const u = (px) => px / stage.pixelsPerUnit;

    const disc = (r, color, opacity) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(u(r) * scale, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
                                      depthTest: false }));
      return m;
    };

    this.halo = disc(15, HALO, 0.45);
    this.halo.position.set(-0.01, 0, 0);
    this.group.add(this.halo);

    const pad = disc(6.5, PINK, 0.95);
    this.group.add(pad);
    // four toes above the pad, splayed
    for (const [dx, dy] of [[-7.5, 7], [-2.6, 9.5], [2.6, 9.5], [7.5, 7]]) {
      const toe = disc(2.9, PINK, 0.95);
      // screen right is world -z, screen up is world +y (see stage.js)
      toe.position.set(0, u(dy) * scale, -u(dx) * scale);
      this.group.add(toe);
    }
    // in front of Dot so the print is never swallowed by her body
    this.group.renderOrder = 10;
    this.visible = false;
    this.group.visible = false;
    stage.scene.add(this.group);
  }

  moveTo(px, py) {
    const w = this.stage.worldFromScreen(px, py);
    this.group.position.set(w.x + 3.0, w.y, w.z);
    this.pos = { x: px, y: py };
  }

  show(px, py) {
    if (px != null) this.moveTo(px, py);
    this.visible = true;
    this.group.visible = true;
  }

  hide() { this.visible = false; this.group.visible = false; }

  /** Press feedback: the print squashes at the instant of a tap. */
  press(k) {
    const s = 1 - 0.28 * k;
    this.group.scale.set(1, s, s);
    this.halo.material.opacity = 0.45 + 0.4 * k;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
}
