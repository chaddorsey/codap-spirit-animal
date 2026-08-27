/* global window, document */
/**
 * dot-showme.js — the plugin half of the "Show me." handoff (Phase 9 P3).
 *
 * ADDED BY THE FORK. Everything Dot-related lives here so the diff against
 * upstream `onboarding.js` stays four small edits, all marked DOT-FORK.
 *
 * Topology (this is load-bearing and was got wrong in the first draft): the
 * plugin iframe is nested TWO deep — wrapper → CODAP iframe → plugin iframe —
 * so `window.parent` is CODAP, not the wrapper. Messages go to `window.top`.
 *
 * "Is Dot there?" is answered by a HANDSHAKE, never by nesting depth: post
 * `dot-hello` up to five times, one second apart, and wait for
 * `dot-hello-ack`. No ack — plain CODAP, an older wrapper, the official
 * tutorial page — and the plugin stays in stock MP4 mode permanently. The
 * retry loop also absorbs the checklist's lazy render (gotcha #10).
 *
 * Same-origin makes an origin check vacuous, so the discipline is: only
 * messages whose `type` starts with `dot-` are ours, and we never reply to
 * anything else — the same channel carries iframe-phone traffic.
 */
(function initDotShowMe() {
  var HELLO_TRIES = 5;
  var HELLO_INTERVAL_MS = 1000;

  var api = {
    /** True once the wrapper has acknowledged the handshake. */
    present: false,
    /** True while Dot is demonstrating: the checklist must not self-check. */
    demoInProgress: false,
    /** The task whose demo is running (or null). */
    activeKey: null,
    onError: null,      // (key, movieURL) => void   — play the MP4 instead
    onBusy: null,       // (key) => void             — re-enable the link
    onStateChange: null, // ()   => void             — re-render if needed
  };

  var pending = {};     // key -> movieURL, so an error can fall back to the MP4
  var tries = 0;
  var timer = null;

  /**
   * Which tutorial this plugin instance is. Read from the init script named in
   * the HTML, which is present from the first byte — the `onboarding1` global
   * is set by task_descriptions.js, which loads AFTER this file, so the first
   * `dot-hello` would otherwise always claim tutorial 2.
   */
  function tutorialNumber() {
    var s = document.querySelector('script[src*="init_onboarding"]');
    var m = s && /init_onboarding(\d+)\.js/.exec(s.getAttribute('src') || '');
    if (m) return Number(m[1]);
    /* global onboarding1 */
    return (typeof onboarding1 !== 'undefined' && onboarding1) ? 1 : 2;
  }

  function post(msg) {
    try { window.top.postMessage(msg, '*'); } catch (e) { /* not embedded */ }
  }

  function sayHello() {
    if (api.present) return;
    if (tries >= HELLO_TRIES) {
      window.console && console.log('[dot] no wrapper after '
        + HELLO_TRIES + ' hellos — staying in MP4 mode');
      return;
    }
    tries += 1;
    post({ type: 'dot-hello', tutorial: tutorialNumber() });
    timer = window.setTimeout(sayHello, HELLO_INTERVAL_MS);
  }

  window.addEventListener('message', function onMessage(event) {
    var data = event && event.data;
    if (!data || typeof data.type !== 'string' || data.type.indexOf('dot-') !== 0) return;
    switch (data.type) {
      case 'dot-hello-ack':
        if (!api.present) {
          api.present = true;
          if (timer) window.clearTimeout(timer);
          window.console && console.log('[dot] wrapper acknowledged — live demos on');
          if (api.onStateChange) api.onStateChange();
        }
        break;
      case 'dot-demo-start':
        api.demoInProgress = true;
        api.activeKey = data.key;
        break;
      case 'dot-demo-end':
        api.demoInProgress = false;
        api.activeKey = null;
        delete pending[data.key];
        if (api.onStateChange) api.onStateChange();
        break;
      case 'dot-demo-error':
        api.demoInProgress = false;
        api.activeKey = null;
        // degrade to exactly today's behaviour: play the canned movie
        if (api.onError) api.onError(data.key, pending[data.key], data.error);
        delete pending[data.key];
        break;
      case 'dot-demo-busy':
        // NOT a dead click: tell the caller so the link comes back to life
        if (api.onBusy) api.onBusy(data.key);
        break;
      default:
        break;
    }
  }, false);

  /**
   * Ask the wrapper to demonstrate `key`. Returns true if the request went
   * out (so the caller skips the movie), false if Dot is not there.
   */
  api.showMe = function showMe(key, movieURL) {
    if (!api.present) return false;
    pending[key] = movieURL;
    post({ type: 'dot-show-me', tutorial: tutorialNumber(), key: key });
    return true;
  };

  api.version = 2;          // bump when editing; handy against a stale cache
  window.DotShowMe = api;

  // The first hello waits for DOMContentLoaded. This file is loaded ABOVE
  // init_onboarding1.js so its message listener is installed early, which
  // means that at script-eval time the parser has not reached the init tag
  // yet and `tutorialNumber()` would read null and guess wrong (measured: the
  // handshake claimed tutorial 2 inside tutorial 1).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sayHello, { once: true });
  } else {
    sayHello();
  }
})();
