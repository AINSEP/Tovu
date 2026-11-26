DONE 42/70/0; NEEDS-OPUS 5 (4 rewritten in Appendix A: A13 A18 A22 A24; 1 held: WMZ19c); verdict corrections 19; expected counter drop 330 (range 290–360; MOVE part ≈155 of the 253 claimed)

# X4 check — Codex extraction sheets `plans/x4-1125/{admin,wal,wmz,rest}.md` (2026-11-26)

Unattended, read-only cloud review.

**Role.** I read `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2) first and reviewed as Software Architect: package boundaries, contracts, dependency direction, and build-order slicing. This was not an ADR pass, since there is no spec or preflight for a review of build sheets.

**Inputs.**
- Sheets: Tovu `origin/plan/whats-left-1122` @ `343aec29`.
- Code anchor: Tovu `origin/integ/merge-24-2026-11-25` @ `5087e8fd` and Jini @ `0ba3fd79`.
- Drift from the sheets' anchors (Tovu `a96020e1e7`, Jini `0718702bb`): 5 Tovu files (test files and 2 plugin fixtures) and 2 Jini files (`agent-plugins/site/bundled-id-upgrade`). None of them is a sheet anchor.

**Method.**
- Four Sonnet subagents (high effort), one per slice, ran read-only checks against the code:
  - STAYS-HOST: 169 of 196 files spot-checked (admin 42 read plus 13 by LOC/imports, wal 35, wmz 48, rest 44).
  - Every Jini reuse anchor and every new target subpath.
  - LOC and importer counts.
  - Undeclared cross-package imports.
  - Product strings.
  - Security mutation coverage.
- I personally checked the cross-slice conflicts, the hot shared files, the four "Opus check" controllers, the A13 email contract, and the subagents' highest-impact claims: WMZ01 duplicate, WMZ16 export, WMZ20 name collision, `infra` entries, and the Jini dependency graph.

**Constraints honored.** No builds, tests, or codebase-memory tools. Nothing was pushed except this branch.

**Verdict counts.** 116 sheets: 42 APPROVE, 70 FIX, 4 NEEDS-OPUS (rewritten below; the table rows say so), 0 REJECT.

## 0. What decides whether the counter drops (read first)

1. **The keep ledger has no owner.** STAYS-HOST rows and every BIND residual leave the 449 only through exact keep entries, and no sheet writes them.
   - **Fix (new sheet K0, runs first and again after every sheet):** create `plans/count-1125/x4-keeps.md` from Appendix B (177 confirmed STAYS-HOST paths, with the 19 corrections removed).
   - Append each BIND residual's exact path once it passes G3.
   - Re-run `combine-18-plan.mjs` + `scan.mjs` with the five 1124 reports plus this file.
   - This step alone is about −177.
2. **253 MOVE is not 253 deletions.** By my tally after the fixes below, about **110 files are DELETE and about 143 are BIND** (they stay at their path as "bindings").
   - A BIND drops only if its residual is a pure binding.
   - The sheets give no residual size for about 60 of them, and several "bindings" are 450–1,570-line files.
     - Large BIND files: `Media.tsx` 1,573, `StaticSiteTab.tsx` 1,427, `publish-agent-tools.ts` 1,206, `external-mcp/tool-registrations.ts` 896, `site-key-ensure.ts` 842, `backup-service.ts` 775, `publish-credentials/store.ts` 756.
     - Files 67–88% identical to existing Jini files: WMZ03 and WMZ17.
   - G3 below makes the test mechanical.
3. **Systemic dependency defect.** Jini's convention is strict injection.
   - Production `src` of `admin`, `cms`, `devops` and `integrations` has **zero** imports of `@jini-ai/{ui,ui-kit,admin,cms,chat}` outside each package itself.
   - `cms`, `devops`, `db`, `platform` and `agent-plugins` declare only `core`.
   - Yet most MOVE sources value-import `admin`, `ui`, `ui-kit`, `chat`, `daemon`, `platform`, `user-management`, `cookie-consent`, `diagnostics` and others. The sheets name ports for only a fraction of these.
   - Several imports would close cycles:
     - `cms→admin` (admin dev-depends on `cms`)
     - `cms→user-management` (user-management imports `cms`)
     - `cookie-consent↔cms`
     - `db→daemon`
   - Without G1, Sol either adds edges (guard red, and merge-24 already has 49 SI-domain guard rows open) or stops.

## 1. Global fixes (apply to every sheet; each table row assumes them)

- **G1 — Injection rule (mechanical).**
  - For each moved file, list its `@jini-ai/*` **value** imports whose package is neither the target package nor in the target's `dependencies`/`peerDependencies`.
  - Each one becomes a member of one required `deps` (or `kit` for views) object argument. Hooks become required props, with no defaults.
  - Its type is declared **structurally in the target file**. Do not `import type` from an undeclared package.
  - `@jini-ai/cms/core` imports of `requireToolPermission` etc. are repointed to `@jini-ai/core` (`core/src/tool-permissions.ts:75`).
  - Never add a new runtime `@jini-ai/*` dependency edge in an X4 sheet. If one file needs more than 15 injected members, STOP that file and report it (see Q2).
  - Admin sheets affected: A03, A06, A07, A09, A12, A13, A18, A19, A20, A22, A24, A25.
  - Website sheets affected: WAL-02, 09, 12, 13, 14, 15, 17; WMZ02, 03, 04, 13, 16, 19, 21, 24; X4-23, 26, 27, 32, 34–37.
  - A22 additionally imports the Tovu workspace package `@tovu/publish-content-ui`. That import must become an injected member too.
- **G2 — Product identity.**
  - Every Tovu string or identifier listed in the per-sheet "inject" fix becomes injected copy or config. Persisted or wire bytes keep **exactly** their current values, passed in from the Tovu binding. Examples:
    - `tovu-peer` / `tovu-peer:` (`publish-history.ts:55,223,248`)
    - `ui://tovu/…`, the `tovu-*` app names
    - `"tovu.admin.media.cardSize"`, `"tovu.outbox.traceparent"`
    - `X-Tovu-Static-Export`, `x-tovu-static-export`
    - `ownerKey === "tovu"`, `TOVU_SITE_KEY`, RP name `'Tovu'`
  - Renaming any of them is a migration and is out of scope.
- **G3 — What counts as a pure BIND residual (the counter test).**
  - Allowed: imports; host constants, copy, tables; exactly one call per Jini factory or component with Tovu arguments; one-expression arrow adapters; a JSX mount that passes props.
  - Not allowed: `if`/`switch`/loop/`try`, except a single null-guard; any SQL; any `use*` hook other than the ones being passed.
  - Sol records each residual's LOC in `COMMIT-PLAN.md`. A residual that fails G3 gets no keep entry, and the sheet reports it as "not counted", never as done.
- **G4 — Hot shared Tovu files.**
  - `R/tool-catalog-manifest.ts` is edited by 25 sheets, `assistant/tool-registrations.ts` by 16, and `publish-content-manifest.ts` by 8 (plus WAL-07 and WAL-08).
  - All website sheets (wal, wmz and rest) therefore run in **one lane** in the order of §6. Only the admin slice runs as a parallel lane.
  - The headers of wal and rest ("No sheet requires another slice to ship first") are **false**. See §6.
- **G5 — Security mutation floor.** Every sheet touching secrets, auth, deletion, restore or migration has at least one mutation that flips the dangerous decision itself. Missing ones are added in the rows below by exact name.
- **G6 — STAYS-HOST corrections** (§5) are folded into the named sheet as extra MOVE rows.

## 2. admin (29 sheets: 11 APPROVE / 14 FIX / 4 NEEDS-OPUS→rewritten)

| sheet | verdict | exact fix text |
|---|---|---|
| A01 | APPROVE | Jini `useAdminLocale` takes one `UseAdminLocaleArgs` object. The binding adapts Tovu's `(port?)` call shape, a one-call body (G3). |
| A02 | APPROVE | Host-only. The existing `sk-SENTINEL` assertion (`execution-settings.binding.nonsecret-ledger-and-rollback.unit.test.ts:12-17`) covers `execution-ledger-send-key`. |
| A03 | FIX | (1) `admin/core/settings/settings-tabs` is a `universal` entry, but the source value-imports `normalizeAccentColor` and `DEFAULT_NOTIFICATIONS_PREFERENCES` from `@jini-ai/ui`. Inject both as `deps.normalizeAccentColor` / `deps.notificationDefaults`. (2) Correction: move `applyAccent` (`hooks/use-admin-appearance.hooks.ts:34-52`) to new `@jini-ai/admin/shell/lib/paint-admin-accent#paintAdminAccent({ accent, root }, _optional = {})` (`browser`). The hook then becomes a pure painter binding. Mutation `paint-skip-ink-variable`. (3) Inject the 11 product-string hits in `SettingsUi.tsx` as `copy`. Residual `SettingsUi.tsx` must pass G3, otherwise it is not counted. |
| A04 | FIX | The relay is a **new** file. The cited source `chat/src/core/assistant-client/ag-ui-approval-relay.ts` does not exist. Put it beside the existing AG-UI code as `chat/core/assistant-client/ag-ui-approval-relay`, not a new `transports/` folder, and export `./core/assistant-client/ag-ui-approval-relay` (`universal`). Correction: move `followDurableRun` (`lib/durable-run-subscription.ts:9-20`) next to `subscriptionEnded` in `admin/shell/lib/stream-activity.ts`. |
| A05 | FIX | `chat-cleanup.hooks.ts` imports `@/lib/assistant-chats` (Tovu); make it the required `deps.chats`. The "exactly the selected IDs" pin is already in the sheet. Add mutation `chat-cleanup-delete-unselected`. |
| A06 | FIX | G1 for the `chat/react` values (`ChatPane`, `ChatSettingsDialog`, `JiniChatProvider`, `createMidRunMessagePoster`, `useT`) and `isTerminalRunStatus`. Pass them as `kit.chat`. G2 for `window.__tovuAssistantMessages` (`messages-change.hooks.ts:145`, `AssistantDock.tsx:43`), `data-tovu-local-cli` (`DockChatPane.tsx:254`) and "Tovu assistant" (`AssistantDock.state.hooks.ts:272`, `DockChatPane.tsx:122`). The global name stays the same value, injected. Correction: move `subscribeExecutionConfigRefresh` and `storedKeyIo` (`hooks/execution-config.hooks.ts:62-93`) to `@jini-ai/admin/shell/components/AssistantDock/hooks/execution-config-refresh`. Mutation `exec-config-skip-visibility-revalidate`. Note: `AssistantDock/execution-config-write.ts` (93 LOC, real logic) is in no X4 table; leave it untouched and record it as uncounted. |
| A07 | FIX | G1: seven `@jini-ai/admin` modules, plus `ui`, `ui/tab-strip`, `ui/admin-widgets`, `ui-kit/react` and `integrations`. If Q2 is answered yes, retarget to `@jini-ai/admin/screens/media/…`, beside the existing `screens/media/{rules,grid-size,media-tabs.hooks}`. G2: `"tovu.admin.media.cardSize"` (`Media.tsx:1430`) is injected with the same value. `Media.tsx` (1,573) must end ≤60 lines (G3), otherwise it is not counted. |
| A08 | APPROVE | — |
| A09 | FIX | G1 (admin `widgets`, `media`, `media-content-rules`, `shared-components-i18n`, `DockHeaderTip`, `DevicePreviewFrame`; `ui`, `ui-kit`) and Q2. The bound picker view/hook residuals must pass G3. |
| A10 | APPROVE | — |
| A11 | FIX | Add the pin and mutation `database-show-migrate-forward-when-unavailable`: migrate-forward availability is unchanged. |
| A12 | FIX | Make the Tovu end state deterministic. Fold all controller bindings into `deployment-panel.tsx` and **DELETE** `StaticSiteTab.tsx` and the three hooks: counter −4 rather than "mounts or fold". G1 (admin `deployment/*`, `shell/*`, `ui` fetch-query/tab-strip/panel-kit) and Q2. G2: `tovu export <dir>`, `TOVU_*` copy. Add mutation `deploy-render-saved-secret` (a saved credential renders only its hint). |
| A13 | NEEDS-OPUS → **rewritten (Appendix A)** | Target `@jini-ai/admin/screens/email/` (Q1). All four Tovu files are deleted (−4, not −2). |
| A14 | APPROVE | — |
| A15 | APPROVE | — |
| A16 | APPROVE | — |
| A17 | APPROVE | — |
| A18 | NEEDS-OPUS → **rewritten (Appendix A)** | Line-range cut. G1 and Q2 apply. |
| A19 | FIX | G1 (admin `screens/plugins/*`, `react/kit`, `shell/*`; `ui`, `ui-kit`) and Q2. G2: `productName: "Tovu"` ×3. Add mutation `agent-plugins-drop-expected-old-digest` (`AgentPlugins.tsx:107` flow). |
| A20 | FIX | G1 and Q2. `rules.ts` (563 lines) keeps TipTap logic under the rich-text hold, so it is **excluded from the claimed drop** (−3, not −4). |
| A21 | APPROVE | New `admin/screens/routines` directory. The release check, timer and desktop-only behavior are host policy (G3 holds). |
| A22 | NEEDS-OPUS → **rewritten (Appendix A)** | Line-range cut. G1 for `@tovu/publish-content-ui` and `admin/publish-content/screen/publish-scope`. |
| A23 | APPROVE | — |
| A24 | NEEDS-OPUS → **rewritten (Appendix A)** | Line-range cut. Also: `@jini-ai/user-management/react/auth/RecoveryCodesCard` has **no export entry**, so add `./react/auth/RecoveryCodesCard` (`browser`) to user-management with a minor changeset. G2: `TOVU_SITE_KEY`, "Remove from Tovu". Add mutation `recovery-codes-shown-after-dismiss`. |
| A25 | FIX | G1 (admin `screens/settings/external-mcp-*`, `screens/providers/*`, `version-conflict`, `ConfirmActionDialog`) and Q2. The `Providers` shell in `integrations` would otherwise import admin views; with Q2=yes it goes to `admin/screens/providers/Providers`. |
| A26 | APPROVE | — |
| A27 | FIX | The cited `@jini-ai/devops/source-control/react/SourceControl` does not exist. Use `@jini-ai/devops/source-control/react` (barrel entry) and `…/react/ProvidersTab`. |
| A28 | FIX | `Storage.tsx` value-imports `ui-kit/react`; pass `kit.Button` (G1). `platform/retention` is type-only, which is fine. |
| A29 | FIX | Add mutation `trash-render-permanent-delete-without-permission`. The sheet's claims "no automatic permanent delete" and "no widened permission" have no mutation. |

## 3. wal (17 sheets: 8 APPROVE / 9 FIX)

| sheet | verdict | exact fix text |
|---|---|---|
| WAL-01 | FIX | Correction (security): `api-connections/vault-store-binding.ts:59-61` inlines the vault `authorize` predicate (scope equal, `principalId` null, `binding` null). Replace it with one shared Jini helper: generalize the existing `authorizeDestinationVaultContext` into `@jini-ai/core/contracts/site/vault-context#authorizeScopedVaultContext({ context, scope }, _optional = {})`. Bind both callers. Mutation `drop-principal-null-check`. |
| WAL-02 | FIX | Requires X4-02. G1: cms must not import `daemon`/`platform`; inject them. Add mutation `picked-folder-escapes-root` (a `..` or absolute path in `resolvePickedFolder` is refused before any read). The residual depends on `fs-files.ts`/`site-file-request.ts` (not in the table), so do not touch them. |
| WAL-03 | APPROVE | After WAL-02 and X4-02. |
| WAL-04 | APPROVE | After WAL-03. |
| WAL-05 | APPROVE | `plugins/host/hook-refusals` is injected, as written. |
| WAL-06 | APPROVE | Serialize on `publish-content-manifest.ts` (§6). |
| WAL-07 | APPROVE | Same. |
| WAL-08 | APPROVE | Same. |
| WAL-09 | FIX | **Split into WAL-09a…09g (Appendix A).** One shared injected `publicOrigin` resolver replaces both `connect-tool.ts:44-69` (`resolveConnectRedirectUri`, reads `TOVU_PUBLIC_URL`) and WAL-15's `tool-registrations.ts:215-227`. That resolver moves; only the env-var name stays host-side. `layout.ts:59-62` keeps `TOVU_AGENT_PLUGINS_DIR` as an injected `rootOverride`. G1 for `cms`/`platform`. Realistic drop −6…−9 of 12. |
| WAL-10 | FIX | Correction: `custom-credentials/tool-registrations.ts` (520 lines, over the limit) owns `loadCreateCredentialProviders` (:306-320). Move it to `integrations:credentialed-http/tools#loadCreateCredentialProviders` and split the copy block into `custom-credentials/tool-registrations.copy.ts` (host). Mutation `create-provider-catalog-drop-fallback`. The sheet stops being host-only for that row. |
| WAL-11 | APPROVE | — |
| WAL-12 | FIX | `db` must not import `daemon` (cycle); inject the gateway and confirmation (G1). Add mutations `execute-unconfirmed-restore-plan` and `restore-point-outside-operation-lock`. Name the ext-crp confirmation owner as a prerequisite (already merged in merge-24; bind it as a port). |
| WAL-13 | FIX | **Split into WAL-13a…13d (Appendix A).** Corrections: `deploy-ops/run-ops.ts:45-47,70-87` (bounded-transport wrapper, sha256 fallback) and `deploy-ops/tool-registrations.ts:34-54` (secret-confirm ceremony) move in 13a as `devops:deploy/site/deploy-ops/{run-ops,secret-confirm}`. Mutations `forward-unbounded-response`, `confirm-before-permit`. G2: `tovu-peer`, `ui://tovu/…`, app names, `ownerKey === "tovu"`, and the `@tovu/contracts/*` types become structural (G1). Wrong test paths: `publish-credentials/__tests__/project-scope.unit.test.ts` → `custom-credentials/__tests__/project-scope.unit.test.ts`; `deploy-ops/__tests__/tool-registrations.test.ts` does not exist, so create it. Add mutation `project-write-without-owner` (owner-only project write). Requires WMZ17. X4-21 follows 13c. |
| WAL-14 | FIX | `platform:mail/email-template-tool-registrations` must not import `cms`. Type the store as a structural `EmailTemplateStorePort` declared in platform. |
| WAL-15 | FIX | Add mutation `access-write-keeps-stale-credential-pointer`. Use the shared `publicOrigin` resolver from WAL-09. G2: app name `tovu-external-mcp-save`. G1: mcp must not import `cms`/`daemon`/`ui`. |
| WAL-16 | APPROVE | — |
| WAL-17 | FIX | HARD (identity). Add mutations `authz-sql-drop-workspace-predicate` (parity of the SQL fork before deleting `repo.authorization.ts`), `permission-list-skip-permission-check` and `user-create-schema-exposes-password`. G2: app names `tovu-identity-user-create{,-outcome}`. G1: user-management must not import `daemon`/`platform`/`cms`. Must land before WMZ24. |

## 4. wmz (27 sheets: 6 APPROVE / 21 FIX)

| sheet | verdict | exact fix text |
|---|---|---|
| WMZ01 | FIX | **Do not add** `user-management/project-keys/shared-oauth-disconnect`. It duplicates the existing `@jini-ai/integrations/api-connections/shared-oauth-disconnect` (`inspectSharedOAuthDisconnect`, `disconnectSharedOAuth`, same 5 exports, verified). BIND the Tovu file to that module with owner workspace, digest and copy. No user-management changeset. Add mutation `disconnect-other-owner-credential`. |
| WMZ02 | FIX | Each of the four BIND files (131–168 LOC) must pass G3. Otherwise state which function stays and why, and do not count it. G1 for `platform/mail`/`platform/system`. |
| WMZ03 | FIX | `provider-credential-store`, `provider-credential-vault` and `view-video-tool` are 67–88% identical to their Jini files. Change them from BIND to **DELETE**, binding at the call sites (`modules/media.ts`, `media-video-ports.ts`). Add mutation `change-credential-aad` against the sealed legacy fixture. |
| WMZ04 | FIX | Keep `generation-credentials` in `cms/media/site-generation/…` behind ports, not in `integrations`; putting it in integrations forces a `cms→integrations` edge. The `tool-registrations.ts` residual (508) must pass G3. Before deleting, list each surviving Tovu function. Must land before X4-17. |
| WMZ05 | FIX | Requires WAL-02, WAL-03 and WAL-04. The `asset-transfer/*` and `image-transform/tool.ts` repoints refer to files those sheets **delete**, so skip them if the files are already gone. Delete the handler bodies that Jini duplicates; the residual (451) must pass G3. |
| WMZ06 | FIX | G2 for `providers.ts:35`. |
| WMZ07 | FIX | Add mutation `remove-member-before-authorize`. |
| WMZ08 | APPROVE | Serialize on `publish-content-manifest.ts`. |
| WMZ09 | FIX | Add mutation `launch-when-sending-disabled`. |
| WMZ10 | FIX | **Split into WMZ10a…10d (Appendix A).** Requires X4-04 before 10d. Run the H2 migration tests (merge-24 leftover 6) before 10a. Add mutation `delete-post-without-expected-version`. |
| WMZ11 | FIX | Give a definite verdict: **DELETE** `html-change-recording.ts` and bind permission, reporting and copy at `tool-host.ts` (already a binding). Add mutation `undo-overwrites-newer-version`. |
| WMZ12 | FIX | Add mutation `execute-against-stale-approved-snapshot`. |
| WMZ13 | FIX | The Jini callback receives the already-classified Unix kind. Delete `isSpecialUnixEntry` (`install-archive.ts:15-19`) from Tovu, so the residual passes G3. |
| WMZ14 | APPROVE | — |
| WMZ15 | APPROVE | — |
| WMZ16 | FIX | Drop the "add export" step. `db/package.json` already exports `./recovery/*` (`node`), so no changeset is needed. Add mutations `restore-without-confirmation` and `deep-link-plan-before-authorize`. G1: `db` must not import `daemon`. |
| WMZ17 | FIX | `vault-adapter.ts` is mostly identical to Jini. It ends as a G3 binding of no more than 40 lines, otherwise DELETE it and bind at its consumers. Keep the `change-vault-owner-key` sealed fixture. Must land before WMZ18 and WAL-13b. |
| WMZ18 | FIX | G2 for `credential-setup.ts:8,160`. Add mutation `clear-saved-token-on-blank-patch`. |
| WMZ19 | FIX | Split into three parts. **19a**: the guard CLIs (`seal-aad-invariant`, `secret-scan-guard`), plus mutation `leak-secret-value-in-finding`. **19b**: `keyring.env.ts` (17 prod / 198 test importers), with its own importer-ledger commit. **19c**: `site-key-ensure.ts` (842 lines, about 40 functions) and `site-key-sources.ts` (296) are **HOLD / NEEDS-OPUS**. The plan/ensure/settle/adopt/mint state machine has no Jini home in the sheet. This is the root key: do not cut it without a designed `platform/secrets/root-key/ensure` contract. Expected drop for 19c is 0 this round. |
| WMZ20 | FIX | Name collision: `devops/static-export/runner.ts:272` already exports `exportSite`. Name the new entry `devops/static-export/site/site-exporter#exportHostSite`. The anchor is `runExport` in `devops/src/deploy/site/export-run.ts`, not `static-export`. |
| WMZ21 | FIX | Correction: `site-backup/import-keep-off.ts:15-27` (`contentStore`, Kysely SQL over cms tables) moves to `cms/site/keep-off-content-store` (`node`) and implements devops's `KeepOffStore` port (`devops/src/backup/site/import-keep-off.ts:27`), bound in Tovu. The path is `devops/backup/push-jobs`, not `backup/site/push-jobs`. G2: tool descriptions `tool-registrations.ts:73,87,113` and the `TOVU_SITE_KEY` copy `backup-service.ts:280,283`. Add mutation `push-to-private-target`. |
| WMZ22 | FIX | Add mutation `fetch-before-live-url-refusal`. |
| WMZ23 | APPROVE | — |
| WMZ24 | FIX | **Reuse** `cms/trash/visibility.ts` (4 of 7 names already there) and `user-management/identity/sql/user-trash-adapter`. Do **not** add `cms/trash/site/{permissions,adapters/user}`, because that would also need a `cms→user-management` edge (a cycle). `trash-item-tool.ts` must list its host delegates and pass G3. Add mutations `purge-blocked-user` and `return-row-without-visibility`. Requires WAL-17. |
| WMZ25 | APPROVE | — |
| WMZ26 | APPROVE | — |
| WMZ27 | FIX | G2: inject the product table name. |

## 5. rest (43 sheets: 17 APPROVE / 26 FIX)

| sheet | verdict | exact fix text |
|---|---|---|
| X4-01 | APPROVE | — |
| X4-02 | FIX | **Lands first in the website lane.** Jini cms/db/comments/taxonomy ports already declare `refuseUnexpectedKeys: (input, allowed) => void` (positional, 9 files). Also export `refuseUnexpectedKeysPort` from core: `(input, allowed) => refuseUnexpectedKeys({ input, allowed })`. Bindings pass that, and no port type changes. Drop repoints of files already deleted by WAL-03/04 if those landed. |
| X4-03 | FIX | `infra/package.json` has a `jini` object but no `entries` key. Add `jini.entries` with the three existing exports plus `./events/outbox-trace-parent` (`node`). Otherwise as written. |
| X4-04 | APPROVE | Must precede WMZ10d. |
| X4-05 | APPROVE | — |
| X4-06 | APPROVE | — |
| X4-07 | APPROVE | — |
| X4-08 | APPROVE | — |
| X4-09 | APPROVE | Must precede WAL-09d. |
| X4-10 | FIX | G2: `safe-url.ts:9` `tovu-safehref.invalid` becomes the neutral `jini-safehref.invalid` inside Jini. It is only an internal resolution base; pin that no output contains it. |
| X4-11 | FIX | G2: RP name `'Tovu'` (`:27`) is injected. Add mutations `admit-before-origin-check` and `raise-passkey-body-cap` (8K/16K at `:71-73`). |
| X4-12 | APPROVE | — |
| X4-13 | APPROVE | — |
| X4-14 | FIX | Add mutations `revoke-without-grant` and `create-principal-without-grant`. |
| X4-15 | APPROVE | — |
| X4-16 | FIX | Corrections: `oauth.ts` and `probe.ts` duplicate a rate limiter (`oauth.ts:100-110`, `probe.ts:60-82`) and an error→status map (`oauth.ts:65-89`). Move them to `cms/admin-http/routes/external-mcp/route-helpers#{withinRateLimit,externalMcpErrorStatus}`. Both files then pass G3. Mutation `skip-rate-limit-on-probe`. |
| X4-17 | FIX | After WMZ04 (which deletes `media-provider-catalog.ts` and binds aliases at `modules/media.ts`). |
| X4-18 | FIX | Correction: move `readZipUpload` and the failure mapper (`install.ts:15-26`) into `cms/admin-http/routes/plugins/install`. Remove the duplicated telemetry at `:44/:51`; one call, with the order kept. |
| X4-19 | FIX | Correction: `route-helpers.ts:66-73` `acceptOverwriteEntityKeys` moves into the peer-transport entry. Add mutation `read-peer-secret-before-route-gate`. |
| X4-20 | FIX | Correction: `events.ts` `sseWriteHeadHeaders` (116-125), `createNamespaceResolver` (169-183) and the `admitSubscriber` envelopes (142-167) move into `cms/admin-http/routes/settings/events`. |
| X4-21 | FIX | After WAL-13c. Add the unnamed `publish-site.ts` helpers to the move list: `httpPublishPreview` (138-157), `readPreviewTarget` (189-208), `credentialChoice` (131-136), `publicCredentialSpec` (113-129), `startAdminPublish` (162-187). Otherwise the residual fails G3. |
| X4-22 | APPROVE | — |
| X4-23 | FIX | G1: cms must not import `devops`/`http-kit`. `mapSqliteError` stays host (vendor). The busy slot, timers and `requestSignal` stay as transport bindings, as written. Inject the origin-refusal copy at `:170`. Add mutation `skip-session-credential-gate` (`:93`). |
| X4-24 | FIX | Correction (security): move the owner-gate order (`site-share-password.ts:26-34`) and the failure projection (59-99) into `cms/admin-http/routes/system/site-share-password`. Add mutation `skip-publish-trust-check` (`:31`). |
| X4-25 | FIX | Fold `sendMemberAuthError` (`complete-sign-in.ts:61-66`) and `respondToSignInError` (`sign-in.ts:23-28`, a duplicate) into one `user-management/members/public-member-auth-response#sendMemberAuthError`. Add mutation `unlink-last-sign-in-method`. |
| X4-26 | FIX | G1: render-site must not import `cookie-consent` (X4-27 would make a cycle); inject the consent render. |
| X4-27 | FIX | G1: cookie-consent must not import `cms` (`presentation`, `render-theme-override`); inject them. G2: `Vary: X-Tovu-Static-Export` (`:351`) and `TOVU_ERROR_REDACTION_OPTIONS` (`:7`). About 200 residual lines (`mountReceipts`, `mountPluginHttp`, `collectorDecision`, `readSiteAnalyticsProof`, `mountStaticThemeLoader`) either move to `cookie-consent/site/http-mounts` in this sheet or the file stays counted. Default: move them. |
| X4-28 | FIX | Add mutation `exempt-admin-prefix-without-trailing-slash`. |
| X4-29 | APPROVE | — |
| X4-30 | FIX | Correction **STAYS-HOST→MOVE**: `P/routes/plugin-contributions.ts` owns `buildRouter` (100-110), `requireActivatedPlugin` (51-57), the member guard (30-40) and the parse-error→400 mapper (80-84). Move them to `cms/public-http/routes/plugin-contributions`. The member guard becomes the shared `user-management/members/access-resolver#activeMemberFromSession` (also used by X4-41 and `media-rendition.ts:353`). |
| X4-31 | FIX | Light correction: move the lazy handler wrapper (61-96) and the same-origin predicate (43-50) into `cms/public-http/routes/site/comments-submit`. |
| X4-32 | FIX | Lines 74-352 duplicate `cms/media/site/rendition-access.ts`, so delete them outright. The residual must pass G3. |
| X4-33 | FIX | Light correction: move the CSP host merge (`response.ts:95-99`) into the CMS page-response finalizer. |
| X4-34 | FIX | G1 (member resolver and types, analytics). |
| X4-35 | FIX | G1. |
| X4-36 | FIX | G1. Six files; one commit per handler. |
| X4-37 | FIX | G1. |
| X4-38 | APPROVE | — |
| X4-39 | APPROVE | — |
| X4-40 | APPROVE | — |
| X4-41 | FIX | Move `buyer()` (35-49, including `credentialsRevokedAt` and `status !== 'active'`) to `activeMemberFromSession` (see X4-30). Add mutation `accept-revoked-member`. |
| X4-42 | APPROVE | — |
| X4-43 | APPROVE | — |

## 6. STAYS-HOST corrections (19; excluded from the keep ledger)

| file (slice root) | was | now | sheet that moves it | evidence |
|---|---|---|---|---|
| `components/AssistantDock/hooks/execution-config.hooks.ts` (admin) | STAYS | MIXED→MOVE part | A06 | `:62-93` generic focus/visibility revalidation |
| `hooks/use-admin-appearance.hooks.ts` (admin) | STAYS | MIXED→MOVE part | A03 | `:34-52` paints Jini `--jini-theme-*` vars |
| `lib/durable-run-subscription.ts` (admin) | STAYS | MIXED (light) | A04 | `:9-20` ends activity on "gone" |
| `deployments/deploy-ops/run-ops.ts` (wal) | STAYS | MIXED | WAL-13a | `:45-47,70-87` |
| `deployments/deploy-ops/tool-registrations.ts` (wal) | STAYS | MIXED | WAL-13a | `:34-54` secret-confirm ceremony |
| `api-connections/vault-store-binding.ts` (wal) | STAYS | MIXED (security) | WAL-01 | `:59-61` vault authorize predicate |
| `custom-credentials/tool-registrations.ts` (wal) | STAYS | MIXED | WAL-10 | 520 lines; `:306-320` |
| `site-backup/import-keep-off.ts` (wmz) | STAYS | MIXED | WMZ21 | `:15-27` Kysely SQL |
| `P/routes/plugin-contributions.ts` (rest) | STAYS | **MOVE** | X4-30 | router, activation gate, member guard |
| `A/routes/system/site-share-password.ts` (rest) | STAYS | MIXED (security) | X4-24 | gate order, failure projection |
| `A/routes/external-mcp/oauth.ts` (rest) | STAYS | MIXED | X4-16 | rate limiter, error map |
| `A/routes/external-mcp/probe.ts` (rest) | STAYS | MIXED | X4-16 | rate-limiter copy |
| `A/routes/settings/events.ts` (rest) | STAYS | MIXED | X4-20 | SSE headers, namespace resolver |
| `A/routes/plugins/install.ts` (rest) | STAYS | MIXED | X4-18 | `readZipUpload`, failure mapper |
| `P/routes/site/comments-submit.ts` (rest) | STAYS | MIXED (light) | X4-31 | lazy wrapper, origin predicate |
| `A/routes/publish-content/route-helpers.ts` (rest) | STAYS | MIXED (light) | X4-19 | `acceptOverwriteEntityKeys` |
| `P/routes/members/complete-sign-in.ts` (rest) | STAYS | MIXED (light) | X4-25 | `sendMemberAuthError` |
| `P/routes/members/sign-in.ts` (rest) | STAYS | MIXED (light) | X4-25 | duplicate error writer |
| `P/routes/site/pages/response.ts` (rest) | STAYS | MIXED (light) | X4-33 | CSP host merge |

Borderline but left as STAYS-HOST: `media-generation/provider-card-host.ts` (builds the secret-card form, and matches errors by message text at `:18-41`), `site-export/route-manifest.ts`, `pages/tool-host.ts`.

27 STAYS-HOST files were not read in full: admin 13 (≤36 lines) and rest 5 (8–23 lines) were checked by LOC and imports only, and wmz 9 were unchecked. They are in Appendix B; K0 re-opens any file whose keep regex would also match a MOVE file.

Every one of the 196 STAYS-HOST reasons names a Jini binding target, and all of those targets exist (subagents grepped every `@jini-ai/*` import).

## 7. Global build order

**Lane W (website; serial, because of the G4 hot files):**
1. **K0**: write the keep ledger (Appendix B). Re-run the counter. Expected 449 → about 272.
2. **Core prerequisites**: X4-02 → X4-04 → X4-06 → X4-07 → X4-09 → X4-10 → X4-03 → X4-01.
3. **Tool foundations**: WAL-01 → WAL-02 → WAL-03 → WAL-04 → WAL-05 → WMZ05.
4. **Identity and credentials** (HARD): WAL-17 → WMZ17 → WMZ18 → WMZ01 → WAL-15 → WMZ19a → WMZ19b. WMZ19c is held.
5. **Agent plugins**: WAL-09a → 09b → 09c → 09d → 09e → 09f → 09g.
6. **Deployments**: WAL-13a → 13b → 13c → 13d → X4-21.
7. **Media**: WMZ03 → WMZ04 → X4-17 → WMZ26.
8. **Publish-content manifest group**, strictly serial: WAL-06 → WAL-07 → WAL-08 → WMZ08 → WMZ23 → WMZ27 → WMZ10a → 10b → 10c → 10d → WMZ11 → WMZ14.
9. **Remaining tool registrations**: WAL-12, WAL-14, WMZ02, WMZ06, WMZ07, WMZ09, WMZ12, WMZ13, WMZ16, WMZ22, WMZ24 (after WAL-17), WMZ20 → WMZ21 (after WMZ18/19/20).
10. **Admin HTTP**: X4-11, X4-14, X4-16, X4-18, X4-19, X4-20, X4-23, X4-24.
11. **Public HTTP**: X4-25 (after WMZ06; both edit `modules/members.ts`) → X4-27 → X4-26 → X4-28 → X4-30 → X4-41 (shared `activeMemberFromSession`) → X4-31 → X4-32 → X4-33 → X4-34 → X4-35 → X4-36 → X4-37 → X4-38 → X4-39 → X4-42.
12. **Host-only and verification sheets**, any time after K0: WAL-10/11/16, WMZ15/25, X4-05/08/12/13/15/22/29/40/43.

**Lane A (admin; parallel to W):**
1. A01 → A02 → A03 → A04 → A05 → A06 → A21.
2. A07 → A08 → A09 → A17 → A18 → A20.
3. A10, A11, A13, A14, A15, A16, A19, A22, A23, A24, A25, A26, A27, A28, A29, A12.
4. The lane only touches packages also touched by W: `devops` (A12/WAL-13), `mcp` (A25/WAL-15), `cms` (many). Each changeset file is per sheet, so there is no conflict, but rebase `package.json` exports by union.

## 8. Expected counter drop (estimate)

- **Keeps (K0): about −177.** These are the 196 STAYS-HOST rows less the 19 corrections. The drop is certain once the ledger is written, because it needs no code.
- **MOVE: about −155 of the 253 claimed.**
  - About 110 DELETE rows at 85–90% completion give about −95.
  - About 143 BIND rows pass G3 at about 42% (residuals with no stated size, plus the large files) for about −65.
  - Biggest shortfalls:
    - WAL-09: −6…−9 of 12.
    - WAL-13: about −9 of 17.
    - WMZ19: −2 of 5, with 19c held.
    - A07: −7…−8 of 10.
    - A20: −3 of 4.
    - X4-27 and X4-23: 0–1 each.
- **Corrections moved inside the sheets: up to −10** (light ones drop once their helper moves).
- **Total: about −330, range −290…−360, leaving about 90–160.**
- The previous rounds' failure modes are covered:
  - The keep step (K0, G3) and every DELETE row require the Tovu file to be gone or pure.
  - The "copy but leave Tovu" pattern is blocked by G3.
  - The "missing prerequisite" stop is addressed by §7 and the cross-slice notes.

## 9. Owner questions (product or architecture decisions; each has a recommended answer)

1. **A13 (supersedes ext-a decision 6).** Should the Email views go to `@jini-ai/admin/screens/email/` instead of `@jini-ai/user-management/react/mail/`? **Recommend yes.**
   - All the collaborators already live there: four tabs, `EmailParts`, six controllers, i18n.
   - The `parts` component map existed only to avoid a `user-management→admin` import. It and the NEEDS-OPUS mark go away.
2. **Admin React screens dominated by admin helpers** (A07, A09, A12, A18, A19, A20, A24, A25). Keep the sheets' `cms`/`devops`/`agent-plugins`/`integrations` targets with full G1 injection, or retarget to `@jini-ai/admin/screens/<feature>/` beside the helpers they import? **Recommend retarget to admin.**
   - The injected sets drop from 10–20 members to the cross-domain few.
   - It creates no new dependency edge.
   - The `cms/react/*` pieces that import no admin module stay where they are.
   - Either answer leaves the sheets buildable, because G1 is mandatory in both cases.
3. **WMZ19c (root-key ensure state machine).** Should a designed `platform/secrets/root-key/ensure` contract be scheduled as a separate Opus design item? **Recommend yes, and hold it from X4.** It is the site root key. Cutting it mechanically risks key loss.

---

## Appendix A — Rewritten NEEDS-OPUS sheets (Sol builds these as written)

### Common CUT RECIPE (used by A18, A22, A24)

The over-limit controllers are single React hooks of 500–710 lines. A "split" that keeps one hook and moves code into helper files does not meet the ≤80-line rule. The safe cut is mechanical, needs no judgment, and keeps effect order:

1. Cut the hook body only at the **line ranges given below**. Each range is contiguous and becomes one sub-hook `useX(required, _optional = {})` in the named file. Do not reorder statements inside a range.
2. The parent hook calls the sub-hooks **in the order of the ranges**. React runs effects in declaration order, so the effect order stays the same. No hook call moves across another hook call.
3. Each sub-hook's `required` argument is one object holding exactly the identifiers that the range reads but does not declare. Run `tsc` on the moved range and add each "Cannot find name" identifier to that object; do not add anything else. The sub-hook returns one object holding the identifiers that later ranges or the final `return` read.
4. `function` declarations without hook calls inside a range may stay in the range or move to a plain factory `createX(required)` in the same file. Moving them changes nothing, because they are recreated on every render, as they are today.
5. The parent's final object literal becomes a pure `projectXController(required)` function in the same file as the parent. The parent then fits within 80 lines.
6. Any single moved callback that is still over 80 lines, or over complexity 10, is split at its existing `if` or `try` blocks into private same-file helpers that take the closure values as one object. If a callback cannot be split that way without reordering an `await`, STOP and report the callback name and its line range.
7. Done check: `git diff --stat` shows the parent file shrinking, and the characterization tests named in the sheet pass **before and after** with the same test count.

### A13 — Email and template editor (replaces the sheet; NEEDS-OPUS resolved)

**Finding.** Every Jini collaborator the four files import already lives in `@jini-ai/admin/screens/email/`: `EmailParts`, `EmailOverviewTab`, `EmailSenderTab`, `EmailActivityTab`, `EmailTemplatesTab`, `Email.hooks`, `EmailProviderTab.hooks`, `EmailTemplateEditor.hooks`, `email-i18n`, and all six `hooks/use-email*.hooks` controllers. The `user-management/react/mail` target was the only reason a `parts` component map was needed: it would otherwise import `admin`. Put the views in the **same feature folder** and the map, along with the NEEDS-OPUS question, goes away. Owner question Q1 confirms this.

**Test first** (Tovu, before moving): `features/email/__tests__/Email.unit.test.tsx` pins five tab IDs in order `overview, provider, sender, templates, activity`, pins that the first render mounts only Overview, and pins that a subsection change rewrites `?p=` with `replace` (history length unchanged). Mutation `email-mount-inactive-tab`. `EmailTemplateEditor.unit.test.tsx` pins the dirty-leave guard on a plain same-window anchor click. Mutation `email-ignore-dirty-leave`. A third pin covers `EmailProviderTab` and `M-reveal-provider-key-in-status`: a saved key renders only its hint, never the key value.

**Jini** (`@jini-ai/admin`, minor; entries `browser`):
- `screens/email/EmailSegments.tsx`: move as-is. `Segments(props: { name; label; items; active; onSelect })` has no host import.
- `screens/email/EmailProviderTab.tsx`: move as-is, with one change. Replace `import { agentPluginDisplayName } from "../plugins/rules"` with the required prop `displayName: (required: { id: string }) => string`. Thread it to the one call site. Keep the exports `shownProviderId`, `segmentLabel`, `ADD_PROVIDER_PART` and `CAPABILITIES_PART`.
- `screens/email/EmailTemplateEditor.tsx`: move. Remove the defaults `useEditorHook = useWiredEmailTemplateEditor` and the `useAdminLocale`-based `useEditorLocale`. The new required props are `useEditorHook: () => EmailTemplateEditorController`, `useAdminLocaleHook: () => string` and `pageEditorT: (key: string) => string` (today imported from `../pages/page-editor-i18n`). Keep `useEmailTemplateViewHook` and `useTabBarKeyboardHook` as required props without defaults. Keep `editorStatus` exported. Keep the private `useEditorKeys`, `leavesEditor`, `replacesCurrentWindow` and `isPlainNavigationClick` with their order unchanged.
- `screens/email/Email.tsx`: move. Export `EmailTabHooks` as written today (`overview(); provider({onChanged?}); sender({onChanged?}); templates({newName?}); activity()`). Change `Email` to `Email(required: { tabId: string | null; part: string | null; useEmailHook: () => EmailController; tabHooks: EmailTabHooks; useAdminThemeBoundaryHook: (r: {}, o: {}) => ThemeBoundary; translateNavLabel: (r: { label: string; locale: string }) => string; providerDisplayName: (r: { id: string }) => string; templateEditor: { useEditorHook; useAdminLocaleHook; pageEditorT } }, _optional = {})`. The `ThemeBoundary` type is whatever `useAdminThemeBoundary` returns today; declare it structurally in Jini and do not import the Tovu theme. `TAB_IDS`, `*_PART_LABELS`, `pickPart`, `PartSegments`, `SUMMARY` and `StatusBody` move unchanged, since they are generic mail UI and their copy already resolves through Jini `email-i18n`. Remove `WIRED_TAB_HOOKS` and the `useWiredEmail` default. Keep the `navigate` import from `@jini-ai/admin/shell/lib/router`, where it already lives.
- Exports and `jini.entries`: `./screens/email/{Email,EmailProviderTab,EmailSegments,EmailTemplateEditor}` → `browser`. Add `.changeset/x4-a13.md` (`@jini-ai/admin` minor). Add no `user-management` change.

**Tovu.**
- Add `features/email/email-panel.tsx`, the **binding**. It renders the Jini `Email` with the `email-hooks-host.ts` hooks, `useAdminThemeBoundary`, `translateAdminNavLabel`, `agentPluginDisplayName`, `useAdminLocale`, page-editor `t`, `useWiredEmailTemplateEditor` and `useEmailTemplateView`. It also keeps the side-effect import `../../styles/assistant.css`.
- Repoint `features/email/index.ts`, `panel-pages.ts` (both lazy targets) and the four email tests named in w3-ext-a T10.
- **Delete** `Email.tsx`, `EmailProviderTab.tsx`, `EmailSegments.tsx` and `EmailTemplateEditor.tsx`, all four. They are not reduced to bindings.
- Add one exact keep for `features/email/email-panel.tsx`.
- Counter: −4.

### A18 — Page editor (replaces the "Opus check")

`hooks/use-page-editor.hooks.ts` is 1,322 lines, and `usePageEditor` runs from line 593 to about 1,300. Apply the CUT RECIPE with these ranges, in this order:

| order | lines (anchor `5087e8fd`) | sub-hook | Jini file under `cms/src/react/pages/hooks/` |
|---|---|---|---|
| 1 | 593–638 (loaders, `write`) | `usePageEditorLoaders` | `page-editor-load.hooks.ts` |
| 2 | 639–703 (state, settlement, autosave, `loadInputs`) | `usePageEditorState` | `page-editor-load.hooks.ts` |
| 3 | 704–745 (load/apply effect) | `usePageEditorLoad` | `page-editor-load.hooks.ts` |
| 4 | 746–862 (HTML draft, flush, `applyExternalPage`, three view effects) | `usePageEditorDrafts` | `page-editor-drafts.hooks.ts` |
| 5 | 863–1004 (`runSave`, `save`, overwrite, dismiss, `remove`) | `usePageEditorSaveActions` | `page-editor-save-actions.hooks.ts` |
| 6 | 1005–1043 (preview form/frame) | `usePageEditorPreview` | `page-editor-preview.hooks.ts` |
| 7 | 1044–1160 (external refresh, back link, two effects, recovered draft) | `usePageEditorExternal` | `page-editor-drafts.hooks.ts` |
| 8 | 1162–1211 (flush-gated setters, canvas styling) | `usePageEditorFlushSetters` | `page-editor-preview.hooks.ts` |
| 9 | 1212–end of `return {…}` | `projectPageEditorController` (pure) | `use-page-editor.hooks.ts` |

- Ranges 4 and 7 must stay separate calls. Range 7 reads `save`/`runSave`, which range 5 declares, and its effects must stay after range 4's effects.
- `runSave` (863–942) is about 80 lines. Split it at its existing conflict and success branches if the line rule fails.
- The module-level helpers at 403–592 (`applyLoadedPage`, `computeContentDirty`, `schedulePendingHtmlPreviewSubmit`, `isPublishedUnchanged`, `canonicalPageRedirect`) go to `cms/src/react/pages/page-editor-rules.ts`.
- `useWiredPageEditor` (1304) and `pageBodyFormat` stay in Tovu as the binding.
- The flush → pending preview submit → save → draft-clear order is preserved by construction (ranges 4 → 5 → 6, then 8).
- Check before and after with `PageEditor.interactive-flush.unit.test.tsx` and `PageEditor.preview-youtube.unit.test.tsx`.

`PageEditor.tsx` is 1,115 lines. Cut it into `PageEditorHeader.tsx`, `PageEditorNotices.tsx` and `PageEditorPane.tsx` at the existing top-level JSX sections. Each child takes `{ controller, kit, copy }` plus the required slots it renders. The NEEDS-OPUS mark is resolved.

### A22 — Publish content dialogue (replaces the "Opus check")

`hooks/use-publish-content-confirm.hooks.ts` is 1,289 lines, and `usePublishContentConfirm` runs from line 448 to 1092. Use these ranges:

| order | lines | sub-hook | Jini file under `cms/src/react/publish-content/hooks/` |
|---|---|---|---|
| 1 | 448–551 (locale, `planInScope`, `live` ref, peers/destination state and load effect @497) | `usePublishPeers` | `publish-peer-plan.hooks.ts` |
| 2 | 552–745 (selection/overwrite state, `requestPlan`, `applyOverwriteKeys`, `onToggleOverwrite`, `onConnect`) | `usePublishPlanSelection` | `publish-peer-plan.hooks.ts` |
| 3 | 746–901 (`reportConfirmFailure`, `confirmPreparedPlan`, `confirmPlan`, token-execute effect @833, up-to-date toggle) | `usePublishConfirmExecute` | `publish-confirm-execute.hooks.ts` |
| 4 | 902–998 (criteria refs and effects @911/918/935) | `usePublishCriteria` | `publish-criteria.hooks.ts` |
| 5 | 999–1036 (`runPrimary`, arming layout effect @1020, `primaryInFlightRef`, `onPrimary`) | `usePublishPrimaryArming` | `publish-confirm-execute.hooks.ts` |
| 6 | 1037–1092 | `projectPublishContentConfirmView` (pure) | `use-publish-content-confirm.hooks.ts` |

- `useWiredAdminLocale` at line 459 becomes the required prop `useLocaleHook`.
- The module helpers at 190–447 and 1093–1289 go to `publish-content-confirm.rules.ts`. That file stays private unless the existing exports (`liveGapLinesFor`, `overwriteTooltipFor`, `reportRowNote`, `reportRowPillClass`, `publishMismatchMessage`, `CONFIRM_ARM_DELAY_MS`) need public paths. Export those through the hook entry.
- The order peer change → criteria replan → confirmation → execute is preserved by construction (1 → 2 → 3 → 4 → 5). The synchronous re-entry guard (`primaryInFlightRef`) and the layout-effect arming stay together in range 5.
- Two more mutations: `publish-execute-unconfirmed` and `publish-confirm-during-replan`, as in the sheet.
- `PublishContentDialog.tsx` (439 lines) moves to `cms/react/publish-content/PublishContentDialog.tsx`, with `PublishContentReport` and `renderPublishReport*` (lines 300–439) going to `PublishContentReport.tsx`.
- `PublishContentDialog.hooks.tsx` (`PublishContentReportRow`) moves too. Delete it in Tovu.
- The Tovu binding is a new `features/publish-content/publish-content-dialog.tsx`. It passes `publish-content-dependencies.hooks.ts`, the locale hook and the two stores. Delete `PublishContentDialog.tsx` and `hooks/use-publish-content-confirm.hooks.ts`, then add exact keeps for the binding.
- Counter: −3 (the sheet claims 3).

### A24 — Security, access tokens (replaces the "Opus check"; HARD, credentials)

`hooks/use-access-tokens.hooks.ts` is 915 lines, and `useAccessTokens` runs from line 383 to 890. The only effects are the three seed effects (412/419/426) and those inside `useFetchQuery`/`useSettlementGeneration`.

| order | lines | unit | Jini file under `integrations/src/react/credentials/hooks/` |
|---|---|---|---|
| 1 | 384–517 (5 queries, providers, `worksForOptions`, 3 store states + **3 seed effects, same order**, reload state, `settlement`, `reloadAllStores`, `triggerReload`, `loadError`) | `useAccessTokenStores` | `access-token-load.hooks.ts` |
| 2 | 518–535 (rows memo, query/category, drafts, busy, add forms, custom add, `customKeyPending`) | `useAccessTokenDrafts` | `access-token-drafts.hooks.ts` |
| 3 | 541–783 and 817–860 (all `function`/`async function` actions; **no hook calls**) | `createAccessTokenActions(required)` (plain factory) | `access-token-actions.hooks.ts` |
| 4 | 784–816 (two `useMemo` group projections, counts) | stays in parent; bodies → `projectAccessTokenGroups`/`projectCustomGroups` | `access-token-groups.ts` |
| 5 | 861–890 | `projectAccessTokensController` (pure) | `use-access-tokens.hooks.ts` |

- Module helpers 31–382 go to `access-token-forms.ts` (forms and drafts) and `access-token-errors.ts` (the three error-message functions plus `firstRejectionReason`).
- `writeCredential` (358) goes to the actions file.
- `useWiredAccessTokens` (911) stays in Tovu.
- **Security pins added**, beyond the sheet's three:
  - `access-token-keep-token-after-save`: pin the current draft-token state after a successful `replaceToken`. A typed secret must not survive in the draft once the server accepts it, if that is today's behavior.
  - `access-token-send-token-on-make-default`: `makeDefault` sends no token field.
  - Both are Tovu-first characterization pins. If current behavior differs, pin the current behavior and log it in `development/open-bugs.md`; do not change it.
- `AccessTokensTab.tsx` (1,070 lines) is cut at its existing top-level components into `AccessTokenFields.tsx`, `AddCustomCredentialDialog.tsx` and `AccessTokensTab.tsx`. If any component is still over 500 lines, STOP.
- `LEGACY_SENTINEL_LABELS`/`PUBLISH_CREDENTIAL_ROW_LABEL` stay injected copy.
- The NEEDS-OPUS mark is resolved.

### WAL-09 — split into seven sheets (one commit and one counter check each; land in this order)

| new id | MOVE files (LOC) | Jini target (`@jini-ai/agent-plugins/…`) | Tovu end state | test + mutation |
|---|---|---|---|---|
| WAL-09a | `automatic-agent-plugins.ts` (280) | `site/automatic-agent-plugins` | BIND (preference, readiness, catalog, card port, logging) | `assistant/__tests__/automatic-agent-plugins.integration.test.ts`; `reuse-retired-attempt-receipt` |
| WAL-09b | `connect-tool.ts` (209), `new-site-agent-plugin-tokens.ts` (138) | `connect/connect-tool#defaultResolveInstalledAgentPlugin`, `connect/new-site-agent-plugin-tokens` | BIND both | token refusal-order pin; **new** mutation `token-refusal-order-swapped` (swap the retired-ID and limit checks) |
| WAL-09c | `exports/{diagnostics (56), runtime (218), source (75)}.ts` | `site/exports/{diagnostics,runtime,source}` | DELETE diagnostics; BIND runtime and source | `plugin-embed-source.test.ts`; `catalog-inactive-before-digest` |
| WAL-09d | `install-tool.ts` (251), `install-upload.ts` (385) | `site/install-tool`, `site/install-upload` | BIND both | `install-upload-update.unit.test.ts`; `publish-before-off-record`. **Requires X4-09** (plugin-install source schema) |
| WAL-09e | `layout.ts` (108) | `lifecycle/layout#createAgentPluginSiteLayout` | BIND | exact workspace and plugin-ID error-text pin; **new** mutation `layout-accept-dotdot-plugin-id` |
| WAL-09f | `memory.ts` (91) | `site/memory` | BIND | layout/memory integration; **new** mutation `memory-migrate-sibling-before-lock` |
| WAL-09g | `set-enabled.ts` (92), `update-effects.ts` (76) | `site/set-enabled`, `site/update-effects` | BIND both | `update-effects.unit.test.ts`; `capture-recovery-deps-at-bind` |

- Each sub-sheet takes its importer ledger slice from the one in WAL-09. A file listed there is edited only by the sub-sheet that owns the symbol it imports.
- The two pass-through repoints (`renameToolNames`, `waitAtAgentPluginSignInCardWithPorts`) go in WAL-09b.
- Counter reality: only 1 of the 12 files is deleted. The other 11 drop only if their residual passes the binding test (imports + factory call + host constants). Expect −6 to −9, not −12.

### WAL-13 — split into four sheets (its own steps 1–4 become 13a–13d)

- **WAL-13a** deploy-ops and targets registry (3 files): BIND ×3. Mutation `take-first-duplicate-target`.
- **WAL-13b** publish-credentials (`store.ts` 756, `compatibility-port.ts`, `index.ts`): **HARD/credentials**. Mutations: `read-registry-at-bind` and `fallback-after-explicit-choice-refusal`. Add `seal-before-owner-lookup`, which pins that metadata read → owner lookup → seal → invalidate stays in order. DELETE `compatibility-port.ts` and `index.ts`; BIND `store.ts`.
- **WAL-13c** static-publish (8 files including `index.ts`, about 2,240 LOC incl. `adapter.ts` 697): DELETE `inspection`, `publish-history` and `index`; BIND `adapter`, `credentials`, `verify`, `publish-run` and `domain-publish-tool`. Mutation `skip-reviewed-credential-recheck`.
- **WAL-13d** tool layer (`publish-agent-tools.ts` 1,206, `publish-tool-deps.ts`, `tool-registrations.ts`): BIND ×3. Mutation `forward-narrow-route-deps`.
  - `publish-agent-tools.ts` at 1,206 lines is the riskiest single file in X4. If, after the named private splits, any of its functions is over 80 lines, STOP and report the function and its line range.
- Each step is one commit. Re-run the counter after each step.
- **Requires WMZ17** (vendor-credential vault binding) before 13b. Both edit `site-deps/route-deps-publish-credentials.ts`.
- **X4-21 requires 13c**: it adds `devops/deploy/site/static-publish/admin-publish-read` next to these files.

### WMZ10 — split into four sheets (its steps 1–4 become 10a–10d)

- **WMZ10a** ops and SQL repos: `post-create`, `post-update`, `post-retire`, `post-trash`, `reverters`, `repo.memory`, `repo`, `repo.rows`. DELETE ×7 (all except `repo.ts`); BIND `repo.ts`. Mutations: `omit-update-version-check` and `drop-actor-id-from-revision-row`.
  - **HARD**: `actor_kind`/`actor_id` come from the H2 migration `0050`. Type the package SQL against the post and revision column slice that includes those two nullable columns.
  - The Tovu H2 migration tests were **not run** on merge-24 (merge-24 leftover 6). Run them before 10a.
- **WMZ10b** tool layer: `post-tool-{delete,deps,duplicate,input,list,policy,update}`, `preview-tool` and `tool-registrations` (510). DELETE ×6; BIND `post-tool-policy`, `preview-tool` and `tool-registrations`.
- **WMZ10c** `publish-content.ts` (626): DELETE. Serialize with the other `publish-content-manifest.ts` editors (see build order).
- **WMZ10d** `revision-refs` and `revision-thinning`: DELETE `revision-refs`; BIND `revision-thinning`. Mutation `unreadable-inverse-is-unreferenced`.
  - **Requires X4-04**: `postRevisionLockKey` must already be in `core/contracts/site/post-revision-lock`, so that the moved SQL imports core rather than Tovu.

## Appendix B — K0 keep ledger: 177 exact paths (196 STAYS-HOST minus the 19 corrections)

Write these as exact anchored keeps (one regex per path, `^<root><path>$`) in `plans/count-1125/x4-keeps.md`. Append each BIND residual only after it passes G3. Never use a directory or name pattern.

#### admin — root `apps/admin/src/`
```text
components/AssistantDock/chat-cleanup-copy.ts
components/AssistantDock/chat-cleanup-kit.tsx
components/AssistantDock/hooks/assistant-transport.binding.ts
components/AssistantDock/hooks/byok-runtime.hooks.ts
components/AssistantDock/hooks/composer-files.hooks.ts
components/AssistantDock/hooks/local-cli-selection.hooks.ts
components/EmbedInsertControl/EmbedInsertControl.hooks.tsx
components/EmbedInsertControl/EmbedInsertControl.tsx
components/MediaPickerDialog/media-picker-host.tsx
components/Placeholder.tsx
components/WidgetConfigFields/HtmlAttributeRows.tsx
components/WidgetConfigFields/WidgetConfigFields.tsx
components/WidgetConfigFields/widget-config-host-policy.ts
features/collections/collection-entry-panel.tsx
features/database/Database.tsx
features/deployment/deployment-classes.ts
features/deployment/deployment-host-policy.ts
features/deployment/hooks/use-deployment-overview.hooks.ts
features/fs-files/api/fs-files-api.ts
features/integrations/integration-deliveries-panel.tsx
features/library/Library.tsx
features/library/hooks/library-dependencies.hooks.ts
features/media/api/media-api.ts
features/media/hooks/use-media-preview.hooks.ts
features/media/media-grid-i18n.ts
features/media/upload-size-copy.ts
features/pages/page-external-change-bindings.ts
features/plugins/hooks/agent-plugin-install-dependencies.hooks.ts
features/plugins/hooks/plugin-install-dependencies.hooks.ts
features/plugins/hooks/use-agent-plugin-details-modal.hooks.ts
features/plugins/hooks/use-plugin-package-files.hooks.ts
features/plugins/hooks/use-plugins.hooks.ts
features/posts/hooks/post-cover-host.hooks.ts
features/publish-content/publish-section-button-binding.tsx
features/recovery/recovery-panel.tsx
features/routines/index.ts
features/routines/routines-i18n.ts
features/security/hooks/copy-keys-dependencies.hooks.ts
features/settings/ai-agent-presentation.ts
features/settings/hooks/use-external-mcp-tool-picker.hooks.ts
features/skills/api.ts
features/skills/skills-host.hooks.ts
features/source-control/source-control-panel.tsx
features/storage/storage-i18n.ts
features/trash/Trash.tsx
features/trash/hooks/use-trash.hooks.ts
hooks/use-admin-execution-credential.hooks.ts
lib/browser-telemetry.ts
lib/credential-copy.ts
lib/execution-settings.ts
lib/server-reconnect.ts
lib/settings-events.ts
```
#### wal — root `apps/website/src/features/`
```text
agent-plugins/activation-effects.ts
agent-plugins/apply-connect-defaults.ts
agent-plugins/apply-tool-renames.ts
agent-plugins/connect-destination.ts
agent-plugins/connect-sign-in-wait.ts
agent-plugins/customize-tool.ts
agent-plugins/enable-access.ts
agent-plugins/federate-mcp.ts
agent-plugins/grant-signed-in-defaults.ts
agent-plugins/host-tool-ports.ts
agent-plugins/import-access-token.ts
agent-plugins/memory-tools.ts
agent-plugins/provider-plugin-link.ts
agent-plugins/switch-on-saved-token.ts
agent-plugins/token-sign-in.ts
agent-plugins/uninstall-confirmation-ui.ts
custom-credentials/agent-tools.ts
custom-credentials/credential-copy-tool.ts
custom-credentials/credential-save-tool.ts
custom-credentials/credentialed-request.ts
custom-credentials/repository-target.ts
custom-credentials/store.ts
database-transfer/destination-store-host.ts
deployments/capability-card.ts
deployments/deploy-ops/secrets.ts
deployments/deploy-ops/typed-secret-card.ts
deployments/deploy-targets/host-kit-binding.ts
external-mcp/external-mcp-oauth.ts
external-mcp/external-mcp-store.ts
external-mcp/external-mcp-vault.ts
form-destinations/key-store.ts
```
#### wmz — root `apps/website/src/features/`
```text
media-generation/host-media-providers.ts
media-generation/provider-card-host.ts
media/chat-attachment-reader-host.ts
media/large-upload-routing-copy.ts
member-login/bindings.ts
pages/tool-host.ts
plugin-runtime/built-ins/word-count/index.ts
plugin-runtime/host-install-source.ts
plugin-runtime/site-plugin-vocabulary.ts
post/post-catalog-host.ts
post/search-scratch-host.ts
project-keys/host-bindings.ts
project-keys/vault-policy.ts
publish-content/backstop-service.ts
publish-content/backstop-sqlite-binding.ts
publish-content/destination-credential.ts
publish-content/disconnect-tool.ts
publish-content/peer-transport-binding.ts
publish-content/peers.ts
publish-content/publish-tool.ts
publish-content/pull.ts
publish-content/push-plan.ts
publish-content/raw-file-contributor.ts
publish-content/raw-row-contributor.ts
publish-content/tool-deps.ts
publish-trust/candidate-policy.ts
site-backup/archive-extensions.ts
site-backup/archive-manifest.ts
site-backup/import-backend.ts
site-backup/import-database.ts
site-backup/import-plugin-state.ts
site-backup/import-restore.ts
site-backup/import-verifier-projection.ts
site-backup/import-verifier.ts
site-backup/package-file-inventory.ts
site-backup/push-manifest.ts
site-backup/share-backend.ts
site-backup/share-expiry.ts
site-backup/share-hosting.ts
site-backup/share-own-folder.ts
site-backup/share-preparation.ts
site-backup/share-registry.ts
site-backup/share-service.ts
site-backup/share-steps.ts
site-backup/share-zip.ts
site-backup/sources.ts
site-backup/static-download-host.ts
site-backup/static-site-packager.ts
site-export/export-preflight-copy.ts
site-export/media-url-bindings.ts
site-export/route-manifest.ts
site-inspection/catalog-host.ts
source-control/source-control-credential-repo.ts
trash/tool-registrations.ts
web-screenshot/catalog-host.ts
web/policy.ts
```
#### rest — root `(W=apps/website/src, C=W/contracts/core, A=W/server/inbound/admin-http, P=W/server/inbound/public-http, D=apps/desktop/src)`
```text
A/owner-mfa-routes.ts
A/owner-recovery-routes.ts
A/routes/agent-plugins/install-response.ts
A/routes/analytics/recent-hits.ts
A/routes/api-keys/create-principal.ts
A/routes/api-keys/issue.ts
A/routes/api-keys/revoke.ts
A/routes/assistant/stored-credential-probe.ts
A/routes/media/list.ts
A/routes/posts/template-preview.ts
A/routes/publish-content/blobs-probe.ts
A/routes/publish-content/import-errors.ts
A/routes/system/dockerfile-source.ts
A/routes/system/mail-providers.ts
C/approval-i18n.ts
C/chat-delete-grant.ts
C/publish-trust-wire.ts
C/tool-metadata/agent-pause.ts
C/tool-metadata/storage.ts
P/http/members.ts
P/http/site/bare-page.ts
P/http/site/render/blocks.ts
P/http/site/render/components/entry-lists.ts
P/http/site/render/content-html.ts
P/http/site/render/page-body.ts
P/http/site/render/post-body.ts
P/http/site/render/template-render-data.ts
P/routes/agent-plugin-surfaces/export-files.ts
P/routes/content/posts/get-by-slug.ts
P/routes/members/oidc-start.ts
P/routes/site-assistant-confirm.ts
P/routes/site/analytics-ingest.ts
P/routes/site/newsletter-confirm.ts
P/routes/site/newsletter-unsubscribe.ts
P/routes/site/pages/extra-head.ts
P/routes/site/pages/pre-consent-cache.ts
P/routes/site/search.ts
P/routes/site/seo-documents.ts
```
