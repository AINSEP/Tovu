# Cull of r62t-hygiene-b (stale comments, translations, pins, dead editor, junk, env names)

Input `cull-inputs/designs/r62t-hygiene-b.md`. Base Tovu `776ce6d0f` (merge-6), Jini `d3e78b387` (merge-6). Read-only; checked with `git show`, single-symbol `git grep`, `git ls-tree` and `merge-base`.

**Counts (5 READY sheets):** **KEEP 2** (J-C1, TV-C3) · **CUT-TO 3** (TV-C1, TV-C2, TV-I18N-PICKER) · DROP 0 · **NEEDS-DECISION 10** (9 env + 1 scanner) · CLOUD 2 (TV-I18N-REVIEW, J-I18N-JSX copy passes) · BLOCKED 0. Agree with every RETIRE row.

## The ~1,005 missing-translation rows: scanner misreads, not missing copy (verified)
- **962 high-confidence rows** (`deployment-i18n.tsx`, dict line 1767, 48 rows × 20 locales, plus `en`/`es` `entries`). The locales are built as `auditTranslationEntries({ entries: [ … ] })` (`deployment-i18n.tsx:1759–1765`). That zips a positional array onto `Object.keys(DEPLOYMENT_AUDIT_STRINGS)` and **throws at module load** if the length is wrong, so a missing value cannot ship. The scanner reads the argument name `entries` as the only key.
- **43 low-confidence rows** (users 24, site-transfer 10, dashboard 5, deployment 2, auth 2). Each value is present as `...translationEntry({ source, translated })` (`lib/translation-entry.ts:11`). Checked: users `ja`/`th` "Reset password" at `users-i18n.ts:662,1124`, and auth `es` "Password" at `auth-i18n.ts:8`. The spread hides the key from the scanner.
- Result: **0 real missing keys.** No translation pass for this TSV.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| J-C1 host renderer refs (Jini) | **KEEP** | merge-6 | The five comment sites are as cited (`html-embeds.ts:351`, `post-embed-resolution.ts:48`, `resolvers/contact-form.ts:96`, `storefront.ts:8,56`). The replacements are neutral and use no product name. `renderWidgetContactForm` still exists (Tovu `render/contact-form-widget.ts:48`). |
| TV-C1 full renderer path (Tovu) | **CUT-TO** | **merge-6** (not "after xd5-render/publish") | Neither branch is in merge-6 (`merge-base --is-ancestor` false, 4 commits each). Waiting buys nothing, and one destination is wrong after the wait: `origin/codex/tv-xd5-render` **deletes** `render/doc/marks.ts` (`renderMarks` moves to `@jini-ai/cms/html/document-marks`), so the sheet's own STOP would fire. Do it on merge-6. `tiptap-text-schema.ts:5` names the symbols without paths. The other 8 destinations exist on merge-6 and survive the render branch (`render-site.ts`, `content-html.ts`, `doc/doc-nodes.ts`, all M not D). `theme.ts:7` is a one-line comment overlap with tv-xd5-publish (same old text there); the combine takes ours. |
| TV-C2 relative renderer path (Tovu) | **CUT-TO** | **merge-6** | Same reasoning. tv-xd5-render **deletes** `render/widgets/menu.ts` (`renderWidgetMenu` moves to `@jini-ai/cms/navigation/menu-render`). `MenuEditor.tsx:37` cites the symbol, not a path. The other three destinations survive. |
| TV-C3 settings adapter path (Tovu) | **KEEP** | merge-6 | All five cite the removed Jini `settings/express/cms-adapter.ts`. `createCmsSettingsService` is at Jini `core/src/settings/cms-adapter.ts:42`. |
| TV-I18N-PICKER (Tovu) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 1). The design changes two files and adds a hook return field (`cancelLabel`). Smaller: inject the locale hook into the one component that renders the button and translate there. No change to `useJiniMediaPicker`. The existing test already renders `MediaPickerDialog`. |
| TV-I18N-MISSING | agree RETIRE | — | Verified above. |
| TV-I18N-FAB, -LITERALS, TV-RECHARTS, J-PROVIDER-VERSIONS, J-LEXICAL-*, TV-JUNK, J-JUNK | agree RETIRE | — | Pins: only one non-`dep-not-installed` row (`charts-recharts-source.ts:25`, 0.7.1). It matches `package.json:161` `@jini-ai/provider-plugins: "0.7.1"`; the row comes from a clone with no install. Lexical: none in Jini `packages/ui` tree or `package.json`. Junk: zero tracked `*.orig/.bak/.rej/-e/~/.swp` in both repos. |
| Stale-comment PARTIAL/RETIRE groups | agree | — | No blanket replacements. Every group needs per-symbol checks. |
| TV-I18N-REVIEW (10 rows), J-I18N-JSX (260) | **CLOUD** (Opus copy pass) | — | Needs reviewed copy in 21 locales and a Chrome look. Cut from any future sheet: a "common provider or generic copy layer" in Jini. Use each feature's existing copy wiring. |
| ENV-SCHEMA, ENV-1…9 | NEEDS-DECISION (held) | — | See below. |

## Exact cut text

