# How Dot interacts — the technology stack

Written 2026-08-28. A reference map of the machinery by which the axolotl
character ("Dot") observes and operates a live CODAP v3, for a reader with no
conversation history. Every claim below was read off the source files named in
the same paragraph; where a fact was established by measurement rather than by
reading code, the document that records the measurement is cited.

Repo: `github.com/chaddorsey/codap-spirit-animal`, branch
`fix/stale-iframe-document`, at commit `fed2493`.
Target: CODAP **v3.1.0 (build 2985)**, embedded in an iframe.

This document describes what the pieces ARE. It is not a work order and it
does not govern any plan. For the drag investigation see
`docs/DRAG-GHOST-CONUNDRUM.md`; for the protocols' original derivation see
`docs/SPIKE-SAME-ORIGIN.md`.

---

## 0. The one decision everything rests on: same origin

`web/vite.config.js` proxies `/codap/` to `https://codap3.concord.org/`,
rewriting the path prefix away. CODAP is therefore served from the wrapper's
own origin, which makes `iframe.contentDocument` scriptable. Without this,
none of §2 is possible and Dot could only ever talk to CODAP through the
plugin API in §1.

Two consequences that have each cost real time:

- **`about:blank` is same-origin too.** An iframe holds a live, valid,
  scriptable `contentDocument` *before* it has loaded anything. Caching that
  reference in a constructor yields a document that never throws and never
  works. This was the root cause of the drag-ghost failure; see
  `docs/DRAG-GHOST-CONUNDRUM.md` §0. **Never cache `contentDocument` — read it
  at the point of use.**
- **CODAP shares the wrapper's event loop.** Dot's three.js render loop and
  CODAP's React work are on one main thread. This coupling is real, and it
  made "the render loop starves CODAP" a plausible explanation for months. It
  was nonetheless refuted — see §6.

## 1. Channel one — observing, via the CODAP plugin API

`web/src/codap-bridge.js` uses **iframe-phone** (`^1.4.0`) to speak CODAP's
Data Interactive API exactly as a plugin would, against a CODAP started with
`?embeddedServer=yes`. `CodapBridge extends EventTarget` and re-emits CODAP's
notifications as semantic events:

| Event | Meaning |
|---|---|
| `connected` | CODAP sent `codap-present` |
| `raw` | every notification, untranslated (for the log) |
| `component:create` / `:move` / `:resize` / `:delete` | tile lifecycle |
| `component:attributeChange` | a graph axis attribute was assigned or cleared |
| `selection` | `{ context, count }` |
| `cases:change` | `{ context, operation }` |
| `drag` | `{ phase, attribute, position }` — attribute drags |
| `activity` | any user-driven event, for idle timers |

The bridge also owns **tile geometry**. CODAP reports position and dimensions
in document coordinates; `bridge.calibration` maps those to host-page pixels
as `screen = offset + scale * doc`. The default `{ x: 0, y: 167, scale: 1 }`
was measured against v3.0.3 with the welcome banner visible (the banner is
~44 px of that 167); it is calibratable at runtime and persisted to
`localStorage` under `spirit-animal-calibration`, because CODAP v3 renders its
workspace scaled down at smaller viewports.

This channel is effectively read-only for our purposes. The plugin API cannot
click CODAP's own toolbar, open its menus, or drag its attribute pills — which
is the entire reason channel two exists.

## 2. Channel two — acting, via synthetic DOM events

`web/src/inject.js` constructs `PointerEvent` and `MouseEvent` objects and
dispatches them into the CODAP iframe's document and window. It knows nothing
about CODAP semantics: it takes already-resolved targets (an element, a rect,
or a point in iframe-document coordinates) and produces input. Mapping meaning
to targets is the resolver table's job (§4).

**CODAP v3 is not one input stack but four**, each of which demands a
different event vocabulary. Every protocol below was verified empirically
against a running CODAP and is recorded in `docs/SPIKE-SAME-ORIGIN.md`; none
of it was inferred from the libraries' documentation.

| Stack | Owns | Protocol that works |
|---|---|---|
| **React / Chakra** | toolbar buttons, menus | ONE `MouseEvent('click')`. A full pointerdown/mousedown/pointerup/mouseup/click sequence **double-toggles** a Chakra menu — it opens and instantly closes |
| **dnd-kit** | attribute pill drags | PointerEvents ONLY. Constant `pointerId` for the whole drag, `buttons: 1` on every move, `isPrimary: true`. Needs a few px of travel before it activates. `pointerup` **must** go to the iframe's `window` — dispatching it on `document` leaves the drag stuck |
| **React props** | component title-bar moves | Requires pointer AND mouse events together |
| **d3-drag** | axis rescale handles | **MOUSE events only.** Pointer events do nothing at all |
| **PixiJS** | data points in a plot | canvas-hosted; see `docs/SPIKE-SAME-ORIGIN.md` §4 |

