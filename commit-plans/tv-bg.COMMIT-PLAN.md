# bg-tovu commit plan

Branch: `codex/tv-bg`. Starting HEAD: `f064021231` (tv-rs3 combined).
Read-only ancestry checks succeeded for merge-6 `776ce6d0f0` and
`origin/codex/tv-rs3`. ND-2 = NO.

The dispatch's machine rule keeps `.git` read-only and prohibits local tests,
builds, installs, type checks, and linters. No commits or pushes were made.
DONE below means implementation written and diff reread, with execution pending
in cloud. All red witnesses are expected failures from source inspection, not
claimed test results. Cloud must record red/green runs and the named mutations.
Commit each sheet separately, including M5-T-SPLIT before M5-T.

Paths below are relative to `apps/website/src` unless explicitly rooted.
No import repoints were needed; there are no REFRESH.md entries or file.
No dependencies, lockfiles, packages, baselines, or debt totals were changed.

## T-B05 — DONE

- Base: after tv-rs3, verified ancestor of HEAD.
- Commit: `bg-tovu: T-B05 correct the moved identity settings placement witness`.
- Files: `server/runtime/composition/site-deps/__tests__/identity-settings.characterization.unit.test.ts`.
- Tests written: corrected the existing placement case's URL, inspected function,
  and title. Retained the predecessor assertion and both tv-rs3 order assertions.
- Red witness: the original case reads `deps.ts`/`composeSiteRouteDeps`, which no
  longer owns the call; the existing case is expected red on merge-6. Not run.
- Cloud mutation: restore the old source URL and function target.
- Ledger: none; expected shrink 0.
- STOP/skip: none; `composeSiteServicesPhase` still calls
  `composeSitePluginRuntime` immediately before `composeIdentitySettings`.
- Final reread deletions: only the stale URL, target, and title; no extraneous edits.

## T-IMPORT-ABORT — DONE

- Base: merge-6 `776ce6d0f0`, verified ancestor.
- Commit: `bg-tovu: T-IMPORT-ABORT preserve cancellation after cleanup`.
- Files: `platform/site-dir/init-site.ts`;
  `features/site-backup/__tests__/integration/import-creates-new-site.integration.test.ts`.
- Tests written first: saved-key failure must reject with the identical abort
  object; collision remains an Error named InternalError with the existing
  `initSite: failed while creating …: EEXIST` pattern. Rollback, failed row,
  source-site checks, and the non-abort notice case remain.
- Red witness: merge-6 wraps the saved-key AbortError in InternalError. Not run.
- Fix: pass through AbortError only after successful directory cleanup; retain
  cleanup-failure classification and the separate external-DB cleanup.
- Cloud mutation: remove the AbortError pass-through. Verify the existing desktop
  cancellation path and cleanup-failure witness too.
- Ledger: none; expected shrink 0. `cleanupAndRethrow` complexity approximately 8.
- `cleanupFailedSite` is shared with `duplicate-site.ts:10`, so a duplicate
  cancellation also keeps its AbortError (accepted, same fix).
- STOP/skip: none; the wrapper and both cleanup boundaries remain in place.
- Final reread deletions: the stale three-line wrapper rationale was replaced by
  the exact owner note; removed the now-unnecessary error casts and abort-message
  regex branch in the rejection predicate. No unrelated edits.

## B02-R — DONE

- Base: merge-6 `776ce6d0f0`, verified ancestor.
- Commit: `bg-tovu: B02-R use error idioms for optional discovery reads`.
- Files: `assistant/tool-search-keywords.ts`; `cli/commands/deploy-config.ts`;
  `features/custom-credentials/tool-registrations.ts`;
  `features/deployments/deploy-ops/registry.ts`;
  `server/inbound/assistant/assistant-runtime-guidance.ts`;
  `features/deployments/index.ts`.
- Tests written: none, as directed. Existing witnesses read before edits:
  `assistant/__tests__/declared-tool-keywords.contract.test.ts:36–37`,
  `cli/__tests__/unit/deploy-config-command.unit.test.ts:125`,
  `features/deployments/deploy-ops/__tests__/registry.test.ts:138,207`, and
  `server/inbound/assistant/__tests__/assistant-runtime-guidance.unit.test.ts:202–204`.
  Cloud also retains continued credential creation and active route availability.
- Red witness: behavior-preserving sheet, no new behavior witness; the error
  ledger mutation is restoring each original catch. No tests run locally.
- Import check: the specified `git grep -n -F 'loadDeployOpsRegistry' -- apps/
  development/ packages/` found only direct registry imports. The barrel export
  itself was not treated as an importer; it alone was deleted. Other callers
  remain on their declarations. Parsing stays outside the inactive read fallback;
  primary registration, credential saving, and capability actions remain outside
  the optional-discovery fallbacks.
- Cloud mutations: individually restore both keyword catches, the help catch,
  both credential-catalog catches, bundled parse catch, inactive-read catch, and
  Chrome probe catch. Supply the planned core idiom artifact if needed.
