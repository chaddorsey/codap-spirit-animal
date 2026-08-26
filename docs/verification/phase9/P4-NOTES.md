# P4 notes — tutorial 2 and the shared scatterplot set

Written 2026-08-26. Same rule as P2 and P3: the work order is unedited, and
where the result is short of its criterion this says so plainly.

## Where P4's criteria stand

**"the six scripts run green against a family-B document/dataset"** — four of
six, verified live on the nhanes dataset in the forked tutorial-2 document:

| script | result |
|---|---|
| `SelectCases` (marquee a subset) | **green**, 32.5 s, residue 0 |
| `HideUnselected` (inspector menu) | **green**, 41.8 s and 60.4 s, residue 0, hidden cases restored |
| `Deselect` (click empty plot) | **green**, 38.9 s, residue 0 |
| `Rescale` (inspector button) | **green**, 27.6 s, residue 0, 1 undo click |
| `MakeLegend` (attribute → plot) | drop mechanism **fixed and proven in isolation**; the end-to-end run hit the 60 s cap |
| `MakeScatterplot` (graph + two axes) | **exceeds the 60 s cap**, three times running |

**"tutorial 2 fully Dot-powered (P3 criteria)"** — the fork, the handshake, the
document and the task list are all in place and verified (the plugin
handshakes as tutorial 2 and renders all six tasks), and the P3 machinery is
the same code path already verified there. The two scripts above are the gap.

## MakeScatterplot does not fit the 60 s cap

That task is three heavy CODAP operations in one: create a graph, drop an
attribute on x, drop another on y. Each costs a multi-second main-thread stall
(P3-NOTES measured 1.3–17 s for a single injected click that makes CODAP build
a graph), plus Dot's travel and the revert. Three separate runs ended at the
cap; an instrumented one had reached `x = Age` with `y` still empty when the
clock ran out.

Trimming the script — dropping its `goto`, shortening its waits from 12 s to
8 s, and its beat from 1.6 s to 1.2 s — did not change the outcome, because the
cost is not in the choreography.

The cap is a recorded decision and was not touched. On this machine the task
ships with its MP4, which is what the fallback exists for; on a faster machine
it may well fit, and the numbers above are the thing to re-measure rather than
the code. **This is the honest failure the work order describes**: the
mechanism responds to synthetic input perfectly well — every individual action
in the script has been verified — but the whole task does not fit its time
budget here.

## MakeLegend: what was actually wrong, and it is fixed

The legend drop did nothing, three attempts, with the plot droppable never
reaching `over` even though the drag was clearly live.

**dnd-kit decides what you are over from the DRAGGED ITEM'S rect, not from the
pointer.** The dragged item is a case-table column header (~50×29) hanging off
the cursor, so a drop aimed at the plot's centre still overlaps the axis
droppables and the plot never wins the collision. Measured, one run, three
aim points on the same plot:

```
centre       (0.50, 0.50) -> over: []                              legend: null
upper-left   (0.20, 0.20) -> over: []                              legend: null
lower-right  (0.80, 0.80) -> over: ["droppable-plot active over"]  legend: "Sex"
```

`legendDrop` now aims at (0.78, 0.78) of the plot rect, falling back to the
clear-point scan if that lands under another tile. This is the same class of
bug as the occluded `axisDrop:left` in P3 and is worth remembering for P5's map
drop zones: **aim where the dragged item's rect will sit, not where the pointer
looks right.**

## Hidden cases were invisible to the revert — fixed

`HideUnselected` reported `residue 0` while leaving **74 cases hidden** in the
document. Hiding cases changes nothing that `componentList` or the axis
properties show, so the state diff could not see it at all: the demo mutated
the student's document and the revert cheerfully declared success.

The snapshot now carries `hidden` (the count of `hiddenCases`) and
`onlySelected` (`displayOnlySelectedCases`), and the targeted inverse restores
`hiddenCases: []`. Only an empty base is reconstructible — we record how many
cases were hidden, not which — so a demo starting from a document that already
had cases hidden reports residue instead of guessing. Verified: hidden before 0,
hidden after 0, residue 0.

The general lesson, and the one to carry into P5: **the state-diff revert is
only as good as the snapshot's field list.** Every new verb that can change
something the snapshot does not record is a silent revert failure. Adding a
verb means asking what it changes and whether the diff can see it.

## Two things tutorial 2 needed before it could work at all on v3

Both in the fork, both measured:

1. **No case table.** `dataContextFromURL` opens none on v3, so tutorial 2 came
   up with the nhanes data loaded and not one attribute pill on screen —
   nothing to drag onto an axis, the tutorial simply could not be done. The
   fork opens one from its poll.
2. **And the table must be checked.** A table created too soon after the import
   comes up unbound. The fork detects that without reaching into CODAP's DOM —
   an unbound table has no `dataContext` in its own component props — and
   replaces it.

Both are recorded with the rest of the v3 notification/import findings in
`BAILOUTS.md`.
