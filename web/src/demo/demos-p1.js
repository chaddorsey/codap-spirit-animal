/**
 * demos-p1.js — the two hard-coded demonstrations that prove the P1
 * machinery (docs/PHASE9-SHOWME.md Phase 1). P2 replaces these with parsed
 * DemoScripts; the shapes here are what the script verbs must be able to say.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEL = {
  toolbarGraph: '[data-testid="tool-shelf-button-graph"]',
  pill: (name) => `[data-testid="codap-attribute-button ${name}"]`,
  dropBottom: '[data-testid="add-attribute-drop-bottom"]',
  dropLeft: '[data-testid="add-attribute-drop-left"]',
};

function need(doc, sel) {
  const el = doc.querySelector(sel);
  if (!el) throw new Error(`TargetNotFound: ${sel}`);
  return el;
}

/** "Make a graph": swim to the tool shelf, tap Graph, admire it, undo it. */
export async function demoMakeGraph(driver) {
  const doc = driver.iframe.contentDocument;
  const btn = need(doc, SEL.toolbarGraph);
  const before = (await driver.api('get', 'componentList'))?.values?.length ?? 0;

  await driver.begin(driver._center(btn));
  driver.recording = true;
  try {
    driver.axo.emote('!');            // not awaited: the bubble lives its own life
    await driver.tap(btn, { clickOpts: { full: false } });
    await driver.waitFor(async () => {
      const list = (await driver.api('get', 'componentList'))?.values ?? [];
      return list.length > before ? list : null;
    }, { timeoutSec: 8, what: 'a new graph' });
    await sleep(1200);                       // the beat where the student looks
    // recording stays ON through the revert: Dot's swim to the Undo button and
    // her taps on it are part of the demonstration, so they are part of the
    // paw-sync measurement too ("over a full demo").
    const revert = await driver.revert();
    driver.axo.emote('?');
    return { ok: true, sync: driver.syncReport(), revert };
  } finally {
    driver.recording = false;
    await driver.end();
  }
}

/**
 * "Put an attribute on an axis": carry the Mass pill from the case table to
 * the graph's x axis, let the student see the dot plot, then undo it.
 * Assumes a graph exists (the tutorial's own task order).
 */
export async function demoAssignAttribute(driver, { attr = 'Mass', axis = 'bottom' } = {}) {
  const doc = driver.iframe.contentDocument;
  const pill = need(doc, SEL.pill(attr));
  const drop = need(doc, axis === 'left' ? SEL.dropLeft : SEL.dropBottom);
  const field = axis === 'left' ? 'yAttributeName' : 'xAttributeName';

  const graphs = ((await driver.api('get', 'componentList'))?.values ?? [])
    .filter((c) => /graph/i.test(c.type));
  if (!graphs.length) throw new Error('demoAssignAttribute needs a graph first');
  const gid = graphs[graphs.length - 1].id;

  await driver.begin(driver._center(pill));
  driver.recording = true;
  try {
    driver.axo.emote('!');            // not awaited: the bubble lives its own life
    await driver.dragAttribute(pill, drop);
    await driver.waitFor(async () => {
      const c = await driver.api('get', `component[${gid}]`);
      return c?.values?.[field] === attr ? c.values : null;
    }, { timeoutSec: 8, what: `${attr} on the ${axis} axis` });
    await sleep(1400);
    const revert = await driver.revert();
    driver.axo.emote('?');
    return { ok: true, sync: driver.syncReport(), revert };
  } finally {
    driver.recording = false;
    await driver.end();
  }
}

export const P1_DEMOS = {
  MakeGraph: demoMakeGraph,
  AssignAttribute: demoAssignAttribute,
};
