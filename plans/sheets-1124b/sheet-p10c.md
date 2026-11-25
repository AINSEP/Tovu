SHEETS r62t-sheet-p10c COMPLETE: 3 todo / 1 done / 0 obsolete; 0 SOL sheets, 5 OPUS sheets

The three open steps are all **PARTLY-DONE**. The approval flow, release feed, and Jini contract are already in place. The missing pieces are the admin notice, a real migration readiness check, and hand-offs that can finish an update after the process that accepted it exits.

Reviewed Tovu `7c87b3c3f9` and Jini `010c8cd87` on merge-21. Read-only review. No files changed and no tests, builds, installs, or type-checks run. `T:` and `J:` below identify repo-relative paths on those trees. `W` = `apps/website/src`, `A` = `apps/admin/src`, `D` = `apps/desktop/src`, and `JD` = `packages/devops/src/deploy`.

## Step status

| Step | Status | Merge-21 proof and remainder |
|---|---|---|
| **P10-U1** Jini contract | **DONE-ALREADY** | `fee3ac4bf` brought in the contract, fake, and contract tests. `2723fbb85` added the desktop and image adapters. The actual entry is `@jini-ai/devops/deploy`, not a standalone deploy package. See `J:JD/site-update/contracts.ts:51`, `J:JD/index.ts:23–28`, and `J:api-baseline/jini-ai__devops.json:427–428,452,472`. No U1 sheet. |
| **P10-U2** Update available | **PARTLY-DONE** | `2be36f1f56` added the read-only tool, `bf3cea774c` registered it, and `1edcdb87c4` added the configured release feed. See `T:W/features/site-update/tools.ts:63–76`, `github-release-feed.ts:27–30`, and `T:W/server/runtime/composition/tool-catalog-manifest.ts:591–595`. The authenticated production admin notice is still absent. No default feed URL is needed or wanted. |
| **P10-U3** Approved update flow | **PARTLY-DONE** | `c326f1779d` added the version-bound approval card. `cfca1a40dc` added the stale-version check under a lock **when one is supplied**. `T:W/features/site-update/__tests__/apply-tool.test.ts:121,132,165` already pins readiness refusal, rollback, and the lock with fakes. Production composition supplies no lock at `T:W/server/runtime/composition/site-deps/site-update-binding.ts:81`. `restore-point-backup.ts:24–31` equates snapshot capability with migration readiness and ignores `restartRequired` on restore. Keep the landed card and sequencing. Finish the real preflight and exclusion, and enforce the installation-owner check where the approval is redeemed. |
| **P10-U4** Desktop and self-hosted | **PARTLY-DONE** | Tovu `03e5d4d1a0`, `6d3aeefb59`, `303b37f555`, and `4403bfd241` landed the host adapters and runtime slot. `T:W/server/runtime/composition/site-deps/assembly-phases.ts:247–250` supplies neither a desktop hand-off nor a self-hosted restart controller. Desktop `T:D/main/updates/site-update-host.ts:43–52` requests quit and install, checks only the app version, and can say data was restored before any restore ran. Self-hosted `T:W/features/site-update/self-hosted-host.ts:34–43` reads a boot-time tag, not the replacement’s running tag. Real restart, verification, and recovery are still open. |

`P10-U4`’s reference to G7-11 is stale. Group 7’s item 11 concerns the dispatch marker. `T:development/todos.md:162–163` records the actual owner decision, which is one approval flow for both host kinds and no automatic site update.

## Sheets in build order

No SOL-only sheets. U2 adds an authenticated route. U3 and U4 involve approval, migration safety, or crash ordering. Build order is **U2.J → U2.T → U4.J → U3.T → U4.T**. U4.J supplies the small contract additions used by U3.T. Keep the existing P9 extraction lanes untouched. At overlapping composition files, add only the new mount, prop, or injected port.

### P10-U2.J — Read-only status spec and update notice

**Repo: Jini · BUILDER: OPUS**

**Files and signatures**

