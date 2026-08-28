/**
 * scene-model.js — what is on screen right now, cheaply and honestly.
 *
 * The second input to every wondering family
 * (`web/src/wonderings/contracts.js`, typedef `SceneModel`). The dataset says
 * what is TRUE; this says what the student is LOOKING AT. Without it a
 * wondering can only be about the data in the abstract, and the
 * second-dimension family — "a univariate plot exists and the plotted
 * attribute has a qualifying partner" — cannot exist at all.
 *
 * WHY IT IS SPLIT IN TWO. `deriveScene()` is pure and holds all the judgment;
 * `createSceneModel()` is a thin async shell around an INJECTED `read`. That
 * split is not stylistic. It is the only way the interesting behaviour — a
 * dropped reply must not look like a deleted graph — is testable in node, and
 * `docs/verification/wonderings/t-scene.mjs` exercises exactly that with a fake
 * reader. No browser, no CODAP, no iframe.
 *
 * FOUR DESIGN CONSTRAINTS, ALL MEASURED. Do not rediscover them.
 *
 * 1. SUSPEND ON `driver.active`, NEVER ON `driver.phase`.
 *    `web/src/demo/demo-driver.js` sets `this.phase = 'idle'` at the end of
 *    every tap (`:599`), every travel (`:541`) and every drag (`:716`), so a
 *    demo mid-run reads as idle between steps; and `revert()` (`:1142`) never
 *    sets `phase` at all, so an entire revert looks idle from outside. `active`
 *    is true for the whole run (`:441` → `:497`) and is the only honest signal.
 *    `aborted` LATCHES (`:502`, cleared only at the next `:442`), so it is not a
 *    substitute either. `isDriverSuspended()` below encodes this so it can be
 *    asserted rather than merely written down.
 *
 * 2. HEAL MONOTONICALLY — absence requires AFFIRMATIVE observation. Modelled on
 *    `behavior-engine.js:_resyncComponents` (`:392-409`), which refuses to lower
 *    a count on missing evidence. The iframe phone drops replies at random
 *    (`demo-driver.js:244-252`; one dropped `create` reply once produced four
 *    graphs). If a dropped `component[id]` reply were read as "that graph is
 *    gone", every wondering anchored to it would be retired for nothing, and the
 *    student would watch the panel forget what is plainly on their screen. So:
 *    `componentList` is the SOLE authority on existence. A component the list
 *    still names but whose detail reply never came keeps its last known values
 *    and is reported in `staleIds`. Only a SUCCESSFUL list that omits a
 *    component removes it, and only then does it appear in `removedIds`.
 *
 *    AND THEREFORE, corrected 2026-08-28 after adversarial verification found it
 *    (`docs/verification/wonderings/BUILD-VERIFICATION.md`, blocking item 5):
 *    "successful" has to mean WELL-FORMED, not merely "not obviously a
 *    failure". The original guarded only `list == null` and
 *    `list.success === false`, then did
 *    `Array.isArray(list.values) ? list.values : []` — so a reply of `{}`,
 *    `{success:true}`, `{values:[…]}` or a bare string was treated as
 *    AUTHORITATIVE and yielded an empty scene, removing every component and
 *    retiring every visible wondering. That is precisely the failure this
 *    constraint exists to prevent, reached through the component LIST rather
 *    than through a component reply. `isWellFormedList()` below is the fix, and
 *    section D2 of `t-scene.mjs` is the assertion; the three ways a list read
 *    can teach nothing — LIST_DROPPED, LIST_REFUSED, LIST_MALFORMED — are
 *    separate `READ_REASONS` so they are discriminable from a console.
 *
 * 3. `unplottedAttrs` NEEDS THE DATASET'S FULL ATTRIBUTE LIST, WHICH THE SCENE
 *    DOES NOT HAVE. A graph names the three or four attributes it displays and
 *    nothing else; the eight columns of `web/src/demo/fixture.js` are simply not
 *    knowable from `componentList`. Rather than invent a source (a
 *    `get attributeList` call has no existing call site and no known response
 *    shape — plan `-001` U0 defers it deliberately), the list is a PARAMETER.
 *    Omit it and `unplottedAttrs` is `[]`, which is the honest answer to a
 *    question that was never asked, not a claim that everything is plotted.
 *
 * 4. `sceneVersion` INCREMENTS ONLY ON A SUCCESSFUL READ THAT CHANGED THE SCENE.
 *    It is the staleness guard a Wondering records at birth and re-checks before
 *    display, so it must be monotone: it only ever rises, never on a failed or
 *    partial-but-unchanged read, and never backwards. `0` means "never
 *    successfully read" — distinguishable from "read fine, nothing on screen",
 *    which is version >= 1 with `graphs: []`. Making failure modes discriminable
 *    is the whole point: "reply lost" must not read as "nothing qualified".
 *
 * PURITY. No browser globals, no clock, no randomness, no `Math.random()`, no
 * `Date.now()`, no `performance.now()`. Every read goes through the injected
 * function; the module never touches `bridge`, `driver` or the DOM itself.
 *
 * COST. `createSceneModel` never calls CODAP's serial `bridge.components()`
 * (`codap-bridge.js:88-106`), which is N+1 round trips one after another and was
 * measured as the single biggest expense in a demo. It fans the per-component
 * reads out with `Promise.all`, exactly as `DemoDriver.snapshot()` does
 * (`demo-driver.js:304-338`), and de-duplicates overlapping `refresh()` calls so
 * a poll loop cannot stack reads on a phone that sometimes takes seconds.
 *
 * ONE NARROW WIDENING OF THE FROZEN CONTRACT, stated so nobody thinks it was an
 * accident: the contract types a graph's `dataContext` as `string`, but a graph
 * created before anything is dropped on it genuinely has none. This module emits
 * `null` there, matching `x`/`y`/`legend`, which the contract already types
 * `string|null`. An empty axis is a signal, not a gap — and so is an empty
 * graph.
 *
 * Evidence dated 2026-08-28, against CODAP v3.0.3 and the 12-case Mammals
 * fixture. Reproduce with `node docs/verification/wonderings/t-scene.mjs`.
 */

