# UI-A05: menus screen -> new `@jini-ai/admin/menus` module (+ HTML-authoring fields) (templates T-HARDEN, T-UI, T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A05`. It also removes the admin->website source import `features/menus/hooks/use-menu-editor.hooks.ts:16` (`../../../../../website/src/platform/html/slug`).

Tier: S1 Sonnet + Opus review of the port, S2 Sonnet + Opus review, S3 Sonnet. est. executor tokens ≈ 120k (S1 40k, S2 45k, S3 35k). Chrome look owed after S3.

## Findings that change the audit row
1. **`AdminMenusPort` is not a module.** `packages/admin/src/core/ports/menus.ts:234` is an interface file only (types `AdminMenu`, `AdminMenuItem`, `AdminMenuTarget`…, `AdminMenusPort`), with positional args (`getMenu(id)`, `updateMenuTree(id, input)`), no authoring fields, no controller, no React, no `./menus` subpath in `packages/admin/package.json`. Only `core/ports/index.ts`, `core/index.ts` and `core/__tests__/menu-target-narrowing.test.ts` mention it (`rg -n "AdminMenusPort|ports/menus" packages --glob '!**/dist/**'`). The model for the work is the `forms` module (`admin/src/forms/{models,ports,controllers,react,adapters,conformance,forms.module.ts,index.ts}`), which Tovu already mounts (`modules.hooks.ts`).
2. **Decision (no parallel port):** the new module's port `MenusApiPort` replaces `AdminMenusPort`. S1 keeps the TYPES in `core/ports/menus.ts` (additive fields), re-homes the port interface in `menus/ports.ts` with `(required, optional)` args, and deletes the old `AdminMenusPort` interface in the same Jini commit (zero consumers outside the two index files and docs; a grep is the step-0 guard, STOP if a consumer appeared).
3. **HTML authoring is missing from the Jini types**: `AdminMenu` has no `mode`/`html`; create/update inputs have no authoring. The server already speaks it (`cms/src/navigation/{types.ts,menu-html.ts,tool-registrations.ts:112 htmlAuthoring}`), and Tovu's DTO has it (`lib/api.ts:1562-1572`: `mode?: "items"|"html"`, `html?: string`, `AdminMenuAuthoring`). Parity row P1 below (HARDEN, failing test first).
4. **Marker owner:** the menu embed snippet Tovu writes today (`html-rules.ts:menuHtmlEmbed`) is `<div data-embed-config='{"type":"menu","id":<slug>,"mode":"html"}'></div>`. The owner of that format is `cms/src/widgets/markers/marker.ts` (`embedMarkerSnippetFromConfig`, :706). `admin` may not import `cms` (COMMON rule 5; note `admin/forms/html-rules.ts` does import `@jini-ai/cms/forms`: pre-existing debt in `scripts/injection-debt.json`, not a licence), so the snippet is an injected port `MenusHtmlHost.embedSnippet`. Byte difference: cms escapes `'`->`'` and `&`->`&`, Tovu escapes `'`->`&#39;`; for a menu slug (`toSlug` output `[a-z0-9-]`) the two are identical, so S3 binds the cms function; a Tovu test with an apostrophe slug (`__tests__/html-embed.unit.test.tsx`: check with `rg -n "'" ` on its fixtures) must be edited to a slug-shaped value. Not `formHtmlEmbed` (different type key).
5. **`toSlug` needs a third-party dep** (`@sindresorhus/slugify`, `website/src/platform/html/slug.ts:1`); COMMON rule 9 forbids adding it to a Jini package, and `asciiSlug` (`lib/ascii-slug.ts`, drops non-ASCII) is NOT equivalent (title "Café" -> `cafe` vs `caf`). So Jini takes `slugify` as an injected function; Tovu's binding keeps `toSlug`. The cross-app import is removed in S3 by importing `toSlug` from its new Jini home once CLASSIFY row 13 (`website/platform/html` MOVE -> cms) has landed: **S3 step 5 is blocked on row 13**; until then the single line stays and the sheet reports it.

