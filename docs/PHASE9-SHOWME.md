# PHASE 9 WORK ORDER — Dot as "Show me": live tutorial demonstrations

Written 2026-08-25 by Fable, revised same day after a four-perspective
adversarial document review (adversarial / feasibility / scope /
coherence agents; 36 findings integrated — the review reports live in
the session transcript, every accepted finding is folded in below).
For execution **solely by Opus** with no conversation context. Where
this doc and reality disagree, verify live and update this doc — do
not guess. Chad is the product owner; bail-out items go to him with
evidence, not decisions.

## Read before starting

1. `docs/SPIKE-SAME-ORIGIN.md` — the verified injection mechanics this
   phase stands on (same-origin proxy, exact event protocols, gotchas).
   Verified live on CODAP v3.1.0.
2. `docs/PLAN.md` + `README.md` — project architecture and environment
   gotchas (NODE_OPTIONS, detached vite, stale-vite port trap).
3. `docs/MOTION.md` + `docs/CHARACTER.md` — Dot's motion personality;
   demonstrations must feel like HER, not a robot cursor.
4. `docs/BAT-A-POINT.md` — verification methods used in this project
   (screenshot pixel measurement, get-verify-retry on the flaky phone,
   spawn-keyed screenshot bursts).
5. `web/src/character.js`, `web/src/behavior-engine.js`,
   `web/src/behaviors.js`, `web/src/codap-bridge.js` — the actor API,
   engine arbitration, cancellation, and bridge quirks. Facts used
   below: `update()` calls `faceToward()` every motion frame and the
   arrival ritual resets `targetFacing` to 0 and `setBase('idle')`;
   `play(name,{hold:true})` fades out the base loop; there is no
   additive layering; the engine cancels the active behavior on any
   bridge `activity` event after a 0.35s grace unless the behavior has
   `ignoreActivity: true`; `startle` (priority 65, `preempts: true`)
   fires on ≥2 component deletes in 4s.

## Mission

