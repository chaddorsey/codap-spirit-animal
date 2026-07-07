import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EmoteBubble, ZzzPuffs } from './emotes.js';
import { PointDouble } from './props.js';

const FRONT = new THREE.Vector3(1, 0, 0);   // character faces +X at rest

/**
 * The axolotl puppet. Owns the mixer, clip layering, screen-space
 * locomotion, and the procedural gaze pass. All positions in the public
 * API are SCREEN PIXELS; the stage does the mapping.
 *
 * Channel-layering contract with the clip library (02_build_clips.py):
 * body clips never key eye bones, so gaze/blink always compose cleanly.
 */
export class Axolotl {
  static async load(stage, { url = '/axolotl.glb', clipsUrl = '/clips.json' } = {}) {
    // cache-bust: stale cached glbs after asset rebuilds have repeatedly
    // masqueraded as animation bugs
    const v = `?v=${Date.now()}`;
    const [gltf, clipMeta] = await Promise.all([
      new GLTFLoader().loadAsync(url + v),
      fetch(clipsUrl + v).then(r => r.json()),
    ]);
    return new Axolotl(stage, gltf, clipMeta);
  }

  constructor(stage, gltf, clipMeta) {
    this.stage = stage;
    this.root = new THREE.Group();       // screen position + facing
    this.model = gltf.scene;
    // model origin is at mouth level; lift it so root sits at the visual
    // center and moveTo/setPosition center the character on their target
    const bbox = new THREE.Box3().setFromObject(this.model);
    this.centerY = -(bbox.min.y + bbox.max.y) / 2;
    this.model.position.y = this.centerY;
    this.root.add(this.model);
    this.bobAmp = 0;               // ambient bounce, fades out during sleep
    this.sleepSeconds = 0;
    this.nextZzzAt = 0;
    stage.scene.add(this.root);

    // enforce hemisphere continuity on quaternion tracks: the exporter may
    // canonicalize key signs (q and -q are the same rotation), and linear
    // interpolation across such a flip takes the long way around — a
    // visible ~180-degree pop mid-clip on continuous-roll animations
    for (const clip of gltf.animations) {
      for (const tr of clip.tracks) {
        if (!tr.name.endsWith('.quaternion')) continue;
        const v = tr.values;
        for (let i = 4; i < v.length; i += 4) {
          const dot = v[i] * v[i-4] + v[i+1] * v[i-3] + v[i+2] * v[i-2] + v[i+3] * v[i-1];
          if (dot < 0) { v[i] *= -1; v[i+1] *= -1; v[i+2] *= -1; v[i+3] *= -1; }
        }
      }
    }

    // The exporter bakes rest-pose tracks for EVERY bone into EVERY clip
    // (blink ships 69 tracks), which voids the channel-layering contract:
    // clips fight each other on bones they don't animate — a full-weight
    // blink momentarily drags a mid-roll tinkerbell toward rest pose, a
    // visible ~180-degree flip. Strip tracks that are constant at the bind
    // value; keep constant-but-posed tracks (e.g. sleep's closed eyes).
    for (const clip of gltf.animations) {
      clip.tracks = clip.tracks.filter(tr => {
        const stride = tr.getValueSize();
        const v = tr.values;
        for (let i = stride; i < v.length; i++) {
          if (Math.abs(v[i] - v[i % stride]) > 1e-4) return true;   // animated
        }
        const dot = tr.name.lastIndexOf('.');
        const node = this.model.getObjectByName(tr.name.slice(0, dot));
        if (!node) return false;
        const prop = tr.name.slice(dot + 1);
        if (prop === 'quaternion') {
          const d = v[0] * node.quaternion.x + v[1] * node.quaternion.y +
                    v[2] * node.quaternion.z + v[3] * node.quaternion.w;
          return Math.abs(d) < 0.9999;                // constant but not rest
        }
        const bind = (prop === 'position' ? node.position : node.scale).toArray();
        for (let i = 0; i < stride; i++) {
          if (Math.abs(v[i] - bind[i]) > 1e-3) return true;
        }
        return false;                                 // constant at rest: drop
      });
      clip.resetDuration();
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.meta = {};
    for (const m of clipMeta) this.meta[m.name] = m;
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      const loop = this.meta[clip.name]?.loop;
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
      a.clampWhenFinished = true;
      this.actions[clip.name] = a;
    }

    this.bones = {};
    for (const n of ['head', 'eye_L', 'eye_R']) {
      this.bones[n] = this.model.getObjectByName(n);
    }
    // bind-pose bookkeeping for the gaze pass
    this.model.updateMatrixWorld(true);
    for (const n of ['eye_L', 'eye_R']) {
      const b = this.bones[n];
      const qWorld = b.getWorldQuaternion(new THREE.Quaternion());
      b.userData.restLocal = b.quaternion.clone();
      b.userData.fBone = FRONT.clone().applyQuaternion(qWorld.clone().invert());
    }

    this.base = null;              // current base loop action
    this.oneShot = null;           // current one-shot action
    this.oneShotDone = null;       // resolver for play() promise
    this.gaze = null;              // {x,y} screen target or null
    this.gazeSmoothed = new THREE.Vector3();
    this.motion = null;            // {target: Vector3, speed, resolve}
    this.facing = 0;               // current yaw
    this.targetFacing = 0;
    this.clock = 0;
    this.blinkAt = 2;

    this.emotes = new EmoteBubble(this.root);
    this.zzz = new ZzzPuffs(this.root);

    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneShot && !this.holdingOneShot) this._endOneShot();
    });

    this.setBase('idle', 0);
    this.setPosition(window.innerWidth / 2, window.innerHeight / 2);
  }

  // ------------------------------------------------------------ placement
  setPosition(px, py) {
    this.root.position.copy(this.stage.worldFromScreen(px, py));
  }

  getPosition() {
    return this.stage.screenFromWorld(this.root.position);
  }

  /** Display height of the character in pixels (approx; model is ~3.7 units). */
  setPixelHeight(px) {
    this.pixelHeight = px;               // whisker halo sizes itself from this
    const s = px / (3.7 * this.stage.pixelsPerUnit);
    this.root.scale.setScalar(s);
  }

  // ------------------------------------------------------------ animation
  setBase(name, fade = 0.35) {
    const next = this.actions[name];
    if (!next || this.base === next) return;
    next.reset().fadeIn(fade).play();
    if (this.base) this.base.fadeOut(fade);
    this.base = next;
  }

  /**
   * Play a one-shot clip over/instead of the base loop.
   * hold: keep the final pose until release() is called.
   * Resolves when the clip finishes (or immediately for holds).
   */
  play(name, { fade = 0.25, hold = false } = {}) {
    const a = this.actions[name];
    if (!a) return Promise.resolve();
    if (name === 'blink') { a.reset().play(); return Promise.resolve(); }
    if (this.oneShot) this._endOneShot(0.1);
    // clips with net root displacement (e.g. tinkerbell settles at its
    // elevated bob point) are authored with the END pose as rest frame;
    // shift the screen anchor by the same offset at launch, with zero fade,
    // so takeoff is seamless and she ends parked at the new anchor
    const shift = this.meta[name]?.anchorShift;
    if (shift) {
      const s = this.root.scale.x;
      this.root.position.z -= shift[0] * s;   // std x(right) -> world -z
      this.root.position.y += shift[1] * s;
      fade = 0;
    }
    this.oneShot = a;
    this.holdingOneShot = hold;
    a.reset().fadeIn(fade).play();
    this.base?.fadeOut(fade);
    if (hold) return Promise.resolve();
    return new Promise(res => { this.oneShotDone = res; });
  }

  release(fade = 0.35) {
    if (this.oneShot) this._endOneShot(fade);
  }

  /** Cancel any in-flight motion / one-shot / hold / gaze / emote and return
   *  to the idle base. Resolves any pending moveTo/play promise. (Additive,
   *  Phase 4 — the behavior engine's cancel path.) */
  stop(fade = 0.2) {
    if (this.motion) { const m = this.motion; this.motion = null; m.resolve?.(); }
    this.targetFacing = 0;
    if (this.oneShot) this._endOneShot(fade);
    this.clearGaze();
    this.clearEmote();
    this.clearClip();          // never leave the body half-hidden (Phase 6)
    this.setBase('idle', fade);
  }

  _endOneShot(fade = 0.35) {
    this.oneShot.fadeOut(fade);
    this.oneShot = null;
    this.holdingOneShot = false;
    this.base?.reset().fadeIn(fade).play();
    this.oneShotDone?.();
    this.oneShotDone = null;
  }

  // ------------------------------------------------------------ locomotion
  /** Swim to a screen point. Resolves on arrival. */
  moveTo(px, py, { pixelsPerSecond, arrive = true } = {}) {
    // speedFactor is a felt-only mood influence set by the behavior engine
    pixelsPerSecond ??= 260 * (this.speedFactor ?? 1);
    const target = this.stage.worldFromScreen(px, py);
    const carryV = this.motion?.v ?? 0;       // chained legs keep their speed
    this.motion?.resolve?.();
    this.setBase('swim');
    return new Promise(resolve => {
      // Dot motion profile (docs/MOTION.md): attack ramp -> uniform cruise ->
      // sharp late brake; arrive:true adds the overshoot-settle ritual,
      // arrive:false carries speed through the corner for waypoint chains
      this.motion = { target, cruise: pixelsPerSecond / this.stage.pixelsPerUnit,
                      v: carryV, arrive, resolve, settle: -1, dir: null };
    });
  }

  /** Face a screen point (yaw only), or 0 to face the viewer. */
  faceToward(px) {
    const here = this.getPosition();
    this.targetFacing = Math.abs(px - here.x) < 30 ? 0
      : (px > here.x ? Math.PI / 2 : -Math.PI / 2);
  }

  /** Turn toward a screen point and point at it. Holds until release().
   *  Uses the camera-near arm and a 3/4 turn so the gesture stays visible. */
  async gestureAt(px, py) {
    const right = px > this.getPosition().x;
    this.targetFacing = (right ? 1 : -1) * Math.PI * 0.38;
    return this.play(right ? 'point_L' : 'point_R', { hold: true });
  }

  /** Turn toward a screen point and tap the "finger" on it (one-shot). */
  async tapAt(px, py) {
    const right = px > this.getPosition().x;
    this.targetFacing = (right ? 1 : -1) * Math.PI * 0.38;
    return this.play(right ? 'tap_L' : 'tap_R');
  }

  /** Spawn a visual double of a plotted point at screen (px,py) — see
   *  props.js. (Additive, Phase 5 — bat-a-point mischief.) */
  spawnDot(px, py, opts) { return new PointDouble(this.stage, px, py, opts); }

  // ------------------------------------------------------------ clipping
  // "Behind a tile" is faked with one clipping plane at the tile's edge:
  // the overlay always renders in front of the iframe, so we hide the part
  // of the body that should be occluded. (Additive, Phase 6 — terrain.)
  // Stage mapping: screen up == world +Y, screen right == world -Z.

  _clipPlane() {
    if (!this._plane) {
      this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this._clipMats = new Set();
      this.model.traverse((o) => { if (o.material) this._clipMats.add(o.material); });
      this.stage.renderer.localClippingEnabled = true;
    }
    return this._plane;
  }

  _applyClip(on) {
    this._clipPlane();
    for (const m of this._clipMats) m.clippingPlanes = on ? [this._plane] : null;
  }

  /** Hide the body below (or above) screen row `py` — the Kilroy edge. */
  clipAtScreenY(py, { keepAbove = true } = {}) {
    const wy = this.stage.worldFromScreen(0, py).y;
    const p = this._clipPlane();
    p.normal.set(0, keepAbove ? 1 : -1, 0);
    p.constant = keepAbove ? -wy : wy;
    this._applyClip(true);
  }

  /** Hide the body beyond screen column `px` — the side-peek edge. */
  clipAtScreenX(px, { keepLeft = true } = {}) {
    const wz = this.stage.worldFromScreen(px, 0).z;
    const p = this._clipPlane();
    // keepLeft: visible where screen-x < px, i.e. world z > wz
    p.normal.set(0, 0, keepLeft ? 1 : -1);
    p.constant = keepLeft ? -wz : wz;
    this._applyClip(true);
  }

  clearClip() { if (this._plane) this._applyClip(false); }

  // ------------------------------------------------------------ emotes
  /** Show '?', '!', or '?!' bobbing above the head. duration 0 = sticky. */
  emote(symbols, opts) { return this.emotes.show(symbols, opts); }
  clearEmote() { this.emotes.hide(); }

  // ------------------------------------------------------------ gaze
  lookAt(px, py) { this.gaze = { x: px, y: py }; }
  clearGaze() { this.gaze = null; }

  _gazePass(dt) {
    const k = Math.min(1, dt * 8);
    if (!this.gaze) {
      // rest: exactly the authored bind orientation — never re-aim,
      // so the eyes sit precisely as modeled
      for (const n of ['eye_L', 'eye_R']) {
        const b = this.bones[n];
        b?.quaternion.slerp(b.userData.restLocal, k);
      }
      return;
    }
    // one shared, parallel rotation for both eyes (from the head center,
    // not per-eye) so the pupils always stay aligned with each other
    const want = this.stage.worldFromScreen(this.gaze.x, this.gaze.y).setX(10);
    this.gazeSmoothed.lerp(want, k);
    const headPos = this.bones.head.getWorldPosition(new THREE.Vector3());
    const dir = this.gazeSmoothed.clone().sub(headPos).normalize();
    const q = new THREE.Quaternion();
    for (const n of ['eye_L', 'eye_R']) {
      const b = this.bones[n];
      if (!b) continue;
      b.parent.getWorldQuaternion(q);
      const base = q.clone().multiply(b.userData.restLocal);
      const fw = b.userData.fBone.clone().applyQuaternion(base);
      const delta = new THREE.Quaternion().setFromUnitVectors(fw, dir);
      const clamped = new THREE.Quaternion().rotateTowards(delta, 0.45);
      b.quaternion.copy(q.clone().invert().multiply(clamped).multiply(base));
    }
  }

  // ------------------------------------------------------------ frame tick
  update(dt) {
    this.clock += dt;
    this.mixer.update(dt);

    // locomotion
    if (this.motion) {
      const m = this.motion;
      if (m.settle >= 0) {
        // arrival ritual: small overshoot past the target, ease back, done
        m.settle += dt;
        const s = m.settle;
        const ov = 0.16 * Math.sin(Math.min(1, s / 0.28) * Math.PI) * Math.max(0, 1 - s / 0.45);
        this.root.position.copy(m.target).addScaledVector(m.dir, ov);
        if (s >= 0.45) {
          this.root.position.copy(m.target);
          const done = m.resolve; this.motion = null;
          this.targetFacing = 0;
          this.setBase('idle');
          done();
        }
      } else {
        const delta = m.target.clone().sub(this.root.position);
        const dist = delta.length();
        // attack fast, cruise uniform, brake sharply near the target
        const brakeDist = m.arrive ? m.cruise * 0.24 : 0;
        const want = dist < brakeDist
          ? Math.max(0.18 * m.cruise, m.cruise * (dist / brakeDist) ** 1.5)
          : m.cruise;
        m.v += (want - m.v) * Math.min(1, dt * (want > m.v ? 10 : 16));
        const step = m.v * dt;
        const screenTarget = this.stage.screenFromWorld(m.target);
        this.faceToward(screenTarget.x);
        if (dist <= Math.max(step, 0.02)) {
          m.dir = dist > 1e-5 ? delta.normalize() : new THREE.Vector3(0, 0, -1);
          if (m.arrive) {
            m.settle = 0;                      // begin the overshoot-settle
          } else {
            this.root.position.copy(m.target); // chained leg: keep speed, go
            const done = m.resolve; this.motion = null;
            done();
          }
        } else {
          delta.normalize();
          m.dir = delta;
          this.root.position.addScaledVector(delta, step);
          this.root.position.y += Math.sin(this.clock * 5) * 0.012; // swim bob
        }
      }
    }

    // facing (eased yaw)
    this.facing += (this.targetFacing - this.facing) * Math.min(1, dt * 6);
    this.root.rotation.y = this.facing;

    // blink scheduling (never during sleep)
    if (this.clock > this.blinkAt) {
      if (this.base !== this.actions.sleep) this.play('blink');
      this.blinkAt = this.clock + 1.8 + Math.random() * 3.5;
    }

    // ambient bounce whenever awake; stills into sleep
    const asleep = this.base === this.actions.sleep;
    this.bobAmp += ((asleep ? 0 : 0.05) - this.bobAmp) * Math.min(1, dt * 1.5);
    this.model.position.y = this.centerY + Math.sin(this.clock * 2.1) * this.bobAmp;

    // occasional rising Zzz's once the doze has settled in
    this.sleepSeconds = asleep ? this.sleepSeconds + dt : 0;
    if (asleep && this.sleepSeconds > 8 && this.clock > this.nextZzzAt) {
      this.zzz.spawn();
      this.nextZzzAt = this.clock + 4.5 + Math.random() * 3;
    }
    this.zzz.update(dt, this.facing);

    this.emotes.update(dt, this.facing);
    this._gazePass(dt);
  }
}
