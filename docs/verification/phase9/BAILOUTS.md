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
