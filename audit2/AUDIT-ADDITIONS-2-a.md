# Codex full audit s01–s09: Claude judgment (2026-11-15, judge a)

> **Status 2026-11-18 (sheet-fixes-2, after run `wave3/audit2-a`):** A60 S1+S3 DONE, S2 rewritten (declared dependency + `apps/desktop` npm lockfile) = EXECUTABLE (`plan/audit2-sheets-a3`). A58 rewritten to the landed `desktop-host/electron` registrar = EXECUTABLE (`-a3`). A10 V1-V3 VOID (done), V4-V8 BLOCKED on owner question A10-Q1 (`-a2`). A01 VOID (done items) + BLOCKED per item; A11 BLOCKED (collides with desktop-extraction D1/D3, Opus design, packaged proof); A14 BLOCKED (packaged release-gate proof): `-a3` `sheets/audit2/status-a01-a11-a14.md`. Full table: `plan/lanes-k-t-2026-11-16` `.../lanes-2026-11-16/sheet-fixes-2-REPORT.md`.

Source: `../codex-full-audit-2026-11-15/out/s01.md … s09.md` (Codex, read-only, Tovu `b28d38c6`, Jini `b7666092`). Judged against `CLASSIFY.tsv`, `CLASSIFY-files.tsv`, `AUDIT-ADDITIONS.tsv` and the untangle lanes (`../untangle/LANES.md`, `sheets/*`). Planning only: no code touched, CLASSIFY not edited. Rows are in `AUDIT-ADDITIONS-2-a.tsv` (same 21 columns, ids `audit2:A01…A67`, ranked by value). Estimates use the prior file's rates (exec = 30k/slice + 25/line).

## Summary
- **About 245 candidates judged → 67 ACCEPT rows** (they absorb about 165 candidate entries, so about 100 merges), **about 80 REJECT** (of which about 30 are LATER/fold-into-an-existing-row).
- **Movable lines:** about 26.8k. **Tokens:** sheets about 0.62M Opus + 1.21M Sonnet; execution about 3.5M Sonnet.
- **Codex citations held up:** 25 file:line checks on ACCEPT rows, all correct. Its weak spots were (1) treating Tovu Runner product screens as generic, (2) proposing a provider plugin for TipTap (overruled by owner 11-15), (3) listing pure re-export files that R-BARRELS already deletes.
- **Biggest real finds:**
  - **A02:** the admin media screen runs its own `useMedia` controller (`use-media.hooks.ts:134`) beside Jini's `createLibraryController`/`createEditMediaController`. This is a second parallel implementation, like prior B01.
  - **A01:** 14 Tovu wrappers and local copies of existing Jini exports. They are cheap, host-side only, and startable now.
  - **A03–A05:** large admin UI blocks with an existing or planned Jini owner: external-MCP UI (about 1.9k lines), widget config editors (1.8k), menus on the existing `AdminMenusPort`.
  - **A10:** four byte formatters, two of them already in Jini.
  - **Smell for the open-bugs log:** `apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts:16` imports `../../../../../website/src/platform/html/slug`, so the admin app reaches into website source. This is not a runtime bug; A05 fixes it.

## Top 10 by value
| # | id | What | Exec (Sonnet) |
|---|---|---|---:|
| 1 | A01 | Tovu wrappers → existing Jini exports (14 files) | 39k |
| 2 | A02 | Media screen dedupe onto existing admin/media controllers | 123k |
| 3 | A03 | External-MCP admin UI → ui/external-mcp | 123k |
| 4 | A04 | Widget config editors → admin/widgets | 118k |
| 5 | A05 | Menus → admin/menus on existing `AdminMenusPort` (+ HTML fields) | 83k |
| 6 | A06 | Visitor tool engine → daemon/visitor-tools + diagnostics (security) | 70k |
| 7 | A07 | Members server domain → user-management/members | 118k |
| 8 | A08 | cms/media server additions (import, URLs, where-used, transform tool) | 78k |
| 9 | A09 | AssistantDock chrome → chat/react | 113k |
| 10 | A10 | Byte formatter consolidation → core/text | 32k |

