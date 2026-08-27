# The drag-ghost conundrum — injected attribute drags in CODAP v3

**STATUS: SOLVED, 2026-08-27. The cause was a stale document reference in our
own code. Read §0 first; most of what follows is the search, kept for the record
and because several of its findings are worth having on their own.**

## 0. The answer

`Injector`'s constructor did `this.doc = win.document` — a snapshot. `setupDemo()`
in `web/src/codap-main.js` runs at module-eval time as well as on CODAP's
`connected` event, and its only guard was `sameOrigin(iframe)`. **`about:blank`
is same-origin.** So when module-eval won the race, the whole demo stack was
built against the placeholder document every iframe holds before its real one
arrives, and `inj.doc` pointed at a dead document for the life of the page.

**Confirmed on Chad's machine: `__demo.inj.staleDoc === true`.** In the CDP
testbed it was `false`, which is precisely why the failure could never be
reproduced there.

Why this produced the exact symptoms and nothing that looked like a stale
reference:

| Observation | Cause |
|---|---|
| Dot taps the toolbar, makes a graph, presses the pill — all fine | The driver's resolvers read elements from `iframe.contentDocument`, fresh each time, and `_dispatch(el, …)` fires on the element itself, which is in the LIVE document |
| The black "Age" card appears at the pill | That press reached dnd-kit. It activated |
| The card never follows Dot | `moveTarget: 'document'` resolves to `this.doc` — the DEAD document. Every `pointermove` went nowhere |
| `NEVER STARTED after 12017ms`, thread demonstrably NOT stalled | `_awaitPreviewEl` polled the dead document, so it could never find the overlay however healthy the page was. Exactly 12 s, never extending, because nothing was ever slow |
| The card lands on Chad's cursor when the demo bails | `upOn: 'document'` — the `pointerup` went to the dead document too. dnd-kit's session was never closed, so it followed the next real pointer it saw |
| `__dotWatch` recorded ZERO events while Chad watched the card appear | It watched `inj.doc` as well |
| "It only fails when I'm present" | A red herring throughout. It is a page-load race, and Chad's sessions lost it |
| Chad's own drags always work | Real events go to the real document |

**Fixed** in `web/src/inject.js` and `web/src/codap-main.js`:

- `Injector.doc` is now a live getter (`get doc() { return this.win.document; }`),
  so a snapshot can never go stale. `Injector.staleDoc` reports whether the
  constructor's capture has since been replaced — keep it, it is the diagnostic
  that closed this.
- `setupDemo()` now refuses to build until CODAP's real document exists
  (`codapDocReady`), retrying every 250 ms rather than relying on two fixed
  retries, because silently never setting up would be a worse failure.

**The lesson worth carrying:** `sameOrigin()` is not a readiness check, and a
document reference held across a navigable frame is a bug waiting for a race to
expose it. The symptom set it produced was elaborate enough to survive ten
hypotheses and two rounds of instrumentation.

---

Original document follows. Written 2026-08-27 for review by a second party who
has no access to the conversation that produced it.

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

**The problem is the drag START and the drag itself — NOT the drop.** Chad, who
owns this project and is the person observing the failure, is explicit about
this and it should frame any investigation:

> "The drop isn't the core issue -- it's the drag start and drag. My drags
> always work. We need to figure out why Dot's don't when I'm present."

Stated as a single question: **why does dnd-kit fail to begin a drag from Dot's
synthetic `pointerdown` when a human is present at the machine, given that the
same code begins a drag successfully in automated tests where no human is?**

The visible form of the failure: in direct-injection tests run from the console,
the ghost card appears promptly. In the real situation — clicking the "Show me."
link and letting the full demo run on Chad's machine — the ghost card does not
appear until the demo bails out, at which point it is attached to Chad's real
cursor.

A human's drag on the same page, in the same session, always works. Only the
injected one fails, and it fails at the beginning rather than at the end.

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