- Ledger keys and expected `catch-reads-error` shrink:
  - B169 (`apps/website/src/assistant/tool-search-keywords.ts`, `catch-reads-error`): −2.
  - B172 (`apps/website/src/cli/commands/deploy-config.ts`, `catch-reads-error`): −1.
  - B199 (`apps/website/src/features/custom-credentials/tool-registrations.ts`, `catch-reads-error`): −2.
  - B203 (`apps/website/src/features/deployments/deploy-ops/registry.ts`, `catch-reads-error`): −2.
  - C392 (`apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts`, `catch-reads-error`): −1.
- Over 500 lines: `features/custom-credentials/tool-registrations.ts` (505).
- STOP/skip: none. Debt reductions are expectations for cloud, not measured results.
- Final reread deletions: the one unused barrel export, mutable keyword source
  binding, and replaced catch syntax; preserved existing why-comments. No extra edits.

## T-ANALYTICS-HOOKS — DONE

- Base: merge-6 `776ce6d0f0`, verified ancestor.
- Commit: `bg-tovu: T-ANALYTICS-HOOKS gate vendor hooks on effective consent`.
- Files: `features/analytics/jini-adapters.ts`;
  `server/runtime/composition/analytics-providers.ts`;
  `server/inbound/public-http/routes/site/analytics-ingest.ts`;
  `server/inbound/public-http/routes/site/__tests__/analytics-ingest.test.ts`;
  `server/runtime/composition/__tests__/analytics-providers.unit.test.ts`.
- Tests written first: the actual beacon fixture checks 204 and one first-party
  hit for denying and allowing gates, with zero/one plugin hook calls. The existing
  policy-off case uses real Express requests with a current choice cookie before
  and after policy disablement; the new gate must change from true to false.
- Red witnesses: merge-6 invokes the hook despite a denying gate and lacks the
  composed gate. Not run locally.
- Gate owner: existing `readSiteVisitorConsent` catches failed policy reads and
  returns a denying state. This composed gate cannot reject because of those
  reads, so first-party ingest continues. No second consent owner was added.
- Cloud mutations: bypass hook suppression in the route; return true from the
  composed gate. Preserve absent-port behavior via the existing adapter witnesses.
- Ledger: none; expected shrink 0.
- Over 500 lines: `server/inbound/public-http/routes/site/__tests__/analytics-ingest.test.ts` (593).
- STOP/skip: none. Existing production and adapter-test imports remain unchanged.
- Final reread deletions: none beyond the replaced hook binding and widened Pick.

## M5-T-SPLIT — DONE (separate commit owed)

- Base: merge-6 `776ce6d0f0`, verified ancestor; tv-rs3 left this file unchanged.
- Commit first: `bg-tovu: M5-T-SPLIT extract browser analytics HTTP dispatch`.
- File: `server/runtime/composition/browser-analytics-http.ts`.
- Tests written: none. Reuse
  `server/runtime/composition/__tests__/browser-analytics-http.unit.test.ts:10–48`.
- Red witness: behavior-preserving move; no new red case. Existing origin and
  exhaustion witnesses cover the named cloud mutation. Not run locally.
- Move: the original try-body statements and their whitespace remain verbatim
  in `dispatchBrowserAnalyticsHttp`; only the required-field destructure precedes
  them. Surface rejection, cache header, raw parser, catch, order, and limiter
  identity remain where they were.
- Cloud mutation: omit the limiter check or the origin refusal.
- Ledger: none; expected shrink 0.
- STOP/skip: no source stop condition. The executor cannot create the separate
  commit because `.git` must remain read-only. Apply the split-only patch below
  before committing the later M5-T changes to this same file.
- Final reread deletions: only the original inline body, moved verbatim; no cleanup
  or formatting changes to the moved statements.

## T-ANALYTICS-CONSENT — SKIPPED

- Base: merge-6 `776ce6d0f0`.
- Files/tests written: none for this sheet.
- Red witness, mutation, ledger: not applicable; expected shrink 0.
- Skip reason: coordinator explicitly set ND-2 = NO. Existing anonymous collectors
  and off-mode declared analytics scripts retain their pinned behavior.
- Final reread deletions: none. No BREAKS line or consent-off Chrome check applies.

## M5-T — DONE

- Base: after M5-T-SPLIT; consent sheet skipped under ND-2 = NO.
- Commit after split: `bg-tovu: M5-T add consent-gated site browser diagnostics`.
- Files: `server/runtime/composition/browser-analytics-http.ts`;
  new `server/runtime/composition/browser-diagnostics.ts`;
  `server/inbound/public-http/middleware/site-cookie-consent.ts`;
  `server/runtime/composition/__tests__/browser-analytics-http.unit.test.ts`;
  `server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts`;
  new `server/runtime/composition/__tests__/browser-diagnostics.unit.test.ts`.