## Guards (blobs at integ/wave-b)
```
tovu_files (move, then delete; i18n stays):
  - apps/admin/src/features/menus/MenuEditor.tsx | blob f9c3b65ac96996b9484199933f1cbdff0d864605
  - apps/admin/src/features/menus/MenuEditor.hooks.tsx | blob 448cb84c60277efa98f21221980aaee7c0be25a9
  - apps/admin/src/features/menus/MenuPageLinkFields.hooks.ts | blob d10020cdb24159861ca9eaa6bfc1963d640b61e2
  - apps/admin/src/features/menus/MenuPageLinkFields.tsx | blob 998c29a2a830e3133245055f889c6085c0da485b
  - apps/admin/src/features/menus/Menus.tsx | blob 16fcd13dc669a39d5d79ff49bb644912b5f3f3e6
  - apps/admin/src/features/menus/page-link-rules.ts | blob 0f84be67c7937b9679efa1fc1968eeb38884aa40
  - apps/admin/src/features/menus/html-rules.ts | blob c152288a9880298f1efd70d717f58c469b78157e
  - apps/admin/src/features/menus/hooks/menus-port.hooks.ts | blob 087974dd9f013d5d0ad3d7d1f5a5e859463d56a3
  - apps/admin/src/features/menus/hooks/menus-dependencies.hooks.ts | blob 9281d6cb783305b77b805eb10276763e792295ca
  - apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts | blob b5463818c0a28ec60755c4349ad381d1c4e0e065
  - apps/admin/src/features/menus/hooks/use-menus.hooks.ts | blob 6531e5b593738285316f45ee37e009c39965ca7d
  - apps/admin/src/features/menus/index.ts | blob 251bfc22f557ba3813c5a592fb9e0b6984933db3
tovu_tests (move, adapt, delete):
  - apps/admin/src/features/menus/__tests__/MenuEditor.header-characterization.unit.test.tsx | blob acbe1cc16c2b5c9b7816d774a8945f47bd905478
  - apps/admin/src/features/menus/__tests__/MenuEditor.remove-hook.unit.test.tsx | blob bade78b72bcd55869a2a1166854e4575305c65b6
  - apps/admin/src/features/menus/__tests__/MenuEditor.unit.test.tsx | blob 47b18fa70f552bd17c18576651ee4d345aa3e137
  - apps/admin/src/features/menus/__tests__/MenuPageLinkFields.hooks.unit.test.ts | blob 9b9c8f23ad26e3f2c0b49bdb04b2c249afb3463e
  - apps/admin/src/features/menus/__tests__/Menus.unit.test.tsx | blob 54ddcdffb5392bbaed7af6d56db1e47917fd9d7a
  - apps/admin/src/features/menus/__tests__/html-embed.unit.test.tsx | blob 44d23fa300a3d80940fecc4d258bca486e7d84d3
  - apps/admin/src/features/menus/__tests__/legacy-page-picker.unit.test.tsx | blob 39ca5b7d4b921fd4093de64f576163c1bd5065ea
  - apps/admin/src/features/menus/__tests__/menu-authoring-ux.unit.test.tsx | blob 772ea8abdf0595893b0657c2febb437a8a3d6274
  - apps/admin/src/features/menus/__tests__/menu-html-mode.unit.test.tsx | blob 99f3344be4ae3cf91b39dd7cf65f68c596bb0cbb
  - apps/admin/src/features/menus/__tests__/menu-page-catalogue.unit.test.ts | blob 028d062be44e426c111840448ec79d1ff387e9c3
  - apps/admin/src/features/menus/__tests__/page-choices.hooks.unit.test.tsx | blob 8f9e7858420329dfe09b4d7a8503dec1ecc2c100
  - apps/admin/src/features/menus/__tests__/page-link-fields.unit.test.tsx | blob bc3b9572f82a5145817b7731b5830dc74b2877f1
  - apps/admin/src/features/menus/__tests__/page-target-kind.unit.test.ts | blob a399ec4bf660e095612ce8fe13d08879800cc858
  - apps/admin/src/features/menus/__tests__/use-menu-editor.hooks.unit.test.tsx | blob cabc6cb0b5c2945cbb403ef519ef20f425da206b
  - apps/admin/src/features/menus/__tests__/use-menus.hooks.unit.test.tsx | blob 2a3386d42d8e68d1c1ac8dcd5120449c85bacd1e
  - apps/admin/src/__tests__/fqfix-editor-reopen.unit.test.tsx | blob b54ada5c569781f52ef9182b7a525777f553d2f6
tovu_kept_edited:
  - apps/admin/src/features/menus/menus-i18n.ts | blob 7f66badbb57719cb7fb9c810be85d842ca6f5c9e
  - apps/admin/src/features/menus/__tests__/menus-i18n.unit.test.ts | blob f96a60dbb43a74746e0b148cec09fb6507fb5d36
  - apps/admin/src/panel-pages.ts | blob 8205ba79d4ed4363fee4c79966df57536111283a
  - apps/admin/src/panels.tsx | blob 2f93e392805fafcdac85bb54a81f593d724738a9
  - apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx | blob c63d1c4ce9e6a0122faf5fa7a44f58c3aeb53e3b
  - apps/admin/src/integrations/jini-admin/modules.hooks.ts | blob 9452885532070b214106c9608e96081a7dce914f
  - apps/admin/src/lib/api.ts | blob e0ac6bb6d7e9815fa60fd8ba84d336385dfeb4af
jini_guards:
  - packages/admin/src/core/ports/menus.ts | blob f97317ab56bd4a641f9170bdfbee01e12ca09d43
  - packages/admin/src/core/ports/index.ts | blob 92045f35134bcf7e3f93a8446e46eaf79ca58534
  - packages/admin/src/core/index.ts | blob 0245ad272b3f58f3a89864e17ee9c5cd3f7677f5
  - packages/admin/src/core/__tests__/menu-target-narrowing.test.ts | blob 0b67cc502ffd2953b29f669c50814b7cf8d6e140
  - packages/admin/package.json | blob f2b5d622f77a970deb49575370f56f321698ce7b
  - packages/admin/src/forms/forms.module.ts | blob 92a2bc3b5ef628f27a74089559c0ee45cc83497a
  - packages/admin/src/forms/react/index.ts | blob a53e6f0128e8c14ee5b7757a32a5212e16dc0643
  - packages/admin/src/menus/** must not exist; `rg -n "MenusApiPort|menusToken|createMenuEditorController" packages/admin/src` prints nothing
```