> **CORRECTION, 2026-08-27, after this document was circulated: this fix was
> INERT until today.** `Injector._releaseAt()` began its `try` with
> `console.log(..., samples.length, ...)`, and `samples` is a local of
> `dragPointer()`. Every call threw `ReferenceError` before dispatching
> anything, and the method's own `catch` swallowed it — so from `b70e734`
> onward there was no `pointerup`, no `pointercancel`, and no
> `EMERGENCY RELEASE` line on the console, ever. Read everything below as a
> description of the intent, and everything observed since `eca321a` as
> observed WITHOUT it. In particular, "the ghost appears at bail-out and sticks
> to my cursor" needs no further explanation: an open dnd-kit session follows
> the next real mouse it sees, and ours was never closed. Fixed by moving the
> log to `dragPointer`'s normal release path; confirm with a bailed-out drag
> printing `[dot-drag] EMERGENCY RELEASE at x,y`.

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
| 3 | We cannot win listener-registration order, so re-assert Dot's position after each blocked event | 677 re-asserts fired; Chad: "Age still jumped **toward** the mouse" — a tug-of-war we lose. Re-opened 2026-08-27 as a suspect, because a re-assert dispatches a `pointermove` into CODAP mid-drag and fires only when a real mouse moves — the one load in the system that exists ONLY when a human is present. **Tested and killed as a cause of the failed drag START** (arm C, `docs/EXPERIMENT-RENDER-STARVATION.md`): it produced both the fastest and one of the slowest activations. It DOES cost real throughput once a drag is open — measured, roughly a sevenfold frame-rate drop — so it remains a suspect for the slow drag BODY |
| 4 | Take CODAP out of the mouse's reach with `pointer-events: none` on the iframe | Verified applied (322/381 samples) and restored; hijack unchanged. **Chad then confirmed the failure predates all mouse-blocking work** |
| 5 | We out-run CODAP; pace injected moves by `requestAnimationFrame` | CODAP's drag work is queued async, not a blocked thread, so rAF fires at 60fps and paced nothing. Chad: "looks very similar". **The verdict survives but the reasoning does not (2026-08-27):** the thread demonstrably DOES block, for seconds at a time — which makes pacing worse, not neutral. Measured carry time, 40 moves: 5447 ms unpaced vs 17 677 ms rAF-paced. Pacing 40 steps to a page whose frames are seconds apart pays the stall forty times |
| 6 | Pace instead to `.dnd-kit-drag-overlay`'s own position | Works mechanically (8/8 steps "caught") but costs 72.9s for one drag, and the ghost appears ~10s late even in a **successful manual drag**, so it is a bad signal |
| 7 | CODAP wants click-hold-**drag**; 90ms is not a press | Chad: "It's not the timing; I can do it fast." Hold was raised to 650ms, made no difference, reverted to 180ms |
| 8 | Our render loop starves CODAP's main thread | **KILLED 2026-08-27.** Tested by pausing `axo.update`, the whisker and `stage.render()` for the duration of the drag, interleaved against an unpaused arm in one browser session: activation latency was indistinguishable, and the paused arm produced the session's worst stall. A CPU profile of a stalled activation contains no three.js in its top self-time at all. See `docs/EXPERIMENT-RENDER-STARVATION.md` |
| 9 | The difference is a real cursor being present | Parked a real cursor over CODAP via CDP `mouse move`; the drag still landed (`landed: "Age"`, 75.2s). **Not reproduced, but CDP's cursor may not be equivalent to a physical one** |
| 11 | Synthetic events are handled differently from real ones — dnd-kit rejects or mishandles our stream | **KILLED 2026-08-27 by a paired run.** A whole drag driven by CDP `Input.dispatchMouseEvent` (trusted events, real hit-testing, real implicit pointer capture, a pointerId the browser owns) was alternated against `Injector.dragAttribute` in ONE browser, same page, same graph, same stream shape (40 steps, 12 ms apart, 180 ms hold). Result: **trusted landed 3/4, injected landed 4/4**; ghost median 14.7 s trusted vs 8.2 s injected; wall clock indistinguishable. There is no injection penalty. A drag driven by the browser's own mouse machinery did WORSE. See `docs/EXPERIMENT-RENDER-STARVATION.md` |
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

