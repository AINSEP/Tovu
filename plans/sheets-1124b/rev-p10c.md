REVISED r62t-rev-p10c: 1 SOL sheets (1 Jini / 0 Tovu), 5 OPUS sheets

**Build order:** `P10-U2.J → P10-U2.T → P10-U4.J → P10-U3.T → P10-U4a.T → P10-U4b.T`. U4a and U4b are separate Tovu commits. Self-hosted remains check-only this wave. Desktop apply is enabled only where kept-binary and data recovery are proven.

Changed anchors were checked on merge-21, Tovu `7c87b3c3f9` and Jini `010c8cd87`. No files changed and no tests, builds, installs, or type-checks ran. In the sheets, `W` = `apps/website/src`, `A` = `apps/admin/src`, `D` = `apps/desktop/src`, and `JD` = `packages/devops/src/deploy`. Keep the P9 extraction lanes untouched. At overlapping composition files, add only the mount, prop, or injected port needed by the sheet.

| Step | Status | Remainder |
|---|---|---|
| P10-U1 | DONE-ALREADY | The contract, fake, tests, and adapters already ship through `@jini-ai/devops/deploy`. No build sheet. |
| P10-U2 | PARTLY-DONE | The read tool and configured release feed exist. Add the authenticated admin status route and notice. No default feed URL. |
| P10-U3 | PARTLY-DONE | Keep the existing version-bound approval card. Add real migration readiness, production exclusion, and the installation-owner check at redemption. |
| P10-U4 | PARTLY-DONE | The host adapters and runtime slot exist. Add a durable hand-off and prove desktop recovery. Remove the self-hosted target-tag write from the no-driver path. The plan’s G7-11 reference is stale. |

**LOW follow-up, outside U2.T.** The existing `site_update_check` tool interpolates the upstream `error.message` at `W/features/site-update/tools.ts:73–74`. Do not fold that tool change into the new status route.

### P10-U2.J — Read-only status spec and update notice

**Repo: Jini · BUILDER: SOL**

**Files and signatures**

- In `packages/core/src/contracts/site/devops-deploy.ts:1`, add these types to the existing `@jini-ai/core/contracts/site/devops-deploy` entry. U4.J adds the last-attempt field.

  ```ts
  export type SiteUpdateAvailability =
    | { kind: "unavailable" }
    | { kind: "current"; runningVersion: string }
    | { kind: "available"; runningVersion: string; latest: string; notes: string }
    | { kind: "check-failed" };

  export type SiteUpdateStatusReply = { availability: SiteUpdateAvailability };
  ```

- Create `JD/admin-http/site-update-status.ts`. Export `siteUpdateStatusRoute`, a core `defineJsonRoute` spec for `GET /api/admin/v1/workspaces/:workspaceId/system/site-update/status`, and `SiteUpdateStatusRouteDeps`. Its one domain port is `getStatus(required: Record<string, never>, optional?: { signal?: AbortSignal | undefined }): Promise<SiteUpdateStatusReply>`. Parse no query or body fields. In `handle({ deps, authorize }, _optional = {})`, if `authorize` is `undefined`, throw `new Error("JSON route authorizer is required")` before calling `getStatus`. This is the existing refusal text at `packages/core/src/contracts/server/json-route.ts:256`. The `Handler` args make `authorize` optional at `:72`. Otherwise await `authorize({ permission: "system.read", entityType: "site-update" })`, then call `deps.getStatus({}, { signal: _optional.signal })` and return `ok({ value })`. No platform, feed, credential, or apply implementation in the spec.
- Create `JD/react/SiteUpdateNotice.tsx`. Export `SiteUpdateNotice(required: SiteUpdateNoticeProps, _optional = {})`. Use `kit: { components: { Notice: ComponentType<{ children: ReactNode; tone?: "info" | "success" | "warning" | "danger" }> } }`, `useSiteUpdateStatusHook: (required: Record<string, never>, optional?: Record<string, never>) => SiteUpdateStatusReply | null`, and `copy: { updateAvailable: (required: { latest: string; runningVersion: string }, optional?: Record<string, never>) => string; releaseNotes: string }`. The structural notice props match the live kit contract at `packages/ui-kit/src/react/types.ts:60`, without importing that implementation. Call the required hook unconditionally. Render the injected `Notice` with `tone="info"` only for `available`. Put nonblank notes inside a `<details>` disclosure with the injected summary label. Render notes as a text child only. Never use `dangerouslySetInnerHTML`. The `render-release-notes-as-html` mutation is exactly that swap. No apply button and no fallback hook. The Tovu host supplies the kit component, status hook, and translated copy.

