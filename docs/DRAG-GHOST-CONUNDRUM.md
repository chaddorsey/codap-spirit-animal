# The drag-ghost conundrum — injected attribute drags in CODAP v3

**Status: unresolved.** Written 2026-08-27 for review by a second party who has
no access to the conversation that produced it. Everything needed to evaluate
the problem is in this document or in the files it names.

Repo: `github.com/chaddorsey/codap-spirit-animal`, branch `master`.
Last commit at time of writing: `b70e734`.
Venue: local dev, vite on `:5199`, same-origin proxy in `web/vite.config.js`.
Target: CODAP **v3.1.0 (build 2985)**, loaded in an iframe from
`web/codap-same.html?tutorial=2`, proxied so it is same-origin and scriptable.

---

## 1. What the software is trying to do

An animated character ("Dot") demonstrates CODAP tasks by injecting synthetic
input events into the CODAP iframe. The failing task is tutorial 2's
`MakeScatterplot`, whose middle step drags the attribute pill **`Age`** from the
case table onto a graph's x axis.

The relevant code:

| File | Role |
|---|---|
| `web/src/inject.js` | low-level event injection; `dragPointer()`, `dragAttribute()` |
| `web/src/demo/demo-driver.js` | orchestration; `DemoDriver.dragAttribute()`, `runScript()`, `revert()` |
| `web/public/demo-scripts/tutorial2.demo` | the demo script (line notation) |
| `web/src/demo/record-drag.js` | `window.__dotRecord` — the event recorder used below |
| `web/src/demo/trace-input.js` | `window.__dotTrace` — an earlier event tracer |

CODAP v3 uses **dnd-kit** for attribute drags. When a drag activates, dnd-kit
renders a drag preview element with class **`.dnd-kit-drag-overlay`** — a small
dark card showing the attribute name. Chad calls this "the ghost card". Its
presence is the visible proof that dnd-kit considers a drag to be in progress.

---

## 2. The conundrum, stated precisely

**In direct-injection tests run from the console, the ghost card appears and the
drag sometimes lands. In the real situation — clicking the "Show me." link and
letting the full demo run on Chad's machine — the ghost card does not appear
until the demo bails out, at which point it is attached to Chad's real cursor.**

Chad's exact words, in order, across several runs:

> "she goes to grab and drag the attribute, but nothing happens. Then when my
> real mouse pointer wavers, the attribute jumps to and sticks to it."

> "I see a black rectangle that says Age frozen on the screen while Dot is at
> the graph already. Then when the demo times out, I see the drag ghost appear."

> "The age ghost card only appears once the scripting ends, and is connected to
> my cursor at that point."

> "The ghost appears about 9 seconds before the video plays - probably at script
> bail out?"

> "Astonishingly slow, but successful again -- the ghost card appears right away
> and drags successfully in that test." *(this was a direct-injection test)*

> "It always worked in the tests. Why doesn't it work when my cursor is
> present?"

The console on a failing real run reports:

```
[dot-drag] NEVER STARTED after 12029ms
[dot] demo failed for MakeScatterplot — playing the movie
      — REASON: waitFor "graphX:Age" timed out after 30s
```

`NEVER STARTED` means `web/src/inject.js` dispatched `pointerdown`, then a
nudge move, then polled for `.dnd-kit-drag-overlay` for 12 seconds and never
found it. The graph itself was created successfully — the failing wait is
`graphX:Age`, i.e. only the attribute drop failed.

---

## 3. Two bugs that WERE found and fixed

Both were real, both are confirmed by instrumentation, and both should be
retained regardless of what the remaining problem turns out to be.

### 3.1 An aborted drag never released the pointer (`eca321a`)

Recording a real drag and Dot's failing drag side by side produced this:

```
manual: pointerdown 2, pointermove 384, mousemove 384, pointerup 2, mouseup 2
dot:    pointerdown 1, pointermove 22,  mousemove 21,  <no pointerup at all>
        dragDurationMs: null, upTarget: null
```

The demo hit its wall-clock cap part-way through the move loop, threw, and the
pointer was left **down**. CODAP stayed in an open drag session. An open dnd-kit
session follows whatever pointer events it next receives — which, on a real
user's machine, is their mouse. **This is the most likely explanation of the
original "Age sticks to my cursor" report, and it was our bug.**

`dragPointer()` now releases on every exit path (abort, wall clock, thrown
error): `pointerup` + `pointercancel` + `mouseup` at the last known point,
logged as `[dot-drag] EMERGENCY RELEASE at x,y`.

### 3.2 We carried the attribute before dnd-kit had activated (`8b4ad99`)

dnd-kit attaches its move listeners when it handles the `pointerdown`. Our
`pointerdown`, all moves and the release were dispatched faster than CODAP
handled the press, so the carry landed on a document that was not yet listening.

`dragAttribute()` now nudges 8px to clear the activation distance, then waits
for `.dnd-kit-drag-overlay` to exist (up to 12s) before carrying. Logged as
`drag:started` or `drag:never-started`.

---

## 4. Every hypothesis tested, and how each was killed

