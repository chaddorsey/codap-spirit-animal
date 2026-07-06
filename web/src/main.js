import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(6, 0.6, 0);
camera.lookAt(0, -0.6, 0);

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4, 3, 2);
scene.add(key);
const fill = new THREE.DirectionalLight(0xbfe8ff, 0.8);
fill.position.set(-3, 1, -2);
scene.add(fill);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const mixer = new THREE.AnimationMixer(scene);
const actions = {};
let clipMeta = {};
let current = null;

const [gltf, clips] = await Promise.all([
  new GLTFLoader().loadAsync('/axolotl.glb'),
  fetch('/clips.json').then(r => r.json()),
]);
scene.add(gltf.scene);
window.__scene = scene;           // debug access for automation
window.__camera = camera;
window.__THREE = THREE;
console.log('animations:', gltf.animations.map(a => a.name));
gltf.scene.traverse(o => { if (o.isBone) console.log('bone:', o.name); });

for (const meta of clips) clipMeta[meta.name] = meta;
for (const clip of gltf.animations) {
  const a = mixer.clipAction(clip);
  const meta = clipMeta[clip.name] ?? { loop: false };
  a.setLoop(meta.loop ? THREE.LoopRepeat : THREE.LoopOnce);
  a.clampWhenFinished = true;
  actions[clip.name] = a;
}

function play(name) {
  const next = actions[name];
  if (!next) return;
  next.reset().fadeIn(0.25).play();
  if (current && current !== next) current.fadeOut(0.25);
  current = next;
  document.querySelectorAll('#panel button').forEach(b =>
    b.classList.toggle('active', b.textContent === name));
}

// one-shots return to idle when finished
mixer.addEventListener('finished', (e) => {
  const name = e.action.getClip().name;
  if (name !== 'blink' && name !== 'idle') play('idle');
});

// blink layered over whatever else is playing (only touches eye bones)
function scheduleBlink() {
  setTimeout(() => {
    if (actions.blink && current !== actions.sleep) {
      actions.blink.reset().play();
    }
    scheduleBlink();
  }, 1800 + Math.random() * 3500);
}

const panel = document.getElementById('panel');
for (const meta of clips) {
  if (meta.name === 'blink') continue;
  const b = document.createElement('button');
  b.textContent = meta.name;
  b.onclick = () => play(meta.name);
  panel.appendChild(b);
}

play('idle');
scheduleBlink();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer.update(clock.getDelta());
  renderer.render(scene, camera);
});
