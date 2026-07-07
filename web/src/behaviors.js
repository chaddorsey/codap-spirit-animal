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

const GLANCE_COOLDOWN_SEC = 20;
const SUGGEST_GRAPH_AFTER_SEC = 90;   // data with no graph this long -> suggest
const SUGGEST_GRAPH_COOLDOWN_SEC = 180;
const BIG_SELECTION_COUNT = 10;
const BIG_SELECTION_COOLDOWN_SEC = 60;
const IDLE_TABLE_AFTER_SEC = 180;     // table with no case adds this long -> nudge
const IDLE_TABLE_COOLDOWN_SEC = 120;
const DATA_MILESTONE_CASES = 25;
const DATA_MILESTONE_COOLDOWN_SEC = 20;
const THRASH_EVENTS = 4;              // component churn threshold...
const THRASH_WINDOW_SEC = 30;         // ...within this window
const THRASH_COOLDOWN_SEC = 300;
// CODAP v3 tool shelf: the Graph button sits here relative to the iframe
const GRAPH_BUTTON_OFFSET = { x: 92, y: 133 };

// ---- Phase 5 ambient squibs (mood-gated kitten life; docs/CHARACTER.md) ----
const ZOOMIES_PLAYFUL_GATE = 0.7;
const ZOOMIES_COOLDOWN_SEC = 240;
const ZOOMIES_SPEED_PX_S = 950;       // zoomies are FAST, mood factor aside
const ZOOMIES_LAPS = 4;
const ABSORBED_CURIOUS_GATE = 0.6;
const ABSORBED_COOLDOWN_SEC = 180;
const ABSORBED_STARE_SEC = 4.5;       // one dot can hold it motionless
const HEAD_TILT_CURIOUS_GATE = 0.5;
const HEAD_TILT_COOLDOWN_SEC = 150;
const POUNCE_COOLDOWN_SEC = 90;
const POUNCE_PLAYFUL_GATE = 0.55;
const POUNCE_STALK_SEC = 0.8;         // stillness before pounce (timing rule 1)
const ROLL_PLAYFUL_GATE = 0.8;
const ROLL_COOLDOWN_SEC = 600;        // rare, high-trust
const STARTLE_DELETES = 2;            // this many deletes...
const STARTLE_WINDOW_SEC = 4;         // ...this close together = mass vanish
const STARTLE_COOLDOWN_SEC = 60;
const SIT_NEARBY_COOLDOWN_SEC = 300;
const SIT_NEARBY_PLAYFUL_GATE = 0.5;  // affection follows shared energy
const SIT_NEARBY_DURATION_SEC = 10;

