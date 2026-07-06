import { Stage } from './stage.js';
import { Axolotl } from './character.js';
import { CodapBridge } from './codap-bridge.js';

const stage = new Stage(document.getElementById('stage'));
const axo = await Axolotl.load(stage);
axo.setPixelHeight(150);
axo.setPosition(window.innerWidth - 220, window.innerHeight - 160);

const bridge = new CodapBridge(document.getElementById('codap'));
window.__axo = axo; window.__bridge = bridge;   // debug access

// ------------------------------------------------------------- panel
const $ = (s) => document.querySelector(s);
const log = $('#log');
let behaviorsOn = true;

function logLine(text, cls = '') {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.style.color = cls;
  log.appendChild(div);
  while (log.childElementCount > 200) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

$('#panelToggle').onclick = () => $('#panel').classList.toggle('collapsed');
$('#behaviors').onclick = (e) => {
  behaviorsOn = !behaviorsOn;
  e.currentTarget.innerHTML = `behaviors: <b>${behaviorsOn ? 'on' : 'off'}</b>`;
};

const calv = $('#calv');
const showCal = () => calv.textContent =
  `x ${bridge.calibration.x}, y ${bridge.calibration.y}, s ${bridge.calibration.scale.toFixed(2)}`;
document.querySelectorAll('[data-cal]').forEach(b => {
  b.onclick = () => {
    const [dx, dy] = b.dataset.cal.split(',').map(Number);
    bridge.calibration.x += dx; bridge.calibration.y += dy;
    bridge.saveCalibration(); showCal();
  };
});
document.querySelectorAll('[data-scale]').forEach(b => {
  b.onclick = () => {
    bridge.calibration.scale = Math.max(0.2,
      Math.round((bridge.calibration.scale + Number(b.dataset.scale)) * 100) / 100);
    bridge.saveCalibration(); showCal();
  };
});
showCal();

// component list -> visit buttons
async function refreshComponents() {
  const comps = await bridge.components();
  const box = $('#components');
  box.innerHTML = comps.length ? '' : '<i>none yet</i>';
  for (const c of comps) {
    const b = document.createElement('button');
    b.textContent = `${c.type}: ${c.title}`.slice(0, 28);
    b.onclick = async () => {
      if (!c.bounds) return;
      const { x, y, w, h } = c.bounds;
      logLine(`visiting ${c.title} @ ${Math.round(x)},${Math.round(y)} ${w}x${h}`, '#0b7285');
      await axo.moveTo(x + w + 60, y + h / 2);
      axo.lookAt(x + w / 2, y + h / 2);
      await axo.gestureAt(x + w / 2, y + h / 2);
      setTimeout(() => { axo.release(); axo.clearGaze(); }, 1600);
    };
    box.appendChild(b);
  }
  return comps;
}
$('#refresh').onclick = refreshComponents;

// ------------------------------------------------------------- reactions
// spike-level behaviors; the Phase 4 engine replaces this switchboard
let idleTimer;
function bumpIdle() {
  clearTimeout(idleTimer);
  if (axo.base === axo.actions.sleep) { axo.setBase('idle'); axo.emote('!'); }
  idleTimer = setTimeout(() => axo.setBase('sleep'), 90_000);
}
bumpIdle();

bridge.addEventListener('connected', () => {
  $('#conn').textContent = 'connected';
  $('#conn').classList.add('ok');
  logLine('CODAP present — phone connected', '#0b7285');
  axo.emote('!');
  axo.play('wave');
  setTimeout(refreshComponents, 1500);
});

bridge.addEventListener('raw', (e) => {
  const { resource, values } = e.detail ?? {};
  logLine(`${resource ?? '?'} ${values?.operation ?? ''}`);
});

bridge.addEventListener('component:create', async (e) => {
  bumpIdle();
  if (!behaviorsOn) return;
  logLine(`component created: ${e.detail.type}`, '#b4530a');
  axo.emote('!');
  await axo.play('hop');
  // the new tile may not be queryable the instant the notification fires,
  // and the notification may omit the id — retry briefly, fall back to
  // the most recently listed component
  // componentList can lag several seconds behind the create notification
  let c;
  for (let i = 0; i < 10 && !c?.bounds; i++) {
    if (i) await new Promise(r => setTimeout(r, 600));
    const comps = await refreshComponents();
    c = comps.find(k => k.id === e.detail.id) ?? comps.at(-1);
  }
  if (c?.bounds) {
    logLine(`greeting new ${c.type} @ ${Math.round(c.bounds.x)},${Math.round(c.bounds.y)}`, '#0b7285');
    await axo.moveTo(c.bounds.x + c.bounds.w + 55, c.bounds.y + c.bounds.h / 2);
    axo.lookAt(c.bounds.x + c.bounds.w / 2, c.bounds.y + c.bounds.h / 2);
    await axo.play('curious');
    axo.clearGaze();
  } else {
    logLine('new component has no geometry yet', '#b4530a');
  }
});

bridge.addEventListener('component:move', () => { bumpIdle(); refreshComponents(); });
bridge.addEventListener('component:resize', () => { bumpIdle(); refreshComponents(); });
bridge.addEventListener('component:delete', () => { bumpIdle(); refreshComponents(); });

bridge.addEventListener('selection', async (e) => {
  bumpIdle();
  if (!behaviorsOn) return;
  logLine(`selection: ${e.detail.count ?? '?'} cases in ${e.detail.context}`, '#b4530a');
  axo.emote('?');
  await axo.play('curious');
});

bridge.addEventListener('drag', async (e) => {
  bumpIdle();
  if (!behaviorsOn) return;
  const { phase, position } = e.detail;
  if (phase === 'dragstart') axo.emote('?');
  if (phase === 'drag' && position) {
    const r = bridge.iframe.getBoundingClientRect();
    axo.lookAt(r.left + position.x, r.top + position.y);
  }
  if (phase === 'drop') { axo.clearGaze(); axo.emote('!'); await axo.play('celebrate'); }
  if (phase === 'dragend') axo.clearGaze();
});

bridge.addEventListener('cases:change', (e) => {
  bumpIdle();
  logLine(`cases: ${e.detail.operation} (${e.detail.context})`);
});

// ------------------------------------------------------------- loop
const clock = { last: performance.now() };
stage.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - clock.last) / 1000);
  clock.last = now;
  axo.update(dt);
  stage.render();
});

logLine('wrapper loaded — waiting for CODAP…');