- Tests written before implementation: default-off, missing metrics capability,
  successful full consent, anonymous/withdrawn consent, foreign origin, rate
  exhaustion, non-POST, media type, 256-byte boundary, malformed data, extra keys,
  strings, duration/error bounds; every refusal asserts zero metrics. Managed and
  authored-loader fixtures assert enablement, omission when off/exporting, and
  no-store module delivery. The module witness checks no installation before
  admission, one buffered navigation, error codes 1/2, immediate get(), repeated
  full consent without reinstalling, withdrawal/unmount disposal, aborted signals,
  and handled fetch rejection.
- Red witnesses: merge-6 lacks the module and returns 404 instead of accepting
  enabled diagnostics; managed/authored bridge assertions also fail. Not run.
- Cloud mutations: bypass enablement or admission; accept an extra key; emit
  buffered navigation twice; mount the bridge unconditionally.
- Ledger: none; expected shrink 0. No changes to `deps.browserAnalytics` or product
  exporter wiring; the exact HTTP literal uses contextual typing without a cast.
- The required collector excerpt was unavailable in this clone's refs but was
  read successfully, without modifying either git directory, from
  `<tovu>` at
  `origin/plan/culls-1120:cull-outputs/j-tv-rs3-DRAFT.md`, “Collector source”.
- Effective consent uses the existing consent-bridge subscribe/get contract;
  delivery uses the site's `RouteDeps.observability.metric` port. Four exports
  only. Bridge metadata and module text are data constants, avoiding argument-free
  factory wrappers. The single-entry validation/delivery callback keeps each
  function within the requested complexity budget without another helper.
- Over 500 lines: `server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts` (620).
- STOP/skip: none. Function limits reviewed from source only; cloud must verify.
- Chrome owed: managed pages, live authored pages, React and vanilla site-chat
  boots; verify zero diagnostics observers/listeners/requests before admission,
  collection after admission, disposal and no new sends after withdrawal.
- Final reread deletions: removed the unused optional bridge-mount argument;
  replaced conditional expected-metric construction in the receiver test with
  table data to keep its test callback within the complexity limit. No extra
  production helpers, comments, packages, admin diagnostics, or consent-off
  behavior changes remain.

## Other dispatch accounting

- Chrome look 1383 remains owed: Agent Plugins page and dock on a cold daemon;
  no code changes for 1383.
- Architecture sections 13/14 are absent from this private clone. The dispatch
  explicitly supplies its bootstrap and complete implementation brief; no new
  architecture proposal or broader repository scan was made.
- Items not specified by the cull: data representation of the two named bridge
  exports, the named enablement fields divided into two meaningful argument bags
  (capability first, optional settings/workspace second), the original-repository
  read used to obtain the exact collector brief,
  and cloud ownership of commits/red-green execution due to the machine rules.
- No REFRESH.md entries: no importer required repointing.

## Split-only patch for the cloud commit boundary

Apply this to starting HEAD for M5-T-SPLIT, then commit it separately before the
remaining M5-T diff. Other sheets do not alter this file.

```diff
diff --git a/apps/website/src/server/runtime/composition/browser-analytics-http.ts b/apps/website/src/server/runtime/composition/browser-analytics-http.ts
index 6d42b08d1d..2682fca14a 100644
--- a/apps/website/src/server/runtime/composition/browser-analytics-http.ts
+++ b/apps/website/src/server/runtime/composition/browser-analytics-http.ts
@@ -23,6 +23,13 @@ export function applyBrowserAnalyticsHttp({ app, deps }: { app: Express; deps: R
     if (surface !== 'site' && surface !== 'admin') { next(); return; }
     response.setHeader('Cache-Control', 'private, no-store');
     try {
+      await dispatchBrowserAnalyticsHttp({ request, response, deps, surface, limiter });
+    } catch { response.status(502).end(); }
+  });
+}
+
+async function dispatchBrowserAnalyticsHttp(required: { request: Request; response: Response; deps: RouteDeps; surface: 'site' | 'admin'; limiter: ReturnType<typeof createRateLimiter> }, _options = {}): Promise<void> {
+  const { request, response, deps, surface, limiter } = required;
       const fullPath = '/_jini/browser-analytics' + request.path;
       const contribution = deps.browserAnalytics?.({ surface }).find(item => item.http && fullPath.startsWith(item.http.path + '/'));
       if (!contribution?.http) { response.status(404).end(); return; }
@@ -32,8 +39,6 @@ export function applyBrowserAnalyticsHttp({ app, deps }: { app: Express; deps: R
         if (!(await limiter.check({ key: resolveClientIp(request) })).allowed) { response.status(429).end(); return; }
       }
       await deliver({ request, response, http: contribution.http, fullPath });
-    } catch { response.status(502).end(); }
-  });
 }
 
 /** No cookie or proof crosses the provider port. Failed policy/setting reads deny delivery. O(1). */
```