**Package and baseline.** Add direct entries to `packages/devops/package.json` next to `./deploy` and `./deploy/react` at `:23–24,135–144`. Map `./deploy/admin-http/site-update-status` to `dist/deploy/admin-http/site-update-status` (`universal`) and `./deploy/react/site-update-notice` to `dist/deploy/react/SiteUpdateNotice` (`browser`) using the existing `types`/`import`/`default` convention. No barrel or `@jini-ai/admin` dependency. Add `.changeset/p10-site-update-notice.md` as minor for `@jini-ai/core` and `@jini-ai/devops`. Sol does not run `pnpm api:update`. Refresh `api-baseline/jini-ai__core.json` and `api-baseline/jini-ai__devops.json` in Opus combine and verify that only the intended exports and types changed.

| Test file | Exact new test name | Named mutation |
|---|---|---|
| `JD/admin-http/__tests__/site-update-status.test.ts` | `authorizes system.read before reading site update status` | `read-before-authorize` |
| Same | `refuses to read status when no authorizer is supplied` | `skip-authorize-when-absent` |
| Same | `forwards the request abort signal to the status reader` | `drop-status-signal` |
| `JD/react/__tests__/SiteUpdateNotice.test.tsx` | `shows the offered version and renders release notes as text through the injected kit` | `render-release-notes-as-html` |
| Same | `renders no update notice when the check is unavailable current or failed` | `render-notice-for-every-status` |

In the missing-authorizer test, invoke `handle` directly without `authorize` and assert that the injected reader was not called. In the notes test, use a kit fake that renders its children and a notes string containing HTML markup. Assert the literal text appears and no element from that markup exists.

**Why-comments.** Authorization precedes the feed read because denial must cause no outbound request. Notes are release content, not trusted markup. The notice is informational because the chat card remains the only write path.

### P10-U2.T — Mount the status read in Tovu admin

**Repo: Tovu · BUILDER: OPUS**

**Files and signatures**

