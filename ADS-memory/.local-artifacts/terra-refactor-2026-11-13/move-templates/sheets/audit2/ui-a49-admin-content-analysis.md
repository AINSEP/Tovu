# UI-A49: admin content analysis -> new `@jini-ai/admin/content-analysis` (+ `/react`) (templates T-UI, T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A49` (also CLASSIFY row 91, which owns `rules.ts`). C9a (admin `react/kit.tsx`) has landed; execute after wave B merge (the card is mounted by `PostEditor.tsx`, an applier-pass file).

Tier: S1 Sonnet (pure rules + controller), S2 Sonnet + Opus review (kit-slot gaps), S3 Sonnet. est. executor tokens ≈ 36k (S1 14k, S2 14k, S3 8k). Chrome look owed after S3 (post editor sidebar card, es locale, phone width).

## Findings that change the audit row
1. **The row lists 3 files; the unit is 5.** `rules.ts` (399 lines, row 91) and `content-analysis-i18n.ts` (712 lines) are imported by the hook and the card. `rules.ts` is the pure half: report types (`ContentAnalysisReport`, `ContentCheck`, `TocEntry`, `AnalysisState`), `parseContentAnalysisReport`, `previewAnalysis`, `currentAnalysis` (version-tagged "a save landing mid-flight wins"), `buildContentAnalysisView`, `describeAnalysisError`, `previewRequestBody`, `isContentAnalysisHidden`. It moves with the hook (the audit says "Row 91's report types/parser go to Jini too, not @tovu/contracts"). Order: S1 moves `rules.ts` pure parts, S2 the controller + view.
2. **`rules.ts` mixes generic and Tovu mapping; split it at the lines the row names as STAYS:** `CONTENT_ANALYZER_PLUGIN_ID` (:21), the post->`ext["content-analyzer"].report` mapping in `storedAnalysis({ ext })` (:136), the plugin-preview request body shape `PluginPreviewRequest`/`previewRequestBody` (:179-191, Tovu's preview route payload: stays with the HTTP binding), `isContentAnalysisHidden` over the preview-status query shape (availability policy), and `CARD_COPY`/`contentAnalysisCopyKeys` (:279-296, the dictionary key list for the Tovu i18n file). The generic remainder: types + `parseContentAnalysisReport` + `previewAnalysis` + `currentAnalysis` + `buildContentAnalysisView` + `describeAnalysisError`.
3. **The hook imports `useFetchQuery`/`useFetchMutation` from `@jini-ai/ui/fetch-query`** (a ui import; forbidden in a Jini React package, rule 6). The admin kit already exposes `useFetchQuery` and `useFetchMutation` (`packages/admin/src/react/kit.tsx:256-257`): the Jini hook uses those, no new slot, query keys stay host-agnostic.
4. **No Tovu-only class names are moved blindly:** the card's markup uses shared presentation classes (`card`, `card-title`, `card-lead`, `field-label`, `field-hint`, `dash-stat-label|value|meta`) plus feature classes `content-analysis`, `content-analysis-stats|stat|list|toc-level`. Rule 15 + the class table in S2 define the renames (feature classes -> `jini-content-analysis*`; shared classes stay literal strings the Tovu stylesheet already styles: they are Tovu CSS contract, NOT renamed, and the Jini card documents them as the host's `className` slots). Decision for the owner/executor: **do not rename shared classes; add `className` props for them** is the cheaper alternative (the admin kit components already take `className`): S2 takes the kit route: the card renders `Notice`? No: it is a card, not a notice; it renders plain elements with the six shared class names kept as `classNames` map prop (`{ card, title, lead, label, hint, statLabel, statValue, statMeta }`) supplied by Tovu. No class rename in CSS then; only the four `content-analysis*` classes become `jini-content-analysis*` (CSS edit in `styles/editor.css:178-…` and tests).
5. **`agentHandle`**: the card uses `agentHandle` from `@jini-ai/core/agent-handles` (C2 pass applied at integ/wave-b). Handle text is a wire contract: unchanged (grep `agentHandle(` in the card before and after).

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/admin/src/features/content-analysis/ContentAnalysisCard.tsx | blob 35ddebb26f6b0f47c189994fe15f6df7e8f3cd37 | delete after S3 (moves)
  - apps/admin/src/features/content-analysis/hooks/use-content-analysis.hooks.ts | blob d1df96f41ef3d948b3b596f27dcfa269b4101381 | keep-reduced (wired binding)
  - apps/admin/src/features/content-analysis/hooks/content-analysis-port.hooks.ts | blob 5733a0622d420707da12ca0eddecb317a521795f | keep-reduced (HTTP port types stay; interface re-homed)
  - apps/admin/src/features/content-analysis/rules.ts | blob 4d6730836e859484a09a7f1704e5634a39c5e1f9 | keep-reduced (Tovu mapping lines per finding 2)
  - apps/admin/src/features/content-analysis/content-analysis-i18n.ts | 712 lines | keep (dictionary)
