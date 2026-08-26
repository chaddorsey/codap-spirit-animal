/**
 * inject-test.js — Phase 9 P0 harness.
 *
 * Exercises every injection primitive against a live SAME-ORIGIN CODAP v3 and
 * asserts the effect through the Data Interactive API (get-verify-retry: the
 * iframe phone drops replies at random — docs/BAT-A-POINT.md).
 *
 *   window.__injectTest()        run everything, print PASS/FAIL per primitive
 *   window.__fixture()           (re)create the 12-row Mammals fixture
 *   window.__probe(sel)          dump matching data-testids from CODAP's DOM
 *   window.__api(a, r, v)        one API call with retry
 *   window.__inj                 the Injector bound to the CODAP window
 */
import { CodapBridge } from './codap-bridge.js';
import { Injector, sameOrigin, sleep, toPoint, toRect } from './inject.js';

const iframe = document.getElementById('codap');
const bridge = new CodapBridge(iframe);
const out = document.getElementById('out');

// --------------------------------------------------------------- logging
function line(text, cls = 'info') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
  // eslint-disable-next-line no-console
  console.log(`[injectTest] ${text}`);
  return div;
}
const head = (t) => line(t, 'head');

// --------------------------------------------------------------- API glue
/** One API call, retried: the phone loses replies (never assume one landed). */
async function api(action, resource, values, { tries = 4, timeoutMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const res = await Promise.race([
      bridge.request(action, resource, values),
      sleep(timeoutMs).then(() => null),
    ]);
    if (res) return res;
    await sleep(150);
  }
  return null;
}

/** get-verify-retry: poll an API-derived value until `ok`, or give up. */
async function verify(fn, ok, { tries = 20, waitMs = 250, what = 'value' } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (ok(last)) return last;
    await sleep(waitMs);
  }
  const e = new Error(`verify failed: ${what} (last=${JSON.stringify(last)?.slice(0, 200)})`);
  e.last = last;
  throw e;
}

const componentList = async () => (await api('get', 'componentList'))?.values ?? [];
const component = async (id) => (await api('get', `component[${id}]`))?.values ?? null;
const selectionCount = async (ctx = 'Mammals') => {
  const r = await api('get', `dataContext[${ctx}].selectionList`);
  return r?.success ? (r.values?.length ?? 0) : -1;
};
const items = async (ctx = 'Mammals') =>
  (await api('get', `dataContext[${ctx}].itemSearch[*]`))?.values ?? [];

// --------------------------------------------------------------- fixture
// A 12-row Mammals-shaped dataset created through the API — deterministic and
// offline, matching the shape docs/BAT-A-POINT.md calibrated against (numeric
// Mass with one large outlier, numeric Sleep, a categorical Order).
const MAMMALS = [
  { Mammal: 'African Elephant', Order: 'Proboscidae', LifeSpan: 70, Height: 4.0, Mass: 6654, Sleep: 3.3, Speed: 40 },
  { Mammal: 'Asian Elephant', Order: 'Proboscidae', LifeSpan: 70, Height: 3.0, Mass: 2547, Sleep: 3.9, Speed: 40 },
  { Mammal: 'Big Brown Bat', Order: 'Chiroptera', LifeSpan: 19, Height: 0.06, Mass: 0.023, Sleep: 19.7, Speed: 40 },
  { Mammal: 'Chimpanzee', Order: 'Primate', LifeSpan: 40, Height: 1.5, Mass: 52.2, Sleep: 9.7, Speed: 16 },
  { Mammal: 'Cow', Order: 'Artiodactyla', LifeSpan: 22, Height: 1.5, Mass: 465, Sleep: 3.9, Speed: 40 },
  { Mammal: 'Donkey', Order: 'Perissodactyla', LifeSpan: 40, Height: 1.2, Mass: 187, Sleep: 3.1, Speed: 50 },
  { Mammal: 'Giraffe', Order: 'Artiodactyla', LifeSpan: 25, Height: 5.6, Mass: 900, Sleep: 1.9, Speed: 51 },
  { Mammal: 'Gray Wolf', Order: 'Carnivora', LifeSpan: 16, Height: 0.8, Mass: 36, Sleep: 13.0, Speed: 64 },
  { Mammal: 'Human', Order: 'Primate', LifeSpan: 80, Height: 1.9, Mass: 62, Sleep: 8.0, Speed: 45 },
  { Mammal: 'Jaguar', Order: 'Carnivora', LifeSpan: 20, Height: 0.8, Mass: 100, Sleep: 10.4, Speed: 60 },
  { Mammal: 'Lion', Order: 'Carnivora', LifeSpan: 15, Height: 1.2, Mass: 175, Sleep: 13.5, Speed: 80 },
  { Mammal: 'Mouse', Order: 'Rodent', LifeSpan: 3, Height: 0.1, Mass: 0.023, Sleep: 12.5, Speed: 13 },
];