- Create `W/features/site-update/read-status.ts`. Export `readSiteUpdateStatus(required: { runtime: Pick<SiteUpdateRuntime, "runningVersion" | "feed" | "ids"> | null; reportFailure: (required: { error: unknown }, optional?: Record<string, never>) => void }, _optional: { signal?: AbortSignal | undefined } = {}): Promise<SiteUpdateStatusReply>`. Null runtime returns `unavailable` without I/O. Otherwise read the running version and use the existing `checkForUpdateFromFeed` comparison. Keep both operations inside the failure boundary. Return `check-failed` for either failure and preserve cancellation. The route’s `reportFailure` is the admin JSON mount’s existing internal-error reporter. Bind the report-only `reportServerFailure` sink in `W/server/inbound/shared/admin-failure.ts:54–82`, which the mount’s failure path already uses, with a fixed operation label. Pass `{ error }` only to the bound reporter. Never pass the feed URL. Never serialize the thrown message, feed URL, or credentials. This reader receives no write ports.
- In `W/server/runtime/composition/http-app/mount-admin-system.ts:166–177`, add `registerAdminSiteUpdateStatusRoute(required: { app: Express; deps: Pick<RouteDeps, "workspaceId" | "authorize" | "siteUpdateRuntime"> }, _optional = {}): void` and call it from `mountSiteAdmin`. Mount the Jini spec through `mountAdminJsonRoute` at `W/server/inbound/admin-http/admin-json-route-ports.ts:343–351`. Inject the request-time runtime accessor and the redacted reporter. Set `authorization: "direct"` and `sessionCredentialOnly: { permission: "system.read", message: "Sign in to check for site updates." }`. Set `responseHeaders: { "Cache-Control": "no-store" }` on the Tovu mount’s spec object. It is forwarded to the HTTP kit adapter, which applies it before the guards at Jini `packages/http-kit/src/adapter.ts:61`. Do not add a `POST` or change how neighboring routes are gated.
- Create `A/integrations/jini-admin/site-update-notice.tsx` and `site-update-notice.hooks.ts`. Export `useTovuSiteUpdateStatus(required: { workspaceId: string; principalId: string; readStatus: ReadSiteUpdateStatus }, _optional = {}): SiteUpdateStatusReply | null`, where `ReadSiteUpdateStatus` is `(required: { workspaceId: string }, optional?: { signal?: AbortSignal | undefined }) => Promise<SiteUpdateStatusReply>`. Bind the client through `requestOnce` at `A/lib/admin-http/request.ts:194` with `GET`, `requireJson`, and the request signal. Do one check per mounted authenticated principal/workspace, with no polling. On identity change, clear the old status, abort the old request, and discard a late result even if the client ignores abort. Abort on unmount. A failed background check stays quiet.
- Export `TovuSiteUpdateNotice(required: { workspaceId: string; principalId: string; locale: string; useSiteUpdateStatusHook: typeof useTovuSiteUpdateStatus }, _optional = {})`. Pass the bound hook and `adminKit.components.Notice` from `A/integrations/jini-kits.ts:42–45` to the Jini view. Keep strings in Tovu’s admin dictionary. In `A/App.tsx:724–727,738–765`, mount the notice only for a signed-in user when `effectivePermissions` is a loaded array containing `system.read`. `undefined` means do not mount. Do not use the nav fallback, which treats unknown permissions as “show everything.” Use the existing admin workspace binding, used by `A/lib/admin-http/settings-api.ts:1–6`, and `user.id`. Add an optional `siteUpdateNotice?: ReactNode` slot to `ShellMain` at `A/App.chrome.tsx:158`, above routed content inside `<main>` and its existing `KitProvider` at `:187–191`. Do not mount it in the global login or boot notice stack.

Use the existing Core and DevOps package dependencies at `apps/admin/package.json:30–31`. Consume the U2.J build before adopting the entry. No Tovu package export or Jini change in this sheet.

| Test file | Exact new test name | Named mutation |
|---|---|---|
| `W/features/site-update/__tests__/read-status.test.ts` | `a failed running version read or feed read returns no private details` | `return-upstream-error-message` |
| `W/server/runtime/composition/http-app/__tests__/site-update-status.wire.test.ts` | `only an allowed admin session in this workspace can cause a status read` | `drop-session-credential-gate` and `drop-system-read-authorization` |
| Same | `the status route is GET only no-store and never reaches update write ports` | `drop-status-no-store` |
| `A/integrations/jini-admin/__tests__/site-update-notice.test.tsx` | `a status response for the previous principal or workspace cannot show a notice` | `commit-stale-status` |
| Same | `no notice is mounted while permissions are still unknown` | `treat-unknown-permissions-as-allowed` |

Create the wire-test directory if needed. The last test must exercise the shell mount decision with an authenticated user and `effectivePermissions: undefined`. Assert that the notice and its status request are both absent.

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

### P10-U4a.T — Shared approved hand-off and self-hosted check-only

**Repo: Tovu · BUILDER: OPUS**  
**OWNER-DEFAULT: 8**

**Scope.** Build the shared hand-off and last-attempt read. Self-hosted has no deployment controller this wave. Ship the `SelfHostedUpdateDriver` type and the no-driver path only. Do not implement or bind `createSelfHostedUpdateSupervisor`, choose a concrete driver, or require a self-hosted restart witness. A future operator-owned driver must target a named, versioned deployment outside the website process.

**Shared hand-off**

