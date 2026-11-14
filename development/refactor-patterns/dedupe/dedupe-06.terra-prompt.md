# Terra job dedupe-06: Jini chat + ui (mechanical groups only)

READY (2026-11-13; revised after review d3r; revised after review d3r2: J07 moved out, J51's returned function takes an object; revised after review d3r3: JR05's `act` takes `({ selection }, _optional = {})`, J28 explicit call-site migration onto the existing `template-i18n.ts#interpolate` with a `keepPlaceholderWhen` option). UI lifecycle consolidations (J02, J35, J39, J48, T16J, T18J, T23J) and J07 (needs a coordinator decision) are no longer in this job: they are Opus work, one feature at a time, listed in `opus-ui-backlog.md` (same folder). What stays here is markup, types, pure functions and one command-registration preamble, none of which changes an effect, a listener or a timer. Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` (Tovu repo). Repo: the Jini clone you are given (Jini only; paths below are relative to the Jini repo root).

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`.
- Signatures: every function this job creates or gives a new shared home takes `(required: {...}, optional: {...} = {})`; with nothing optional write `_optional: Record<string, never> = {}`, with nothing required `_required: Record<string, never> = {}`. A defaulted trailing object never breaks an existing caller. Where an existing exported name has a different shape and callers exist, keep that name as a one-line adapter over the new function. Only three shapes are exempt: React components (one props object), callbacks whose shape a library fixes (e.g. DataTable compare `(a, b)`), and the positional type guards owner decision O2 covers. Each recipe that uses an exemption names it.
- Size: every function you create, move or merge is at most 50 lines, with cyclomatic AND cognitive complexity at most 10 (at most 9/9 under Tovu `apps/admin`). A recipe that moves code says how to split it when needed. If a body you move is still over a limit, split it only by pure extract-function: the same statements in the same order, locals passed in one object, and each comment moving with its lines. If that cannot be done without changing behavior, SKIP the group and report `OVER-LIMIT <id>: <function> <lines>/<complexity>`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

Cross-package rule (PLAN.md "Coordinator gates"): no group left in this job imports a name this job adds to another package, so there is no Phase B and no gate (J02 and its gate H2 moved to the Opus backlog). Exemptions from the two-object signature form used here: React components `FamilyCard` (J01) take one props object; J59's four public positional names in source-config-list stay as legacy adapters; J43's `DataTableRowClick` is the existing table callback contract.

## Groups in this job (decision, risk, expected saving, divergence, tests)
- **J01** EXTRACT SHARED HELPER — risk L; est. −90 lines; divergence: none (Glob/Grep/Web cards already render class "op-title" with no shimmer = shimmer:false)
  - tests: cd packages/chat && npx vitest run --maxWorkers=2 src/react/components/__tests__/ToolCard.test.tsx src/react/components/__tests__/ToolCard.long-chat-memory.test.tsx src/react/components/__tests__/ToolCard.cli-events.test.tsx
- **J28** MERGE INTO EXISTING (`features/i18n/template-i18n.ts#interpolate` gains `{ keepPlaceholderWhen }`, default unchanged) — risk L; est. −12 lines; divergence: missing-value policy, made an explicit option (review d3r3 finding 5); the two I18n contexts stay separate (merging would change which provider translates renderer strings - owner decision, not done)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/i18n/__tests__/context.test.tsx src/renderers/react/__tests__/i18n.test.tsx
- **J34** MERGE INTO EXISTING — risk L; est. −27 lines; divergence: none (types only)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/resource-dashboard
- **J43** EXTRACT SHARED HELPER — risk L; est. −16 lines; divergence: none (absent props instead of explicit undefined = same DOM)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/interactive-ui/providers
- **J50** EXTRACT SHARED HELPER — risk L; est. −8 lines; divergence: none
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/react/__tests__/components/BrandLogo.test.tsx
- **J51** EXTRACT SHARED HELPER — risk L; est. −15 lines; divergence: none
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/connectors src/features/skills src/features/resource-dashboard
- **J59** EXTRACT SHARED HELPER — risk L; est. −8 lines; divergence: none; shared helper takes object args, the four public positional names in source-config-list stay as one-line adapters
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/resource-dashboard src/features/source-config-list
- **JR03** MERGE INTO EXISTING — risk L; est. −24 lines; divergence: none (inline copies are the same identity-preserving delete); object args (not public)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/connectors/__tests__/hooks/useConnectorAuthorization.test.ts src/features/connectors/__tests__/hooks/useConnectorAuthorization.stale-race.test.ts src/features/connectors/__tests__/hooks/useConnectorDetail.test.ts src/features/connectors/__tests__/rules.test.ts src/features/memory/__tests__/react/hooks/useMemoryConnectors.rules.test.ts src/features/memory/__tests__/react/hooks/useMemoryConnectors.test.tsx
- **JR04** EXTRACT SHARED HELPER — risk L; est. −16 lines; divergence: none
  - tests: same as JR03