### TV-C1 · Tovu · merge-6
"Do the eight table rows exactly as the design lists them (replace the full `apps/website/src/server/inbound/public-http/http/site/render.ts` with `apps/website/src/server/inbound/public-http/http/site/` + the destination suffix). At `apps/website/src/features/post/tiptap-text-schema.ts:5`, replace the fragment `` `apps/website/src/server/inbound/public-http/http/site/render.ts`'s `renderDocNode`/`renderMarks` `` with `` the site renderer's `renderDocNode`/`renderMarks` ``. Comment text only. STOP a row if its line no longer holds the old path."

### TV-C2 · Tovu · merge-6
"Do the three rows `media-embed-extension.tsx:11` → `render/doc/nodes-media.ts`, `media-image-extension.tsx:14` → `render/doc/doc-nodes.ts`, and `import-media-entity.ts:22` → `render/doc/doc-nodes.ts` as designed (same relative prefix). At `apps/admin/src/features/menus/MenuEditor.tsx:37`, replace `` (`server/inbound/public-http/http/site/render.ts`) `` with `` (`renderWidgetMenu`) ``. Leave `site-exporter.ts:219` alone. Comment text only."

### TV-I18N-PICKER · Tovu · merge-6
"In `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx`:
- Add `import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";` and `import { t as sharedComponentsT } from "../shared-components-i18n";`.
- `MediaPickerDialogProps`: add `useAdminLocaleHook?: typeof useAdminLocale;`.
- `MediaPickerDialog`: destructure `useAdminLocaleHook = useAdminLocale` beside `useJiniMediaPickerHook`. Add `const locale = useAdminLocaleHook();` right after `const vm = …`. In the error branch, replace the button child `Cancel` with `{sharedComponentsT({ locale, key: "Cancel" })}`. Nothing else changes.
Do NOT touch `JiniMediaPicker.hooks.ts` (no `cancelLabel`).
**Test (write it first):** in `__tests__/JiniMediaPicker.hooks.unit.test.tsx`, in the existing first test, render with `useAdminLocaleHook={() => "es"}` and replace `screen.getByText("Cancel")` with `screen.getByRole("button", { name: "Cancelar" })`. Keep the redaction and incident assertions. No new test. Mutation (combine): put back the literal `Cancel`. **Chrome look owed:** the picker error in Spanish and English."

## BUGS (confirmed on merge-6)
1. Tovu `apps/admin/src/components/MediaPickerDialog/MediaPickerDialog.tsx:150`: the picker error's Cancel button is hard-coded English in all 22 admin locales. COMMON_I18N has `Cancel` (e.g. `es` "Cancelar", `lib/i18n-common.ts:31`). Fix: TV-I18N-PICKER.
2. Tovu `apps/admin/src/components/MediaPickerDialog/JiniMediaPicker.hooks.ts:31–32`: the error's message and action ("The media could not be chosen." / "Cancel and choose the media again.") are English-only. Not in the design and unsheeted. Same copy pass as TV-I18N-REVIEW.
- Design defect, not a code bug: TV-C1 and TV-C2 cite `render/doc/marks.ts` and `render/widgets/menu.ts` as successors, but the branch they wait for deletes both.

## NEEDS-DECISION (one line each, with recommendation)
- **Scanner:** teach `development/scripts/hygiene-audit.mjs` (line ~248) to read `...translationEntry({ source })` keys and to treat `auditTranslationEntries({ entries })` as complete? **Yes**: one small Opus fix to the dev script, so 1,005 false rows stop coming back each audit. Not Codex. No product code.
- **ENV-SCHEMA:** stay parked with `ex-env*`. **Agree.**
- **ENV-1** keep both stdin-EOF names: **agree, keep**.
- **ENV-2** add one operator-facing site-switcher setting: **no new name now**. It would add a variable while keeping the old flags (raises the env count). Decide inside `ex-env`.
- **ENV-3** keep four role-specific PID names: **agree**.
- **ENV-4** one canonical public origin: **document precedence only; no new variable or rename now**.
- **ENV-5** rename the desktop sign-in capability: **defer to `ex-env`**.
- **ENV-6** `TOVU_DB_MODE` with compatibility parsing: **no now**. The rename plus compatibility code is new code for no bug. Revisit in `ex-env`.
- **ENV-7** keep both daemon token names: **agree**.
- **ENV-8** keep the Postgres names per boundary: **agree, no change**.
- **ENV-9** prefix the analytics seed and comments salt: **defer to `ex-env`**. No compatibility shim now.

## Jobs
- **`j-hyb-jini-DRAFT.md`** (Jini, base merge-6 `d3e78b387`, 1 sheet): J-C1. ~1.4k tokens; batch with other Jini sheets.
- **`j-tv-hyb-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 4 sheets): TV-C3 → TV-C1 → TV-C2 → TV-I18N-PICKER. No wait on xd5 branches. The combine resolves the one-line `theme.ts:7` comment overlap with tv-xd5-publish.
- **Combine owes:** one mutation and one Chrome look (picker). Opus copy pass for TV-I18N-REVIEW + BUGS 2 and, separately, J-I18N-JSX per feature.
- **Dropped:** the `cancelLabel` hook field and the `JiniMediaPicker.hooks.ts` edits, the wait on xd5 branches, the two now-wrong path destinations, any Jini common copy provider.