The CODAP getting-started tutorials
(https://codap.concord.org/get-started/tutorials/) are CODAP documents
embedding onboarding plugins. Each plugin shows a task checklist; every
task has a **"Show me."** link that today plays a canned MP4. Replace
that with **Dot performing the real action live in the student's actual
document** — swimming to the real button, tapping it with her paw,
dragging the real attribute pill — then reverting her changes so the
student does it themselves. Plus two Easter eggs on the same machinery:
bat-a-point v2 (bat the REAL point) and swim-through-points.

## Ground truth: the tutorials and their tasks

Two plugin families (verified 2026-08-25 by fetching every task file):

**Family A — `onboarding`** (served from
`codap.concord.org/codap-resources/plugins/onboarding/`; source:
github.com/concord-consortium/codap-data-interactives, dir
`onboarding`). Task model: `taskDescriptions.descriptions[]` entries
`{ key, label, url: <mp4>, operation?, type?, feedback }` in
`task_descriptions.js` (tutorial 1) / `task_descriptions_2.js`
(tutorial 2); `onboarding.js` renders the checklist, plays the movie
on "Show me.", and checks tasks off by listening to CODAP
notifications (e.g. `dataContextCountChanged`, `move` on
`DG.GraphView`).

- Tutorial 1 (`#file=examples:Getting started with CODAP`):
  `Drag` (CSV file into CODAP), `MakeGraph`, `MoveComponent`,
  `AssignAttribute` (pill→x axis), `SecondAttribute` (pill→y axis).
- Tutorial 2 (`…CODAP 2`): `MakeScatterplot`, `SelectCases`,
  `HideUnselected`, `Deselect`, `Rescale`, `MakeLegend`.

**Family B — `onboarding-new-1 … -5`** (served from
`concord-consortium.github.io/codap-data-interactives/onboarding-new-N/target/`;
same repo, dirs `onboarding-new-*`). Same task model, two description
files each (`task_descriptions.js` + a shared `task_descriptions_2.js`
scatterplot set). Tutorial documents:
`concord-consortium.github.io/codap-data/onboarding-documents/get_started_N.codap`
(N=3..7), which reference the plugin URL inside the document JSON.

- Tutorial 3 (new-1, maps): `MakeMap`, `AddLifeExpectancy` (drag attr
  onto map), `MoveMap`, `MinimizeMap`, `RestoreMap`, `SelectCountries`
  (click dark regions), `ChangeMapLegend`, + scatterplot set.
- Tutorial 4 (new-2): `MakeGraph`, `AddDoctors`, `AddInternetUsers`,
  `ChangeScale`, `MakeLegend`, `ChangeGraphTitle` (TYPE text),
  `DrawTool`, + scatterplot set.
- Tutorial 5 (new-3): `HideForested` (table column menu → hide),
  `UnhideAttribute`, `MakeGraph`, `AddDoctors`, `AddRegionVertical`,
  `ToggleMean`, `ToggleMedian` (inspector measure palette),
  `RemoveRegion` (axis menu → remove), + scatterplot set.
- Tutorial 6 (new-4): `ToggleToCaseCard`, `AddAverageGNPHoriz`,
  `AddAvgLifeExpectVertical`, `CreateMap`, `SelectTopCountries`,
  `HideUnselectedPoints`, + scatterplot set.
- Tutorial 7 (new-5): `MakeGraph`, `AddHeight`, `MakeLegend`,
  `SelectAnyPoint`, `ToggleMean`, `AddRemoveGenderVertical`,
  `BinPoints`, `MakeHistogram`, `MinimizeTable`, `ExpandTable`,
  `ReturnDotPlot`, `GroupByClass` (drag attr left in table =
  hierarchy).

Shared scatterplot set (`task_descriptions_2.js`, both families):
`MakeScatterplot`, `SelectCases`, `HideUnselected`, `Deselect`,
`Rescale`, `MakeLegend`.

**Premise CONFIRMED by Chad (2026-08-25): completion detection works
in the v3 tutorials.** The plugins' v2-vocabulary notifications are
served correctly by v3 on the official pages. P0 keeps a quick sanity
check that the same holds inside OUR same-origin wrapper (different
embedding, same CODAP) — expected to pass; if it somehow doesn't,
that's an environment bug to fix, not a premise failure.

### The interaction primitives all ~40 tasks reduce to

| # | Primitive | Used by (examples) | Injection status |
|---|-----------|--------------------|------------------|
| P1 | Click a UI element (toolbar, menu item, inspector button, checkbox, minimize) | MakeGraph, ToggleMean, Minimize* | **VERIFIED** (spike) |
| P2 | Open toolbar/axis/column menus + choose item | MakeGraph, HideForested, RemoveRegion | **VERIFIED** (toolbar); axis/column menus same pattern — verify in P0 |
| P3 | Drag attribute pill → axis / legend / map / table position | Assign*, Add*, MakeLegend, GroupByClass | **VERIFIED** (pill→x axis end-to-end) |
| P4 | Drag component by title bar | MoveComponent, MoveMap | same dnd protocol — verify in P0 |
| P5a | Click a plotted point (select) | SelectAnyPoint | **VERIFIED** (canvas pointer → selection) |
| P5b | Click a map region (select) | SelectCountries | **UNVERIFIED** — maps are Leaflet, a different event stack; verify at P5 start, MP4 fallback if synthetic pointers rejected |
| P6 | Marquee-select on canvas | SelectCases, SelectTopCountries | verify in P0 |
| P7 | Type text | ChangeGraphTitle | KeyboardEvent + input events; verify in P0 |
| P8 | CSV import demonstration | Drag (tutorial 1) | **Fallback-first by design** (scope review): Dot carries a CSV ghost sprite to the drop point and the bridge API commits the import at touch-down. Synthetic `DataTransfer` file-drop is attempted ONLY if Chad rejects a recording of the fallback (bail-out). |
| P9 | Axis rescale drag / ChangeScale | ChangeScale | verify in P0 |
| P10 | Point drag (displace, native recover) | Easter eggs | **VERIFIED** on dot plots (temporary displace + snap home, data untouched). Scatterplots: Chad has ruled temporary table-value changes acceptable IF they snap back — P0 verifies values are byte-identical after recovery. |
| P11 | Draw tool | DrawTool | probe at P5; MP4 fallback if flaky |

## Architecture

```
wrapper page (our origin)
├── stage/character (Dot, three.js overlay)            [exists]
├── behavior engine                                    [exists]
├── CODAP v3 iframe — SAME ORIGIN (dev: vite proxy; prod: self-host)
│   └── tutorial plugin iframe — SAME ORIGIN (our fork)
├── inject.js       — input-injection library (P0)
├── demo/
│   ├── demo-lang.js   — line-notation parser + JSON schema + resolvers (P2)
│   ├── demo-driver.js — interpreter, cursor timeline, paw sync,
│   │                    cancel + state-diff revert (P1–P2)
│   └── scripts/       — line-notation scripts, one file per tutorial (P2+)
└── showme-bridge.js — postMessage protocol wrapper⇄plugin fork (P3)
```

Key decisions (made; do not relitigate):

- **Same-origin via the vite proxy for dev; self-hosted pinned static
  bundle for production** (see Deployment below).
- **Fork the tutorial plugins** rather than DOM-intercepting "Show me"
  clicks: explicit protocol + completion-suppression. Interception
  without forking was rejected (implicit, fragile, can't stop
  self-checking during demos).
- **Demo-then-revert.** Dot performs the real action, pauses so the
  student sees the result, then reverts. The task stays UNCHECKED; the
  student does it themselves. Revert is **state-diff-driven, never
  count-driven** (see Driver contract — this was the single most
  flagged risk in review: interleaved student actions make blind Undo
  clicks destroy student work).
- **Two DSL surfaces, not three** (scope review): line notation
  (humans AND LLMs) + canonical JSON (execution format). The JS
  builder-verb layer from the first draft is CUT — scripts are
  authored in line notation. Rejected: builder verbs (third
  representation = drift risk, no consumer).
- **Semantic targets, never pixels.** Scripts name UI elements; the
  driver resolves them to rects at execution time, fresh per step.
- **Injection events and Dot's paw are driven by one cursor timeline.**
- Rejected: video-replacement only (adds nothing); pantomime+API-commit
  as primary (kept as the P8 CSV mechanism and general fallback);
  CDP/trusted-event automation (unavailable in student browsers).

## The DemoScript language

**Design requirement (Chad): dually human-scriptable and
LLM-driveable.** (a) A curriculum author with no programming background
writes a demo by hand; (b) an LLM drives Dot — one-shot scripts from
Phase 2, live closed-loop sessions in Phase 8.

Two surfaces over ONE execution format:

- **Line notation** — the authoring surface for humans and the
  token-cheap surface for LLMs. One step per line, parsed (~100-line
  parser, line-numbered errors) 1:1 into canonical JSON:

  ```
  demo MakeGraph
    say !
    goto toolbar:graph below
    peer toolbar:graph
    tap toolbar:graph
    wait component:graph 5s
    beat 1.2
    revert
    say ?
  ```

  Drags read naturally: `drag pill:Sleep -> axisDrop:bottom teaching`.

- **Canonical JSON** — what the driver executes; what an LLM may also
  emit directly; validated against
  `web/src/demo/demo-script.schema.json` BEFORE any motion:

  ```json
  { "demo": "MakeGraph", "steps": [
    { "do": "say",  "emote": "!" },
    { "do": "goTo", "target": "toolbar:graph", "beside": "below" },
    { "do": "tap",  "target": "toolbar:graph" },
    { "do": "waitFor", "cond": "component:graph", "timeoutSec": 5 },
    { "do": "beat", "sec": 1.2 },
    { "do": "revert" },
    { "do": "say",  "emote": "?" }
  ] }
  ```

  Note: NO per-script undo counts. Revert authority is the driver's
  state diff (below). Scripts may carry `"inverseSteps": [...]` for
  effects the undo stack doesn't cover (selections, minimize) —
  populated from the P0 verification table.

Targets and conditions are a `kind:arg[:arg]` micro-grammar resolved
(never eval'd) by the resolver table: `toolbar:graph`,
`menu:tables:0`, `pill:Sleep`, `axisDrop:bottom`, `axisDrop:left`,
`legendDrop`, `titleBar:graph:1`, `inspector:graph:rescale`,
`point:outlier:Mass`, `tableColumn:Sleep`, `mapRegion:name`, `undo`;
conditions: `component:graph`, `graphX:Sleep`, `selection>=3` — and
conditions are evaluated as **deltas from demo-start state** (e.g.
`component:graph` means "one MORE graph than at demo start"), so demos
behave in dirty documents where a graph already exists.

**Safety contract for externally-authored scripts** (LLM output is
untrusted input): schema validation rejects unknown verbs/targets
before execution; verbs are a closed whitelist (a script can only do
what a student's mouse could); hard caps — ≤40 steps, ≤10 document
mutations (enforced by live state diff, not notification counting),
≤60s wall clock; `revert` is appended automatically unless the script
declares `"leaveChanges": true` AND the embedding caller passes an
explicit allow flag (this flag exists only in JSON, deliberately — the
line surface cannot express it).

### Verbs (complete set for Phases 0–5)

| Verb | Semantics |
|------|-----------|
| `say <emote>` | Dot emotes (`!`, `?`, `?!`) |
| `goto <target> [side]` | Dot swims beside the target (MOTION.md profile; side picks the clear flank) |
| `peer <target>` | gaze + head tilt |
| `tap <target>` | paw tap synced with injected click. Menu-aware: single `click` event only (spike gotcha) |
| `openmenu <target>` / `choose <target>` | menu open, item pick — separate so Dot can beat between them |
| `drag <src> -> <dst> [profile]` | injected pointer drag along a curved path while Dot carries it; `teaching` ≈ 900ms + ease |
| `marquee <rectTarget>` | drag on empty plot canvas corner-to-corner |
| `type <target> <text>` | focus via tap, per-keystroke KeyboardEvent+input at ~6 chars/sec |
| `carrycsv <dst>` | the P8 mechanism: CSV ghost sprite carried to the drop point; bridge API commits the import at touch-down |
| `wait <cond> <sec>s` | poll a delta-condition via the bridge (get-verify-retry — replies drop) |
| `beat <sec>` | teaching pause |
| `revert` | state-diff revert of every mutation this demo made (see Driver contract) |
| `pose <clip>` | character beat |

### Target resolvers

Resolvers return `{ rect, el, doc }` at execution time by querying the
same-origin CODAP DOM (and API where needed):

- `toolbar:*` — tool shelf buttons; menus via their `data-testid`
  menu lists (e.g. `tool-shelf-table-menu-list`); menu open-state =
  popper wrapper `visibility` (spike).
- NEVER match menu items by text: labels contain lookalike Unicode
  ("Νew" begins with Greek capital Nu — verified). data-testid or
  index only.
- `pill:X` — `[data-testid="codap-attribute-button X"]`.
- `axisDrop:bottom` — `[data-testid=add-attribute-drop-bottom]`;
  `axisDrop:left` — `[data-testid=add-attribute-drop-left]`;
  `legendDrop` — `.droppable-plot`. Map drop zones: discovered in P5,
  recorded here.
- `point:*` — canvas points have no DOM; compute from axis DOM rects
  (same-origin — exact) + axis bounds from the API.
- Every resolver throws typed `TargetNotFound` with the selector
  tried; the driver converts that into a graceful abort (Dot emotes
  `?`, revert runs, `dot-demo-error` posted). A demo must never
  half-die silently.

## Driver contract (`demo-driver.js`)

**Actor integration — the architectural decision (feasibility review;
do not re-derive):** the demo driver does NOT use `moveTo()` for
cursor-following. `character.js` `update()` re-calls `faceToward()`
every motion frame and its arrival ritual resets `targetFacing` and
base — it would fight the choreography. Instead:

- The driver owns the **cursor timeline** (Catmull-Rom path through
  waypoints + pacing profile) and each frame sets Dot's position
  directly via `setPosition()` (offset path, below) and the cursor
  sprite's position from the same sample. One clock, zero drift.
- Add to `character.js` (small, additive): a `facingOverride` flag
  that suppresses `faceToward()` and the arrival facing-reset while
  set. The driver sets it for the demo's duration.
- The held paw uses the existing hold mechanism
  (`play('point_L'|{...hold:true})` / `gestureAt` pattern — note there
  is NO `P.aim` runtime API; that is a Blender pipeline DSL). Accepted
  tradeoff: holding a one-shot fades out the swim base, so during
  carries Dot glides in the pointing pose rather than paddling — this
  reads as "concentrating on carrying" and is acceptable; do NOT build
  additive layering for this phase.
- `goto` steps MAY use normal `moveTo()` (no facing/carry needed en
  route); the per-frame drive engages only from the first `tap`/`drag`
  of a sequence.

**Engine integration:** the demo runs as a behavior
(`id: 'dot-demo'`, priority 90) with **`ignoreActivity: true`** —
otherwise the engine's `_studentActed` cancellation kills the demo
0.35s after its own injected action echoes back as bridge activity
(feasibility finding; the pattern exists in `tile-mischief`). Gate
`startle`'s trigger on `state.active?.id !== 'dot-demo'` so an
undo-driven component-delete burst can't preempt mid-revert.

**Cancellation** (three channels, all wired to
`engine.cancelActive()` + the driver's abort):
1. Trusted `pointerdown`/`keydown` in the CODAP iframe document, the
   plugin iframe document, AND the wrapper page (capture phase),
   ignoring events tagged `__dotDemo` (a property set on our injected
   events before dispatch).
2. Trusted `pointermove` DURING an active injected drag/marquee — a
   student wiggling their real mouse mid-drag interleaves trusted
   moves into dnd-kit's stream and can corrupt the drop (adversarial
   finding). P0 tests whether interleaved trusted moves are actually
   harmful; if harmless, this channel may be relaxed to
   pointerdown-only — record the P0 result here either way.
3. `waitFor` timeout or `TargetNotFound`.
On cancel: stop timeline, Dot startle-retreats, **state-diff revert**
runs, `dot-demo-error`/`dot-demo-end` posted as appropriate.

**Revert authority — state diff, not counts** (unanimous review
finding), **delivered as visible Undo taps** (Chad, 2026-08-25: "she
should undo it afterward … by clicking undo"). The revert is part of
the demonstration: Dot swims to the toolbar Undo button and TAPS it —
paw tap, injected click, the student watches the change unwind. The
state diff governs how many taps and when to stop. At demo start the
driver snapshots document state via the API with get-verify-retry:
componentList (ids, types, positions, dimensions) + per-graph
x/y/legend attrs + selection. Revert loop:

```
Dot goto toolbar Undo button (once)
while (diff(currentState, snapshot) is nonempty && clicks < cap):
    Dot taps Undo (paw + injected click); re-fetch state (get-verify-retry)
    if diff did not shrink: break        # undo is reverting something
                                         # that is NOT ours — STOP
apply inverseSteps for non-undoable residue (selections, minimize)
if diff still nonempty: targeted inverse API ops for known ids
  (e.g. delete the component the demo created — id captured at create)
report residue verbatim in console + dot-demo-error if any remains
```

(On cancellation-abort, the same loop runs but Dot's motion may be
skipped for speed — inject the Undo clicks directly; the embodied
version is for the normal end-of-demo beat.)

The "diff did not shrink → stop" rule is what protects student work
when their own action landed on top of the undo stack mid-demo.
Notification counting may be used as a fast-path hint only — gotcha:
notifications drop randomly (see Known gotchas #5).

**Redo residue:** after a revert, Dot's actions sit on the REDO stack;
a student pressing Redo replays them (and may self-check a task). P0
records this behavior verbatim. Policy: accept and record — unless P0
shows the forked plugin can distinguish redo-driven notifications, in
which case suppress those too. Do not silently ignore this.

## Paw-to-cursor sync

- A **demo cursor sprite** (small glowing paw-print on the three.js
  overlay) travels the cursor timeline — Dot's "touch", distinct from
  the student's cursor.
- Dot's body follows an offset path: trailing the cursor ~40–55px at
  -30° to -60°, side chosen so she never covers the target;
  `facingOverride` holds her 3/4 turn (`dir * 0.38π`, the tapAt
  pattern); near-side arm held (see actor integration above) so the
  paw visually touches the sprite.
- At `tap` instants: `tap_L/R` clip with the injected click at the
  clip's contact frame. Timing constant: measure once in P1 with the
  frozen-frame method from `docs/BAT-A-POINT.md` (delay the effect,
  screenshot the swipe over a stationary target) — do not assume
  bat's 0.19s transfers to the tap clips.
- During `drag`: pointerdown at source, the timeline moves BOTH
  injected pointermoves and Dot; CODAP renders its own native drag
  preview (verified), so the student sees Dot's paw + paw-print +
  real UI feedback moving together; pointerup at destination
  (dispatched on the iframe `window` — spike gotcha), tiny push-off
  flourish.
- **P1 metric is instrumented, not eyeballed** (two reviewers): each
  timeline tick, log `(pawScreenXY, cursorXY)` — paw position from the
  held-arm end bone via `bone.getWorldPosition()` → stage
  world→screen projection (same pattern as the gaze pass in
  `character.js`). Acceptance = max logged distance over a full demo.

## Show me integration (`showme-bridge.js` + plugin forks)

**Topology (corrected in review — this is load-bearing):** the plugin
iframe is nested two deep: wrapper → CODAP iframe → plugin iframe. The
plugin's `window.parent` is CODAP, NOT the wrapper. Protocol:

- Plugin posts to **`window.top`**. The wrapper listens on `window`,
  filters `event.data.type` beginning `dot-`, and pins
  `event.source` per plugin for replies. (Same-origin means origin
  checks alone are vacuous — the type prefix + source pinning is the
  discipline. Never reply to non-`dot-` messages: the same channel
  carries iframe-phone traffic.)
- Handshake: plugin posts `dot-hello` on load, retrying every 1s ×5;
  wrapper replies `dot-hello-ack` to `event.source`. Handshake
  success — NOT nesting depth — is the "Dot is present" signal. No
  ack after 5 tries → plugin stays in stock MP4 mode permanently.
  (The checklist renders lazily — see gotcha 10 — the retry loop
  absorbs that.)

Message set (all `dot-` prefixed — coherence review normalized this):

```
plugin → wrapper: { type:'dot-show-me', tutorial, key }
wrapper → plugin: { type:'dot-demo-start', key }   // suppress detection
wrapper → plugin: { type:'dot-demo-end',   key, ok }
wrapper → plugin: { type:'dot-demo-error', key }   // plugin plays its MP4
wrapper → plugin: { type:'dot-demo-busy',  key }   // demo already running:
                                                   // plugin re-enables the
                                                   // link (NOT a dead click)
```

- `dot-demo-end` is posted only after a 1.5s quiescence delay AND a
  state-verified stable document (adversarial finding: undo's own
  notifications arrive async and can spuriously check tasks after
  suppression lifts). The fork re-verifies its checklist state on
  `dot-demo-end`.
- Fork changes (in `web/public/tutorial-plugins/`, one dir per plugin,
  built from upstream github.com/concord-consortium/codap-data-interactives):
  (1) Show me → `dot-show-me` when handshaken, else stock MP4;
  (2) notification listener gated by `demoInProgress` flipped by
  `dot-demo-start`/`-end`; (3) `dot-demo-error` → play the MP4.
- Tutorial documents: copy the 7 `.codap` files into
  `web/public/tutorial-docs/`, rewriting each embedded plugin URL to
  our fork. **Document loading**: P0 verifies the mechanism for
  loading an arbitrary same-origin document URL into v3 (candidate:
  `#file=url:...`; the `examples:` scheme resolves only against
  CODAP's built-in registry and CANNOT load our copies — the first
  draft's fallback was fictional, review caught it). Record the
  working recipe here.

The MP4 fallback is the rollout safety net: any demo failure degrades
to today's behavior, never worse. It must therefore actually work in
production — see Deployment (MP4 vendoring).

## Easter eggs

- **bat-a-point v2**: in `bat-a-point`'s run, feature-detect
  same-origin (`iframe.contentDocument` reachable); if available,
  replace spawn-double/spring with: existing stance + strike timing →
  injected point drag (pointerdown on the real point, 3–4 fast moves
  along the bat arc away from the herd, pointerup) → the REAL point
  recovers natively. Clear the selection side-effect afterward
  (`selectCases: []` — decided; noted alternative "keep it as her
  fingerprint" was considered and dropped for visual cleanliness).
  Keep the PointDouble path as the cross-origin fallback — do not
  delete it.
- **swim-the-shallows** (new behavior, mischief-gated, cooldown
  ≥300s): Dot swims a lazy S through a populated graph's plot rect;
  points within ~25px of her nose get an injected micro-drag pushing
  them radially off her path; the shoal parts and re-lands behind
  her. Caps: ≤3 points in flight, ≤20 per pass. Selection cleanup
  (`selectCases: []`) after the pass — 20 selection flashes strobing
  the case table is not acceptable ambience (review finding).
  Scatterplots ARE eligible: Chad has ruled the temporary table-value
  flicker during a drag acceptable because values snap back — P0
  verifies byte-identical restoration; if P0 finds any residue,
  scatterplots drop out and that is recorded here.
- **Displacement gain is unknown** (both eggs): the spike measured
  ~12px rendered for a 60px injected drag on a dot plot — possibly
  damped, possibly mid-animation sampling. P0 characterizes the
  transfer function (injected px → rendered px); P6 sizes bat arcs
  and parting distances from the measured gain, with a visibility
  floor: peak rendered displacement ≥ 2× point radius, screenshot-
  measured — "recovering" must not pass on an invisible effect.

## Deployment (Chad's questions, answered 2026-08-25)

The experience is **entirely static files**: wrapper bundle
(`vite build`), a pinned CODAP v3 static build, forked plugins,
rewritten documents, vendored MP4s, the .glb. Same-origin just means
one host serves all of it.

- **Dev**: vite proxy (current setup, `web/vite.config.js`).
- **Public**: any static host. Default: GitHub Pages from this repo
  (`chaddorsey.github.io/codap-spirit-animal/`). Netlify/Cloudflare
  Pages equivalent.
- **The Concord option** (flagged for Chad, not decided here): hosting
  the wrapper on codap.concord.org itself would give same-origin
  against PRODUCTION CODAP — no mirroring or version pinning at all.
  Tradeoff: CODAP releases can rename testids under us (mitigated by
  `SELECTORS.md` + MP4 fallback). This is an org conversation;
  the pinned self-host is what P7 builds and remains the
  fully-in-our-control default.
- **LLM drive-mode is the only non-static piece** (needs an API key):
  excluded from the public build by default; enabling it publicly
  requires a key-holding proxy (e.g. a Cloudflare Worker) or
  user-supplied keys — decision deferred until an LLM consumer
  exists (Phase 8).

## Phases — each lands standalone value; stop anywhere and we're ahead

Environment: per PLAN.md gotchas; agent-browser automation;
verification per BAT-A-POINT.md methods. Commit per phase; push to
master. **Definition of "runs green" used throughout** (coherence
review): the demo completes with no thrown error, every `wait`
condition met within its timeout, the intended document change
observed via API get-verify-retry, and after `revert` the state diff
vs the demo-start snapshot is empty.

### Phase 0 — injection library + ALL empirical unknowns

Build `web/src/inject.js`: `click`, `menuOpen/menuChoose`,
`dragPointer(fromRect, toRect, {steps, path})`, `marquee`, `typeText`,
`pointDrag`, taking resolved targets, implementing the spike protocols
EXACTLY (single-click menus; pointerup on iframe window; constant
pointerId; `buttons:1` on moves; `__dotDemo` tagging). Add
`web/inject-test.html` + `window.__injectTest()`: on a same-origin
CODAP with the Mammals fixture (the 12-item dataset from
`docs/BAT-A-POINT.md`), exercise every primitive and assert effects
via the bridge API.

Empirical unknowns — results recorded IN THE TABLE BELOW (edit this
file; that is part of the phase):

1. **Plugin-in-wrapper sanity check (FIRST)**: load the tutorial-1
   plugin in the same-origin wrapper, manually make a graph, confirm
   the checklist checks off. (Chad confirmed detection works in the
   official v3 tutorials; this only checks OUR embedding matches.)
2. Document loading: find the URL/API mechanism that loads an
   arbitrary same-origin `.codap` URL in v3; load one rewritten
   family-A doc AND one family-B doc; screenshot for conversion
   damage.
3. P4 title-bar drag, P6 marquee, P7 typing, P9 axis rescale, axis-
   and table-column menus (P2 variants): verify, record recipes.
4. Undo mechanics per primitive: how many Undo clicks revert it; which
   effects are NOT on the undo stack (record inverse actions); redo-
   stack residue behavior after revert (verbatim).
5. Trusted-mouse interference: run an injected drag while wiggling the
   real mouse over the iframe; record whether the drop corrupts.
6. Point-drag displacement transfer function on a dot plot (injected
   px → rendered px, 3 sample distances); scatterplot drag: itemSearch
   before/during/after — is "after" byte-identical to "before"?
7. Selection side-effect: does `selectCases: []` clear point-drag
   selections?

**Done when**: `__injectTest()` passes for P1–P7+P9, unknown #1 passed,
and the table below is filled.

> ### P0 VERIFICATION TABLE
>
> Filled 2026-08-25 against **CODAP v3.1.0 (build 2985)** served through the
> vite same-origin proxy, driven by `web/inject-test.html` →
> `window.__injectTest()` (primitives, 12/12 PASS) and `window.__U.*`
> (measurements). Fixture: the 12-row Mammals dataset created through the API
> by `web/src/inject-test.js` (numeric Mass with one far outlier, African
> Elephant 6654 — the shape `docs/BAT-A-POINT.md` calibrated against).
> Evidence: `docs/verification/phase9/`.
>
> **The one thing to carry forward:** synthetic input is not one mechanism.
> CODAP v3 drives four different stacks and each listens somewhere else. A
> recipe that works for the attribute pill does nothing to the axis. The
> named wrappers in `web/src/inject.js` (`dragAttribute`, `dragTile`,
> `dragAxis`, `marquee`, `pointDrag`) each pin one measured combination.
>
> | Item | Result | Recipe / notes | Revert (undo clicks or inverse) |
> |------|--------|----------------|----------------------------------|
> | **P0.1** plugin-in-wrapper sanity | **PASS** | Loaded `get_started.codap` in our same-origin wrapper; injected one tool-shelf Graph click; the plugin checked "Make a graph" and showed its success feedback ("Very nice graph! There are no points in it…"). v2-vocabulary completion detection works inside OUR embedding. Screenshot `p0-1-tutorial1-after-graph.png` | n/a |
> | **P0.2** document loading | **PASS** | `#file=<ABSOLUTE url>` on the CODAP iframe: `/codap/?embeddedServer=yes#file=http://localhost:5199/tutorial-docs/get_started.codap`. The `examples:` scheme cannot reach our copies (review was right). Harness support: `inject-test.html?doc=/tutorial-docs/<file>`. All 7 docs vendored to `web/public/tutorial-docs/` — family A (`get_started`, `get_started_2`) from `codap-resources.concord.org/example-documents/documents/`, family B (`get_started_3..7`) from `concord-consortium.github.io/codap-data/onboarding-documents/`. Family A tutorial 1 is ONE `DG.GameView` whose `currentGameUrl` is `../../../../extn/plugins/onboarding/` (v3 rewrites it to codap-resources) — that string is the single edit the P3 fork needs. **No conversion damage seen** on family A (t1) or family B (t3): plugin renders, checklist renders, UN dataset table shows 195 cases (`p0-2-familyB-tutorial3.png`) | n/a |
> | **P1** click a UI element | **PASS** | ONE `MouseEvent('click')` on `[data-testid=tool-shelf-button-graph]`. Deterministic 3/3 (0→1 graph). See the click-shape row below | **1 undo click**; redo restores |
> | **P2a** toolbar menu + choose | **PASS** | One click on the shelf button opens; the list is EMPTY when closed and populated when open; items carry testids (`tool-shelf-table-new`, `-new-clipboard`, `tool-shelf-table-<dataset>`). **Escape does NOT close it** (injection never gives the menu keyboard focus) — a second click on the trigger does | per action chosen |
> | **P2b** axis attribute menu | **PASS** | SINGLE click on `[data-testid=axis-legend-attribute-button-left/-bottom]` opens `[data-testid=axis-legend-attribute-menu-list-left/-bottom]`. 8 items, **no data-testids — index only**; on a Mass×Sleep graph "Remove Y: Sleep" was index 6. Lookalike Unicode confirmed again (Tables ▸ "Νew" starts U+039D) | 1 undo click |
> | **P2c** case-table column menu | **PASS** | Needs the **FULL pointer sequence** on the pill button — a lone `click` leaves `aria-expanded="false"`. 11 items, index only: Rename, Fit Width To Content, Edit Attribute Properties, Edit Formula, Delete Formula, Recover Deleted Formula, Rerandomize, Sort Asc, Sort Desc, **Hide Attribute (9)**, Delete Attribute (10) | per action chosen |
> | **P3** attribute pill → axis | **PASS** | `inj.dragAttribute`. **dnd-kit.** `pointerdown` on the `[aria-roledescription="draggable"]` WRAPPER (`div[data-testid=codap-column-header-content]`), NOT the pill button (the Chakra menu button swallows it); 16 `pointermove` on `document`; **`pointerup` on `document`**. Drop zones `[data-testid=add-attribute-drop-bottom / -left]` gain `active` then `over`. Mouse events are optional (4/4 with and without) | 1 undo click each for x and y; redo restores |
> | **P3-correction** | **CORRECTS the spike** | `docs/SPIKE-SAME-ORIGIN.md` finding #3 says `pointerup` must go on the iframe `window`. On v3.1.0 that leaves the drop UNCOMMITTED — the zone shows `over` and no attribute lands. A/B run back-to-back, 2× each: document 2/2 commit, window 0/2. Spike doc annotated | — |
> | **P4** drag component by title bar | **PASS** | `inj.dragTile`. **React props, not dnd-kit** (the title bar has no `aria-roledescription`). Pointer `down`/`move`/`up` ALL dispatched **on the `.component-title-bar` element itself**; document- and window-targeted moves do nothing at all. Landing error **0.0 px** for a (−60, +90) request | 1 undo click; redo restores |
> | **P5a** click a plotted point | **PASS** | Full pointer sequence at the computed point on the graph `<canvas>`. Position is now EXACT: `plot-cell-background`'s rect IS the canvas rect, so `x = plotLeft + (v − xLo)/(xHi − xLo)·plotWidth`; dot plot y = `plotBottom − 6`; scatterplot y from the y bounds. First try selected African Elephant | selection is NOT undoable — see P0.7 |
> | **P5b** click a map region | **not probed** | Out of P0–P4 scope (tutorials 3–7). Still UNVERIFIED, still Leaflet, still probe-at-P5 | — |
> | **P6** marquee select | **PASS** | `inj.marquee` — pointer drag on the canvas from plot top-left+6 to bottom-right−6; selected all 12 cases. Must NOT climb to a draggable ancestor (`useHandle: false`), or the tile moves instead | NOT undoable; inverse = `create dataContext[X].selectionList []` |
> | **P7** type text | **PASS** | Full-sequence click on `[data-testid=title-text]` swaps in an `<input>` inside the title bar; per-keystroke `keydown`/`keypress`/native-value-setter+`input`/`keyup` at ~20 cps, then `Enter`. Title became "Dot Was Here" | 1 undo click; redo restores |
> | **P8** CSV import | **not probed** | Fallback-first by design (`carrycsv`) — unchanged | — |
> | **P9** axis rescale / pan | **PASS** | `inj.dragAxis`. **d3-drag, and it is MOUSE-ONLY** — pointer events have zero effect. `mousedown` on `rect.dragRect.h-translate` (pan) / `.h-lower-dilate` / `.h-upper-dilate` (rescale), `mousemove`×12 then `mouseup` on `window` (document also works). Pan +60 px: x bounds [−500, 7500] → [−2110.7, 5889.3]. **Beware**: `[data-testid=axis-bottom]`'s bounding rect spans the whole plot (it contains the grid lines) — hit-test below `plotRect.bottom`, not inside it | 1 undo click; redo restores |
> | **P10** point drag (displace/recover) | **PASS** | Pointer down/move/up on the canvas, moves on `document`. The dragged point renders BLUE (selected) while held and animates home on release | see P0.6 |
> | **click shape (general rule)** | measured | Tool-shelf buttons and open menu items: ONE `click` (the full sequence double-toggles Chakra menus). Everything inside a component — title bars, case-table pills, inspector buttons, canvas: the FULL pointer sequence. Axis attribute-label menus are the exception that proves it: single click, even though they sit inside a draggable. `inject.js` `needsFullSequence()` encodes this; resolvers may override | — |
> | **P0.4** undo mechanics | measured | Every document mutation tested reverts in exactly **1 undo click**: graph create, pill→x, pill→y, tile move, axis pan, title rename. **Selection is not on the undo stack at all** (6 clicks, no change) | inverse for selection: `selectCases []` |
> | **P0.4b** redo residue | measured, **verbatim** | After a full undo revert, ONE Redo click re-applies the change for **every** undoable primitive above (6/6). So Dot's demo does sit on the redo stack and a student pressing Redo replays it — and may self-check a task. Policy stands: accept and record; the P3 fork should also gate its notification listener during a redo burst if it can tell them apart | — |
> | **P0.5** trusted-mouse interference | **HARMLESS** | With the injected drag slowed to 40 steps × 60 ms, 9–10 **trusted** CDP mouse moves per run were delivered into CODAP's document mid-drag (counted by a capture listener filtering `isTrusted && !__dotDemo`), on paths crossing the whole graph. The drop committed correctly **2/2**. → **Cancellation channel #2 (trusted `pointermove` during a drag) may be relaxed to pointerdown-only.** Caveat worth knowing: `agent-browser mouse move $var` silently no-ops under zsh (no word splitting) — the first two "no interference" runs were vacuous until the counter caught it | — |
> | **P0.6a** displacement transfer function | **gain = 1.00** | Dot plot, outlier held at −20 / −60 / −120 px and screenshot-measured (PIL blob centroid, dpr 1, plot rect 572,156,298,259): rendered −20.0 / −60.0 / −120.0 px. **Exactly 1:1, not damped** — the spike's "~12 px for 60 px" was mid-animation sampling. Drawn point radius ≈ **7.9 px** on a 12-case dot plot. So a P6 bat arc needs ≥ ~16 px of injected travel to clear the 2×-radius visibility floor | point animates home natively |
> | **P0.6b** scatterplot data identity | **PASS** | `itemSearch[*]` before / during / after a 70×−40 px point drag: values DO change during the drag (`duringDiffers: true`) and are **byte-identical after release** (1250-char normalized JSON, exact match). Chad's condition is met → scatterplots stay eligible for the Easter eggs | none needed |
> | **P0.7** selection cleanup | **PASS** | `create dataContext[X].selectionList []` clears a click-made selection (verified in-suite) | — |
> | **four-graphs anomaly** | **CAUSE FOUND in P2** | Seen first in P0.1 (one injected Graph click, four graphs in `componentList`; not reproducible then — 3/3 controlled repeats gave 0→1). Reproduced deliberately in P2 and diagnosed: **the harness's own `api()` helper was retrying WRITES.** A `create` whose reply the phone dropped has still happened; re-sending it makes another component, so one `create component graph` became four. Fixed in `demo-driver.js` and `inject-test.js`: reads retry, writes never do — verify a write with a follow-up read instead. That is what "get-verify-retry" always meant, and it is easy to implement as "retry everything" by mistake. The revert is still state-diff driven, which is what contained the damage | delete the duplicates |

### Phase 1 — demo cursor + paw sync

Cursor timeline + paw-print sprite + Dot's offset path +
`facingOverride` (character.js addition) + held-arm carry + tap-sync
constant (frozen-frame measured). Two hard-coded demos (not yet DSL):
MakeGraph and AssignAttribute on the Mammals fixture, debug button on
`codap-same.html`.

**Done when**: (a) instrumented `(paw, cursor)` log over a full demo
shows max distance ≤10px (plus one screenshot for qualitative
confirmation); (b) the real toolbar click lands (graph appears, API-
verified); (c) the real pill drag completes with CODAP's native
preview visible in at least one captured frame; (d) revert returns
componentList to the pre-demo snapshot (API diff empty).

### Phase 2 — DemoScript language + tutorial-1 scripts

Line-notation parser (line-numbered errors, JSON round-trip), JSON
schema + interpreter, resolvers, state-diff revert, cancellation
channels, engine integration (`ignoreActivity`, startle gate). Port
the two P1 demos to scripts; write the remaining tutorial-1 scripts
(`Drag` via `carrycsv`, `MoveComponent`, `SecondAttribute`). Console
API: `window.__demo.run('tutorial1','MakeGraph')` and
`window.__demo.runScript(jsonOrLineText)` (validates before moving).

**Done when**: all 5 tutorial-1 demos run green (definition above) 3×
consecutively on the Mammals fixture; a mid-demo trusted pointerdown
cancels cleanly (Dot retreats, diff-revert leaves the student's own
just-made change intact — test this exact interleave: student creates
a graph during the demo beat, then cancel fires); `runScript` rejects
three malformed scripts (unknown verb, unknown target kind, >40
steps) with typed errors and zero Dot movement; a fresh line-notation
script written at test time (`pill:Sleep -> axisDrop:left`) runs
green; line↔JSON round-trip byte-stable on every tutorial-1 script.

### Phase 3 — plugin fork + Show me handoff (tutorial 1 end-to-end)

Fork family A (tutorial-1 config) with the corrected topology +
handshake + suppression + `dot-demo-busy` + MP4-on-error; rewrite the
tutorial-1 document; `?tutorial=1` loading via the P0-verified
mechanism.

**Done when**: on `codap-same.html?tutorial=1` — every "Show me."
runs Dot's demo live; the checklist does NOT check during demos;
manual task performance DOES check (all 5); demos behave in a dirty
document (a pre-existing graph: delta-conditions hold, revert touches
only demo changes); a second "Show me." during a running demo gets
`dot-demo-busy` and the link stays alive; a forced driver failure
(test hook) plays that task's MP4.

### Phase 4 — tutorial 2 + shared scatterplot set

Scripts: `MakeScatterplot`, `SelectCases` (marquee), `HideUnselected`,
`Deselect`, `Rescale`, `MakeLegend` (these six are the shared
`task_descriptions_2.js` set — written once, they cover tutorials
2–7's second halves). Fork tutorial-2 config.

**Done when**: tutorial 2 fully Dot-powered (P3 criteria); the six
scripts run green against a family-B *document/dataset* (no family-B
fork yet — that's P5; review fixed this dependency).

### Phase 5 — tutorials 3–7 (family B)

Fork the five `onboarding-new-*` plugins; copy/rewrite documents 3–7;
remaining scripts: maps (verify P5b Leaflet injection FIRST; map drop
zones + region hit-testing resolvers), minimize/restore, case card,
table column menus, mean/median, binning/histogram, GroupByClass
hierarchy drag, title typing, DrawTool (probe; MP4 fallback if flaky,
recorded here).

**Done when**: every "Show me." across all 7 tutorials either runs a
green Dot demo (one full pass, 3× each) or is recorded in this doc as
MP4-fallback with the blocking reason. Target ≥90% of ~40 tasks
Dot-powered.

### Phase 6 — Easter eggs

bat-a-point v2 + swim-the-shallows per spec, sized from P0's measured
displacement gain.

**Done when**: bat-a-point v2 on a live dot plot shows the REAL point
displaced ≥2× point radius (screenshot-measured) and recovering;
itemSearch before/after byte-identical; selection cleared;
swim-the-shallows parts ≥5 points across a 12-point dot plot with
peak displacement ≥2× radius, all points back at rest within 3s of
exit (pixel measurement), selection cleared; scatterplot eligibility
per P0's byte-identity result (conditional — if excluded, criteria
apply to dot plots only and the exclusion is recorded); engine
selfTest green.

### Phase 7 — packaging + public deployment

Self-host pinned CODAP build (replace dev proxy); vendor plugin forks,
documents, AND all fallback MP4s (review: the safety net must survive
offline); `SELECTORS.md` inventory (every data-testid we depend on,
stamped with the CODAP build hash); tutorial landing page; GitHub
Pages deploy (or the Concord option if Chad has chosen it by then);
bridge health-check/reconnect hardening.

**Done when**: with the network restricted to our origin, a cold
student flow (open page → tutorial 1 → Show me each task → do tasks →
finish) completes without console errors, AND a forced `dot-demo-error`
during that offline run plays the vendored MP4.

### Phase 8 — LLM drive mode (gated on an actual LLM consumer)

The stepwise session surface (scope review moved this out of P2 — the
tutorials don't consume it; the language was designed for it from the
start so this phase is additive):

```js
const s = window.__demo.session();     // takes the demo engine slot
await s.step('tap toolbar:graph');     // line or JSON step
// -> { ok, observation: { components, resolvableTargets, selection,
//      lastEffect } }
await s.observe();                     // read-only snapshot
await s.end();                         // ALWAYS state-diff reverts
                                       // unless leaveChanges + allow flag
```

Sessions: same caps enforced by live state diff; same cancellation;
30s idle timeout **whose teardown runs the same revert** (an abandoned
LLM session must never strand mutations — review finding). Write
`docs/DEMO-LLM-AUTHORING.md`: schema, target grammar, line notation,
drive protocol, two worked examples, prompt-ready. Key management per
Deployment.

**Done when**: a three-step tap→observe→drag session works with
observations reflecting each effect; `end()` and timeout both leave
the document at the session-start snapshot; the authoring doc's two
examples run green via `runScript` verbatim.

## Known gotchas (verified; will bite otherwise)

1. Toolbar menus: ONE `MouseEvent('click')`; full sequences
   double-toggle. Menu state = popper `visibility`.
2. Lookalike Unicode in menu labels — data-testid/index only.
3. dnd drags: `pointerup` on the iframe `window`; constant pointerId;
   `buttons:1` on moves; a few px travel before activation.
4. THREE.Color converts sRGB→linear — pixel comparisons must parse
   colors via canvas `fillStyle` (see `measureRealPoint` in
   `web/src/behaviors.js`).
5. iframe-phone drops replies AND notifications randomly and can die
   wholesale. Every API check: get-verify-retry. The engine's 15s
   `_resyncComponents` is the model's safety net. NEVER base revert
   accounting or safety caps on notification counting.
6. The engine cancels active behaviors on bridge activity —
   demo behavior MUST set `ignoreActivity: true`, and `startle` must
   be gated during demos, or the demo cancels itself (P2).
7. CODAP v3 points are PixiJS canvas — no DOM circles; positions from
   axis DOM rects + API bounds.
8. `agent-browser record start` reloads the page — use instrumented
   screenshot bursts (BAT-A-POINT.md).
9. Stale vite holds the port and serves old config silently:
   `pkill -f vite`, verify port free, relaunch detached.
10. Tutorial plugins render their checklist lazily (seconds of
    "Loading…") — the handshake retry loop absorbs this; `waitFor`
    the checklist DOM before any Show me wiring in tests.
11. There is no `P.aim` runtime API (that's the Blender pipeline DSL);
    held gestures go through `play(clip, {hold:true})` / `gestureAt`.

## Bail-out items (report to Chad with evidence; do not decide)


- The `carrycsv` fallback recording, for Chad's accept/reject on
  attempting true synthetic file-drop instead.
- Scatterplot snap-back leaves any data residue (P0 #6) — Chad ruled
  temporary flicker OK; residue is a different matter.
- v2→v3 document conversion damage (P0 #2 screenshots).
- The Concord hosting conversation (Deployment).
- Any change to tutorial TEXT/content.

## Resolved questions (provenance)

- Scatterplot drags: temporary table-value changes during the drag are
  ACCEPTABLE (Chad, 2026-08-25) provided values snap back exactly —
  P0 verifies byte-identity.
- Demo-then-revert-then-unchecked: assumed and specified throughout;
  flip is a one-line fork change if Chad reverses.
- Selection side-effects: cleared after demos and Easter eggs.
- Deployment: static bundle; GitHub Pages default; Concord option
  open; LLM drive-mode excluded from public build until Phase 8.

An honest failure = a primitive that will not respond to synthetic
input after real verification effort, documented with the exact events
sent and observed behavior — that task ships with its MP4 and the
phase proceeds. The phase structure guarantees value at every stop.
