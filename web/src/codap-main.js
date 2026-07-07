import { Stage } from './stage.js';
import { Axolotl } from './character.js';
import { CodapBridge } from './codap-bridge.js';
import { BehaviorEngine } from './behavior-engine.js';
import { makeBehaviors, MIND } from './behaviors.js';
import { Whisker } from './whisker.js';
import { analyzeDataset, suggestMoves } from './insight.js';

const stage = new Stage(document.getElementById('stage'));
const axo = await Axolotl.load(stage);
axo.setPixelHeight(150);
axo.setPosition(window.innerWidth - 220, window.innerHeight - 160);

const bridge = new CodapBridge(document.getElementById('codap'));

// ------------------------------------------------------------- panel
const $ = (s) => document.querySelector(s);
const log = $('#log');

function logLine(text, cls = '') {
  const div = document.createElement('div');
  div.textContent = text;
  if (cls) div.style.color = cls;
  log.appendChild(div);
  while (log.childElementCount > 200) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------- engine
const engine = new BehaviorEngine(axo, bridge, makeBehaviors(),
  { log: (t) => logLine(t, '#7048e8') });
window.__axo = axo; window.__bridge = bridge; window.__engine = engine; // debug access

// Dot's personal-space sense: the cursor brushing the whisker halo fires a
// mouse:near event; the yield-to-mouse behavior scoots sweetly aside
const whisker = new Whisker(axo, (x, y) => engine.simulate('mouse:near', { x, y }));
window.__whisker = whisker;

$('#panelToggle').onclick = () => $('#panel').classList.toggle('collapsed');
$('#behaviors').onclick = (e) => {
  engine.enabled = !engine.enabled;
  e.currentTarget.innerHTML = `behaviors: <b>${engine.enabled ? 'on' : 'off'}</b>`;
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

// component list -> visit buttons (debug utility, drives the actor directly)
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
bridge.addEventListener('component:create', () => setTimeout(refreshComponents, 1500));
bridge.addEventListener('component:delete', () => refreshComponents());

// ------------------------------------------------------------- behaviors debug
// force-fire buttons
for (const b of engine.behaviors) {
  const btn = document.createElement('button');
  btn.textContent = b.id;
  btn.onclick = () => engine.forceFire(b.id);
  $('#forcefire').appendChild(btn);
}

// synthetic-event injection: every behavior is testable without CODAP
const simBounds = () => ({
  x: window.innerWidth * 0.22, y: window.innerHeight * 0.28, w: 340, h: 240,
});
const newestGraphId = () =>
  [...engine.state.components.values()].filter(c => /graph/i.test(c.type)).at(-1)?.id;
const sims = {
  'create-graph': () => engine.simulate('component:create',
    { type: 'graph', title: 'sim graph', bounds: simBounds() }),
  'create-table': () => engine.simulate('component:create',
    { type: 'caseTable', title: 'sim table', bounds: simBounds() }),
  'attr-change': () => {
    const id = newestGraphId();
    if (id == null) return logLine('no graph known — simulate create-graph first', '#c92a2a');
    engine.simulate('component:attributeChange', { id, type: 'graph' });
  },
  'selection': () => engine.simulate('selection', { context: 'sim', count: 3 }),
  'selection-big': () => engine.simulate('selection', { context: 'sim', count: 12 }),
  'cases-change': () => engine.simulate('cases:change', { context: 'sim', operation: 'createCases' }),
  'dm-group': () => engine.simulate('datamove',
    { move: 'grouping', kind: 'legend', detail: { attribute: 'simAttr' } }),
  'dm-filter': () => engine.simulate('datamove',
    { move: 'filtering', kind: 'out', detail: { numberHidden: 3 } }),
  'dm-formula': () => engine.simulate('datamove',
    { move: 'summarizing', kind: 'formula', detail: { formula: 'mean(x)' } }),
  'dm-hierarchy': () => engine.simulate('datamove',
    { move: 'hierarchy', kind: 'collection', detail: {} }),
  'drag-seq': async () => {
    engine.simulate('drag', { phase: 'dragstart', attribute: 'simAttr' });
    await new Promise(r => setTimeout(r, 600));
    engine.simulate('drag', { phase: 'drop', attribute: 'simAttr' });
  },
  'age-120s': () => { engine.debugAgeComponents(120); logLine('components aged +120s', '#0b7285'); },
  'idle-90s': () => { engine.debugIdle(90); logLine('idle clock advanced +90s', '#0b7285'); },
  'selftest': async () => {
    const r = await engine.selfTest();
    logLine(`selfTest ${r.pass ? 'PASS' : 'FAIL'} ${r.passed}/${r.total}`, r.pass ? '#0b7285' : '#c92a2a');
  },
};
document.querySelectorAll('[data-sim]').forEach(b => { b.onclick = sims[b.dataset.sim]; });

// ------------------------------------------------------------- Dot's mind
// Full reasoning exposed: Phase 7 (data-move reactions) in blue, Phase 8
// (insight-driven suggestions, with live rationale) in dark red.
const MIND_COLORS = { 7: '#1c63d6', 8: '#8b1a1a' };
engine.onFire = (b, event, escalated) => {
  const m = MIND[b.id];
  const div = document.createElement('div');
  const desc = m?.describe?.(event, engine.state) ?? '(no description)';
  div.textContent = `▶ ${b.id}${escalated ? ' ESC' : ''} — ${desc}`;
  div.style.color = MIND_COLORS[m?.phase] ?? '#555';
  const box = $('#mindLog');
  box.appendChild(div);
  while (box.childElementCount > 60) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
};

async function refreshInsight() {
  try {
    const analysis = await analyzeDataset(bridge);
    if (!analysis) { $('#mindAnalysis').textContent = 'no populated dataset yet'; return; }
    const suggestions = suggestMoves(analysis, engine.state.dataMoves);
    engine.state.insight = { ...analysis, suggestions };
    const a = analysis;
    $('#mindAnalysis').textContent =
      `${a.context}: ${a.caseCount} cases, ${a.attrs.length} attrs `
      + `(${a.attrs.map(x => `${x.name}:${x.kind === 'numeric' ? 'num' : `cat×${x.cardinality}`}`).join(', ')})\n`
      + `outliers: ${a.outliers.length ? a.outliers.map(o => `${o.attr}=${o.value} (z=${o.z})`).join('; ') : 'none'}\n`
      + `correlations: ${a.correlations.length ? a.correlations.map(c => `${c.a}×${c.b} r=${c.r}`).join('; ') : 'n/a'}\n`
      + `hierarchical: ${a.isHierarchical ? 'yes' : 'no (flat)'}`;
    $('#mindSuggest').textContent = suggestions.length
      ? suggestions.slice(0, 4).map((s, i) =>
          `${i + 1}. [${s.move}] (score ${s.score.toFixed(2)}) ${s.rationale}`).join('\n')
      : 'nothing tempting right now';
  } catch (err) { $('#mindAnalysis').textContent = `analysis failed: ${err.message}`; }
}
$('#analyzeNow').onclick = refreshInsight;
bridge.addEventListener('connected', () => setTimeout(refreshInsight, 3000));
let insightTimer;
bridge.addEventListener('datamove', () => {   // moves change the affordances
  clearTimeout(insightTimer);
  insightTimer = setTimeout(refreshInsight, 2500);
});

// mood debug: crank one dial high (others untouched) to provoke gated squibs
document.querySelectorAll('[data-mood]').forEach(b => {
  b.onclick = () => {
    engine.state.mood[b.dataset.mood] = 0.95;
    logLine(`mood: ${b.dataset.mood} -> 0.95`, '#0b7285');
  };
});

// character clip test buttons (bypass the engine; loops toggle back to idle)
document.querySelector('#dozeCycle').onclick = () => axo.doze();
document.querySelectorAll('[data-clip]').forEach(b => {
  b.onclick = () => {
    const name = b.dataset.clip;
    if (axo.meta[name]?.loop) {
      axo.setBase(axo.base === axo.actions[name] ? 'idle' : name);
    } else {
      axo.play(name);
    }
  };
});

// live state readout
setInterval(() => {
  const s = engine.state;
  const a = s.active;
  const m = s.mood;
  const lines = [
    `components ${s.components.size}   idle ${s.idleSeconds.toFixed(0)}s   ` +
    `active ${a ? a.id + (a.escalated ? ' ESC' : '') : '—'}`,
    `mood  play ${m.playful.toFixed(2)}  curi ${m.curious.toFixed(2)}  ` +
    `slpy ${m.sleepy.toFixed(2)}  misc ${m.mischievous.toFixed(2)}  ` +
    `spd ×${(axo.speedFactor ?? 1).toFixed(2)}`,
  ];
  for (const d of engine.debugInfo()) {
    lines.push(`${d.id.padEnd(21)} p${String(d.priority).padStart(2)} ` +
      `cd ${String(Math.ceil(d.cooldownRemaining)).padStart(3)}s ` +
      `fires ${d.fires} ign ${d.ignored}${d.escalateAfter ? '/' + d.escalateAfter : ''}`);
  }
  $('#bstate').textContent = lines.join('\n');
}, 500);

// ------------------------------------------------------------- loop
const clock = { last: performance.now() };
stage.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - clock.last) / 1000);
  clock.last = now;
  axo.update(dt);
  engine.tick(dt);
  whisker.enabled = engine.enabled;
  whisker.update();
  stage.render();
});

logLine('wrapper loaded — waiting for CODAP…');