/** CODAP v3 component `type` for a plot; the only type that puts attributes on
 *  screen, so the only type this module turns into a `graph` entry. Compared
 *  case-insensitively because notification payloads and `componentList` have
 *  not always agreed on casing. */
const GRAPH_COMPONENT_TYPE = 'graph';

/** CODAP's own `plotType` name for two assigned numeric axes. Used only when
 *  the component reply omits `plotType`, which `get component[id]` does for
 *  graphs built by the API rather than by hand. */
const PLOT_TYPE_BIVARIATE = 'scatterPlot';

/** CODAP's own `plotType` name for exactly one assigned axis — the univariate
 *  case the second-dimension family is gated on. */
const PLOT_TYPE_UNIVARIATE = 'dotPlot';

/** Not a CODAP name: our label for a graph with no attribute on either axis.
 *  An empty graph sitting there is the stall signal plan `-001` names as the
 *  moment of need, so it must be nameable rather than filtered away. */
const PLOT_TYPE_EMPTY = 'empty';

/** Unitless counter. 0 means NEVER SUCCESSFULLY READ, which is not the same
 *  fact as "read fine, nothing on screen" (that is >= 1 with `graphs: []`). */
const INITIAL_SCENE_VERSION = 0;

/**
 * Why a `refresh()` ended the way it did. Frozen and exported so W3 switches on
 * a constant rather than on a string literal, and so "reply lost" can never be
 * confused with "nothing qualified" — the failure modes are the point.
 *
 * - `OK`            every listed component answered; the scene is complete.
 * - `PARTIAL`       the list answered, at least one component reply did not.
 *                   What was learned is merged; what was not is left STALE.
 * - `LIST_DROPPED`  no reply to `get componentList`. Nothing was learned, so
 *                   nothing changed and nothing was removed.
 * - `LIST_REFUSED`  CODAP answered `success: false`. Also nothing learned:
 *                   a refusal is not evidence that the components are gone.
 * - `LIST_MALFORMED` a reply arrived and could not be read as a component list
 *                   (`{}`, `{success:true}`, `values` absent or not an array, a
 *                   bare string/number/array). Also nothing learned — see
 *                   constraint 2. Kept separate from DROPPED and REFUSED
 *                   because the three have different causes and only the
 *                   reason string tells them apart in a log.
 * - `SUSPENDED`     a demo is running (`driver.active`); ZERO reads issued.
 */
export const READ_REASONS = Object.freeze({
  OK: 'ok',
  PARTIAL: 'partial',
  LIST_DROPPED: 'list-dropped',
  LIST_REFUSED: 'list-refused',
  LIST_MALFORMED: 'list-malformed',
  SUSPENDED: 'suspended',
});