- **JR05** EXTRACT SHARED HELPER — risk L; est. −24 lines; divergence: arrow keys: preventDefault now runs after the caret move instead of before (same synchronous handler; not observable)
  - tests: cd packages/ui && npx vitest run --maxWorkers=2 src/features/lexical-rich-text-editor/react/hooks/useMentionAtomicNavigation.test.ts src/features/lexical-rich-text-editor/react/components/RichTextInput.test.tsx


## Recipes (exact before → after)

## J01 ToolCard family cards (EXTRACT, chat)
`FamilyCard` is a React component (one props object): exempt from the two-object form. It is 17 lines.
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

## J28 interpolate (MERGE INTO EXISTING, ui; revised after review d3r3 findings 4 and 5)
Decision (recorded here; no new helper file): `packages/ui/src/features/i18n/template-i18n.ts` already owns `interpolate({ template, vars })` with the same placeholder regex `/\{(\w+)\}/g` and the same `String(value)` conversion as the two file-private copies (`features/i18n/context.tsx` ~line 191, `renderers/react/i18n.tsx` ~line 55). The ONLY contract differences are the missing-value policy and an absent `vars`:
- existing `interpolate`: keeps `{name}` only when `!(name in vars)` (property presence); a present key whose value is `null`/`undefined` (reachable only through casts or JS callers) prints `"null"`/`"undefined"`; `vars` is required.
- the two copies: return the template unchanged when `vars` is `undefined`; keep `{name}` when `vars[name] == null` (nullish preservation).
Both use the same inherited-property lookup for prototype names, so that edge is identical and stays as it is. So extend the existing owner with an explicit policy option whose default is today's behavior, and delete both copies.

1. `template-i18n.ts`: replace `interpolate` with (keep its existing "Parameterized messages belong in locale data too…" why-comment above it):
```ts
/** Which `{name}` placeholders stay as literal text. `'absent'` (default): only names not present in `vars`.
 *  `'nullish'`: also names whose value is `null`/`undefined`; the React I18n contexts' policy, so a host passing
 *  `{ count: undefined }` sees `{count}` instead of the word "undefined". */
export type KeepPlaceholderWhen = 'absent' | 'nullish';
export function interpolate(
  { template, vars }: { template: string; vars: Record<string, string | number> | undefined },
  { keepPlaceholderWhen = 'absent' }: { keepPlaceholderWhen?: KeepPlaceholderWhen } = {},
): string {
  // No vars: nothing to substitute, so every placeholder stays (the I18n contexts' `t(key)` path).
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const keep = keepPlaceholderWhen === 'nullish' ? vars[key] == null : !(key in vars);
    return keep ? match : String(vars[key]);
  });
}
```
   Public default unchanged: every existing caller (admin, `panel-kit`, `universal.ts`, `index.ts` re-exports) passes a defined `vars` and no options, so it gets exactly today's `in` behavior. Widening `vars` to accept `undefined` breaks no caller; the only new behavior is for untyped JS passing `undefined`, which threw a TypeError before and now returns the template. Do NOT export `KeepPlaceholderWhen` from `index.ts`/`universal.ts`/`panel-kit` (no consumer needs the name; the option's string literals type-check without it).
2. `features/i18n/context.tsx`: add `import { interpolate } from './template-i18n.js';`, delete the file-private `function interpolate(template, vars)` (~line 191), and migrate both calls explicitly:
   - ~line 157: `return interpolate(raw, vars);` → `return interpolate({ template: raw, vars }, { keepPlaceholderWhen: 'nullish' });`
   - ~line 173: `t: (key, vars) => interpolate(key, vars),` → `t: (key, vars) => interpolate({ template: key, vars }, { keepPlaceholderWhen: 'nullish' }),`
