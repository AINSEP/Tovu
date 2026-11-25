BUGS security: 11 sheets, 14 bugs covered, 4 skipped (two stale entries, one site-specific plugin hold, one comment-only finding)

Read-only plan against Tovu `6ace8e8fb2` and Jini `50f8dfcd9`. No files changed and no tests, builds, installs, type-checks, or linters ran. Counts are by defect. H1193 contains two security defects, while H2142 and H2143 describe the same remaining writer defect.

**Build rules for every sheet.** Check the named symbol at the post-extraction path before editing. If its behavior or a prerequisite differs, stop that sheet and report the mismatch. Write the named failing test first and record its mutation in the builder’s uncommitted `COMMIT-PLAN.md`. Use synthetic credentials and injected ports. New functions take `(required, _optional = {})`, newly wired hooks are required props, and touched functions must stay at or below 80 lines and complexity 10. No sheet calls for a migration or theme change.

## 1. Desktop site creation — H1193, default owner password

**Root cause.** `initSiteDir` passes a shipped constant in argv when `adminPassword` is omitted. The subsequent desktop boot-token sign-in does not replace the password already seeded by `init`.

**Test first.** In `apps/desktop/src/site-dir-store.test.ts`, add `desktop init gives each new site a unique stdin-only owner password`. Capture two omitted-password launches using the existing spawn seam. Assert each receives its own nonempty password through the create-input JSON, neither password appears in argv or the child environment, and an explicit password still travels unchanged with the submitted plugin tokens. Mutation `restore-shipped-desktop-init-password` restores the omitted-password branch.

**Fix.** In `apps/desktop/src/site-dir-store.ts`, keep `initSiteDir(input: InitSiteDirInput)` and use the supplied password or generate a cryptographically random one in desktop main. Add `generateAdminPassword?: () => string` alongside the existing injected spawn seam, with the production implementation using `node:crypto`. Always use the existing `--create-input-stdin` envelope and pipe for desktop init. Remove the old password-in-argv and token-only desktop branches. Keep inherited admin env deletion, token-delivery error ordering, explicit passwords, and the CLI’s standalone behavior. Update only the affected spawn assertions and fixtures that previously had no stdin.

**Order and owner.** SOL. `tv-z3` and `tv-xd4-desktop` retain `initSiteDir` at the same Tovu path. **Packaged check:** create a local site without entering an owner password. Verify desktop opens Admin through boot-token sign-in, no password appears in launch diagnostics, and the owner can set a chosen password through Users.

## 2. Desktop workspace-chat IPC — B115 remainder

**Root cause.** `registerWorkspaceChatIpc` applies `assertTopFrame` to the primary run handlers but not to the agent inventory, conversation, and working-directory handlers. Those handlers reach their effects or return data before making the same admission decision.

**Test first.** In `apps/desktop/src/workspace-chat-ipc.test.ts`, add `workspace chat auxiliary invokes require a top-level sender frame`. Table-drive the 13 named registrations with synthetic frame metadata. Missing and child frames must receive the existing refusal before the fake stores or directory picker are called. Retain the trusted-frame controls. Mutation `drop-aux-chat-sender-frame-admission` removes the added guards.

**Fix.** In `apps/desktop/src/workspace-chat-ipc.ts`, call the existing `assertTopFrame({ event })` first in the three `AGENT_INVENTORY_IPC`, six `CONVERSATION_IPC`, and four `WORKING_DIRECTORY_IPC` handlers. Keep `registerWorkspaceChatIpc(deps: WorkspaceChatIpcDeps)`, channel names, payloads, and handler returns. No preload or IPC abstraction change.

**Order and owner.** SOL, independent of sheet 1. No move found. **Packaged check:** in the main chat window, verify agent refresh, conversation reopen and rename, and the working-directory picker still work.

## 3. External MCP trust boundaries — B272-oauth, B239-empty-allowlist, MCP-store-messages-echo-values, H1193 reauth permission

**Root cause.** OAuth redirect state is connection-bound but not bound to the saved client configuration, and token persistence switches to a fresh row after exchange. Separately, picker defaults overwrite the meaning of saved empty grants, validation and confirmation copy expose submitted text, and the reauth notice declares a permission its handler does not enforce.

