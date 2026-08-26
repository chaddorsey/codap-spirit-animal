# Bail-out items — Phase 9

Per `docs/PHASE9-SHOWME.md`: report to Chad with evidence, do not decide. Each
entry records what was probed, what was observed, and what the implementation
did in the meantime so the phase could continue.

---

## 1. CODAP v3 sends NO notification when a data context is created

**Found 2026-08-26, during P3 (tutorial-1 "Show me." integration).**

### What this breaks

Tutorial 1's first task, `Drag` ("Drag this data file into CODAP"), is detected
by the onboarding plugin like this (`onboarding.js`, upstream, unchanged):

```js
codapInterface.on('notify', 'documentChangeNotice', this.handleCodapNotification);
...
switch (iNotification.values.operation) {
  case 'dataContextCountChanged': handleDataContextCountChanged(); break;
```

On CODAP v3.1.0 that operation never arrives, so the task can never check
itself off. **This is upstream plugin code against upstream CODAP — our fork is
not involved in the failure, and it very likely affects the official v3
tutorial pages the same way.**

### Evidence

Measured in the forked tutorial-1 document on `codap-same.html?tutorial=1`,
CODAP **v3.1.0 (build 2985)**, with a probe handler registered on the plugin's
OWN interface (`codapInterface.on('notify', '*', …)`), so this is what the
plugin itself can see:

```
create dataContextFromURL { URL: …/resources/mammals.csv, title: 'Third' }
  -> { success: true }
dataContextList before: ["mammals","mammals"]
dataContextList after:  ["mammals","mammals","mammals"]     <- the import worked
plugin's `notify *` channel during and after: []            <- nothing at all
```

The same probe DOES see other operations on the same channel, so the channel
itself is live — from one attribute drag:

```
{ res: "dragDrop[attribute]", op: "dragstart" }
{ res: "dragDrop[attribute]", op: "dragend"   }
{ res: "component",           op: "attributeChange" }
```

And the other four tutorial-1 tasks check themselves off correctly through it
(`MakeGraph` via `component/create`, `MoveComponent` via `component/move`,
`AssignAttribute` and `SecondAttribute` via `component/attributeChange`).

### What I could NOT test, and why it matters