3. `renderers/react/i18n.tsx`: add `import { interpolate } from '../../features/i18n/template-i18n.js';` (that file has no imports, so the `./renderers` entry loads nothing extra), delete its file-private `function interpolate(template, vars)` (~line 55), and migrate both calls explicitly:
   - ~line 34: `t: (key: string, vars?: TranslationVars) => interpolate(dictionary?.[key] ?? key, vars),` → `t: (key: string, vars?: TranslationVars) => interpolate({ template: dictionary?.[key] ?? key, vars }, { keepPlaceholderWhen: 'nullish' }),`
   - ~line 42: `t: (key, vars) => interpolate(key, vars),` → `t: (key, vars) => interpolate({ template: key, vars }, { keepPlaceholderWhen: 'nullish' }),`
   Update this file's header sentence "no dependency on `@jini-ai/ui`": it now lives inside `@jini-ai/ui`, so say it keeps its own tiny context (separate from `features/i18n`'s provider; merging the two would change which provider translates renderer strings, an owner decision not taken here) and shares only the pure `interpolate`.
4. `rg -n "interpolate\(" packages/ui/src/features/i18n/context.tsx packages/ui/src/renderers/react/i18n.tsx` must show only the four object-form calls.

## J34 ResourceBoardView props (MERGE, ui)
ResourceBoardView.tsx: change `export interface ResourceBoardViewProps<TBody = unknown> {` to `export interface ResourceBoardViewProps<TBody = unknown> extends Omit<ResourceBoardToolbarProps, 'selectedCount'> {`. Add `type ResourceBoardToolbarProps` to the existing `./ResourceBoardToolbar.js` import. Delete the props that the toolbar declares (sortOptions … cancelSelectLabel, createLabel, onCreate) but KEEP `selected: ReadonlySet<string>;` in its current position. The `enableBulkDelete` doc now comes from the toolbar.

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

## J50 BrandLogo (EXTRACT type)
`export interface ResolveLogoSrcOptions { stage: LogoStage; brandId?: string | undefined; resolveBrandLogoUrl?: ((brandId: string) => string) | undefined; logoSrc?: string | null | undefined; host?: string | undefined; faviconSize: number; resolveFaviconUrl: (host: string, size: number) => string; }`. Use it in `resolveLogoSrc(opts: ResolveLogoSrcOptions)` and `useResolvedLogoSrc(opts: ResolveLogoSrcOptions)`.

## J51 fake latency (EXTRACT, ui)
Review d3r2 finding 6: the returned function is not library-fixed, so it takes `({ value }, _optional = {})` like every other new function, and every `delay(x)` call in the consumers becomes `delay({ value: x })`.