Every event Dot dispatches carries `DEMO_TAG` — the property `__dotDemo ===
true` — so the driver's cancellation listeners can distinguish Dot's input
from a student's real mouse. Synthetic events are also `isTrusted: false`, but
the tag is explicit and survives re-dispatch.

### 2.1 A finding that constrains any future work here

A paired A/B inside a single browser drove the same drag twice: once through
`Injector.dragAttribute`, once entirely through CDP `Input.dispatchMouseEvent`
(real hit-testing, real implicit pointer capture, `isTrusted: true`, a
`pointerId` the browser owns). **The injected drag did no worse — it landed
4/4 against the trusted drag's 3/4.** Recorded in
`docs/EXPERIMENT-RENDER-STARVATION.md` §2b.

This kills the entire family of "dnd-kit treats our synthetic stream
differently" hypotheses, including the constant synthetic `pointerId`
(`20260825`) that no real pointer owns. Synthetic input is not, in this
system, second-class input.

## 3. The character and its rendering

**three.js `^0.185.1`** throughout. There are no other rendering dependencies.

- `web/src/stage.js` — a full-viewport transparent `WebGLRenderer` overlay
  with an **orthographic** camera, so screen pixels map linearly to world
  units (`pixelsPerUnit = 40`). The camera sits on +X looking at the origin,
  which is the character's front: screen-right is world −Z, screen-up is
  world +Y.
- `web/src/character.js` — `Axolotl`, the puppet. Loads `/axolotl.glb` via
  `GLTFLoader` alongside a `/clips.json` clip manifest (both cache-busted,
  because stale cached GLBs after asset rebuilds have repeatedly masqueraded
  as animation bugs). Owns the animation mixer, clip layering, screen-space
  locomotion, and a procedural gaze pass. Its public API is in **screen
  pixels**; the stage does the mapping. There is a channel-layering contract
  with the clip library (`02_build_clips.py`): body clips never key eye bones,
  so gaze and blink always compose cleanly over whatever body clip is running.
  `PAW_TIP` is the calibrated offset of the paw tip from the `hand_L/R` bone
  origin in the bone's local frame.
- `web/src/demo/cursor.js` — `DemoCursor`, the glowing paw-print marking where
  Dot is "touching" the UI. Deliberately NOT an arrow: the student's own
  cursor is an arrow and the two must never be confused. One pad, four toes,
  Dot's pink (`0xff6fa5`) with a halo so it reads over CODAP's white plot
  areas and its blue tile title bars alike.
- `web/src/whisker.js`, `web/src/emotes.js`, `web/src/props.js`, and
  `web/src/terrain.js` — supporting visuals.

The render loop lives at the bottom of `web/src/codap-main.js`, driven by
`stage.renderer.setAnimationLoop()`. It ticks the character, then the demo
driver, then the behaviour engine, then renders. Its `dt` is clamped to 0.25 s
as a backgrounded-tab guard; the comment there records why 0.05 s was wrong
(it acted as a speed limit, running clips at a fifth of real time whenever
frames were sparse).

## 4. Turning intent into targets — the demo layer

- `web/src/demo/demo-lang.js` — the **DemoScript** language, with exactly two
  surfaces. *Line notation* is the authoring surface: one step per line,
  errors reported with a line number, writable by a curriculum author with no
  programming background and cheap for an LLM to emit. *Canonical JSON* is
  what the driver executes, normatively defined by
  `web/src/demo/demo-script.schema.json`. A third surface was proposed and cut
  in review as drift with no consumer. Externally authored scripts are treated
  as **untrusted input**: `validate()` runs against the schema before Dot moves
  at all, and unknown verbs, unknown target kinds, and over-long scripts are
  rejected with typed errors and zero motion.
