# Terra job dedupe-04: Tovu admin + desktop: shared React pieces

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Tovu clone you are given.

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`. New functions take `(required: {...}, optional: {...} = {})`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job (decision, risk, expected saving, divergence, tests)
- **T03** EXTRACT SHARED HELPER — risk L; est. −88 lines; divergence: none (12 literals identical)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/observability src/features/plugins src/features/deployment
- **T05** MERGE INTO EXISTING — risk L; est. −20 lines; divergence: none (bodies identical; only doc wording differs)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/lib/__tests__/version-conflict.unit.test.ts src/features/pages/__tests__/rules.unit.test.ts src/features/posts/__tests__/rules.unit.test.ts
- **T06** MERGE INTO EXISTING — risk L; est. −14 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/pages/__tests__/rules.unit.test.ts src/features/posts/__tests__/rules.unit.test.ts
- **T07** EXTRACT SHARED HELPER — risk M; est. −40 lines; divergence: none today; posts/rules.ts:460-463 records a 2026-09-22 drift bug (posts label untranslated while pages translated) - the reason to merge
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/pages src/features/posts
- **T09** MERGE INTO EXISTING — risk L; est. −9 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/pages
- **T10** MERGE INTO EXISTING — risk L; est. −42 lines; divergence: none (byte-identical bodies incl. fallback + already-open guards)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/components/AssistantDock/__tests__/MessageOverflowModal.hooks.unit.test.tsx src/features/pages/__tests__/ThemePageDetailsModal.unit.test.tsx src/features/media
- **T12** EXTRACT SHARED HELPER — risk L; est. −14 lines; divergence: comment text only (static row has the full aria-label why; replaceable row points to it)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/security
- **T13** EXTRACT SHARED HELPER — risk L; est. −18 lines; divergence: none (step/type undefined renders no attribute)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/collections
- **T15** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: idPrefix, handle prefix, showRemoveButton, removeButtonLabel differ (parameterised)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/collections
- **T16** EXTRACT SHARED HELPER — risk M; est. −60 lines; divergence: copy, handles, labels, extra dependents <p> differ (parameterised); markup identical
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/plugins src/features/settings
- **T17** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/components/WidgetConfigFields
- **T18** EXTRACT SHARED HELPER — risk M; est. −45 lines; divergence: agent-plugins compares with ===; others with field equality (passed as same); port call shapes differ (adapted in wrappers)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/components/AssistantDock
- **T19** EXTRACT SHARED HELPER — risk L; est. −13 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2  src/features/deployment
- **T20** EXTRACT SHARED HELPER — risk L; est. −9 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/security
- **T21** EXTRACT SHARED HELPER — risk L; est. −16 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/menus
- **T22** EXTRACT SHARED HELPER — risk L; est. −22 lines; divergence: none
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/lib/__tests__/credential-submit-error.unit.test.ts src/features/deployment src/features/source-control
- **T23** EXTRACT SHARED HELPER — risk M; est. −35 lines; divergence: interval/limit constants and error message builders differ (parameters)
  - tests: cd apps/admin && npx vitest run --maxWorkers=2 src/features/deployment
- **T27** EXTRACT SHARED HELPER — risk L; est. −40 lines; divergence: none (all 5 frames identical attrs)
  - tests: cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 src/renderer/**/*icon*.test.ts* (run the renderer suite files that import icons/tool-icons)

## Recipes (exact before → after)

### T03: one `LINE_ICON` for the admin icon sets
1. Create `apps/admin/src/components/line-icon.ts`:
```ts
/** Shared attributes for a decorative line icon — the same 24px grid, 1.5 stroke, and round joins
 *  every `*-visuals.tsx` set in this admin uses, so every icon row reads as one family. */
