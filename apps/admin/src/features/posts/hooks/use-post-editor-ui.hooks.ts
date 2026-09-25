/**
 * @file The post/page editor's UI-interaction layer — every onClick/onChange handler `PostEditor.tsx`
 * wires to a button or control, split out of that component per the owner's explicit direction
 * (2026-08-20, `PostEditor.tsx` complexity-ceiling pass): a hook that owns the presentational/
 * interaction concerns, consumed by {@link usePostEditor} (`use-post-editor.hooks.ts`) alongside the
 * data/state it wraps, so `PostEditor.tsx` reads a bound handler off the controller instead of
 * building an inline arrow function in JSX.
 *
 * This is explicitly NOT a complexity-ceiling fix on its own — the inline arrows it replaces
 * (`() => save("published")`, `() => setConfirmingDelete(true)`, …) were already their own
 * separately-scored functions at near-zero complexity, not contributors to `PostEditor`'s own
 * cyc/cog score. `PostEditor`'s actual complexity comes entirely from JSX conditional rendering
 * directly in its own function body (ternaries/`&&` chains), which top-level render-function
 * extraction fixes instead — see `PostEditorToolbarEnd`/`PostEditorSlugCollisionWarning`/
 * `PostEditorBody`/`PostEditorTemplateModal` in `PostEditor.tsx`. This hook is the owner's requested
 * architecture (interaction concerns get their own seam), reported separately from that fix.
 *
 * Deliberately limited to handlers with no existing test coverage asserting a raw setter's own call
 * identity (`ctrl.setConfirmingDelete`/`ctrl.setShowTemplateModal`/`ctrl.save`/`ctrl.remove` are
 * asserted nowhere directly) — `setStatus`/`setTemplateChoice`/`setView`/`setOverridesThemePage`
 * stay wired directly from `PostEditor.tsx`'s extracted render functions, since
 * `PostEditor.unit.test.tsx`'s DI-seam suite (`postController`) asserts three of those by mock
 * identity (`ctrl.setView`/`ctrl.setOverridesThemePage`) and rerouting them through this hook would
 * require the test fixture to re-derive the exact same wiring a second time for no behavioral gain.
 */
export interface PostEditorUiDependencies {
  save: (statusOverride?: "draft" | "published") => Promise<void>;
  setConfirmingDelete: (open: boolean) => void;
  setShowTemplateModal: (open: boolean) => void;
}

export interface PostEditorUiController {
  /** `PostEditorHeader`'s Publish button — saves and sets status to `"published"` in one action. */
  onPublish: () => void;
  /** `PostEditorHeader`'s Save button — saves whatever `status` is currently set to. */
  onSave: () => void;
  /** `PostEditorHeader`'s Delete button — opens the `ConfirmDialog`, doesn't delete anything yet. */
  onDeleteClick: () => void;
  /** `ConfirmDialog`'s cancel action for the delete confirmation. */
  onDeleteCancel: () => void;
  /** The template picker's "View Template" button — opens the read-only `TemplateSourceModal`. */
  onViewTemplateClick: () => void;
  /** `TemplateSourceModal`'s own close action. */
  onCloseTemplateModal: () => void;
}

/**
 * Builds every bound interaction handler `PostEditor.tsx` needs from the raw `save`/state-setter
 * primitives {@link usePostEditor} already owns — a thin wiring layer, not new logic: each handler is
 * exactly the one-line closure that used to sit inline in `PostEditor.tsx`'s JSX, just given a name
 * and a home outside the component's own render body.
 *
 * @complexity Time/space: O(1) — six closures, no branching, no iteration.
 */
export function usePostEditorUi(deps: PostEditorUiDependencies): PostEditorUiController {
  const { save, setConfirmingDelete, setShowTemplateModal } = deps;
  return {
    // `() => save("published")`/`() => save()` — same unawaited-Promise shape `PostEditor.tsx`'s
    // inline arrows already had (`save`'s own errors are caught and surfaced via `setError` inside
    // `usePostEditor`, so nothing here needs to observe the returned promise).
    onPublish: () => save("published"),
    onSave: () => save(),
    onDeleteClick: () => setConfirmingDelete(true),
    onDeleteCancel: () => setConfirmingDelete(false),
    onViewTemplateClick: () => setShowTemplateModal(true),
    onCloseTemplateModal: () => setShowTemplateModal(false),
  };
}