/**
 * Is this reply a component list we are entitled to BELIEVE?
 *
 * The whole weight of constraint 2 rests here. `componentList` is the sole
 * authority on existence, so anything this function accepts is authoritative:
 * a component it omits is removed, and a `values: []` empties the scene. That
 * makes the DEFAULT dangerous — `Array.isArray(list.values) ? list.values : []`
 * reads `{}` as "the student deleted everything", which retires every visible
 * wondering. A reply we cannot parse is not an affirmative observation of
 * absence; it is a failed read wearing a reply's clothes.
 *
 * Deliberately strict, in both directions:
 * - `success` must be exactly `true`. `{values:[…]}` with no `success` is not a
 *   CODAP reply shape and we do not guess which half of it to trust.
 * - `values` must be a real array. `null`, `'nonsense'` and `{}` are not.
 * - `{success:true, values:[]}` IS well-formed and IS believed. An affirmative
 *   empty list is exactly how the student deleting their last graph looks, and
 *   rejecting it would trade this bug for a scene that can never empty.
 *
 * @param {unknown} list a reply from `get componentList`, already known non-null.
 * @returns {boolean}
 */
function isWellFormedList(list) {
  return typeof list === 'object'
    && !Array.isArray(list)
    && list.success === true
    && Array.isArray(list.values);
}

/** '' , undefined and null all mean "no attribute here" → `null`, never
 *  `undefined`. Families test axes with `=== null`; an absent key would make a
 *  univariate graph indistinguishable from a malformed one. */
function attrOrNull(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Deterministic component order: numeric ids numerically, everything else by
 *  string. Without this, a partial read that re-orders the merge would change
 *  the derived scene without the scene having changed. */
function byId(a, b) {
  const an = Number(a.id);
  const bn = Number(b.id);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return String(a.id).localeCompare(String(b.id));
}

/** Fallback when the component reply carries no `plotType` of its own. */
function inferPlotType(x, y) {
  if (x && y) return PLOT_TYPE_BIVARIATE;
  if (x || y) return PLOT_TYPE_UNIVARIATE;
  return PLOT_TYPE_EMPTY;
}

/**
 * Should the SceneModel stop reading right now?
 *
 * TRUE while a scripted demo owns the document. Reads `driver.active` and
 * DELIBERATELY IGNORES `driver.phase` and `driver.aborted` — see constraint 1 in
 * the header. Exported so a test can pin the rule instead of trusting a comment.
 *
 * @param {{active?: boolean}|null|undefined} driver
 * @returns {boolean}
 */
export function isDriverSuspended(driver) {
  return !!(driver && driver.active === true);
}

/**
 * A SceneModel that has observed nothing yet.
 *
 * Distinct from "the student has no graphs": `sceneVersion` is 0 here and >= 1
 * there. Exported so callers do not have to hand-build the shape and get the
 * `derived` nesting subtly wrong.
 *
 * @param {string[]} [attributeNames] the dataset's full attribute list.
 * @returns {object} a SceneModel per `contracts.js`.
 */
export function emptyScene(attributeNames = []) {
  return deriveScene([], { attributeNames, sceneVersion: INITIAL_SCENE_VERSION });
}

/**
 * THE PURE CORE. Raw CODAP component values in, SceneModel out.
 *
 * Same input, same output, forever: no I/O, no clock, no randomness, and the
 * input is never mutated. This is the function `t-scene.mjs` spends most of its
 * assertions on, because everything a family reads comes from here.
 *
 * Accepts either raw CODAP field names (`xAttributeName`, `yAttributeName`,
 * `legendAttributeName`) or the already-shortened ones used by
 * `DemoDriver.snapshot()` (`x`, `y`, `legend`), because both call sites exist on
 * disk today and neither is going to be rewritten by this module's owner.
 *
 * @param {Array<object>} componentValues
 *   One entry per component, as `get component[id]` returns them. Non-graph
 *   components are ignored, not an error: a case table is on screen too, it just
 *   plots nothing.
 * @param {object} [options]
 * @param {string[]} [options.attributeNames]
 *   The dataset's FULL attribute list, e.g. `dataset.attrs.map((a) => a.name)`.
 *   Required for `unplottedAttrs` to mean anything — see constraint 3. Omitted,
 *   `unplottedAttrs` is `[]`.
 * @param {number} [options.sceneVersion]
 *   Carried through unchanged. A pure function cannot decide whether the scene
 *   changed since a read it did not perform; `createSceneModel` owns the
 *   increment.
 * @returns {object} SceneModel: `{ graphs, derived }`.
 */
export function deriveScene(componentValues, options = {}) {
  const {
    attributeNames = [],
    sceneVersion = INITIAL_SCENE_VERSION,
  } = options ?? {};

  const graphs = [];
  for (const v of Array.isArray(componentValues) ? componentValues : []) {
    if (!v || typeof v !== 'object') continue;
    if (String(v.type ?? '').toLowerCase() !== GRAPH_COMPONENT_TYPE) continue;

    const x = attrOrNull(v.xAttributeName ?? v.x);
    const y = attrOrNull(v.yAttributeName ?? v.y);
    const legend = attrOrNull(v.legendAttributeName ?? v.legend);
    const declared = typeof v.plotType === 'string' ? v.plotType.trim() : '';

    graphs.push({
      id: v.id ?? null,
      plotType: declared === '' ? inferPlotType(x, y) : declared,
      x,
      y,
      legend,
      dataContext: attrOrNull(v.dataContext ?? v.dataContextName),
    });
  }
  graphs.sort(byId);

  // --- plottedAttrs -------------------------------------------------------
  // A legend attribute is ON SCREEN, so it counts as plotted. Sorted, because
  // the order graphs happen to arrive in is not information.
  const plotted = new Set();
  for (const g of graphs) {
    for (const name of [g.x, g.y, g.legend]) if (name) plotted.add(name);
  }
  const plottedAttrs = [...plotted].sort();

  // --- unplottedAttrs -----------------------------------------------------
  // Dataset order preserved: it is the caller's order and it is meaningful.
  const unplottedAttrs = [];
  const seenAttr = new Set();
  for (const name of Array.isArray(attributeNames) ? attributeNames : []) {
    if (typeof name !== 'string' || name === '') continue;
    if (plotted.has(name) || seenAttr.has(name)) continue;
    seenAttr.add(name);
    unplottedAttrs.push(name);
  }

  // --- attrPairsPlotted ---------------------------------------------------
  // Every unordered pair the student can already see TOGETHER — including
  // x-with-legend, because a legend is a second dimension already answered.
  // Each pair alphabetised internally, the list sorted and de-duplicated, so
  // `[a, b]` and `[b, a]` can never both appear and a family's `some()` check
  // needs no normalising of its own.
  const pairKeys = new Set();
  const attrPairsPlotted = [];
  for (const g of graphs) {
    const names = [...new Set([g.x, g.y, g.legend].filter(Boolean))];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const pair = [names[i], names[j]].sort();
        const key = `${pair[0]} ${pair[1]}`;
        if (pairKeys.has(key)) continue;
        pairKeys.add(key);
        attrPairsPlotted.push(pair);
      }
    }
  }
  attrPairsPlotted.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  return { graphs, derived: { plottedAttrs, unplottedAttrs, attrPairsPlotted, sceneVersion } };
}