- Change `packages/core/src/contracts/site/devops-deploy.ts:1` to add the shared, types-only `SiteUpdateAvailability` and `SiteUpdateStatusReply`. Use `SiteUpdateAvailability = { kind: "unavailable" } | { kind: "current"; runningVersion: string } | { kind: "available"; runningVersion: string; latest: string; notes: string } | { kind: "check-failed" }` and `SiteUpdateStatusReply = { availability: SiteUpdateAvailability }`. U4.J adds the last-attempt field. Use the existing `@jini-ai/core/contracts/site/devops-deploy` entry.
- Create `JD/admin-http/site-update-status.ts`. Export `siteUpdateStatusRoute`, a core `defineJsonRoute` spec for `GET /api/admin/v1/workspaces/:workspaceId/system/site-update/status`, and `SiteUpdateStatusRouteDeps`. Its one domain port is `getStatus(required: Record<string, never>, optional?: { signal?: AbortSignal | undefined }): Promise<SiteUpdateStatusReply>`. Parse no query/body inputs. `handle({ deps, authorize }, _optional = {})` requires the authorizer, awaits `authorize({ permission: "system.read", entityType: "site-update" })`, then calls `deps.getStatus({}, { signal: _optional.signal })`. No platform, feed, credential, or apply implementation in the spec.
- Create `JD/react/SiteUpdateNotice.tsx`. Export `SiteUpdateNotice(required: SiteUpdateNoticeProps, _optional = {})`. Props are `kit: { components: { Notice: ComponentType<{ outcome: { ok: boolean; message: string; log?: string[] }; logLabel?: string }> } }`, `useSiteUpdateStatusHook: (required: Record<string, never>, optional?: Record<string, never>) => SiteUpdateStatusReply | null`, and `copy: { updateAvailable: (required: { latest: string; runningVersion: string }, optional?: Record<string, never>) => string; releaseNotes: string }`. Call the required hook unconditionally. Render the injected kit notice only for `available`. Show nonblank notes as plain text through the notice’s disclosure. No apply button and no fallback hook. The Tovu host supplies the kit component, status hook, and translated copy.

**Package and baseline.** Add direct entries to `packages/devops/package.json` next to `./deploy` and `./deploy/react` at `:23–24,135–144`. `./deploy/admin-http/site-update-status` → `dist/deploy/admin-http/site-update-status` (`universal`), and `./deploy/react/site-update-notice` → `dist/deploy/react/SiteUpdateNotice` (`browser`). Use the existing `types`/`import`/`default` mapping convention. No barrel or `@jini-ai/admin` dependency. Add `.changeset/p10-site-update-notice.md` as minor for `@jini-ai/core` and `@jini-ai/devops`. Refresh `api-baseline/jini-ai__core.json` and `api-baseline/jini-ai__devops.json` with `pnpm api:update`, then check that only these exports and types changed.

**Tests first**

| File | Exact new test name | Named mutation |
|---|---|---|
| `JD/admin-http/__tests__/site-update-status.test.ts` | `authorizes system.read before reading site update status` | `read-before-authorize` |
| Same | `forwards the request abort signal to the status reader` | `drop-status-signal` |
| `JD/react/__tests__/SiteUpdateNotice.test.tsx` | `shows the offered version and renders release notes as text through the injected kit` | `render-release-notes-as-html` |
| Same | `renders no update notice when the check is unavailable current or failed` | `render-notice-for-every-status` |

**Why-comments.** Authorization precedes the feed read because denial must cause no outbound request. Notes are release content, not trusted markup. The notice is informational because the chat card remains the only write path.

### P10-U2.T — Mount the status read in Tovu admin

**Repo: Tovu · BUILDER: OPUS**

**Files and signatures**