## ACCEPT rows (old Codex refs → audit2 id)
| id | Target | Codex sources merged | Wave / start |
|---|---|---|---|
| A01 | repoint batch | s01 ConfirmActionDialog, widget-picker-port; s02 C6, C10; s03 switch; s04 N18 + site-confirm label; s05 timezone/translation/Spinner; s06 copy + folder-drop slices; s08 sqlite-source, service-ports | **now** (ConfirmActionDialog after C2 B0; not drop-in, see row) |
| A02 | admin/media HARDEN | s02 C9, C11, C12 | B (kit) |
| A03 | ui/external-mcp | s03 ×3 ext-MCP, s04 N2 | B (C9-ui, C2) |
| A04 | admin/widgets | s01 WidgetConfigFields ×8 | B (kit, C2) |
| A05 | admin/menus | s02 C13 | B + row 12 |
| A06 | daemon/visitor-tools + diagnostics | s07 visitor-executor/ports/budgets, public-errors | after prior A03, C11a, server-port |
| A07 | user-management/members | s09 members ×5, subscriber-directory | B (C3) + row 53 |
| A08 | cms/media | s09 media ×5, image-transform tool | rows 152/121 (hard) |
| A09 | chat/react | s01 dock ×13, s04 N21 | C (C9b, C10) |
| A10 | core/text | s01 archive-size label, s04 N6 | **now** |
| A11 | desktop-host/preview | s05 bridge, guests; s06 preview ×5 | **now** (packaged proof) |
| A12 | platform/fs HARDEN | s05 user-data-dir; s06 site-dir ×5 | after C5 |
| A13 | ui owners HARDEN (TabStrip, Toast, site-card, dismiss) | s05 TabStrip/SiteToast/SiteGrid; s06 tab-strip/toast/dropdown | B (C9-ui) |
| A14 | devops/packaging/electron | s05 tree-quiet, smoke-native, stage-shared, gate-isolation; s06 closure-scan | **now** |
| A15 | admin/publish-content | s03 publish-content ×5 | row 139 (hard) + B |
| A16 | platform/fs/tools | s09 fs-files ×3 | row 41 |
| A17 | cms/forms | s09 forms ×4 | row 78 + C3 |
| A18 | ui/execution | s01 BYOK panel, config-write; s04 N1, N25; s05 endpoint | B (C9-ui) |
| A19 | devops/deploy + admin/deployment | s02 C4; s08 dockerfile, deploy-config, domain-publish-tool | row 153 (hard) + B |
| A20 | mcp/federation/hosted/tools | s09 external-mcp ×2 | row 145 (hard) |
| A21 | agent-plugins/admin-surfaces | s07 delivery-bindings, handlers, surfaces | row 147 (hard) |
| A22 | agent-plugins/lifecycle | s07 auth-schemes; s08 host-signals, provider-link, memory | row 147 (hard) |
| A23 | desktop-host lifecycle | s05 boot/site-backend/windows/capture ×9 | **now** (Opus design, packaged proof) |
| A24 | ui/browser-chrome find+zoom | s06 find ×2, zoom; s05 FindBar | B (C9-ui) |
| A25 | integrations/media-providers | s09 media-generation + media credentials ×5 | after C5 |
| A26 | user-management/server | s09 identity ×4 | row 55 |
| A27 | platform/mail | s09 email-templates ×2, mail-status ×2, feedback-sources | rows 46/66/128 |
| A28 | admin/agent-plugins dedupe | s03 update control, install port/deps, AgentPlugins.hooks | B (kit) |
| A29 | admin/security HARDEN | s03 OtherCredentials, SiteKeyRecovery | B (kit) |
| A30 | chat composer | s01 composer-skills ×2; s03 installed-skills source, selected-skills | pure half now; hook after C9b |
| A31 | admin/plugins | s03 site-plugin + provider settings ×9 | B (kit) |
| A32 | admin observability views | s02 C14, C15, C17 | B (kit) |
| A33 | admin/mail/react | s02 C7 | B (kit) |
| A34 | admin/security + deployment, credential-sets types | s02 C5; s08 publish-credentials types | B (kit) |
| A35 | admin/media/documents | s02 C8 | B (kit) |
| A36 | core contribution-registry/registration-kit | s07 tool-registrations slice; s06 content-target-inputs + tool-contribution-registry label | row 148 (hard) |
| A37 | mcp/federation/hosted | s05 desktop-mcp-http; s06 desktop-mcp-runtime | **now** |
| A38 | devops/checks/coverage | s05 check-coverage | with prior D03 |
| A39 | ui/skills HARDEN | s04 N8 | B (C9-ui) |
| A40 | Jini editor surface (TipTap stays in Jini) | s05 media/title extensions ×4; s03 PostUrlDialog ×3 | TipTap surface move (hard) |
| A41 | chat transports + desktop-host bridge | s05 contracts ×2; s06 workspace-chat-ipc, attachments, runner conversations | C (C9b) |
| A42 | sidecar/supervisor | s05 desktop-agent-service; s06 site-supervisor, site-transitions | D (R11) |
| A43 | cms/forms/destinations | s09 form-destinations ×3 | row 126 (hard) |
| A44 | cms/publish contributors | s09 entries + forms publish-content | rows 139/131 (hard) |
| A45 | admin/consent + cookie-consent/authoring | s01 consent ×3; s08 consent request/tools | B (kit) + row 127 |
| A46 | analytics/tools + admin/analytics | s08 analytics ×2; s01 Analytics table | B (table) |
| A47 | ui/html-editor | s02 C18, C19 | B (C9-ui) |
| A48 | admin recovery on `AdminRecoveryPort` | s03 recovery ×4 | B (kit) |
| A49 | admin/content-analysis | s01 card; s02 C1 | B (kit) |
| A50 | core/contracts/server | s07 CSP slice, same-origin | B (C4) |
| A51 | user-management/session-bootstrap | s05 local-owner-signin, desktop-auth | with prior B04 |
| A52 | agent-runtime native-tool-policy | s07 subagent-settings, native-fallbacks | C (C6) |
| A53 | ui/theme | s01 registry; s04 N15; s05 settings-tabs accent helpers | B (C9-ui) + prior C03 |
| A54 | admin/collections | s01 collections ×3 | row 160 (hard) |
| A55 | admin/media/react field | s03 PostCoverImage ×2 | B (kit) |
| A56 | agent-plugins/exports | s07 exports/runtime | row 147 (hard) |
| A57 | admin/browser + admin/react helpers | s04 N16, N17; s01 daemon-restart hook | B (kit) |
| A58 | desktop-host version | s05 app-version ×2; s06 version/update hooks | **now** |
| A59 | mcp/testing | s06 smoke-bridge | **now** |
| A60 | agent-plugins/connect | s05 agent-plugin-tokens | with prior B06, **now** |
| A61 | user-management/react | s01 OwnerRecoverySignIn ×2; s03 RecoveryCodesCard.hooks | C (C9c), row 82 |
| A62 | ui panel-kit/preview | s04 N10, N11 | B (C9-ui) |
| A63 | cms/media transfer | s08 asset-destinations | row 112 |
| A64 | ui/panel-kit | s04 N3 (generic about 200 of 862 lines) | B (C9-ui) |
| A65 | daemon/tool-extensions | s07 installed-extension-tools | after R8 |
| A66 | ui Icon catalog | s02 C3; s04 N7 + compass label; s06 icons ×4 | **now** (before R5) |
| A67 | @jini-ai/cli prompt | s07 cli stdin/quiet input | R13 |

