import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
let fontPromise;
const loadFont = () =>
  (fontPromise ??= new FontLoader().loadAsync('/fonts/helvetiker_bold.typeface.json'));

const COLORS = {
  '?': { color: 0x2fa8d5, emissive: 0x0e5d7a },   // curious teal
  '!': { color: 0xff7a59, emissive: 0x8f2e14 },   // urgent coral
};

/**
 * Floating 3D punctuation above the character's head: '?', '!', or '?!'.
 * Lives inside the character's root group so it follows position/scale;
 * counter-rotates against body yaw so it always faces the viewer.
 */
export class EmoteBubble {
  constructor(parentGroup, { height = 2.7 } = {}) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.baseHeight = height;
    parentGroup.add(this.group);
    this.time = 0;
    this.pop = 0;          // 0..1 pop-in progress
    this.ttl = 0;          // remaining seconds; Infinity = sticky
  }

  async show(symbols = '?', { duration = 2.5 } = {}) {
    const font = await loadFont();
    this.group.clear();
    const chars = [...symbols].filter(c => COLORS[c]);
    const spacing = 1.0;
    chars.forEach((ch, i) => {
      const geo = new TextGeometry(ch, {
        font, size: 1.0, depth: 0.24, curveSegments: 10,
        bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 3,
      });
      geo.center();
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS[ch].color, emissive: COLORS[ch].emissive,
        emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // screen-horizontal is world -Z on this stage (camera looks down -X)
      mesh.position.z = -(i - (chars.length - 1) / 2) * spacing;
      // face the ortho camera on +X: rotate glyph plane from XY into ZY
      mesh.rotation.y = Math.PI / 2;
      this.group.add(mesh);
    });
    this.group.visible = true;
    this.pop = 0;
    this.ttl = duration > 0 ? duration : Infinity;
  }

  hide() { this.ttl = Math.min(this.ttl, 0.25); }

  update(dt, facingYaw) {
    if (!this.group.visible) return;
    this.time += dt;
    if ((this.ttl -= dt) <= 0) { this.group.visible = false; return; }
    // pop-in with a little overshoot, shrink-out at the end
    this.pop = Math.min(1, this.pop + dt * 5);
    const over = 1 + 0.25 * Math.sin(Math.min(this.pop, 1) * Math.PI);
    const out = Math.min(1, this.ttl / 0.25);
    this.group.scale.setScalar(this.pop * over * out);
    // bob + sway, and counter-rotate so it faces the viewer
    this.group.position.y = this.baseHeight + Math.sin(this.time * 3) * 0.14;
    this.group.rotation.y = -facingYaw + Math.sin(this.time * 1.6) * 0.14;
    this.group.rotation.z = Math.sin(this.time * 2.3) * 0.05;
  }
}
