/**
 * inject-tests-suite.js — the Phase 9 P0 primitive assertions.
 *
 * Every primitive is driven ONLY through synthetic input into the same-origin
 * CODAP iframe and asserted ONLY through the Data Interactive API. Where a
 * recipe was unknown when this was written, the test tries a short list of
 * candidate recipes and REPORTS the one that worked — that reported string is
 * what gets copied into the P0 VERIFICATION TABLE in docs/PHASE9-SHOWME.md.
 *
 * Fixture: the 12-row Mammals dataset from inject-test.js (Mass has a single
 * far outlier, African Elephant = 6654).
 */

const OUTLIER = { attr: 'Mass', value: 6654, mammal: 'African Elephant' };

export async function runSuite(ctx) {
  const { test, api, verify, line, head, injector, SEL, cdoc, cwin,
          componentList, component, selectionCount, items, sleep } = ctx;
  const inj = injector();
  const d = () => cdoc();
  const recipes = {};        // primitive -> the recipe string that worked

  // ------------------------------------------------------------- helpers
  const q = (sel, root = d()) => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`selector not found: ${sel}`);
    return el;
  };
  const graphEl = () => q('[data-testid="codap-graph"]');
  const graphs = async () => (await componentList()).filter((c) => /graph/i.test(c.type));
  const graphId = async () => {
    const g = await graphs();
    if (!g.length) throw new Error('no graph component');
    return g[g.length - 1].id;
  };
  const rectOf = (sel, root = d()) => q(sel, root).getBoundingClientRect();
  const plotRect = () => rectOf('[data-testid="plot-cell-background"]', graphEl());
  const undoBtn = () => q('[data-testid="tool-shelf-button-undo"]');
  const undoOnce = async () => { await inj.click(undoBtn()); await sleep(800); };
  /**
   * Escape does NOT close a Chakra menu opened by injection (measured P0: the
   * menu never took keyboard focus, so nothing listens). Clicking the trigger
   * again toggles it closed, which is what a student's second click does too.
   */
  const closeMenu = async (triggerEl) => { await inj.click(triggerEl); await sleep(400); };

  /** Wipe every component so each run starts from the same document. */
  async function cleanSlate() {
    for (const c of await componentList()) {
      if (!/caseTable/i.test(c.type)) await api('delete', `component[${c.id}]`);
    }
    await api('create', 'dataContext[Mammals].selectionList', []);
    await sleep(500);
  }

  /**
   * Try candidate recipes in order; the first one whose `check` passes wins.
   * Returns its label. Throws listing everything tried if none works — an
   * honest failure names the exact attempts (work order's closing line).
   */
  async function tryRecipes(label, candidates) {
    const tried = [];
    for (const { name, run, check, reset } of candidates) {
      try {
        await run();
        await sleep(600);
        if (await check()) { recipes[label] = name; return name; }
        tried.push(`${name}: no effect`);
      } catch (err) {
        tried.push(`${name}: ${err.message}`);
      }
      await reset?.().catch(() => {});
    }
    throw new Error(`no recipe worked for ${label} — tried [${tried.join('; ')}]`);
  }

  const selectedCases = async () => {
    const r = await api('get', 'dataContext[Mammals].selectionList');
    return r?.success ? (r.values ?? []) : [];
  };
  const caseValues = async (caseID) => {
    const r = await api('get', `dataContext[Mammals].caseByID[${caseID}]`);
    return r?.values?.case?.values ?? r?.values?.values ?? null;
  };
  const clearSelection = async () => {
    await api('create', 'dataContext[Mammals].selectionList', []);
    await sleep(400);
  };

  /**
   * Screen position of a plotted case. Same-origin means the plot rect is the
   * canvas's own `getBoundingClientRect()` — exact, no calibration (the spike's
   * promise, now cashed). On a scatterplot y is exact too; on a dot plot the
   * point sits in a stacked row just above the axis, so y is swept.
   */
  async function pointXY(itemValues) {
    const c = await component(await graphId());
    const r = plotRect();
    const frac = (v, lo, hi) => (Number(v) - lo) / (hi - lo);
    const x = r.left + frac(itemValues[c.xAttributeName], c.xLowerBound, c.xUpperBound) * r.width;
    if (c.yAttributeName) {
      const y = r.bottom
        - frac(itemValues[c.yAttributeName], c.yLowerBound, c.yUpperBound) * r.height;
      return { x, y, mode: 'scatterplot' };
    }
    return { x, y: null, bottom: r.bottom, mode: 'dotPlot' };
  }

  // =====================================================================
  head('--- P0 primitives ---');
  await cleanSlate();

  // ------------------------------------------------------------ P1 click
  await test('P1 click a UI element (tool-shelf Graph button)', async () => {
    const before = (await graphs()).length;
    await inj.click(q(SEL.toolbarGraph));
    await verify(async () => (await graphs()).length, (n) => n === before + 1,
      { what: 'graph created' });
    recipes.P1 = 'single MouseEvent("click") on [data-testid=tool-shelf-button-graph]';
    return recipes.P1;
  });

  // -------------------------------------------------- P2 toolbar menu
  await test('P2a toolbar menu opens + lists items (Tables)', async () => {
    await inj.menuOpen(q(SEL.toolbarTable));
    const list = await inj.waitFor(() => {
      const l = d().querySelector(SEL.tableMenuList);
      return inj.isMenuOpen(l) ? l : null;
    }, { timeoutSec: 4, what: 'tables menu open' });
    const its = inj.menuItems(list);
    if (its.length < 2) throw new Error(`only ${its.length} menu items`);
    const ids = its.map((e) => e.getAttribute('data-testid'));
    await closeMenu(q(SEL.toolbarTable));
    if (inj.isMenuOpen(d().querySelector(SEL.tableMenuList))) {
      throw new Error('menu did not close on a second trigger click');
    }
    recipes.P2a = `one click on the shelf button opens; items ${JSON.stringify(ids)}; `
      + 'a second click closes (Escape does NOT — no keyboard focus)';
    return recipes.P2a;
  });

  // ---------------------------------------------------- P3 pill -> axis
  await test('P3 drag attribute pill -> x axis drop zone', async () => {
    const gid = await graphId();
    await inj.dragAttribute(q(SEL.pill('Mass')), q(SEL.dropBottom));
    const c = await verify(() => component(gid), (v) => v?.xAttributeName === 'Mass',
      { what: 'Mass on x' });
    recipes.P3 = 'inj.dragAttribute — pointerdown on the '
      + '[aria-roledescription=draggable] wrapper (NOT the pill button); '
      + '16 pointermoves on document; pointerup on DOCUMENT';
    return `xAttributeName=${c.xAttributeName} plotType=${c.plotType}`;
  });

  await test('P3b drag attribute pill -> y axis drop zone', async () => {
    const gid = await graphId();
    await inj.dragAttribute(q(SEL.pill('Sleep')), q(SEL.dropLeft));
    const c = await verify(() => component(gid), (v) => v?.yAttributeName === 'Sleep',
      { what: 'Sleep on y' });
    return `yAttributeName=${c.yAttributeName} plotType=${c.plotType}`;
  });

  // remove y again so the rest of the suite runs on a dot plot
  await test('P2b axis attribute menu opens + removes the y attribute', async () => {
    const gid = await graphId();
    const listEl = () => d().querySelector('[data-testid="axis-legend-attribute-menu-list-left"]');
    const trigger = () => q('[data-testid="axis-legend-attribute-button-left"]', graphEl());
    await tryRecipes('P2b-open', [
      { name: 'single click on [data-testid=axis-legend-attribute-button-left]',
        run: () => inj.click(trigger(), { full: false }),
        check: async () => inj.isMenuOpen(listEl()),
        reset: async () => { await inj.click(trigger(), { full: false }); await sleep(300); } },
      { name: 'full pointer sequence on [data-testid=axis-legend-attribute-button-left]',
        run: () => inj.click(trigger(), { full: true }),
        check: async () => inj.isMenuOpen(listEl()),
        reset: async () => { await inj.click(trigger(), { full: true }); await sleep(300); } },
      { name: 'single click on the wrapper [data-testid=attribute-label-menu-left]',
        run: () => inj.click(q('[data-testid="attribute-label-menu-left"]', graphEl()),
          { full: false }),
        check: async () => inj.isMenuOpen(listEl()) },
    ]);
    const list = listEl();
    const its = inj.menuItems(list);
    // Index only — labels contain lookalike Unicode (gotcha #2). The remove
    // entry is the one after the attribute list; find it by position from the
    // end rather than by reading text.
    const idx = its.findIndex((e) => /^Remove/.test(e.textContent || ''));
    if (idx < 0) throw new Error(`no remove item among ${its.length}`);
    await inj.menuChoose(its[idx]);
    const c = await verify(() => component(gid), (v) => !v?.yAttributeName,
      { what: 'y attribute removed' });
    recipes.P2b = `${recipes['P2b-open']} -> `
      + `[data-testid=axis-legend-attribute-menu-list-left]; ${its.length} items `
      + `(no data-testids — index only), "Remove" at index ${idx}`;
    return `${its.length} items, removed at index ${idx} (yAttr=${c.yAttributeName ?? 'none'})`;
  });

  // ------------------------------------------- P2c case-table column menu
  await test('P2c case-table column menu opens (attribute pill)', async () => {
    const pill = q(SEL.pill('Sleep'));
    await inj.menuOpen(pill);
    const listId = pill.getAttribute('aria-controls');
    const list = await inj.waitFor(() => {
      const l = d().getElementById(listId);
      return inj.isMenuOpen(l) ? l : null;
    }, { timeoutSec: 4, what: 'column menu open' });
    const its = inj.menuItems(list);
    const labels = its.map((e) => (e.textContent || '').slice(0, 24));
    await closeMenu(pill);
    recipes.P2c = 'FULL pointer sequence on the pill button (a lone click does '
      + `NOT open it); items by index: ${JSON.stringify(labels)}`;
    return `${its.length} items`;
  });

  // ------------------------------------------------------ P5a click point
  await test('P5a click a plotted point selects exactly that case', async () => {
    await clearSelection();
    const all = await items();
    const outlier = all.find((it) =>
      Number((it.values ?? it)[OUTLIER.attr]) === OUTLIER.value);
    if (!outlier) throw new Error('outlier item not in the fixture');
    const vals0 = outlier.values ?? outlier;
    const pos = await pointXY(vals0);
    const candidates = pos.mode === 'scatterplot'
      ? [{ name: `click at the computed (x, y) of ${OUTLIER.mammal} on a scatterplot`,
           run: () => inj.click({ x: pos.x, y: pos.y }, { full: true }),
           check: async () => (await selectedCases()).length === 1,
           reset: clearSelection }]
      // dot plot: the lone outlier sits in the bottom row; sweep a few radii
      : [6, 10, 14, 18].map((dy) => ({
          name: `click at (x(${OUTLIER.value}), plotBottom-${dy}) on a dot plot`,
          run: () => inj.click({ x: pos.x, y: pos.bottom - dy }, { full: true }),
          check: async () => (await selectedCases()).length === 1,
          reset: clearSelection,
        }));
    const name = await tryRecipes('P5a', candidates);
    const sel = await selectedCases();
    const vals = await caseValues(sel[0].caseID ?? sel[0].id);
    if (!vals || Number(vals[OUTLIER.attr]) !== OUTLIER.value) {
      throw new Error(`selected the wrong case: ${JSON.stringify(vals)}`);
    }
    return `${name} -> ${vals.Mammal}`;
  });

  // ------------------------- unknown #7: does selectCases:[] clear it?
  await test('P0.7 selectCases:[] clears a click-made selection', async () => {
    if ((await selectedCases()).length === 0) throw new Error('nothing selected to clear');
    await clearSelection();
    const n = (await selectedCases()).length;
    if (n !== 0) throw new Error(`still ${n} selected`);
    recipes['P0.7'] = 'create dataContext[X].selectionList [] clears it (verified)';
    return 'cleared';
  });

  // --------------------------------------------------------- P6 marquee
  await test('P6 marquee-select on the plot canvas', async () => {
    await clearSelection();
    const r = plotRect();
    const name = await tryRecipes('P6', [
      { name: 'drag plot top-left -> bottom-right (inset 6px)',
        run: () => inj.marquee({ x: r.left + 6, y: r.top + 6 },
                               { x: r.right - 6, y: r.bottom - 6 }),
        check: async () => (await selectedCases()).length >= 2,
        reset: clearSelection },
      { name: 'drag plot bottom-left -> top-right (inset 4px)',
        run: () => inj.marquee({ x: r.left + 4, y: r.bottom - 4 },
                               { x: r.right - 4, y: r.top + 4 }),
        check: async () => (await selectedCases()).length >= 2,
        reset: clearSelection },
    ]);
    const n = (await selectedCases()).length;
    await clearSelection();
    return `${name} -> ${n} cases`;
  });

  // ------------------------------------------------- P4 title-bar drag
  await test('P4 drag a component by its title bar', async () => {
    const gid = await graphId();
    const before = (await component(gid)).position;
    const bar = q('.component-title-bar', graphEl());
    const br = bar.getBoundingClientRect();
    const from = { x: br.left + 16, y: br.top + br.height / 2 };
    const to = { x: from.x - 60, y: from.y + 90 };
    await inj.dragTile(bar, to, { startAt: from });
    const after = await verify(async () => (await component(gid)).position,
      (p) => p && (Math.abs(p.left - before.left) > 20 || Math.abs(p.top - before.top) > 20),
      { what: 'component moved' });
    const dx = after.left - before.left; const dy = after.top - before.top;
    const err = Math.hypot(dx - (to.x - from.x), dy - (to.y - from.y));
    recipes.P4 = 'inj.dragTile — pointer down/move/up ALL dispatched on the '
      + '.component-title-bar element itself (document- or window-targeted '
      + `moves do nothing); landing error ${err.toFixed(1)}px`;
    return `moved (${dx}, ${dy}) vs requested (${to.x - from.x}, ${to.y - from.y}); err ${err.toFixed(1)}px`;
  });

  // -------------------------------------------------- P9 axis rescale
  await test('P9 axis drag rescales / pans the x axis', async () => {
    const gid = await graphId();
    const before = await component(gid);
    const boundsChanged = async () => {
      const c = await component(gid);
      return Math.abs((c.xLowerBound ?? 0) - (before.xLowerBound ?? 0)) > 1e-6
          || Math.abs((c.xUpperBound ?? 0) - (before.xUpperBound ?? 0)) > 1e-6;
    };
    const name = await tryRecipes('P9', [
      { name: 'inj.dragAxis(rect.dragRect.h-translate, +60) — MOUSE events, '
            + 'moves on window (pointer events do nothing on the axis)',
        run: () => inj.dragAxis(q('rect.dragRect.h-translate', graphEl()), 60),
        check: boundsChanged },
      { name: 'inj.dragAxis(rect.dragRect.h-upper-dilate, -60)',
        run: () => inj.dragAxis(q('rect.dragRect.h-upper-dilate', graphEl()), -60),
        check: boundsChanged },
    ]);
    const c = await component(gid);
    return `${name}: [${before.xLowerBound}, ${before.xUpperBound}] -> `
      + `[${c.xLowerBound?.toFixed?.(1) ?? c.xLowerBound}, ${c.xUpperBound?.toFixed?.(1) ?? c.xUpperBound}]`;
  });

  // --------------------------------------------------------- P7 typing
  await test('P7 type text (component title)', async () => {
    const gid = await graphId();
    const NEW_TITLE = 'Dot Was Here';
    const titleBtn = () => q('[data-testid="title-text"]', graphEl());
    const findInput = () =>
      graphEl().querySelector('[data-testid="component-title-bar"] input, '
                            + '[data-testid="component-title-bar"] [contenteditable="true"]');
    const name = await tryRecipes('P7', [
      { name: 'full-sequence click on [data-testid=title-text], then keystrokes + Enter',
        run: async () => {
          await inj.click(titleBtn());
          const input = await inj.waitFor(findInput, { timeoutSec: 3, what: 'title input' });
          await inj.typeText(input, NEW_TITLE, { cps: 20, tap: false });
          await inj.pressKey('Enter', input);
        },
        check: async () => (await component(gid))?.title === NEW_TITLE },
      { name: 'double full-sequence click on the title, then keystrokes + Enter',
        run: async () => {
          await inj.click(titleBtn()); await sleep(120); await inj.click(titleBtn());
          const input = await inj.waitFor(findInput, { timeoutSec: 3, what: 'title input' });
          await inj.typeText(input, NEW_TITLE, { cps: 20, tap: false });
          await inj.pressKey('Enter', input);
        },
        check: async () => (await component(gid))?.title === NEW_TITLE },
    ]);
    return `${name} -> title "${(await component(gid)).title}"`;
  });

  head('--- recipes (copy into the P0 table) ---');
  for (const [k, v] of Object.entries(recipes)) line(`${k}: ${v}`);
  ctx.recipes = recipes;
  window.__recipes = recipes;
  return recipes;
}