- Create `W/features/site-update/read-status.ts`. Export `readSiteUpdateStatus(required: { runtime: Pick<SiteUpdateRuntime, "runningVersion" | "feed" | "ids"> | null; reportFailure: (required: { error: unknown }, optional?: Record<string, never>) => void }, _optional: { signal?: AbortSignal | undefined } = {}): Promise<SiteUpdateStatusReply>`. Null runtime returns `unavailable` without I/O. Otherwise read the running version and use the existing `checkForUpdateFromFeed` comparison. Keep both operations inside the failure boundary. Return `check-failed` for a feed or version-read failure and send only redacted details to the existing failure reporter. Preserve cancellation. Never serialize the thrown message, feed URL, or credentials. This reader receives no write ports.
- In `W/server/runtime/composition/http-app/mount-admin-system.ts:166–177`, add `registerAdminSiteUpdateStatusRoute(required: { app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize" | "siteUpdateRuntime"> }, _optional = {}): void`. Mount the Jini spec through `mountAdminJsonRoute` at `W/server/inbound/admin-http/admin-json-route-ports.ts:343–351`. Inject the request-time runtime accessor and redacted failure reporter. Set `authorization: "direct"` and `sessionCredentialOnly: { permission: "system.read", message: "Sign in to check for site updates." }`. Set `Cache-Control: no-store` via the existing mount’s spec-header support. Do not add a `POST` or change how neighboring routes are gated.
- Create `A/integrations/jini-admin/site-update-notice.tsx` and `site-update-notice.hooks.ts`. Export `useTovuSiteUpdateStatus(required: { workspaceId: string; principalId: string; readStatus: ReadSiteUpdateStatus }, _optional = {}): SiteUpdateStatusReply | null`, where `ReadSiteUpdateStatus` is `(required: { workspaceId: string }, optional?: { signal?: AbortSignal | undefined }) => Promise<SiteUpdateStatusReply>`. Bind the client through `requestOnce` at `A/lib/admin-http/request.ts:194` with `GET`, `requireJson`, and the request signal. Do one check per mounted authenticated principal/workspace, with no polling. Abort on unmount and discard a late result for a different principal or workspace. A failed background check stays quiet.
- Export `TovuSiteUpdateNotice(required: { workspaceId: string; principalId: string; locale: string; useSiteUpdateStatusHook: typeof useTovuSiteUpdateStatus }, _optional = {})`. Pass the bound hook and `adminKit.components.Notice` from `A/integrations/jini-kits.ts:42–45` to the Jini view. Keep strings in Tovu’s admin dictionary. In `A/App.tsx:724–765`, use the existing permission predicate to supply the notice only after the signed-in session has a known `system.read` grant. Add an optional `siteUpdateNotice: ReactNode` slot to the existing `ShellMain` props at `A/App.chrome.tsx:158`, above routed content inside `<main>`. Do not mount a domain notice in the global login/boot notice stack.

Use the existing Core and DevOps package dependencies at `apps/admin/package.json:30–31`; consume the U2.J build before adopting the entry. No Tovu package export or Jini change in this sheet.

**Tests first**

| File | Exact new test name | Named mutation |
|---|---|---|
| `W/features/site-update/__tests__/read-status.test.ts` | `a failed running version read or feed read returns no private details` | `return-upstream-error-message` |
| `W/server/runtime/composition/http-app/__tests__/site-update-status.wire.test.ts` | `only an allowed admin session in this workspace can cause a status read` | `drop-session-credential-gate` and `drop-system-read-authorization` |
| Same | `the status route is GET only no-store and never reaches update write ports` | `drop-status-no-store` |
| `A/integrations/jini-admin/__tests__/site-update-notice.test.tsx` | `a status response for the previous principal or workspace cannot show a notice` | `commit-stale-status` |

**Why-comments.** Keep this below the authenticated shell so login and boot screens cause no release-feed traffic. A read route gets only read ports so a future UI change cannot accidentally install an update.

### P10-U4.J — Split preparation from verification across a restart

**Repo: Jini · BUILDER: OPUS**

**Files and signatures**

- Change `JD/site-update/run-site-update.ts:14–31,101–131,141–219`. Preserve the existing `runSiteUpdate` signature and inline behavior. Extract its existing approval, backup, and readiness stages into:
  - `prepareSiteUpdate(required: { ports: Pick<SiteUpdatePorts, "backup" | "readiness" | "ids">; plan: SiteUpdatePlan; approval: SiteUpdateApproval | undefined }, _optional: Pick<RunSiteUpdateOptions, "signal"> = {}): Promise<SiteUpdatePreparation>`.
  - `PreparedSiteUpdate = { plan: SiteUpdatePlan; backupId: string; steps: readonly SiteUpdateStepLog[] }`.
  - `SiteUpdatePreparation = { status: "prepared"; prepared: PreparedSiteUpdate } | { status: "stopped"; result: SiteUpdateRunResult }`.
  - `finishPreparedSiteUpdate(required: { prepared: PreparedSiteUpdate; ports: { site: Pick<SiteUpdatePort, "verifyUpdate" | "rollback">; ids: IdGenerator }; apply: { status: "landed"; summary: string } | { status: "failed" } }, _optional: RunSiteUpdateOptions = {}): Promise<SiteUpdateRunResult>`.
