/**
 * nudge.js — Dot notices you have not looked at your own wondering.
 *
 * THE WHOLE DESIGN RISK IS IN THIS FILE. "You said you would look at this and
 * you have not" is a teacher move. Everything else in web/src/wonderings/ keeps
 * the tutor register out of the TEXT; this puts it into BEHAVIOUR, one level up,
 * where the lint cannot reach. Three things hold it in place:
 *
 *   1. WORDLESS. docs/CHARACTER.md:13 is binding — Dot never speaks. She looks
 *      at the board, then at where the answer would be, and leaves. The student
 *      supplies the meaning, which is the difference between company and a
 *      reminder.
 *   2. BOUNDED. whiteboard-model.js caps it at MAX_NUDGES per wondering with a
 *      cooldown between, and never nudges one that has been investigated.
 *      docs/PHASE7.md: a missed cheer is invisible, a wrong cheer is noise —
 *      which applies with more force to a nudge about something YOU wrote.
 *   3. SHORT. The run is a few seconds. A long performance is a lecture.
 *
 * Registered at runtime via engine.add() — the seam codap-main.js already uses
 * for `dot-demo` — so neither behaviors.js nor behavior-engine.js is touched.
 * docs/PLAYBOOK-behaviors.md: "no engine changes; if you think you need to,
 * stop and ask."
 *
 * THREE ENGINE CONFLICTS, documented rather than fought (they are recorded in
 * docs/plans/2026-08-28-001 M1):
 *   a. behavior-engine.js:266 refuses to fire ANY behaviour while
 *      `actor.oneShot || actor.motion` is set externally. A nudge may therefore
 *      simply not happen while Dot is mid-clip. Acceptable: the cap means a
 *      missed slot costs nothing, and there are two more.
 *   b. A tick-triggered behaviour gets `graceUntil = startedAt`, so ANY
 *      notification cancels it — including background cases:change traffic.
 *      Mitigated by keeping the run short enough to usually finish.
 *   c. There is no cancel path if the target disappears mid-walk. Mitigated by
 *      re-checking the target before the second half of the move and returning
 *      cleanly (never throwing) when it has gone.
 */

const NUDGE_PRIORITY = 26;        // ambient band; ABOVE wise-attend (24) on purpose — a wondering the student wrote outranks one the system guessed
const NUDGE_COOLDOWN_SEC = 240;   // seconds between any two nudges, on top of the per-wondering cooldown in whiteboard-model.js
const NUDGE_IDLE_MIN_SEC = 20;    // seconds of quiet before Dot moves — never interrupt flow (docs/CHARACTER.md:105-107)
const BOARD_STANDOFF_PX = 70;     // px to the left of the board; close enough to be about it, not on top of it
const LOOK_HOLD_SEC = 2.2;        // seconds held on the board — the "long, uncharacteristic stillness" of CHARACTER.md:50
const GLANCE_HOLD_SEC = 1.8;      // seconds held on where the answer would be

/**
 * @param {object} deps
 * @param {() => object|null} deps.getTarget  nudgeTarget(...) result, or null
 * @param {() => DOMRect|null} deps.boardRect where the whiteboard is on screen
 * @param {() => object|null} deps.tableBounds a case table's screen bounds, or null
 * @param {(key:string) => void} deps.onNudged called with the wondering's key
 * @param {(text:string) => void} [deps.log]
 * @returns {object} a behaviour entry for engine.add()
 */
export function makeNudgeBehavior({ getTarget, boardRect, tableBounds, onNudged, log = () => {} }) {
  return {
    id: 'wonder-nudge',
    priority: NUDGE_PRIORITY,
    cooldownSec: NUDGE_COOLDOWN_SEC,

    trigger(state, event) {
      // Tick-driven, like wise-attend: the condition is "time has passed and
      // nothing happened", which no event announces.
      if (event.type !== 'tick') return false;
      if (state.idleSeconds < NUDGE_IDLE_MIN_SEC) return false;   // they are working; leave them alone
      return !!getTarget();
    },

    // Resets the engine's ignored-counter when the student acts on ANY graph
    // attribute change — the shape of acting on a wondering.
    satisfied: (state, event) => event.type === 'component:attributeChange',

    async run(actor, state, ctx) {
      // Force-fire hands us `event.type === 'force'` with empty detail, so
      // everything below must survive there being no target at all.
      const target = getTarget();
      const rect = boardRect();
      if (!rect) { actor.emote('?'); return; }               // degraded variant

      if (target) {
        onNudged(target.wondering.key);
        log(`nudge: ${target.state} — ${target.wondering.text}`);
      }

      // 1. Come over to the board. Stand beside it, never on it.
      await actor.moveTo(rect.left - BOARD_STANDOFF_PX, rect.top + rect.height * 0.4);

      // (c) the board may have been folded away while she swam over.
      if (!boardRect()) { actor.clearGaze(); return; }

      // 2. Look at it, and hold — the wise-kitten's one beat of stillness.
      actor.lookAt(rect.left + rect.width * 0.4, rect.top + rect.height * 0.35);
      actor.emote('?');
      await ctx.sleep(LOOK_HOLD_SEC);

      // 3. Then look at where the answer would be. THIS is the whole nudge:
      //    the student reads the direction of the gaze, not an instruction.
      const table = tableBounds();
      if (table) {
        actor.lookAt(table.x + table.w * 0.5, table.y + table.h * 0.4);
        await ctx.sleep(GLANCE_HOLD_SEC);
      }
      actor.clearGaze();
    },

    onCancel(actor) { actor.clearGaze(); },
  };
}

export const NUDGE_CONSTANTS = Object.freeze({
  NUDGE_PRIORITY, NUDGE_COOLDOWN_SEC, NUDGE_IDLE_MIN_SEC,
  BOARD_STANDOFF_PX, LOOK_HOLD_SEC, GLANCE_HOLD_SEC,
});