- `web/src/demo/resolvers.js` — semantic targets. Scripts never name pixels;
  they name UI elements (`toolbar:graph`, `pill:Sleep`, `axisDrop:left`) which
  are resolved to live elements **fresh at execution time**, so a demo written
  last month still lands after the student has moved the tile. Nothing is
  eval'd: `kind:arg[:arg]` is a lookup in a closed table, and every miss throws
  a typed `TargetNotFound` naming the selector it tried. Conditions are
  **deltas** from the demo-start snapshot — `component:graph` means "one more
  graph than when this demo started" — which is what lets demos behave in a
  document that already has graphs in it. Every `data-testid` in the table was
  read off a live CODAP v3.1.0 and is recorded in the P0 verification table.
- `web/src/demo/timeline.js` — **the one clock a demonstration runs on.** The
  cursor never teleports and never travels in a straight machine line; it
  follows a Catmull-Rom spline through the script's waypoints, paced by a
  named profile. The driver samples this **once per frame** and uses that
  single sample for the injected pointer event, the paw-print sprite, and
  Dot's body alike. That is why the paw cannot drift away from what the UI is
  doing.
- `web/src/demo/demo-driver.js` — orchestration. Owns `_waitForIdle()`,
  `goTo()` character travel, the `InputShield`, phase tracking, script
  execution and revert.
- `web/src/demo/showme-bridge.js` — the wrapper half of the "Show me."
  handoff. The plugin iframe is nested **two deep** (wrapper → CODAP →
  plugin), so its `window.parent` is CODAP and it must post to `window.top`.
  The wrapper listens on `window`, ignores everything whose `type` does not
  begin `dot-` (the same channel carries iframe-phone traffic), and pins
  `event.source` per plugin so replies return to the frame that asked.

Because `demo-driver.tick()` runs inside the render loop *after*
`axo.update()`, the driver reads the paw's world position from a skeleton that
is current for this frame and injects at that point. The events genuinely
follow the animated paw.

## 5. Deciding what to do unprompted — the behaviour engine

`web/src/behavior-engine.js` consumes `CodapBridge` semantic events plus a
clock tick. It owns the student model — known components with bounds and
timestamps, selection, drag state, idle time — and arbitrates behaviours that
are defined as data in `web/src/behaviors.js`. Its rules, each covered by
`selfTest()`: one intervention at a time, higher priority wins ties, a
behaviour on cooldown never fires, escalation variants fire only after
`escalation.after` subtle firings went un-acted-on (a behaviour's
`satisfied()` resets the counter), and any fresh student action cancels an
in-flight intervention within ~1 s and returns the character to idle.

## 6. Forensic instrumentation left in place

All of the following are off by default and cost nothing when unused. They
exist because this system's failures have consistently been invisible from the
outside, and because several confident diagnoses in this project turned out to
be sampling error.

| Global | File | What it captures |
|---|---|---|
| `window.__dotRecord` | `web/src/demo/record-drag.js` | every input event in the CODAP frame, real vs. synthetic, with `summary()` / `diff()` / `head()` / `injLog()` |
| `window.__dotTrace` | `web/src/demo/trace-input.js` | an earlier event tracer; counts blocked trusted events and leaks by node |
| `window.__dotWatch` | `web/src/demo/watch-drag-dom.js` | a DOM witness for the drag window |
| `window.__dotPerf` | `web/src/codap-main.js` | frame gaps over 250 ms, plus a `liteDuringDrag` arm that skips render and character update during a drag |
| `window.__demo` | `web/src/codap-main.js` | the live driver, injector and bridge, for console-driven runs |

**`__dotWatch` is the one that ended the drag investigation**, and how it did
so is worth preserving as method. `NEVER STARTED after 12017ms` printed on
Chad's machine *without* the accompanying "of which Nms was a frozen main
thread" line — and that line prints whenever `_awaitPreviewEl` extends its
deadline. Its absence was positive evidence that the polls arrived on time and
the main thread was running. Every main-thread-starvation explanation died
there, which redirected the search to the document reference itself.

## 7. Related documents

- `docs/SPIKE-SAME-ORIGIN.md` — how injection into CODAP v3 was established,
  and the derivation of the four input protocols in §2
- `docs/DRAG-GHOST-CONUNDRUM.md` — the drag failure, and in §0 its actual cause
- `docs/EXPERIMENT-RENDER-STARVATION.md` — the refuted starvation hypotheses,
  the trusted-vs-injected paired run (§2.1 above), and real costs found on the
  way that were not the bug
- `docs/PHASE9-SHOWME.md` — the governing work order for the demo phase
- `docs/verification/phase9/P4-NOTES.md` — dnd-kit computes collisions from the
  dragged item's rect, not the pointer position, which is why drop points are
  aimed low on their target