- `finishPreparedSiteUpdate` copies the prepared log and reuses the existing verify and rollback steps. It cannot apply, create another backup, or issue another approval. A confirmed apply failure goes to rollback. A landed apply still needs a live check before `"updated"` or `changes` is returned. Keep the separate rollback lifetime from `d559fd2db`. Hosts call this only with a durable operation they claimed and reloaded, never from request-supplied receipt data.
- In `JD/site-update/contracts.ts:41–48`, add `SiteUpdateReadinessOptions extends SiteUpdateCallOptions { backupId?: string | undefined; fromVersion?: string | undefined }`. Keep `MigrationReadinessPort.check`’s required `{ toVersion }` unchanged. Have preparation pass the captured `backupId`, `fromVersion`, and signal in the second object. Existing fakes can ignore the new fields.
- In `JD/site-update/desktop-site-update.ts:32–38,69–72` and `self-hosted-site-update.ts:62–64,105–108`, add an optional `rollbackDeployment` to each existing factory options object. Its port is `(required: { previousVersion: string; backupId: string }, optional?: SiteUpdateCallOptions) => Promise<void>` for desktop, and the same with `{ previousTag: string; backupId: string }` for self-hosted. An injected port owns the whole stop → restore → restart → old-version health sequence. Call it **instead of** the legacy sequence when supplied. Preserve legacy behavior for callers without it. Never bind the legacy sequence for a managed production update.
- Extend U2’s `SiteUpdateStatusReply` with `lastAttempt?: { status: "updating" | "updated" | "rolled-back" | "failed"; toVersion: string; summary: string }`. Extend U2’s notice to render this state independently of availability. The host supplies safe summary copy and can read the settled result after reconnect. An `"updating"` result must not render as completed.

**Package and baseline.** Keep the existing `./deploy` export at `packages/devops/package.json:135–139` and U2’s entries. Export the new functions/types through the existing `JD/index.ts:23–28` entries. No extra package entry. Add `.changeset/p10-site-update-restart-handoff.md` as minor for DevOps and Core. Refresh their two `api-baseline/` files. No Electron, Docker, GitHub, filesystem, or server-framework implementation in Jini.

**Tests first**

| File | Exact new test name | Named mutation |
|---|---|---|
| `JD/site-update/__tests__/run-site-update.test.ts` | `preparation gives readiness the exact captured backup and never applies` | `omit-captured-backup-from-readiness` |
| Same | `a reloaded preparation verifies the replacement without applying or backing up again` | `resume-by-running-the-whole-update-again` |
| Same | `failed replacement verification rolls back on its own lifetime` | `forward-cancelled-caller-signal-to-rollback` |
| `JD/site-update/__tests__/desktop-site-update.test.ts` and `self-hosted-site-update.test.ts` | `managed rollback delegates the binary and data recovery as one operation` | `run-legacy-rollback-before-managed-rollback` |
| `JD/react/__tests__/SiteUpdateNotice.test.tsx` | `an accepted hand-off is not shown as a finished update` | `render-updating-as-success` |

**Why-comments.** The process that accepted the update may not be the one that verifies it. Resuming must never repeat apply. The online database adapter cannot choose when to replace a live database file, so managed rollback delegates binary and data recovery together.

### P10-U3.T — Bind real readiness, owner approval, and update exclusion

**Repo: Tovu · BUILDER: OPUS**

**Files and signatures**