### OAuth callback ownership

**Test first.** Activate `B272: an OAuth callback cannot apply a pending attempt to a replacement client` in Tovu `apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.test.ts`. Assert the replacement stays unchanged and the injected exchange port is not called when the saved configuration has changed. In the sibling `external-mcp-oauth.lost-update.test.ts`, add `a callback cannot commit tokens after its OAuth configuration changes`. Hold the fake exchange completion and assert the replacement has no old tokens or connected notification, including when the old and new envelopes are both absent. Mutations `drop-callback-state-basis` and `drop-callback-write-basis` remove the corresponding checks.

**Fix.** The old Tovu owner is `apps/website/src/features/external-mcp/external-mcp-oauth.ts`. The implementation now belongs in Jini `packages/integrations/src/api-connections/hosted-mcp/`. In `sign-in-flow.ts`, have `sealedRedirectState` take the row’s `createdAt` and configuration `version` along with the existing workspace, server and browser binding. Supply the basis at both calls in `sign-in.ts`. In `completeConnectionAuthorization`, persist against the callback’s pre-exchange row, not a replacement reread.

Thread an optional `expectedConfig: { createdAt, version }` through the existing `persistTokens` and `writeOAuthRuntime` seams. Compare it with the existing OAuth-envelope predicate in the same conditional write. Owners are Jini `packages/core/src/contracts/hosted-mcp/record.ts` and `packages/mcp/src/federation/hosted/store.memory.ts`, plus Tovu `external-mcp-repo.ts` and `external-mcp-repo.writes.ts` in the feature directory. Apply the same basis to callback-only invalid-client cleanup in `sign-in-status.ts` so a late refusal cannot clear a replacement. Keep shared sign-in, device flow, and refresh semantics unchanged. Already-issued local redirect links will need a fresh Connect.

### Saved empty grants

**Test first.** Complete `reopening after declining every recommended tool keeps them unticked` in Tovu `apps/admin/src/features/settings/hooks/__tests__/external-mcp-picker-reopen.unit.test.tsx`. Start from an absent value, save the explicit empty value, then reopen with the saved value. Assert zero enabled rows, an empty save payload and a clean draft. Mutation `default-explicit-empty-mcp-allowlist` restores the length-based condition.

**Fix.** Old Tovu owners are `apps/admin/src/features/settings/external-mcp-tool-picker-rules.ts` and `hooks/use-external-mcp-tool-picker.hooks.ts`. In the corresponding Jini files under `packages/admin/src/screens/settings/`, `seedToolPickerRows` may apply recommendations only when `allowedToolNames === undefined`. In `toolSurfaceSignature`, keep `undefined` distinct from `""` so a save can reseed the draft. Keep the transport unchanged. The Tovu roster already represents a persisted empty grant as `""`. Existing persisted empty rows cannot be distinguished from untouched ones, so leave them unchecked rather than inferring consent.

### Validation and card copy

**Test first.** In Tovu `apps/website/src/features/external-mcp/__tests__/save-refusals.unit.test.ts`, add `invalid auth mode and OAuth grant report fields without submitted values`. In `access-save.integration.test.ts`, add `remote endpoint confirmation shows only its origin`. Use synthetic markers and assert they never reach returned validation copy or rendered card text. Mutations `echo-invalid-mcp-enum` and `show-mcp-endpoint-path` restore the old outputs.

**Fix.** The former store owner was Tovu `apps/website/src/features/external-mcp/external-mcp-store.ts`. In Jini `packages/mcp/src/federation/hosted/store.ts` and `store-oauth-fields.ts`, retain field IDs and accepted-value lists in `resolveSavedAuthMode` and `assertOAuthGrant`, but omit submitted values. In Tovu `apps/website/src/features/external-mcp/tool-registrations.ts`, have `externalMcpAccessSubject` display only the origin of a validated remote URL. Preserve local-command redaction and the private, full admission snapshot. A generic redactor cannot reliably distinguish an arbitrary URL path from a secret, so fix the confirmed display boundary where the URL’s role is known.

### Reauth notice permission