## Parity list (Tovu screen vs the types in `core/ports/menus.ts`)
| # | Behaviour | Tovu | Jini today | generic? |
|---|---|---|---|---|
| P1 | HTML authoring: `mode`, `html`, `menuAuthoringForSave` (switching back to items clears HTML mode; html mode saves `{mode, html}`) | `html-rules.ts:menuAuthoringForSave`, `use-menu-editor.hooks.ts` `MenuFormState.mode/html` | absent | yes -> Jini (`AdminMenu.mode?/html?`, `AdminMenuCreateInput.mode?/html?`, `AdminMenuUpdateTreeInput.mode?/html?`) |
| P2 | Starter HTML generated from the item tree (nested `<ul class="menu-list depth-N">`, escaped labels/hrefs) | `html-rules.ts:menuHtmlStarter` (pure, 74 lines) | absent | yes (pure; the CSS class names are theme-contract names: `menu-list`, `menu-item`, `depth-N`, `has-children` are the cms menu renderer's classes, see `cms/src/navigation/menu-html.ts`; they move verbatim) |
| P3 | Page picker: item target kind `page` = an `entryRef` to a page, with `lastKnownHref`; `pageItemsForSave` rewrites page links to concrete entry targets | `page-link-rules.ts:1-90`, `MenuPageLinkFields*` | types have `entryRef.entryType/lastKnownHref` | yes; page list comes from an optional port `listPageChoices` |
| P4 | Immutable tree ops by index path (`mapAtPath`, `removeAtPath`, `addChildAtPath`, `moveAtPath`), stable ids (`crypto.randomUUID` with a fallback id source) | `use-menu-editor.hooks.ts:60-135` | absent | yes (pure) |
| P5 | Version conflict handling (`isVersionConflict`/`VERSION_CONFLICT_MESSAGE`), slug-redirect after rename (`slugRedirectPath`), dirty guard, copy-embed clipboard refusal | `use-menu-editor.hooks.ts:5-10` | absent | conflict + dirty guard: kit hooks (`useDirtyGuard` exists in the admin kit); version conflict: `MenusApiPort` rejects with an error carrying `code: 'VERSION_CONFLICT'`, controller maps it; slug redirect + failure channel + clipboard: host options |
| P6 | Trash with two-state ladder (Tovu: single `api.trash({type:"menu",id})`; 404 = already gone; `TRASH_VERSION_CHANGED` message) | `use-menus.hooks.ts:50-80` | `AdminMenusPort.deleteMenu(id,{force})` (two rungs) | trash semantics differ: the Tovu list only trashes (the Trash screen owns restore/purge). Jini port gets `trash(required: { id }, optional?)` returning `{ version: number \| null }`; `deleteMenu` is NOT carried (parity decision: no purge path from the menus list) |
| P7 | i18n (1,272-line dictionary, English phrase keys) | `menus-i18n.ts` | none | `t: Translate` option, dictionary stays Tovu |

## Ports (new, `packages/admin/src/menus/ports.ts`)
```ts
export interface MenusApiPort {
  list(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<readonly AdminMenu[]>;
  get(required: { id: string }, optional?: { signal?: AbortSignal }): Promise<AdminMenu>;
  create(required: { input: AdminMenuCreateInput }, optional?: { signal?: AbortSignal }): Promise<AdminMenu>;
  updateTree(required: { id: string; input: AdminMenuUpdateTreeInput }, optional?: { signal?: AbortSignal }): Promise<AdminMenu>;
  trash(required: { id: string; expectedVersion?: number }, optional?: { signal?: AbortSignal }): Promise<{ version: number | null }>;
  /** Optional: absent -> the page-link kind is hidden and pageItemsForSave is the identity. */
  listPageChoices?(required: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<readonly MenuPageChoice[]>;
}
export interface MenusHtmlHost {
  readonly embedSnippet: (required: { slug: string }, optional?: Record<string, never>) => string;
  readonly slugify: (required: { text: string }, optional?: Record<string, never>) => string;
}
export interface MenusUiHost {      // all optional, Tovu passes its own
  readonly slugRedirectPath?: (required: { base: string; requestedId: string; item: { id: string; slug: string } }, optional?: Record<string, never>) => string | null;
  readonly reportFailure?: (required: { error: unknown; scope: string }, optional?: Record<string, never>) => void;   // Tovu: publishLocalAdminFailure
  readonly clipboard?: { writeText(text: string): Promise<void> };
  readonly itemIds?: { randomUUID?: () => string; nowMs: () => number; random: () => number };
}
```
Error contract: `VERSION_CONFLICT` and "not found" are signalled by errors with `code: 'VERSION_CONFLICT' | 'NOT_FOUND'` (the same shape `media`/`forms` adapters use: `rg -n "code:" packages/admin/src/forms/adapters/http.ts` for the exact property name, STOP and copy it if it differs). Tovu's `ApiError`/`isVersionConflict` mapping lives in the Tovu adapter.

```
id: UI-A05-1 .. UI-A05-3
feature: admin/features/menus -> @jini-ai/admin/menus (+ /react, /adapters/http, /adapters/memory, /conformance)
jini_target: admin src/menus/{models.ts,ports.ts,rules.ts,html-rules.ts,page-link-rules.ts,messages.en.ts,menus.module.ts,index.ts,controllers/{menus-list.controller.ts,menu-editor.controller.ts},adapters/{http.ts,memory.ts},conformance/menus-api.conformance.ts,react/**}; package.json exports + jini.entries: "./menus" universal, "./menus/react" browser, "./menus/adapters/http" universal, "./menus/adapters/memory" universal, "./menus/conformance" universal (mirror the five forms entries, package.json:78-82 style)
kit_injection: admin kit slots Button, IconButton, TextField, Select, Switch, Dialog, ConfirmDialog, Notice, TabBar, Menu + hooks useDirtyGuard, useConfirmController (react/kit.tsx); no new slot
agent_handles: UNCHANGED (grep `handle:` literals in MenuEditor.tsx/Menus.tsx before and after; ids are a wire contract for the assistant)
changeset: @jini-ai/admin: minor | "menus: module with list and recursive editor, HTML authoring fields, page-link rules"
```

## UI-A05-1 — Jini headless (commit 1, Opus reviews ports + RED/GREEN)
0. Branch rule; blobs; guard `rg` prints nothing; `rg -n "AdminMenusPort" packages docs --glob '!**/dist/**'` shows only the two index files, the narrowing test (type-only use of the TYPES) and `docs/spec/api.spec.md` (a doc mention: reworded in this commit).
1. Failing tests first (RED = module missing; moved cases are green on Tovu): `menus/__tests__/tree-rules.test.ts` (path ops from `use-menu-editor.hooks.unit.test.tsx`: add child at nested path, remove, move up/down at edges, id source fallback), `html-rules.test.ts` (from `menu-html-mode.unit.test.tsx` + `html-embed.unit.test.tsx`: `menuHtmlStarter` empty -> `<a href="/">Home</a>`, flat, nested, escaping `& < > " '`; `menuAuthoringForSave` four combos; NEW: `embedSnippet` is injected: the rule returns what the host returns), `page-link-rules.test.ts` (from `page-target-kind.unit.test.ts`, `menu-page-catalogue.unit.test.ts`, `legacy-page-picker.unit.test.tsx`), `menus-list.controller.test.ts` (trash: 404 -> alreadyGone, `TRASH_VERSION_CHANGED`-coded error -> message, success refreshes; two rapid trash calls spend one request), `menu-editor.controller.test.ts` (create vs update, slug auto-fills from title until edited (`slugify` injected), version conflict surfaces `VERSION_CONFLICT_MESSAGE` equivalent through `messages.en.ts`, switching html->items sends `{mode:"items"}` once, dirty tracking), plus the shared `conformance` suite run against `adapters/memory`.
2. Code: `core/ports/menus.ts` (edit): add `mode?: MenuAuthoringMode` / `html?: string` to `AdminMenu`, `AdminMenuCreateInput`, `AdminMenuUpdateTreeInput`; delete `AdminMenusPort` and `AdminDeleteMenuResult`/`AdminAssignMenuLocationResult` only if unused elsewhere (`rg` guard; otherwise keep the two result types). New files per `jini_target`; every function `(required, optional = {})`, ≤ 50 lines, complexity ≤ 9 (admin limit). Source for bodies: `use-menu-editor.hooks.ts` split into a controller (state + actions on `createControllerStore`, same shape as `media/controllers/edit-media.controller.ts`) and pure rules; `use-menus.hooks.ts` -> `menus-list.controller.ts`.
3. HTTP adapter: `createHttpMenusApi({ transport, basePath }, { paths })` over the same `{ request, url }` transport type `media/adapters/http.ts` uses; routes follow Tovu's `api.listMenus/getMenu/createMenu/updateMenuTree` (lib/api.ts:3259-3290: copy the paths, bodies and the `{ menus }`/`{ menu }` envelopes), and `trash` posts to the generic trash route `{ type: "menu", id }` (`api.trash`, lib/api.ts, grep `trash:`): the path is passed in `paths.trash` by the host, not hard-coded (Jini does not know Tovu's `/workspaces/:id/trash`).
4. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/|@/lib|sindresorhus" <new files>` prints nothing; eslint; changeset; commit `feat(admin/menus): module, headless controllers, HTML authoring fields`.

