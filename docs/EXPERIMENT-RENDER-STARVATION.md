# Experiment: what delays dnd-kit activation in an injected drag

> **OUTCOME, 2026-08-27: none of it. The cause was a stale document reference
> in `Injector` — see `DRAG-GHOST-CONUNDRUM.md` §0.** `inj.doc` was captured in
> the constructor while the CODAP iframe still held `about:blank`, so every
> `document`-targeted dispatch and every poll went to a dead document.
> `__demo.inj.staleDoc` was `true` on Chad's machine and `false` in the testbed
> here, which is why nothing in this document could ever reproduce it.
>
> **Everything below measures real costs that were not the bug.** They remain
> worth knowing — the fresh-graph effect and the move-count effect are both
> genuine and both are now fixed — but do not read any of it as an explanation
> of the drag-ghost failure. Read the retractions in §2c and §3b as a caution
> about how much of this was chasing noise.

**Status: run once in a CDP testbed on 2026-08-27; two arms refuted; NOT yet
run on Chad's machine, which is the venue that matters.** Answers
`docs/DRAG-GHOST-CONUNDRUM.md` §7 questions 2, 4 and 8, and narrows question 1.

Repo: `github.com/chaddorsey/codap-spirit-animal`, branch `master`.

---

## 0. Read this before any number below

Everything in §3 was measured in a **throwaway Chrome launched over CDP with a
cold user profile**, on the same machine as the dev server, alongside Chad's own
Chrome. **Chad's correction, 2026-08-27, and it is correct: that browser lagged,
and his own drags as a real user are fast. CODAP is not responding slowly on his
machine.** The CPU profile shows the tell directly — three.js `getProgram` and
`setValueM3` high in the stall, which is WebGL shader compilation against a cold
GPU cache, something that happens once per fresh profile and never again.

So:

| Transferable | Not transferable |
|---|---|
| The **shape**: activation latency arrives as ONE long task, not as accumulated cost — `worstFrameGap ≈ ghostLatency` in every repetition | Every millisecond figure |
| **Relative** results between arms run interleaved in the same browser | Any claim about how often Chad's machine stalls |
| Code facts (§1) | The idea that CODAP is inherently slow to activate a drag |

**Do not tune anything from the numbers in §3.** They are recorded so that a
later run has something to diff against, and because a testbed that reproduces
the production symptom on demand is worth keeping.

## 1. A code fact, independent of any measurement

`Injector._releaseAt()` — the emergency release added in `eca321a` — began its
`try` block with `console.log(..., samples.length, ...)`, and `samples` is a
local of `dragPointer()`. Every call threw `ReferenceError` **before dispatching
anything**, and the method's own `catch` swallowed it. From `b70e734` until
2026-08-27 the release never fired once: no `pointerup`, no `pointercancel`, no
`EMERGENCY RELEASE` line.

This needs no experiment and no browser. It means:

- §3.1 of the conundrum doc was inert, so every observation since `eca321a` was
  made **without** the fix it describes.
- **"The ghost appears at bail-out and sticks to my cursor" is fully explained
  by it.** An abandoned drag left CODAP in an open dnd-kit session, and an open
  session follows the next real mouse it sees. Chad's mouse was not doing
  anything wrong; we never let go.

Fixed by moving the log to `dragPointer`'s normal release path. **Confirm before
trusting any run: a bailed-out drag must print `[dot-drag] EMERGENCY RELEASE at
x,y`.** If it does not, everything downstream is measuring a contaminated page.

## 2. What the arms were, and what happened to them

Both arms were run interleaved in one browser session, so the comparison between
them is the part that survives §0.

| Arm | Claim | Verdict |
|---|---|---|
| **B** — pause the wrapper's three.js render during the drag (`__dotPerf.liteDuringDrag`) | The wrapper's render starves CODAP's main thread | **Refuted.** With `axo.update`, whisker and `stage.render()` all skipped, arm B produced the single worst stall of the session. Activation latency was indistinguishable from arm A |
| **C** — stop `InputShield` re-asserting Dot's position (`__dotPerf.noReassert`) | Re-asserts are the one load a human's mouse causes, so they explain "only when I'm present" | **Refuted for activation.** Arm C produced both the fastest and one of the slowest activations. It did NOT survive as the answer to "why only when Chad is present" |