- Change `W/features/site-update/restore-point-backup.ts:12–31`. Extend the existing required args object with `registerBackup(required: { artifactRef: string; fromVersion: string }, optional?: SiteUpdateCallOptions): Promise<{ backupId: string }>`, `resolveBackup(required: { backupId: string }, optional?: SiteUpdateCallOptions): Promise<{ artifactRef: string } | null>`, and `checkCandidate(required: { artifactRef: string; fromVersion: string; toVersion: string }, optional?: SiteUpdateCallOptions): Promise<MigrationReadiness>`. Keep `createRestorePointBackup(required, _optional = {})`. The backup registers a host-private restore point and gives the runner only an opaque id. Reuse the snapshot mechanism already shared with site-backup. Do not export a portable share archive or restore the live DB from this request path.
- Create `W/features/site-update/candidate-readiness.ts`. Export `createCandidateReadiness(required: { rehearseMigration: RehearseMigration }, _optional = {})`. `RehearseMigration` takes `({ artifactRef, fromVersion, toVersion }, _optional?: SiteUpdateCallOptions)` and returns `Promise<MigrationReadiness>`. The host supplies rehearsal using the **exact staged candidate** and a disposable copy of the captured snapshot. Run the candidate’s real ADR-066 migration runner on the copy. For SQLite the existing boot and migration entry is `W/platform/db/sqlite/content-db.ts:14,89–118`. Missing backup, missing or substituted candidate, unavailable rehearsal, incompatible ledger, or failed migration means blocked. Do not treat an introspection read of the current binary as a candidate check. No new schema migration in this sheet. Leave unsupported stores read-only.
- Change `W/features/site-update/tools.ts:17–38,81–120,123–143`. Extend `SiteUpdateToolDeps` with `readOwnerId(required: Record<string, never>, optional?: Record<string, never>): Promise<string>`. At approval redemption, require the authenticated confirmer to equal the installation owner after reauthorizing the acting principal for `system.write`. Do that before obtaining a backup, staging a candidate, or enqueueing anything. Preserve the one existing card and the `fromVersion` recheck inside the lock. Wire the real owner lookup from `RouteDeps.ownerPrincipalId` at `W/server/routes/types.ts:185–186` through the contributor at `W/server/runtime/composition/tool-catalog-manifest.ts:591–595`. `system.read` still controls the read tool.
- In `W/server/runtime/composition/site-deps/site-update-binding.ts:43–81` and `assembly-phases.ts:246–250`, inject the lock and readiness ports through the existing binding objects. Reuse the site operation lock at `W/contracts/core/operation-lock.ts:1–5` for in-process exclusion with migrate/restore. The U4 supervisor owns the durable lease across processes and must fence writes and drain in-flight writers before snapshotting. Without that supervisor, do not expose production apply. A process-local mutex alone cannot prevent the rollback from undoing acknowledged edits or a second process from applying the same approval.

**Tests first**

| File | Exact new test name | Named mutation |
|---|---|---|
| `W/features/site-update/__tests__/apply-tool.test.ts` | `a system writer who is not the installation owner cannot approve an update` | `accept-any-system-writer-confirmer` |
| Same | `a second approved update cannot capture another backup while the first owns the site` | `run-approved-work-outside-the-lock` |
| `W/features/site-update/__tests__/candidate-readiness.test.ts` | `a snapshot-capable database with a failing candidate migration never deploys` | `treat-snapshot-capability-as-readiness` |
| Same | `migration rehearsal uses a copy of the approved backup with the exact target release` | `rehearse-against-live-database` and `rehearse-running-release` |
| `W/features/site-update/__tests__/self-hosted-binding.test.ts` | `an update backup id shown to the operator is not its artifact path` | `return-raw-artifact-reference` |

**Why-comments.** Snapshot capability answers whether a backup can be made, not whether the next release can boot. Fence writes before capture so rollback cannot discard later acknowledged writes. An authorized agent acting for a system writer is not, by itself, proof of installation-owner approval.

### P10-U4.T — Desktop IPC and self-hosted restart binding

**Repo: Tovu · BUILDER: OPUS**

**Shared hand-off**