**Startable now (no kit, no C lane, no hard-blocked row):** A01, A10, A11, A14, A23, A37, A58, A59, A60, A66. A23 needs an Opus design first. A11, A14 and A23 need a packaged-desktop proof.
**Blocked on wave B:** about 30 rows (admin/ui kit C9a/C9-ui, C2 handles, C3 storage, C4 server, C5 vault/platform).
**Blocked on wave C or later:** A09, A30 (hook half), A41, A52, A61 (C9b/C9c/C6); A42 (R11, wave D); A65 (R8, wave E); A67 (R13).
**Hard-blocked on CLASSIFY rows:** A08, A15, A19, A20, A21, A22, A36, A40, A43, A44, A54, A56.

## REJECT (one line each)
- **Covered by R-BARRELS / C-lanes:** `form-destinations/types.ts`, `member-login/types.ts`, `assistant/mcp-ui.ts`, `contracts/core/commands/{appliers,index}.ts`, `external-mcp-{access,auth}.ts` are pure re-exports that R-BARRELS (plus C3/C10) deletes.
- **Too small or not worth a slice:**
  - s01 `jini-core-version` (18 lines of build glue) and `agent-failure-hints` (13 lines, which become provider metadata inside row 115's AgentFailureCard MIXED fix).
  - s03 `keepNewerEdit` (3), `post-editor-route-key` (33, router-scoped), always-allow fake (19).
  - s04 N4 (7), N5 (scattered helpers), N6 URL-display part, N19 (12), N22 (6).
  - s05 `server-failure` (7), `site-name` paste (15), `live-verify-checks` (39), `slug-redirect-path` (38), vitest partial-run (9; goes in D03).
  - s06 `cli-permission-layer` (37); the three unrelated URL helpers (`import-site-entry`, `supervised-site-url`, `visitor-site-path`).
  - s07 `native-approval-memory` (36; goes in C11a), `tools.ts` traversal (28).
  - s08 `credential-recovery` (29).
- **Fold into the existing row's sheet (no new row):**
  - s01 `PlainTextBlocks` → row 87; `OwnerGrantStatus` → row 111.
  - s03 `admin-surface-theme` (22 lines) → row 147.
  - s04 N24 `boot-token-fragment` → prior A08.
  - s06 site-chat `SiteAssistantWidget.hooks`, `site-assistant-errors`, `tool-confirmation` → row 133 HARDEN; `assistant-vault-compat` → prior B10 secrets sheet.
  - s07 `form-delivery-status` → rows 78/126; `plugin-install-source` → C8 plugin-sdk; `site-cookie-consent` → row 127.
  - s08 per-feature agent-tools schemas → their feature rows; `mail-dns-tools` → row 134; `deployments/ports.ts` (dead, only re-exported by `index.ts:22`) → delete with the planned `deployments/types.ts` deletion.
- **Host or product policy:**
  - s02 dashboard (StatCard trivial, `mergeRecent` about 10 lines; s02 label 7 rejected too); s02 C16 queries panel (TanStack devtools choice).
  - s04 N20 failure-channel envelope (mostly trust/wording policy); N23 AG-UI (3-line binding of a protocol already wrapped by chat `createAgUiRunClient`).
  - s05 settings-tabs consent withdrawal; `check-js-backslide` (desktop policy).
  - s06 demo tools ×3 (product demos); `smoke-packaged-chat` (Claude/Haiku, site_guide, SQL flow); `vite-public-guard` (build config).
- **Test or dev tooling without a Jini twin:** s04 N9 + N14 fakes (each owner sheet writes its own `/testing` adapter); s05 `one-react`/`resolve-ts-ext`, `verify-find-in-page`, `app-render-harness`; s06 `source-test-harness`, `check-bundle-mounts`, `measure-bundles`.
- **LATER:**
  - s01 `dev-proxy-upstream-close` and s05 `admin-dev-proxy`: dev-launcher batch with prior B08/D13/D14. The probe is not a drop-in for `probeLoopbackHttp`.
  - s05 `check-complexity`: AI-Dev-Shop ratchet, prior D10 owner question.
  - s01 `VisitorToolsPanel` and s07 `visitor-page-tools`: after A06.
  - s01 `provider-schemas`: needs an auth setup-schema contract with oauth row 36.
  - s04 N12 voice: parked by the owner.
  - s04 N13 WebMCP `admin-page-tools`: prior C05, no admin WebMCP owner.
  - s05 owner-store family (774 lines) and s07 `owner-store-import`: need an Opus design of a cross-site credential inventory owner.
  - s05/s06 product telemetry (616 lines): needs a vendor-neutral sender and consent design.
  - s05 `desktop-agent-inventory` and `desktop-agent`: wait for C6/R8, which reshape the daemon runtime.
  - s08 `install-tool`: reconcile with `plugins/host/tools` (Opus).
- **Runner product screens with no second desktop consumer (LATER):**
  - s05 `ResourcesPanel`, `SitesFolders`, `SiteStartPanel`, `SettingsControl`, `LoadedSitesStepper`, `SiteWorkspace`.
  - s06 `expanded-mode`, `site-shell-policy`, `use-live-views`, project tabs/workspace/close-ask, resources/inventory polling, `site-power`, delete/rename, `import-drop`, preference controllers, `create-site-plugin-tokens`.
  - Re-judge if a second desktop-host app appears.

## Wrong backlog labels: confirmed
- **Confirmed** (row numbers are `CLASSIFY-files.tsv` lines):
  - s01: AgentFailureCard hooks/card should be MIXED (7/8). Plugin preferences is a partial dedupe under `/lifecycle` (22). AssistantToggleRow: extend ui first (55). VisitorAssistantTabs is HOST (56). WidgetPicker targets `admin/widgets/react` (51). use-collections targets `admin/collections` (86). Consent dictionary is HOST (90). Archive size is not drop-in; it becomes A10 (40).
  - s02: content-analysis target is Jini, not `@tovu/contracts` (93, A49). Menu removal is MIXED (146). `menuHtmlEmbed` is not `formHtmlEmbed` (147). Member port verified, so it becomes a repoint (145). Theme publication-state is HOST (160). Embed-placeholder must inject (158).
  - s03: surface-frame is MIXED (185). Install port is a partial dedupe (183). File-tree routes to `useAgentPluginFileTree` (195). `package-file-tree` is a HOST adapter (200).
  - s04: site confirm should use `useConfirmRequest` (264, A01). Source-control port needs adapter/parity work (274). ThemeExplore is a partial dedupe (297). Compass is MOVE (300, A66). `ascii-slug` is MOVE: consolidate with row 12's `toSlug` (350). The working-directory adapter is MOVE, not DELETE (356). Live locale is extract (325). The html2canvas binding goes to a provider plugin.
  - s05: `adapter-context` is HOST (363). The fetch-query target is `/fetch-query` with `isOnline: () => true` kept (364). `ledger-slice` is HOST (365). `unique-id` needs parity first: Jini `randomUUID` falls back to `Math.random` (379). `visitor-tools` is HOST (382). `contracts/find-in-page` is HOST (390). The update preference is MIXED (399). `keyed-serializer` is a shared-owner move, and CMS `createKeyedLock` must not become a cross-package import (401).
  - s06: onboarding policy is HOST, and deleting it drops the Supabase restriction (417). SiteAssistantHeader hardening is stale (454). remixicon is HOST (458). `persistable-messages` targets `/transports/http` and keeps the `inputPending` exclusion. The component-catalog tool needs an execution adapter (477). Deleting `demo-image-png` needs a replacement (484).
  - s07: `credential-copy` is SPLIT (530). `approval-policy` is a HOST subtype (558). The `mode.ts` DELETE is wrong: it is live visitor-CLI security policy, called at `site-assistant.ts:590` (513, verified). `tool-contribution-registry` is not DELETE (519, A36). agent-session/tenant-scope are HOST (501/503). Credential stores: stale (487/510). `entry-refs/repo.memory` must be exposed first (535). `operation-lock.ts` is one shared host instance; the GOV-ADR-002 comment was verified, and per-caller instances would break the exclusion.
  - s08: `byo-client`, `oauth-bindings`, `credentialed-request`/`tool-registrations`, `run-ops`/`typed-secret-card`/`domain-dns tools` are all HOST (595/598/630/636/649/651/673). Comments are MIXED (606/608/611). `card-token` is not a duplicate (628). `table-catalog`'s Drizzle slice goes to a provider plugin, matching prior D07 (642). `publish-consent` must keep its fail-closed refusal (662, verified).
  - s09: `auth-mail` is HOST (776). `render-entry` is MIXED (705). `rewrite-actions`/`select` are MIXED (698/699). `api-key-secret` is MIXED (711). `document-archive`'s yauzl binding goes to a provider plugin (754). `external-mcp-repo` resolves to mcp per owner 11-15, with the kernel injected via C3 (690). `fetch-image` is HOST (748).
  - s09 SQL repos (`mfa/passkeys/recovery-codes`, `entries repo.rows`, `feedback-inbox`, `suppression`; 716/681/737/743): **confirmed HOST only for the concrete Tovu-table SQL.** Whether a Jini package owns those schemas is the C3 storage design's call, so keep MOVE-AFTER until C3 decides.
- **Rejected:**
  - s04 TipTap `block-atom-insert` → provider plugin: overruled by owner 11-15 (TipTap in Jini).
  - s04 SiteExportTab MIXED for a 7-line helper.
  - s02 label 7 (dashboard `mergeRecent`).

## Owner questions
None new. The two from the prior audit still apply: dev-analysis engines to AI-Dev-Shop (it governs `check-complexity` here), and the stateful `SingleUsePlanStore` in core. One choice was made under the existing rule, with no question raised: Runner product screens stay in Tovu until a second desktop-host app exists, following the package-extensibility "named second consumer" rule.