## UI-A05-2 — Jini React (commit 2, Opus review)
Files under `menus/react/`: `pages/MenusPage.tsx` (list + trash `ConfirmDialog`, [Menus.tsx 78 lines]), `pages/MenuEditorPage.tsx` + `components/{MenuItemTree,MenuItemTargetFields,MenuItemAttrsFields,MenuPageLinkFields,MenuHtmlTab}.tsx` [MenuEditor.tsx 526 lines split to files ≤ 200 lines], `hooks/{useMenus,useMenuEditor,useMenuTargetEditor,useMenuItemRemove}.ts`, `index.ts` exporting `menus({ overlays }, { headerActions })` like `media()`/`forms()`. Tab keyboard: kit `TabBar` replaces `useTabBarKeyboard` (parity test: arrow keys). Class renames (each ONCE): the Tovu classes in `MenuEditor.tsx`/`Menus.tsx` (`rg -o "className=\"[a-z_-]+" apps/admin/src/features/menus/*.tsx | sort | uniq -c` gives the table; every menu-specific class -> `jini-menu-*`; shared presentation classes (`notice`, `btn-*`, `field-*`) -> kit components or existing `jini-*` classes) with counts recorded before editing. i18n through `t`. Tests (red first): the component tests of `MenuEditor.unit.test.tsx` (620 lines), `Menus.unit.test.tsx`, `menu-authoring-ux`, `page-link-fields`, `MenuPageLinkFields.hooks`, `MenuEditor.remove-hook`, `MenuEditor.header-characterization` adapted to the admin `fake-admin-kit` and `adapters/memory`. Commit `feat(admin/menus/react): menus list and recursive editor`.