- Create `W/features/site-update/approved-handoff.ts`. Add the host ports to the existing `SiteUpdateRuntime` args at `W/features/site-update/tools.ts:17–26` and to the existing `bindSiteUpdateRuntime` options. Use `submitPrepared(required: { prepared: PreparedSiteUpdate }, optional?: SiteUpdateCallOptions): Promise<{ operationId: string }>` and `readLastAttempt(required: Record<string, never>, optional?: SiteUpdateCallOptions): Promise<SiteUpdateStatusReply["lastAttempt"]>`. Site identity comes from the bound capability, never tool input.
- At `tools.ts:99–120`, under the U3 lock, recheck `fromVersion`, use U4.J preparation, and submit only on `"prepared"`. A durable acceptance returns `applied: false`, `outcome: "updating"`, and the opaque operation id. Bind `readLastAttempt` at U2’s status read. In real production composition, register `site_update_check` when a check runtime is available and `site_update_apply` only when the managed hand-off is available. Update the old fake binding witness that expects both registrations with no restart controller.
- The platform supervisor owns the durable operation record and lease. Record the approved plan, previous artifact identity, candidate identity, private backup reference, and phase before destructive work. A repeated submit for the same prepared operation returns the same id. Reconcile an interrupted apply by observing which artifact is live before deciding whether to verify or recover. Do not repeat install or deploy on a timeout. On failed verification, stop writers and the replacement, restore offline, boot the kept version, and prove it is healthy before publishing `"rolled-back"`. If recovery fails, keep the backup and give plain recovery instructions with an error id. Never say data was restored before it was. Keep this operation state outside the database it can restore.

**Desktop**

- Change `D/main/boot/site-backend.ts:31–61,227–267`, `D/tovu-server.ts:354–372,475,557–563,738–742,895–913`, and `D/main/index.ts:466–481,549–580,769–770,1156–1160`. Add `desktopUpdateLaunch?: { feedUrl: string; endpoint: string; token: string }` to the existing launch args. The main issues a capability per **owned** child and revokes it on failed spawn or child exit. `buildServeEnv` strips inherited desktop-update launch fields case-insensitively and supplies `TOVU_UPDATE_HOST=desktop`, `TOVU_UPDATE_FEED_URL`, `TOVU_DESKTOP_UPDATE_URL`, and `TOVU_DESKTOP_UPDATE_TOKEN` only for an explicit current launch. No capability for CLI init, an attached server, an unpackaged/skipped updater, or a blank feed.
- Add `TOVU_DESKTOP_UPDATE_TOKEN` to `packages/contracts/src/startup-secret-keys.ts:2–3`. Use the existing private launch IPC delivery at `D/tovu-server.ts:900–912` and the website’s `startupSecretEnvironment` at `W/platform/secrets/startup-secrets.ts:38`. Do not put the token in OS child env, argv, renderer state, or logs. Create `D/main/updates/site-update-ipc.ts` and `W/server/runtime/composition/site-deps/desktop-update-handoff.ts`. The main-owned loopback endpoint accepts only a bounded, authenticated, fixed operation protocol. Bind its capability to the spawning child and site. Reject foreign, revoked, or expired capabilities before dispatch. Allow narrow current-version and health reads. Mutating dispatch accepts the approved prepared operation, not a general-purpose “install this version” RPC or a public admin route. The child client pins the supplied loopback destination, refuses redirects, and passes the typed desktop ports and hand-off at `assembly-phases.ts:247–250`.
- Change `D/main/updates/site-update-host.ts:15–23,31–53`. Extend `createDesktopUpdateHost(required, _optional = {})`’s existing required object with the launcher’s staged-release and successor-site probes. A stage/apply pair must refer to the same approved and verified artifact. Serialize it with the native updater lifecycle. The approved path must neither trigger background auto-download nor let an unrelated quit install its staged release. Reuse the existing graceful drain. `quitAndInstall` is a hand-off, not evidence of success. Verify the replacement app version **and** the reopened site’s readiness. Keep the installation-wide updater lease and admit only site sets the main can quiesce, back up, restore, and reopen. Start with one owned site. Leave platforms without a proven prior-binary recovery path read-only.

**Self-hosted**

