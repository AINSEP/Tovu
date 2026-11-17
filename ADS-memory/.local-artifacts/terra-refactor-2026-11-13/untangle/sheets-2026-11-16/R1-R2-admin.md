# R1 (remainder) + R2 sheet: admin off ui, cms and agent-plugins (3 sub-sheets)

**Revision 2 (judge findings 1, 9, 16).** `packages/admin/package.json` is edited by R1c and R2b: **R1c runs in wave 2, R2b in wave 3** (INDEX §3), so they never edit it in the same wave; each removes its own dependency lines, debt keys and lockfile changes in its own last commit. Every "coordinator" line in this sheet is superseded by COMMON: the lane makes the edit itself, in the commit that needs it (Tovu `jini-kits.ts`, `main.tsx`, `deps.ts` lines are part of the paired Tovu commit).

Read `COMMON.md` first. Sites: `sites/R1.sites.tsv` (3), `sites/R2.sites.tsv` (6). Needs: C8 (landed: admin `core/ports/{forms-catalog,embed-policy,comment-repo}.ts`), C9a (landed: `packages/admin/src/react/kit.tsx` with `theme` and `mediaProviders` slots). The old R1 row (89 files) is done except these 3 call sites; `admin→agentic` and `admin→ui-kit` are gone from source (stale peers only: G-STALE-DEPS).

| Sub-sheet | Sites | Estimate (Sonnet) |
|---|---|---|
| R1c kit call sites | 3 | 35k |
| R2a forms catalog | 3 | 150k |
| R2b embed policy, comment repo, agent-plugin types | 3 | 70k |
The three sub-sheets share no file. R2a and R2b each add one Tovu wiring file.

## R1c: three call sites onto the admin kit
```
jini_files:
  - packages/admin/src/react/shell/use-admin-theme.ts:2,32,43            | edit (62 lines)
  - packages/admin/src/consent/react/ConsentFields.tsx:2,41              | edit
  - packages/admin/src/media/react/hooks/ProvidersTab.hooks.ts:5,131,199 | edit
```
1. `use-admin-theme.ts`: `applyAdminTheme`, `resolveColorScheme` → `useAdminThemeKit()` (`kit.tsx:266`). The kit's `applyAdminTheme(required: { theme }, optional: { target, document })` (`kit.tsx:189`) versus today's call `applyAdminTheme({ theme }, environment)` at `:32`: compare the `environment` object's fields with the kit's `optional` (lesson 12). Verified: `AdminThemeKit` already has `resolveColorScheme(required: { preference }, optional?: { matchMedia })` (`kit.tsx:190`) and `defaultAdminTheme` (`:191`); nothing is added to the kit.
   - A hook is called at render: `useAdminThemeKit()` goes at the top of `useAdminTheme`, and the returned functions are used inside the existing effect. Do not call the kit hook inside the effect.
2. `ConsentFields.tsx:41` reads `defaultAdminTheme.light.{bg,text,…}` in a **module-level array** of field descriptors. A kit value is only available at render, so the array becomes a function `consentColorFields({ theme })` called in the component with `useAdminThemeKit().defaultAdminTheme`. This is the deferred-read trap (lesson 3): the fallback colours must be identical; T2 pins them.
3. `ProvidersTab.hooks.ts:5`: the six rule helpers → `useMediaProviderRules()` (`kit.tsx:264`). Check that `AdminMediaProvidersKit['rules']` (`react/kit-media-providers.ts`) has all six names (`sortProvidersByConfigured`, `isEntryPresent`, `isMarkerOnlyEntry`, `maskedKeyLabel`, `isProviderBaseUrlInvalid`, `invalidBaseUrlProviderIds`) with the same argument shapes as `@jini-ai/ui`'s; add the missing ones the same way as item 1.

