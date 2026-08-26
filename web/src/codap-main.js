import { Stage } from './stage.js';
import { Axolotl } from './character.js';
import { CodapBridge } from './codap-bridge.js';
import { BehaviorEngine } from './behavior-engine.js';
import { makeBehaviors, MIND } from './behaviors.js';
import { Whisker } from './whisker.js';
import { analyzeDataset, suggestMoves } from './insight.js';
import { Injector, sameOrigin } from './inject.js';
import { DemoDriver } from './demo/demo-driver.js';
import { P1_DEMOS } from './demo/demos-p1.js';
import { ensureMammals, DEMO_CSV } from './demo/fixture.js';
import { parse, toLines, coerce } from './demo/demo-lang.js';
import { ShowMeBridge } from './demo/showme-bridge.js';

// Phase 9 P3: `?tutorial=N` loads our rewritten copy of that tutorial's
// document — the one whose embedded plugin URL points at the fork — through
// the mechanism P0 verified: `#file=<ABSOLUTE url>` on the CODAP iframe.
// (`examples:` only resolves against CODAP's own registry and cannot reach
// our copies.) Set before the bridge is constructed so it binds the right src.
const TUTORIAL = new URLSearchParams(location.search).get('tutorial');
const TUTORIAL_DOCS = { 1: '/tutorial-docs/get_started_dot.codap' };
{
  const el = document.getElementById('codap');
  // codap.html is the cross-origin page and names its own CODAP; the
  // same-origin pages leave the attribute off entirely (see the HTML).
  const base = el.dataset.codapSrc ?? '/codap/?embeddedServer=yes';
  el.src = TUTORIAL && TUTORIAL_DOCS[TUTORIAL]
    ? `${base}#file=${location.origin}${TUTORIAL_DOCS[TUTORIAL]}`
    : base;
}

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

