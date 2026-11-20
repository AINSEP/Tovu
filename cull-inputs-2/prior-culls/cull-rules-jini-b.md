# Cull of r62t-rules-jini-b (Jini §C rest: classes, exported args, small rules)

Input `o-r62t-rules-jini-b/r62t-rules-jini-b.md`. Bases: Jini `ro-m6-jini` d3e78b387, Tovu `c-r62t-rules-jini-b` 776ce6d0f. Read-only checks; numbers from `audit-m6` plus my own token and caller counts. The class rule is a real owner rule (10-03 `jini_styling_prefixed_classes_host_css`: plain `jini-` classes, host CSS). The args rule is real, but React components take props only (owner 10-20), plain functions keep `(required, _optional = {})` (owner 10-02), and framework-dictated signatures are exempt (owner 11-20).

Counts: **KEEP 4 / CUT-TO 8 / DROP 7 (+348 args, 11 shadcn obs) / NEEDS-DECISION 2 / BLOCKED 1.** Every sheet's base is Jini merge-6 d3e78b387, including J-CHART after the cut. Tovu sheets: Tovu merge-6 776ce6d0f, WAIT for the Jini release and the Tovu lock bump.

| Sheet / item | Verdict | Reason |
|---|---|---|
| J-PREVIEW | KEEP | One emitted token plus four test selectors. Host: T-PREVIEW. |
| J-EXPECT-IO | KEEP | Test-only. Pins two real error messages and ENOENT. |
| J-EXPECT-DOMAIN | KEEP | Test-only. |
| T-PREVIEW | KEEP, WAIT | Three Tovu test selectors (`Themes.unit.test.tsx:407,418,437`). Red until Jini is consumed. |
| J-FORM | CUT-TO | Rename only. Drop the new test assertions. The pad removal moves to J-PADS. |
| T-FORM | CUT-TO, WAIT | One selector at `styles.css:6757`. Drop the new CSS-reading test file. |
| J-CHART | CUT-TO | The design's `chart-theme.ts` + `export type *` + remapping `./contracts/charts` to it is a re-export shell that hides runtime behind a contracts entry. The constant's only users are `ui/features/charts/{browser.ts,react.tsx}` and one test. Tovu has only a type import. Move the constant there. No manifest edit, so no xd-rs-c2 dependency. |
| J-MAIL | CUT-TO | Keep the type swap. Drop the `Number.isFinite(clock.nowMs())` test: the change is type-only. |
| J-COMMENTS | CUT-TO | Folded into J-PADS. Drop the `expectTypeOf<Parameters…>` test. |
| J-ARGS-MCP (`cssUrlRefs`) | DROP | It has a single scalar parameter and one caller, which makes it a style-only conversion. Its sibling `patternRefs` stays positional anyway. |
| Component second param (123 + design's 2) | CUT-TO **J-PADS** | Owner 10-20 says to strip `_optional` pads from React components only. About 134 pads on PascalCase components in about 100 `.tsx` files. The change only deletes code: removing an optional parameter keeps every JSX caller valid. Skip the 7 components whose second parameter is a real `t`. Skip the 27 pads on lowercase functions; per owner 10-02 they stay. |
| Exported args (396) | CUT-TO **J-ARGS** 48 / DROP 348 | Kept: two or more positional parameters, at most about 8 Jini references, no Tovu reference, and not table-bound. The list is in `SCR/rjb-args.md` (drafts 1/2/3: 40/5/3). Dropped: **117 audit false positives** (99 untyped JS `(required, optional = {})`, mostly agent-plugins `.mjs`, and 18 contextually typed `(r, o) =>` consts); 75 single-parameter style-only; **53 with many callers** (for example `row`/`rows`, `clamp`, `runMigrations`); 37 scripts or test fixtures; 31 with Tovu callers; 27 type guards or single-value predicates (language or `.filter` dictated); 4 translators `(key, vars)`; 4 table-bound or plugin-mirror functions (`handleAssistant*`, `bind{GitHubPages,S3Compatible}`). |
| Classes, remaining 1,232 | CUT-TO **Tier 1** / NEEDS-DECISION **Tier 2** | 809 distinct tokens. **Tier 1:** 590 tokens (678 observations, 102 files: ui 88, chat 9, admin 5) appear in no Tovu file under `apps/`. Jini emitter, Jini CSS and Jini tests rename together, with zero host impact. Roster: `SCR/rjb-class-tier1.md`. **Tier 2:** about 210 tokens, about 550 observations, mostly admin, user-management and commerce. These are tokens Tovu styles or queries, many of them generic (`notice`, `error`, `page`, `card`, `field-label`, `btn-secondary`); see the question below. **DROP** the 11 Tailwind utility observations in `interactive-ui/providers/shadcn/*`. |
| Core contracts, 213 runtime rows | BLOCKED | Waits on a dedicated design: server 108 rows first, plus error-class identity and entry closure. Not mechanical. |
| Bare `toThrow`, 5 remaining | DROP | Each needs a harness or transport contract for a one-line matcher. Low value. |
| Lint suppressions, 22 | DROP | Each carries a reason. Removing the comment alone proves nothing. |
| Coverage-ignore, 2 | DROP | Documented invariants. |
| OAuth `_nodiscoverycheck` | DROP | Documented. A lock change for one suppression. |
| `plugin-fixture-provider` name | DROP | A conformance fixture, not a shipped plugin. Renaming it costs a lock cycle. |
| Build-tool edges, 3 | DROP | Build scripts, not package source. |
| CMS/commerce Express, 7 rows | agree OPUS-CLOUD | Real rule (11-07). Not this job. |
| Vendor names: GitHub (5 files), Lipay (2) | NEEDS-DECISION | See below. |
| All RETIRE / OWNED-ELSEWHERE / HELD rows | agree | — |

## NEEDS-DECISION
1. **Tier 2 classes:** should Jini rename the ~210 tokens that Tovu also styles or queries now? **Recommend no mass job.** Do it per screen when that screen is next ported, using the media pattern: Tovu adds a renamed copy of its legacy rules in a `jini-*.css`, plus a Chrome look. Shared generic tokens cannot be renamed mechanically in Tovu CSS, because compound selectors multiply.
2. **GitHub/Lipay vendor code:** move it into provider-plugins? **Recommend yes, as its own extraction design**, not in this Codex job.

Follow-up, not Codex: teach `development/scripts/args-object-audit.mjs` to treat untyped `(required, optional = {})` and contextually typed arrows as OK. That removes 117 false hits honestly.

## Exact cut text (Jini paths under `packages/`)

### J-PREVIEW
As the design. Changeset: `@jini-ai/ui` minor, "BREAKING: the image preview dialog class is now `jini-image-preview-modal`."

### J-FORM
`admin/src/forms/react/components/FormEditorMainPanel.tsx:16,20,26`: `form-editor-panel` → `jini-form-editor-panel`. Keep the ids and aria pairs. No test edits. No existing test queries the token. Changeset: `@jini-ai/admin` minor, "BREAKING: form editor panel class is now `jini-form-editor-panel`."

### J-CHART
1. Delete `core/src/contracts/charts.ts:28`. At `:1`, change `Types and one constant.` to `Types only.`
2. New `ui/src/features/charts/default-theme.ts`: `import type { ChartTheme } from '@jini-ai/core/contracts/charts';` plus the moved line verbatim. It is not a package entry.
3. `browser.ts`, `react.tsx`, and `__tests__/browser.characterization.test.ts`: drop `DEFAULT_CHART_THEME` from the core import block and import it from `./default-theme.js` (`../default-theme.js` in the test). Add the design's `theme.mode` assertion only, with no other test.
4. `api-baseline/jini-ai__core.json`: delete the `DEFAULT_CHART_THEME` row (`:587`). No `package.json` edit.
5. Changeset: `@jini-ai/core` minor, "BREAKING: `DEFAULT_CHART_THEME` removed from `./contracts/charts` (moved into the UI chart host)."
6. STOP if any other importer appears.

### J-MAIL
Source edit as the design. No test. No changeset.

### J-EXPECT-IO, J-EXPECT-DOMAIN
As the design. The mutations run in the cloud.

### J-PADS (components take props only)
In every PascalCase JSX-returning function in `packages/**/*.tsx`, delete a trailing `, _optional: Record<string, never> = {}` / `, _optional = {}` / `, _optional` (incl. `FormEditorMainPanel.tsx:12`, `SettingsFields.tsx:6`). Not: lowercase functions, used second parameters, or draft 3's files (`admin/src/forms/react/components/{FormFieldRow,FormsListParts}.tsx`, `chat/src/react/components/QuestionForm.tsx`). Per component `git grep -n -w -F '<Name>' -- packages/`; skip it if a call passes two arguments or a type reads `Parameters<typeof X>`. No tests. Changeset: patch per package ("components take props only").

### J-ARGS (48 named functions)
Each function in `SCR/rjb-args.md` becomes `(required: { <same names, order, types> }, _optional = {})`; a defaulted positional becomes an optional field with the same default. Update every caller from `git grep -n -w -F '<name>' -- packages/` (tests too). Body unchanged. Skip and record if it is table-bound, passed as a callback, has a Tovu caller, or would reach complexity 11. Changeset per package: minor "BREAKING: <names> take one object" when reachable from an entry, else patch.

### Tier 1 classes (J-CLS-UI = draft 2, J-CLS-CA = draft 3)
Rename only tokens listed in `SCR/rjb-class-tier1.md` to `jini-<token>`, whole hyphenated words (`(^|[^A-Za-z0-9_-])<token>($|[^A-Za-z0-9_-])`).
- Rename in: emitted class strings, `cn()`/template parts, the draft's own CSS selectors, `querySelector`/`closest`/`classList` strings, test queries, snapshots.
- Never in: ids, `data-*` values, agent handles, i18n keys, `--custom-properties`, keyframes, docs, comments.
- Computed prefix (`${base}-x`): rename only if every produced class is listed; else skip the family, record it.
- A token found in another Jini package: skip it, record in REFRESH.md.
- Draft 2 owns `packages/ui/**`; draft 3 owns `packages/{chat,admin}/**` plus the pads in its three overlap files. No new tests.
- Changesets: `@jini-ai/ui`/`chat`/`admin` minor, "BREAKING: unprefixed classes renamed to `jini-*`; no host selector used them."

### T-FORM (Tovu, WAIT)
`apps/admin/src/styles.css:6757`: `.form-editor-panel` → `.jini-form-editor-panel`. No other edit.

### T-PREVIEW (Tovu, WAIT)
As the design.

## Host impact
- Tovu: only T-FORM and T-PREVIEW (one selector, three test lines), after the Jini release and lock bump.
- Tier 1, J-PADS, J-ARGS, J-CHART, J-MAIL: none (checked every Tier-1 token and kept function against Tovu `apps/`).
- Combine Chrome look: form editor narrow width; theme preview (open, backdrop, Escape); one screen per Tier-1 family (asset grid/tree, connectors, memory, resource board, viewer, chat cards); a chart in auto theme.

## Drafts
- `j-rjb-jini-DRAFT.md`: J-CHART → J-MAIL → J-EXPECT-IO → J-EXPECT-DOMAIN → J-PREVIEW → J-FORM → J-PADS → J-ARGS (8 sheets).
- `j-rjb-jini-DRAFT-2.md`: J-CLS-UI, then J-ARGS-UI2 (the 5 LanguageMenu/PaletteTweaks functions).
- `j-rjb-jini-DRAFT-3.md`: J-CLS-CA (chat + admin, plus the 3 pad files), then J-ARGS-CHAT (3).
- `j-tv-rjb-DRAFT.md`: T-FORM, T-PREVIEW.

There is no file overlap between the Jini drafts, so they can run in parallel.
