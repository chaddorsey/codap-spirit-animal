/**
 * Behavior library — behaviors as data (Phase 4).
 *
 * Each entry: { id, priority, cooldownSec,
 *               trigger(state, event, mem) -> bool,
 *               run(actor, state, ctx) -> Promise,
 *               escalation?: { after, run },        // overt variant
 *               satisfied?(state, event) -> bool,   // resets escalation counter
 *               onCancel?(actor, state) }           // extra cleanup on cancel
 *
 * `actor` is the Axolotl API (moveTo/lookAt/gestureAt/tapAt/play/setBase/
 * emote/release/clearGaze/stop) guarded by the engine: once the intervention
 * is cancelled, the next actor call throws and the sequence stops.
 * `ctx` provides { event, mem, sleep, untilCancelled, waitFor, engine }.
 *
 * Adding a behavior = adding one entry here. See docs/PLAYBOOK-behaviors.md.
 */

import { now } from './behavior-engine.js';

const GREET_COOLDOWN_SEC = 8;
const GREET_GEOMETRY_WAIT_SEC = 6;    // componentList lags creates; don't hang
const NUDGE_GRAPH_AGE_SEC = 120;      // graph must sit empty this long
const NUDGE_COOLDOWN_SEC = 90;
const NUDGE_ESCALATE_AFTER = 2;       // overt variant after 2 ignored nudges
const NUDGE_STUDENT_ACTIVE_SEC = 60;  // student must be around, active elsewhere
const IDLE_SLEEP_SEC = 90;
const IDLE_COOLDOWN_SEC = 30;
const BESIDE_TILE_PX = 55;            // hover offset next to a tile edge

const isGraph = (c) => (c?.type ?? '').toLowerCase().includes('graph');

/** Oldest session-created graph with geometry and no attribute assignments. */
const emptyGraph = (s) => {
  let best = null;
  for (const c of s.components.values()) {
    if (isGraph(c) && !c.preexisting && (c.attrsAssigned ?? 0) === 0 && c.bounds
        && now() - c.createdAt >= NUDGE_GRAPH_AGE_SEC
        && (!best || c.createdAt < best.createdAt)) best = c;
  }
  return best;
};

/** Nudge target: a genuinely stale empty graph, else (force-fire path) any
 *  graph with geometry so the behavior still demonstrates itself. */
const nudgeTarget = (s) =>
  emptyGraph(s) ?? [...s.components.values()].filter((c) => isGraph(c) && c.bounds).at(-1);

export function makeBehaviors() {
  return [

    // -------------------------------------------------- celebrate-first-plot
    // First time a graph gains an axis attribute -> celebrate. Once per session.
    {
      id: 'celebrate-first-plot',
      priority: 80,
      cooldownSec: 0,
      trigger(state, event, mem) {
        if (mem.done || event.type !== 'component:attributeChange') return false;
        const c = state.components.get(event.detail?.id);
        return isGraph(c) || isGraph(event.detail);
      },
      async run(actor, state, ctx) {
        ctx.mem.done = true;                       // once per session
        actor.emote('!');
        await actor.play('celebrate');
      },
    },

    // -------------------------------------------------- greet-new-component
    // Component created -> ! emote, hop, swim beside it, curious peer.
    // Degrades to emote + hop in place if geometry never arrives.
    {
      id: 'greet-new-component',
      priority: 60,
      cooldownSec: GREET_COOLDOWN_SEC,
      trigger: (state, event) => event.type === 'component:create',
      async run(actor, state, ctx) {
        const id = ctx.event?.detail?.id;
        actor.emote('!');
        await actor.play('hop');
        const comp = await ctx.waitFor(() => {
          const c = (id != null && state.components.get(id))
            || [...state.components.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
          return c?.bounds ? c : null;
        }, { timeoutSec: GREET_GEOMETRY_WAIT_SEC });
        if (!comp) return;                         // no geometry: greeting was the hop
        const { x, y, w, h } = comp.bounds;
        await actor.moveTo(x + w + BESIDE_TILE_PX, y + h / 2);
        actor.lookAt(x + w / 2, y + h / 2);
        await actor.play('curious');
        actor.clearGaze();
      },
    },

    // -------------------------------------------------- nudge-empty-graph
    // A session-created graph sat empty >120s while the student was active
    // elsewhere -> subtle: swim near, look, ?. After 2 ignored firings,
    // escalate: swim onto the tile, tap it, ?!. Assigning any attribute
    // to a graph counts as acting on the nudge (satisfied -> reset).
    {
      id: 'nudge-empty-graph',
      priority: 40,
      cooldownSec: NUDGE_COOLDOWN_SEC,
      trigger(state, event) {
        if (event.type !== 'tick') return false;
        if (state.idleSeconds > NUDGE_STUDENT_ACTIVE_SEC) return false;
        return !!emptyGraph(state);
      },
      satisfied: (state, event) => event.type === 'component:attributeChange',
      async run(actor, state, ctx) {
        const c = nudgeTarget(state);
        if (!c) { actor.emote('?'); await actor.play('hop'); return; }
        const { x, y, w, h } = c.bounds;
        await actor.moveTo(x + w + BESIDE_TILE_PX, y + h / 2);
        actor.lookAt(x + w / 2, y + h / 2);
        actor.emote('?');
        await ctx.sleep(2.5);
        actor.clearGaze();
      },
      escalation: {
        after: NUDGE_ESCALATE_AFTER,
        async run(actor, state, ctx) {
          const c = nudgeTarget(state);
          if (!c) { actor.emote('?!'); await actor.play('hop'); return; }
          const { x, y, w, h } = c.bounds;
          await actor.moveTo(x + w / 2, y + h / 2 - 20);   // onto the tile
          actor.emote('?!');
          await actor.tapAt(x + w / 2, y + h / 2 + 40);
          await ctx.sleep(1.2);
        },
      },
    },

    // -------------------------------------------------- idle-companion
    // No student action for 90s -> sleep. Any action cancels the
    // intervention (engine rule), actor.stop() restores the idle base,
    // and onCancel adds the wake-up "!".
    {
      id: 'idle-companion',
      priority: 10,
      cooldownSec: IDLE_COOLDOWN_SEC,
      trigger: (state, event) => event.type === 'tick' && state.idleSeconds >= IDLE_SLEEP_SEC,
      async run(actor, state, ctx) {
        actor.setBase('sleep');
        await ctx.untilCancelled();               // sleeps until the student acts
      },
      onCancel(actor) { actor.emote('!'); },      // wake with !
    },

  ];
}