1. **THE CENTRAL QUESTION. Why does dnd-kit not begin a drag from an injected
   `pointerdown` when a human is at the machine?** `.dnd-kit-drag-overlay`
   appears within 12s on the developer's machine and not within 12s on Chad's,
   for the same code path. Note the developer's machine is heavily loaded
   (34–62 Chrome processes, load average 5–7) and is if anything *slower*, which
   makes the direction of the difference counter-intuitive — a slower machine
   should be worse, not better.

   **PARTIAL ANSWER, 2026-08-27 — and it may dissolve the question rather than
   answer it.** Two of the three things this question rests on turned out to be
   artefacts of our own making:

   - The "sticks to my cursor" half is the `_releaseAt` `ReferenceError` (§3.1
     correction). We never released the pointer, so an open dnd-kit session
     followed Chad's mouse. Nothing to do with him being present except that a
     mouse had to be there to follow.
   - The "only on Chad's machine" half tracks **leaked `agent-browser`
     instances** (§8), three of which were found running his wrapper page at
     100% CPU each. Killing them measurably restored the page's frame budget at
     idle (4 gaps over 1 s per 15 s → zero); the drag-timing claim first made
     here was confounded and has been retracted. Chad is at the machine precisely
     when agent-driven testing has been happening, so "human present" and
     "leaked browsers running" are confounded in every observation to date.

   Neither is proof. What would settle it: run `MakeScatterplot` on his machine
   with the fixes in place and `ps -A | grep agent-browser` clean. See
   `docs/EXPERIMENT-RENDER-STARVATION.md` §5.

   Candidate mechanisms not yet excluded:
   - a physical pointing device makes the browser hold an active pointer (id 1),
     and a second "primary" synthetic pointer with a different id is rejected or
     confused by dnd-kit's `PointerSensor`
   - hover state on a real element changes what dnd-kit resolves against
   - focus differs: clicking "Show me." focuses the plugin iframe, whereas an
     automated run never moves focus

2. **Is there a material difference between the direct-injection path and the
   full-runner path that has not been isolated?** Direct tests call
   `Injector.dragAttribute()` in `web/src/inject.js`. Real runs go through
   `DemoDriver.dragAttribute()` in `web/src/demo/demo-driver.js`, which adds:
   an `InputShield`, `_waitForIdle()`, `goTo()` character travel, resolver
   lookups, an active three.js render loop, the behaviour engine, and plugin
   checkbox suppression. **This has not been A/B'd and is the most obvious
   untested variable.**

3. **Does the injected `pointerId` matter? — RAISED AND THEN KILLED, both on
   2026-08-27. Do not re-propose it without new evidence.**

   **KILL, measured:** `Element.prototype.setPointerCapture` and
   `hasPointerCapture` were hooked inside the CODAP frame and the exact
   press + 8 px nudge sequence was run. Result: **zero calls to either**, zero
   exceptions, zero window `error` events — and the overlay appeared. CODAP's
   drag path does not touch the pointer-capture API at all, so a fake
   `pointerId` cannot be aborting anything. The reasoning below was sound and
   the premise was false; the API is simply never called.

   (This is also why the paired trusted-vs-injected run in
   `EXPERIMENT-RENDER-STARVATION.md` §2b found no injection penalty: there is no
   capture path for a synthetic pointer to fail.)

   The argument that raised it, kept because it explains why it looked strong:

   Chad's own machine produced `[dot-drag] NEVER STARTED after 12017ms` with
   **no** accompanying `of which Nms was a frozen main thread` line. That line
   prints whenever the activation wait has to extend past a late poll, so its
   absence is positive evidence that the 50 ms polls ran on time for twelve
   seconds: the thread was NOT stalled and dnd-kit still did not activate. Every
   load-based explanation is dead as an account of THIS failure.

   The mechanism that fits: `dispatchEvent` runs listeners synchronously and
   **swallows whatever they throw**, reporting it to the frame's error handler,
   which nothing was listening to. So a `NotFoundError` from
   `setPointerCapture(20260825)` inside CODAP's `pointerdown` handler would
   abort the rest of that handler — no activation, no overlay, no error visible
   anywhere. A real drag gets implicit pointer capture and never hits it, which
   is precisely why Chad's own drags always work and Dot's do not.

   Test it in one line: `__demo.driver.inj.pointerId = 1` before a demo.
   Instrument it with `window.__dotWatch` (`web/src/demo/watch-drag-dom.js`),
   which now captures exceptions thrown inside CODAP's listeners.

   Original text follows.

   **Does the injected `pointerId` matter?** `web/src/inject.js` uses a constant
   synthetic id `20260825`. No pointer with that id exists, so any
   `setPointerCapture(event.pointerId)` inside dnd-kit or CODAP would throw
   `NotFoundError`. `gotpointercapture` / `lostpointercapture` are recorded by
   `__dotRecord` but have not been inspected in a capture. A real drag gets
   implicit pointer capture; ours cannot.

