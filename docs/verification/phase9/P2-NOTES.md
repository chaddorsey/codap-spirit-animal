# P2 notes — what building the DemoScript layer changed, and why

Written 2026-08-25 while executing Phase 2 of `docs/PHASE9-SHOWME.md`. These
are implementation findings that the work order could not have known. **The
work order is unedited**; where the implementation goes beyond its pseudocode,
the reason is here, with the measurement that forced it.

## 1. The revert loop as written does not protect student work

The Driver contract specifies:

```
while (diff(currentState, snapshot) is nonempty && clicks < cap):
    Dot taps Undo; re-fetch state
    if diff did not shrink: break        # undo is reverting something
                                         # that is NOT ours — STOP
```

That rule cannot do the job its own comment claims. Run the exact interleave the
P2 acceptance criteria ask for — student creates a graph during the demo's beat,
then the cancel fires — and the diff vs the demo-start snapshot contains **two**
entries: the demo's axis assignment and the student's new graph. The first Undo
click pops the student's graph off the stack. The diff **shrinks** (2 → 1). The
rule says continue. The second click removes the demo's change, the diff is
empty, and the loop reports success — having silently destroyed the student's
work. The one thing it was written to prevent.

**What is implemented instead** (`web/src/demo/demo-driver.js`, `revert()`):

1. Every diff entry observed after a demo step is claimed as **ours**
   (`ownKeys`). Anything else in the diff is the student's.
2. The Undo loop watches the **foreign** part of the diff. If a click makes a
   foreign entry disappear, that click hit the student — so click **Redo**
   immediately (P0 measured that redo restores 6/6 primitives exactly), stop,
   and keep the residue.
3. Whatever of ours is left is then undone with **targeted inverse API ops**,
   which the work order already permits: delete the components/contexts this
   demo created, and `update component[id]` the changed fields back to their
   demo-start values.

Measured result of the acceptance interleave, four runs: Dot aborts with
`DemoAbort: student pointerdown`, the student's graph survives, and the demo's
own change is fully reverted (x, xLo, xHi, y all back to null).

Two smaller things fell out of building step 3:

- **Restore a component's fields in ONE `update` call.** Clearing `x` on its own
  made CODAP promote the remaining attribute to `y` — a field-at-a-time restore
  chases its own tail.
- **Drift caused by our own restore is ours to clean up.** A field that appears
  in the diff only because our `update` disturbed it is not a student change,
  so components this revert has already written to stay claimable for the
  remaining passes. Components it has not touched never become claimable.

## 2. `api()` must not retry writes — this was making duplicate components

The P0 table recorded an unexplained anomaly: one injected Graph click, four
graph components. P2 reproduced it deliberately and found the cause, and it was
ours, not CODAP's.

The get-verify-retry discipline (`docs/BAT-A-POINT.md`) exists because the
iframe phone drops replies. It is very easy to implement that as "retry
everything". But a `create` whose **reply** was dropped still **happened** —
re-sending it makes a second component. One `create component graph` came back
as four.

Fixed in `demo-driver.js` and `inject-test.js`: **reads retry, writes never do.**
A write that gets no reply is reported and then verified with a follow-up read.
The P0 table row has been updated from "unresolved" to the diagnosis.

## 3. A teaching beat has to notice a cancellation

`beat 9` compiled to a plain `sleep(9000)`, which swallowed the student's cancel
for nine seconds — long enough for the 60 s wall-clock cap to fire first and
report the wrong cause. Waits inside steps are now sliced and abort-aware, so
Dot retreats when the student touches something rather than when she happens to
finish waiting.

## 4. Cancellation channel 2 is deliberately not wired

The work order asks P0 to decide this and P2 to implement the answer. P0
measured 9–10 confirmed trusted mouse moves interleaved into a live injected
drag, twice, and the drop committed correctly both times. Channel 2 (trusted
`pointermove` during a drag) is therefore **not** wired; channels 1 (trusted
`pointerdown`/`keydown`, after a 500 ms grace so the click that starts a demo
does not cancel it) and 3 (`waitFor` timeout / `TargetNotFound`) are.

## 5. Comments are not part of the canonical line notation

`toLines(parse(text)) === text` is asserted byte-for-byte on every tutorial-1
script, which means the canonical form has no room for comments or blank lines
inside a demo block. Scripts in `web/public/demo-scripts/` are therefore
comment-free; explanation lives here and in the schema's `description` fields.