**Test first.** In Tovu `apps/website/src/assistant/__tests__/external-mcp-reauth-tool.test.ts`, add `reauth notice requires integration management before reading the connection`. A denied fake authorization must produce the existing permission refusal, with no repo lookup or surface emission. Mutation `skip-mcp-reauth-permission`.

**Fix.** Add a required `authorize({ ctx, serverId }): Promise<void>` port to `ExternalMcpReauthToolDeps` in `apps/website/src/assistant/external-mcp-reauth-tool.ts`. Invoke it after ID parsing and before the first repo read. Bind it in `apps/website/src/assistant/tool-registrations.ts` through the same `requireToolPermission` policy used for External MCP management, with `admin.integrations.manage` and the workspace, principal and server scope. Keep the acknowledgement path unchanged.

**Order and owner.** SOL. Land the OAuth contract and both adapters together. The picker, copy and notice changes are independent of that write change. Jini `w3-r2allj`, `r3-w1aj`, and `r3-w1bj` retain the shared owners. Tovu `tv-w3-ext-w1x` retains `externalMcpAccessSubject` in the same host file. **Real-app check:** with a disposable connection, complete a fresh sign-in and reopen Tools after saving zero grants. Confirm zero stays selected after reload and the approval card displays only the endpoint origin.

## 4. Form-delivery settings — B170

**Root cause.** `assertNotSecretValue` checks several structural credential formats but omits the shared token-shape vocabulary. An ordinary config key can therefore carry credential-shaped text into durable settings and delivery jobs.

**Test first.** Activate `a vendor-shaped secret under an ordinary delivery config key is refused before job serialization` in Tovu `apps/website/src/features/settings/__tests__/form-delivery.unit.test.ts`. Check top-level and nested config separately so the first refusal cannot mask the nested case. Assert the existing typed refusal and no submitted value in its message. Remove the obsolete witness that requires acceptance. Mutation `omit-shared-delivery-secret-shapes`.

**Fix.** Old owner `apps/website/src/features/settings/form-delivery.ts` → Jini `packages/cms/src/settings/site/form-delivery.ts`. In `assertNotSecretValue`, reuse `SECRET_SHAPE_PATTERNS` from the existing `@jini-ai/core` export alongside current checks. Keep the parser signature and error copy. Do not copy vendor patterns into CMS or modify stored rows automatically.

**Order and owner.** SOL. Jini first, then the Tovu witness against the updated dependency. The extraction refs retain the Jini file and its validation anchor.

## 5. Admin error copy — B259

**Root cause.** `describeApiError` treats native exceptions as operator copy. It cannot establish that an arbitrary exception message is safe to show.

**Test first.** Activate `an unexpected Error cannot expose a private path or a synthetic credential in admin copy` in `apps/admin/src/lib/__tests__/api-describe-error.unit.test.ts`. Assert the caller’s fallback exactly. Keep the typed `ApiError`, empty-message and exact `"network down"` controls. Mutation `expose-raw-unexpected-error`.

**Fix.** In `apps/admin/src/lib/admin-http/request.ts`, keep `describeApiError({ e, fallback }, _optional = {})`. Keep the typed `ApiError` behavior. For the explicitly pinned native `"network down"` case return that fixed literal. All other unexpected values return `fallback`. Correct the directly affected documentation and assertions that pin raw native diagnostics. No error-shape heuristics or changes to the response decoder.

**Order and owner.** SOL. `tv-w3-ext-a` moves transport internals to Jini `packages/admin/src/shell/lib/admin-http/request.ts` but retains this function in the Tovu adapter. Fix the Tovu owner.

## 6. Publish credential verification — B226

**Root cause.** The `(workspaceId, target)` cache slot has no credential identity. A successful check can therefore outlive the selected credential or its saved revision.

**Test first.** Activate `B226: changing the default publishing key does not inherit the previous key's valid check` in `apps/website/src/server/runtime/composition/modules/__tests__/publish-verification-basis.unit.test.ts`. Seed a successful check tied to A, promote unverified B, and assert B is not ready, has no inherited verification timestamp or status, and readiness performs no outbound check. Mutation `read-publish-verification-without-basis`.

**Fix.** Under Tovu `apps/website/src/features/deployments/`, carry a local `PublishVerificationBasis` of saved `{ id, revision }` or an explicit environment discriminator.