Only the API import path was measurable. A student completes this task by
dragging a real file (or the plugin's own `DraggableLink` URI-list icon) into
CODAP, and no page can synthesise a genuine file drop — which is exactly why
`carrycsv` is fallback-first by design. **It is possible that a real drop emits
the notification while the API path does not.** Deciding that needs a human
with a mouse, about ten seconds, on the official tutorial page.

### What the implementation does meanwhile

The fork polls `dataContextList` every 1.5 s while `Drag` is unaccomplished and
checks the task off when the count rises (`DOT-FORK 6/6` in
`web/public/tutorial-plugins/onboarding/onboarding.js`). The poll is suppressed
during a demo like every other completion path, and stops once the task is
done. This keeps P3's "manual task performance checks all 5" criterion
satisfiable inside our wrapper. It is a workaround in OUR fork, not a fix.

### For Chad

1. On the official v3 tutorial page, drag the mammals file in by hand. Does the
   first checkbox tick?
2. If it does not, this is a v3 regression worth reporting to the CODAP team —
   it affects the shipped tutorials, not just this project.
3. If it does, the gap is only in the API path and our poll can be dropped.

---

## 2. `attributeChange` reaches the plugin but its detection chain does not fire

**Found 2026-08-26, same session, and it is the same family as #1.**

Tutorial 1's `AssignAttribute` and `SecondAttribute` are detected by an ASYNC
chain the plugin runs when an `attributeChange` notification arrives: fetch
`componentList`, then batch-fetch each graph, count assigned attributes,
then check the task off. Measured behaviour on v3.1.0:

- the drag lands — `component[id]` reports `xAttributeName: "Mass"`,
  `yAttributeName: "Sleep"`
- the notification ARRIVES at the plugin — logged
  `{ op: "attributeChange", type: "DG.GraphView" }` with suppression off
- and `handleAccomplishment` is **never called**; the boxes stay unchecked

Invoking the very same handler by hand a few seconds later,
`tv.handleCodapNotification({values:{operation:'attributeChange', …}})`, checks
the task immediately and correctly (`SecondAttribute` accomplished). So the
logic is sound and the chain simply does not complete when driven by the live
notification. It checked correctly in one earlier live run, so it is
intermittent rather than dead.

### What the implementation does meanwhile

The fork's poll (originally added for `Drag`) now also computes the attribute
count itself every 4 s, using upstream's own rule — 1 assigned attribute means
`AssignAttribute`, 2 or more means `SecondAttribute` (and `MakeScatterplot`
where that task exists). Suppressed during demos like every other completion
path, and it stops once there is nothing left to detect.

With that in place, all five tutorial-1 tasks check reliably when performed
manually, verified end to end.

### For Chad

Same question as #1, and worth asking together: on the official v3 tutorial
page, drag an attribute to a graph axis by hand. Does the box tick every time?
If these two are both real, the shipped v3 tutorials are under-reporting
student progress and the CODAP team should hear about it.

---

## 3. `MakeScatterplot` straddles the 60 s wall-clock cap — shipping with its MP4

**Recorded 2026-08-26 after well more than three full attempts, per the
bail-out rule ("a Done-when item still failing after 3 full attempts").**

> **CORRECTED — read this first.** Everything below that blames *variance* was
> measured with a confound: the harness deleted the graph and started the next
> attempt ~3 s later, so every run was timed against a **busy** CODAP. Chad's
> suggestion to wait longer was right and changed the diagnosis. Quiescing
> properly first (20 s floor, then frames sustained ≤45 ms for 5 s — outside
> the demo clock, and closer to a real student's idle page than the old harness
> was) collapses the spread:
>
> ```
> run 1  quiesce 25.0s   tap 20.2  drag 28.5   -> cap
> run 2  quiesce 26.8s   tap 26.0  drag 29.9   -> cap
> run 3  quiesce 32.6s   tap 21.7  drag 31.9   -> cap
> ```
>
> **It is not luck — it is a stable ~1.5x overrun.** The task needs roughly
> 85-100 s and the cap is 60 s. The 26-77 s spread recorded further down is an
> artifact of the busy-page harness, not a property of CODAP at rest.
>
> **Whose time it is, measured on an idle page:**
>
> ```
> Dot travels to the button   0.1 s
> tap clip to contact         1.3 s
> the injected click          8.6 s   <- CODAP
> settle after the click      5.1 s   <- CODAP still working
> ```
>
> Dot's choreography is about 2.5 s per action. Everything else in a 22 s tap
> is CODAP building the graph. There is no remaining slack on our side to cut:
> three mutations cost three of those, and no implementation change reaches
> them.
>
> **This makes Chad's three options decidable with numbers.** Splitting the
> task fits: "create the graph and put Age on x" measures ~52 s, and "add
> Height to y" ~25-35 s, both inside the existing cap with no gate touched.
> Raising the cap instead would need ~120 s to be safe. Leaving it on the MP4
> costs nothing and is what ships today. The split is the only option that
> gets a live demo without changing a recorded decision — **but it changes what
> one "Show me." link does, which is product shape and remains yours.**

### What the task is

Tutorial 2's first task — "Make a scatterplot of height vs age" — is three
heavy CODAP operations in one: create a graph, drop an attribute on x, drop a
second on y. Every other tutorial-1 and tutorial-2 script is one or two.

### Evidence — SIX fresh attempts with the final code, 0 green

Re-run after every performance fix below was in place, on a quiet machine
(other automation browsers closed), three attempts per configuration, each
starting from the tutorial's real state with no graph:

```
12 injected moves per drag        8 injected moves per drag
  say 1.2  tap 30.0  drag 27.4      say 1.9  tap 28.9  drag 41.6
  say 2.8  tap 53.5                 say 1.2  tap 19.6  drag 36.9
  say 0.2  tap  8.6  drag 43.3      say 0.7  tap 21.0  drag 23.5
```

All six hit the cap. The pattern is that **the task needs three CODAP
mutations and each costs 20–40 s here**, in whichever order the slowness
falls: run 2 above spent 53.5 s inside the tool-shelf click alone, while run 3
had a fast 8.6 s click and lost the budget to the first drag instead.

Reducing the injected move count from 12 to 8 did not help, which locates the
cost: a drag onto a **freshly created, still-rendering graph** costs roughly
5 s per move no matter how few moves there are. The same drag onto a settled
graph costs 3.2 s in total.

### Three more attempts, and the last structural alternative is closed

Re-tested after the bail-out was first written, because two ideas remained.

**Idea 1 — wait much longer before each drag.** A drag onto a settled graph
costs 3.2 s versus ~5 s per move onto a still-rendering one, so the idle-wait
was raised from 4 s to 12 s to buy that difference. Three fresh attempts:

```
run 1  say 1.0  tap 16.5                                  -> cap
run 2  say 4.4  tap 20.5  beat 1.5  drag 75.5             -> cap
run 3  say 0.5  tap 16.9  beat 1.5  drag 15.9  drag 27.3  -> cap at 60.1 s
```

Run 3 got closer than any run before it — it completed both drags and died on
the clock — but run 2 was the worst ever recorded. The wait is a coin flip, not
a fix: when the page never reaches idle it simply spends the full 12 s and then
pays for the slow drag anyway. **Reverted**; the code is back to the 4 s wait
that produced the verified five greens, so those results still stand.

**Idea 2 — skip the tool-shelf click entirely.** In CODAP a student can also
make a graph by dragging an attribute onto empty workspace, which would make
this task two mutations instead of three and avoid the click that measured
8.6–64.3 s. **Not available in this document.** Probing six candidate points
across the lower workspace, every one is owned by a component:

```
0.50,0.88 owned   0.75,0.85 owned   0.30,0.90 owned
0.90,0.60 owned   0.50,0.75 owned   0.15,0.75 owned
```

The tutorial-2 layout fills the workspace with the plugin panel and the case
table, so there is nowhere to drop. Clearing a space would itself cost the
mutations this was meant to save.

**Idea 3 — cut the injected move count to the minimum.** Earlier numbers (26
moves 40.7 s, 8 moves 3.2 s) suggested cost scaled with move count, so the
floor was worth finding. Timing ONE drag onto a freshly created graph, three
move counts, same page, same run — all three landed `x = Age` correctly:

```
5 moves -> 77.4 s      3 moves -> 26.5 s      2 moves -> 32.6 s
```

**This overturns the per-move model.** Five moves cost more than two; three
cost less than either. The move count is not the driver — CODAP's variance is,
and a SINGLE drag onto a fresh graph ranges from 26 s to 77 s. One drag alone
can exceed the whole 60 s budget.

That closes the question for good: no amount of implementation tuning makes a
three-mutation task fit a 60 s cap when one of its primitives can cost 77 s on
its own. **This is CODAP's cost, not the demo's.**

**The implication is wider than MakeScatterplot**, and Chad should have it:
every script is exposed to the same variance. The five greens below are real
and were verified with empty reverts, but on a bad draw any of them can hit the
cap too. That is precisely what the MP4 fallback is for, and it means the
fallback is a designed steady-state property of the system on this machine, not
a concession specific to one task.

**Nine fresh attempts with the final code, zero green.** The bail-out stands.

### It is the script's SIZE, not its correctness

The script has completed green, with an empty revert, at **50.4 s**:

```
say 1.2s | tap 9.4s | wait 0s | beat 1.5s | drag 8.0s | wait 0s |
drag 4.6s | wait 0s | beat 1.2s | revert 17.8s | say 1.1s   -> ok, 50.4s
```

Every individual action in it is verified: the click makes the graph, both
drags land their attributes, the revert diff comes back empty. **The same
injected tool-shelf click has measured 8.6 s and 64.3 s on the same page** —
the variance, not the script, decides the outcome, and three mutations give it
three chances to go wrong.

### What was done first, so this is not a lazy bail-out

Four performance causes were found and fixed (commit "find the real cause of
the wall-clock failures"), three of them ours: a dt clamp that made every clip
run at a fifth of real speed under load; injected pointermove counts whose cost
to CODAP is super-linear (26 moves 40.7 s, 8 moves 3.2 s); a
`getBoundingClientRect()` per move that forced a full layout flush; and drags
starting before a new graph had finished rendering. Those took SelectCases from
32.5 s to 12.9 s, Rescale from 27.6 s to 8.6 s, and turned MakeLegend from a
failure into a 22 s green. They took MakeScatterplot from "never finished" to
"finishes when the machine cooperates".

### Fallback taken

Per the work order, the task ships with its MP4: a demo that exceeds the cap
posts `dot-demo-error` and the plugin plays `MakeScatterplot.mp4`, which is
verified working. The student is never worse off than today.

### Everything else in the set is green

The other five shared scatterplot scripts pass on the same page, same code,
each with an empty revert: SelectCases, HideUnselected (hidden cases
restored), Deselect, Rescale, MakeLegend. MakeScatterplot is the only one that
asks for three mutations in a single demonstration.

### For Chad

The cap (60 s) is a recorded decision and was not touched. Two things would
settle this:

1. Re-measure on a normal student machine that is not also running a dev
   server, a headed automation browser and a proxy. The demo's own
   choreography is about 12 s; everything else is CODAP.
2. If it still straddles, the product question is yours: raise the cap for
   multi-action tasks, split the task into two demonstrations, or leave it on
   the MP4. All three are reasonable; none is mine to decide.