export const LINE_ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
```
2. Apply these steps to each of the 12 files listed in the TSV row:
   - Delete the local `const LINE_ICON = {...} as const;` and its two-line doc comment.
   - Add `import { LINE_ICON } from "@/components/line-icon";`. If the file uses relative imports only, use the relative path instead.
3. Leave every icon body unchanged. Keep each file's `@file` header. If a header says "importing a glyph across a feature boundary…", append one sentence: "The shared stroke attributes come from `components/line-icon.ts`."

### T05: one version-conflict reader
1. Add to `apps/admin/src/lib/version-conflict.ts`:
   - The `SaveConflict` interface: take it from `features/posts/rules.ts`'s `PostSaveConflict`, field docs included.
   - This function:
```ts
export function readVersionConflict(
  required: { error: unknown; attemptedStatus: "draft" | "published" | undefined },
  _optional: Record<string, never> = {},
): SaveConflict | null {
  if (!isVersionConflict(required.error)) return null;
  const details = (required.error.body?.details ?? {}) as Record<string, unknown>;
  return {
    expectedVersion: typeof details.expectedVersion === "number" ? details.expectedVersion : null,
    currentVersion: typeof details.currentVersion === "number" ? details.currentVersion : null,
    attemptedStatus: required.attemptedStatus,
  };
}
```
   - Copy the "Classifies a caught save error…" doc block from `posts/rules.ts` above it.
2. In `features/pages/rules.ts`, replace `interface PageSaveConflict` and `readPageVersionConflict` with `export type PageSaveConflict = SaveConflict;`. Do the same in `posts/rules.ts`: `export type PostSaveConflict = SaveConflict;`. Import `type SaveConflict` from `../../lib/version-conflict`.
3. Update the callers:
   - `features/pages/hooks/use-page-editor.hooks.ts:612` becomes `readVersionConflict({ error: e, attemptedStatus })`.
   - `features/posts/hooks/use-post-editor.hooks.ts:1184` becomes `readVersionConflict({ error: e, attemptedStatus: statusOverride })`.
   - In both hooks, import it from `../../../lib/version-conflict` and drop the old import name.
4. Tests:
   - Move the `readPostVersionConflict` cases into `src/lib/__tests__/version-conflict.unit.test.ts` under `describe("readVersionConflict")`, calling it with an object.
   - Delete the duplicate `readPageVersionConflict` describe block from `pages/__tests__/rules.unit.test.ts`.
   - Remove the old names from both test import lists.
   - Fix the `{@link readPageVersionConflict}` and `{@link readPostVersionConflict}` mentions in `PostEditor.tsx:870`, `use-page-editor.hooks.ts:591` and the rules files so they point to `readVersionConflict`.

### T06: delete the dead autosave twins
- `pages/rules.ts` and `posts/rules.ts`: delete `isAutosaveDraftStale`, `pageAutosaveBannerMessage` and `postAutosaveBannerMessage`. Production calls `standingDraftRecoveryMessage` (`lib/standing-draft-recovery-message.ts`) instead.
- Delete the matching describe blocks and test imports in both `__tests__/rules.unit.test.ts` files.
- Doc links that name `{@link isAutosaveDraftStale}` (pages/rules.ts:407 and 438): change the text to "the no-cross-feature-import boundary (`lib/` hosts the shared pieces)".
- Drop `formatRelativeMinutesAgo` from the imports if it is now unused.

### T07: `lib/admin-post-list-sort.ts`
1. Create the file with:
   - `DEFAULT_ADMIN_POST_SORT: DataTableSortState = { column: "updated", direction: "desc" }`.
   - `compareAdminPostsByTitle`, `BySlug`, `ByStatus` and `ByUpdated` with the signature `(a: AdminPost, b: AdminPost) => number`. That is DataTable's compare contract, so these four are exempt from the object-arguments rule. Bodies are verbatim.
   - `columnSortLabel({ t, columnName, direction }: { t: Translate; columnName: string; direction: DataTableSortDirection | null }, _optional: Record<string, never> = {})` and `updatedColumnSortLabel({ t, direction }, _optional = {})`. Bodies are verbatim from pages/rules.ts.
2. Merge the doc comments from both files:
   - Keep the posts note on `comparePostsByUpdated` ("listPosts has no ORDER BY…").
   - Keep the posts note on the 2026-09-22 translation drift.
   - Add one line: "Shared by Pages.tsx and Posts.tsx (twin screens)".
3. Delete the pages/posts copies: `DEFAULT_PAGE_SORT`/`DEFAULT_POST_SORT`, `comparePagesBy*`/`comparePostsBy*`, `pageColumnSortLabel`/`postColumnSortLabel` and `updatedPageColumnSortLabel`/`updatedColumnSortLabel`. Move each file's column-sort section header comment into the new file.
4. In `Pages.tsx` and `Posts.tsx`, import from `../../lib/admin-post-list-sort` and switch the label calls to object arguments, for example `label: (direction) => updatedColumnSortLabel({ t, direction })`.
5. Point the rules tests at the new names, or move them to `src/lib/__tests__/admin-post-list-sort.unit.test.ts`.
6. i18n keys do not change, because `t` is still passed in.

### T09: `PageEditorPort` reuses `PagesPort`
- In `page-editor-port.hooks.ts`:
  - Change the declaration to `export interface PageEditorPort extends StandingDraftAutosavePort, Pick<PagesPort, "updatePost" | "deletePage"> {`.
  - Import `type PagesPort` from `./pages-port.hooks`.
  - Delete the `updatePost(...)` and `deletePage(...)` members.
- Move the `expectedVersion (2026-09-07)…` doc paragraph onto `PagesPort.updatePost`'s doc in `pages-port.hooks.ts`. Append it after the existing 2026-09-18 note.

### T10: use the Jini dialog open/close helpers
In each of these 3 files:
- `components/AssistantDock/MessageOverflowModal.hooks.tsx`
- `features/pages/ThemePageDetailsModal.hooks.tsx`
- `features/media/hooks/use-edit-media-modal.hooks.ts`

do the following:
- Delete the local `openDialog` and `closeDialog`.
- Add `import { openLightboxDialog, closeLightboxDialog } from "@jini-ai/ui/admin-widgets";`.
- Replace the calls: `openDialog(dialog)` becomes `openLightboxDialog(dialog)`, and `closeDialog(dialog)` becomes `closeLightboxDialog(dialog)`.

### T12: `OtherCredentialRemoveButton` (file-private)
1. In `features/security/OtherCredentialsSection.tsx`, add this component:
```tsx
function OtherCredentialRemoveButton({ row, translate, dialogRef }: { row: OtherCredentialRowState; translate: Translate; dialogRef: RefObject<HTMLDialogElement | null> }) {
  return (
    <>
      <button
        type="button"
        className="btn-danger"
        onClick={() => dialogRef.current?.showModal()}
        // (move the full aria-label why-comment from OtherCredentialStaticRow here, verbatim)
        aria-label={`${translate(REMOVE_FROM_TOVU)} — ${row.name}`}
        {...agentHandle({ handle: `security-other-credentials-remove-${rowHandleBase({ row })}` }, { role: "button", label: `Remove ${row.name} from Tovu` })}
      >
        {translate(REMOVE_FROM_TOVU)}
      </button>
      {row.error ? (
        <p className="save-error" role="alert">
          {row.error}
        </p>
      ) : null}
    </>
  );
}
```
2. In both rows, replace the button and the `row.error` block with `<OtherCredentialRemoveButton row={row} translate={translate} dialogRef={dialogRef} />`. Delete the replaceable row's "Same multi-item-per-store ambiguity…" comment, because the full comment now lives in the helper.
3. Add `type RefObject` to the react import.

### T13: CollectionEntryEditor control factories
```tsx
function makeNumberFieldControl(required: { step: string | undefined }) {
  return function NumberFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
    return (
      <input
        id={inputId}
        type="number"
        step={required.step}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        {...agentHandleProps}
      />
    );
  };
}
function makeStringFieldControl(required: { type: "datetime-local" | undefined }) {
  return function StringFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
    return (
      <input
        id={inputId}
        type={required.type}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        {...agentHandleProps}
      />
    );
  };
}
const TextFieldControl = makeStringFieldControl({ type: undefined });
const DatetimeFieldControl = makeStringFieldControl({ type: "datetime-local" });
const IntegerFieldControl = makeNumberFieldControl({ step: "1" });
const RealFieldControl = makeNumberFieldControl({ step: undefined });
```
- Delete the four old functions.
- `FIELD_CONTROLS` stays as it is.
- Keep the `relation` reuse comment.

### T15: `ContentTypeFieldsSection` (file-private, Collections.tsx)
1. Props: `{ fields: DraftField[]; fieldHandles: string[]; idPrefix: string; handlePrefix: "new-content-type" | "edit-fields"; showRemoveButton: boolean; removeButtonLabel: string; updateField; removeField; addField; error: string | null; t: Translate }`.
2. It renders, verbatim:
   - the `<div>` holding the `h3` "Fields" heading;
   - the `fields.map(<ContentTypeFieldFieldset …/>)`;
   - the Add field button, with `handle: `${handlePrefix}-add-field``;
   - the `{error ? <span className="save-error" role="alert">…}` block.
3. Replace each dialog's matching block:
   - New dialog: `idPrefix="ct-field"`, `showRemoveButton={fields.length > 1}`, its remove label.
   - Edit dialog: `idPrefix="ct-edit-field"`, `showRemoveButton={true}`, its remove label.
4. The Add-field agent label text is identical in both dialogs ("Add another field to this content type"), so keep it as a constant inside the helper.

### T16: `ConfirmActionDialog` + `useEscapeCancelFocusTrap`
1. Add to `apps/admin/src/hooks/use-focus-trap.hooks.ts`:
```ts
export function useEscapeCancelFocusTrap(
  required: { onCancel: () => void },
  _optional: Record<string, never> = {},
): RefObject<HTMLDivElement | null> {
  const { onCancel } = required;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  return dialogRef;
}
```
2. In the 3 hooks (`use-plugin-remove-confirm`, `use-agent-plugin-disable-confirm`, `use-external-mcp-remove-confirm`), replace the ref, focus-trap and effect lines with `const dialogRef = useEscapeCancelFocusTrap({ onCancel: props.onCancel });`. Keep the copy builders.
3. Create `apps/admin/src/components/ConfirmActionDialog.tsx`.
   - Props: `{ dialogRef; titleId; title: string; body: string; extra?: string | null; onCancel; onConfirm; cancelText: string; confirmText: string; cancelHandle: string; cancelAgentLabel: string; confirmHandle: string; confirmAgentLabel: string }`.
   - It renders the exact markup shared by the three dialogs: backdrop div, then the dialog div with role, aria and stopPropagation, then h2, then p, then `{extra ? <p>{extra}</p> : null}`, then the `editor-actions` span holding Cancel (`btn-secondary autoFocus`) and Confirm (`btn-danger`).
4. Each of the 3 dialogs renders `<ConfirmActionDialog …/>` with its current strings and handles.
   - Only AgentPluginDisable passes `extra={copy.dependents}`.
   - Move each dialog's "Cancel is the default-focused control…" comment to just above its `<ConfirmActionDialog` call.

### T17: WidgetConfigFields
1. Add `type FetchedConfigFieldsProps = { config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void; agentHandle?: string; t: Translate } & FetchedOptionsSeam;`.
2. Use it as the parameter type of `RecentEntriesConfigFields`, `MenuConfigFields` and `ContactFormConfigFields`.
3. In the dispatcher, replace the three case arms with this:
```tsx
case "recent-entries":
case "menu":
case "contact-form": {
  const Editor = FETCHED_CONFIG_EDITORS[props.widgetType];
  return <Editor config={props.config} onChange={props.onChange} agentHandle={props.agentHandle} useFetchedOptions={props.useFetchedOptions} t={t} />;
}
```
   - Define it as `const FETCHED_CONFIG_EDITORS = { "recent-entries": RecentEntriesConfigFields, menu: MenuConfigFields, "contact-form": ContactFormConfigFields } as const;`.
   - Place that constant after the three functions.

### T18: `useOptimisticStoredValue`
1. Create `components/AssistantDock/hooks/use-optimistic-stored-value.hooks.ts` with the signature in the TSV.
   - The body is the state machine from `use-chat-display-preferences.hooks.ts`, generalized:
     - `useFetchQuery({ key, fetch: load }, { staleTime: 0 })` and `useInvalidate`;
     - optimistic state, `saveFailed`, the `lastRequested` and `pendingSaves` refs;
     - `value = optimistic ?? query.data ?? fallback`;
     - a subscribe effect that invalidates the key;
     - a drop effect: `pendingSaves.current === 0 && optimistic !== null && query.data !== undefined && same(optimistic, query.data)`;
     - `update(compute)`: `previous = lastRequested.current ?? value; next = compute(previous)`, then save with the same then/catch bookkeeping.
   - Wrap `load`, `save` and `subscribe` in refs, so that callers' inline lambdas do not re-run the effects. The subscribe effect depends on `[invalidate]` plus a `subscribeRef`.
   - Keep the three "A quick second flip must diff against the last requested…" comments as one comment on `update`.
2. Rewrite each wrapper, keeping its exported name, port and controller types:
   - Runtime preferences: `useOptimisticStoredValue({ queryKey: QUERY_KEY, load: () => port.load({}, {}), save: (next, previous) => port.save({ next, previous }, {}), subscribe: (listener) => port.subscribe({ listener }, {}), fallback: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, same: sameRuntimePreferences })`. Return `{ preferences: value, update: (patch) => update((prev) => ({ ...prev, ...patch })), saveFailed }`.
   - Agent plugins: `same: (a, b) => a === b`. Return `update: (mode) => update(() => mode)`.
   - Display preferences: `load: () => port.load()`, `save: (n, p) => port.save(n, p)`, `subscribe: (l) => port.subscribeToSettingsRefresh(l)`, `same: (a, b) => sameChatDisplay({ a, b })`.

### T19, T20, T21: type-only extractions
- T19, in `DockerfileTab.tsx`:
  - Add `interface DockerfileEditorState { draft; setDraft; isDirty; saving; saveError; saveConflict; saved; copied; onCopy; onSave; onReloadAfterConflict; t }`, using the exact field types from line 219.
  - Type `DockerfileEditorCard`'s props as `DockerfileEditorState & { exists: boolean }`.
  - Type `dockerfileTabBody`'s `editor` parameter as `DockerfileEditorState`.
- T20, in `use-access-tokens.hooks.ts`:
  - Add `export interface AccessTokenFormFields { readonly name; token; values; username; worksFor; readyToSave; saving; error }`. Move the per-field docs onto it.
  - Change the declarations to `AccessTokenExistingRowState extends AccessTokenFormFields { readonly row: AccessTokenRow }` and `AccessTokenAddFormState extends AccessTokenFormFields { readonly visible: boolean }`.
  - Check any other fields in the add-form state with `tsc` and keep them.
- T21, in `MenuEditor.tsx`:
  - Add `interface MenuItemFieldProps { item: AdminMenuItem; path: number[]; onChange: (path: number[], fn: (item: AdminMenuItem) => AdminMenuItem) => void; t: Translate }`.
  - Use it in the 3 components that repeat the inline type.

### T22: `lib/credential-submit-error.ts`
1. Create the file with:
   - `export type CredentialSubmitFailure = { kind: "duplicate-label" } | { kind: "validation"; detail: string } | { kind: "generic" };`
   - `classifyCredentialSubmitError({ error }: { error: unknown }, _optional: Record<string, never> = {})`, whose body is deployment/rules.ts:130-137 with `e` renamed to `error`. It imports `ApiError` from `./api`.
2. Move the doc block from deployment/rules.ts:118-128 to the new function. Append the source-control note: "source-control's backend slice follows the same 409/400 contract".
3. In both rules files:
   - Delete the type and the function.
   - Keep feature aliases: `export type PublishCredentialSubmitFailure = CredentialSubmitFailure;` and `export type SourceControlCredentialSubmitFailure = CredentialSubmitFailure;`. The i18n files reference these names.
4. The hooks `use-publish-credentials.hooks.ts:241` and `use-source-control-credentials.hooks.ts:105` call `classifyCredentialSubmitError({ error: err })`.
5. Move both describe blocks into `src/lib/__tests__/credential-submit-error.unit.test.ts`, keeping the union of cases.
6. Update the `{@link}` mentions in `deployment-i18n.tsx:2526` and `source-control-i18n.ts:591`.

### T23: `useBoundedStatusPoll`
1. Create `features/deployment/hooks/use-bounded-status-poll.hooks.ts` with the TSV signature.
   - Internals:
     - `failuresRef = useRef(0)`;
     - `inputsRef = useRef(required); inputsRef.current = required;`;
     - an effect keyed on `[required.active]` holding the exact loop from `use-static-export.hooks.ts:166-202`;
     - read `fetchStatus`, `onStatus`, `onGiveUp`, `intervalMs` and `failureLimit` from `inputsRef.current` at effect start;
     - on success, `failuresRef.current = 0; onStatus(status); if (status.status === "running") scheduleNext();`;
     - on reaching the limit, `onGiveUp(err); return;`.
   - Return `{ resetFailures: () => { failuresRef.current = 0; } }`.
   - Move these comments into the new file verbatim: "Counts CONSECUTIVE poll failures…", the "Poll loop: re-armed only when…" paragraph, and the C2 "Bounded" comment.
2. Export hook: delete `pollFailuresRef`, `pollInputs` and the effect, then:
```ts
const { resetFailures } = useBoundedStatusPoll({ active: isRunning, intervalMs: EXPORT_POLL_INTERVAL_MS, failureLimit: POLL_FAILURE_LIMIT, fetchStatus: () => port.getSiteExportStatus(), onStatus: setRun, onGiveUp: (err) => setPollError(exportPollErrorMessage(locale, describeApiError(err, "unknown error"))) });
```
   Line 221 `pollFailuresRef.current = 0` becomes `resetFailures()`.
3. Publish hook: the same, with `PUBLISH_POLL_INTERVAL_MS`, `PUBLISH_POLL_FAILURE_LIMIT`, `getPublishStatus`, `publishPollErrorMessage` and `UNKNOWN_ERROR`. Line 330 becomes `resetFailures()`.

### T27: desktop `IconFrame`
1. Create `apps/desktop/src/renderer/icon-frame.tsx`. It must not contain module-level JSX:
```tsx
import type { JSX, ReactNode } from 'react';

/** The shared 20-unit line-icon frame for `icons.tsx` and `tool-icons.tsx`. Its own module, with JSX
 *  only at render: `tool-icons.tsx` must not import `icons.tsx`, whose module-level glyph tables run
 *  before tests publish the classic-JSX `React` global (see `tool-icons.tsx`'s header). */
export function IconFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
```
2. Replace the svg wrapper in each of `SectionIcon`, `GearIcon`, `NavIcon`, `MenuIcon` and `ToolIcon` with `<IconFrame>…</IconFrame>`.
   - Keep GearIcon's "Teeth first…" JSX comment inside it.
   - Import with `import { IconFrame } from './icon-frame.js';`.
3. Check whether `icons.tsx` and `tool-icons.tsx` use the classic `React` global (look at their current imports) and mirror that convention.