- Create `W/features/site-update/approved-handoff.ts`. Add the host ports to the existing `SiteUpdateRuntime` args at `W/features/site-update/tools.ts:17–26` and to the existing `bindSiteUpdateRuntime` options at `W/server/runtime/composition/site-deps/site-update-binding.ts:43–46,76–81`. Use `submitPrepared(required: { prepared: PreparedSiteUpdate }, optional?: SiteUpdateCallOptions): Promise<{ operationId: string }>` and `readLastAttempt(required: Record<string, never>, optional?: SiteUpdateCallOptions): Promise<SiteUpdateStatusReply["lastAttempt"]>`. Site identity comes from the bound capability, never tool input. Keep the check runtime’s `feed`, `runningVersion`, and `ids` usable without apply ports. A managed apply runtime must supply the hand-off, lock, backup, and readiness.
- At `tools.ts:99–120`, after U3.T’s owner check and under its lock, recheck `fromVersion`. Acquire the supervisor’s preparation lease and fence and drain writers before capture. Call U4.J’s `prepareSiteUpdate` and submit only on `"prepared"`. A durable acceptance returns `applied: false`, `outcome: "updating"`, and the opaque operation id. A stopped or cancelled preparation does not enqueue an update. Once accepted, the operation is independent of the caller’s cancellation.
- In `tools.ts:138–143` and `W/server/runtime/composition/tool-catalog-manifest.ts:591–595`, register `site_update_check` when the check runtime is available and `site_update_apply` only when managed hand-off is available. Use `buildDomainRegistrations`’ `unwiredToolIds` option for apply in check-only mode. Omitting the handler alone fails the catalog assertion at Jini `packages/core/src/registration-kit.ts:486–498,544–552`. Preserve the catalog, risk metadata, and sole existing approval card.
- Extend `W/features/site-update/read-status.ts` and its U2.T mount binding with the optional read-only `readLastAttempt` port. Read it independently of whether the feed check finds an update or fails, so the authenticated admin sees pending and settled state after reconnect. Forward cancellation. Only return the safe projection defined by U4.J, with no journal internals, artifact paths, credentials, or upstream exception messages. A host without a journal reader omits `lastAttempt`.
- The managed supervisor owns the durable operation record and lease outside the database being restored. Record the approved plan, previous and candidate artifact identities, private backup reference, and phase before destructive work. Repeating submit for the same prepared operation returns the same id. Reconcile interrupted apply by observing which artifact is live before deciding whether to verify or recover. Do not repeat install or deploy on a timeout. Publish `"rolled-back"` only after offline restore and healthy boot of the kept release. If recovery fails, preserve the backup and return safe recovery instructions with an error id. U4a pins this contract with fake ports. U4b supplies the desktop binding.

**Self-hosted no-driver path**

- In `W/server/runtime/composition/site-deps/self-hosted-update-supervisor.ts`, declare `SelfHostedUpdateDriver` only. Its ports are `readRunning(required: Record<string, never>, optional?: SiteUpdateCallOptions): Promise<{ tag: string; version: string }>`, `restart(required: { tag: string }, optional?: SiteUpdateCallOptions): Promise<void>`, `checkLive(required: { expectedVersion: string }, optional?: SiteUpdateCallOptions): Promise<SiteUpdateVerification>`, and `restorePrevious(required: { previousTag: string; backupId: string }, optional?: SiteUpdateCallOptions): Promise<void>`. These are future driver contracts, not website implementations. A future driver observes the running artifact and readiness. Neither the target marker nor the old process’s environment is evidence that a replacement booted.
- In `W/server/runtime/composition/site-deps/site-update-binding.ts:16–31,49–81` and `W/features/site-update/self-hosted-host.ts:9–20,30–46`, replace the production self-hosted apply binding with a check-only branch. Reuse configured feed construction at `W/features/site-update/configured-runtime.ts:23–26`. Keep `TOVU_UPDATE_HOST=self-hosted`, an explicit nonblank feed, and a known running version as prerequisites for checks. `TOVU_VERSION` or `TOVU_IMAGE_TAG` describes the current process for the check only. Do not construct or expose a target-tag or restart port in this branch.
- Remove the `createTargetTagRecorder` import and `recordTargetTag` binding from `W/server/runtime/composition/site-deps/assembly-phases.ts:41,246–250`. Remove the now-unused recorder at `site-update-binding.ts:93–96` and the old record-and-instruct path at `self-hosted-host.ts:34–38`. Without a driver, there is no target-tag write. Replace the old `self-hosted-binding.test.ts:46–65` witnesses that expect both tools and a marker write. Retain the opt-in, feed URL, and current-version checks.
- Leave the stock `tovu:local` Compose deployment check-only, and only when explicitly configured to check. Its `docker-compose.yml:14–25` has no versioned update controller. Do not add a Docker socket, shell-command escape hatch, or a version field to the unrelated `/readyz` wire contract at `W/server/inbound/public-http/routes/ops/health.ts:29–48`.

