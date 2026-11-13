# Terra job dedupe-06: Jini chat + ui

READY (2026-11-13). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

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
- **J01** EXTRACT SHARED HELPER — risk L; est. −90 lines; divergence: none (Glob/Grep/Web cards already render class "op-title" with no shimmer = shimmer:false)
  - tests: cd packages/chat && npx vitest run --maxWorkers=2 src/react/components/__tests__/ToolCard.test.tsx src/react/components/__tests__/ToolCard.long-chat-memory.test.tsx src/react/components/__tests__/ToolCard.cli-events.test.tsx
- **J02** MERGE INTO EXISTING — risk M; est. −100 lines; divergence: YES: (1) placeholder quotes curly “x” (chat) vs straight "x" (ui) - survivor keeps ui straight quotes, update chat test regexes; (2) chat passes onRowClick to every registry component, ui maps provider action props (shadcn.button->onPress etc) - survivor keeps ui map (fix); (3) chat resolveText uses DynamicValueSchema.parse, ui uses an `as` cast - survivor uses parse (no cast rule); (4) ui unrenderable placeholder carries data-a2ui-component-id - keep
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/a2ui/__tests__/renderer.test.tsx src/features/a2ui/__tests__/renderer-characterization.test.tsx src/features/a2ui/__tests__/provider-actions.integration.test.tsx ; cd packages/chat && npx vitest run --maxWorkers=2 src/react/components/__tests__/A2uiSurfaceCard.test.tsx src/react/components/__tests__/A2uiSurfaceCard.registry.test.tsx src/react/components/__tests__/A2uiSurfaceCard.delivery.test.tsx
- **J07** MERGE INTO EXISTING — risk L; est. −48 lines; divergence: none (shapes verbatim; only a doc sentence differs)
  - tests: cd packages/chat && npx vitest run --maxWorkers=2 src/core/util/__tests__/manifest.test.ts
- **J28** EXTRACT SHARED HELPER — risk L; est. −7 lines; divergence: none; the two I18n contexts stay separate (merging would change which provider translates renderer strings - owner decision, not done)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/i18n/__tests__/context.test.tsx src/renderers/react/__tests__/i18n.test.tsx
- **J34** MERGE INTO EXISTING — risk L; est. −27 lines; divergence: none (types only)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/resource-dashboard
- **J35** EXTRACT SHARED HELPER — risk L; est. −14 lines; divergence: none; also deletes 4 eslint-disable lines
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/resource-dashboard/react/hooks
- **J39** EXTRACT SHARED HELPER — risk L; est. −10 lines; divergence: none. #65 #230 KEEP: dismiss/focus effects differ on purpose (picker keeps .jini-select-menu exception + deferred focus; drop-up has no focus restore)
  - tests: cd packages/chat && npx vitest run --maxWorkers=2 src/react/features/chat-pane/hooks
- **J43** EXTRACT SHARED HELPER — risk L; est. −16 lines; divergence: none (absent props instead of explicit undefined = same DOM)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/interactive-ui/providers
- **J48** MERGE INTO EXISTING — risk M; est. −40 lines; divergence: YES (not owner-blocking): survivor listens to pointerdown, the copies to mousedown, so tests switch fireEvent.mouseDown -> pointerDown. With a null ref the survivor closes; the copies documented "never counts as outside" (unreachable while the menu is rendered). Survivor behavior kept
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/react/__tests__/components/HeaderActionsMenu.test.tsx src/react/__tests__/components/LanguageMenu.test.tsx src/react/__tests__/components/PaletteTweaks.test.tsx
- **J50** EXTRACT SHARED HELPER — risk L; est. −8 lines; divergence: none
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/react/__tests__/components/BrandLogo.test.tsx
- **J51** EXTRACT SHARED HELPER — risk L; est. −15 lines; divergence: none
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/connectors src/features/skills src/features/resource-dashboard
- **J59** EXTRACT SHARED HELPER — risk L; est. −20 lines; divergence: public kind type widens from SourceActionKind to string (backward compatible)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/resource-dashboard src/features/source-config-list
- **JR03** MERGE INTO EXISTING — risk L; est. −28 lines; divergence: none (inline copies are the same identity-preserving delete)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/connectors/__tests__/hooks/useConnectorAuthorization.test.ts src/features/connectors/__tests__/hooks/useConnectorAuthorization.stale-race.test.ts src/features/connectors/__tests__/hooks/useConnectorDetail.test.ts src/features/connectors/__tests__/rules.test.ts src/features/memory/__tests__/react/hooks/useMemoryConnectors.rules.test.ts src/features/memory/__tests__/react/hooks/useMemoryConnectors.test.tsx
- **JR04** EXTRACT SHARED HELPER — risk L; est. −16 lines; divergence: none
  - tests: same as JR03