async function ensureFixture({ force = false } = {}) {
  const existing = await api('get', 'dataContext[Mammals]');
  if (existing?.success && !force) {
    const n = (await items()).length;
    if (n === MAMMALS.length) { line(`fixture present (${n} items)`); return true; }
    await api('delete', 'dataContext[Mammals]');
  } else if (existing?.success) {
    await api('delete', 'dataContext[Mammals]');
  }
  const created = await api('create', 'dataContext', {
    name: 'Mammals', title: 'Mammals',
    collections: [{
      name: 'Mammals', title: 'Mammals',
      attrs: [
        { name: 'Mammal', type: 'categorical' },
        { name: 'Order', type: 'categorical' },
        { name: 'LifeSpan', type: 'numeric' },
        { name: 'Height', type: 'numeric' },
        { name: 'Mass', type: 'numeric' },
        { name: 'Sleep', type: 'numeric' },
        { name: 'Speed', type: 'numeric' },
      ],
    }],
  });
  if (!created?.success) { line(`fixture create FAILED: ${JSON.stringify(created)}`, 'fail'); return false; }
  const added = await api('create', 'dataContext[Mammals].item', MAMMALS);
  if (!added?.success) { line(`fixture items FAILED: ${JSON.stringify(added)}`, 'fail'); return false; }
  await verify(async () => (await items()).length, (n) => n === MAMMALS.length,
    { what: '12 items' });
  line(`fixture created (${MAMMALS.length} items)`, 'pass');
  return true;
}

// --------------------------------------------------------------- injector
let inj = null;
function injector() {
  if (!inj) {
    if (!sameOrigin(iframe)) throw new Error('CODAP iframe is NOT same-origin');
    inj = new Injector(iframe.contentWindow);
    window.__inj = inj;
  }
  return inj;
}
const cdoc = () => iframe.contentDocument;
const cwin = () => iframe.contentWindow;

/**
 * CODAP v3 cold-load chrome that must be gone before anything is injected:
 * the "user entry" modal (Create New Document / Open…) and the announcement
 * banner. The banner also shifts every tile down ~44px, so its state changes
 * measurements — always dismiss it, never leave it to chance.
 */
async function dismissChrome() {
  const d = cdoc();
  if (!d) return false;
  const create = d.querySelector('[data-testid="Create New Document-button"]');
  if (create && create.getBoundingClientRect().height > 0) {
    await injector().click(create);
    await injector().waitFor(
      () => !d.querySelector('[data-testid="Create New Document-button"]')
            || d.querySelector('[data-testid="Create New Document-button"]')
                 .getBoundingClientRect().height === 0,
      { timeoutSec: 6, what: 'launch modal gone' });
    line('dismissed launch modal');
  }
  const close = d.querySelector('[data-testid="announcement-banner-close"]');
  if (close && close.getBoundingClientRect().height > 0) {
    await injector().click(close);
    await sleep(400);
    line('dismissed announcement banner');
  }
  return true;
}

/** A case table on the fixture — where the draggable attribute pills live. */
async function ensureTable() {
  for (const c of await componentList()) {
    if (/caseTable/i.test(c.type)) return c.id;
  }
  const r = await api('create', 'component', {
    type: 'caseTable', dataContext: 'Mammals', name: 'Mammals table',
    position: { left: 6, top: 6 }, dimensions: { width: 520, height: 250 },
  });
  if (!r?.success) throw new Error(`caseTable create failed: ${JSON.stringify(r?.values)}`);
  await verify(async () => cdoc().querySelector(SEL.pill('Mass')), (el) => !!el,
    { what: 'Mass pill in the case table' });
  return r.values.id;
}