Arm C is worth one footnote rather than deletion. Measured separately: with a
drag already open, firing re-asserts at the shield's own cadence cut the frame
rate roughly sevenfold. That is a real cost **to the body of a drag**, not to
its start, and it is still the only load in the system that a human's mouse
creates. It is not the activation bug.

The `__dotPerf` instrumentation and the `noReassert` arm are left in place. They
are off by default and cost nothing.

## 2b. The paired run — the one result that does not depend on testbed speed

Every earlier comparison in this project set one machine against another, which
is exactly what §0 says cannot be trusted. This one sets **two event sources
against each other inside a single browser**, alternating, on the same page and
the same graph, with the same stream shape (40 steps, 12 ms apart, 180 ms hold):

- **TRUSTED** — the whole drag driven by CDP `Input.dispatchMouseEvent`. Real
  hit-testing, real implicit pointer capture, `isTrusted: true`, a `pointerId`
  the browser owns. This is what a hand on a mouse produces.
- **INJECTED** — `Injector.dragAttribute`, i.e. what Dot does.

Whatever this testbed's absolute speed, it is the same for both arms.

| | landed | ghost median | ghost, all runs | wall median |
|---|---|---|---|---|
| TRUSTED | **3/4** | 14.7 s | 1.0, 8.2, 14.7, 25.0 s | 38.5 s |
| INJECTED | **4/4** | 8.2 s | 0.03, 2.9, 8.2, 8.3 s | 39.8 s |

**There is no injection penalty. The drag driven by the browser's own mouse
machinery did worse.** Consequences:

- The whole family of "dnd-kit treats our synthetic stream differently" is dead,
  including the strongest remaining candidate in conundrum doc §7 Q3: our
  constant synthetic `pointerId` (`20260825`), which no real pointer owns, cost
  us nothing relative to a pointer the browser did own.
- A real mouse in this browser suffers 20-37 s frozen frames during an ordinary
  attribute drag. So on a loaded machine, CODAP v3 attribute drags are
  expensive **for humans too** — which is consistent with Chad's report that his
  own drags are fast, because his machine is not in this state.
