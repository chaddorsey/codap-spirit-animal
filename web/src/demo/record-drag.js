/**
 * Drag recorder — capture what a REAL successful drag looks like, so an
 * injected one can be compared against it instead of guessed at.
 *
 * Four attempts at fixing the injected attribute drag failed because each was
 * built on a hypothesis about what CODAP wants (listener order, frame pacing,
 * preview pacing, press-and-hold). This records the ground truth instead.
 *
 *   __dotRecord.start('manual')     // then drag Age to the axis BY HAND
 *   __dotRecord.stop()
 *
 *   __dotRecord.start('dot')        // then click "Show me."
 *   __dotRecord.stop()
 *
 *   __dotRecord.diff()              // manual vs dot, side by side
 *
 * Everything is captured inside the CODAP frame, where the sensors live.
 */

const TYPES = [
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
  'mousedown', 'mousemove', 'mouseup', 'click',
  'dragstart', 'drag', 'dragover', 'drop', 'dragend',
  'lostpointercapture', 'gotpointercapture',
];

const OVERLAY = '.dnd-kit-drag-overlay';

function desc(el) {
  if (!el || !el.tagName) return String(el ?? 'null');
  const tid = el.getAttribute?.('data-testid');
  if (tid) return `[${tid}]`;
  const cls = String(el.className || '').split(' ').filter(Boolean)[0];
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
}

class DragRecorder {
  constructor() {
    this.takes = {};          // label -> rows
    this.rows = null;
    this.label = null;
    this.bound = [];
    this.max = 3000;
  }

  _frameDoc() {
    return document.getElementById('codap')?.contentDocument ?? null;
  }

  start(label = 'take') {
    if (this.rows) this.stop();
    const doc = this._frameDoc();
    if (!doc) return 'no CODAP frame';
    this.label = label;
    this.rows = [];
    this.t0 = performance.now();
    const overlay = () => {
      const el = doc.querySelector(OVERLAY);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top) };
    };
    for (const type of TYPES) {
      const h = (e) => {
        if (this.rows.length >= this.max) return;
        this.rows.push({
          t: Math.round(performance.now() - this.t0),
          type,
          real: e.isTrusted,
          x: Math.round(e.clientX ?? -1),
          y: Math.round(e.clientY ?? -1),
          buttons: e.buttons,
          id: e.pointerId,
          target: desc(e.target),
          ghost: overlay(),
        });
      };
      doc.addEventListener(type, h, true);
      this.bound.push([doc, type, h]);
    }
    return `recording "${label}" — do the drag now, then __dotRecord.stop()`;
  }

  stop() {
    for (const [doc, type, h] of this.bound) doc.removeEventListener(type, h, true);
    this.bound = [];
    if (!this.rows) return 'not recording';
    this.takes[this.label] = this.rows;
    const n = this.rows.length;
    const label = this.label;
    this.rows = null; this.label = null;
    // eslint-disable-next-line no-console
    console.log(`[dotRecord] "${label}" captured ${n} events`, this.summary(label));
    return `captured ${n} events as "${label}"`;
  }

  /** The numbers that actually distinguish a working drag from a broken one. */
  summary(label) {
    const rows = this.takes[label];
    if (!rows?.length) return `no take "${label}"`;
    const down = rows.find((r) => r.type === 'pointerdown' || r.type === 'mousedown');
    const t0 = down?.t ?? rows[0].t;
    const rel = (r) => r.t - t0;
    const moves = rows.filter((r) => r.type === 'pointermove' || r.type === 'mousemove');
    const afterDown = moves.filter((r) => r.t >= t0);
    const up = rows.find((r) => (r.type === 'pointerup' || r.type === 'mouseup') && r.t >= t0);
    const firstGhost = rows.find((r) => r.ghost);
    const lastGhost = [...rows].reverse().find((r) => r.ghost);
    const kinds = {};
    for (const r of rows) kinds[r.type] = (kinds[r.type] ?? 0) + 1;
    return {
      events: rows.length,
      kinds,
      real: rows.filter((r) => r.real).length,
      synthetic: rows.filter((r) => !r.real).length,
      downTarget: down ? down.target : null,
      holdBeforeFirstMoveMs: afterDown.length ? rel(afterDown[0]) : null,
      moveCount: afterDown.length,
      dragDurationMs: up ? rel(up) : null,
      ghostFirstSeenMs: firstGhost ? rel(firstGhost) : 'NEVER APPEARED',
      ghostFirstAt: firstGhost?.ghost ?? null,
      ghostLastAt: lastGhost?.ghost ?? null,
      upTarget: up?.target ?? null,
      medianMoveGapMs: (() => {
        if (afterDown.length < 2) return null;
        const gaps = afterDown.slice(1).map((r, i) => r.t - afterDown[i].t).sort((a, b) => a - b);
        return gaps[Math.floor(gaps.length / 2)];
      })(),
    };
  }

  /**
   * First N events of a take as PLAIN TEXT.
   *
   * Returning objects was useless: the console collapses them to {…} and they
   * cannot be copied out. One line per event, copy-pasteable.
   */
  head(label, n = 25) {
    const rows = this.takes[label] ?? [];
    const txt = rows.slice(0, n).map((r) => [
      String(r.t).padStart(7),
      r.real ? 'REAL' : 'ours',
      r.type.padEnd(13),
      `(${r.x},${r.y})`.padEnd(12),
      `btn=${r.buttons}`.padEnd(7),
      `id=${r.id ?? '-'}`.padEnd(12),
      r.ghost ? `ghost@${r.ghost.x},${r.ghost.y}` : 'no-ghost',
      r.target,
    ].join(' ')).join('\n');
    // eslint-disable-next-line no-console
    console.log(`[dotRecord] head("${label}") ${rows.length} total\n` + txt);
    return txt;
  }

  /** OUR dispatch log — what the injector believes it did, as text. */
  injLog(n = 60) {
    const ev = window.__demo?.driver?.inj?.events ?? [];
    const txt = ev.slice(-n).map((e) => [
      String(Math.round(e.t)).padStart(9),
      e.type.padEnd(24),
      `(${e.x},${e.y})`.padEnd(12),
      e.target ?? '',
    ].join(' ')).join('\n');
    // eslint-disable-next-line no-console
    console.log(`[dotRecord] injLog last ${Math.min(n, ev.length)} of ${ev.length}\n` + txt);
    return txt;
  }

  diff(a = 'manual', b = 'dot') {
    const out = { [a]: this.summary(a), [b]: this.summary(b) };
    // eslint-disable-next-line no-console
    console.log('[dotRecord] diff', JSON.stringify(out, null, 2));
    return out;
  }
}

export function installRecorder() {
  const rec = new DragRecorder();
  window.__dotRecord = rec;
  return rec;
}
