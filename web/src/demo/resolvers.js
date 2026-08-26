/**
 * resolvers.js — semantic targets and delta-conditions.
 *
 * Scripts never name pixels. They name UI elements (`toolbar:graph`,
 * `pill:Sleep`, `axisDrop:left`) and the driver resolves them to live elements
 * FRESH at execution time, so a demo written last month still lands after the
 * student has moved the tile.
 *
 * Nothing here is eval'd: `kind:arg[:arg]` is looked up in a closed table.
 * Every resolver throws a typed `TargetNotFound` naming the selector it tried,
 * so a demo aborts with a diagnosis rather than half-dying.
 *
 * Conditions are DELTAS from the demo-start snapshot: `component:graph` means
 * "one MORE graph than when this demo started", which is what makes the demos
 * behave in a document that already has graphs in it.
 *
 * Selector provenance: every `data-testid` below was read off a live CODAP
 * v3.1.0 in P0 and is recorded in the P0 VERIFICATION TABLE. When CODAP
 * renames one, this file and that table are what change.
 */

export class TargetNotFound extends Error {
  constructor(spec, tried) {
    super(`TargetNotFound: ${spec} (tried ${tried})`);
    this.name = 'TargetNotFound';
    this.spec = spec;
    this.tried = tried;
  }
}

export class UnknownTargetKind extends Error {
  constructor(kind, known) {
    super(`unknown target kind "${kind}" (known: ${known.join(', ')})`);
    this.name = 'UnknownTargetKind';
    this.kind = kind;
  }
}

const q = (doc, sel, spec) => {
  const el = doc.querySelector(sel);
  if (!el) throw new TargetNotFound(spec, sel);
  return el;
};

/** Newest component of a type, from the live component list. */
function newestOfType(ctx, typeRe) {
  const list = ctx.components ?? [];
  const hits = list.filter((c) => typeRe.test(c.type));
  return hits[hits.length - 1] ?? null;
}

/** The DOM subtree of the graph a target refers to (index optional, 1-based). */
function graphEl(doc, spec, index) {
  const all = [...doc.querySelectorAll('[data-testid="codap-graph"]')];
  if (!all.length) throw new TargetNotFound(spec, '[data-testid="codap-graph"]');
  const el = index ? all[index - 1] : all[all.length - 1];
  if (!el) throw new TargetNotFound(spec, `codap-graph #${index}`);
  return el;
}

/**
 * Each resolver returns `{ el, rect, clickShape? , dragKind? }`.
 *  - `clickShape` overrides inject.js's auto rule when P0 measured otherwise.
 *  - `dragKind` tells the driver WHICH drag stack this target belongs to
 *    ('attribute' | 'tile' | 'axis' | 'canvas'), because CODAP v3 listens in
 *    four different places (see the P0 table).
 */
