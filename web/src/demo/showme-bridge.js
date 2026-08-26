/**
 * showme-bridge.js — the wrapper half of the "Show me." handoff (Phase 9 P3).
 *
 * The plugin iframe is nested two deep (wrapper → CODAP → plugin), so its
 * `window.parent` is CODAP and it posts to `window.top` — us. We listen on
 * `window`, ignore everything whose `type` does not begin `dot-` (the same
 * channel carries iframe-phone traffic), and pin `event.source` per plugin so
 * replies go back to the frame that asked.
 *
 * Message set (normative, from the work order):
 *
 *   plugin  → wrapper: { type:'dot-hello',     tutorial }
 *   wrapper → plugin:  { type:'dot-hello-ack' }
 *   plugin  → wrapper: { type:'dot-show-me',   tutorial, key }
 *   wrapper → plugin:  { type:'dot-demo-start', key }   // suppress detection
 *   wrapper → plugin:  { type:'dot-demo-end',   key, ok }
 *   wrapper → plugin:  { type:'dot-demo-error', key }   // plugin plays its MP4
 *   wrapper → plugin:  { type:'dot-demo-busy',  key }   // link stays alive
 */

/**
 * `dot-demo-end` is held back deliberately. Undo's own notifications arrive
 * asynchronously and can check a task off the instant suppression lifts, which
 * is precisely the bug demo-then-revert exists to avoid. The end message waits
 * for the document to go quiet AND to still look the way the demo left it.
 */
const QUIESCENCE_MS = 1500;
const STABLE_POLL_MS = 300;

export class ShowMeBridge {
  /**
   * @param {object} deps
   * @param {(tutorial:number, key:string) => Promise<any>} deps.runDemo
   * @param {() => boolean} deps.isBusy
   * @param {() => Promise<object>} deps.snapshot   document state, for stability
   * @param {(s:string) => void} [deps.log]
   */
  constructor({ runDemo, isBusy, snapshot, log = () => {} }) {
    this.runDemo = runDemo;
    this.isBusy = isBusy;
    this.snapshot = snapshot;
    this.log = log;
    this.plugins = new Map();      // source window -> { tutorial }
    this.lastMessage = null;       // debug/tests
    this.onShowMe = null;          // test hook
    this._onMessage = this._onMessage.bind(this);
  }

  start() { window.addEventListener('message', this._onMessage, false); }

  stop() { window.removeEventListener('message', this._onMessage, false); }

  /** Post to every handshaken plugin (there is normally exactly one). */
  broadcast(msg) {
    for (const src of this.plugins.keys()) {
      try { src.postMessage(msg, '*'); } catch { this.plugins.delete(src); }
    }
  }

  /**
   * Suppression is a property of A DEMO RUNNING, not of how it was started.
   *
   * These two are called by the demo runner itself, so a demo triggered from
   * the debug panel, the console, or a test suppresses the checklist exactly
   * like one triggered by "Show me." — the first version wired the start/end
   * messages into the Show-me handler only, and every other path let the
   * plugin check the task off while Dot was demonstrating it, which is the
   * one thing demo-then-revert exists to prevent.
   */
  demoStarted(key) {
    this.broadcast({ type: 'dot-demo-start', key });
    this.log(`demo ${key}: suppression on`);
  }

  async demoEnded(key, ok, error) {
    await this._settle();
    this.broadcast(ok
      ? { type: 'dot-demo-end', key, ok: true }
      : { type: 'dot-demo-error', key, error: String(error?.message ?? error) });
    this.log(`demo ${key}: suppression off (${ok ? 'ok' : 'error'})`);
  }

  async _onMessage(event) {
    const data = event?.data;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('dot-')) return;
    // never reply to our OWN outbound messages bouncing around
    if (event.source === window) return;
    this.lastMessage = data;

    if (data.type === 'dot-hello') {
      this.plugins.set(event.source, { tutorial: data.tutorial ?? 1 });
      event.source.postMessage({ type: 'dot-hello-ack' }, '*');
      this.log(`plugin handshake (tutorial ${data.tutorial})`);
      return;
    }

    if (data.type !== 'dot-show-me') return;

    const src = event.source;
    const key = data.key;
    const tutorial = data.tutorial ?? this.plugins.get(src)?.tutorial ?? 1;
    if (!this.plugins.has(src)) this.plugins.set(src, { tutorial });

    if (this.isBusy()) {
      // NOT a dead click — the plugin re-enables the link and says so
      src.postMessage({ type: 'dot-demo-busy', key }, '*');
      this.log(`show-me ${key}: busy`);
      return;
    }

    this.onShowMe?.(tutorial, key);
    this.log(`show-me ${key}: starting`);
    // `runDemo` is the wrapper's demo runner, which broadcasts
    // dot-demo-start / -end itself — see demoStarted()/demoEnded(). Nothing
    // is posted from here, so there is exactly one place suppression is
    // turned on and off no matter how the demo was triggered.
    try {
      const result = await this.runDemo(tutorial, key);
      this.log(`show-me ${key}: done`);
      return result;
    } catch (err) {
      this.log(`show-me ${key}: FAILED (${err.message}) — plugin plays its MP4`);
      return null;
    }
  }

  /** Wait for quiescence AND two identical consecutive state reads. */
  async _settle() {
    const t0 = performance.now();
    let previous = null;
    for (;;) {
      const now = JSON.stringify(await this.snapshot().catch(() => null));
      const quiet = performance.now() - t0 >= QUIESCENCE_MS;
      if (quiet && previous !== null && now === previous) return;
      previous = now;
      await new Promise((r) => setTimeout(r, STABLE_POLL_MS));
      if (performance.now() - t0 > QUIESCENCE_MS * 6) return;   // never hang
    }
  }
}
