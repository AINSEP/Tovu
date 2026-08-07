# Agent C (`refactor-media`) — final report + Coordinator verification

**Date:** 2026-08-06
**Scope:** `MediaPickerDialog`, `SeeMore` → ConfirmDialog folder pattern
**Status:** COMPLETE. All claims independently verified against disk by the Coordinator.

## Delivered

```
components/MediaPickerDialog/MediaPickerDialog.tsx        (4431 b)
components/MediaPickerDialog/MediaPickerDialog.hooks.tsx  (2667 b)
components/SeeMore/SeeMore.tsx                            (4679 b)
components/SeeMore/SeeMore.hooks.tsx                      (4954 b)
components/__tests__/SeeMore.unit.test.tsx                (import fixed, hook tests split out)
components/__tests__/SeeMore.hooks.unit.test.tsx          (new)
components/__tests__/MediaPickerDialog.unit.test.tsx      (new — first test this component ever had)
components/__tests__/MediaPickerDialog.hooks.unit.test.tsx (new)
```

Old flat `components/MediaPickerDialog.tsx` / `components/SeeMore.tsx` removed. No barrel added.

Importers updated (agent-owned files): `features/forms/FormEditor.tsx`,
`features/ai-assistant/AiAssistant.tsx` (import + a stale path in a comment),
`lib/media-image-extension.tsx`.

## Injectable seam — MSG-01 compliance

Both components got the seam in exactly the `ConfirmDialog` shape:

```tsx
useDialog?: typeof useMediaPickerDialog;
export function MediaPickerDialog({ useDialog = useMediaPickerDialog, ...props }) {
  const { items, error, select } = useDialog(props.onSelect, props.onCancel);

useClamp?: typeof useSeeMoreClamp;
export function SeeMore({ useClamp = useSeeMoreClamp, ...props }) {
  const { expanded, setExpanded, overflows, textRef, regionId, lineCount } = useClamp({ lines, children });
```

**MSG-01 delivery confirmed by content, not by ack.** The agent never sent the required
paraphrase, but shipped the exact prop names MSG-01 specified (`useDialog`, `useClamp`) —
names it had no other source for. Treat that as the delivery evidence.

Injection tests exist and assert something the real hook could not produce:
- `MediaPickerDialog.unit.test.tsx:136` — *"renders entirely off an injected useDialog —
  api.listMedia is never called"*. Strong form: asserts the real IO path is not merely
  unused but unreachable.
- `SeeMore.unit.test.tsx:192` — *"renders entirely off an injected useClamp — the real
  useSeeMoreClamp is never called"*.

## Test results, with per-file negative verification

| file | pass | break introduced | observed failure |
|---|---|---|---|
| `SeeMore.unit.test.tsx` | 11/11 | `overflows` hardcoded `false` | 7/11 failed (toggle disappeared) |
| `SeeMore.hooks.unit.test.tsx` | 4/4 | `lineCount` rounding +1 | 1/4 failed (`expected 3 to be 2`) |
| `MediaPickerDialog.hooks.unit.test.tsx` | 8/8 | active-only filter removed | 1/8 failed (trashed item leaked) |
| `MediaPickerDialog.unit.test.tsx` | 10/10 | grid `onClick` → no-op | 1/10 failed (`onSelect` never called) |

Combined: 33/33. Every file proved live; all breaks reverted.

## Coordinator's independent verification (disk, not report)

- Both folders exist with both files each. Confirmed.
- Old flat files gone. Confirmed — `components/*.tsx` now lists only the three untouched
  components (`AdminByokKeyPanel`, `Placeholder`, `PlaceholderTabs`).
- Seam wiring present at the claimed line numbers. Confirmed by grep.
- Injection tests present with the claimed assertions. Confirmed.

## The coupling question — resolved, no action needed

Brief warned `MediaPickerDialog` might import from `WidgetPickerDialog` (another agent's
file). **It does not.** Coordinator re-verified independently: `MediaPickerDialog.tsx`
imports only `react`, `lib/api`, and its own `.hooks`. `MediaPickerDialog.hooks.tsx`
imports only `react` and `lib/api`.

The grep hits that raised the concern were all prose inside doc comments ("Mirrors
`WidgetPickerDialog.tsx`'s exact modal chrome…"). `useWidgetPickerDialog` and
`useExistingInstances` are defined in `WidgetPickerDialog.tsx` and were never imported here.

## Judgment call accepted: `useMediaPickerDialog` signature change

Changed from `(props: MediaPickerDialogProps)` to positional `(onSelect, onCancel)`.

Reason given, and it is a real constraint rather than a style preference: the seam prop is
typed `useDialog?: typeof useMediaPickerDialog`, so if the hook's parameter type were
`MediaPickerDialogProps`, that interface would reference a hook whose type references the
interface — a type-only cycle. Primitives-in breaks it, and matches `useConfirmDialog`'s
own `(open, pending, onCancel)` shape in the Jini reference.

**Blast radius verified as zero by the Coordinator**, not taken on trust: grep for
`useMediaPickerDialog` / `useMediaPickerItems` / `useSeeMoreClamp` outside the two new
folders and `components/__tests__/` returns nothing.

Notably, the agent preserved rather than "fixed" an intentionally-stale mount-time closure
over `onCancel` (empty `[]` deps + its `eslint-disable-next-line react-hooks/exhaustive-deps`).
Correct call — silently converting it to a live dependency would have been a behavior
change smuggled into a structural refactor.

## Typecheck at time of report

6 errors, all expected and out of this agent's scope:
- `lib/embed-insert-control.tsx` × 4 — imports both this agent's moved `MediaPickerDialog`
  and agent B's moved `WidgetPickerDialog`. **Coordinator-owned; resolved in pass 4.**
- `components/__tests__/WidgetConfigFields.unit.test.tsx`,
  `WidgetPickerDialog.unit.test.tsx` × 2 — agent B's files, still in flight.

Agent did not `git add`/commit, and touched nothing outside its ownership list. Both
confirmed.