- **JR05** EXTRACT SHARED HELPER — risk L; est. −24 lines; divergence: arrow keys: preventDefault now runs after the caret move instead of before (same synchronous handler; not observable)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/lexical-rich-text-editor/react/hooks/useMentionAtomicNavigation.test.ts src/features/lexical-rich-text-editor/react/components/RichTextInput.test.tsx

## Recipes (exact before → after)

## J01 ToolCard family cards (EXTRACT, chat)
File: packages/chat/src/react/components/ToolCard.tsx. Add, above SearchToolsCard:
```tsx
/** The row every simple family card shares: status badge, a title (shimmering while the call runs when `shimmer`), optional meta, then the full call detail. */
function FamilyCard({ call, className, title, meta, shimmer = false, after, detailInput, children }: {
  call: CardProps; className: string; title: string; meta?: ReactNode; shimmer?: boolean; after?: ReactNode; detailInput?: unknown; children?: ReactNode;
}) {
  const isRunning = shimmer && call.runStreaming && !call.result;
  return (
    <ExpandableCard className={className} call={call} after={after} head={
      <>
        <ResultBadge result={call.result} runStreaming={call.runStreaming} runSucceeded={call.runSucceeded} />
        <span className={`op-title${isRunning ? RUNNING_TITLE_CLASS : ''}`}>{title}</span>
        {meta}
      </>
    }>
      {children}
      <ToolCallDetail input={detailInput ?? call.input} result={call.result} runStreaming={call.runStreaming} runSucceeded={call.runSucceeded} />
    </ExpandableCard>
  );
}
```
Replace bodies (keep each function's signature, `const t = useT()`, and its `obj` cast line; `const call = { input, result, runStreaming, runSucceeded };`):
- SearchToolsCard: `<FamilyCard call={call} className="op-jini-tool" shimmer title={t('Search tools')} meta={obj.query ? <span className="op-meta">{obj.query}</span> : null} after={<FileErrorDetail result={result} />} />`
- DescribeToolCard: same with `t('Describe tool')`, meta from `obj.id`.
- FileWriteCard / FileEditCard / FileReadCard: keep `file`, `baseName` (and their "See OpenInTabButton's baseName comment" lines), `lines`/`editCount`; render `<FamilyCard call={call} className="op-file" shimmer title={t('Write'|'Edit'|'Read')} meta={<span className="op-meta">…existing meta children…</span>} after={<FileErrorDetail result={result} />}><div className="op-card-detail op-card-file-detail"><code className="op-path">{file}</code><OpenInTabButton filePath={file} ctx={ctx} /></div></FamilyCard>`.
- BashCard: `<FamilyCard call={call} className="op-bash" shimmer title={t('Bash')} meta={desc ? <span className="op-meta op-desc">{desc}</span> : null} detailInput={command} />` (no `after`).
- GlobCard / GrepCard: className "op-search", no shimmer, no after, meta = the existing `<span className="op-meta">…</span>`.
- WebFetchCard / WebSearchCard: className "op-web", same shape.
Delete each card's now-unused `isRunning`. DelegatedToolCard and GenericCard stay (they use ToolRowHead).

## J02 A2UI node renderer (MERGE, ui survivor)
1. packages/ui/src/features/a2ui/renderer.tsx: rename `RenderNode` -> `A2uiComponentNode`, `export` it and `export type A2uiComponentNodeProps = NodeProps`. Change `NodeProps.registry` and `renderRegistryComponent`'s `registry` to `Pick<InteractiveUiRegistry, 'resolveById'>`. In `resolveText` replace the `as Parameters<...>` cast with `DynamicValueSchema.parse(value)` (import it from './protocol.js'; add `DynamicValueSchema` to protocol.ts re-export list from '@jini-ai/agentic/a2ui' if missing) and MOVE chat's comment "Text props already passed the catalog schema. Parsing preserves that wire type…" above it. MOVE chat's why-comments for Text variant ("`variant` is always populated…"), Button variant ("Always populated…") and Card ("A single-child wrapper…" minus the self-reference) onto the same cases here.
2. packages/ui/src/features/a2ui/index.ts: add `export { A2uiComponentNode, type A2uiComponentNodeProps } from './renderer.js';`.
3. packages/chat/src/react/components/A2uiSurfaceCard.tsx: delete `function RenderComponent` (lines ~58-185) and render `<A2uiComponentNode interpreter=… surfaceId=… componentId=… ancestors={new Set()} onAction=… registry=… />` where RenderComponent was used; import from '@jini-ai/ui/a2ui'. Drop the now-unused `DynamicValueSchema`/`ReactNode` imports if unused. Keep the module doc but change "this renderer has React cases…" to "renders through `@jini-ai/ui/a2ui`'s `A2uiComponentNode`".
4. Tests: update chat expectations from curly to straight quotes: A2uiSurfaceCard.test.tsx lines ~339, ~363 and A2uiSurfaceCard.registry.test.tsx lines ~27, ~32 (`“x”` -> `"x"`).

## J07 artifact manifest types (MERGE)
packages/chat/src/core/util/types.ts: replace whole body with `export type { ArtifactKind, ArtifactRendererId, ArtifactExportKind, ArtifactStatus, ArtifactManifest } from '@jini-ai/ui/renderers';` plus a one-line doc "Owned by `@jini-ai/ui/renderers`; re-exported for chat's existing importers." In ui/src/renderers/types.ts replace "keep the two in sync by hand if that shape changes" with "`@jini-ai/chat` re-exports these; this is the only copy."

## J28 interpolate (EXTRACT, ui)
New ui/src/features/i18n/interpolate.ts with `interpolateTranslation({ template }, { vars } = {})` (body of context.tsx#interpolate). Both context.tsx and renderers/react/i18n.tsx import it and delete their `interpolate`.

## J34 ResourceBoardView props (MERGE, ui)
ResourceBoardView.tsx: change `export interface ResourceBoardViewProps<TBody = unknown> {` to `export interface ResourceBoardViewProps<TBody = unknown> extends Omit<ResourceBoardToolbarProps, 'selectedCount'> {`. Add `type ResourceBoardToolbarProps` to the existing `./ResourceBoardToolbar.js` import. Delete the props that the toolbar declares (sortOptions … cancelSelectLabel, createLabel, onCreate) but KEEP `selected: ReadonlySet<string>;` in its current position. The `enableBulkDelete` doc now comes from the toolbar.

## J35 useLoadedList (EXTRACT, ui)
New file `react/hooks/useLoadedList.ts`:
```ts
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

const LOAD_FAILED_MESSAGE = 'Failed to load items.';

/** Loads a list through `load`, re-fetching when `load` or `refreshToken` changes; a failure shows one fixed message, never the raw error. */
export function useLoadedList<T>(
  { load, refreshToken }: { load: () => Promise<T[]>; refreshToken?: string | number | undefined },
  _optional: Record<string, never> = {},
): { items: T[]; setItems: Dispatch<SetStateAction<T[]>>; loading: boolean; error: string | null; reload: () => Promise<void> } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await load());
      setError(null);
    } catch {
      setError(LOAD_FAILED_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => { void reload(); }, [reload, refreshToken]);
  return { items, setItems, loading, error, reload };
}
```
useResourceBoard.ts: delete the `items`/`loading`/`error` useState lines, the `reload` useCallback, its effect (with both eslint-disable lines), and `LOAD_FAILED_MESSAGE`. Insert `const load = useCallback(() => port.fetchItems(), [port]); const { items, setItems, loading, error, reload } = useLoadedList<TItem>({ load, refreshToken });`. useResourceRowList.ts: do the same with `port.fetchRows()` and `const { items: rows, loading, error, reload } = useLoadedList<TRow>(...)`. MOVE the `refreshToken` doc from UseResourceBoardParams unchanged (it stays where it is).

## J39 composer anchored position (EXTRACT, chat)
New `hooks/useComposerAnchoredPosition.hooks.ts` holds the position effect. Copy the body verbatim from useRuntimeDropUp, MOVE the "Capture phase: a scroll inside any ancestor…" comment into it, and own the `useState<CSSProperties>()`. `update` computes `rect`/`bounds` exactly as now and calls `setPosition(place({ trigger: rect }, bounds ? { bounds } : {}))`. The effect deps are `[open, place, triggerRef]`. Picker: `const place = useCallback(({ trigger }: { trigger: DOMRect }, { bounds }: { bounds?: DOMRect } = {}) => runtimePopoverPosition({ trigger, placement }, bounds ? { bounds } : {}), [placement]); const position = useComposerAnchoredPosition({ open, triggerRef, place });`. Delete its `position` state and effect. Drop-up: the same with `runtimeDropUpPosition({ trigger, width }, …)` and deps `[width]`.

## J43 clickable table rows (EXTRACT, ui)
New `features/interactive-ui/table-row-activation.ts`:
```ts
import type { KeyboardEvent } from 'react';
export type DataTableRowClick = (row: Record<string, unknown>, index: number) => void;
/** Props that make a table row act as a button when the host wires `onRowClick`. Enter/Space fire only for the row itself, never for a control inside it. */
export function clickableRowProps(
  { row, index }: { row: Record<string, unknown>; index: number },
  { onRowClick }: { onRowClick?: DataTableRowClick | undefined } = {},
): { onClick?: () => void; role?: 'button'; tabIndex?: number; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void } {
  if (!onRowClick) return {};
  return {
    onClick: () => onRowClick(row, index), role: 'button', tabIndex: 0,
    onKeyDown: (event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick(row, index); } },
  };
}
```
In both data-table.tsx files, replace the four row attributes with `{...clickableRowProps({ row, index }, { onRowClick })}`. Their `onRowClick` prop type becomes `DataTableRowClick` (the doc stays).

## J48 menu dismiss hooks (MERGE into useDismissOnOutsideOrEscape)
HeaderActionsMenu.tsx: `useHeaderActionsMenuDismiss(params)` body becomes `useDismissOnOutsideOrEscape({ onDismiss: params.onDismiss }, { enabled: params.open, containerRef: params.containerRef });`. Keep its exported name and signature (it is public through `export *`), and import from '../../browser/index.js'. Do the same for LanguageMenu `useLanguageMenuDismiss` and PaletteTweaks `usePaletteDismiss` (keep its rootRef creation and return). Delete `isOutsideHeaderMenu`, `isHeaderMenuDismissKey`, `isOutsideLanguageMenu` and `isLanguageMenuDismissKey`, but first confirm that `rg -n "isOutside(Header|Language)Menu|is(Header|Language)MenuDismissKey" /Users/la/Programming/Tovu/apps /Users/la/Programming/Tovu/sites -g '!node_modules'` finds nothing. Update the two test files: remove the predicate tests and use `fireEvent.pointerDown` for outside clicks.

## J50 BrandLogo (EXTRACT type)
`export interface ResolveLogoSrcOptions { stage: LogoStage; brandId?: string | undefined; resolveBrandLogoUrl?: ((brandId: string) => string) | undefined; logoSrc?: string | null | undefined; host?: string | undefined; faviconSize: number; resolveFaviconUrl: (host: string, size: number) => string; }`. Use it in `resolveLogoSrc(opts: ResolveLogoSrcOptions)` and `useResolvedLogoSrc(opts: ResolveLogoSrcOptions)`.

## J51 fake latency (EXTRACT, ui)
New `ui/src/utils/fake-latency.ts`:
```ts
/** The simulated-latency resolver every in-memory feature port double uses: 0 (default) resolves on the next microtask, otherwise after `latencyMs`. */
export function fakeLatencyDelay(_required: Record<string, never>, { latencyMs = 0 }: { latencyMs?: number | undefined } = {}): <T>(value: T) => Promise<T> {
  return <T>(value: T): Promise<T> => latencyMs > 0 ? new Promise((resolve) => setTimeout(() => resolve(value), latencyMs)) : Promise.resolve(value);
}
```
In the 11 sites (`rg -n "latencyMs > 0 \? new Promise" packages/ui/src`), replace the `const delay = …` two lines with `const delay = fakeLatencyDelay({}, { latencyMs });`. Keep `const latencyMs = options.latencyMs ?? 0;` only where something else (delayedRejection) still uses it; otherwise inline `options.latencyMs`.

## J59 pending-action helpers (EXTRACT to ui/utils)
New `ui/src/utils/pending-actions.ts` holds the four resource-dashboard functions verbatim (kind: string) plus their docs, with the "re-derived fresh here (deliberately not imported cross-feature…)" clause rewritten to "shared by every feature that tracks per-item in-flight actions". source-config-list/rules.ts replaces its four functions with `export { pendingActionKey, isActionPending, withPendingAction, withoutPendingAction } from '../../utils/pending-actions.js';`, which keeps the public barrel unchanged. resource-dashboard/rules.ts does the same (not public). Update the resource-dashboard/index.ts comment: there is now one copy, re-exported through source-config-list.

## JR03 withoutKey -> connectors/rules.ts (MERGE)
1. MOVE `withoutKey` (with its doc) from `ui/src/features/connectors/hooks/useConnectorAuthorization.ts` to `ui/src/features/connectors/rules.ts`. In useConnectorAuthorization.ts add `withoutKey` to its `../rules.js` import and add `export { withoutKey } from '../rules.js';` (its test imports it from the hook file).
2. useConnectorAuthorization.ts: each `setCancelFailed((curr) => { if (curr[connectorId] === undefined) return curr; const next = { ...curr }; delete next[connectorId]; return next; });` and the same `setAuthError` shape becomes `setX((curr) => withoutKey(curr, connectorId));` (4 sites: cancel success ~222, sweep ~250, cancel ~323/~329). Keep the stale-race comment block (~245-248) and the "This clear's `curr[connectorId] !== undefined` guard is …" comment directly above their calls.
3. useConnectorDetail.ts: the 2 `setFailedIds` copies become `setFailedIds((curr) => withoutKey(curr, connectorId));`; add `withoutKey` to its `../rules.js` import.
4. `ui/src/features/memory/react/hooks/useMemoryConnectors.rules.ts`: delete the `withoutKey` body; add `import { withoutKey } from '../../../connectors/rules.js';` and `export { withoutKey } from '../../../connectors/rules.js';`. Reword its doc to: "Shared with `features/connectors/rules.ts` (one copy): this slice already imports connector reducers from there, per `../../rules.ts`'s header." OWNER DECISION: this replaces the old "intentionally duplicated per slice" reason, which the slice header contradicts.

## JR04 withoutConnectedEntries (EXTRACT, ui/connectors/rules.ts)
```ts
/** Drops every entry whose connector is now `connected`. Returns `record` itself when nothing
 *  changed, so a React state update can bail out. @complexity O(s) in the status map. */
export function withoutConnectedEntries<T>({ record, statuses }: { record: Record<string, T>; statuses: ConnectorStatusMap }, _optional: Record<string, never> = {}): Record<string, T> {
  let mutated = false;
  const next = { ...record };
  for (const [connectorId, status] of Object.entries(statuses)) {
    if (status.status === 'connected' && next[connectorId] !== undefined) {
      delete next[connectorId];
      mutated = true;
    }
  }
  return mutated ? next : record;
}
```
`clearConnectorAuthorizationErrorsForConnected` body -> `return withoutConnectedEntries({ record: errors, statuses });`; `clearConnectorAuthorizationCancelFailuresForConnected` body -> `return withoutConnectedEntries({ record: failures, statuses });` (both keep their exported names/signatures). useMemoryConnectors.hooks.ts: `setConnectorConnectErrors((prev) => withoutConnectedEntries({ record: prev, statuses }));` and add it to the existing `../../../connectors/rules.js` import.

## JR05 useMentionAtomicNavigation (EXTRACT, file-private)
Add `type LexicalCommand, type LexicalEditor, type RangeSelection` to the `lexical` import, then above the hook:
```ts
/** Registers one caret key at high priority. `act` runs only for a plain (unmodified, not
 *  composing) key on a collapsed range selection and returns whether it handled a mention;
 *  a handled key's default action is prevented. */
function registerMentionCaretKey(
  { editor, command, act }: { editor: LexicalEditor; command: LexicalCommand<KeyboardEvent>; act: (selection: RangeSelection) => boolean },
  _optional: Record<string, never> = {},
): () => void {
  return editor.registerCommand(command, (event) => {
    if (editor.isComposing() || !hasPlainNavigationIntent(event)) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    if (!act(selection)) return false;
    event.preventDefault();
    return true;
  }, COMMAND_PRIORITY_HIGH);
}
```
Hook body (keep the Origin doc):
```ts
return mergeRegister(
  registerMentionCaretKey({ editor, command: KEY_ARROW_LEFT_COMMAND, act: (selection) => {
    const mention = mentionBeforeCaret(selection);
    if (!mention) return false;
    selectBeforeMention(mention);
    return true;
  } }),
  registerMentionCaretKey({ editor, command: KEY_ARROW_RIGHT_COMMAND, act: (selection) => {
    const mention = mentionAfterCaret(selection);
    if (!mention) return false;
    selectAfterMention(mention);
    return true;
  } }),
  registerMentionCaretKey({ editor, command: KEY_BACKSPACE_COMMAND, act: (selection) => removeMentionAtCaret(selection, true) }),
  registerMentionCaretKey({ editor, command: KEY_DELETE_COMMAND, act: (selection) => removeMentionAtCaret(selection, false) }),
);
```