## UI-A05-3 — Tovu binding + swap + delete (commit 3, Sonnet; after wave B, S1, S2)
1. New `apps/admin/src/integrations/jini-admin/menus-ports.ts`: `menusApi: MenusApiPort` built on `authenticatedAdminRequest` via `createHttpMenusApi` (paths from `lib/api.ts`), error mapping (`ApiError` 404 -> `code:'NOT_FOUND'`, `isVersionConflict` -> `code:'VERSION_CONFLICT'`, `TRASH_VERSION_CHANGED` kept), `listPageChoices` from `api.listPages()` (today's `menus-dependencies.hooks.ts:16`), `menusHtmlHost = { embedSnippet: ({ slug }) => embedMarkerSnippetFromConfig({ config: { type: "menu", id: slug, mode: "html" } }), slugify: ({ text }) => toSlug({ text }) }`, `menusUiHost = { slugRedirectPath, reportFailure: publishLocalAdminFailure, clipboard: navigator.clipboard }`, `menusTranslate` from `menus-i18n.ts`.
2. `modules.hooks.ts` (edit): add `import { menus } from '@jini-ai/admin/menus/react'`, a `menusFeature = menus({ overlays }, { headerActions: PublishSectionButton section "menus" })`, `menusApi` in `ports`, its page description to `bindings`; `menusSessionGrants` (`menus.read/create/update/trash` mirroring `panels.tsx` `anyOfPermissions` for menus: copy the existing strings, do not invent) added to the permissions list. `panel-pages.ts:30-31` lazy `Menus`/`MenuEditor` exports -> replaced by `ModulePanel moduleId="menus"` renders in `panels.tsx` for `/menus` and `/menus/:id` (same pattern as the media entry in `media-panel.ts`); `admin-route-lazy-loading.unit.test.tsx:26` loses the menus row.
3. Delete the 12 `tovu_files` and the migrated tests; keep `menus-i18n.ts` and its test. `fqfix-editor-reopen.unit.test.tsx` is rewritten against the Jini controller (its scenario: reopening the editor re-reads the menu; keep the assertion text) or deleted if `menu-editor.controller.test.ts` has the same case (record which).
4. `lib/api.ts` stays (DTOs are wire types; `AdminMenuAuthoring`, `AdminMenuMode` remain used by the adapter); type assertions `const _menu: AdminMenu = {} as AdminMenuDto` in the binding file.
5. **Cross-app import removal (blocked on CLASSIFY row 13 landing):** the `toSlug` import in `menus-ports.ts` is `import { toSlug } from "@jini-ai/cms/<row-13 subpath>"`. Until row 13 lands the binding file temporarily keeps `../../../../website/src/platform/html/slug` (report it, do not add a lint exception) — the cross-app path now lives in ONE integration file instead of the editor hook, and `rg -n "website/src" apps/admin/src/features apps/admin/src/components` prints nothing.
6. CSS/e2e renames per S2 table; `rg -n "menu-" apps tests --glob '!**/node_modules/**' -g '*.css' -g '*.ts' -g '*.tsx'` before/after counts. Census: `rg -n "features/menus/" apps` prints only `menus-i18n` consumers; eslint; commit `refactor(admin): serve menus from @jini-ai/admin/menus`.
Look (owed, Chrome): menus list, create (slug auto-fill, edited slug stays), nested items add/move/remove, each target kind (page, URL, route), HTML tab (starter, copy embed, save, switch back), version conflict (two tabs), trash + already-gone, es locale, phone width.

## untangle overlap (execute after wave B merge)
- C7 (`admin-module` contract) and C9a (kit) must be in; S2 uses `defineAdminModule`/`adminPort` from `@jini-ai/core/contracts/admin-module`, not `admin/core/module`.
- C8 touches `admin/core/ports/{forms-catalog,embed-policy,comment-repo}.ts`; not `menus.ts`. C2 repointed `agentHandle` in `MenuEditor.tsx` (applied at integ/wave-b, blob above).
- C11 `R-admin` may edit `admin/src/core/ports/menus.ts`: re-take the blob before S1.
- `A04` (widget config) lists menus via `WidgetConfigOptionsPort.listMenus`; independent.
- CLASSIFY row 13 (`platform/html` toSlug) precondition for step 5 only.

## STOP specific to this sheet
- A `core/ports/menus.ts` consumer outside the two index files appears (delete nothing; add a parity row).
- Any `handle:` text changes.
- The error-code property name in `forms/adapters/http.ts` differs from the sheet's `code`.
- A moved function exceeds complexity 9 and cannot be split without changing behaviour.
