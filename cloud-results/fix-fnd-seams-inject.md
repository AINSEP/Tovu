DONE
# fix-fnd-seams-inject — review `reviews/rv-f-fnd-seams-inject.md` FIX items (2026-11-23, unattended resume)

Branches: Jini `codex/ex5-fnd-seams-jini` 80523731, `codex/ex5-fnd-inject-jini` 1046a1ad (unchanged this run); Tovu `codex/ex5-fnd-seams-tovu` 5e5b48998 (+ this report), `codex/ex5-fnd-inject-tovu` 6f571e3d0 (unchanged this run).
The run before the weekly-limit stop had already committed every code item (commits since 2026-11-23T07:30Z); this resume SKIPPED those, verified both pairs end to end, fixed one miss, and ran the inject-5 matched comparison. Env: Node 22.23.5, pnpm 10.33.2; Jini frozen install + `-r build`; Tovu `npm ci` x4 + `link:jini` (JINI_PACKAGES_DIR=/home/user/Jini/packages) + `@tovu/sdk` build.

## Items
| item | status | commit(s) |
|---|---|---|
| seams-1 K4 cutover (InstalledAgentPlugin/lifecycle types, SetAgentPluginEnabledResult, AgentEvent → core owner; Tovu forwarding deleted) | fixed (prior run) + **follow-up this run** | Jini b259d772, 80523731 (Wiring); Tovu 54db4bce9, **5e5b48998** |
| seams-2 mutation evidence (lifecycle, AgentEvent, tracker move) | fixed (prior run) — recorded in b259d772 body | Jini b259d772 |
| inject-1 no server→platform process edge | fixed (prior run): kernel-base back to `@jini-ai/node-adapters/process` as on base, process half of XC-6a deferred with XC-6c/d | Jini b805b56e |
| inject-2 inject peer URL raw-char check | fixed (prior run), `_optional = {}` kept, check on raw string before `new URL()` | Jini f7401694; Tovu 3fc33bc6f |
| inject-3 API baseline delta | fixed (prior run) | Jini d2eadc1e |
| inject-4 custom-credentials metadata back in host | fixed (prior run); Jini subpath dropped + provider-neutral vocabulary test | Jini 48d76b86; Tovu 6f571e3d0 |
| inject-5a live-site resolver + `/m/` scan tests | fixed (prior run) | Jini 97811ac4 |
| inject-5b matched-run comparison of inconclusive/unattributed reds | **done this run** — see below; no code change needed | (report only) |
| Wiring sections | Jini READMEs done (80523731, 1046a1ad). Tovu touched feature folders (agent-plugins, plugin-runtime, site-backup, publish-content, custom-credentials, project-keys) have no INFO.md/README → nothing to extend |

