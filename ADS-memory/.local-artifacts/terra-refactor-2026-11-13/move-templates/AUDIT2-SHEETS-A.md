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
| A09-A67 | - | not written | - | - | out of context budget this run (see below) | NOT STARTED | - |

Totals written: 7 sheets, 22 slices, about 795k executor tokens.

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