- It follows that this testbed cannot reproduce the asymmetry Chad reports
  (his drags fast, Dot's failing). Both arms hit the same ceiling here. Testing
  that asymmetry requires his machine; see §5.

## 2c. The leaked automation browsers — §8 measured properly for the first time

While profiling the machine mid-session, three `agent-browser`
Chrome-for-Testing instances were found running at **over 100% CPU each**, ages
2 h, 8 h and 25 h. All three were parked on **`codap-same.html`** — our own
wrapper. Every agent-driven test session had been leaking one, and each leaked
copy keeps a three.js render loop and a live CODAP running forever in a window
nobody can see. Ordinary Chrome throttles `requestAnimationFrame` in a hidden
tab; automation browsers disable renderer backgrounding, so nothing stopped it.

Identical benchmark — four injected attribute drags, alternating attribute and
axis, activation timed separately from carry — run before and after killing
them, same tab, minutes apart:

| | idle worst gap | idle gaps > 1 s | activation median | carry median | total median | worst frame gap |
|---|---|---|---|---|---|---|
| with 3 leaked browsers | 3861 ms | 4 (in 15 s) | 22 967 ms | 25 236 ms | 48 203 ms | 41 787 ms |
| after killing them | 720 ms | **0** | **4778 ms** | 12 985 ms | **17 763 ms** | 9717 ms |

All four drags landed in both conditions, so this is a cost difference, not a
correctness one.

**RETRACTION, same day: the drag columns of that table are confounded and
should not be quoted.** A third bench run afterwards, on a quieter machine and
with the *better* step count, produced a carry median of 35.7 s — thirteen times
the 2.8 s that the identical configuration had just measured in §3b. Whatever
drives that variance is larger than anything being varied. The tell is in the
per-drag sequences:

```
BEFORE   48.2 -> 144.7 -> 27.4 -> 24.3   (page had just reloaded: fresh graph, decaying)
SHIPPED  58.8 ->  82.9 -> 40.6 -> 25.3   (page had just reloaded: fresh graph, decaying)
AFTER    14.4 ->  18.8 ->  9.5 -> 17.8   (inherited a settled graph: flat and fast)
```

BEFORE and AFTER were run as separate blocks, not interleaved, and the AFTER
block happened to inherit a settled graph while BEFORE had to create one. This
repo already measured that difference at 5-10× (`DemoDriver._waitForIdle`'s
comment: 39.5 s vs 8.0 s). So "2.7× from killing the browsers" cannot be
separated from "fresh graph vs settled graph". **A blocked design was the wrong
design and this is the price.**

What survives from this section:

- **The idle measurement.** 3861 ms worst gap and 4 gaps over 1 s in 15 s,
  against 720 ms and **zero** afterwards. That is a direct measure of the
  machine with no drag involved and no graph state to confound it. The leaked
  browsers were unambiguously costing the page its frame budget.
- **The leak itself**, which is a fact about the process list, not a
  measurement: three orphaned browsers on our own page, above 100% CPU, up to
  25 h old.
- **The hygiene rule** in §5 step 0.

What does not survive: any claim about how much the leak was costing a *drag*.

Two conclusions:

1. **This is what §8 of the conundrum doc was seeing**, and it is a testing
   hygiene problem, not a code problem. Check for stray `agent-browser`
   processes before trusting any timing — `ps -A | grep agent-browser`.
2. **Our page made the leak expensive.** Fixed in `web/src/codap-main.js`: the
   animation loop returns immediately when `document.hidden`, so a leaked or
   backgrounded copy costs nothing. It does not stop the leak; it stops the
   leak from mattering.

This also reframes every absolute number in §3 below: they were measured with
those three browsers running.

## 3. What was measured (testbed numbers — see §0)

Scripts live in the session scratchpad and are dependency-free CDP drivers
(Node 24's global `WebSocket`; no puppeteer). Reproduce by launching Chrome with
`--remote-debugging-port`, attaching to the `codap-same.html` target, and
evaluating in the page. Two things to know if you rewrite them:

- Park long-running evaluations on a page global before awaiting, or V8
  collects the pending promise during exactly the long tasks being measured and
  CDP answers "Promise was collected".
- Never dropping the attribute keeps document state identical between
  repetitions, which makes activation latency repeatable without a revert.

Findings, in the testbed:

1. **Activation latency is one long task.** In every repetition the worst frame
   gap accounted for essentially the whole wait, with only two or three polls
   completing. It is not accumulated per-move cost.
2. **An idle page is quiet.** Three minutes with nothing dragged: zero frame
   gaps over 1 s, worst gap 894 ms. The stalls follow the press; they are not
   ambient.
3. **The stall is CODAP's own React work.** A CPU profile of a stalled
   activation is dominated by CODAP frames; the wrapper's three.js does not
   appear in the top of the profile at all. CODAP's `dndDetectCollision`
   (`v3/src/lib/dnd-kit/dnd-detect-collision.ts`) calls
   `document.elementFromPoint` per collision pass, which forces layout.
4. **A warm-up press does not help and is unsafe.** When the throwaway press
   was slow, the activation right after was slow too — so it is not a one-time
   cost that can be paid early. It also opens the attribute's menu.
5. **On the fixed code path, 6 of 6 drags started and 6 of 6 landed** — but at
   testbed speeds that mean nothing on their own.

CODAP's sensor configuration, verified in `concord-consortium/codap`
(`v3/src/lib/dnd-kit/codap-dnd-context.tsx`): `PointerSensor` with
`activationConstraint: { distance: 3 }`. No delay, no tolerance — so an 8 px
nudge is sufficient to activate and cannot cancel activation. That closes one
candidate mechanism from conundrum doc §7 Q3.

## 3b. Move count, and why frame-pacing is the wrong lever

Chrome delivers real `pointermove` events **aligned to the animation frame** —
one per rAF, with the intermediate samples carried in `getCoalescedEvents()`.
Chad's recorded 384-move manual drag is therefore ~384 *frames*, and dnd-kit ran
one collision pass per frame however fast his hand moved. `dispatchEvent` is
never coalesced, so our moves each cost a full collision pass — and CODAP's
`dndDetectCollision` calls `document.elementFromPoint` in every one.

`eca321a` raised the injected stream from 8 moves to 40 to "match" his
recording. That treats a coalesced stream and a dispatched one as equivalent.
They are not.

Three conditions, interleaved, three reps each, on a quiesced machine. All nine
landed. **Carry** time (press to release, excluding activation):

| condition | carry median | carry, all reps | total median |
|---|---|---|---|
| 40 moves, unpaced — what shipped | 5447 ms | 5447, 3359, 11841 | 15 808 ms |
| 40 moves, paced to rAF | 17 677 ms | 18 245, 14 064, 17 677 | 18 680 ms |
| **8 moves, unpaced** | **2782 ms** | 2782, 2918, 2036 | **6138 ms** |

**Frame-pacing is the worst option**, and badly so: on a page whose frames are
seconds apart, pacing 40 steps to rAF pays the stall forty times. Conundrum doc
hypothesis 5 reached the same verdict from a premise now known to be false
("rAF fires at 60fps and paced nothing"); the verdict survives its reasoning.

Eight moves wins on the median and, more importantly, on **spread** — 2.0-2.9 s
against 3.4-11.8 s. A demo running against a wall clock needs predictability
more than it needs a good median.

**Caveat added the same day, and it matters.** A later bench measured the
8-move configuration at a 35.7 s carry median — thirteen times what the FEW8
arm above recorded for the same settings. Between-session variance is therefore
larger than the effect this table reports. This comparison *was* interleaved
A/B/C within one session, which is what protects it from drift, and FEW8 beat
FAST40 in all three reps rather than on average. But n=3 against that much
noise is weak evidence, and the mechanism (each dispatched move is one more
collision pass; a human's stream is frame-aligned and ours is not) is currently
better supported than the size of the number. **Treat "fewer moves is cheaper"
as likely and "2× cheaper" as unmeasured.**

Changed: `Injector.dragAttribute` back to `steps: 8, stepMs: 70`;
`DemoDriver.dragAttribute` no longer overrides the step count.

**Trade-off taken knowingly.** `onStep` moves the paw sprite once per dispatched
move, so 8 steps make the paw hop rather than glide. The right fix is to
interpolate the paw on the driver's own frame tick and leave the event count
alone — smoothness belongs to the renderer, not to the event stream. Not done
here because it changes how the demo looks, and that wants eyes on it.

## 3c. Fresh graph vs settled graph — the one clean separation

The retraction in §2c pointed at graph freshness as the confound. Tested
directly, interleaved, four reps each, all eight landing. CARRY time, press to
release:

| | carry, every rep | carry median | totals |
|---|---|---|---|
| FRESH — graph created ~1.5 s earlier | 25 744, 30 451, 28 086, 31 337 ms | **30 451 ms** | 43.4, 42.1, 52.0, 58.8 s |
| SETTLED — quiesced first | 12 826, 12 686, 11 982, 6615 ms | **12 686 ms** | 18.0, 50.5, 25.2, 25.1 s |

**The distributions do not overlap.** Every FRESH carry exceeds every SETTLED
carry. Nothing else measured this session separated that cleanly, and against
13× between-session variance a non-overlapping result at n=4 is worth more than
a large median difference that overlaps.

Activation, by contrast, overlaps heavily — FRESH 11.7-27.4 s, SETTLED
5.2-37.8 s. **Graph freshness costs the carry, not the start.** That is
consistent with the mechanism: carry cost is collision passes, CODAP's
`dndDetectCollision` forces layout on every one, and a graph built moments ago
has a great deal of layout to force.

This is the demo's own shape. `tutorial2.demo` reads:

```
tap toolbar:graph
wait component:graph 30s
beat 1.5
drag pill:Age -> axisDrop:bottom teaching
```

— a drag onto a graph a second and a half old, i.e. the FRESH arm, every run.
And `DemoDriver.dragAttribute` gated it with `_waitForIdle()`'s defaults
(`maxMs 4000, frameMs 60, need 3`), which accept a page still producing 60 ms
frames. That was not a gate.

Changed: `DemoDriver.dragAttribute` now quiesces with
`{ maxMs: 20000, frameMs: 20, need: 10 }` plus a 4 s settle — the recipe the
SETTLED arm used. It costs about 4 s and saves about 18 s of carry. The gate and
the settle were measured together; tune them together.

**Not yet confirmed end to end.** This changes the drag path, not the demo
script, and the whole demo has not been re-run against it. That is step 2 of §5.

## 4. The fix that came out of it

`_awaitPreviewEl` no longer counts frozen time against its deadline. A poll that
returns late is evidence the main thread was blocked, not evidence the drag
failed, so the deadline extends by the frozen interval, to a hard ceiling.

The point is that this is **load-proportional, not a bigger timeout**. On a
healthy page it never extends and behaves exactly as the old 12 s deadline did,
so it cannot slow down the machine where drags are already fast. It only does
anything on a page that has actually stopped running — and per §0, whether that
happens on Chad's machine is precisely what has not been established.

The old loop also checked for the element *before* checking the deadline, so a
long task straddling both returned a "success" past the budget — one activation
took 20.8 s inside a 12 s deadline and was logged as fine. The reported wait is
now honest.

## 4b. End to end, all four changes together

`__demo.run('tutorial2','MakeScatterplot')` in three conditions, two reps each,
interleaved with a direct-injection control:

```
DIRECT  wall=161874ms  landed=true    [dot-drag] started after 15674ms
ALONE   wall=169358ms  FAILED         started after 14908ms  — demo exceeded 120s wall clock
HUMAN   wall=155287ms  FAILED         started after 11932ms, 4680ms — exceeded 120s
DIRECT  wall= 15735ms  landed=true    started after 5635ms
ALONE   wall=151674ms  FAILED         started after 9364ms, 6130ms — exceeded 120s
HUMAN   wall=129475ms  FAILED         started after 9306ms, 6008ms — exceeded 120s
```

**What worked:**

- **`NEVER STARTED` is gone. Nine drag starts out of nine**, at 4.7-15.7 s. Two
  of them — 15 674 ms and 14 908 ms — are past the old flat 12 s deadline and
  would have been abandoned. The load-proportional deadline converts exactly
  the failures it was built for.
- **`releasing normally after 10 samples`** on every drag. The release path is
  alive again (§1), and "10 samples" is 8 moves plus press plus release, which
  confirms the step-count change is the one in effect.
- Direct injection landed 2/2.

**What did not:** every full demo run still fails, but for a *different reason*
than before. Not `NEVER STARTED` — `demo exceeded 120s wall clock`. The drag
starts, the drag lands, and the demo runs out of budget. `MakeScatterplot` is
two drags plus a graph creation plus a revert, and it needs 130-170 s against
`CAPS.wallClockSec: 120`.

**A caveat on the HUMAN arm — it did not test what it was meant to.** 1554
trusted mouse moves were dispatched during the demo, and the shield reported
`blocked=0, reasserts=0`. So either `__demo.run`'s path (`runViaEngine` →
behaviour `dot-demo`) does not start the `InputShield`, or the shield never saw
those events. Until that is resolved, the only claim supported is "a moving
trusted mouse did not change the outcome", NOT "the shield path was exercised".
Worth settling before anyone concludes anything about Chad being present.

## 4c. THE DECIDING RESULT — starvation is refuted on Chad's machine

Chad ran the real "Show me." path on his own machine with all the fixes in, and
the console said:

```
[dot-drag] NEVER STARTED after 12017ms
[dot-drag] releasing normally after 10 samples
```

Read those two lines carefully, because between them they close most of this
document:

1. **`12017ms`, and no `of which Nms was a frozen main thread` line.** That
   second line prints whenever `_awaitPreviewEl` extends its deadline, which it
   does whenever a poll arrives more than 500 ms late. It did not print. So the
   50 ms polls ran on time for twelve straight seconds: **the main thread was
   running normally and dnd-kit still did not activate.** Every main-thread
   starvation explanation — arm B, arm C, the leaked browsers, graph freshness —
   is refuted *as an explanation of Chad's failure*. They are real costs; they
   are not this bug.
2. **`releasing normally after 10 samples`** confirms the current code is live
   (8 moves + press + release) and that the release path works.

The testbed and Chad's machine now fail in qualitatively different ways:

| | activation | thread |
|---|---|---|
| CDP testbed | always succeeds, 6.7-29.1 s | stalled; deadline extends |
| **Chad's machine** | **never, inside 12 s** | **running fine** |

Chasing the testbed's numbers further is chasing a different bug.

### What is left, and it is a short list

dnd-kit declines to activate from our `pointerdown` + 8 px nudge on a page that
is not busy. The strongest surviving candidate is conundrum doc §7 Q3, and it
survives the paired trusted-vs-injected run (§2b) because that run was made in
the testbed, where injected activation works:

**`Injector.pointerId` is a constant fiction — `20260825`.** The argument: if
CODAP's `pointerdown` handler calls `setPointerCapture(event.pointerId)` it
throws `NotFoundError`, the rest of that handler never runs, dnd-kit never
activates, and nothing is visible anywhere because `dispatchEvent` swallows what
listeners throw. A real drag gets implicit capture and never takes that path —
which would explain why Chad's own drags always work.

**KILLED THE SAME DAY, before Chad spent a run on it.**
`Element.prototype.setPointerCapture` and `hasPointerCapture` were hooked inside
the CODAP frame and the exact press + nudge sequence run:

```
pointerId used:    20260825
ghost appeared:    true
capture API calls: []      <- never called, not once
capture throws:    []
window errors:     []
```

CODAP's drag path does not touch the pointer-capture API, so a synthetic
pointer id cannot be aborting anything. This is also why §2b found no injection
penalty: there is no capture path for a fake pointer to fail.

**So there is currently NO surviving hypothesis for Chad's failure.** What is
known: on his machine, with a demonstrably unstalled main thread, dnd-kit does
not produce `.dnd-kit-drag-overlay` within 12 s of a `pointerdown` plus an 8 px
nudge — while something black bearing the word "Age" does render at the pill.
The next move is observation, not theory.

The instrument for that:

- **`window.__dotWatch`** (`web/src/demo/watch-drag-dom.js`) — records, during a
  real demo: every ghost-ish element added or removed anywhere in CODAP, six
  candidate overlay selectors (so a class name our production selector misses
  shows up as "this matched and ours did not"), pointer-capture events, and
  exceptions thrown inside CODAP's own listeners. `__dotWatch.start()`, click
  "Show me.", `__dotWatch.report()`. Prints copy-pasteable text.

  The two questions it answers, both of which currently have no answer:
  **what is the black "Age" rectangle**, and **does the production selector
  `.dnd-kit-drag-overlay` ever match on Chad's machine at all** — because if a
  broader selector matches when ours does not, then dnd-kit activated fine and
  this was never an activation bug, only a detection bug.

## 5. What still has to be run, and where

On **Chad's machine, in Chad's Chrome, on the "Show me." path, with Chad
present** — the only venue where the failure was ever observed:

0. **First, `ps -A | grep agent-browser`.** If anything is running, kill it and
   note that you did. Every measurement in this project's history was taken
   without this check, and §2c shows what that costs: a 2.7× swing. A run made
   with leaked browsers alive measures the leak, not the code.

1. Confirm `[dot-drag] EMERGENCY RELEASE at x,y` appears when a demo bails.
   **If the attribute stops sticking to his cursor, §1 was the whole of the
   headline symptom** and the rest of this document is about a secondary issue.
2. Record the `[dot-drag]` line on each `MakeScatterplot` run: `started after
   Nms`, `NEVER STARTED`, or the new `gave up after Nms, of which Nms was a
   frozen main thread`. That third line is the discriminator — it separates "the
   page froze" from "dnd-kit never activated on a running page".
3. If the new line reports **little or no frozen time** and the drag still does
   not start, then main-thread load is refuted on the machine that matters, and
   the next hypothesis is conundrum doc §7 Q3 — `pointerId`/pointer capture.
   `inject.js` uses a constant synthetic id (`20260825`) that no real pointer
   owns, so any `setPointerCapture(event.pointerId)` inside CODAP throws
   `NotFoundError`. `__dotRecord` already captures `gotpointercapture` /
   `lostpointercapture` and they have never been inspected.

## Related

- `docs/DRAG-GHOST-CONUNDRUM.md` — the full problem statement
- `docs/verification/phase9/MAKESCATTERPLOT-ISSUE.md` — quiescing protocol
- `docs/verification/phase9/P4-NOTES.md` — collisions come from the dragged
  item's rect, relevant to the secondary drop failure
