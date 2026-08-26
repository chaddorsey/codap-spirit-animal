# Known issue: `MakeScatterplot` exceeds the demo wall-clock cap

Status: RESOLVED 2026-08-26 by raising the cap to 120s (Chad's decision).
`MakeScatterplot` now runs green 5 of 5 at 78.2-85.4s with an empty revert.
Kept for the measurements and for the revert bug the fix exposed — see
"What raising the cap exposed" at the end.

Originally: open, blocking the sixth script of the P4 shared scatterplot set.
Recorded 2026-08-26. Measurements taken on CODAP v3.1.0 (build 2985) through
the same-origin proxy on `codap-same.html?tutorial=2`.

## Summary

The `MakeScatterplot` demo script does not complete within the 60-second
wall-clock cap that the demo driver enforces. On an idle page, the script
requires approximately 85–100 seconds. The demo aborts at the cap, posts
`dot-demo-error`, and the plugin falls back to playing `MakeScatterplot.mp4`.

This affects one script in the shared scatterplot set. The other five scripts —
`SelectCases`, `HideUnselected`, `Deselect`, `Rescale`, and `MakeLegend` —
complete successfully with an empty revert diff.

## Cause

`MakeScatterplot` performs three CODAP mutations in a single demonstration:

1. Click the **Graph** tool-shelf button to create a graph.
2. Drag the `Age` attribute to the x axis.
3. Drag the `Height` attribute to the y axis.

Every other script in the set performs one or two mutations. Each mutation
forces CODAP to do multi-second work on the main thread, and the cost is
dominated by CODAP rather than by the animated character.

The following measurements break down a single `tap` step on a quiesced page:

```
Character travels to the button    0.1 s
Tap clip to contact frame          1.3 s
Injected click (CODAP)             8.6 s
Settle after the click (CODAP)     5.1 s
```

The character's choreography accounts for roughly 2.5 seconds per action. The
remainder is CODAP building the graph. Because the script performs three
mutations, it pays this cost three times.

## Reproducibility

Earlier measurements suggested the failure was intermittent. That conclusion
was incorrect: the test harness deleted the graph and started the next attempt
about 3 seconds later, so each run was timed against a still-busy CODAP
instance.

When the page is allowed to quiesce first — a 20-second floor, then frames
sustained at 45 ms or less for 5 seconds, measured outside the demo clock — the
spread collapses:

```
run 1   tap 20.2 s   drag 28.5 s   -> exceeded cap
run 2   tap 26.0 s   drag 29.9 s   -> exceeded cap
run 3   tap 21.7 s   drag 31.9 s   -> exceeded cap
```

The overrun is stable at roughly 1.5x the cap. The script failed 12 of 12
attempts: 9 with the final code against a busy page, 3 with proper quiescing.

## Approaches that don't resolve the issue

Verify these before proposing them again.

| Approach | Result |
|---|---|
| Reduce injected `pointermove` count | No effect. Measured 5 moves at 77.4 s, 3 moves at 26.5 s, 2 moves at 32.6 s in one run, all landing correctly. Move count is not the cost driver. |
| Increase the pre-drag idle wait to 12 s | No net gain. Produced both the fastest and the slowest runs recorded. Reverted. |
| Create the graph by dragging an attribute to empty workspace | Not available. All six candidate drop points in the tutorial 2 layout are occupied by the plugin panel or case table. |
| Replace the embodied undo with an API-only revert | Saves about 13 s of roughly 87 s. Insufficient on its own. |
| Remove the post-mutation settle waits | Makes subsequent drags slower. Net loss. |

No remaining implementation change closes the 27-second gap.

## Viable options

Each option requires a product decision, because each changes either the
student-facing behavior or a recorded design decision. None is the
implementer's to make.

### Option 1: Split the task into two demonstrations

Measured at approximately 52 seconds for "create the graph and assign `Age` to
x" and 25–35 seconds for "assign `Height` to y". Both fit the existing cap.

- Advantage: produces a live demo without modifying the cap.
- Cost: changes what a single **Show me.** link does. Also produces seven
  scripts where the P4 criterion names six, so it does not satisfy that
  criterion as written.

### Option 2: Raise the cap for multi-action tasks

Requires approximately 120 seconds to be reliable.

- Advantage: requires no change to the script or the interaction.
- Cost: modifies a recorded design decision. A 120-second demo runs roughly
  twice as long as any other script in the set, which may exceed the span a
  student will watch.

### Option 3: Retain the MP4 fallback

This is the current shipped behavior.

- Advantage: no further work. Students are no worse off than before the
  feature existed.
- Cost: no live demonstration for this task.

## Related considerations

The cost finding generalizes beyond this script. Every demo is exposed to the
same CODAP main-thread cost. The five passing scripts were verified with empty
reverts, but on a slower machine any of them can reach the cap. On this
hardware, the MP4 fallback is a steady-state property of the system rather than
a concession specific to one task.

Re-measuring on a typical student machine — one not also running a dev server,
a headed automation browser, and a proxy — may change the numbers. The demo's
own choreography accounts for about 12 seconds; the remainder is CODAP.

## See also

- `BAILOUTS.md` #3 — the bail-out record, with per-attempt measurements.
- `P4-NOTES.md` — the full P4 tally and the five passing scripts.
- `docs/PHASE9-SHOWME.md` — the governing work order and the cap decision.

## What raising the cap exposed

Letting the demo finish for the first time surfaced a second, more serious bug
that the 60-second cap had been hiding: the demo completed and its **revert
left its own graph in the student's document** (`clicks 1, residue 1, graphs
before 0 / after 1`).

Revert measured progress on the diff's own-key signature. `diff()` emits a
single `added` entry for a component that was not in the base and never
compares that component's fields, so "create a graph, put `Age` on x, put
`Height` on y" is **one** diff entry. Undoing the y attribute left that entry
byte-identical, the stall check read it as "nothing of ours changed", and
revert stopped after one click when it needed three. Probing the Undo button
directly confirmed the button was fine: click 1 undid y, click 2 removed the
graph.

Three fixes, in `demo-driver.js`:

1. Measure revert progress against a signature of the **document** (`snapSig`),
   not against the diff.
2. Wait for each undo to actually land (poll to 8 s) instead of assuming a
   fixed 660 ms; CODAP applies an undo over several seconds.
3. Treat every change on a component the demo **created** as ours
   (`ownComponents`) — such a component cannot hold pre-existing student work.

Only `MakeScatterplot` could hit this. It is the only script that creates a
component and then changes it twice; `MakeGraph` creates one and stops, so a
single undo emptied its diff and it reverted correctly. **The lesson for P5 is
the same one P4 already recorded in a different form: the revert is only as
good as what the snapshot and the diff can see.**

## Final measurements at the 120s cap

```
MakeScatterplot   81.4 / 79.1 / 79.9 / 85.4 / 78.2 s   5 of 5 green, residue 0, 3 undo clicks
SelectCases       19.2 s   residue 0
HideUnselected    33.7 s   residue 0
Deselect          51.5 s   residue 0
Rescale           14.1 s   residue 0
MakeLegend        41.0 s   residue 0
```

Document identical before and after the five-script pass: `graphs 1, x=Age,
y=Height, legend null, hidden 0, onlySelected false`.

One caveat worth keeping: an earlier series measured 2 of 3 green, and the
failure was a 29.8 s tap followed by a 53.4 s drag. The 5-of-5 series above
ran after closing two idle automation browser sessions (Chrome processes 62 ->
34). **Machine load moves these numbers a lot**, which is the same confound
that produced the original "it is variance" misdiagnosis.