- In `publish-credentials/store.ts`, use the existing metadata selector for the selected basis. Return the revision from the same opened vault summary as the verified payload, not from a second lookup after the probe.
- In `static-publish/credentials.ts`, carry that basis through the Tovu source for `resolve` and the metadata-only `isConfigured` result. Preserve source precedence and explicit-ID refusal.
- In `static-publish/verify.ts`, have `get` and `set` take the basis in their input object. Keep one cache entry per workspace and target, with the basis beside the result. Leave slot-wide `delete` and compatibility invalidation unchanged. Bind both verification writers to the credential actually checked.
- In `publish-agent-tools.ts`, `buildProviderCapability` reads the cache only for the basis returned by readiness. Keep readiness non-decrypting and network-free. Do not expose the basis in the tool response.

**Order and owner.** SOL. Test first, then land the reader and writers together. `tv-w3-ext-w1x` extracts the host-kit dependency into Jini devops but retains `verify.ts` and the Tovu selection policy at their original paths.

## 7. Source Control credential deletion — SC-permanent-delete-canonical

**Root cause.** The delete confirmation’s loader only describes legacy credentials by ID. The remover already supports canonical keys, but the confirmation cannot find them.

**Test first.** In `apps/website/src/features/permanent-delete/__tests__/deps.test.ts`, add `permanent delete reviews and removes a canonical source-control credential`. Use only a fake scoped canonical summary. Assert prepare shows that item, execute calls canonical removal for the same workspace and ID, and the legacy remover is not used. Mutation `delete-source-control-describe-legacy-only`.

**Fix.** In Tovu `apps/website/src/features/source-control/store.ts`, have the existing `describeCredential(deps, input)` preserve its current legacy match and, on a miss, use `repo.canonical.list({ workspaceId })` to select the exact ID. Both lookups are metadata-only. Leave `prepareSourceControlCredentialDelete` in `apps/website/src/server/runtime/composition/permanent-delete-deps.ts` on that function. Its existing re-read and confirmation check must use the same lookup, and its remover stays unchanged.

**Order and owner.** SOL. No move found for the store or host composition path.

## 8. Root-key auto-creation — H1005

**Root cause.** Jini `EnvOrFileKeyring.resolveRootKey` checks for existence and then uses a nonexclusive write. Two processes can end up deriving from different key bytes for one path.

**Test first.** In Jini `packages/platform/src/secrets/__tests__/keyring.env.generate-errors.test.ts`, add `auto-generation never replaces a root key created concurrently`. Use the existing mocked filesystem seam to return a write collision. Assert the write is exclusive at mode `0600`, the losing invocation does not derive from uncommitted material, and the winner’s bytes remain authoritative. Mutation `auto-create-root-key-without-exclusivity`.

**Fix.** In `packages/platform/src/secrets/keyring.env.ts`, use the existing `generateFileRootKey({ keyFilePath })` in the auto-generate branch and cache its returned bytes only after success. Let the existing collision error stop that invocation. A fresh invocation can read the winner through the normal file branch. Keep env precedence, fallback permissions, parsing and HKDF unchanged. Tovu `apps/website/src/features/webhooks/keyring.env.ts` is a separate host adapter, not the owner of this write.

**Order and owner.** SOL. Same Jini path on the inspected extraction refs.

## 9. Secrets tab partial availability — H1122

**Root cause.** The Tovu view returns as soon as either credential tier reports a load error. It hides rows from the other tier even when that tier loaded successfully.

**Test first.** In Tovu `apps/admin/src/features/security/__tests__/AccessTokensTab.unit.test.tsx`, add `a credential-store refusal does not hide an available store`. Use the existing injected controllers in both directions. Assert the refused tier’s notice and the healthy tier’s row are visible at the same time, with no global “Not connected” state. Mutation `return-before-rendering-healthy-credential-tier`.

**Fix.** In `apps/admin/src/features/security/AccessTokensTab.tsx`, make `AccessTokensBody` render the existing notices alongside available groups. Keep the existing loading copy while neither tier has resolved. Show the global empty state only when both completed without an error and there are no visible results. `useMergedSecretsOrder` already accepts missing groups. Do not change endpoint permissions or loaders.