// --------------------------------------------------------------- probing
/** Dump every data-testid (or a filtered subset) from CODAP's document. */
function probe(filter = '') {
  const d = cdoc();
  const seen = new Map();
  for (const el of d.querySelectorAll('[data-testid]')) {
    const id = el.getAttribute('data-testid');
    if (filter && !id.toLowerCase().includes(filter.toLowerCase())) continue;
    const r = el.getBoundingClientRect();
    if (!seen.has(id)) {
      seen.set(id, { testid: id, tag: el.tagName.toLowerCase(),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        vis: cwin().getComputedStyle(el).visibility, n: 1 });
    } else seen.get(id).n++;
  }
  return [...seen.values()];
}

// --------------------------------------------------------------- selectors
// Filled from live probing (P0). Every one of these is recorded in
// docs/PHASE9-SHOWME.md's verification table.
export const SEL = {
  toolbarGraph: '[data-testid="tool-shelf-button-graph"]',
  toolbarTable: '[data-testid="tool-shelf-button-table"]',
  tableMenuList: '[data-testid="tool-shelf-table-menu-list"]',
  undo: '[data-testid="tool-shelf-button-undo"]',
  redo: '[data-testid="tool-shelf-button-redo"]',
  pill: (name) => `[data-testid="codap-attribute-button ${name}"]`,
  dropBottom: '[data-testid="add-attribute-drop-bottom"]',
  dropLeft: '[data-testid="add-attribute-drop-left"]',
  plot: '.droppable-plot',
  graphTitle: '[data-testid="component-title-bar"]',
};

// --------------------------------------------------------------- test rig
const results = [];
async function test(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - t0);
    results.push({ name, ok: true, detail });
    line(`PASS  ${name}  (${ms}ms)${detail ? ' — ' + detail : ''}`, 'pass');
    return true;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    results.push({ name, ok: false, detail: err.message });
    line(`FAIL  ${name}  (${ms}ms) — ${err.message}`, 'fail');
    return false;
  }
}

// ------------------------------------------------------------- entrypoints
async function waitConnected(timeoutSec = 30) {
  if (bridge.connected) return true;
  const deadline = performance.now() + timeoutSec * 1000;
  while (!bridge.connected && performance.now() < deadline) await sleep(200);
  if (!bridge.connected) throw new Error('CODAP never sent codap-present');
  await sleep(400);
  return true;
}

bridge.addEventListener('connected', () => {
  const c = document.getElementById('conn');
  c.textContent = 'connected'; c.classList.add('ok');
  line('CODAP present — phone connected', 'pass');
});

window.__api = api;
window.__verify = verify;
window.__bridge = bridge;
window.__probe = probe;
window.__fixture = ensureFixture;
window.__dismiss = dismissChrome;
window.__ensureTable = ensureTable;
/** Cold-start everything the suite assumes: chrome gone, fixture + table up. */
window.__setup = async () => {
  await waitConnected();
  await dismissChrome();
  injector();
  await ensureFixture();
  const tableId = await ensureTable();
  line(`setup complete (table ${tableId})`, 'pass');
  return tableId;
};
window.__componentList = componentList;
window.__component = component;
window.__selectionCount = selectionCount;
window.__items = items;
window.__results = results;
window.__cdoc = cdoc;
window.__SEL = SEL;
window.__injectorInit = injector;

document.getElementById('runAll').onclick = () => window.__injectTest();
document.getElementById('fixture').onclick = () => ensureFixture({ force: true });
document.getElementById('probe').onclick = () => line(JSON.stringify(probe(), null, 1));
document.getElementById('clear').onclick = () => { out.innerHTML = ''; };
document.getElementById('reset').onclick = async () => {
  for (const c of await componentList()) await api('delete', `component[${c.id}]`);
  await ensureFixture({ force: true });
  line('document reset', 'pass');
};

line('harness loaded — waiting for CODAP…');

// The suite itself lives in inject-tests-suite.js so it can be edited without
// touching the harness plumbing.
const { runSuite } = await import('./inject-tests-suite.js');
window.__injectTest = async () => {
  out.innerHTML = '';
  results.length = 0;
  head('=== P0 injection suite ===');
  await window.__setup();
  await runSuite({ test, api, verify, line, head, injector, SEL, cdoc, cwin,
                   componentList, component, selectionCount, items, sleep,
                   toPoint, toRect, probe, ensureFixture, ensureTable });
  const passed = results.filter((r) => r.ok).length;
  head(`=== ${passed}/${results.length} ${passed === results.length ? 'PASS' : 'FAIL'} ===`);
  return { passed, total: results.length, results };
};
