# Audit2 executable sheets, batch A (2026-11-16, planning only, nothing executed)

Source rows: `plan/audit2-2026-11-15` `audit2/AUDIT-ADDITIONS-2-a.{tsv,md}` (A01-A67). Written against **Tovu `integ/wave-b`** (`../code`) and **Jini `integ/wave-b`**, with every cited line read on 2026-11-16. Format copied from `sheets/decided/*.md` (`sheets/audit/` does not exist on this branch): fenced id block, blobs as guards, numbered slices per Jini/Tovu commit, exact ports, tests red-first, census, STOP list. Sheets live in `sheets/audit2/`; templates `T-*.md` + `COMMON.md` apply unchanged and are appended at assembly (`cat T-<KIND>.md <sheet> COMMON.md`).

| id | kind | sheet | slices | tier | blockers | status | est. executor tokens (Sonnet) |
|---|---|---|---|---|---|---|---:|
| A02 | HARDEN then DELETE | `harden-a02-admin-media-swap.md` | 4 (Jini headless, Jini React, Tovu route flip, delete legacy) | Sonnet + Opus review (S1-S2); Chrome look + owner sign-off gates S3 | after wave B (C9a kit, R1/C2 applier passes); parked-swap sign-off (owner) | READY | 150k |
| A03 | UI (+SPLIT) | `ui-a03-external-mcp-admin-ui.md` | 3 (rules+types, React, Tovu bind+delete) | Sonnet + Opus review of ports | after wave B (C2 B0 pass for `agentHandle`); sheet adds the un-listed `external-mcp-admissions-rules.ts` (636 lines) | READY | 130k |
| A04 | UI (+SPLIT) | `ui-a04-widget-config-editors.md` | 3 (headless rules/ports, React editors behind `WidgetConfigHost`, Tovu bind+reduce) | Sonnet + Opus review (kit gaps) | after wave B (C9a landed); owner veto point: native title replaces `DockHeaderTip` tooltip | READY | 125k |
| A05 | UI + HARDEN | `ui-a05-admin-menus-module.md` | 3 (Jini headless + port, Jini React module, Tovu swap) | Sonnet + Opus review (port) | after wave B (C7, C9a); step S3-5 (remove `use-menu-editor.hooks.ts:16` cross-app import) needs CLASSIFY row 13 (`platform/html` toSlug) | PARTIAL (S3-5 blocked) | 120k |
| A06 | SPLIT (security) | `split-a06-visitor-tool-engine.md` | 3 (daemon visitor-tools, diagnostics public-errors, Tovu bind) | Sonnet + **Opus security review** (11 review points) | prior audit A03 (bound gate), C11a, server-port/C4 composition edits | READY (after preconditions) | 75k |
| A07 | SPLIT | `split-a07-members-server-domain.md` | 3 (types+ports, memory repos, tools+subscriber reader) | Sonnet + Opus review (tool authorization) | after wave B applier passes (C3, C4, R-BARRELS edit the same files; text guards); must precede CLASSIFY row 54 write-service slices | READY | 115k |
| A08 | SPLIT | `split-a08-cms-media-server.md` | 2 (pure+read-only, import entity) | Sonnet + Opus review (write-once/rollback) | HARD: CLASSIFY rows 152 (media) and 121 (image-transform) must land first; `image-transform/tool.ts` deferred (9 host ports, depends on asset-transfer + fs-files) | PARTIAL (hard-blocked; tool.ts deferred) | 80k |
| A09 | UI (+SPLIT) | `ui-a09-assistant-dock-chrome.md` | 3 (Jini headless bus+prefs+rules, Jini React dock module, Tovu bind+delete) | Sonnet + Opus review (S2: kit gaps, menu a11y) | HARD for S2: `@jini-ai/chat/react/kit` (C9b) does not exist at integ/wave-b; S1 startable now; `RoutedA2uiSurfaceCard` deferred to C10; 3 files stay (auth-warning hook, frontend-session, routed card) | PARTIAL (S2 blocked on C9b) | 110k |
| A10 | DEDUPE (+MOVE) | `dedupe-a10-byte-size-formatter.md` | 3 (core/text formatByteSize + parity table, Jini consumers, Tovu repoint) | Sonnet | none; startable now. Census found 8 non-identical formatters (row named 4): one parameterised function, parity table pins every output | READY | 32k |
| A12 | HARDEN + SPLIT | `harden-a12-desktop-site-directories.md` | 2 + 1 optional (platform/fs Electron userData resolver, Tovu binding, optional core/text uniqueName) | Sonnet | after wave B / C5 (`fs/index.ts` hot); **4 of the 6 files STAY** (product site layout, tracked-sites, `tovu init`, `@jini-ai/db` import); packaged-desktop proof for the CLI path | READY (reduced scope) | 35k |
| A13 | HARDEN + UI | `harden-a13-desktop-renderer-ui-owners.md` | 5 Jini (dismiss IME/capture, ./browser export + menu keyboard, scrollable tab strip, card-open helpers, transient-notice) + 1 Tovu | Sonnet; Opus review of S1.a (reaches 6 existing callers) | after wave B (desktop arg lane edits `App.hooks.ts`/`SiteGrid.tsx`); serialize `ui/package.json` exports with A24 | READY | 75k |
| A16 | SPLIT (security) | `split-a16-fs-files-tool-handlers.md` | 2 (platform/fs/tools behind approval+metadata ports, Tovu binding) | Sonnet + **Opus security review** (5 points) | HARD: CLASSIFY row 41 (six sibling fs-files files) must land first; approval primitive (`human-confirm`) is not in Jini: injected as `FsToolApprovalPort` | PARTIAL (blocked on row 41) | 40k |
| A11, A14, A37, A58-A60 | - | not written (another run executes them) | - | - | per task | SKIPPED | - |
| A15, A19-A22, A36 | - | not written | - | - | hard-blocked on CLASSIFY rows (139, 153, 145, 147, 147, 148) | SKIPPED | - |
| A17, A18, A23-A35, A38, A39+ | - | not written | - | - | out of context budget this run | NOT STARTED | - |

