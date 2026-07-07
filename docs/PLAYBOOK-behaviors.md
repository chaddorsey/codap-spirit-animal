# Playbook — adding a behavior

Recipe for adding one wordless intervention. Target time: under an hour,
no engine changes. Works for any model that can follow this file; the engine
guarantees (arbitration, cooldown, cancellation) are not your problem.

## Files you touch

| File | What |
|---|---|
| `web/src/behaviors.js` | **The only required change** — one new entry in `makeBehaviors()` |
| `docs/BEHAVIORS.md` | Move/complete the row for your behavior |
| `web/src/codap-bridge.js` | Only if your trigger needs a notification the bridge doesn't map yet (additive: one line in the `kind` map or a new `resource.startsWith` branch) |

Never touch: `behavior-engine.js` (if you think you need to, stop and ask),
`pipeline/`, `character.js` beyond additive methods.

## The entry shape

```js
{
  id: 'my-behavior',                 // kebab-case, unique
  priority: 40,                      // ties: higher wins. celebrations 45–80,
                                     // reactions/nudges 20–40, ambient ≤10
  cooldownSec: 90,                   // anti-annoyance floor between firings
  trigger(state, event, mem) {       // MUST be cheap + synchronous, no awaits
    return event.type === 'tick' && /* condition over state */ false;
  },
  satisfied: (state, event) => false,   // optional: true resets the escalation counter
  async run(actor, state, ctx) { /* the subtle intervention */ },
  escalation: {                      // optional overt variant
    after: 2,                        // subtle firings ignored before this runs
    async run(actor, state, ctx) { /* the overt intervention */ },
  },
  onCancel(actor, state) {},         // optional extra cleanup after actor.stop()
  ignoreActivity: true,              // optional, RARE: behavior accompanies
                                     // continuous student action (drag-follow)
                                     // and self-terminates; normal behaviors
                                     // omit this and get cancel-on-action
}
```

- `state`: `components` Map (`{id, type, title, bounds, createdAt, attrsAssigned,
  preexisting}`), `selection`, `drag`, `idleSeconds`, `active`.
- `actor`: the Axolotl API — `moveTo(x,y)` `lookAt(x,y)` `gestureAt(x,y)`
  `tapAt(x,y)` `play(name)` `setBase(name)` `emote('?'|'!'|'?!')` `release()`
  `clearGaze()` `stop()`. All screen pixels. Every call throws once the
  intervention is cancelled — just let it propagate; the engine catches it.
- `ctx`: `{ event, mem, sleep(sec), untilCancelled(), waitFor(fn, {timeoutSec}), engine }`.
  `mem` is your per-behavior scratch (e.g. `mem.done` for once-per-session).

## Rules that bite

1. **Never `setTimeout`/bare `new Promise` in `run`** — use `ctx.sleep()` /
   `ctx.waitFor()`; they abort on cancellation. A bare timer keeps "running"
   after cancel and desyncs the character.
2. **Geometry may lag.** `componentList` trails create notifications by seconds.
   Pattern: `const c = await ctx.waitFor(() => state.components.get(id)?.bounds
   && state.components.get(id), { timeoutSec: 6 }); if (!c) return degradedVariant;`
3. **Time-based triggers** fire on `event.type === 'tick'` (~1 Hz). Event
   triggers match their event type. A trigger sees *every* event — always check
   `event.type` first.
4. **Force-fire must not crash.** `run` gets `event.type === 'force'` with empty
   detail — pick a fallback target from `state` or degrade (emote in place).
5. **Once per session** = `mem.done = true` in `run`, checked in `trigger`.
   Cooldowns are for rate limiting, not one-shots.

## Verify (exact steps)

```bash
cd web && npm run dev -- --host        # http://localhost:5199/codap.html
```

1. Panel → **Force-fire → your id**: sequence plays, one intervention at a time.
2. Panel → **Simulate** buttons (or `__engine.simulate(type, detail)` in the
   console) to synthesize your real trigger; `age +120s` / `idle +90s` backdate
   clocks so you never wait real minutes.
3. `await window.__engine.selfTest()` in the console → must stay **10/10 PASS**.
4. Live pass: reproduce the trigger by hand in CODAP once; watch the event log
   panel (purple `▶ id` … `■ id done` lines). Screenshot for the record.
5. Cancel check: while your behavior runs, act inside CODAP (drag a slider is
   the most reliable notifier) → log shows `✕ your-id cancelled (student action)`
   within ~1s.

## Common failure modes

| Symptom | Cause / fix |
|---|---|
| Trigger never fires live but simulate works | v3 doesn't emit that notification, or the bridge doesn't map it. Watch the raw event-log lines while doing the action by hand. Spend ≤30 min; if the notification doesn't exist, park the behavior in BEHAVIORS.md as blocked. |
| Fires once, never again | It's on cooldown (see live-state panel `cd` column), or your `mem` flag latched. |
| Fires while another behavior runs | It can't — the engine serializes. If you *see* two animations, something bypassed the engine (direct `__axo` calls from panel/console count). |
| Character freezes mid-behavior after student acts | A bare timer/promise in `run` survived cancellation (rule 1). |
| Escalation never happens | `satisfied()` matches too broadly and keeps resetting the counter, or subtle runs are being cancelled (cancelled ≠ ignored — only *completed* subtle firings count). |
| Works on `/` page but not `/codap.html` | Geometry/calibration issue — check the calibration panel offsets, and that your target has `bounds`. |
