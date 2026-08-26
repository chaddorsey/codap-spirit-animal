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

### What the task is

Tutorial 2's first task — "Make a scatterplot of height vs age" — is three
heavy CODAP operations in one: create a graph, drop an attribute on x, drop a
second on y. Every other tutorial-1 and tutorial-2 script is one or two.

### Evidence

The script is CORRECT: it has completed green, with an empty revert, at
**50.4 s**:

```
say 1.2s | tap 9.4s | wait 0s | beat 1.5s | drag 8.0s | wait 0s |
drag 4.6s | wait 0s | beat 1.2s | revert 17.8s | say 1.1s   -> ok, 50.4s
```

It also fails, on the same page and the same code, when CODAP happens to be
slow. Three failing runs, by step:

```
tap 25.7s  drag 50.4s      (cap hit during the first drag)
tap 11.2s  drag 28.5s      (cap hit during the first drag)
tap 64.3s                  (cap hit inside the tool-shelf click alone)
```

**The same injected tool-shelf click has measured 9.4 s and 64.3 s on the same
page.** That variance, not the script, is what decides the outcome.

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

### For Chad

The cap (60 s) is a recorded decision and was not touched. Two things would
settle this:

1. Re-measure on a normal student machine that is not also running a dev
   server, a headed automation browser and a proxy. The demo's own
   choreography is about 12 s; everything else is CODAP.
2. If it still straddles, the product question is yours: raise the cap for
   multi-action tasks, split the task into two demonstrations, or leave it on
   the MP4. All three are reasonable; none is mine to decide.