/** Canonical text of the graphs, for "did the scene actually change?". Key
 *  order is fixed because `deriveScene` builds every entry the same way. */
function graphSignature(graphs) {
  return JSON.stringify(graphs);
}

/**
 * THE THIN ASYNC SHELL. Reads CODAP through an injected function and keeps a
 * monotonically-healed SceneModel.
 *
 * Nothing in here knows what an iframe is. `read` is the only door to the
 * outside, which is why the whole controller runs in node under a fake reader.
 *
 * @param {object} deps
 * @param {(action: string, resource: string) => Promise<object|null>} deps.read
 *   Exactly the contract of `DemoDriver.api()` (`demo-driver.js:254`): resolves
 *   to CODAP's reply, or to `null` when the reply never came. It must never
 *   reject and must never retry a write — this module only ever issues `get`.
 * @param {(() => string[])|string[]} [deps.attributeNames]
 *   The dataset's full attribute list, or a function returning it. A function,
 *   because the dataset outlives any one read and the student can add a column.
 * @param {() => boolean} [deps.isSuspended]
 *   Called before every read. W3 must pass `() => isDriverSuspended(driver)` —
 *   see constraint 1. Default: never suspended.
 * @param {boolean} [deps.prime]
 *   Perform one read before resolving, so the caller has a scene in hand rather
 *   than an empty one it must remember to refresh. A failed prime is harmless:
 *   the scene stays empty at version 0, which is exactly what happened. Pass
 *   `false` when a test wants to count reads from zero.
 * @returns {Promise<object>} the controller.
 */