1. New `ui/src/utils/fake-latency.ts`:
```ts
/** The simulated-latency resolver every in-memory feature port double uses: 0 (default) resolves on the next microtask, otherwise after `latencyMs`. */
export type FakeLatencyDelay = <T>({ value }: { value: T }, _optional?: Record<string, never>) => Promise<T>;
export function fakeLatencyDelay(_required: Record<string, never> = {}, { latencyMs = 0 }: { latencyMs?: number | undefined } = {}): FakeLatencyDelay {
  return <T>({ value }: { value: T }, _optional: Record<string, never> = {}): Promise<T> =>
    latencyMs > 0 ? new Promise((resolve) => setTimeout(() => resolve(value), latencyMs)) : Promise.resolve(value);
}
```
2. The eleven consumers (Jini 2ab246674; all under `packages/ui/src/features/`). In each, replace the local `const delay = <T>(value: T): Promise<T> => …` two lines with `const delay = fakeLatencyDelay({}, { latencyMs });`, import `fakeLatencyDelay` from `'../../utils/fake-latency.js'`, then rewrite EVERY call in that file from `delay(<expr>)` to `delay({ value: <expr> })` (the count after each file is the number of `delay(` calls to rewrite; re-count with `rg -c '\bdelay\(' <file>` and report a mismatch as `STALE J51 <file>`):
   - `execution/dependencies.ts` (~line 61): 7 calls. `latencyMs` stays (delayedRejection uses it).
   - `connectors/dependencies.ts` (~line 49): 11 calls.
   - `resource-dashboard/dependencies.ts` (~line 43, first double): together with the second double below, 9 calls in the file.
   - `resource-dashboard/dependencies.ts` (~line 135, second double): see above.
   - `memory/dependencies.ts` (~line 237): 5 calls.
   - `integrations/dependencies.ts` (~line 31): 4 calls.
   - `project-locations/dependencies.ts` (~line 42): 4 calls.
   - `asset-grid/dependencies.ts` (~line 38): 2 calls.
   - `skills/dependencies.ts` (~line 48): 6 calls.
   - `media-providers/dependencies.ts` (~line 31): 3 calls. `latencyMs` stays (delayedRejection uses it).
   - `source-config-list/dependencies.ts`: different shape. Delete `type Delay` (~line 39) and `createDelay` (~lines 46-49); `FakeStore.delay` becomes `delay: FakeLatencyDelay` (import the type too); `const delay = createDelay({ latencyMs: options.latencyMs ?? 0 });` (~line 136) becomes `const delay = fakeLatencyDelay({}, { latencyMs: options.latencyMs ?? 0 });`. 7 calls. The `{ store, delay }` destructurings (~lines 56, 84, 155) stay.
   Keep `const latencyMs = options.latencyMs ?? 0;` only where something else (delayedRejection) still uses it; otherwise pass `{ latencyMs: options.latencyMs }` and delete the local.
3. No test file calls a feature's local `delay`; the fakes' tests (the J51 test line above) cover the change. Type-check ui only.

## J59 pending-action helpers (EXTRACT to ui/utils, object args; public positional names stay as adapters)
1. New `ui/src/utils/pending-actions.ts` with the resource-dashboard docs (the "re-derived fresh here (deliberately not imported cross-feature…)" clause becomes "shared by every feature that tracks per-item in-flight actions"; keep the rest):
```ts
export function pendingActionKey({ id, kind }: { id: string; kind: string }, _optional: Record<string, never> = {}): string { return `${kind}:${id}`; }
export function isActionPending({ pendingKeys, id, kind }: { pendingKeys: ReadonlySet<string>; id: string; kind: string }, _optional: Record<string, never> = {}): boolean
export function withPendingAction({ pendingKeys, id, kind }: { pendingKeys: ReadonlySet<string>; id: string; kind: string }, _optional: Record<string, never> = {}): ReadonlySet<string>
export function withoutPendingAction({ pendingKeys, id, kind }: { pendingKeys: ReadonlySet<string>; id: string; kind: string }, _optional: Record<string, never> = {}): ReadonlySet<string>
```
   Bodies = today's (withoutPendingAction returns the same set when the key is absent).
2. `features/source-config-list/rules.ts` (PUBLIC via its index and the root barrel): keep the four exported names, positional signatures, `SourceActionKind` parameter types and the `pendingActionKey` doc; each body becomes one line delegating, e.g. `return isActionPending_({ pendingKeys, id, kind });` with `import { pendingActionKey as pendingActionKey_, isActionPending as isActionPending_, withPendingAction as withPendingAction_, withoutPendingAction as withoutPendingAction_ } from '../../utils/pending-actions.js';`.
3. `features/resource-dashboard/rules.ts` (not public): delete its four functions; repoint its callers (`rg -n "pendingActionKey|isActionPending|withPendingAction|withoutPendingAction" packages/ui/src/features/resource-dashboard`) to the object form from `../../utils/pending-actions.js`. Update the resource-dashboard/index.ts comment: one copy, in `utils/pending-actions.ts`.