export const TARGETS = {
  /** toolbar:graph, toolbar:table, toolbar:map … the tool shelf buttons. */
  toolbar: (args, ctx) => {
    const name = args[0];
    const el = q(ctx.doc, `[data-testid="tool-shelf-button-${name}"]`,
      `toolbar:${name}`);
    return { el, clickShape: 'single' };
  },

  /** undo / redo — their own kinds because revert leans on them constantly. */
  undo: (args, ctx) => ({
    el: q(ctx.doc, '[data-testid="tool-shelf-button-undo"]', 'undo'),
    clickShape: 'single',
  }),
  redo: (args, ctx) => ({
    el: q(ctx.doc, '[data-testid="tool-shelf-button-redo"]', 'redo'),
    clickShape: 'single',
  }),

  /**
   * menu:<list>:<index> — an item in an OPEN menu, picked by INDEX.
   * Never by text: CODAP's labels contain lookalike Unicode ("Νew" begins
   * with Greek capital Nu, U+039D — verified twice).
   */
  menu: (args, ctx) => {
    const [list, idxRaw] = args;
    const idx = Number(idxRaw);
    const sel = list === 'tables' ? '[data-testid="tool-shelf-table-menu-list"]'
      : list === 'axisBottom' ? '[data-testid="axis-legend-attribute-menu-list-bottom"]'
      : list === 'axisLeft' ? '[data-testid="axis-legend-attribute-menu-list-left"]'
      : list === 'column' ? '[data-testid="attribute-menu-list"]'
      : null;
    if (!sel) throw new TargetNotFound(`menu:${list}`, 'known menu lists');
    const listEl = q(ctx.doc, sel, `menu:${list}`);
    const items = [...listEl.querySelectorAll('[role="menuitem"]')];
    if (!items.length) throw new TargetNotFound(`menu:${list}:${idx}`, `${sel} (menu closed)`);
    const el = items[idx];
    if (!el) throw new TargetNotFound(`menu:${list}:${idx}`, `${sel} has ${items.length} items`);
    return { el, clickShape: 'single' };
  },

  /**
   * pill:Mass — a case-table attribute. The DRAGGABLE is the header wrapper,
   * not the button inside it; opening its menu, by contrast, needs the button
   * and the full pointer sequence (P0).
   */
  pill: (args, ctx) => {
    const name = args.join(':');
    const btn = q(ctx.doc, `[data-testid="codap-attribute-button ${name}"]`, `pill:${name}`);
    const handle = btn.closest('[aria-roledescription="draggable"]') ?? btn;
    return { el: btn, dragEl: handle, clickShape: 'full', dragKind: 'attribute' };
  },

  /** axisDrop:bottom | axisDrop:left — the graph's attribute drop zones. */
  axisDrop: (args, ctx) => {
    const side = args[0] === 'left' ? 'left' : 'bottom';
    const g = graphEl(ctx.doc, `axisDrop:${side}`, Number(args[1]) || 0);
    const el = q(g, `[data-testid="add-attribute-drop-${side}"]`, `axisDrop:${side}`);
    return { el, dragKind: 'attribute' };
  },

  /** legendDrop — the plot body, which also accepts a legend attribute. */
  legendDrop: (args, ctx) => {
    const g = graphEl(ctx.doc, 'legendDrop', Number(args[0]) || 0);
    const el = g.querySelector('.droppable-plot')
      ?? g.querySelector('[data-testid="plot-cell-background"]');
    if (!el) throw new TargetNotFound('legendDrop', '.droppable-plot');
    return { el, dragKind: 'attribute' };
  },

  /** plot — the graph's plot canvas (marquee, point clicks). */
  plot: (args, ctx) => {
    const g = graphEl(ctx.doc, 'plot', Number(args[0]) || 0);
    const el = q(g, 'canvas', 'plot');
    return { el, dragKind: 'canvas', clickShape: 'full' };
  },

  /** titleBar:graph[:n] — the tile's draggable title bar. */
  titleBar: (args, ctx) => {
    const [kind, nRaw] = args;
    const n = Number(nRaw) || 0;
    const host = kind === 'graph' ? graphEl(ctx.doc, `titleBar:${kind}`, n)
      : q(ctx.doc, `[data-testid="codap-${kind === 'table' ? 'case-table' : kind}"]`,
          `titleBar:${kind}`);
    const el = host.querySelector('.component-title-bar');
    if (!el) throw new TargetNotFound(`titleBar:${kind}`, '.component-title-bar');
    return { el, dragKind: 'tile', clickShape: 'full' };
  },

  /**
   * inspector:graph:<what> — the tile's inspector palette. It is rendered
   * OUTSIDE the component subtree, and only for the FOCUSED tile (P0), so the
   * driver taps the title bar first when this resolves empty.
   */
  inspector: (args, ctx) => {
    const [kind, what] = args;
    const map = { rescale: 'resize', hideShow: 'hide-show', values: 'display-values',
                  config: 'display-config', styles: 'display-styles', camera: 'camera' };
    const suffix = map[what] ?? what;
    const el = q(ctx.doc, `[data-testid="${kind}-${suffix}-button"]`,
      `inspector:${kind}:${what}`);
    return { el, clickShape: 'full' };
  },

  /**
   * point:outlier:<attr> — a plotted point, located from axis bounds and the
   * canvas rect. Same-origin makes this exact: the plot rect IS the canvas's
   * bounding rect, so no calibration is involved (P0).
   */
  point: (args, ctx) => {
    const [which, attr] = args;
    const g = graphEl(ctx.doc, `point:${which}:${attr}`, 0);
    const canvas = q(g, 'canvas', 'point (canvas)');
    const bg = g.querySelector('[data-testid="plot-cell-background"]') ?? canvas;
    const r = bg.getBoundingClientRect();
    const props = ctx.graphProps;
    const items = ctx.items ?? [];
    if (!props || !items.length) {
      throw new TargetNotFound(`point:${which}:${attr}`, 'graph props + items');
    }
    const values = items.map((i) => i.values ?? i);
    const nums = values.map((v) => Number(v[attr])).filter((n) => !Number.isNaN(n));
    const mean = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
    const pick = which === 'outlier'
      ? values.reduce((best, v) => (Math.abs(Number(v[attr]) - mean)
          > Math.abs(Number(best[attr]) - mean) ? v : best), values[0])
      : values[0];
    const fx = (Number(pick[props.xAttributeName]) - props.xLowerBound)
      / (props.xUpperBound - props.xLowerBound);
    const x = r.left + fx * r.width;
    const y = props.yAttributeName
      ? r.bottom - ((Number(pick[props.yAttributeName]) - props.yLowerBound)
          / (props.yUpperBound - props.yLowerBound)) * r.height
      : r.bottom - 6;                    // dot plot: the bottom row
    return { el: canvas, at: { x, y }, dragKind: 'canvas', clickShape: 'full',
             pickedCase: pick };
  },

  /**
   * workspace — a clear patch of the document canvas. Semantic, not a pixel
   * literal: it is where a student would drop a file, or park a tile they had
   * just dragged out of the way. Computed by finding the largest gap below and
   * to the right of the tiles that are actually there.
   */
  workspace: (args, ctx) => {
    const app = ctx.doc.querySelector('[data-testid="codap-app"]') ?? ctx.doc.body;
    const r = app.getBoundingClientRect();
    const tiles = [...ctx.doc.querySelectorAll('.free-tile-component')]
      .map((t) => t.getBoundingClientRect());
    const bottom = tiles.reduce((m, t) => Math.max(m, t.bottom), r.top + 120);
    const right = tiles.reduce((m, t) => Math.max(m, t.right), r.left + 120);
    // prefer the band under the tiles; fall back to the band right of them
    const at = (bottom + 140 < r.bottom)
      ? { x: r.left + Math.min(r.width * 0.45, 420), y: bottom + 90 }
      : { x: Math.min(right + 120, r.right - 90), y: r.top + r.height * 0.55 };
    return { el: app, at };
  },

  /** tableColumn:Sleep — the column header (its menu, not its drag). */
  tableColumn: (args, ctx) => {
    const name = args.join(':');
    const btn = q(ctx.doc, `[data-testid="codap-attribute-button ${name}"]`,
      `tableColumn:${name}`);
    return { el: btn, clickShape: 'full' };
  },

  /** mapRegion:<name> — discovered at P5; declared so scripts fail loudly. */
  mapRegion: (args) => {
    throw new TargetNotFound(`mapRegion:${args.join(':')}`,
      'map resolvers land in P5 (Leaflet injection unverified)');
  },
};

