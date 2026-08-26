/**
 * inject-unknowns.js — Phase 9 P0 empirical unknowns #4, #5, #6 and the
 * redo-residue question. Separate from the pass/fail primitive suite because
 * these produce MEASUREMENTS, not verdicts; the numbers go straight into the
 * P0 VERIFICATION TABLE in docs/PHASE9-SHOWME.md.
 *
 * Driven from the console (or from bash via agent-browser eval) so that a
 * step can be paused mid-drag while a screenshot or a trusted mouse move is
 * fired from outside the page.
 */

export function installUnknowns(ctx) {
  const { api, verify, line, head, injector, SEL, cdoc, componentList,
          component, items, sleep } = ctx;
  const inj = () => injector();
  const d = () => cdoc();
  const q = (sel, root = d()) => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`selector not found: ${sel}`);
    return el;
  };
  const graphEl = () => q('[data-testid="codap-graph"]');
  const graphId = async () => {
    const g = (await componentList()).filter((c) => /graph/i.test(c.type));
    if (!g.length) throw new Error('no graph');
    return g[g.length - 1].id;
  };
  const plotRect = () => q('[data-testid="plot-cell-background"]', graphEl()).getBoundingClientRect();
  const selection = async () => {
    const r = await api('get', 'dataContext[Mammals].selectionList');
    return r?.success ? (r.values ?? []).length : -1;
  };
  const clearSelection = async () => {
    await api('create', 'dataContext[Mammals].selectionList', []);
    await sleep(300);
  };

  // ---------------------------------------------------------- state diff
  /** The revert authority from the work order: state, never counts. */
  async function snapshot() {
    const comps = await componentList();
    const out = { components: [], selection: await selection() };
    for (const c of comps) {
      const v = await component(c.id);
      out.components.push({
        id: c.id, type: c.type, title: v?.title,
        left: v?.position?.left, top: v?.position?.top,
        w: v?.dimensions?.width, h: v?.dimensions?.height,
        x: v?.xAttributeName ?? null, y: v?.yAttributeName ?? null,
        legend: v?.legendAttributeName ?? null,
        xLo: v?.xLowerBound ?? null, xHi: v?.xUpperBound ?? null,
      });
    }
    out.components.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const undoBtn = () => q('[data-testid="tool-shelf-button-undo"]');
  const redoBtn = () => q('[data-testid="tool-shelf-button-redo"]');
  const undoDisabled = () => undoBtn().disabled || undoBtn().getAttribute('aria-disabled') === 'true';

  // ------------------------------------------------------- unknown #4
  /**
   * For each primitive: perform it, then click Undo until the document
   * matches the pre-action snapshot. Records the click count, or that the
   * effect is NOT on the undo stack (which is what `inverseSteps` is for).
   */
  async function undoMechanics() {
    head('--- P0.4 undo mechanics (clicks to revert each primitive) ---');
    const results = [];
    const cases = [
      { name: 'create a graph (tool-shelf click)',
        act: async () => { await inj().click(q(SEL.toolbarGraph)); await sleep(2000); } },
      { name: 'drag pill Mass -> x axis',
        act: async () => {
          await inj().dragAttribute(q(SEL.pill('Mass')), q(SEL.dropBottom));
          await sleep(1500);
        } },
      { name: 'drag pill Sleep -> y axis (on top of x)',
        pre: async () => {
          await inj().dragAttribute(q(SEL.pill('Mass')), q(SEL.dropBottom));
          await sleep(1500);
        },
        act: async () => {
          await inj().dragAttribute(q(SEL.pill('Sleep')), q(SEL.dropLeft));
          await sleep(1500);
        } },
      { name: 'move a tile by its title bar',
        act: async () => {
          const bar = q('.component-title-bar', graphEl());
          const r = bar.getBoundingClientRect();
          const from = { x: r.left + 16, y: r.top + r.height / 2 };
          await inj().dragTile(bar, { x: from.x - 50, y: from.y + 70 }, { startAt: from });
          await sleep(1200);
        } },
      { name: 'pan the x axis (d3 dragRect)',
        pre: async () => {
          await inj().dragAttribute(q(SEL.pill('Mass')), q(SEL.dropBottom));
          await sleep(1500);
        },
        act: async () => {
          await inj().dragAxis(q('rect.dragRect.h-translate', graphEl()), 60);
          await sleep(1200);
        } },
      { name: 'select cases by marquee',
        pre: async () => {
          await inj().dragAttribute(q(SEL.pill('Mass')), q(SEL.dropBottom));
          await sleep(1500);
        },
        act: async () => {
          const r = plotRect();
          await inj().marquee({ x: r.left + 6, y: r.top + 6 },
                              { x: r.right - 6, y: r.bottom - 6 });
          await sleep(1200);
        } },
      { name: 'rename a component title (typing)',
        act: async () => {
          await inj().click(q('[data-testid="title-text"]', graphEl()));
          const input = await inj().waitFor(
            () => graphEl().querySelector('[data-testid="component-title-bar"] input'),
            { timeoutSec: 3, what: 'title input' });
          await inj().typeText(input, 'Undo Probe', { cps: 25, tap: false });
          await inj().pressKey('Enter', input);
          await sleep(1200);
        } },
    ];

    for (const c of cases) {
      // fresh graph for every case
      for (const comp of await componentList()) {
        if (!/caseTable/i.test(comp.type)) await api('delete', `component[${comp.id}]`);
      }
      await clearSelection();
      await sleep(600);
      if (c.name !== 'create a graph (tool-shelf click)') {
        await inj().click(q(SEL.toolbarGraph));
        await sleep(2000);
      }
      await c.pre?.();
      const before = await snapshot();
      await c.act();
      const after = await snapshot();
      if (same(before, after)) {
        results.push({ name: c.name, note: 'NO observable state change — skipped' });
        line(`P0.4 ${c.name}: no state change to undo`, 'fail');
        continue;
      }
      let clicks = 0;
      let reverted = false;
      for (; clicks < 6; ) {
        await inj().click(undoBtn());
        clicks += 1;
        await sleep(900);
        if (same(await snapshot(), before)) { reverted = true; break; }
      }
      // redo residue: does one Redo click put it back?
      let redoRestores = null;
      if (reverted) {
        await inj().click(redoBtn());
        await sleep(1000);
        redoRestores = same(await snapshot(), after);
        // put it back for the next case
        for (let i = 0; i < clicks && redoRestores; i++) {
          await inj().click(undoBtn());
          await sleep(700);
        }
      }
      results.push({ name: c.name, undoClicks: reverted ? clicks : null,
                     revertedByUndo: reverted, redoRestores });
      line(`P0.4 ${c.name}: ${reverted ? `${clicks} undo click(s)` : 'NOT undoable in 6 clicks'}`
        + (redoRestores === null ? '' : `; redo restores it: ${redoRestores}`),
        reverted ? 'pass' : 'fail');
    }
    window.__undoResults = results;
    return results;
  }

  // ------------------------------------------------------- unknown #6
  /**
   * Point-drag displacement. Holds the point at the displaced position so a
   * screenshot can be taken from outside the page (PixiJS renders to a WebGL
   * canvas, so pixel truth comes from a screenshot — BAT-A-POINT.md method).
   */
  const OUTLIER_MASS = 6654;
  async function outlierPoint() {
    const c = await component(await graphId());
    const all = await items();
    const it = all.map((i) => i.values ?? i)
                  .find((v) => Number(v.Mass) === OUTLIER_MASS);
    const r = plotRect();
    const x = r.left + ((OUTLIER_MASS - c.xLowerBound) / (c.xUpperBound - c.xLowerBound)) * r.width;
    if (c.yAttributeName) {
      const y = r.bottom
        - ((Number(it[c.yAttributeName]) - c.yLowerBound) / (c.yUpperBound - c.yLowerBound)) * r.height;
      return { x, y, mode: 'scatterplot' };
    }
    return { x, y: r.bottom - 6, mode: 'dotPlot' };
  }

  /** Press the outlier and drag it `dx` px, then HOLD until `release()`. */
  async function holdPointDrag(dx, dy = 0) {
    const p = await outlierPoint();
    const canvas = q('canvas', graphEl());
    const w = inj().win;
    const pid = 777;
    const pe = (t, pt, ex = {}) => {
      const e = new w.PointerEvent(t, { bubbles: true, cancelable: true, composed: true,
        view: w, clientX: pt.x, clientY: pt.y, screenX: pt.x, screenY: pt.y,
        pointerId: pid, pointerType: 'mouse', isPrimary: true, button: 0,
        buttons: 1, pressure: 0.5, ...ex });
      e.__dotDemo = true;
      return e;
    };
    canvas.dispatchEvent(pe('pointerdown', p));
    await sleep(80);
    for (let i = 1; i <= 8; i++) {
      const pt = { x: p.x + (dx * i) / 8, y: p.y + (dy * i) / 8 };
      d().dispatchEvent(pe('pointermove', pt));
      await sleep(30);
    }
    window.__releasePoint = async () => {
      d().dispatchEvent(pe('pointerup', { x: p.x + dx, y: p.y + dy },
        { buttons: 0, pressure: 0 }));
      await sleep(1200);
    };
    return { start: p, requested: { dx, dy } };
  }

  /**
   * unknown #6b — scatterplot drags are allowed to flicker table values
   * (Chad, 2026-08-25) ONLY if they snap back exactly. Compares itemSearch
   * before / during the hold / after release, byte for byte.
   */
  async function scatterIdentity() {
    head('--- P0.6b scatterplot point-drag data identity ---');
    const norm = (arr) => JSON.stringify(
      arr.map((i) => i.values ?? i)
         .sort((a, b) => String(a.Mammal).localeCompare(String(b.Mammal))));
    const before = norm(await items());
    await holdPointDrag(70, -40);
    const during = norm(await items());
    await window.__releasePoint();
    await sleep(1500);
    const after = norm(await items());
    const res = {
      duringDiffers: during !== before,
      afterIdenticalToBefore: after === before,
      beforeLen: before.length,
    };
    line(`P0.6b during-drag values differ: ${res.duringDiffers}; `
      + `after == before byte-identical: ${res.afterIdenticalToBefore}`,
      res.afterIdenticalToBefore ? 'pass' : 'fail');
    window.__scatterIdentity = res;
    return res;
  }

  /** Set the graph up as a Mass dot plot (for #6a) or Mass x Sleep scatter. */
  async function setupPlot(kind = 'dot') {
    for (const comp of await componentList()) {
      if (!/caseTable/i.test(comp.type)) await api('delete', `component[${comp.id}]`);
    }
    await clearSelection();
    await sleep(600);
    await inj().click(q(SEL.toolbarGraph));
    await sleep(2000);
    await inj().dragAttribute(q(SEL.pill('Mass')), q(SEL.dropBottom));
    await sleep(1600);
    if (kind === 'scatter') {
      await inj().dragAttribute(q(SEL.pill('Sleep')), q(SEL.dropLeft));
      await sleep(1600);
    }
    const gid = await graphId();
    const c = await component(gid);
    line(`plot ready: ${c.plotType} x=${c.xAttributeName} y=${c.yAttributeName ?? '-'}`);
    return { gid, plotType: c.plotType, point: await outlierPoint(), plot: (({ left, top, width, height }) =>
      ({ left, top, width, height }))(plotRect()) };
  }

  window.__U = { snapshot, same, undoMechanics, holdPointDrag, scatterIdentity,
                 setupPlot, outlierPoint, clearSelection, plotRect: () => {
                   const r = plotRect();
                   return { left: r.left, top: r.top, width: r.width, height: r.height,
                            right: r.right, bottom: r.bottom };
                 } };
  return window.__U;
}