## JR03 withoutKey -> connectors/rules.ts (MERGE, object args)
`withoutKey` is not public (only the two hook files and their tests import it), so it changes to object args without adapters.
1. MOVE `withoutKey` (with its doc) from `ui/src/features/connectors/hooks/useConnectorAuthorization.ts` to `ui/src/features/connectors/rules.ts` as `export function withoutKey<T>({ record, key }: { record: Record<string, T>; key: string }, _optional: Record<string, never> = {}): Record<string, T>` (body unchanged: returns `record` itself when `key` is absent).
2. useConnectorAuthorization.ts: import it from `../rules.js`; every call (existing `withoutKey(curr, connectorId)` at ~121/122/142 and the inline copies `setX((curr) => { if (curr[connectorId] === undefined) return curr; const next = { ...curr }; delete next[connectorId]; return next; })` at the cancel-success, sweep and cancel sites) becomes `setX((curr) => withoutKey({ record: curr, key: connectorId }))`. Keep the stale-race comment block (~245-248) and the "This clear's `curr[connectorId] !== undefined` guard is …" comment directly above their calls.
3. useConnectorDetail.ts: the 2 `setFailedIds` copies become `setFailedIds((curr) => withoutKey({ record: curr, key: connectorId }))`; import from `../rules.js`.
4. `ui/src/features/memory/react/hooks/useMemoryConnectors.rules.ts`: delete the `withoutKey` body; add `import { withoutKey } from '../../../connectors/rules.js';` and `export { withoutKey } from '../../../connectors/rules.js';`; update its callers to the object form. Reword its doc to: "Shared with `features/connectors/rules.ts` (one copy): this slice already imports connector reducers from there, per `../../rules.ts`'s header." Its old comment said "intentionally duplicated per slice"; that reason contradicts the slice header (the small owner item on the JR03 row of PLAN.md; not blocking).
5. Tests: `features/connectors/__tests__/hooks/useConnectorAuthorization.test.ts` and `features/memory/__tests__/react/hooks/useMemoryConnectors.rules.test.ts` import `withoutKey` from `../../rules.js` / keep their import path and switch their calls to the object form.

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
 *  a handled key's default action is prevented. `act` is this helper's own contract (Lexical
 *  fixes only the outer `registerCommand` listener), so it takes `({ selection }, _optional = {})`. */
function registerMentionCaretKey(
  { editor, command, act }: { editor: LexicalEditor; command: LexicalCommand<KeyboardEvent>; act: (requiredArgs: { selection: RangeSelection }, optionalArgs?: Record<string, never>) => boolean },
  _optional: Record<string, never> = {},
): () => void {
  return editor.registerCommand(command, (event) => {
    if (editor.isComposing() || !hasPlainNavigationIntent(event)) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    if (!act({ selection })) return false;
    event.preventDefault();
    return true;
  }, COMMAND_PRIORITY_HIGH);
}
```
Hook body (keep the Origin doc):
```ts
return mergeRegister(
  registerMentionCaretKey({ editor, command: KEY_ARROW_LEFT_COMMAND, act: ({ selection }, _optional = {}) => {
    const mention = mentionBeforeCaret(selection);
    if (!mention) return false;
    selectBeforeMention(mention);
    return true;
  } }),
  registerMentionCaretKey({ editor, command: KEY_ARROW_RIGHT_COMMAND, act: ({ selection }, _optional = {}) => {
    const mention = mentionAfterCaret(selection);
    if (!mention) return false;
    selectAfterMention(mention);
    return true;
  } }),
  registerMentionCaretKey({ editor, command: KEY_BACKSPACE_COMMAND, act: ({ selection }, _optional = {}) => removeMentionAtCaret(selection, true) }),
  registerMentionCaretKey({ editor, command: KEY_DELETE_COMMAND, act: ({ selection }, _optional = {}) => removeMentionAtCaret(selection, false) }),
);
```

## Moved to the Opus UI backlog (do NOT do these here)
J02 (A2UI node renderer merge: the survivor is an 84-line function and needs splitting, plus four behavior differences to settle), J35 (`useLoadedList`: effect dependencies change), J39 (anchored-position effect), J48 (menu dismiss hooks: listener event type changes), T16J, T18J, T23J (new panel-kit lifecycle hooks), J07 (artifact manifest types: re-exporting them from `@jini-ai/ui/renderers` would make chat's emitted declarations need the optional UI peer; review d3r2 finding 2, in the backlog's decisions section). Keep `packages/chat/src/core/util/types.ts` as it is. The tests the design wrote for J48, T18J and T23J stay in the Jini clone for that work; do not run or edit them in this job. See `opus-ui-backlog.md`.