/** Resolve `kind:arg:arg` against the live document. */
export function resolveTarget(spec, ctx) {
  const [kind, ...args] = String(spec).split(':');
  const fn = TARGETS[kind];
  if (!fn) throw new UnknownTargetKind(kind, Object.keys(TARGETS));
  const out = fn(args, ctx);
  const r = out.el.getBoundingClientRect();
  return { spec, rect: r, ...out };
}

// ------------------------------------------------------------- conditions
/**
 * Delta-conditions. `base` is the demo-start snapshot; `now` is a fresh one.
 * Everything is expressed as "more than at the start", never as an absolute,
 * so a pre-existing graph does not satisfy `component:graph`.
 */
export function evalCondition(spec, base, now, extra = {}) {
  const m = /^([a-zA-Z]+)(?::([^<>=]+))?(?:(>=|<=|=|>|<)([0-9]+))?$/.exec(String(spec));
  if (!m) throw new Error(`unparseable condition "${spec}"`);
  const [, kind, arg, op, numRaw] = m;
  const num = numRaw != null ? Number(numRaw) : null;
  const countOf = (snap, re) => snap.components.filter((c) => re.test(c.type)).length;

  switch (kind) {
    case 'component': {
      const re = new RegExp(arg ?? '.', 'i');
      return countOf(now, re) > countOf(base, re);
    }
    case 'componentMoved': {
      const byId = new Map(base.components.map((c) => [String(c.id), c]));
      return now.components.some((c) => {
        const b = byId.get(String(c.id));
        return b && (b.left !== c.left || b.top !== c.top);
      });
    }
    case 'graphX':
    case 'graphY':
    case 'graphLegend': {
      const field = { graphX: 'x', graphY: 'y', graphLegend: 'legend' }[kind];
      const was = new Map(base.components.map((c) => [String(c.id), c[field]]));
      return now.components.some((c) =>
        c[field] === arg && was.get(String(c.id)) !== arg);
    }
    case 'selection': {
      const n = extra.selectionCount ?? 0;
      if (op == null) return n > 0;
      return op === '>=' ? n >= num : op === '<=' ? n <= num
        : op === '>' ? n > num : op === '<' ? n < num : n === num;
    }
    default:
      throw new Error(`unknown condition kind "${kind}"`);
  }
}
