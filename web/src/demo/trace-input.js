/**
 * Input tracer — why does the student's real mouse steal an injected drag?
 *
 * Chad reports: Dot grabs an attribute, nothing moves, then his real mouse
 * wavers and the attribute jumps to his cursor and sticks. An InputShield that
 * stops trusted movement at DOCUMENT capture did not fix it, which means the
 * real events reach CODAP by a route the shield does not cover.
 *
 * This records, for every movement event, WHICH node saw it and in which
 * phase, so the leak shows up as "a trusted pointermove that reached node X
 * while the shield was on". Listener order during capture is
 *
 *     window -> document -> ... -> target -> ... -> document -> window
 *
 * so a capture listener on `window` fires BEFORE a capture listener on
 * `document` and cannot be stopped by one. That is the first hypothesis this
 * tracer is built to confirm or kill.
 *
 * Usage from the console on codap-same.html:
 *
 *     __dotTrace.arm()                       // start recording
 *     await __demo.run('tutorial2','MakeScatterplot')
 *     // ... waggle the real mouse during the drags ...
 *     __dotTrace.summary()                   // printed table + verdict
 */

const MOVE_TYPES = ['pointermove', 'pointerrawupdate', 'mousemove', 'dragover'];
const EDGE_TYPES = ['pointerdown', 'pointerup', 'dragstart', 'drop'];

function label(el) {
  if (!el) return 'null';
  if (el === window) return 'hostWindow';
  if (el === document) return 'hostDocument';
  if (el.nodeType === 9) return 'frameDocument';
  if (el.defaultView === el || el.window === el) return 'frameWindow';
  const t = el.getAttribute?.('data-testid');
  return t ? `${el.tagName?.toLowerCase()}[${t}]` : (el.tagName?.toLowerCase() ?? String(el));
}

class InputTracer {
  constructor() {
    this.log = [];
    this.armed = false;
    this.nodes = [];
    this.max = 4000;
  }

  /** Every node an event could be intercepted at, outermost first. */
  _targets() {
    const frame = document.getElementById('codap');
    const fdoc = frame?.contentDocument ?? null;
    const fwin = frame?.contentWindow ?? null;
    return [
      [window, 'hostWindow'],
      [document, 'hostDocument'],
      [fwin, 'frameWindow'],
      [fdoc, 'frameDocument'],
    ].filter(([n]) => n);
  }

  arm() {
    if (this.armed) return 'already armed';
    this.armed = true;
    this.log = [];
    const driver = window.__demo?.driver;
    for (const [node, name] of this._targets()) {
      for (const phase of [true, false]) {
        for (const type of [...MOVE_TYPES, ...EDGE_TYPES]) {
          const h = (e) => {
            if (this.log.length >= this.max) return;
            // Movement is high-volume: keep only genuine input plus a thin
            // sample of ours, so the interesting rows are not buried.
            const trusted = e.isTrusted;
            if (MOVE_TYPES.includes(type) && !trusted && (this.log.length % 17)) return;
            this.log.push({
              t: Math.round(performance.now()),
              type, node: name, phase: phase ? 'capture' : 'bubble',
              trusted, id: e.pointerId, x: Math.round(e.clientX ?? -1),
              y: Math.round(e.clientY ?? -1),
              target: label(e.target),
              shield: !!driver?.shield?.on,
              dragging: driver?.phase ?? null,
            });
          };
          node.addEventListener(type, h, phase);
          this.nodes.push([node, type, h, phase]);
        }
      }
    }
    return `armed on ${this._targets().map(([, n]) => n).join(', ')}`;
  }

  disarm() {
    for (const [node, type, h, phase] of this.nodes) {
      node.removeEventListener(type, h, phase);
    }
    this.nodes = []; this.armed = false;
    return `disarmed, ${this.log.length} rows`;
  }

  /** Trusted movement that got through while the shield was up: the leak. */
  leaks() {
    return this.log.filter((r) => r.trusted && r.shield && MOVE_TYPES.includes(r.type));
  }

  summary() {
    const leaks = this.leaks();
    const byNode = {};
    for (const r of leaks) {
      const k = `${r.node} ${r.phase} ${r.type}`;
      byNode[k] = (byNode[k] ?? 0) + 1;
    }
    const shieldRows = this.log.filter((r) => r.shield).length;
    const out = {
      rows: this.log.length,
      rowsWhileShieldUp: shieldRows,
      trustedLeaks: leaks.length,
      leaksByNode: byNode,
      firstLeaks: leaks.slice(0, 8),
      verdict: shieldRows === 0
        ? 'SHIELD NEVER ENGAGED — it is not being switched on during the drag'
        : leaks.length === 0
          ? 'no trusted movement got through; the hijack uses another route'
          : 'trusted movement reached the nodes listed in leaksByNode while the shield was up',
    };
    // eslint-disable-next-line no-console
    console.log('[dotTrace]', JSON.stringify(out, null, 2));
    return out;
  }
}

export function installTracer() {
  const tracer = new InputTracer();
  window.__dotTrace = tracer;
  return tracer;
}
