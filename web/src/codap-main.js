import { Stage } from './stage.js';
import { Axolotl } from './character.js';
import { CodapBridge } from './codap-bridge.js';
import { BehaviorEngine } from './behavior-engine.js';
import { makeBehaviors, MIND } from './behaviors.js';
import { Whisker } from './whisker.js';
import { analyzeDataset, suggestMoves } from './insight.js';
import { preloadEmoteFont } from './emotes.js';
import { Injector, sameOrigin } from './inject.js';
import { DemoDriver } from './demo/demo-driver.js';
import { installTracer } from './demo/trace-input.js';
import { installRecorder } from './demo/record-drag.js';
import { installDragDomWatcher } from './demo/watch-drag-dom.js';
import { installDashboardBadge } from './ui/dot-badge.js';
import { createWonderingsPanel } from './ui/wonderings-panel.js';
import { createSceneModel, isDriverSuspended } from './scene-model.js';
import {
  buildDatasetModel, governorReducer, initialGovernorState, intervalSeconds,
  nextWondering, PARTIAL_FRAMING_LABEL,
} from './wonderings/index.js';
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
const TUTORIAL_DOCS = {
  1: '/tutorial-docs/get_started_dot.codap',
  2: '/tutorial-docs/get_started_2_dot.codap',
};
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

preloadEmoteFont();          // never pay for it inside a demo's first `say`

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

// Dot's Dashboard collapses to her head, parked in CODAP's toolbar just left of
// Help. It starts closed: the Dashboard is a developer affordance and the demo
// is the point of the page, so the default view is CODAP with Dot in it and
// nothing else. The panel's own header still toggles it, for anyone who has it
// open already.
const dashBadge = installDashboardBadge($('#panel'),
  { frame: document.getElementById('codap') });
$('#panelToggle').onclick = () => dashBadge.toggle();
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
  dashBadge.setConnected(true);      // badge goes solid — see ui/dot-badge.js
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
/**
 * `about:blank` IS same-origin, so `sameOrigin()` alone is not a readiness
 * check — it says yes to the placeholder document every iframe holds before its
 * real one arrives. `setupDemo()` runs at module-eval, and CONFIRMED ON CHAD'S
 * MACHINE 2026-08-27 (`__demo.inj.staleDoc === true`) it could win that race and
 * build the whole demo stack against the placeholder.
 *
 * The Injector now reads `doc` through a live getter, so a stale capture no
 * longer breaks anything — but building against a document that is about to be
 * thrown away invites the same class of bug in anything else that caches, so
 * refuse to set up until CODAP's real document is actually there. The retries
 * on `connected` and on the 4 s timer will come back.
 */
function codapDocReady(iframe) {
  let d = null;
  try { d = iframe?.contentDocument; } catch { return false; }
  if (!d) return false;
  const href = d.location?.href ?? '';
  if (href === 'about:blank' || href === '') return false;
  return !!d.body;
}