export async function createSceneModel(deps = {}) {
  const { read, attributeNames = [], isSuspended = () => false, prime = true } = deps;
  if (typeof read !== 'function') {
    throw new TypeError('createSceneModel: `read` must be a function');
  }
  const namesOf = typeof attributeNames === 'function'
    ? attributeNames
    : () => attributeNames;

  /** id (as a string key) -> last AFFIRMATIVELY observed component values. */
  let known = new Map();
  let version = INITIAL_SCENE_VERSION;
  let scene = deriveScene([], { attributeNames: namesOf(), sceneVersion: version });
  let signature = graphSignature(scene.graphs);
  let inflight = null;

  const health = {
    reads: 0,          // refresh() calls that actually issued a componentList read
    suspends: 0,       // refresh() calls short-circuited by isSuspended()
    listFailures: 0,   // componentList reads that taught nothing (the three below)
    listDropped: 0,    //   ...of those: no reply came
    listRefusals: 0,   //   ...of those: CODAP answered success:false
    listMalformed: 0,  //   ...of those: a reply came and could not be parsed
    droppedReplies: 0, // per-component replies dropped, cumulative
    lastReason: null,
    lastStaleIds: [],
    lastRemovedIds: [],
  };

  /** `read` is foreign code; a throw from it is a dropped reply, not a crash. */
  async function safeRead(action, resource) {
    try {
      return await read(action, resource);
    } catch {
      return null;
    }
  }

  function result(ok, reason, changed = false, staleIds = [], removedIds = []) {
    health.lastReason = reason;
    health.lastStaleIds = staleIds;
    health.lastRemovedIds = removedIds;
    return { ok, reason, changed, staleIds, removedIds, sceneVersion: version, scene };
  }

  async function doRead() {
    health.reads++;

    const list = await safeRead('get', 'componentList');
    if (list == null) {
      health.listFailures++;
      health.listDropped++;
      return result(false, READ_REASONS.LIST_DROPPED);
    }
    if (typeof list === 'object' && !Array.isArray(list) && list.success === false) {
      health.listFailures++;
      health.listRefusals++;
      return result(false, READ_REASONS.LIST_REFUSED);
    }
    // A reply that arrived but cannot be read is a FAILED READ, not evidence of
    // absence. Falling through here with `values: []` would empty the scene and
    // report every component as removed — constraint 2's failure, arriving
    // through the list instead of through a component reply.
    if (!isWellFormedList(list)) {
      health.listFailures++;
      health.listMalformed++;
      return result(false, READ_REASONS.LIST_MALFORMED);
    }

    const items = list.values;
    // CONCURRENT, never serial — see the header's cost note.
    const replies = await Promise.all(
      items.map((item) => safeRead('get', `component[${item.id}]`)),
    );

    const next = new Map();
    const staleIds = [];
    const listedKeys = new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i] ?? {};
      const key = String(item.id);
      listedKeys.add(key);
      const reply = replies[i];
      const values = reply && reply.success !== false && reply.values && typeof reply.values === 'object'
        ? reply.values
        : null;
      if (values) {
        next.set(key, { ...values, id: values.id ?? item.id, type: values.type ?? item.type });
        continue;
      }
      // No affirmative observation. The LIST still names it, and the list is
      // the sole authority on existence — so it survives, unchanged and stale.
      health.droppedReplies++;
      staleIds.push(item.id);
      if (known.has(key)) next.set(key, known.get(key));
    }

    // The only place anything is ever removed: a SUCCESSFUL list that omits it.
    const removedIds = [];
    for (const [key, values] of known) {
      if (!listedKeys.has(key)) removedIds.push(values.id ?? key);
    }

    known = next;
    const derivedScene = deriveScene([...known.values()], {
      attributeNames: namesOf(),
      sceneVersion: version,
    });
    const nextSignature = graphSignature(derivedScene.graphs);
    const changed = nextSignature !== signature;
    if (changed) {
      version += 1;
      signature = nextSignature;
      derivedScene.derived.sceneVersion = version;
    }
    scene = derivedScene;

    return staleIds.length === 0
      ? result(true, READ_REASONS.OK, changed, staleIds, removedIds)
      : result(false, READ_REASONS.PARTIAL, changed, staleIds, removedIds);
  }

  /**
   * One snapshot of the scene.
   *
   * De-duplicated: a call made while another is in flight joins that one rather
   * than fanning a second set of reads out over the same phone. A poll loop
   * plus a notification-triggered refresh would otherwise stack.
   *
   * @returns {Promise<{ok: boolean, reason: string, changed: boolean,
   *   staleIds: Array<string|number>, removedIds: Array<string|number>,
   *   sceneVersion: number, scene: object}>}
   */
  function refresh() {
    if (isSuspended()) {
      health.suspends++;
      return Promise.resolve(result(false, READ_REASONS.SUSPENDED));
    }
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        return await doRead();
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  const controller = {
    refresh,
    /** The current SceneModel. Never null; empty at version 0 before any read. */
    get scene() { return scene; },
    /** Monotone. 0 means never successfully read. */
    get sceneVersion() { return version; },
    /** Counters and last-read diagnosis. Read-only by convention. */
    get health() { return health; },
  };

  if (prime) await refresh();
  return controller;
}
