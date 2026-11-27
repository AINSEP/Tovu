# Rules — Tovu working-tree handoff

Base: `codex/tv-bug-rules`, HEAD `77de055fd0f0cb313a5f0f4cd932af52213f35be`.
No commits, pushes, installs, builds, tests, typechecks, or linters are permitted by this dispatch.
Regression tests are written before their fixes; RED/GREEN and mutations are not executed here.

## Commit order

1. Sheet 6 — stop routines on CLI signal shutdown (completed, unverified).
   - `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`
   - `apps/website/src/cli/commands/serve-listen.ts`
   - Regression: `SIGTERM and SIGINT stop routines once before storage closes`.
   - Mutation: `omit-routines-from-signal-shutdown` removes only `routines` from the signal worker list; the ordered stop assertions must fail.
   - Correct the stale BR-07 source assertion to inspect `installShutdown` in `serve-listen.ts` and retain storage/boot-work ordering assertions.
   - Added only the existing serving app's missing `releaseOnShutdown` no-op to the harness so signal shutdown reaches the worker list. Both signals remain exercised by existing scenarios; the startup-failure expectation is unchanged.

2. Sheet 7 — deterministic media-provider expiry tests (completed, unverified).
   - `apps/website/src/features/media-generation/__tests__/providers-tools.test.ts`
   - Regression: strengthened `t10 media expired form closes without saving` with ambient `Date.now()` drift of 6 ms per read, an opened form and a pending exchange at virtual +4 ms, then expiry at +5 ms.
   - Mutation: `provider-expiry-system-clock` restores `createSystemClock()` for the exchange store; forced wall-clock drift expires the form before its controlled deadline.
   - The existing `L241 expired` case advances the exchange clock with the mocked timer. Credential clock, scheduler, 5 ms TTL, production code, and outcome assertions stay unchanged.

3. Sheet 8 — wire the committed publish candidate into connect (completed, unverified).
   - `apps/website/src/features/publish-content/__tests__/publish-trust-provisioning-root.test.ts`
   - `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`
   - Regression: `assistant connect without siteUrl uses the committed deploy candidate` calls the real registered handler with `{}` and no candidate override. A minimal bundled `jini-deploy-configs.json` declares the repository's YAML path. Assert the fake handshake receives `https://example.com`, one peer is recorded, and provisioning writes under `TOVU_REPO_ROOT` with cwd empty. Existing probes keep their explicit URL inputs.
   - Mutation: `candidate-only-in-content-projection` deletes the top-level `findPublishCandidate` field from the contributor wrapper, returning the incorrect no-live-site result and failing the connection/handshake/peer assertions.
   - This unit is separate from LF-2; no `installResourceTools` implementation edit is included. Coordinator commits/rebases this unit before LF-2.

## Sheet dispositions

- 1 — STOP: `apps/admin/src/features/media/ExternalProvidersPanel.tsx` is absent. No `ExternalProvidersPanel` or `MediaProvidersTab` caller exists in the named media/integrations areas. `integrations/jini-kits.ts` already imports the root-exported `useMediaProvidersTab` and binds it in `adminKit.mediaProviders`. Jini's report records the required UI prop and changeset; coordinate that release with data 4. No substitute component or release bump invented.
- 2 — STOP: Tovu `AccessTokensTab.tsx` now exports `bindAccessTokensTab({ hooks, kit, deps })`; there is no local `AccessTokensTabProps` or destructuring default to change. The binding already supplies `useWiredOtherCredentials`. On `origin/codex/bug-rulesj`, Jini's `AccessTokensTabBindings.hooks.useOtherCredentialsHook` is required, while `bindAccessTokensTab` still exposes an optional override defaulted from those bindings. This differs from the sheet's named top-level prop contract; no redesign made.
- 3 — skipped, NEEDS-OPUS per the corrected verdict and Appendix A4. No legacy-sink work attempted.
- 4 — blocked by sheet 3's prerequisite. No split or size test added before that prerequisite.
- 5 — skipped in Tovu: the raw-manifest gate and duplicate UI entries are Jini-owned and covered by the Jini handoff.
- 6 — completed, unverified. `routines` is immediately after `releaseOnShutdown`; all other workers retain their relative order.
- 7 — completed, unverified. Only the test fixture clock and the two existing expiry cases changed.
- 8 — completed, unverified. One top-level dependency field added; override precedence, the lazy content projection, and registration order are unchanged. The finder is passed without invoking it at build time.
- Source Control ProvidersTab — retained the explicit skip; no deleted leaf patched.

## Final diff pruning

Re-read the complete diff for all five changed tracked files. No out-of-scope additions remained, so there were no pruning deletions. The test fixture's system-clock import was replaced by the named fake clock; no production functions, why-comments, or unrelated assertions were deleted. No new production helpers, types, abstractions, options, comments, or dependencies were added. The only created file is this uncommitted handoff plan.

Validation is limited to source and diff inspection. No baseline, test, mutation, packaged check, install, build, typecheck, linter, commit, rebase, or push was run. The coordinator/Opus must execute the named regressions and mutations, the existing behavior pins, and the packaged CLI/desktop checks from the sheets.