These are recorded so they are not re-proposed. Each was believed at the time
and each was wrong.

| # | Hypothesis | How it was killed |
|---|---|---|
| 1 | The student's real mouse events hijack the drag; block them at **document** capture | Shield engaged (13/16 samples with `shield.on`) and the attribute still followed the cursor |
| 2 | Blocking failed because CODAP listens at **window**; extend the shield upward | `__dotTrace` showed 3713 trusted events blocked, `leaksByNode` empty below `frameWindow`, hijack unchanged |
| 3 | We cannot win listener-registration order, so re-assert Dot's position after each blocked event | 677 re-asserts fired; Chad: "Age still jumped **toward** the mouse" — a tug-of-war we lose |
| 4 | Take CODAP out of the mouse's reach with `pointer-events: none` on the iframe | Verified applied (322/381 samples) and restored; hijack unchanged. **Chad then confirmed the failure predates all mouse-blocking work** |
| 5 | We out-run CODAP; pace injected moves by `requestAnimationFrame` | CODAP's drag work is queued async, not a blocked thread, so rAF fires at 60fps and paced nothing. Chad: "looks very similar" |
| 6 | Pace instead to `.dnd-kit-drag-overlay`'s own position | Works mechanically (8/8 steps "caught") but costs 72.9s for one drag, and the ghost appears ~10s late even in a **successful manual drag**, so it is a bad signal |
| 7 | CODAP wants click-hold-**drag**; 90ms is not a press | Chad: "It's not the timing; I can do it fast." Hold was raised to 650ms, made no difference, reverted to 180ms |
| 8 | Our render loop starves CODAP's main thread | Not conclusively tested. Chad's objection: his own drags are not processed late. **Open — see §7** |
| 9 | The difference is a real cursor being present | Parked a real cursor over CODAP via CDP `mouse move`; the drag still landed (`landed: "Age"`, 75.2s). **Not reproduced, but CDP's cursor may not be equivalent to a physical one** |
| 10 | The difference is dragging onto a freshly created graph vs a settled one | Both fail (see §5). Fresh may be worse but 2 runs per condition cannot establish it |

---

## 5. A correction that undermines earlier claims in this project

**Every "verified working" statement made about this drag during development
was based on one or two successful runs.** When the same direct-injection drag
was finally run four times with the landing checked each time, on a settled
graph and a fresh one:

```
FRESH graph    189.0 s   landed: null
FRESH graph     74.3 s   landed: null
SETTLED graph   63.0 s   landed: null
SETTLED graph   27.3 s   landed: "Age"     <- the only success
```

**The injected drag lands roughly one time in four in the developer's own
environment.** Earlier reports of "the drag works in tests" were sampling error.
This matters for reading everything else in this document: a fix that appeared
to work on a single run may have changed nothing.

It also means the conundrum as originally framed — "works in tests, fails in
reality" — is partly an artifact. It fails often in tests too. What is *not*
explained by flakiness is the ghost card's timing: in direct-injection tests it
appears early, and in real demo runs on Chad's machine it appears only at
bail-out.

---

## 6. Recorded measurements

All captured with `window.__dotRecord` inside the CODAP frame. `summary()`
reports: hold before first move, move counts, drag duration, when the ghost
first appeared, and median gap between moves.

### 6.1 Manual drags by Chad (both succeeded)

```
take 1: events 778, real 778
        pointermove 384, mousemove 384, pointerdown 2, pointerup 2
        holdBeforeFirstMoveMs 1009
        ghostFirstSeenMs 4398
        medianMoveGapMs 1

take 2: events 821, real 795
        pointermove 390, mousemove 416, pointerdown 3, pointerup 3
        holdBeforeFirstMoveMs 1832
        ghostFirstSeenMs 10925
        medianMoveGapMs 1
```

Two facts here contradict fixes that seemed to help:
- a human pauses **1–1.8 seconds** between press and first move
- the ghost takes **4.4s and 10.9s to appear in drags that WORK**, so a late
  ghost is not itself a symptom

### 6.2 Dot's drags via the "Show me." link (both failed)

```
take 1: events 47, real 38, synthetic 9
        pointermove 22, mousemove 21, pointerdown 1, mousedown 1
        NO pointerup, NO mouseup
        holdBeforeFirstMoveMs 12850
        ghostFirstSeenMs 32063

take 2: events 25, real 16, synthetic 9
        pointermove 11, mousemove 10, pointerdown 1, mousedown 1
        NO pointerup, NO mouseup
        holdBeforeFirstMoveMs 43248
        ghostFirstSeenMs 64915
```

`synthetic: 9` means only ~7 of 40 intended moves were ever dispatched.

### 6.3 Developer-machine runs

```
direct injection, settled graph, preview-paced   72.9s  landed "Age"  8/8 steps caught
direct injection, real cursor parked over CODAP  75.2s  landed "Age"  drag:started
full runner (Show me path)                       ghost at 76.8s, drag:started,
                                                 pointerdown 1 / pointermove 45 / pointerup 1,
                                                 demo exceeded 120s wall clock
```

---

## 7. Open questions for a second opinion