**5e5b48998 (this run):** 54db4bce9 deleted the `lifecycle.ts` type forwarding but two integration tests (`assistant/__tests__/mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts`, `features/agent-plugins/__tests__/integration/agent-plugin-tool-revocation.integration.test.ts`) still imported `InstalledAgentPlugin` from it; only `typecheck:tests` sees them. Red: `typecheck:tests` 2 × TS2724 → green 0; both files 8/8. (Its Claude-Session trailer reuses the earlier run's URL by mistake; not rewritten — no force-push.)

## Mutations
Recorded by the prior run in commit bodies (red → restored green): core lifecycle `InstalledAgentPlugin.pluginId` rename → agent-plugins tsc 101 errors/0; core `AgentEvent tool_result.toolUseId` → chat tsc 247/0; `TrackerSpan.setOutcome` → diagnostics tsc 15/0; peer-url check bypass → 2/12 red; custom-credentials restored → 1/20 red; resolver bypass → 2/2 red; `/m/` scan removed → 1/15 red; kernel-base platform edge → XP2 1→0. This run: the stale test imports were their own red (TS2724 ×2 → 0). Pre-fix Tovu inject (a50e43349) + fixed Jini: `set-token-agent-tool.unit.test.ts` fails to load (custom-credentials subpath gone) → tip 26/26, i.e. the Tovu half of inject-4 is required.

## Verification
**Jini seams** (80523731): build 0; typecheck 0; guard 0; api:check 0. vitest (`--maxWorkers=2`): core 2993/2993, chat 4508 (+1 skip), agent-plugins 2195 (+2 skip), diagnostics 1086 + **4 red = `RegExp.escape is not a function`** (Node 22 env; needs Node 24; page-body.test untouched).
**Jini inject** (1046a1ad): build 0; typecheck 0; guard 0; api:check 0; `check-no-cross-package --base 4902a6a1` XP2 0 findings (kernel-base imports match base). vitest: core 2999/2999, node-adapters 38/38, server 469 (+1 skip), cms 5073 + 8 red = 7 `RegExp.escape` (env) + `forms/package-boundary` version 0.7.2 vs 0.7.3-next.2 (packages/cms/forms untouched vs base 4902a6a1 → pre-existing).
**Tovu seams** (5e5b48998, linked to Jini seams): website typecheck 0; typecheck:tests 0 (was 2 → fixed); desktop tsc 0; site-chat tsc 0; admin tsc 4 errors = known BASE-RED (`AdminKit` Icon/useT/values, A-K2-0a.T not landed). Changed tests: website/site-chat 14 files 309/313 — 3 red in `plugin-host.integration.test.ts` (identical 3 at pre-fix tip 2800f38ca → pre-existing; also BASE-RED in the matched run below) + `site-assistant-transport.test.ts` load error "Incompatible React versions 19.2.8/19.2.7" (identical at pre-fix tip; link env). admin vitest 12 files 233/233; desktop renderer 55/55.
**Tovu inject** (6f571e3d0, linked to Jini inject): website typecheck 0; typecheck:tests 0; admin tsc 4 = same BASE-RED. 98 related files (changed + publish-content/custom-credentials/project-keys + normalizePeerBaseUrl/destination users): 1301 pass, 0 fail, 8 cancelled — all in `set-token-agent-tool.unit.test.ts` under `--test-concurrency=2` ("promise still pending"); alone 26/26 → load flake.

## inject-5b — matched runs (Jini base 4902a6a1 + Tovu base f7185f153 vs Jini 1046a1ad + Tovu 6f571e3d0)
Candidates: the 28 unattributed files from the inject addendum + every file matching the named inconclusive groups (static-publish, template-render canary, app.consent-capture, wiring-identity, production-readiness-boot, byho-compat, site-phase-handler-fail-policy) + the two combine-13 base-reds = 54 files, each run alone. 12 green on branch/branch. **All 42 red files have identical pass/fail counts on base/base** → BASE-RED, none attributable to the publish cutover or these fixes. (The report did not list the 22 inconclusive names one by one; this set covers every group it named.)

| file (apps/website/src/…) | branch pass/fail | base pass/fail |
|---|---|---|
| assistant/__tests__/automatic-agent-plugins.integration.test.ts | 41/2 | 41/2 |
| assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts | 3/1 | 3/1 |
| cli/__tests__/integration/serve-command.integration.test.ts | 8/9 | 8/9 |
| features/deployments/static-publish/__tests__/adapter.plugin-targets.unit.test.ts | 10/6 | 10/6 |
| features/deployments/static-publish/__tests__/adapter.unit.test.ts | 19/13 | 19/13 |
| features/deployments/static-publish/__tests__/deploy-public-url.integration.test.ts | 3/4 | 3/4 |
| features/deployments/static-publish/__tests__/observability.unit.test.ts | 1/1 | 1/1 |
| features/deployments/static-publish/__tests__/publish-run.unit.test.ts | 6/12 | 6/12 |
| features/form-destinations/__tests__/byho-compat.unit.test.ts | 0/2 | 0/2 |
| features/site-export/__tests__/media-original-urls.test.ts | 6/2 | 6/2 |
| features/site-export/__tests__/site-exporter.test.ts | 29/17 | 29/17 |
| features/site-inspection/__tests__/L131-characterization.unit.test.ts | 7/2 | 7/2 |
| features/site-inspection/__tests__/tool-registrations.unit.test.ts | 13/1 | 13/1 |
| features/theme/__tests__/static-portability-index.test.ts | 4/10 | 4/10 |
| features/theme/__tests__/template-render.canary.test.ts | 4/8 | 4/8 |
| features/web-screenshot/__tests__/playwright-page-capture.unit.test.ts | 24/1 | 24/1 |
| features/web/__tests__/tool-registrations.unit.test.ts | 13/5 | 13/5 |
| platform/db/__tests__/migration-manifest-postgres.test.ts | 0/17 | 0/17 |
| platform/db/migrations/__tests__/runner.postgres.test.ts | 0/4 | 0/4 |
| platform/db/sqlite/__tests__/share-database.integration.test.ts | 37/1 | 37/1 |
| platform/site-dir/__tests__/integration/migration-backup-exclusion.integration.test.ts | 5/1 | 5/1 |
| server/__tests__/integration/production-readiness-boot.integration.test.ts | 7/1 | 7/1 |
| server/__tests__/routes/comments-public-page.test.ts | 0/1 | 0/1 |
| server/__tests__/routes/newsletter-public-routes.test.ts | 9/1 | 9/1 |
| server/__tests__/routes/post-template-comments.test.ts | 0/1 | 0/1 |
| server/__tests__/routes/publish-site-route.test.ts | 31/3 | 31/3 |
| server/__tests__/routes/site-phase-handler-fail-policy.test.ts | 0/2 | 0/2 |
| server/inbound/assistant/__tests__/agent-daemon-server.page-navigate-error-rewrap.unit.test.ts | 4/2 | 4/2 |
| server/inbound/assistant/__tests__/byok-message-attachments.unit.test.ts | 3/2 | 3/2 |
| server/inbound/public-http/http/site/__tests__/form-render.unit.test.ts | 16/5 | 16/5 |
| server/runtime/boot/__tests__/mail-send.golden.test.ts | 0/1 | 0/1 |
| server/runtime/boot/__tests__/site-daemon-callback-wiring.unit.test.ts | 2/1 | 2/1 |
| server/runtime/composition/__tests__/app.consent-capture.test.ts | 5/3 | 5/3 |
| server/runtime/composition/__tests__/bundled-inactive-gating.integration.test.ts | 7/1 | 7/1 |
| server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts | 6/1 | 6/1 |
| server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts | 0/2 | 0/2 |
| server/runtime/composition/__tests__/plugin-host.integration.test.ts | 22/3 | 22/3 |
| server/runtime/composition/__tests__/portable-plugin-host.unit.test.ts | 4/2 | 4/2 |
| server/runtime/composition/__tests__/process-root-parity.test.ts | 6/1 | 6/1 |
| server/runtime/composition/__tests__/wiring-identity.test.ts | 5/1 | 5/1 |
| server/runtime/composition/modules/__tests__/assistant-byok.inputs-pin.test.ts | 3/1 | 3/1 |
| server/runtime/lifecycle/__tests__/assistant-daemon-demand.unit.test.ts | 7/1 | 7/1 |

## Still open (unchanged by this run; owner/lane decisions per the review)
MERGE-ORDER items (seams before inject, one metadata namespace `tool-metadata/site/*` vs `tool-metadata/*`, `FormDefinitionRepoPort`, Tracker export decision, feature-lane reconciliation) are integration work, not FIX items. Reported skips stay open: vault `activeKey()` cutover, XC-1–5, XC-6a `fs.ts`, XC-6b–d (now also the process half of XC-6a), settings route mount cutover.

## FILES MOVED
None this run. (Prior run: Jini `packages/core/src/tool-metadata/custom-credentials.ts` deleted → Tovu `apps/website/src/contracts/core/tool-metadata/custom-credentials.ts` restored.)