4. **ANSWERED IN PART, 2026-08-27 — but not on the machine that matters.**
   The wrapper's render loop is not the cause (hypothesis 8, killed above). In a
   CDP testbed the whole activation latency arrived as a single long task of
   CODAP's own React work. Chad's correction stands over all of it: that testbed
   browser lagged and his own drags are fast, so the absolute latencies do not
   describe his machine. The open form of the question is now narrow and
   discriminating: **when a drag fails to start on Chad's machine, was the main
   thread frozen or was it running?** `inject.js` now reports exactly that —
   `gave up after Nms, of which Nms was a frozen main thread`. See
   `docs/EXPERIMENT-RENDER-STARVATION.md` §5. Original question below.

   **Is the ~70s latency real, or an artifact of a saturated main thread?**
   `web/src/codap-main.js` runs a three.js loop via
   `stage.renderer.setAnimationLoop()`. A comment there records a prior
   measurement: 26 fps idle, 3.8 fps mid-demo, single frame gaps of 6–12s.
   Whether pausing that loop makes the ghost appear promptly was **not** tested
   — the experiment was prepared and then abandoned.

5. **Secondary, and explicitly NOT the core issue per Chad: why does the drop
   fail to commit even when the ghost appears?** Three of
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

  **A CAUSE FOUND, 2026-08-27 — though how much it costs a DRAG is not
  established; see the retraction in `EXPERIMENT-RENDER-STARVATION.md` §2c.**
  What is solid: the leaked browsers cost the page its frame budget at idle
  (worst gap 3861 ms and 4 gaps over 1 s per 15 s, versus 720 ms and zero once
  killed). What is not: the drag timings measured around them, which were taken
  in separate blocks and are confounded with fresh-graph-vs-settled-graph.

  Three leaked `agent-browser`
  Chrome-for-Testing instances were found running on Chad's machine, each
  pegged above 100% CPU, **all three parked on `codap-same.html`** — ages 2 h,
  8 h and 25 h. Every agent-driven test session had been leaking one, and each
  leaked copy keeps a full three.js render loop and a live CODAP running
  forever in a window nobody can see. Ordinary Chrome throttles `requestAnimation
  Frame` in a hidden tab, but automation browsers are launched with renderer
  backgrounding disabled, so nothing stopped it.

  Fixed in `web/src/codap-main.js`: the animation loop returns immediately when
  `document.hidden`. That does not stop the leak, but it makes a leaked copy
  free instead of expensive. **The leak itself is a testing-hygiene problem —
  check for stray `agent-browser` processes before trusting any timing.**
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

- `docs/EXPERIMENT-RENDER-STARVATION.md` — a proposed answer to §7 Q1/Q2/Q4/Q8:
  main-thread starvation on the full-runner path, with a three-arm A/B/C over
  the candidate loads (three.js render; the shield's re-asserts, which only a
  human's mouse can trigger; CODAP's own work). Also records which of this
  document's measurements describe code that no longer exists
- `docs/PHASE9-SHOWME.md` — the governing work order for this phase
- `docs/SPIKE-SAME-ORIGIN.md` — how injection into CODAP v3 was established,
  including the four distinct input stacks (dnd-kit, React props, d3-drag,
  PixiJS) and which event types each requires
- `docs/verification/phase9/MAKESCATTERPLOT-ISSUE.md` — the wall-clock overrun,
  and the corrected "it is not variance" diagnosis
- `docs/verification/phase9/P4-NOTES.md` — the aim-low drop-zone finding and the
  state-diff revert's blind spots