1. **Why does `.dnd-kit-drag-overlay` appear within 12s on the developer's
   machine but not within 12s on Chad's, for the same code path?** This is the
   conundrum Chad wants examined. Note the developer's machine is heavily
   loaded (34–62 Chrome processes, load average 5–7) and is if anything
   *slower*, which makes the direction of the difference counter-intuitive.

2. **Is there a material difference between the direct-injection path and the
   full-runner path that has not been isolated?** Direct tests call
   `Injector.dragAttribute()` in `web/src/inject.js`. Real runs go through
   `DemoDriver.dragAttribute()` in `web/src/demo/demo-driver.js`, which adds:
   an `InputShield`, `_waitForIdle()`, `goTo()` character travel, resolver
   lookups, an active three.js render loop, the behaviour engine, and plugin
   checkbox suppression. **This has not been A/B'd and is the most obvious
   untested variable.**

3. **Does the injected `pointerId` matter?** `web/src/inject.js` uses a constant
   synthetic id `20260825`. No pointer with that id exists, so any
   `setPointerCapture(event.pointerId)` inside dnd-kit or CODAP would throw
   `NotFoundError`. `gotpointercapture` / `lostpointercapture` are recorded by
   `__dotRecord` but have not been inspected in a capture. A real drag gets
   implicit pointer capture; ours cannot.

4. **Is the ~70s latency real, or an artifact of a saturated main thread?**
   `web/src/codap-main.js` runs a three.js loop via
   `stage.renderer.setAnimationLoop()`. A comment there records a prior
   measurement: 26 fps idle, 3.8 fps mid-demo, single frame gaps of 6–12s.
   Whether pausing that loop makes the ghost appear promptly was **not** tested
   — the experiment was prepared and then abandoned.

5. **Why does the drop fail to commit even when the ghost appears?** Three of
   four direct tests reached `drag:started` and still ended with
   `landed: null`. Nothing has yet inspected whether the axis droppable reaches
   dnd-kit's `over` state at the moment of `pointerup`. A previous finding in
   `docs/verification/phase9/P4-NOTES.md` is relevant: **dnd-kit computes
   collisions from the DRAGGED ITEM's rect, not the pointer position**, which is
   why drop points are aimed low (0.75–0.78 down the target). If the overlay is
   not where we think it is, the collision may be resolving against the wrong
   droppable or none.

---

## 8. Environment caveats that have distorted measurements

- **Machine load moves these numbers by 2–4×.** Closing two idle automation
  browsers took Chrome from 62 processes to 34 and changed `MakeScatterplot`
  from 2-of-3 failing to 5-of-5 passing in an earlier session. Any timing in
  this document should be read as an upper bound, not a property of the code.
- **Sample sizes are small.** Most conclusions here rest on 1–4 runs.
- **A previous harness confound produced a wrong diagnosis** that survived
  several rounds: the test deleted a graph and started the next attempt ~3s
  later, so every run was timed against a busy CODAP, and the resulting spread
  was misread as "CODAP variance". Quiescing properly (20s floor, then frames
  ≤45ms sustained for 5s) collapsed it. Recorded in
  `docs/verification/phase9/MAKESCATTERPLOT-ISSUE.md`.

---

## 9. How to reproduce

```
cd web && npm run dev          # vite on :5199
open http://localhost:5199/codap-same.html?tutorial=2
```

Wait for attribute pills to appear in the case table (30–60s). Then in the
console:

```js
__dotRecord.start('manual')        // drag Age to the x axis BY HAND
__dotRecord.stop()

__demo.driver.debugNoCancel = true // stop clicks cancelling the demo
__dotRecord.start('dot')           // click "Show me." for the scatterplot task
__dotRecord.stop()

__dotRecord.diff()                 // side by side
__dotRecord.head('dot', 30)        // raw events, as text
__dotRecord.injLog()               // what the injector believes it dispatched
```

Watch the console for `[dot-drag] started after Nms` / `NEVER STARTED`,
`releasing normally` / `EMERGENCY RELEASE`, and the `REASON:` on any failure.

To run the drag directly, bypassing the demo runner:

```js
const doc = document.getElementById('codap').contentDocument
const pill = doc.querySelector('[data-testid="codap-attribute-button Age"]')
const g = doc.querySelector('[class*="codap-graph"]')
const r = g.getBoundingClientRect()
await __demo.driver.inj.dragAttribute(pill, { x: r.left + r.width*0.4, y: r.top + r.height*0.75 })
```

---

## 10. Related documents

- `docs/PHASE9-SHOWME.md` — the governing work order for this phase
- `docs/SPIKE-SAME-ORIGIN.md` — how injection into CODAP v3 was established,
  including the four distinct input stacks (dnd-kit, React props, d3-drag,
  PixiJS) and which event types each requires
- `docs/verification/phase9/MAKESCATTERPLOT-ISSUE.md` — the wall-clock overrun,
  and the corrected "it is not variance" diagnosis
- `docs/verification/phase9/P4-NOTES.md` — the aim-low drop-zone finding and the
  state-diff revert's blind spots
