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

const DOT_GAP_EXTRA = 0.16;  // extra separation pushed between stroke and dot

/**
 * helvetiker_bold renders '?'/'!' with the dot nearly touching the downstroke
 * at our size. The stroke and the dot are disjoint shells in the extruded
 * geometry, so: partition triangles into connected components (union-find over
 * shared vertex positions), then push the lowest component — the dot — down.
 */
function separateDot(geo, extra = DOT_GAP_EXTRA) {
  const pos = geo.attributes.position;
  const n = pos.count;
  if (!n || geo.index) return;                    // TextGeometry is non-indexed
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  // merge coincident vertices (rounded position hash), then triangle corners
  const byPos = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const seen = byPos.get(key);
    if (seen === undefined) byPos.set(key, i); else union(i, seen);
  }
  for (let i = 0; i + 2 < n; i += 3) { union(i, i + 1); union(i + 1, i + 2); }
  // lowest component by min-y is the dot; require ≥2 components (plain glyphs pass through)
  const minY = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    minY.set(r, Math.min(minY.get(r) ?? Infinity, pos.getY(i)));
  }
  if (minY.size < 2) return;
  const dotRoot = [...minY.entries()].sort((a, b) => a[1] - b[1])[0][0];
  for (let i = 0; i < n; i++) {
    if (find(i) === dotRoot) pos.setY(i, pos.getY(i) - extra);
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

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
      separateDot(geo);
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