/** A random screen point not inside any known tile (kitten open water). */
const openWater = (state) => {
  const tiles = [...state.components.values()].filter((c) => c.bounds);
  for (let i = 0; i < 8; i++) {
    const x = 80 + Math.random() * (window.innerWidth - 160);
    const y = 120 + Math.random() * (window.innerHeight - 240);
    if (!tiles.some((c) => x > c.bounds.x - 40 && x < c.bounds.x + c.bounds.w + 40
      && y > c.bounds.y - 40 && y < c.bounds.y + c.bounds.h + 40)) return { x, y };
  }
  return { x: window.innerWidth * 0.7, y: window.innerHeight * 0.75 };
};
const DRAG_FOLLOW_COOLDOWN_SEC = 10;
const DRAG_FOLLOW_MAX_SEC = 45;       // safety cap on following one drag
const DRAG_STALE_SEC = 3;             // no drag events this long -> assume over
const DRAG_POLL_SEC = 0.08;

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
        // performance variety: high spirits favor the tinkerbell flourish
        await actor.play(ctx.pick(['celebrate', 'tinkerbell'],
          [1, 0.4 + state.mood.playful]));
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
        // three greeting styles, mood-weighted: playful bounds over,
        // sleepy/wary peeks first, otherwise the classic swim-beside
        const style = ctx.pick(['classic', 'bounding', 'peek'],
          [1, 0.5 + 2 * state.mood.playful, 0.3 + 2 * state.mood.sleepy]);
        if (style === 'bounding') {
          const here = actor.getPosition();
          await actor.moveTo((here.x + x + w) / 2, (here.y + y + h / 2) / 2);
          await actor.play('hop');                 // bounds instead of walking
        } else if (style === 'peek') {
          await actor.moveTo(x + w + BESIDE_TILE_PX + 90, y + h / 2 + 30);
          actor.lookAt(x + w / 2, y + h / 2);
          await ctx.sleep(0.9);                    // cautious beat first
        }
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

    // -------------------------------------------------- follow-attribute-drag
    // Student drags an attribute -> ? emote, gaze tracks the drag; drop ->
    // ! + celebrate; dragend without drop -> just clear. ignoreActivity:
    // the drag itself is continuous student action — the behavior accompanies
    // it and self-terminates instead of being cancelled by it.
    {
      id: 'follow-attribute-drag',
      priority: 70,
      cooldownSec: DRAG_FOLLOW_COOLDOWN_SEC,
      ignoreActivity: true,
      trigger: (state, event) => event.type === 'drag' && event.detail?.phase === 'dragstart',
      async run(actor, state, ctx) {
        actor.emote('?');
        const t0 = now();
        for (;;) {
          const d = state.drag;
          if (!d || now() - t0 > DRAG_FOLLOW_MAX_SEC) break;
          if (d.phase === 'drop') {
            actor.clearGaze();
            actor.emote('!');
            await actor.play('celebrate');
            return;
          }
          if (d.phase === 'dragend') break;
          if (now() - d.at > DRAG_STALE_SEC) break;   // stream died mid-drag
          if (d.phase === 'drag' && d.position) {
            const r = ctx.engine.bridge?.iframe?.getBoundingClientRect();
            if (r) actor.lookAt(r.left + d.position.x, r.top + d.position.y);
          }
          await ctx.sleep(DRAG_POLL_SEC);
        }
        actor.clearGaze();
        actor.clearEmote();
      },
    },

    // -------------------------------------------------- glance-at-selection
    // Student selects cases -> curious glance + ?.
    {
      id: 'glance-at-selection',
      priority: 30,
      cooldownSec: GLANCE_COOLDOWN_SEC,
      trigger: (state, event) => event.type === 'selection' && (event.detail?.count ?? 0) >= 1,
      async run(actor) {
        actor.emote('?');
        await actor.play('curious');
      },
    },

    // -------------------------------------------------- celebrate-first-selection
    // First nonempty selection of the session -> nod + !. Outranks
    // glance-at-selection (p30) once, then defers to it forever.
    {
      id: 'celebrate-first-selection',
      priority: 55,
      cooldownSec: 0,
      trigger(state, event, mem) {
        return !mem.done && event.type === 'selection' && (event.detail?.count ?? 0) >= 1;
      },
      async run(actor, state, ctx) {
        ctx.mem.done = true;
        actor.emote('!');
        await actor.play(Math.random() < 0.5 ? 'nod_L' : 'nod_R');
      },
    },

    // -------------------------------------------------- peer-at-big-selection
    // A large selection -> swim beside the graph and peer at it.
    // Must outrank glance-at-selection (p30) so big selections get the
    // specific reaction, not the generic glance.
    {
      id: 'peer-at-big-selection',
      priority: 32,
      cooldownSec: BIG_SELECTION_COOLDOWN_SEC,
      trigger: (state, event) =>
        event.type === 'selection' && (event.detail?.count ?? 0) >= BIG_SELECTION_COUNT,
      async run(actor, state, ctx) {
        const c = [...state.components.values()].filter((k) => isGraph(k) && k.bounds).at(-1);
        if (!c) { actor.emote('?'); await actor.play('curious'); return; }
        const { x, y, w, h } = c.bounds;
        await actor.moveTo(x + w + BESIDE_TILE_PX, y + h / 2);
        actor.lookAt(x + w / 2, y + h / 2);
        actor.emote('?');
        await actor.play('curious');
        await ctx.sleep(1.5);
        actor.clearGaze();
      },
    },

    // -------------------------------------------------- suggest-graph-for-data
    // Data exists but no graph for a while, student active -> swim toward the
    // tool shelf and point at the Graph button. Escalates to a tap + ?!.
    {
      id: 'suggest-graph-for-data',
      priority: 35,
      cooldownSec: SUGGEST_GRAPH_COOLDOWN_SEC,
      _graphButton(state, ctx) {
        const r = ctx.engine.bridge?.iframe?.getBoundingClientRect();
        return { x: (r?.left ?? 0) + GRAPH_BUTTON_OFFSET.x, y: (r?.top ?? 0) + GRAPH_BUTTON_OFFSET.y };
      },
      trigger(state, event) {
        if (event.type !== 'tick') return false;
        if (state.idleSeconds > NUDGE_STUDENT_ACTIVE_SEC) return false;
        if ([...state.components.values()].some(isGraph)) return false;
        return [...state.dataContexts.values()].some(
          (dc) => dc.caseEvents > 0 && now() - dc.lastCasesAt >= SUGGEST_GRAPH_AFTER_SEC);
      },
      satisfied: (state, event) =>
        event.type === 'component:create' && isGraph(event.detail),
      async run(actor, state, ctx) {
        const b = this._graphButton(state, ctx);
        await actor.moveTo(b.x + 120, b.y + 90);
        actor.emote('?');
        await actor.gestureAt(b.x, b.y);          // point at the Graph button
        await ctx.sleep(2);
        actor.release();
      },
      escalation: {
        after: 2,
        async run(actor, state, ctx) {
          const b = this._graphButton(state, ctx);
          await actor.moveTo(b.x + 90, b.y + 60);
          actor.emote('?!');
          await actor.tapAt(b.x, b.y);
          await ctx.sleep(1.2);
        },
      },
    },

    // -------------------------------------------------- nudge-idle-table
    // A session-created case table has sat there with no case additions ->
    // subtle peer + ?; escalates to a tap. Any case creation satisfies it.
    {
      id: 'nudge-idle-table',
      priority: 38,
      cooldownSec: IDLE_TABLE_COOLDOWN_SEC,
      _target(state) {
        return [...state.components.values()].find((c) =>
          (c.type ?? '').toLowerCase().includes('table') && !c.preexisting && c.bounds
          && now() - c.createdAt >= IDLE_TABLE_AFTER_SEC
          && ![...state.dataContexts.values()].some((dc) => dc.lastCasesAt > c.createdAt));
      },
      trigger(state, event) {
        if (event.type !== 'tick') return false;
        if (state.idleSeconds > NUDGE_STUDENT_ACTIVE_SEC) return false;
        return !!this._target(state);
      },
      satisfied: (state, event) =>
        event.type === 'cases:change'
        && (event.detail?.operation === 'createCases' || event.detail?.operation === 'createItems'),
      async run(actor, state, ctx) {
        const c = this._target(state)
          ?? [...state.components.values()].filter((k) => k.bounds).at(-1);
        if (!c) { actor.emote('?'); await actor.play('hop'); return; }
        const { x, y, w, h } = c.bounds;
        await actor.moveTo(x + w + BESIDE_TILE_PX, y + h / 2);
        actor.lookAt(x + w / 2, y + h / 2);
        actor.emote('?');
        await ctx.sleep(2.5);
        actor.clearGaze();
      },
      escalation: {
        after: 2,
        async run(actor, state, ctx) {
          const c = this._target(state)
            ?? [...state.components.values()].filter((k) => k.bounds).at(-1);
          if (!c) { actor.emote('?!'); await actor.play('hop'); return; }
          const { x, y, w, h } = c.bounds;
          await actor.moveTo(x + w / 2, y + h / 2 - 20);
          actor.emote('?!');
          await actor.tapAt(x + w / 2, y + h / 2 + 40);
          await ctx.sleep(1.2);
        },
      },
    },

    // -------------------------------------------------- dance-on-data-milestone
    // A data context crosses the case-count milestone -> dance + !.
    // Case counts aren't in the notification, so the run queries the API and
    // bails quietly below threshold (once per context, via mem).
    {
      id: 'dance-on-data-milestone',
      priority: 45,
      cooldownSec: DATA_MILESTONE_COOLDOWN_SEC,
      trigger(state, event, mem) {
        if (event.type !== 'cases:change') return false;
        const op = event.detail?.operation;
        if (op !== 'createCases' && op !== 'createItems') return false;
        return !(mem.celebrated ?? []).includes(event.detail?.context ?? 'unknown');
      },
      async run(actor, state, ctx) {
        const context = ctx.event?.detail?.context;
        if (!context) return;
        const r = await ctx.engine.bridge
          ?.request('get', `dataContext[${context}].itemCount`)
          .catch(() => null);
        const n = typeof r?.values === 'number' ? r.values : r?.values?.itemCount ?? 0;
        if (n < DATA_MILESTONE_CASES) return;      // not there yet — quiet bail
        (ctx.mem.celebrated ??= []).push(context); // once per context
        actor.emote('!');
        actor.play('dance');                       // loop clip — time-box it
        await ctx.sleep(2.6);
        actor.release();
      },
    },

    // -------------------------------------------------- scratch-on-thrash
    // Rapid component churn (create/delete bursts) reads as flailing ->
    // scratch head + ?. Long cooldown; purely sympathetic, never escalates.
    {
      id: 'scratch-on-thrash',
      priority: 20,
      cooldownSec: THRASH_COOLDOWN_SEC,
      trigger(state, event) {
        if (event.type !== 'component:create' && event.type !== 'component:delete') return false;
        const t = now();
        return state.componentChurn.filter((x) => t - x < THRASH_WINDOW_SEC).length >= THRASH_EVENTS;
      },
      async run(actor, state, ctx) {
        state.componentChurn.length = 0;   // consume the burst
        actor.emote('?');
        await actor.play('scratch');
      },
    },

    // -------------------------------------------------- startle
    // Sudden mass vanishing (2+ tiles deleted fast) -> jump-back, then an
    // immediate curious "where did it go?" — recovery inside 2s (rule 4).
    {
      id: 'startle',
      priority: 65,
      cooldownSec: STARTLE_COOLDOWN_SEC,
      preempts: true,                 // a startle that waits its turn isn't one
      trigger(state, event) {
        if (event.type !== 'component:delete') return false;
        const t = now();
        return state.componentDeletes.filter((x) => t - x < STARTLE_WINDOW_SEC)
          .length >= STARTLE_DELETES;
      },
      async run(actor, state, ctx) {
        await actor.play('startle');
        await actor.play('head_tilt');            // ...where did it go?
      },
    },

    // -------------------------------------------------- pounce-at-drag
    // Something is MOVING (slider drag): stalk-freeze, then pounce toward
    // it, overshoot and recover (clip), retreat. ignoreActivity — the
    // moving thing IS student action; the pounce accompanies it.
    {
      id: 'pounce-at-drag',
      priority: 28,
      cooldownSec: POUNCE_COOLDOWN_SEC,
      ignoreActivity: true,
      trigger: (state, event) => event.type === 'slider:change'
        && state.mood.playful > POUNCE_PLAYFUL_GATE,
      async run(actor, state, ctx) {
        const c = state.components.get(ctx.event?.detail?.id)
          ?? [...state.components.values()].filter((k) => k.bounds).at(-1);
        if (!c?.bounds) return;
        const tx = c.bounds.x + c.bounds.w / 2;
        const ty = c.bounds.y + c.bounds.h / 2;
        actor.lookAt(tx, ty);
        await ctx.sleep(POUNCE_STALK_SEC);        // the stalk-freeze is the setup
        const here = actor.getPosition();
        // close most of the distance fast, then the pounce clip does the leap
        await actor.moveTo(tx + (here.x > tx ? 130 : -130), ty + 40,
          { pixelsPerSecond: 700 });
        await actor.play('pounce');
        actor.clearGaze();
        await actor.play('proud');                // rule 3: proud after anything
      },
    },

    // -------------------------------------------------- head-tilt-investigate
    // Wanders to a tile and considers it from two angles. Prefers tiles it
    // hasn't investigated before.
    {
      id: 'head-tilt-investigate',
      priority: 17,
      cooldownSec: HEAD_TILT_COOLDOWN_SEC,
      trigger: (state, event) => event.type === 'tick'
        && state.mood.curious > HEAD_TILT_CURIOUS_GATE
        && [...state.components.values()].some((c) => c.bounds),
      async run(actor, state, ctx) {
        const tiles = [...state.components.values()].filter((c) => c.bounds);
        const fresh = tiles.filter((c) => !ctx.mem[`seen-${c.id}`]);
        const c = ctx.pick(fresh.length ? fresh : tiles);
        ctx.mem[`seen-${c.id}`] = true;
        const { x, y, w, h } = c.bounds;
        await actor.moveTo(x + w + BESIDE_TILE_PX, y + h / 2);
        actor.lookAt(x + w / 2, y + h / 2);
        await actor.play('head_tilt');
        actor.clearGaze();
      },
    },

    // -------------------------------------------------- roll-over
    // Rare, high-trust: barrel roll in open water, then the proud beat.
    {
      id: 'roll-over',
      priority: 8,
      cooldownSec: ROLL_COOLDOWN_SEC,
      trigger: (state, event) =>
        event.type === 'tick' && state.mood.playful > ROLL_PLAYFUL_GATE,
      async run(actor, state, ctx) {
        const p = openWater(state);
        await actor.moveTo(p.x, p.y);
        await actor.play('roll');
        await actor.play('proud');
      },
    },

    // -------------------------------------------------- absorbed-discovery
    // One plotted dot becomes the most interesting object in the universe:
    // nose-close hover at a populated graph, utterly still, then drift off.
    {
      id: 'absorbed-discovery',
      priority: 18,
      cooldownSec: ABSORBED_COOLDOWN_SEC,
      trigger: (state, event) => event.type === 'tick'
        && state.mood.curious > ABSORBED_CURIOUS_GATE
        && [...state.components.values()].some((c) =>
          isGraph(c) && c.bounds && (c.attrsAssigned ?? 0) > 0),
      async run(actor, state, ctx) {
        const c = [...state.components.values()].filter((k) =>
          isGraph(k) && k.bounds && (k.attrsAssigned ?? 0) > 0).at(-1);
        if (!c) return;
        // a "discovery spot" inside the plot area
        const px = c.bounds.x + c.bounds.w * (0.3 + Math.random() * 0.4);
        const py = c.bounds.y + c.bounds.h * (0.35 + Math.random() * 0.35);
        await actor.moveTo(px + 60, py + 10);
        actor.lookAt(px, py);
        await ctx.sleep(ABSORBED_STARE_SEC);       // utterly absorbed
        actor.clearGaze();
        const away = openWater(state);
        await actor.moveTo(away.x, away.y);        // drifts off, changed
      },
    },

    // -------------------------------------------------- zoomies
    // Brief energetic laps of open canvas for no reason at all; ends in an
    // abrupt stop. Pure unspent joy.
    {
      id: 'zoomies',
      priority: 15,
      cooldownSec: ZOOMIES_COOLDOWN_SEC,
      trigger: (state, event) =>
        event.type === 'tick' && state.mood.playful > ZOOMIES_PLAYFUL_GATE,
      async run(actor, state, ctx) {
        for (let i = 0; i < ZOOMIES_LAPS; i++) {
          const p = openWater(state);
          await actor.moveTo(p.x, p.y, { pixelsPerSecond: ZOOMIES_SPEED_PX_S });
        }
        await actor.play('hop');                   // abrupt stop, shake it off
        state.mood.playful *= 0.6;                 // energy spent
      },
    },

    // -------------------------------------------------- sit-nearby
    // Indirect affection: drift over and just... be near the student's
    // most-used tile for a while. Never blocks it; leaves on any action.
    {
      id: 'sit-nearby',
      priority: 12,
      cooldownSec: SIT_NEARBY_COOLDOWN_SEC,
      trigger(state, event) {
        if (event.type !== 'tick') return false;
        if (state.mood.playful < SIT_NEARBY_PLAYFUL_GATE) return false;
        if (state.idleSeconds > NUDGE_STUDENT_ACTIVE_SEC) return false;
        return [...state.components.values()].some((c) => c.bounds && c.lastInteractionAt);
      },
      async run(actor, state, ctx) {
        const c = [...state.components.values()]
          .filter((k) => k.bounds && k.lastInteractionAt)
          .sort((a, b) => b.lastInteractionAt - a.lastInteractionAt)[0];
        if (!c) return;
        const { x, y, w, h } = c.bounds;
        await actor.moveTo(x + w + BESIDE_TILE_PX - 10, y + h - 20);  // settle low, beside
        await ctx.sleep(SIT_NEARBY_DURATION_SEC);  // companionable silence
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
      onCancel(actor) {                           // wake with ! — and sometimes
        actor.emote('!');                         // the exaggerated post-nap
        if (Math.random() < 0.5) actor.play('stretch');   // stretch (squib #1)
      },
    },

  ];
}