No Tovu package entry and no DB schema change. Use the U4.J Core and DevOps contracts already consumed by Tovu.

| Test file | Exact new test name | Named mutation |
|---|---|---|
| `W/features/site-update/__tests__/self-hosted-binding.test.ts` | `a check-only self-hosted installation never writes a target tag or restarts` | `record-tag-without-a-supervisor` |
| `W/features/site-update/__tests__/approved-handoff.integration.test.ts` | `a restart after acceptance resumes one operation and never submits the deploy twice` | `redispatch-accepted-operation-on-boot` |
| Same | `declining the card or cancelling before acceptance leaves the supervisor untouched` | `submit-before-approval` |
| `W/features/site-update/__tests__/read-status.test.ts` | `the last attempt is readable even when the release feed check fails` | `drop-last-attempt-on-feed-failure` |

Exercise the no-driver production binding in the first test. Assert only the read tool is exposed and that boot and an authorized check neither write `update-target-tag` nor call restart. Make the named mutation perform the marker write without a supervisor so the test observes it. In the cancellation test, cancel before preparation starts and assert no supervisor call. Also pin that a later pre-acceptance cancellation can release a preparation lease without submitting. In the restart test, use a fake durable journal and assert both one deploy and that a fresh reader sees the settled result.

**Why-comments.** A target tag is an instruction, not an observation. The update survives a restart because the supervisor owns it independently of chat and the replaced process.

### P10-U4b.T — Desktop IPC and recoverable updater binding

**Repo: Tovu · BUILDER: OPUS**  
**OWNER-DEFAULT: 8**

**Scope.** Consume U4a.T’s managed hand-off and U3.T’s readiness and owner checks. Bind desktop apply only for an owned site, on a packaged platform where the previous binary can be kept, the site’s data can be restored offline, and the kept release can be reopened and verified. Unsupported platforms remain read-only. No self-hosted driver or target-tag write in this commit.

**Owned launch and private capability**

- Change `D/main/boot/site-backend.ts:31–61,227–267`, `D/tovu-server.ts:305–321,354–372,475–487,557–563,738–742,895–913`, and `D/main/index.ts:466–473,562–573,769–770`. Add `desktopUpdateLaunch?: { feedUrl: string; endpoint: string; token: string }` to the existing launch args. Main issues a per-child capability only for an owned spawn and revokes it on failed spawn or child exit. Strip inherited desktop-update launch fields case-insensitively, including for CLI init. For an explicit current serve launch, set `TOVU_UPDATE_HOST=desktop`, `TOVU_UPDATE_FEED_URL`, and `TOVU_DESKTOP_UPDATE_URL`, and stage `TOVU_DESKTOP_UPDATE_TOKEN` solely for private IPC delivery. No capability for CLI init, attached servers, unpackaged or skipped updaters, or a blank feed.
- Add `TOVU_DESKTOP_UPDATE_TOKEN` to `packages/contracts/src/startup-secret-keys.ts:2–3`. Use the existing `splitNodeStartupSecrets` and `provideNodeStartupSecrets` at `D/tovu-server.ts:900–912` and the website’s `startupSecretEnvironment` at `W/platform/secrets/startup-secrets.ts:38`. Never put the token in OS child env, argv, renderer state, or logs. Do not fall back to an inherited token.
- Create `D/main/updates/site-update-ipc.ts` and `W/server/runtime/composition/site-deps/desktop-update-handoff.ts`. The main-owned loopback endpoint accepts a bounded, authenticated, fixed operation protocol. Bind the capability to the spawning child and its site. Reject missing, foreign, revoked, or expired capabilities before dispatch. Permit narrow current-version, health, and last-attempt reads. Keep preparation inside the approved operation’s lease and scope. Only a prepared operation may reach install dispatch. Do not expose a general-purpose “install this version” RPC or a public admin route. The child client pins the supplied loopback destination, refuses redirects, and passes the typed desktop ports and managed hand-off through `W/server/runtime/composition/site-deps/assembly-phases.ts:247–250` and `site-update-binding.ts:38–55,76–81`.

