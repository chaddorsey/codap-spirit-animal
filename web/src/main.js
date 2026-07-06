import { Stage } from './stage.js';
import { Axolotl } from './character.js';

const stage = new Stage(document.getElementById('stage'));
const axo = await Axolotl.load(stage);
axo.setPixelHeight(170);

// debug access for automation
window.__stage = stage;
window.__axo = axo;

// ------------------------------------------------------------- test panel
const $ = (sel) => document.querySelector(sel);
const status = $('#status');
const modes = { clickToSwim: true, followCursor: false };

function note(msg) { status.textContent = msg; }

// clip buttons
const clipBar = $('#clips');
for (const name of Object.keys(axo.actions)) {
  if (name === 'blink') continue;
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = async () => {
    if (axo.meta[name]?.loop) { axo.setBase(name); note(`base loop: ${name}`); }
    else if (name === 'point' || name === 'droop') {
      await axo.play(name, { hold: true });
      note(`${name} (holding — press "release")`);
    } else { note(`playing: ${name}`); await axo.play(name); note('idle'); }
  };
  clipBar.appendChild(b);
}

$('#release').onclick = () => { axo.release(); axo.setBase('idle'); note('released'); };
document.querySelectorAll('[data-emote]').forEach(b => {
  b.onclick = () => { axo.emote(b.dataset.emote); note(`emote: ${b.dataset.emote}`); };
});
$('#emoteSticky').onclick = () => { axo.emote('?', { duration: 0 }); note('sticky ? (press hide)'); };
$('#emoteHide').onclick = () => { axo.clearEmote(); note('emote hidden'); };
$('#clickswim').onchange = (e) => { modes.clickToSwim = e.target.checked; };
$('#cursor').onchange = (e) => {
  modes.followCursor = e.target.checked;
  if (!modes.followCursor) axo.clearGaze();
};

// click anywhere (not on UI) -> swim there
document.addEventListener('click', async (e) => {
  if (!modes.clickToSwim) return;
  if (e.target instanceof Element &&
      (e.target.closest('#panel') || e.target.closest('#tile'))) return;
  note(`swimming to ${e.clientX},${e.clientY}`);
  await axo.moveTo(e.clientX, e.clientY);
  note('arrived — idle');
});

document.addEventListener('pointermove', (e) => {
  if (modes.followCursor) axo.lookAt(e.clientX, e.clientY);
});

// ------------------------------------------------------------- fake tile
// stand-in for a CODAP component until the Phase 3 bridge provides real ones
const tile = $('#tile');
let drag = null;
tile.addEventListener('pointerdown', (e) => {
  drag = { dx: e.clientX - tile.offsetLeft, dy: e.clientY - tile.offsetTop };
  tile.setPointerCapture(e.pointerId);
});
tile.addEventListener('pointermove', (e) => {
  if (!drag) return;
  tile.style.left = `${e.clientX - drag.dx}px`;
  tile.style.top = `${e.clientY - drag.dy}px`;
});
tile.addEventListener('pointerup', () => { drag = null; });

const tileCenter = () => {
  const r = tile.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

$('#goTile').onclick = async () => {
  const c = tileCenter();
  note('swimming to tile…');
  await axo.moveTo(c.x + 130, c.y);   // sidle up beside it
  note('at tile');
};
$('#pointTile').onclick = async () => {
  const c = tileCenter();
  axo.lookAt(c.x, c.y);
  await axo.gestureAt(c.x, c.y);
  note('pointing at tile (press "release")');
};
$('#lookTile').onclick = () => {
  const c = tileCenter();
  axo.lookAt(c.x, c.y);
  note('gazing at tile');
};

note('ready — click anywhere to make the axolotl swim there');

const clock = { last: performance.now() };
stage.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - clock.last) / 1000);
  clock.last = now;
  axo.update(dt);
  stage.render();
});