Tests first: T1 theme hook applies the theme through a fake kit and returns the cleanup the fake returned (fails when cleanup is dropped). T2 consent fallbacks equal the six pinned colour strings taken from the old module array. T3 providers tab order equals the fake rule's order (fails when the pinned-ids argument is dropped). Then delete `@jini-ai/ui` from admin's manifest if `rg -n "@jini-ai/ui['\"/]" packages/admin/src -g '!**/__tests__/**'` is empty, and retire the `admin→ui` same-layer helper (same commit, with its debt keys and the helper's test).

## R2a: forms catalog (the large one)
```
jini_files:
  - packages/admin/src/forms/field-settings.ts:2,21,118,297,299,340,414 | edit (445 lines)
  - packages/admin/src/forms/html-rules.ts:1,114,125-178                 | edit
  - packages/admin/src/forms/rules.ts:6,265                              | edit
  + every importer of the changed exports (census below)
tovu_file: apps/admin/src/integrations/jini-admin/forms-catalog-ports.ts (NEW; C8 §6 has the worked binding)
```
**Port (exists):** `FormsCatalogPort { fieldKinds, maxFileBytes, safeFileTypes, isBrowserSafePattern({ pattern }), escapeHtml({ value }) }` (`core/ports/forms-catalog.ts`). `FieldType` in admin becomes `string` (C8 line 109).

**The trap (lessons 1–3): four module-level values are computed from the cms tables at import time.** A port cannot be read at import time.
| Today | Becomes |
|---|---|
| `rules.ts:265` `export const FIELD_TYPES = Object.keys(FIELD_TYPE_REGISTRY)` | `fieldTypes({ catalog }): string[]` |
| `field-settings.ts:299` `export const MAX_UPLOAD_MB = MAX_FORM_FILE_BYTES / 1024 / 1024` | `maxUploadMb({ catalog }): number` |
| `field-settings.ts:297` a module-level options array reading `SAFE_FORM_FILE_TYPES` | function of `catalog` (find its export name by reading lines 285–298) |
| any `FIELD_TYPE_LABELS`-style table derived from the registry (C8 names it; `rg -n "FIELD_TYPE_LABELS" packages/admin/src`) | function of `catalog` |
Every function that reads the registry (`field-settings.ts:21,118,340,414`; `html-rules.ts:114,125-178`) takes `catalog` in its **required** object.

**Inventory before any edit (write it into the report):**
`rg -n "\b(FIELD_TYPES|MAX_UPLOAD_MB|FIELD_TYPE_LABELS)\b" packages/admin/src apps` and, for each exported function of the three files, `rg -n "\b<name>\(" packages/admin/src apps`. Known so far: `FIELD_TYPES`/`MAX_UPLOAD_MB` are used in `field-settings.ts`, `rules.ts`, `forms/react/components/FieldSettingsRows.tsx` and 1 test file. Tovu: `rg -n "FIELD_TYPE_REGISTRY|formsCatalog" apps/admin/src` printed nothing at `refactor/terra`.

**How `catalog` reaches the callers:** React callers read it from the admin kit or a module port. Search for an existing owner first (COMMON; lesson 9): `rg -n "formsCatalog|FormsCatalogPort" packages/admin/src` printed **no consumer** at the merged state, so the port type exists but nothing provides it. Add `formsCatalogToken = adminPort<FormsCatalogPort, 'admin.forms.catalog'>({ id: 'admin.forms.catalog' })` in `admin/src/forms/ports.ts` (verified: it holds `formsApiToken`, `formsTrashToken`, `formsEventsToken` at `:15-17` in that id style), make the forms module require it, and read it in `forms/react` through the module's existing scoped-ports hook (the same way the forms module reads `AdminFormsPort`). Non-React functions receive `catalog` as an argument from those callers.

**Tests first**
| # | Asserts | Fails when |
|---|---|---|
| T1 | characterization on the OLD code: for each of the cms field types, `starterField`/starter HTML output and the field-settings descriptors, snapshotted to a fixture file | any output byte changes after the port |
| T2 | same suite re-run with a `fakeFormsCatalog()` built from the fixture's own data (not by importing cms) gives identical output | a function still reads a module constant |
| T3 | `escapeHtml` is called for every interpolated value: a catalog whose `escapeHtml` marks its input shows every label, option value, placeholder and attribute marked (class: HTML output escaping) | one interpolation bypasses the port |
| T4 | `maxUploadMb` and the max-file clamp at `:414` use `catalog.maxFileBytes` (catalog with 2 MiB → clamp at 2 MiB) | constant left behind |
| T5 | unknown field type falls back exactly as `html-rules.ts:114` does today (`{ control: 'input', htmlType: 'text' … }`) | fallback changed |
T1 is taken before the edit; the fixture is data, so the admin test no longer imports cms (D-FAKES).

**Steps:** 1. T1 fixture (green on old code). 2. token + module requirement + fake + Tovu binding file (pair; the old imports still work, so this is green alone). 3. `html-rules.ts` (T3, T5). 4. `field-settings.ts` (T4). 5. `rules.ts` + all `FIELD_TYPES` consumers. 6. Delete the three cms imports; `rg -n "@jini-ai/cms" packages/admin/src/forms -g '!**/__tests__/**'` empty.
If the inventory shows more than 40 call sites to change, split steps 3–5 into a second run and say so.

## R2b: embed policy, comment repo, agent-plugin types
```
jini_files:
  - packages/admin/src/media/html-attributes.ts:8-14,26,63   | edit (101 lines; 3 non-test importers)
  - packages/admin/src/comments/adapters/memory.ts:1,39-43   | edit (83 lines)
  - packages/admin/src/agent-plugins/models.ts:1             | edit (46 lines)
tovu_file: apps/admin/src/integrations/jini-admin/embed-comment-ports.ts (NEW)
```
1. **`html-attributes.ts`**: `MEDIA_HTML_ATTRIBUTE_ALLOWED_NAMES` is a module-level alias of the cms constant (`:14`), and `isAllowedMediaHtmlAttributeName` and the parser delegate to cms. They take `policy: EmbedPolicyPort` (`core/ports/embed-policy.ts`) in `required`; the constant becomes `policy.allowedAttributeNames` at the call sites. Security (class: HTML attribute allow-list): the comment at `:63` says the client rule must mirror the server parser; keep the comment, and T1 asserts that a disallowed name, an event-handler name, an unsafe URL and an unsafe style are each rejected with the same `MediaHtmlAttributeRejectionReason` as before (characterize on old code; the fake policy is built from the recorded allow-list, and one case uses a policy that allows nothing to prove the port is the authority).
2. **`comments/adapters/memory.ts`**: `new InMemoryCommentRepo({ initialComments })` → `createMemoryCommentsApi` takes `repoFactory: AdminCommentRepoFactory` (`core/ports/comment-repo.ts:29`) in `required`. It is imported by **4 files, all tests** (`comments/__tests__/comments-api.conformance.test.ts`, `comments/__tests__/memory.unit.test.ts`, `comments/react/__tests__/comments-states.unit.test.tsx`, `comments/react/__tests__/support.ts`; 24 call sites; `rg -c createMemoryCommentsApi packages/admin/src`). The "84" of round 1 was wrong. They need a repo: add `packages/admin/src/comments/__tests__/fakes/comment-repo.ts`, an in-memory `AdminCommentRepo` with the three methods (`listModerationQueue`, `applyModeration`, `purge`), and pass it from the shared test helper those 84 files already go through (find it: `rg -l "createMemoryCommentsApi" packages/admin/src | head`; if they call it directly, change the default inside one test-support function, not 84 files). The Tovu binding must not use a cast (C8 line 149): type `initialComments` so cms's constructor accepts it, or map the items in the binding.
3. **`agent-plugins/models.ts:1`**: restate the three types locally (DESIGN B4: admin owns its plugin-list port). Copy only the fields `AgentPluginSummary` and `AgentPluginActivationInput` read: `pluginId`, `version`, `description`, `keywords`, skills' `name`, `enabled`. The host proves the fit: `satisfies` in the Tovu file against `InstalledAgentPlugin` from agent-plugins.

Then: delete `@jini-ai/cms` and `@jini-ai/agent-plugins` from admin's manifest when no production import is left (R2a must also have landed for cms).

## STOP (all three)
- A kit or port lacks a name and adding it would change `jini-kits.ts` beyond one line per name.
- R2a: a registry-derived module constant is consumed outside admin (a host imports `FIELD_TYPES`).
- R2b: the comment tests (4 importing files, 24 call sites of `createMemoryCommentsApi`; revision 2 corrected the old "84") cannot be served from one helper.
