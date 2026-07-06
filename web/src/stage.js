import * as THREE from 'three';

/**
 * Full-viewport transparent overlay stage with an orthographic camera,
 * so screen pixels map linearly to world units. The camera sits on +X
 * looking at the origin (the character's front): screen right == world -Z,
 * screen up == world +Y.
 */
export class Stage {
  constructor(canvas, { pixelsPerUnit = 40 } = {}) {
    this.canvas = canvas;
    this.pixelsPerUnit = pixelsPerUnit;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(20, 0, 0);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(6, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe9ff, 0.7);
    fill.position.set(-4, 1, -3);
    this.scene.add(fill);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const halfW = w / (2 * this.pixelsPerUnit);
    const halfH = h / (2 * this.pixelsPerUnit);
    this.camera.left = -halfW; this.camera.right = halfW;
    this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /** Screen pixel -> world point on the x=0 plane. */
  worldFromScreen(px, py) {
    const w = window.innerWidth, h = window.innerHeight;
    return new THREE.Vector3(
      0,
      (h / 2 - py) / this.pixelsPerUnit,
      -(px - w / 2) / this.pixelsPerUnit,
    );
  }

  /** World point -> screen pixel. */
  screenFromWorld(v) {
    const w = window.innerWidth, h = window.innerHeight;
    return {
      x: w / 2 - v.z * this.pixelsPerUnit,
      y: h / 2 - v.y * this.pixelsPerUnit,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