let setupTries = 0;
function setupDemo() {
  const iframe = document.getElementById('codap');
  if (demo || !sameOrigin(iframe)) return;
  if (!codapDocReady(iframe)) {
    // Keep coming back rather than waiting on the two fixed retries: if CODAP's
    // document is late, silently never setting up is a worse failure than the
    // one being fixed. Bounded so a wedged frame cannot spin forever.
    if (setupTries++ < 240) setTimeout(setupDemo, 250);
    else logLine('demo: CODAP document never became ready — live demos off', '#c92a2a');
    return;
  }
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
  installTracer();                 // window.__dotTrace — see trace-input.js
  installRecorder();               // window.__dotRecord — see record-drag.js
  // window.__dotWatch — what CODAP actually renders during a drag. Answers the
  // question left open by "NEVER STARTED after 12017ms" with no frozen-thread
  // line: the thread was running, so what IS the black card Chad sees?
  window.__dotWatch = installDragDomWatcher(() => inj.doc);
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

// ------------------------------------------------------------- Wonderings: state
// Declared here, above "Dot's mind", because the mind panel reports on them and
// a `let` read before its declaration is a TDZ throw, not an undefined.
//
// OFF BY DEFAULT AND ABSENT FROM THE DOM WHEN OFF. `?wonderings=1` turns it on
// for a session; the Dashboard toggle turns it on or off at any time. When off
// the panel is not hidden — it is destroyed, so nothing it installed (a 2 s
// reposition poll, a resize listener, a shared <style>) survives being switched
// off. `createWonderingsPanel` returns the `destroy()` that makes that possible.
const WONDERINGS_FLAG = new URLSearchParams(location.search).get('wonderings') === '1';
let wonderingsOn = WONDERINGS_FLAG;
let governorState = initialGovernorState();

// ------------------------------------------------------------- Dot's mind
// Full reasoning exposed: Phase 7 (data-move reactions) in blue, Phase 8
// (insight-driven suggestions, with live rationale) in dark red.
const MIND_COLORS = { 7: '#1c63d6', 8: '#8b1a1a' };
/** The one seam anything is allowed to write a line of reasoning through. */
function mindLine(text, color = '#555') {
  const box = $('#mindLog');
  if (!box) return;
  const div = document.createElement('div');
  div.textContent = text;
  div.style.color = color;
  box.appendChild(div);
  while (box.childElementCount > 60) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
engine.onFire = (b, event, escalated) => {
  const m = MIND[b.id];
  const desc = m?.describe?.(event, engine.state) ?? '(no description)';
  mindLine(`▶ ${b.id}${escalated ? ' ESC' : ''} — ${desc}`, MIND_COLORS[m?.phase] ?? '#555');
};

// The last full analysis, INCLUDING its raw `rows` — the wonderings pipeline
// needs the cases and `analyzeDataset` already paid for the round trip.
// Deliberately not stored on `engine.state.insight`, which behaviors read and
// which would then carry the whole dataset for the life of the session.
let latestAnalysis = null;
/** Last `nextWondering()` verdict, for the mind panel's standing readout. */
let lastWonderingReport = null;

/**
 * Rewrite the "Dataset analysis" box. ONE writer, because two writers to one
 * `textContent` would erase each other; the wonderings section is appended from
 * cached state rather than by a second owner of the node.
 */
function renderMindAnalysis() {
  const a = latestAnalysis;
  if (!a) { $('#mindAnalysis').textContent = 'no populated dataset yet'; return; }
  const refusals = (a.separations ?? []).filter((s) => !s.qualifies && s.reason === 'identifier');
  const lines = [
    `${a.context}: ${a.caseCount} cases, ${a.attrs.length} attrs `
      + `(${a.attrs.map(x => `${x.name}:${x.kind === 'numeric' ? 'num' : `cat×${x.cardinality}`}`
        + `/${x.role}`).join(', ')})`,
    `outliers: ${a.outliers.length ? a.outliers.map(o => `${o.attr}=${o.value} (z=${o.z})`).join('; ') : 'none'}`,
    // `qualifies` is the n-floor, not a flat |r| — see insight.js's suggestMoves.
    `correlations: ${a.correlations.length
      ? a.correlations.map(c => `${c.a}×${c.b} r=${c.r}${c.qualifies ? '*' : ''}`).join('; ')
      : 'n/a'}`,
    `separations: ${(a.separations ?? []).filter(s => s.qualifies)
      .map(s => `${s.cat}×${s.num} eta²=${s.eta2.toFixed(2)}`).join('; ') || 'none qualify'}`
      + (refusals.length ? `  [refused as identifier: ${refusals.length}]` : ''),
    `hierarchical: ${a.isHierarchical ? 'yes' : 'no (flat)'}`,
  ];
  const w = lastWonderingReport;
  if (w) {
    lines.push('');
    lines.push(`wonderings: ${wonderingsOn ? 'on' : 'off'} — student is ${w.activity}, `
      + `${w.offer ? 'offering' : `quiet (${w.reason})`}; `
      + `interval ${Math.round(intervalSeconds(governorState))}s, `
      + `${governorState.offers} offered, ${w.wonderings.length} earned / `
      + `${w.suppressed.length} suppressed this pass`);
    for (const cand of w.wonderings.slice(0, 3)) {
      lines.push(`  · [${cand.provenance.family}] ${cand.text}`);
    }
    for (const s of w.suppressed.slice(0, 2)) {
      lines.push(`  × [${s.provenance.family}] ${s.provenance.focus.join(', ')} — ${s.provenance.reason}`);
    }
  }
  $('#mindAnalysis').textContent = lines.join('\n');
}

async function refreshInsight() {
  try {
    const analysis = await analyzeDataset(bridge);
    if (!analysis) { latestAnalysis = null; renderMindAnalysis(); return; }
    const suggestions = suggestMoves(analysis, engine.state.dataMoves);
    // `rows` is dropped here on purpose — see `latestAnalysis` above and the
    // return docs of `analyzeDataset`.
    const { rows, ...forState } = analysis;
    engine.state.insight = { ...forState, suggestions };
    latestAnalysis = analysis;
    renderMindAnalysis();
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

// ------------------------------------------------------------- Wonderings
// The assembled pipeline (web/src/wonderings/index.js) driven by the real
// bridge. Everything that decides ANYTHING — which observation is earned, how
// it is worded, whether now is a moment to speak — lives in the pure modules
// and is node-tested. This block owns only the three things a pure module
// cannot: the clock, the CODAP reads, and the DOM.
//
// The character never says a wondering. `axo.emote()` is not called from here
// and must not be: docs/CHARACTER.md keeps ambient inquiry and Dot's own voice
// separate, and the whole reason the panel is a separate surface is that a
// question the student never asked for must not read as Dot addressing them.

const WONDERING_TICK_MS = 5000;      // ms between governor checks. The governor's own floor is 90 s, so this only bounds how late an offer can be; 5 s costs one governor call (pure arithmetic over `engine.state`) and, when it passes, one scene refresh
const WONDERING_DWELL_SEC = 75;      // seconds a wondering stays on screen before it sinks away. Longer than a glance, shorter than the 90 s minimum interval, so a question is never on screen when the next one is due
const SCENE_READ_TIMEOUT_MS = 4000;  // ms before an unanswered CODAP read counts as dropped. `CodapBridge.request` NEVER REJECTS AND NEVER TIMES OUT (codap-bridge.js:45) — the iframe phone drops replies at random (demo-driver.js:244) and a promise that never settles would wedge `createSceneModel`'s in-flight de-duplication for the life of the page

/** `bridge.request` with a deadline, resolving to `null` on a dropped reply. */
function readWithTimeout(action, resource) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    setTimeout(() => done(null), SCENE_READ_TIMEOUT_MS);
    bridge.request(action, resource).then(done, () => done(null));
  });
}

// `driver.active`, never `driver.phase` — see scene-model.js constraint 1.
// `demo` is null on the cross-origin page and until setupDemo() succeeds, which
// `isDriverSuspended(undefined)` reads as "not suspended", correctly.
const sceneModel = await createSceneModel({
  read: readWithTimeout,
  attributeNames: () => latestAnalysis?.attrNames ?? [],
  isSuspended: () => isDriverSuspended(demo?.driver),
  prime: false,                     // CODAP is not up yet at module-eval time
});

let wonderingsPanel = null;
let wonderingsTimer = null;
let dwellTimer = null;
const saidKeys = new Set();          // Observation.key values already shown this session
let datasetCache = { at: null, model: null };

/** The DatasetModel for the current analysis, rebuilt only when it changed. */
function currentDataset() {
  const a = latestAnalysis;
  if (!a) return null;
  if (datasetCache.at === a.at) return datasetCache.model;
  const model = buildDatasetModel(a.rows, {
    context: a.context,
    attributeNames: a.attrNames,
    declaredKinds: a.declaredKinds,
  });
  datasetCache = { at: a.at, model };
  return model;
}

async function wonderingsTick() {
  if (!wonderingsOn || !wonderingsPanel) return;
  const dataset = currentDataset();
  if (!dataset) return;
  const nowSec = performance.now() / 1000;

  // The governor runs FIRST, on the scene we already have: a student in flow
  // must cost nothing at all, not even a componentList round trip.
  const dry = nextWondering({
    dataset, scene: sceneModel.scene, engineState: engine.state,
    governorState, nowSeconds: nowSec, saidKeys,
  });
  lastWonderingReport = dry;
  if (!dry.offer) { renderMindAnalysis(); return; }

  // It is a moment to speak, so it is worth paying for a fresh scene.
  await sceneModel.refresh();
  const result = nextWondering({
    dataset, scene: sceneModel.scene, engineState: engine.state,
    governorState, nowSeconds: performance.now() / 1000, saidKeys,
  });
  lastWonderingReport = result;
  renderMindAnalysis();
  if (!result.offer || !result.wondering) return;

  const w = result.wondering;
  if (!wonderingsPanel.show(w.text)) return;      // panel refused (hidden/duplicate)
  saidKeys.add(w.observation.key);
  governorState = governorReducer(governorState, { type: 'offered', at: performance.now() / 1000 });
  // The provenance a developer needs goes to the mind panel, never to the
  // student: `provenance.evidence` holds the statistics the voice rule keeps
  // out of the sentence, and `provenance.rejected[].text` holds strings that
  // FAILED the lint.
  const p = w.provenance;
  mindLine(`? wondering [${p.family}/${p.phrasing}] ${w.text}`, '#0b5a6b');
  mindLine(`   because ${p.focus.join(' × ')} — ${JSON.stringify(p.evidence)} `
    + `(strength ${p.strength}, ${result.activity}, scene v${sceneModel.sceneVersion})`, '#57707a');

  clearTimeout(dwellTimer);
  dwellTimer = setTimeout(() => {
    wonderingsPanel?.clear();
    // Nothing reports uptake — the ledger is deliberately out of scope for this
    // build (plan -002, "What is deliberately NOT in this build"), so a faded
    // wondering is counted as unacted and the next one waits longer. Erring
    // toward silence is the failure mode docs/CHARACTER.md asks for.
    governorState = governorReducer(governorState, { type: 'unacted' });
  }, WONDERING_DWELL_SEC * 1000);
}

function mountWonderings() {
  if (wonderingsPanel) return;
  wonderingsPanel = createWonderingsPanel({
    doc: document,
    frame: document.getElementById('codap'),
    label: PARTIAL_FRAMING_LABEL,   // "some of many" — realize.js owns the wording
    state: 'idle',
  });
  wonderingsTimer = setInterval(() => {
    wonderingsTick().catch((err) => {
      // A family that throws is a bug. Swallowing it silently would present as
      // "the panel is quiet today", which is indistinguishable from correct
      // behaviour — so it is logged where a human will see it (this is the
      // wrapping web/src/wonderings/index.js's header says belongs here).
      logLine(`wonderings failed: ${err.message}`, '#c92a2a');
    });
  }, WONDERING_TICK_MS);
  logLine('wonderings: on', '#0b5a6b');
}

function unmountWonderings() {
  clearInterval(wonderingsTimer); wonderingsTimer = null;
  clearTimeout(dwellTimer); dwellTimer = null;
  wonderingsPanel?.destroy();      // takes the poll, the listener and the <style> with it
  wonderingsPanel = null;
  lastWonderingReport = null;
  renderMindAnalysis();
}

// The Dashboard toggle, built here rather than in the two HTML pages so that
// codap.html and codap-same.html stay identical on this feature and neither
// needs editing. It sits with `behaviors:` because it is the same kind of
// switch: a thing Dot does, turned off.
{
  const btn = document.createElement('button');
  const paint = () => { btn.innerHTML = `wonderings: <b>${wonderingsOn ? 'on' : 'off'}</b>`; };
  btn.id = 'wonderingsToggle';
  btn.onclick = () => {
    wonderingsOn = !wonderingsOn;
    paint();
    if (wonderingsOn) mountWonderings(); else unmountWonderings();
  };
  paint();
  $('#behaviors')?.after(btn);
}

if (wonderingsOn) mountWonderings();
window.__wonderings = {
  isOn: () => wonderingsOn,
  panel: () => wonderingsPanel,
  scene: () => sceneModel.scene,
  dataset: () => currentDataset(),
  report: () => lastWonderingReport,
  governor: () => governorState,
  /** Force one pass, ignoring the governor's interval — debug only. */
  now: async () => {
    governorState = { ...governorState, lastOfferAt: null };
    await wonderingsTick();
    return lastWonderingReport;
  },
};

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
// Experiment kit — see docs/EXPERIMENT-RENDER-STARVATION.md. `lite` is raised
// by DemoDriver.dragAttribute (when armed via `liteDuringDrag`) so the WebGL
// render and character animation are skipped for the duration of a drag while
// script logic (driver.tick / engine.tick) keeps running. `gaps` records every
// frame gap over 250 ms as [performance.now() rounded, gap ms].
// `noReassert` is arm C: it stops InputShield restating Dot's position after
// every trusted mouse move, which is the only path by which a HUMAN'S mouse
// reaches CODAP during a demo. `drags` records [start, end] of each drag window
// so a gap can be told from one outside it.
window.__dotPerf = {
  liteDuringDrag: false,
  lite: false,
  noReassert: false,
  gaps: [],
  drags: [],
  reset() { this.gaps.length = 0; this.drags.length = 0; },
  /** Gaps inside the last drag window, worst first. */
  dragGaps() {
    const w = this.drags[this.drags.length - 1];
    if (!w) return [];
    return this.gaps.filter((g) => g[0] >= w[0] && g[0] <= (w[1] ?? Infinity))
      .sort((a, b) => b[1] - a[1]);
  },
};
stage.renderer.setAnimationLoop(() => {
  const now = performance.now();
  // A HIDDEN TAB DRAWS NOTHING. Ordinary Chrome throttles rAF in a background
  // tab, so this costs nothing there — but automation browsers are launched
  // with renderer backgrounding disabled, and there the loop runs flat out
  // forever in a window nobody can see. Found 2026-08-27: THREE leaked
  // agent-browser instances on Chad's machine, all of them parked on
  // codap-same.html, each burning a full core, the oldest running for over a
  // day. Every agent-driven test session had been leaking one. That is the
  // mechanism behind DRAG-GHOST-CONUNDRUM.md §8 — "closing two idle automation
  // browsers changed MakeScatterplot from 2-of-3 failing to 5-of-5 passing" —
  // and it was our page doing the burning.
  if (document.hidden) { clock.last = now; return; }
  const gap = now - clock.last;
  if (gap > 250) window.__dotPerf.gaps.push([Math.round(now), Math.round(gap)]);
  // The clamp is a guard against one enormous jump after a tab is backgrounded,
  // NOT a speed limit — but at 0.05 s it was acting as one. CODAP's own work
  // drags this page down to ~4 fps while a demo runs (measured: 26 fps idle,
  // 3.8 fps mid-demo, with single frame gaps of 6-12 s), and clamping dt to
  // 50 ms meant the animation mixer advanced 50 ms per frame no matter how
  // long the frame actually took. Clips ran at a FIFTH of their real speed: a
  // 1.4 s tap took 7-33 s of wall clock, which is what was pushing demos past
  // their 60 s cap. 0.25 s keeps the backgrounded-tab guard and lets clips
  // play in real time when frames are sparse.
  const dt = Math.min(0.25, gap / 1000);
  clock.last = now;
  if (window.__dotPerf.lite) {
    // Character freezes mid-pose; the drag itself is promise-driven and the
    // driver/engine still tick, so the demo continues.
    demo?.driver.tick(dt);
    engine.tick(dt);
    return;
  }
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