tovu_tests (re-point; every assertion kept): __tests__/{content-analysis-rules.unit,use-content-analysis.hooks.unit,ContentAnalysisCard.unit,content-analysis-i18n.unit}.test.ts(x)
tovu_importers: apps/admin/src/features/posts/PostEditor.tsx:32 (import) and :1759 (<ContentAnalysisCard post title bodyJson />); apps/admin/src/styles/editor.css:178 (class rules)
jini_guards:
  - packages/admin/src/react/kit.tsx | blob 6a609428fd9035d35561797e6e6a60ab7b363969 (useFetchQuery/useFetchMutation exist)
  - packages/admin/package.json | blob f2b5d622f77a970deb49575370f56f321698ce7b
  - packages/admin/src/content-analysis/ must not exist; `rg -n "ContentAnalysisReport|createContentAnalysisController" packages --glob '!**/dist/**'` prints nothing
```
Census: `rg -n "features/content-analysis|content-analysis/" apps/admin/src --glob '!**/node_modules/**'`: the files above only; the website hits (`preview.ts`, `built-ins/content-analyzer/index.ts`) are the SERVER side and untouched (their report-producing code is the other half of the wire contract: S1's parser must accept exactly what `content-analyzer/index.ts` emits: step 0 reads it and records the field list).

## Contracts (Jini, `packages/admin/src/content-analysis/`)
```ts
// ports.ts
export interface ContentAnalysisPort {
  /** Whether the analyzer is enabled for this editor (null/throws = unknown). */
  previewStatus(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<{ enabled: boolean }>;
  /** Runs the analyzer over the CURRENT, possibly unsaved draft. */
  analyze(required: { postId: string; title: string; bodyJson: unknown }, optional?: { signal?: AbortSignal }): Promise<{ fields: Readonly<Record<string, string | number | boolean>> }>;
}
// rules.ts (pure): parseContentAnalysisReport({ raw }), previewAnalysis({ fields }), currentAnalysis({ stored, post: { id, version }, fresh }), buildContentAnalysisView({ state, t }), describeAnalysisError({ error, t }) -- all (required, optional = {})
// controllers: createContentAnalysisController({ port, t, statusKey }, { staleTime = 0 }) -> hook-free state machine; react/useContentAnalysis wraps it with kit useFetchQuery/useFetchMutation.
```
`currentAnalysis` takes the already-extracted `stored` raw report (Tovu extracts `ext["content-analyzer"].report` from the post in its binding), not the `ext` map. Note the positional `previewAnalysis(fields)`, `buildContentAnalysisView(state, t)`, `isContentAnalysisHidden(status)`, `previewRequestBody(input)` signatures break rule 10 and are converted in the move (Tovu callers converted in S3).

```
id: UI-A49-1 .. UI-A49-3
feature: admin content analysis
jini_target: admin src/content-analysis/{models.ts,rules.ts,ports.ts,controllers/content-analysis.controller.ts,adapters/memory.ts,index.ts}; src/content-analysis/react/{ContentAnalysisCard.tsx,use-content-analysis.ts,index.ts}; package.json exports + jini.entries "./content-analysis": "universal", "./content-analysis/react": "browser"
kit_injection: kit hooks useFetchQuery, useFetchMutation only (no component slot); classNames map prop for the host's shared card classes
class_renames:
  - "content-analysis-stats" -> "jini-content-analysis-stats" | editor.css + card test selectors (count each with `rg -c` BEFORE: record)
  - "content-analysis-stat" -> ... (the NEXT is a prefix of the first: do "-stats" first, then "-stat", then "-list", "-toc-level", `content-analysis` section class last; do each replacement ONCE and re-count: the new text contains the old)
agent_handles: UNCHANGED
i18n: keys = CARD_COPY (6) + view keys from `contentAnalysisCopyKeys()`: Tovu dictionary keeps the strings; Jini asks `t(key)` with the SAME English phrase keys
changeset: @jini-ai/admin: minor | "content-analysis: report rules, controller and card"
```

## UI-A49-1 — Jini pure (commit 1)
0. Branch rule; blobs; guards. 1. Tests first: port every case of `content-analysis-rules.unit.test.ts` for the generic functions (with the new signatures), `currentAnalysis` (fresh wins only for the same post id and a version >= the post's; a stored report newer than the fresh one wins), parser rejects each malformed field without throwing, `describeAnalysisError` never leaks `error.message` of non-user-facing errors (copy the existing assertion). 2. Code: `models.ts` types, `rules.ts`, `ports.ts`, `adapters/memory.ts` (in-memory port for tests), index; ≤ 50 lines/function, complexity ≤ 9. 3. Changeset only with S2 (no shipped surface until the module is exported): add the `package.json` entry for `./content-analysis` here. Commit `feat(admin/content-analysis): report rules and port`.

## UI-A49-2 — Jini controller + React (commit 2, Opus reviews the kit use)
1. Tests first: `content-analysis.controller.test.ts` = the `use-content-analysis.hooks.unit.test.tsx` cases (in-flight exclusion: a second `analyze()` while one runs issues ONE request; fresh result tagged with the post version; failure keeps the shown analysis and sets `error`; status read `staleTime: 0`; hidden while loading or disabled; a failed status read shows the card with the error). React tests = `ContentAnalysisCard.unit.test.tsx` against `fake-admin-kit` and `adapters/memory` (copy the card's assertions, new class names, `classNames` map prop). 2. Code: card <= 200 lines, hook wrapper using `useFetchQuery`/`useFetchMutation` from `../react/kit.js`; `agentHandle` from `@jini-ai/core/agent-handles` for the same handle strings. `rg -n "@jini-ai/ui" packages/admin/src/content-analysis` prints nothing. Changeset; commit `feat(admin/content-analysis/react): content analysis card and controller`.

## UI-A49-3 — Tovu binding + swap (commit 3, Sonnet; after S1-S2)
1. `use-content-analysis.hooks.ts` (edit): `useWiredContentAnalysis` keeps its name; builds the port adapter (`previewStatus` -> `defaultContentAnalysisPort.previewStatus({ pluginId: CONTENT_ANALYZER_PLUGIN_ID })`, `analyze` -> `previewPlugin({ target: { pluginId }, body: previewRequestBody({...}) })`), extracts `stored` via the Tovu `storedAnalysis`-style mapping, and returns Jini's controller (types from Jini). 2. `PostEditor.tsx:32,1759`: import the card from `@jini-ai/admin/content-analysis/react` and pass `classNames` (the six shared class strings); `git rm` `ContentAnalysisCard.tsx`; move/delete the four Tovu tests per the keep-or-move rule (record counts); CSS rename at `styles/editor.css` for the four `content-analysis*` classes (counts recorded in S2 step). 3. `rules.ts`: delete moved functions (keep per finding 2); callers `previewRequestBody({...})` positional -> object form already; `rg -n "buildContentAnalysisView|currentAnalysis|parseContentAnalysisReport" apps/admin/src` prints nothing outside the Jini import. 4. eslint; commit `refactor(admin): content analysis card from @jini-ai/admin/content-analysis`.

## untangle overlap (execute after wave B merge)
- C9a landed; C2 `agentHandle` landed. R-admin/C11 edits `admin/react/index.ts` and `package.json`: re-take blobs before S2.
- `PostEditor.tsx` (1,700+ lines) is also edited by A54/A55 (this audit) and the editor-surface rows: keep the edit to the import line and the one JSX call; re-take the blob.
- Row 91 (`rules.ts` CLASSIFY) must not be executed separately: this sheet supersedes it for the pure half; the coordinator marks row 91 DONE-BY A49.

## STOP specific to this sheet
- The server's emitted report fields differ from what the parser accepts (`content-analyzer/index.ts`): STOP and report the field diff, do not widen the parser.
- A class rename count differs from the recorded count.
- `agentHandle(` text in the card changes.