Totals written: 12 sheets (A02-A10, A12, A13, A16 + this run's 5), about 1.08M executor tokens.

## Findings that changed row judgments (for the coordinator)
1. **A02 is a swap, not a dedupe.** Tovu already mounts the finished Jini media page at `/media/new` (`modules.hooks.ts:32`, `MODULE_PAGE_PATHS`), and `media-panel.ts` is PARKED waiting for the owner's visual-parity sign-off (2026-10-03). The legacy screen gained features since (grid size, import from URL, created-by, `?id=` link, shape badges) and the Jini page has none of them plus **no i18n** (English literals; the Tovu screen has a 20-locale, 1,888-line dictionary). The sheet carries a 14-row parity table; two rows (upload label/accept per tab, HTML attribute allow-list equality) carry an explicit verify step.
2. **A03 omitted a file:** `external-mcp-admissions-rules.ts` (636 lines) is imported by both the picker rules and the banner. Moved lines are ~3.6k, not 1.9k. Jini `UiKit` needs no new slot (the components render plain elements).
3. **A04 slot already exists:** Jini `widgets` has `WidgetsSlots.ConfigFields`; the work is a default implementation behind a `WidgetConfigHost` plus catalog/defaults staying Tovu. The kit has no `Icon`, tooltip, preview frame or tab-keyboard hook: sheet decisions listed; one owner veto point (native tooltip).
4. **A05: `AdminMenusPort` is a types-only file** (`core/ports/menus.ts:234`, positional args, no authoring fields, no subpath, zero consumers). The sheet creates the `@jini-ai/admin/menus` module (modelled on `forms`) and replaces that port. The cross-app import is `toSlug` (needs `@sindresorhus/slugify`, so it cannot enter a Jini package; `asciiSlug` is NOT equivalent for non-ASCII titles).
5. **A06 depends on prior audit A03** and on three untangle lanes (C11a, C4 composition, bound-gate row). The engine moves with `callsPerTurn`, `allowedWithoutPorts`, `refusalReason`, `principalId` as REQUIRED ports (no permissive defaults). `public-errors.ts` needs `node:util`, so its entry is `node`-tagged.
6. **A07: the six files are unclassified in `CLASSIFY-files.tsv`**; row 54's other files import them, so A07 S1/S2 must precede row 54's write-service slices. Untangle rows R-BARRELS:846/2058, C3:388-389, C4:196 edit the same files (text guards). `StorageKernel` from `@jini-ai/db/kernel` (C3 mapping) must be re-mapped to `@jini-ai/core/contracts/storage` for a user-management file.
7. **A08: the audit's "CLASSIFY-152/121" are 0-based data rows** (lines 153/122: `website/features/media`, `website/features/image-transform`).

## Unverified facts the executor must check at step 0 (each sheet names the command)
- A02: P7 (per-tab upload accept) and P10 (HTML attribute allow-list parity).
- A03: exact return types of `api.connectExternalMcpOAuth`/`pollExternalMcpOAuthDevice`/`listSharedMcpConnections` for the structural copies.
- A05: error-code property name used by `forms/adapters/http.ts`; menus permission strings in `panels.tsx`.
- A06: shape of the gate that exists when S3 runs (after prior A03).
- A07: members `senderIdentity` usage (to write `MailSenderIdentityPort`), `PrincipalKind` export location.
- A08: `MediaSourceReplacement` field count; where `bytesMatchSha256` lives after row 140.
- None of the sheets was executed or compiled; test fixtures were written from reading the sources, not run. The first cloud run is their first execution.

## Remaining A rows (not written, in value order from `AUDIT-ADDITIONS-2-a.md`)
A09 (AssistantDock chrome, wave C), A10 (byte formatters -> core/text, startable now, ~32k), A11 (desktop preview, packaged proof), A12, A13, A14 (packaging scripts, startable now), A15-A22 (hard-blocked on CLASSIFY rows), A23 (desktop lifecycle, needs Opus design), A24-A67. Hard-blocked rows (skip): A08 (written, partial), A15, A19, A20, A21, A22, A36, A40, A43, A44, A54, A56. Next batch should start at A10, A09, A11, A13, then the B-wave kit rows (A28-A35).


## Batch A2 findings (2026-11-16, second run; for the coordinator)
8. **A10 is a 9-way consolidation, not a 4-way dedupe**: no two formatters are byte-identical (labels `KB`/`KiB`/`MiB`, KB digits 0/1/auto, `.0` trimming, GB tier, locale, bad-value strings). The sheet's parity table (10 inputs x 8 variants) is the spec; `installArchiveSize` keeps its mixed `KB`/`MiB` labels (owner copy decision left open). Three more byte formatters stay (fs-files `kb`, desktop `megabytes`, `ResourcesPanel` SI decimal).
9. **A12: 4 of 6 files are product and stay.** Jini `platform/fs` already has the registry/workspace/move owners and Tovu already uses them; the only missing generic piece is the **Electron-convention userData resolver** (`user-data-directories.ts` uses a *different* convention: Linux `~/.local/share`, Windows `<APPDATA>/<appName>`). Also found: `site-folders.distinctRoots` is not equivalent to Jini `canonicalNodeDirectory` (any-error fallback vs ENOENT + ancestor realpath): left as an owner decision; and a third `TOVU_DESKTOP_USER_DATA_DIR` reader in `shared-sites.ts:40`.
10. **A13: the dismiss owner already exists in Jini but is unreachable** (`ui/src/browser/useDismissOnOutsideOrEscape.ts` has no package export) and differs from Tovu's in Escape **capture** phase and IME guard: HARDEN + export `./browser`. Tab strip: Jini's is drag-reorder, the desktop one is scroll/overflow/roving-focus: separate hook, markup stays Tovu. Toast has no ui owner: new `transient-notice`.
11. **A09 needs the chat kit (C9b), which is absent at integ/wave-b**; the dock's preference ledger halves cannot move (`@jini-ai/admin/core` helpers, `INTERFACE_NAMESPACE`), only types/defaults/option lists do; `assistant-dock-bus` becomes an instance factory with a Tovu singleton.
12. **A16 needs three ports**: approval runner (`human-confirm` is Tovu-only), `toolMetadata`, default `surfaces` (daemon). `requireToolPermission`/`adaptLegacyAuthorize`/registration kit are already in `@jini-ai/core` (Tovu imported them via `@jini-ai/cms/core`).

## Unverified facts the executor must check at step 0 (batch A2)
- A09: `useTaxonomyRowMenu` return type as a plain interface; the three Tovu controllers' `update` argument shapes; whether C9b ships `InfoTip`.
- A10: hand-evaluate every parity cell before coding (V8 `3 MiB` -> `3 MB`, V7 `10240` -> `10 KB`).
- A12: `apps/desktop/package.json` depends on `@jini-ai/platform`; win32 expectation strings (backslash) in `desktop-user-data-dir.test.ts`.
- A13: the six existing callers of `subscribeOutsideClickOrEscape` stay green with the IME guard; Jini `transient-notice.css` vs Tovu's `app.css` `.site-toast*` overlap.
- A16: `AssistantSurfaceDeps` declaration site (core vs daemon); `ForbiddenError` export from core; the full default-`surfaces` expression at `tool-registrations.ts:148`.
- None of the sheets was executed or compiled.