- Change `W/features/site-update/self-hosted-host.ts:9–19,30–46` and `W/server/runtime/composition/site-deps/site-update-binding.ts:43–81`. Replace the static `runningTag` input with `readRunningTag(required: Record<string, never>, optional?: SiteUpdateCallOptions): Promise<string>`. Keep the `restart` field in the existing options object and bind it as `(required: { tag: string }, optional?: SiteUpdateCallOptions) => Promise<void>`. This is the supervisor-side port. It selects the pinned image for that site and waits for the replacement. The website submits the durable operation and does not try to await its own replacement. Use the operator-owned deployment adapter’s live observation, not `update-target-tag` or the old process’s env, as proof of what is running. Keep the tag validation in Jini and retain the exact previous artifact identity.
- Create `W/server/runtime/composition/site-deps/self-hosted-update-supervisor.ts`. Export `createSelfHostedUpdateSupervisor(required: { driver: SelfHostedUpdateDriver; journal: SiteUpdateJournal; deadlines: SiteUpdateDeadlines }, _optional = {})`. `SelfHostedUpdateDriver` supplies `readRunning({})`, `restart({ tag })`, `checkLive({ expectedVersion })`, and `restorePrevious({ previousTag, backupId })`, each taking an optional `SiteUpdateCallOptions` second object. `readRunning` reports observed `{ tag, version }`; `checkLive` returns `SiteUpdateVerification`. Bind the configured site’s driver at `assembly-phases.ts:247–250`, through the existing boot args or overrides at `site-deps/overrides.ts:20`. With no driver, leave checks available if configured, and perform **no target-tag write**. A marker alone is not a restart.
- Keep the existing `TOVU_UPDATE_HOST=self-hosted` and explicit feed opt-in. Check the replacement’s version and readiness. The stock liveness probes do not report a version, and `/readyz` at `W/server/inbound/public-http/routes/ops/health.ts:29–48` reports readiness but not version. Use the supervisor’s observed artifact/version plus its live readiness check, or the explicitly configured versioned health response. Do not change unrelated probe wire contracts. `docker-compose.yml:14–25` builds `tovu:local` and does not supply a versioned update controller. Leave that default read-only. Do not mount a Docker socket in the website or add a shell-command escape hatch. Reuse an existing deployment driver only if it can pin, wait for, and restore the configured site’s release.

No new Tovu package entry. The desktop and website already use Jini dependencies that cover the shared contract. Keep IPC credentials, supervisor credentials, release-provider access, and platform implementation in host adapters. No DB schema change.

**Tests first**

| File | Exact new test name | Named mutation |
|---|---|---|
| `D/tovu-server.desktop-update.test.ts` | `only an owned serve launch receives its private site update capability` | `inherit-stale-update-token` |
| `D/main/updates/site-update-ipc.test.ts` | `missing wrong foreign and revoked capabilities never reach the updater` | `authorize-from-request-site-id` |
| `D/main/updates/site-update-host.test.ts` | `an approved stage cannot download or install a different version` | `install-last-staged-version` |
| `W/features/site-update/__tests__/desktop-binding.test.ts` | `an accepted hand-off is pending until the replacement app and reopened site are ready` | `report-updated-after-quit-and-install` |
| `W/features/site-update/__tests__/self-hosted-binding.test.ts` | `a check-only self-hosted installation never writes a target tag or restarts` | `record-tag-without-a-supervisor` |
| Same | `verification reads the replacement image instead of the old process tag or target marker` | `verify-recorded-target-instead-of-running-image` |
| `W/features/site-update/__tests__/approved-handoff.integration.test.ts` | `a restart after acceptance resumes one operation and never submits the deploy twice` | `redispatch-accepted-operation-on-boot` |
| Same | `failed replacement health stops writers and restores the backup before the previous release serves` | `start-previous-release-before-restoring-data` |
| Same | `declining the card or cancelling before acceptance leaves the supervisor untouched` | `submit-before-approval` |

**Why-comments.** Capabilities follow the owned child because an attached server is not this main’s authority. Desktop app version is not site health. A target tag is an instruction, not an observation. The update survives a restart because the supervisor owns it independently of chat and the replaced process.

**Acceptance before enabling either write path.** The implementer should run the affected Jini and Tovu tests, the pinned mutations, and `npm run gates` in `apps/desktop`. Then use a packaged desktop update and the selected self-hosted driver to witness old → approved new → verified success, and failed new → offline restore → verified old. Confirm the result is readable after reconnect. The report’s fake-host tests are not evidence for these restart cases.

## Owner question

**Which self-hosted deployment controller should be supported first?** The plan specifies an image-tag update but doesn’t name a controller. Recommended default is one operator-owned driver for a configured, versioned service outside the website process. Keep the stock local Compose build check-only. For desktop, enable apply only on platforms where the kept-binary and data recovery path can be proven. The owner’s existing decision to use one approval card for both hosts does not need reopening.