**Desktop supervisor and recovery**

- Change `D/main/updates/site-update-host.ts:15–23,31–53`. Extend `createDesktopUpdateHost(required, _optional = {})`’s existing required object with the launcher’s staged-release and successor-site probes. The approved version, artifact rehearsed by U3.T, and artifact installed must be the same. Serialize approved staging and install with the existing native updater lifecycle at `D/main/index.ts:466–473`. The approved path must neither trigger background auto-download nor let an unrelated quit install its staged release. Reuse the existing graceful drain at `D/main/index.ts:1116–1145`. `quitAndInstall` is a hand-off, not success.
- The main-owned supervisor implements U4a.T’s durable record and lease across quit and relaunch. Keep an installation-wide updater lease and begin with one owned site the main can quiesce, back up, restore, and reopen. Reload the durable operation when the replacement starts. Verify both the replacement app version and the reopened site’s readiness before publishing `"updated"`. Bind U4.J’s managed `rollbackDeployment` instead of the legacy sequence. If verification fails, stop writers and the replacement, restore the captured data offline, boot the kept binary, and verify both app version and site readiness before publishing `"rolled-back"`. Remove the current unverified “your site data was restored” claim at `site-update-host.ts:43–47`. If recovery cannot be completed, preserve the backup and publish safe recovery instructions with an error id. Keep the status readable through U4a.T after reopen.

No new Tovu package entry or DB schema change. Keep IPC credentials, release-provider access, and updater implementation in host adapters.

| Test file | Exact new test name | Named mutation |
|---|---|---|
| `D/tovu-server.desktop-update.test.ts` | `only an owned serve launch receives its private site update capability` | `inherit-stale-update-token` |
| `D/main/updates/site-update-ipc.test.ts` | `missing wrong foreign and revoked capabilities never reach the updater` | `authorize-from-request-site-id` |
| `D/main/updates/site-update-host.test.ts` | `an approved stage cannot download or install a different version` | `install-last-staged-version` |
| `W/features/site-update/__tests__/desktop-binding.test.ts` | `an accepted hand-off is pending until the replacement app and reopened site are ready` | `report-updated-after-quit-and-install` |
| `W/features/site-update/__tests__/approved-handoff.integration.test.ts` | `failed replacement health stops writers and restores the backup before the previous release serves` | `start-previous-release-before-restoring-data` |

The launch witness must distinguish the OS environment from the startup IPC payload. The IPC witness must also refuse an expired capability. Update the old desktop host witnesses at `D/main/updates/site-update-host.test.ts:43–56` that currently cover quit-and-install alone, manual rollback wording, and version-only health.

**Why-comments.** Capabilities follow the owned child because an attached server is not this main’s authority. Desktop app version is not site health. Never claim recovery until the kept release is serving the restored data.

**Acceptance before enabling desktop apply.** Run the affected Jini and Tovu tests, pinned mutations, and `npm run gates` in `apps/desktop`. On each packaged platform being enabled, witness old → approved new → verified success, and failed new → offline restore → verified old. Confirm the settled result can be read after reconnect. Fake-host witnesses do not prove the packaged restart or recovery path. If either packaged witness is missing or fails, keep that platform read-only.