// ------------------------------------------------------- Phase 9: Show me
// Live demonstrations need to reach INTO CODAP, which only works when the
// iframe is same-origin (codap-same.html via the vite proxy). On the
// cross-origin page (codap.html) everything below simply stays absent and the
// wrapper behaves exactly as it did before.
let demo = null;
function setupDemo() {
  const iframe = document.getElementById('codap');
  if (demo || !sameOrigin(iframe)) return;
  const inj = new Injector(iframe.contentWindow, {
    isAborted: () => !!demo?.driver?.aborted,
  });
  const driver = new DemoDriver({ axo, stage, bridge, inj, iframe,
    log: (t) => logLine(`demo: ${t}`, '#1c63d6') });

  const api = (a, r, v, o) => driver.api(a, r, v, o);
  // In a real tutorial document the `Drag` task is about the tutorial's OWN
  // csv, so that is what Dot carries in; the standalone Mammals fixture is
  // only for the debug page, where no tutorial plugin is present.
  driver.csvPayload = TUTORIAL
    ? { url: `${location.origin}/tutorial-plugins/onboarding/resources/mammals.csv`,
        title: 'Mammals' }
    : DEMO_CSV;

  // --- the demo runs as a BEHAVIOR, so the engine arbitrates it -----------
  // `ignoreActivity: true` is not optional: without it the engine cancels the
  // demo 0.35 s after its own injected action echoes back as bridge activity.
  // Priority 90 also means `startle` (65, preempts) cannot displace it, which
  // matters because an undo burst during revert looks exactly like a student
  // deleting components.
  let pendingDemo = null;
  engine.add({
    id: 'dot-demo',
    priority: 90,
    ignoreActivity: true,
    cooldownSec: 0,
    trigger: () => false,                  // only ever force-fired
    run: async () => {
      const job = pendingDemo;
      pendingDemo = null;
      if (!job) return;
      try { job.resolve(await driver.runScript(job.script, job.opts)); }
      catch (err) { job.reject(err); }
    },
    onCancel: () => driver.abort('engine cancelled the demo'),
  });

  /**
   * Everything funnels through here so only one demo can ever be in flight —
   * and so that checklist SUPPRESSION is turned on for every demo regardless
   * of what started it (a "Show me." link, a debug button, the console, a
   * test). Suppression belongs to the demo, not to the trigger: without this
   * the plugin cheerfully checked a task off while Dot was demonstrating it.
   */
  function runViaEngine(script, opts) {
    if (driver.active || pendingDemo) {
      return Promise.reject(Object.assign(new Error('a demo is already running'),
        { code: 'dot-demo-busy' }));
    }
    const key = script?.demo ?? 'demo';
    return new Promise((resolve, reject) => {
      pendingDemo = {
        script,
        opts,
        resolve: async (r) => { await demo.showme?.demoEnded(key, true); resolve(r); },
        reject: async (e) => { await demo.showme?.demoEnded(key, false, e); reject(e); },
      };
      demo.showme?.demoStarted(key);
      engine.forceFire('dot-demo');
    });
  }

  // --- the script library ------------------------------------------------
  const scripts = new Map();               // "tutorial1:MakeGraph" -> script
  const sources = new Map();               // "tutorial1" -> the raw file text
  async function loadScripts(set = 'tutorial1') {
    const text = await fetch(`/demo-scripts/${set}.demo`).then((r) => {
      if (!r.ok) throw new Error(`no script file for "${set}" (${r.status})`);
      return r.text();
    });
    sources.set(set, text);
    for (const s of parse(text)) scripts.set(`${set}:${s.demo}`, s);
    logLine(`demo scripts loaded: ${set} (${parse(text).length})`, '#1c63d6');
    return text;
  }

  demo = {
    driver, inj, scripts, sources, loadScripts,
    /** window.__demo.run('tutorial1', 'MakeGraph') */
    run: async (set, name, opts) => {
      // P1 compatibility: run('MakeGraph') still drives the hard-coded pair
      if (name === undefined && P1_DEMOS[set]) {
        const wasEnabled = engine.enabled;
        engine.enabled = false;
        demo.showme?.demoStarted(set);           // suppress here too — see above
        try {
          const r = await P1_DEMOS[set](driver, opts);
          await demo.showme?.demoEnded(set, true);
          return r;
        } catch (err) {
          await demo.showme?.demoEnded(set, false, err);
          throw err;
        } finally { engine.enabled = wasEnabled; }
      }
      if (!scripts.size) await loadScripts(set);
      const key = `${set}:${name}`;
      const script = scripts.get(key);
      if (!script) {
        throw new Error(`no script "${key}" (have ${[...scripts.keys()].join(', ')})`);
      }
      try {
        const r = await runViaEngine(script, opts);
        logLine(`demo ${key}: ok in ${r.sec}s; sync max ${r.sync?.max}px; `
          + `revert ${r.revert?.clicks} click(s), residue `
          + `${r.revert?.residue?.length ?? '?'}`, '#0b7285');
        return r;
      } catch (err) {
        logLine(`demo ${key} FAILED: ${err.message}`, '#c92a2a');
        throw err;
      }
    },
    /** Run a script written right now, as line notation or as JSON. */
    runScript: (text, opts) => runViaEngine(coerce(text), opts),
    /** Validate without running — parse errors carry line numbers. */
    check: (text) => coerce(text),
    toLines,
    parse,
    cancel: (why = 'cancelled by caller') => {
      driver.abort(why);
      engine.cancelActive(why);
    },
    fixture: (opts) => ensureMammals(api, opts),
    snapshot: () => driver.snapshot(),
    sync: () => driver.syncReport(),
    api,
  };
  // --- the "Show me." handoff -------------------------------------------
  // A forked tutorial plugin handshakes with us and hands its Show me. clicks
  // over; anything that fails comes straight back as dot-demo-error and the
  // plugin plays its canned MP4, so the student is never worse off than today.
  const showme = new ShowMeBridge({
    runDemo: (tutorial, key) => {
      if (demo.failNextDemo) {            // P3 test hook: force the MP4 path
        demo.failNextDemo = false;
        return Promise.reject(new Error('forced driver failure (test hook)'));
      }
      return demo.run(`tutorial${tutorial}`, key);
    },
    isBusy: () => driver.active || !!pendingDemo,
    snapshot: () => driver.snapshot(),
    log: (t) => logLine(`showme: ${t}`, '#1c63d6'),
  });
  showme.start();
  demo.showme = showme;

  window.__demo = demo;
  window.__inj = inj;
  logLine('same-origin CODAP — window.__demo available', '#1c63d6');
}
// The iframe is usually still loading at module-eval time, so try again once
// CODAP announces itself (and once more on a timer for a cold cache).
bridge.addEventListener('connected', () => setTimeout(setupDemo, 300));
setupDemo();
setTimeout(setupDemo, 4000);

// Debug buttons exist only on the same-origin page; wire them if present.
document.querySelector('#demoFixture')?.addEventListener('click',
  () => demo?.fixture({ force: false }).then((id) => logLine(`fixture ready (table ${id})`, '#0b7285')));
for (const b of document.querySelectorAll('[data-demo]')) {
  b.onclick = () => {
    const [set, name] = b.dataset.demo.split(':');
    demo?.run(set, name).catch(() => {});
  };
}

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
  // AFTER axo.update so the skeleton is current this frame: the driver reads
  // the paw's world position and places the body from it (P1).
  demo?.driver.tick(dt);
  engine.tick(dt);
  whisker.enabled = engine.enabled;
  whisker.update();
  stage.render();
});

logLine('wrapper loaded — waiting for CODAP…');