**Order and owner.** SOL. Jini `packages/admin/src/security/react/tabs/AccessTokensTab.tsx` already renders errors and sections together, but `tv-adm-dom2` still mounts the Tovu tab from `Security.tsx`. Fix the active host tab. If the actual target has switched the mount to Jini, stop the Tovu edit and carry the witness to that mount. **Real-app check:** with a test role permitted to read one credential store and denied another, confirm the allowed rows and the denied-store notice appear together.

## 10. Site-update assistant error copy — g5a-site-update-check-error-text

**Root cause.** `checkTool` and `prepareApply` interpolate upstream exception text into model-facing messages. Those exceptions can contain private paths or credential-bearing request details.

**Test first.** In `apps/website/src/features/site-update/__tests__/check-tool.test.ts`, update the existing offline test to assert safe fixed copy when the injected feed throws a synthetic private marker. In `apply-tool.test.ts`, add `failed update preparation does not expose upstream details` and assert the typed refusal, no card and no apply effect. Mutation `interpolate-upstream-update-error` restores the raw text at the two sites.

**Fix.** In `apps/website/src/features/site-update/tools.ts`, replace the two interpolations with `Could not check for updates. Nothing was changed.` Preserve the check result fields, the apply `ToolInputError`, authorization order and the existing feed and hand-off ports. Jini owns the update primitives under `packages/devops/src/deploy/site-update/`. The tool copy stays in Tovu.

**Order and owner.** SOL. Independent of B259. No move found for either message sink.

## 11. Publish-content writer attribution — FIX 19 / H2, H2142 and H2143

**Root cause.** `applyRepoWithUndo` and `writeRawRowCommand` synthesize a human actor when the trusted apply-run actor is absent. The real ceremony already provides an actor, but direct callers can silently record the wrong kind.

**Test first.** Restore the two refusal witnesses from Jini `2df333941` in `packages/cms/src/publish/content/__tests__/repo-handler.actor.test.ts` and `raw-row-contributor.test.ts`. Assert `MissingMutationActorError` before any write and retain the adjacent trusted-agent attribution controls. Mutation `fallback-to-user`.

**Fix.** Restore the focused `2df333941` behavior in Jini `packages/cms/src/publish/content/repo-handler.ts` and `raw-row-contributor.ts`. Reuse `applyRunActor({ deps, principalId }, _optional = {})` where present. If the extraction branch removed it, port only the named helper and its two calls from the known patch. The former Tovu paths were `apps/website/src/features/publish-content/{repo-handler,raw-row-contributor}.ts`. Add `mutationActor` to direct Tovu fixture deps where they stand in for an authorized run, following `e51dcf470`. The remaining cohort is the media and post publish-content suites named in H2143, plus `library-publish-transport`, `L156-characterization`, `backstop-batch.apply-loop`, and `publish-content-manifest`. Do not add actor defaults or change the real ceremony. The separate restore-journal column is out of this sheet and remains dependent on versioned journal migration design.

**Order and owner.** NEEDS-OPUS. The known patch was backed out twice, most recently after the ledger recorded roughly 84 further affected Tovu cases. Coordinate the cross-repo fixture cutover with the Jini guard. `w3-r2allj` and `r3-w1bj` retain the fallback but remove the helper, so do not blindly revert `ab4e873e6` onto those branches.

## Skipped

- **H1440, saved keys silently hidden.** The cap remains, but Tovu now computes `omittedCount`, projects it to the picker, and has a witness for the visible “more not shown” notice. Pagination is separate.
- **H1974, media tool replaces the whole credential set.** The current planner patches one provider inside `replaceWorkspace` and returns no tombstones. The extracted Jini owner at `packages/cms/src/media/site-generation/provider-credential-save.ts` retains that guard.
- **H2179 / UI recheck #3, GitHub provider unavailable.** The source already refuses the held pre-rename plugin and names the remedy. The installed-copy and upgrade-ledger verdict still needs the owner’s real-site check. Inspect the hold reason, use the supported Agent Plugins reinstall, and verify GitHub returns to Source Control. Do not weaken the plugin trust check.
- **H2195, dark-routine allowlist.** The exact-set witness was corrected, and the writers are exchange-only while dark. The remaining stale comment is not an open authorization defect.
