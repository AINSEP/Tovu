# Plugin extraction session 3 — Revision 6

Status: **Continuation 2: A5 GREEN after guard correction; A6 beginning**. Earlier stop records are historical; the owner-approved revised stop rule is recorded below.

## Clock and source custody

UTC start: **2026-11-08 15:34:09**. Deadline: **2026-11-08 20:19:09**, 285 minutes total. The reserved shutdown window starts **19:59:09**. Final report prepared 2026-11-08 15:44:38 UTC; elapsed **0.1749 hours**. Startup, setup, original-pin build, checks, commits, pushes and reporting all count. No reset or continuation.

Fetched and resolved before tracked writes:

| Repository | Remote | Required/fetched full starting SHA | Branch |
| --- | --- | --- | --- |
| Tovu | https://github.com/AINSEP/Tovu.git | 2fe999573b453ff8e28c7327ef3fef257c6b48b1 | cloud/extract-s3 |
| Jini | https://github.com/AINSEP/Jini.git | e069b3fe0ef00839568168d85c11dfd97285f61f | cloud/extract-s3 |

Both target branches were absent locally and remotely and created at these pins. Checkout fetch refspecs covered only main; fetching the explicit s2 remote-tracking refspec resolved that setup issue. No main merge, force push, publication, helper agent, Claude launch, or later-session work.

The supplied brief remains outside tracked paths in /workspace/attachments. Scratch tools, logs, result records, hashes and process evidence are under /workspace/work/extract-s3. Neither the brief nor a plan is committed. The only tracked change is this report.

## Initial attempt: first failed gate — exact finding

Unmodified Jini `pnpm guard`, started **15:41:32.825754 UTC**, finished **15:42:02.736387 UTC**, raw exit **1**, reported **7 violations**. The brief permits raw exit 1 only for one R2 and one R10 finding. The other five are:

```text
R8-package-metadata packages/plugin-ai-trace-langfuse/package.json: package directory "plugin-ai-trace-langfuse" is missing package.json
R8-package-metadata packages/plugin-analytics-posthog/package.json: package directory "plugin-analytics-posthog" is missing package.json
R8-package-metadata packages/plugin-observability-opentelemetry/package.json: package directory "plugin-observability-opentelemetry" is missing package.json
R8-package-metadata packages/plugin-observability-sentry/package.json: package directory "plugin-observability-sentry" is missing package.json
R8-package-metadata packages/plugin-payments-stripe/package.json: package directory "plugin-payments-stripe" is missing package.json
```

Read-only diagnosis after stopping: each directory exists, has `node_modules/` and `plugins/`, has no package.json, and contains **zero tracked files** at the pin. They are checkout residue. They have been left intact; the guard was not edited, waived, or rerun into a replacement green result. The brief explicitly says "Other unexpected red/setup failure stops" and permits only the two named findings.

Allowed findings also present: R2-deep-path at packages/plugin-catalog/scripts/generate.ts; R10-chatpane-public-surface at packages/chat/src/react/features/chat-pane/components/ChatPane.tsx. R13-model-fallback-freshness was informational as expected. Hardwiring totals match: **HW1 17 / HW2 16 / HW3 135 / HW4 1 / HW8 49**, all **0 new**; HW5/6/7/9 are 0. No additional layer/isolation findings were emitted; standalone layer/isolation audits were not run after the stop. No successful complete S3 baseline or S3 last-green pair exists.

## Setup and command results

Exact task-local toolchain: **Node 24.2.0 / npm 11.3.0 / pnpm 10.33.2**. Preinstalled versions differed, so official Node and pinned pnpm were installed outside tracked source. Initial npm bootstrap and native install attempts encountered read-only home caches; scratch npm/pnpm/node-gyp/XDG/Electron cache paths and the downloaded Node headers resolved these allowed cache setup issues. No lockfile edits or install-script approvals/guard bypasses.

| Command | Result | Evidence log under scratch root |
| --- | --- | --- |
| Jini CI=true pnpm install --frozen-lockfile --store-dir /workspace/work/extract-s3/pnpm-store, scratch cache overrides | 0 | jini-install-scratch-native-cache.log |
| Jini pnpm --filter @jini-ai/core run build | 0 | jini-core-build.log |
| Jini pnpm --no-bail -r build | 0 | jini-recursive-build.log |
| Jini pnpm guard | **1, unexpected 5 R8 + allowed R2/R10** | baseline-jini-guard.log |
| Jini pnpm guard:plugins | 0 | baseline-jini-plugins.log |
| Tovu npm ci | 0 | tovu-install.log |
| Tovu npm run build --workspace @tovu/sdk | 0 | baseline-tovu-sdk.log |
| Tovu JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini, after completed Jini build | 0 | baseline-ordered-tovu-link.log |
| Tovu npm --prefix packages/contracts run build, after completed Jini build | 0 | baseline-ordered-tovu-contracts.log |
| Tovu npx tsc -p tsconfig.json --noEmit, after completed Jini build | **0** | baseline-ordered-tovu-tsc.log |

A premature Tovu tsc probe started at 15:40:58 while Jini's recursive build was still running and exited 2 with missing exports (baseline-tovu-tsc.log). This was an execution-order mistake: source and completed dist both contain the named exports. The corrected ordered baseline above passed, without any source change. The premature result is retained and is not claimed green.

Tovu AI-Dev-Shop absence is explicitly expected by the owner brief. Jini root/AI-Dev-Shop instructions and historical START-HERE/extraction-plan/capabilities were consulted; current owner corrections govern. Historical Tovu architecture sections 13/14 and project_memory are absent in this cloud checkout. Codebase Memory/Graphify tools/artifacts are unavailable; the understand-anything index is stale at 2026-07-25 / 9cb4ffc50bb25c20ac313f115b41a511336a7a61, with no relevant checker/provider-status/parser node. No index installation or substitute architecture.

Preexisting untracked packages/plugin-ui-ux-design was temporarily preserved outside package discovery during setup; all **46** non-node_modules content hashes matched and the entire directory was **restored to its original location during shutdown**. No existing user files were deleted or committed.

## Original XP3 base and immutable evidence

Separate detached worktree: `/workspace/work/extract-s3/jini-original`, HEAD **35c4961af718f0f30591c46d2ea2756c4484a731**. Frozen install, core build and recursive build all exited **0** with the exact tools. Tracked source stayed unchanged. This was setup work already running before the unexpected guard result was classified; it completed and is stopped.

F1's writer has **not** been implemented, so no compliant declaration snapshot/manifest exists and no XP3 snapshot count/hash is claimed. `check:cross-package` was not run and cannot be claimed green. The required baseline stays the original pin; no later-base substitute or gate-time regeneration occurred.

Before production edits, 117 existing Tovu golden/core/UI parity fixture/pin hashes were recorded in starting-fixture-hashes.json. All 117 were rechecked unchanged at shutdown. Tool metadata SHA256 is **a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6**, as required. No golden regeneration, fixture change, migration, saved-data change, server/layer-checker/debt bypass, dependency, or changeset.

## Initial attempt: batch status and numbered remaining work

| Batch | Inventory / implementation / gate SHA | Result |
| --- | --- | --- |
| Setup baseline | starting pins; Tovu d59e56b2dab47a4caf80a62c64d5b6cd3ba2c9fd is report-only | **FAILED**, extra R8 findings above |
| S3-0 F1–F7 | None | Not started; no regression/fix/mutation/green claim |
| A3 | None | Not started; no format pin minted |
| A4 seam | None | Not started; no edited-line allocation measurement |
| A4 move | None | Not started |
| A5 | None | Not started |
| A6 | None | Not started |
| A7 | None | Not started |
| C-a | None | Not ready for independent Claude review |

Remaining batches, in order:

1. S3-0 F1–F7, regressions, repairs, immutable original XP3 snapshot and full gate.
2. A3 inventory/first pin, seams/small moves and gate.
3. A4 seam inventory/line-time measurement, same-vault CAS proof and gate.
4. A4 move and gate.
5. A5 seam and gate.
6. A6 move/public-entry closure and gate.
7. A7 seam and accumulated gate.
8. C-a evidence handoff after all previous gates pass.

No named implementation regression suite was run; there are no new tests or pins, no allowed two-call example wiring edit, and no existing Tovu or Jini test/fixture edits. F1–F7, parser compatibility, host wording parity, why-comment restoration, aliases, changeset minors, public exports, runtime closure, same-vault/shared-map/error/card/counter proofs remain unimplemented and unverified. Source edited/moved lines: **0 / 0**. No 30-minute progress interval elapsed. The inherited S2 A2 scripted-slicing transport deviation is neither rewritten nor certified by this stopped S3 run.

## Initial attempt: push ledger, last green pair and shutdown

Both branches are `cloud/extract-s3`. Each push uses an immediately preceding pull --rebase; no conflict or force push.

- Tovu initial report-only commit **d59e56b2dab47a4caf80a62c64d5b6cd3ba2c9fd** pushed and verified with ls-remote.
- Jini **e069b3fe0ef00839568168d85c11dfd97285f61f**, unchanged source pin, pushed and verified with ls-remote. Final shutdown push repeats pull/rebase and verifies this same tip.
- Tovu final report-only SHA is given in the task response, separately from the unchanged Tovu source pin **2fe999573b453ff8e28c7327ef3fef257c6b48b1**. Final paired remote verification follows that report commit.
- **Last green pair in this S3 run: none.** The starting pair is the owner-specified S2 pair, not a newly passed S3 baseline.

All launched build/install/check sessions completed. Every recorded command PID and build/install shell PID was checked absent in /proc at shutdown; no test/build process remains running. Scratch results.jsonl/processes.jsonl, exits.log, shutdown-processes.json, directory evidence and raw logs retain exact commands, UTC times and exits. Working trees have no tracked production/test/lockfile changes; Tovu contains only the new report and Jini retains its preexisting untracked residue. No later work or independent verdict is claimed.

## Continuation

Owner approved continuation on 2026-11-08 after the early baseline stop. Original UTC start/deadline/reserve remain 15:34:09 / 20:19:09 / 19:59:09; no reset. At 15:50:59 UTC, rechecked that git tracks zero files under each of the five named R8 directories, then deleted only those five directories as explicitly authorized. Guard source and expectations unchanged. Additional comparable untracked checkout residue may be removed under the same owner instruction only after checking zero tracked files. Ordered baseline rerun and S3-0 pending.

Continuation baseline found the same R8 condition at packages/plugin-ui-ux-design. Rechecked zero tracked files and no manifest, then deleted that additional residue under the explicit continuation rule. The prior 46 hashes remain recorded from the stopped attempt. No tracked file or guard edit.

### S3-0 inventory before fixes

Fresh full tracked caller searches saved outside source: jini-caller-inventory.txt and tovu-caller-inventory.txt. Exact factory callers match the advance allow-list: Tovu provider-status-tool.ts:5 and credential-save-tool.ts:12; neutral-host provider-status.test.ts:15/29. Existing nine descriptor parser calls and contribution-contracts.test.ts:165 already inject the parser; no edits required there. New tests only, except the exact two permitted required-input objects.

F1: scripts/check-no-cross-package.ts sourcePackages/outputFiles/CLI retain ownership; new writer uses the original clean scratch checkout and actual build tsconfig mapping. F6 extends the same specifier visitor and PackageManifest type. F2: provider-status factory/row/schema/refusal/catalog and credential-save factory/extra-key/OAuth/catalog gain host inputs; Tovu binds exact prior strings. F3: raw-only parser compatibility stays package-local; real platform parser remains injected by Tovu; new compatibility tests compare both. F4: MailAdapterRegistry list/refusals comments -> same members; credential-card typecheck @file -> Jini ui credential-card.ts production header; positional parser doc -> same Tovu shim; provider-status @file -> file scope. F5: named unused Tovu imports only; actual checker collection; UI optionalPeers strings only; Tovu find/load bind direct exports while Jini factory aliases remain compatible. F7: new Tovu host-only exact provider-field parity typecheck, no new production/core neighbor import.

New regression inventory: scripts/__tests__/extract-s3-checker.test.ts (F1 CLI roundtrip/provenance/dirty/missing emit/unsafe/overwrite and F6 syntax/dependency cases); new second-host tool regression; new legacy parser regression with real setup-parser parity; focused source/doc/manifest regression; contracts/core/__tests__/provider-setting-field.typecheck.ts. Tests are named before their production fixes, demonstrate red, then restored green; no existing test edits beyond the two calls.

### Continuation baseline and F1 development evidence

Ordered full build completed before baseline checks. After authorized untracked residue deletion, guard raw exit 1 has exactly R2(1)/R10(1), informational R13; HW1 17/HW2 16/HW3 135/HW4 1/HW8 49, all 0 new. guard:plugins, SDK build, local relink, contracts build, and Tovu main tsc all passed. The unedited connect-tool.api-connections.unit.test.ts baseline is **12/12 passing**, no failure set to grandfather. No tracked baseline repair.

F1 new CLI regressions demonstrated the absent writer (9 failed/1 passed). A test harness import.meta.resolve incompatibility with Vite was corrected first, then the behavioral red was recorded separately. Repaired writer + original unchanged checker suite: 51/51 green. The real original-pin snapshot attempt exposed noEmit configurations; a new regression failed before the mapping fix. Respecting noEmit (without inventing declaration outputs) gives 52/52 green; script tsc passed. Source package/config parsing is cached per inventory object; outputFiles remains the common mapping.

Original checkout frozen install/core/recursive build passed with Node 24.2.0/npm 11.3.0/pnpm 10.33.2 and clean tracked source. Verified installed tsx export resolves to /workspace/Jini/node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/loader.mjs. From that checkout, invoked the repaired S3 checker by absolute path with --base 35c4961af718f0f30591c46d2ea2756c4484a731 --write-baseline /workspace/work/extract-s3/declaration-baseline. No repaired code copied into the old tree.

Snapshot: base **35c4961af718f0f30591c46d2ea2756c4484a731**, **3308** production-source mappings, **3320** emitted declaration files. Manifest SHA256 **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**; snapshot SHA256 **f1b750bc75cfa1fbed7d5b3ee4c046f889a43bc8dd69e224203761ba39d04769**. Snapshot files/directories made read-only; per-file hashes retained outside source. env.sh exports the absolute JINI_DECLARATION_BASELINE_DIR for all later gates. No regeneration. Full fixed XP1–XP5 checker at this S3 point passed against this original immutable snapshot.

### F2–F7 implementation and development verification

F2: new host-tool-inputs.unit.test.ts failed all 5 cases before the fix; all 5 now pass (second-host descriptions/schema/refusals/catalog paths/custom card tool, credential id and OAuth refusal; authorization precedes loading). Tovu binds the exact old description including permission suffix/punctuation and exact catalog paths; no defaults/secret routing/auth/card changes. Only the two allowed neutral-host required-argument objects changed; existing description, ids, imports, assertions, input, fixtures, optional args and flow remain identical.

F3: legacy parser regressions failed 20/21 before fix; 25/25 pass with the unchanged existing parser suite. Raw-only v1/v2, declared setup/default fields, actual checked-in Resend shape, invalid setup/secret defaults/duplicate fields/unknown keys and injected arguments/output are covered. Package-local fallback preserves the whole platform pure setup parser at e069b3fe0, changing only its type import to core and adding provenance; platform stays the canonical injected parser, with parity verified by tests. This compatibility boundary avoids a neighbor import or runtime code in core. Missing A2 changeset now lists both platform and agent-plugins minor releases and every named A2 seam, explaining injection and raw-only compatibility.

F4: all three comment groups and provider @file scope had focused red source regressions first. Exact list/refusal why-comments now sit at registry members; exact 8-line card rationale copied from the unchanged Tovu typecheck header to Jini ui production credential-card.ts; exact positional parser rationale restored in Tovu; complete provider-status privacy @file block relocated verbatim to file scope. Source-to-destination map is this paragraph: no rationale rewritten/dropped; existing credential-card @agent-note remains. F3 parser comments preserved verbatim through the whole-file compatibility copy; other touched modules retain rationale in place.

F5: source/manifest regressions red then green. Removed the six named unused import bindings only. Restored exactly 18 optionalPeers em-dash spellings, no other manifest rewrite. Collapsed identical checker import branches; deleting the real collector statement made the existing type-only import regression red (1 failed), byte-exact restore returned all 52 checker tests green. Tovu now binds direct exported find/load helpers; public Jini factory aliases remain for compatibility, with no caller break.

F6: 11/12 new cases failed before fix. Visitor now collects type-reference directives and string-literal ambient module names in source/emits; XP5 includes optionalDependencies. Tests cover new/renamed full inspection, original-base modified comparisons, declaration-only new vs unchanged edges, domain core/self controls and core prohibition, optional dependency new/old/core controls. Existing missing-output/provenance cases remain green. Full checker/source regression suite: 70/70 green. Relative-path crossings remain a stated limitation; existing build/rootDir rules retained, no broad checker rewrite or claim of new relative-path coverage.

F7: new host-only parity typecheck passed, then an optional driftMutation field was added to the real projection source and the package rebuilt. Explicit pin compile failed (exit 2, exact keys/properties), then byte-exact source restore + rebuild + explicit compile passed. Two-way assignability, exact keys and properties are asserted. No production neighbor/core vocabulary change.

Progress at 16:04 UTC (~0.50h elapsed from original start): S3-0 development in progress; no A3 started, ~4.25h left. Formal S3-0 gate follows; partial test filters were only development red/mutation demonstrations, all formal runs are unfiltered.

### S3-0 recording commits and pin hashes

Implementation: Jini **c393010ae9cc0e003228c3c15249f59c24ff20c2**; Tovu **ce6dc422d3ee95c607b9284de42fb815cc65b8fb**, pushed on cloud/extract-s3 after immediate pull/rebase. Earlier continuation report **46721900a** and baseline evidence report **5bdc4254e** are report-only. F1 commits **1c0e674e7** and **23c0c69f6** are checker implementation. Full pushed SHAs are retained by git and the final ledger.

| New pin/regression | Recording full commit | SHA256 |
| --- | --- | --- |
| Jini/scripts/__tests__/extract-s3-checker.test.ts | c393010ae9cc0e003228c3c15249f59c24ff20c2 | 38604679a697fba4b881c831f243469f71d0b48594d02dab083cc5771c4790b9 |
| Jini/scripts/__tests__/extract-s3-source-contracts.test.ts | c393010ae9cc0e003228c3c15249f59c24ff20c2 | ddc40cdb741c29c4d39cfbee8e0f8e88aec7d7b9cc340078fcf0782dee43be48 |
| Jini/packages/agent-plugins/src/connect/__tests__/host-tool-inputs.unit.test.ts | c393010ae9cc0e003228c3c15249f59c24ff20c2 | 3ac77d39dff0620104dfa8c8ae2bbb77deb63df765eb6f364176c25588e45d5b |
| Jini/packages/agent-plugins/src/lifecycle/mail/__tests__/legacy-adapter-descriptors.unit.test.ts | c393010ae9cc0e003228c3c15249f59c24ff20c2 | 07ceb1fe0b04f99c62d81f43be654f31f6fd64b0552b30e9470763abc4a09100 |
| Tovu/apps/website/src/contracts/core/__tests__/extract-s3-host-source.unit.test.ts | ce6dc422d3ee95c607b9284de42fb815cc65b8fb | 7cb62f733a97ea036b9a250da2629e53b2f2eedfd3c6253b4c42798eb482c388 |
| Tovu/apps/website/src/contracts/core/__tests__/provider-setting-field.typecheck.ts | ce6dc422d3ee95c607b9284de42fb815cc65b8fb | 7a57ea1126178279361bef826ad1ea4f9383b7c1f4adba683df370c898e59795 |

Exact permitted existing-test diff (only two required-input objects; no assertions or flow changed):

```diff
diff --git a/examples/neutral-host/src/provider-status.test.ts b/examples/neutral-host/src/provider-status.test.ts
index c2b20911c..c2fd4d286 100644
--- a/examples/neutral-host/src/provider-status.test.ts
+++ b/examples/neutral-host/src/provider-status.test.ts
@@ -12,7 +12,7 @@ it('provider status: reports configured providers with no product names, shows t
   const exchanges = createSurfaceExchangeStore({ clock: createSystemClock(), scheduler: createTimeoutScheduler({}), idGenerator: { newId: () => 'settings-1' }, defaultChannel: 'mcp-ui' });
   const settingsCard = { tool: 'credential_save' as const, input: { kind: 'provider-settings' as const, target: 'metrics' } };
   const fields = [{ name: 'apiKey', label: 'API key', secret: true, required: true }];
-  const status = createProviderStatusTools({ metadata: {}, authorization: { permission: 'studio.providers.read' } });
+  const status = createProviderStatusTools({ metadata: {}, authorization: { permission: 'studio.providers.read' }, catalogModule: 'studio/providers.ts', messages: { description: 'Read provider presence in the studio.', pluginIdDescription: 'Studio provider id from studio_plugins.', unknownPlugin: ({ pluginId }) => `Unknown studio provider ${String(pluginId)}; call studio_plugins.`, unexpectedInput: 'Studio provider status accepts only pluginId.' } });
   const rows = (): ProviderStatusRow[] => [{ pluginId: 'metrics', fields, settingsCard,
     enabled: true, configured: memory.has('metrics'), missing: memory.has('metrics') ? [] : ['API key'],
     store: 'site', appliesAt: 'now', usedByThisSite: true, usedBy: ['studio'] }];
@@ -26,7 +26,7 @@ it('provider status: reports configured providers with no product names, shows t
   expect(status.providerStatusAgentToolCatalog[0]?.authorization.permission).toBe('studio.providers.read');
 
   const unused = async (): Promise<never> => { throw new Error('Unexpected credential domain'); };
-  const tools = createCredentialSaveTools({ metadata: {}, toolId: 'credential_save', categories: ['general'], messages: { description: 'Save a provider credential in the studio human card.' } });
+  const tools = createCredentialSaveTools({ metadata: {}, toolId: 'credential_save', categories: ['general'], messages: { description: 'Save a provider credential in the studio human card.', oauthRefusal: 'Use studio_connect for browser sign-in.' }, catalogModule: 'studio/secrets.ts' });
   const save = tools.buildCredentialSaveRegistrations({ adapters: {
     apiCreate: unused, apiRotate: unused, mediaProvider: unused, sourceControl: unused,
     publishHost: unused, agentPluginToken: unused, pluginProvider: unused,
```

The formal gate is running the 21 named commands in gate-s3-0-jobs.json, including 17 explicit Tovu files and 8 Jini runtime/host files plus the three checker/source suites. Builds precede relink and host checks; no skipped cases in formal runs. No A3 work has started.

### Continuation S3-0 formal gate — STOP

Shutdown report time **2026-11-08 16:16:36 UTC**, elapsed **0.7076 hours** from the unchanged original start. The original deadline remains **20:19:09 UTC**; shutdown is early because a gate failed, not because time expired. No A3 inventory, pin, seam or move was started.

The full functional gate passed **312 tests with zero failed/skipped/todo**: checker/source suites 70, agent-plugins 30, platform 3, UI 2, neutral-host 30, Tovu 177. Builds/tsc of agent-plugins/platform/ui, scripts tsc, local relink, Tovu tsc and the explicit new field-parity compile passed. Goldens, saved-key round trip, cost counters and wiring identity are included in the unchanged Tovu files. No new pin/fixture hash changed after its recording commit.

The strict changed-source lint extension failed (exit **1**):

```text
scripts/check-no-cross-package.ts:46:3
  Function 'visit' has a complexity of 11. Maximum allowed is 10.
scripts/lib/package-sources.ts:25:12
  Cognitive Complexity 11 exceeds 10.
```

The first issue is introduced by F6's two new syntaxes and is the decisive S3-0 failure. The second is in the existing sourcePackages visitor, whose implementation is unchanged (only PackageManifest.optionalDependencies was added in this session). Two existing unused-rest-binding warnings also appeared in credential-save-tool.ts (_kind/_target). No lint disable, increased threshold, test edit, checker relaxation, or post-gate production fix was applied. F6 functionality is implemented but the batch is **not green** and cannot authorize A3. Required next work is a reviewed complexity repair, then a complete S3-0 gate; this run stops here under the brief.

The standalone layer/isolation invocation initially failed before executing checks because Node ESM could not expose the named exports of the root's CommonJS-transformed TypeScript. The invocation was corrected to the installed tsx CLI, with no source/guard edit. Actual results are **layers 0 / isolation 0 failing**, audit **SI-c 9 / SI-d 7**. This invocation error and its corrected result are both retained in separate logs; it is not presented as a passing first invocation. The final hash/test/lock custody check also passed.

Guard: raw exit **1**, exactly R2-deep-path(1) and R10-chatpane-public-surface(1), informational R13, HW1 17/HW2 16/HW3 135/HW4 1/HW8 49, **0 new**. External scratch verification accepted only those exact names/counts; no waiver or guard edit. Plugin guard passed. The unchanged original XP3 snapshot remains SHA256 **f1b750bc75cfa1fbed7d5b3ee4c046f889a43bc8dd69e224203761ba39d04769** and manifest **d836eba0b0e29efb9fe2e79f8a1c2f61655190008d70e74c0c86ae518728d459**.

#### Explicit formal command/result ledger

All Vitest runs use --maxWorkers=2 --minWorkers=1; Node tests use --test-concurrency=1 and the supplied composition environment. No broad test run or hidden exclusion.

| Command | Exit/result |
| --- | --- |
| `pnpm --filter @jini-ai/agent-plugins run build` | 0; gate-s3-0-agent-plugins-build |
| `pnpm --filter @jini-ai/platform run build` | 0; gate-s3-0-platform-build |
| `pnpm --filter @jini-ai/ui run build` | 0; gate-s3-0-ui-build |
| `pnpm --filter @jini-ai/agent-plugins exec tsc --noEmit` | 0; gate-s3-0-agent-plugins-tsc |
| `pnpm --filter @jini-ai/platform exec tsc --noEmit` | 0; gate-s3-0-platform-tsc |
| `pnpm --filter @jini-ai/ui exec tsc --noEmit` | 0; gate-s3-0-ui-tsc |
| `pnpm exec tsc -p scripts/tsconfig.json --noEmit` | 0; gate-s3-0-scripts-tsc |
| `pnpm exec vitest run scripts/__tests__/check-no-cross-package.test.ts scripts/__tests__/extract-s3-checker.test.ts scripts/__tests__/extract-s3-source-contracts.test.ts --maxWorkers=2 --minWorkers=1 --reporter=verbose` | 0; gate-s3-0-checker-tests |
| `pnpm --filter @jini-ai/agent-plugins exec vitest run src/lifecycle/mail/__tests__/adapter-descriptors.test.ts src/lifecycle/mail/__tests__/legacy-adapter-descriptors.unit.test.ts src/connect/__tests__/host-tool-inputs.unit.test.ts --maxWorkers=2 --minWorkers=1 --reporter=verbose` | 0; gate-s3-0-agent-plugins-tests |
| `pnpm --filter @jini-ai/platform exec vitest run src/mail/__tests__/provider-setup.test.ts --maxWorkers=2 --minWorkers=1 --reporter=verbose` | 0; gate-s3-0-platform-tests |
| `pnpm --filter @jini-ai/ui exec vitest run src/features/mcp-ui/__tests__/credential-card.unit.test.ts --maxWorkers=2 --minWorkers=1 --reporter=verbose` | 0; gate-s3-0-ui-tests |
| `pnpm --filter @jini-example/neutral-host exec vitest run src/provider-status.test.ts src/contribution-contracts.test.ts src/mail-host.test.ts --maxWorkers=2 --minWorkers=1 --reporter=verbose` | 0; gate-s3-0-neutral-host-tests |
| `JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini` | 0; gate-s3-0-tovu-link |
| `npx tsc -p tsconfig.json --noEmit` | 0; gate-s3-0-tovu-tsc |
| `npx tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --strict --esModuleInterop --skipLibCheck --types node apps/website/src/contracts/core/__tests__/provider-setting-field.typecheck.ts` | 0; gate-s3-0-provider-field-pin |
| `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/mail-adapter-registry.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-contribution.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/mail-provider-setup.unit.test.ts apps/website/src/features/agent-plugins/__tests__/unit/bundled-mail-credential-cards.unit.test.ts apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts apps/website/src/assistant/__tests__/moved-tools.golden.test.ts apps/website/src/assistant/__tests__/moved-tools.access-token.golden.test.ts apps/website/src/assistant/__tests__/moved-tools.credential-cards.golden.test.ts apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts apps/website/src/server/runtime/boot/__tests__/mail-send.golden.test.ts apps/website/src/server/runtime/boot/__tests__/mail-engine-parity.unit.test.ts apps/website/src/server/runtime/composition/__tests__/cost-counters.baseline.test.ts apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts apps/website/src/contracts/core/__tests__/extract-s3-host-source.unit.test.ts` | 0; gate-s3-0-tovu-tests |
| `pnpm check:cross-package` | 0; gate-s3-0-cross-package |
| `pnpm guard; s3_exit=$?; python3 /workspace/work/extract-s3/verify-guard.py /workspace/work/extract-s3/gate-s3-0-guard.log "$s3_exit"` | 0; gate-s3-0-guard |
| `pnpm guard:plugins` | 0; gate-s3-0-plugins |
| `node --import tsx --input-type=module -e 'import {checkPackageLayers} from "./scripts/check-package-layers.ts"; import {checkSubpathIsolation,auditSubpathIsolation} from "./scripts/check-subpath-isolation.ts"; const layers=checkPackageLayers(), isolation=checkSubpathIsolation(),audit=auditSubpathIsolation();const c=audit.findings.filter(x=>x.kind==="c").length,d=audit.findings.filter(x=>x.kind==="d").length;console.log(JSON.stringify({layers,isolation,SI_c:c,SI_d:d}));if(layers.length\|\|isolation.length\|\|c!==9\|\|d!==7)process.exitCode=1;' ` | 1; gate-s3-0-layers-isolation |
| pnpm exec tsx -e (checkPackageLayers/checkSubpathIsolation/auditSubpathIsolation, corrected module invocation) | 0; layers [], isolation [], SI-c 9, SI-d 7 |
| python3 /workspace/work/extract-s3/verify-custody.py | 0; snapshot, 117 existing hashes, 6 new regression/pin hashes, frozen tests/locks |
| pnpm exec eslint --no-inline-config --rule complexity:[error,10] --rule sonarjs/cognitive-complexity:[error,10] (8 named changed production files) | **1; STOP**, visitor complexity 11 plus unchanged sourcePackages cognitive complexity 11 |

#### Current batch status, remaining work and last green pair

| Batch | Inventory/implementation/gate evidence | Status |
| --- | --- | --- |
| Continuation baseline | Starting source pins; Tovu report tip 46721900a830809fa9006323a6ece1ac12ab5736 | GREEN after authorized residue deletion |
| S3-0 | Inventory in report before fixes; Jini 1c0e674e7009ebd90b0889c68b5ac24b24ec27f4 / 23c0c69f61bff319f0ebaf6a79cd0e058e9a77ea / c393010ae9cc0e003228c3c15249f59c24ff20c2; Tovu ce6dc422d3ee95c607b9284de42fb815cc65b8fb | **FAILED complexity gate**, 312 functional tests passed |
| A3 | None | NOT STARTED |
| A4 seam | None | NOT STARTED; no seam allocation/measurement |
| A4 move | None | NOT STARTED |
| A5 | None | NOT STARTED |
| A6 | None | NOT STARTED |
| A7 | None | NOT STARTED |
| C-a | No ready-for-Claude-review section or independent verdict | NOT READY |

Remaining in order:

1. Resolve the S3-0 complexity gate and rerun the complete gate; all seven review fixes must be green.
2. A3 first format pin/inventory, seams/small moves and gate.
3. A4 seam, <=600 truly edited lines and time measurement, same-vault CAS proof and gate.
4. A4 move and gate.
5. A5 seam and gate.
6. A6 move/public entries and gate.
7. A7 seam and accumulated gate.
8. C-a independent-review evidence handoff only after all preceding gates pass.

**Last green code pair in this continuation is the clean baseline only:** Tovu **2fe999573b453ff8e28c7327ef3fef257c6b48b1**, Jini **e069b3fe0ef00839568168d85c11dfd97285f61f**. Tovu's contemporaneous report-only tip was **46721900a830809fa9006323a6ece1ac12ab5736**. No S3-0 green implementation pair is claimed.

Tracked production line counts against the original S3 starting pins: Tovu **+19/-10**, Jini **+281/-41** (including checker/scripts and compatibility parser). No extraction file moves occurred. New tests/docs/manifest formatting are counted separately in git; no A4 measurement is implied.

#### Continuation pushed SHAs and shutdown

All branches remain cloud/extract-s3; every push was preceded immediately by pull --rebase and verified with ls-remote. No conflict/fallback/force/main merge/publication.

Jini pushed implementation SHAs:

- 1c0e674e7009ebd90b0889c68b5ac24b24ec27f4
- 23c0c69f61bff319f0ebaf6a79cd0e058e9a77ea
- c393010ae9cc0e003228c3c15249f59c24ff20c2 (**current source tip, failed quality gate**)

Tovu pushed SHAs in this continuation:

- 46721900a830809fa9006323a6ece1ac12ab5736 (continuation report only)
- 5bdc4254eed6293d539bcbf467834893b4ca41f5 (baseline/XP3 report only)
- ce6dc422d3ee95c607b9284de42fb815cc65b8fb (**current production source tip**)
- 9611275ffe8b4efdf75f15c01e82cfefbb813349 (development evidence report only)

The final stopped-report commit follows these source SHAs and is identified separately by the task response after the paired shutdown pushes/ls-remote verification. Earlier initial-attempt Tovu report commits remain d59e56b2dab47a4caf80a62c64d5b6cd3ba2c9fd and 50e65e1caa8a24ce67b7f35bab63ef8332bcc30a; Jini's initial target-branch push was the unchanged e069b3fe0ef00839568168d85c11dfd97285f61f.

All 43 recorded command PIDs are absent at shutdown; targeted process inspection found no task Node/npm/pnpm/test/build process active. All manual test/build sessions completed. Custody rechecked: no existing Tovu test/fixture M/D/R; Jini only the exact two permitted call-object changes; all 117 old fixture hashes and all 6 new test/pin hashes unchanged; original declaration snapshot unchanged; lockfiles unchanged. The six authorized untracked residue directories were deleted only after confirming zero tracked files under each. No other files removed. No helper agents, time reset, historical S2 certification, or later extraction work.

## Continuation 2

Owner approved Continuation 2 and changed the session stop rule: batch-local code/lint/type/new-test failures are repaired and the gate rerun; stop for prior Tovu behavior/test drift, an unworkable design, the owner import rule, or the original cap. Original start/deadline/reserve remain 15:34:09 / 20:19:09 / 19:59:09 UTC. Resumed 16:22:24 UTC; no clock reset, helpers or new branch.

The specifier visitor is split by extracting only import-type-node collection, preserving every test and syntax. The existing sourcePackages cognitive-complexity failure is addressed with a small manifest-reading helper; traversal, filtering, source ownership, comments and I/O remain unchanged. Full strict changed-source lint and the S3-0 gate are rerun before A3.

### Continuation 2: S3-0 GREEN

The smallest specifier split (import-type collection helper) and manifest-reading helper passed strict complexity (0 errors, only two pre-existing unused-rest warnings). The complete 21-command S3-0 gate was rerun: **312/312 tests**, no skipped/failed/todo; all three package builds/tsc, scripts tsc, Tovu tsc, explicit parity pin, immutable-original-base checker, exact guard record/plugins, layers 0/isolation 0 with SI-c 9/SI-d 7, and all hash/test/lock custody checks passed. No tests/pins/snapshot were changed. Gate completed 16:26:04 UTC. Last green source pair: Jini **9a6a65e6ce12624c94a04a0827ad20d6cef305b2** and Tovu **ce6dc422d3ee95c607b9284de42fb815cc65b8fb** (report-only Tovu tip 4f147255166fb097ea3165ef2e37edddd97684fa). Paired pushes verified before A3.

### A3 first pin and complete seam/move inventory

First A3 commit includes only the new real-store format pin and this pre-edit inventory. New pin checks the literal format, exact vault scope including the kind from vault-stores, one real row's exact id/label/format and its reader. Initial green; mutate the production format -> red, byte-exact restore -> green. No saved-byte source change or fixture regeneration.

Top-level declarations and named helpers at the pre-A3 source, with resolved destinations:

| Pre-edit source:symbol | Resolved A3 destination/custody |
| --- | --- |
| T features/api-connections/host.ts:47 ApiConnectionRuntime | integrations/api-connections host-ports type; Tovu re-export |
| T features/api-connections/host.ts:54 API_CONNECTION_CALLBACK_ORIGINS_ENV | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:56 ApiConnectionHostDeps | Tovu host-bindings.ts: original caller contract and comments; host runtime consumes local/core Jini ports |
| T features/api-connections/host.ts:77 notAvailable | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:82 setupRefused | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:87 configured | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:92 isUnreadableTokenRecord | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:98 wrapsUnreadableTokenRecord | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:102 clientChanged | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:107 clientKindFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:111 ResolvedClient | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:114 byoOAuthClient | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:125 resolveClient | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:136 configuredOrigins | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:141 notConfigured | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:146 connectionStatus | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:155 createApiConnectionHost | Same Tovu host.ts: old-signature wrapper binds ports; original body becomes runtime factory in place |
| T features/api-connections/host.ts:181 listConnections | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:192 clientFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:198 tokensFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:204 markReconnectRequired | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:215 tokensForAnotherClient | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:228 readHonestRecord | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:235 apiOriginsFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:245 hostedCallbackUrl | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:260 byoCallbackUrl | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:266 hooksFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:271 serviceFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:287 declaredFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:299 accessTokensFor | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:341 requestedScopes | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:346 statusOf | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:367 prepareSignIn | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/host.ts:387 ApiConnectionHost | Same Tovu host.ts in A3; body/helper/type/value preserved, no host move in this batch |
| T features/api-connections/byo-client.ts:24 ByoClient | Jini integrations/src/api-connections/byo-client.ts; local errors/core/local contracts; same-signature Tovu shim |
| T features/api-connections/byo-client.ts:30 ByoClientCredentials | Tovu thin shim/credential adapter: repository/crypto and exact host refusal text |
| T features/api-connections/byo-client.ts:37 byoClientLabel | Jini integrations/src/api-connections/byo-client.ts; local errors/core/local contracts; same-signature Tovu shim |
| T features/api-connections/byo-client.ts:41 unusable | Tovu thin shim/credential adapter: repository/crypto and exact host refusal text |
| T features/api-connections/byo-client.ts:50 resolveByoClient | Jini integrations/src/api-connections/byo-client.ts; local errors/core/local contracts; same-signature Tovu shim |
| T features/api-connections/hook-http.ts:14 PluginHttp | Jini integrations/src/api-connections/hook-http.ts; local narrow HTTP port replaces neighbor type; thin Tovu re-export |
| T features/api-connections/hook-http.ts:16 CONNECTION_HOOK_UNDECLARED_ORIGIN_MESSAGE | Jini integrations/src/api-connections/hook-http.ts; local narrow HTTP port replaces neighbor type; thin Tovu re-export |
| T features/api-connections/hook-http.ts:24 createConnectionHookHttp | Jini integrations/src/api-connections/hook-http.ts; local narrow HTTP port replaces neighbor type; thin Tovu re-export |

Imported prerequisites and runtime values: host's randomBytes stays node in Tovu now (later same-package node host); createApiConnectionService/createSignInHandoffs/deriveApiConnectionKey/ApiConnectionError and service/record/client kinds remain Jini integrations same-package after move; OAuth client/HTTP types are core contracts, loopback implementation remains host-bound; platform vault/keyring/sealer and custom-credential repository remain in Tovu binder. Callback inbox and plugin state are still in place for A3 and are injected only in A4. Browser-binding callback constant/re-export stays Tovu; vault-stores, contribution loader and shared-api factory are bound in the host adapter, with their original function bodies untouched. Budgets receive the same host limiter factory. No second vault, state store, inbox, limiter owner, credential open or contribution load is introduced.

Port resolution: storage exposes records/peekAttempt and owner-scoped token factory over the one existing vault; declared connections use same-package descriptor/declaration/hooks types; BYO reads a narrowed credential/origins projection through an injected read port and host refusal constructor, stable saved label remains the same; app identity is {clientDisplayName:Tovu,softwareId:tovu} supplied by Tovu for both local/shared service construction. Shared consumer factory and owner-context storage are injected through local same-package ports; Tovu owns its project/site adapters. Every dependency is assigned to same package/core/host port/input; none unresolved.

New regression inventory before seam/move edits: T format pin plus Jini integrations/api-connections/__tests__/host-seams.unit.test.ts (different-host BYO read/refusal, stable label, hook origin scoping and public exports). Existing tests remain frozen. No production plugin-state/browser-binding/vault-stores/connect/routes/inbox changes in A3.

A3 format pin SHA256 at first commit: **57a312280c8e890a00683ab3ce7419bc245e9aebe82821c18a6715698f96e902**. Source transport pre-edit hashes:

- host.ts: 4118751966b1f03a784fd400e009f85d1d1994c582944baad052c518b8bd6aa4
- byo-client.ts: 270b9c002f8298d0c8afde524a3effbc09fb830721494b4e8962cbc3745f3f8a
- hook-http.ts: d732b4f281a34e82e83296fa613b76d00686f1e54cf574eddeb86ae8f08926a2

### A3 GREEN

Full A3 gate: integrations build/tsc, **57** tests over keys/service/hosted-sign-in/account-actions/vertical-slice/new host-seams, **92** admin capability/action/token-memory tests, and **84** Tovu tests over the six API files, new format pin, saved-key round trip and composition trio. All **233/233** tests passed without skipped cases. Tovu relink/main tsc, original immutable-baseline checker, exact guard/HW record, plugin guard and custody passed. Standalone audit: layers 0, isolation 0, SI-c 9/SI-d 7. Strict complexity passed. Token lookup still 1 contribution load/4 credential opens, wiring rows preserved.

Green pair: Jini **46039c5d444bf36c7d9a281c071c43d00a2f4e95**, Tovu **e06f9eddca52895670f3459e5abd54dd9799eab6**, both cloud/extract-s3 pushed/verified. The first A3 pin/inventory commit is **08d0bef97** (full hash in git ledger). No browser-binding, vault-stores, plugin-state production, connect, routes or inbox diff. Both service app identities and BYO host refusals are injected; original credential read/origins projection and limiter adapter remain Tovu.

Transport custody: each small whole file first passed through git mv to a temporary transport path inside Tovu, then filesystem transport to Jini. Initial destination bytes matched source hashes (a3-transport-initial-hashes.json) before import/port edits. Temporary index entries were removed; the final cross-repo commits show Jini additions and Tovu thin-shim modifications, not a fictitious cross-repo rename. Why-comments were transported intact, with ByoClientCredentials and its comment retained in the host adapter. No temporary transport file was committed.

Recorded A3 hashes (fixed for later tips):
- /workspace/Tovu/apps/website/src/features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts: 57a312280c8e890a00683ab3ce7419bc245e9aebe82821c18a6715698f96e902 at 08d0bef9747244a6b8f9dec1ba984cd3d0468942
- /workspace/Jini/packages/integrations/src/api-connections/__tests__/host-seams.unit.test.ts: c22bc908e911221113f93bac3f02158abdcd78598513228a380ff414ae804232 at 46039c5d444bf36c7d9a281c071c43d00a2f4e95

### A4 seam inventory and allocation — before edits

A4 seam allocated **30 minutes** from **16:39 UTC**; 1.4x review point 42 minutes, original cap unchanged. Truly edited seam lines measured against green A3 pair; limit 600. No moves in this phase. (The prior report append had a scratch f-string error after its A3 section; this completes the inventory before production edits.)

| Current source/symbol group | Resolved seam destination/custody |
| --- | --- |
| T plugin-state.ts: ADMIN_SURFACE_STATE_LIMITS/State/Value, reader, Scope/Store/Summary, max keys/unavailable/key/id patterns, rowPrefix/checkedKey/checkedValue, createAgentPluginStateStore and nested describe/read/write/delete helpers | Same file/semantics; internal persisted-state factory consumes required persistence port. Old public signature binds in Tovu. Limits/grammar/id/label/CAS stay domain-owned; no stateLimits input. |
| T plugin-state.ts: VaultError, SecretsVaultService/VaultMeta, apiConnectionVaultScope/PLUGIN_STATE_FORMAT/isConflict | VaultMeta from core/contracts/vault; original vault/error identity/scope/format in new T plugin-state-bindings.ts; no platform value import remains in state implementation. |
| New AdminSurfacePluginStatePersistence | J agent-plugins/admin-surfaces/plugin-state-persistence.ts: core vault types only, required scope/format, narrowed list/get/put/delete/isConflict({error}); required same-vault note. |
| T host.ts: all A3 helpers/runtime factory and wrapper | Same file; required opaque built pluginState plus callbackInbox/callbackPath/loopback ports. Old public wrapper binds once in T host-bindings.ts. API host never imports admin-surfaces for state. |
| T host.ts: callback environment/public-url/app/sign-in refusal text | Exact messages and setting key in T host-bindings.ts. App identity already passed for local/shared services. |
| T host.ts: sign-in attempt/inbox, OAuth client/HTTP types and loopback default | Local {code,nextAction}/inbox/loopback contracts in J integrations host-ports; OAuth types from core/contracts/oauth; constructors stay T binding. |
| T connect.ts: status/request/options/run types, asToolError, startApiConnectionSignIn/startOptionsOf, pendingDesktopSignIns/claimLoopbackSlot, desktop/hosted helpers, runApiConnectionConnect | Same file; generic port-taking functions plus old-signature T wrappers. signInLink and exact tool/shared-refusal wording in new T connect-bindings.ts. One original module WeakMap; all flow/comments preserved. |
| New composition proof | T composition/__tests__/api-connection-state-vault.identity.test.ts: actual old host factory, one real vault instance across state/API records, scope/format/id/label/CAS; no debug API or extra decrypt. |

All imports/helpers/types/values resolve to same package/core/local port/host input. Integrations receives opaque generic state, never agent-plugins types. Browser binding/vault stores/routes stay Tovu; shared storage/factory, one vault/state/inbox and callbacks retain A3 owners. Additional regression: J admin-surfaces/__tests__/plugin-state-persistence.unit.test.ts for the exported seam. Existing tests/pins unchanged.

### A4 seam GREEN and measurement

Green pushed source pair: Jini **1838089229910c0ddd711548dc425807f0ea051f**, Tovu **fdd4f5d622ee07bafcabe9d3bf6b2b2eeeddb37d**. Integrations build/tsc and **57** tests, agent-plugins build/tsc and **93** admin/persistence tests, Tovu relink/tsc and **162** tests: **312/312**, no failed/skipped/todo. This includes the unchanged 12-case API-connect baseline, all A3 pins/regressions, surface/security/slice tests, project keys, saved-key round trip, composition rows 5/6/counters and new actual same-vault CAS proof. Original-baseline checker, exact guard/HW/plugins, layers 0/isolation 0, SI-c 9/SI-d 7, strict new-contract complexity and all hash/test/lock custody checks passed.

**311 truly edited TS lines** against green A3 (including new tests): Tovu +166/-69, Jini +75/-1. No moves. Seam allocated 30 minutes from 16:39 UTC and gate completed 16:48:17 UTC: **0.155 hours (~9.3 minutes)**, below allocation and 1.4x limit; below 600 lines. The state limits/grammar/labels/format/CAS remain unchanged. One existing vault creates one state store and inbox in the Tovu binder; API host receives them and imports no admin-surfaces. Local/shared identity, exact host setting/refusal bytes, callback path and loopback are passed. Sign-in link/tool-error/shared-refusal text bound in Tovu, original module-level listener WeakMap retained.

New fixed regression hashes:
- /workspace/Tovu/apps/website/src/server/runtime/composition/__tests__/api-connection-state-vault.identity.test.ts: 63af6d71b754bb755035f8777570cc340834c783d7a28477467000169b879d80 at fdd4f5d622ee07bafcabe9d3bf6b2b2eeeddb37d
- /workspace/Jini/packages/agent-plugins/src/admin-surfaces/__tests__/plugin-state-persistence.unit.test.ts: 9b0f31ef47885a02af8e3898f03f58d2134eeb6cda39bd60944c600c6fa1ab54 at 1838089229910c0ddd711548dc425807f0ea051f

### A4 move inventory — before git transport

Full seamed source files are transported, then only host-only wrappers/re-exports are retained in Tovu and imports/public function names adapted. No folder move; existing service/ports/index/token-store files are not overwritten. First move commit will include this inventory.

| Current source:symbol | Resolved destination/custody |
| --- | --- |
| T features/api-connections/host.ts:39 ApiConnectionRuntimeDeps | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:40 ApiConnectionRuntimeOptions | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:43 notAvailable | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:48 setupRefused | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:53 configured | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:58 isUnreadableTokenRecord | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:64 wrapsUnreadableTokenRecord | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:68 clientChanged | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:73 clientKindFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:77 ResolvedClient | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:80 byoOAuthClient | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:91 resolveClient | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:102 configuredOrigins | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:107 notConfigured | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:112 connectionStatus | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:117 createApiConnectionHost | Old wrapper/concrete host alias stays Tovu; generic runtime factory/host alias is J integrations |
| T features/api-connections/host.ts:127 createApiConnectionRuntimeHost | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:147 listConnections | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:158 clientFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:164 tokensFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:170 markReconnectRequired | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:181 tokensForAnotherClient | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:194 readHonestRecord | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:201 apiOriginsFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:211 hostedCallbackUrl | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:226 byoCallbackUrl | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:232 hooksFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:237 serviceFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:253 declaredFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:265 accessTokensFor | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:307 requestedScopes | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:312 statusOf | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:333 prepareSignIn | J integrations/src/api-connections/host.ts, same body/why-comment |
| T features/api-connections/host.ts:353 ApiConnectionHost | Old wrapper/concrete host alias stays Tovu; generic runtime factory/host alias is J integrations |
| T features/api-connections/connect.ts:23 ApiConnectionConnectDeps | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:32 ApiConnectionConnectStatus | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:34 ConnectRun | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:49 asToolError | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:55 ApiConnectionSignInStart | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:73 startApiConnectionSignInWithPorts | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:92 SignInRequest | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:99 SignInOptions | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:103 startOptionsOf | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:106 pendingDesktopSignIns | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:114 claimLoopbackSlot | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:124 DesktopSignInStart | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:126 startDesktopSignIn | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:157 connectHosted | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:178 connectDesktop | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:203 runApiConnectionConnectWithPorts | J integrations/src/api-connections/connect.ts, same body/why-comment/one WeakMap |
| T features/api-connections/connect.ts:223 startApiConnectionSignIn | Old signatures remain Tovu thin wrappers binding signInLink/messages; generic WithPorts functions become public J names |
| T features/api-connections/connect.ts:226 runApiConnectionConnect | Old signatures remain Tovu thin wrappers binding signInLink/messages; generic WithPorts functions become public J names |
| T features/api-connections/plugin-state.ts:20 PLUGIN_STATE_MAX_KEYS | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:21 PLUGIN_STATE_UNAVAILABLE_MESSAGE | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:22 KEY_PATTERN | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:24 PLUGIN_ID_PATTERN | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:26 AgentPluginStateScope | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:31 AgentPluginStateStore | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:42 AgentPluginStateSummary | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:46 rowPrefix | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:48 checkedKey | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:54 checkedValue | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:70 createPersistedAgentPluginStateStore | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:78 scopedPrefix | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:84 rowId | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:90 describe | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:103 write | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:117 readerFor | J agent-plugins/src/admin-surfaces/plugin-state.ts, own-domain/core only, universal |
| T features/api-connections/plugin-state.ts:143 createAgentPluginStateStore | Old vault signature remains Tovu shim; generic persisted-state factory becomes public J createAgentPluginStateStore |

Import/value resolution: generic API host/connect use local integrations service/errors/keys/hooks/budgets/host-ports/record types, core OAuth/ToolInputError and node crypto in node host; no agent-plugins/platform/oauth package import. Callback environment/path exports and old-deps wrappers stay Tovu. Generic state uses same-package surface limits/state types, lifecycle reader types and persistence contract, plus type-only core vault metadata; vault/error/scope/format binders stay Tovu. No new dependency, package, shared isolation exemption or runtime in core. Same-parameter T shims preserve the old public types as well as function signatures. No unresolved prerequisite or second owner.

New public smoke inventory: examples/neutral-host/src/api-host-moves.test.ts imports the real public integrations/admin-surfaces entries and verifies moved factories and runtime metadata; unchanged Tovu regressions exercise their behavior through old shims. All prior pins/hashes remain fixed.

Pre-transport SHA256:
- host.ts: 947e22c35759d10818c587c2dd48bf7a0e2f906757a63c460814a27d1497fb9a
- connect.ts: 7d9893437a296c2b57c2cd756878379229f244091145a828152feb57344ed3da
- plugin-state.ts: a767b8ad102246268690551b599e7f439da01aa2e7ac232f7b19778977309f7f

### A4 move GREEN

Green pushed pair: Jini **ce9e9dcc8c8fcc36869d85e1e2688c3c7322c850**, Tovu **b14e0701b61389340f9e40d669f3f2d7b53aa61c**. Complete A4 seam gate rerun after transport: **314/314 tests** (57 integrations + 93 admin/persistence + 2 public-entry/host-copy + 162 Tovu), no failures/skips/todo; build/tsc integrations+agent-plugins, Tovu relink/tsc, checker with same original snapshot, exact guard/plugins/layers/isolation/HW and custody all passed. Public metadata stays API node / state universal, with no package-manifest change. Row-14 real-vault/CAS proof, rows 5/6, frozen maps, saved formats, roundtrip, callbacks and counters hold through old shims.

Whole-file transport used the same explicit git-mv staging + cross-repo filesystem procedure, initial bytes hashed before import/wrapper edits (a4-transport-initial-hashes.json). 726 seamed source lines transported; final Jini additions include public tests/changeset, Tovu retains old signatures and concrete public host/deps types. All original production why-comments travel with their implementation or remain beside the retained wrapper/host setting; no slicing/retyping of rationale. The J API host/connect depend only on core/local modules plus node crypto; state is universal and uses core-vault types/local state types. No new import edge to another Jini package.

Batch-local type repair: Jini exactOptionalPropertyTypes rejected explicit undefined destinations that the old Tovu contract allowed. The moved destination types now explicitly retain undefined, with no input/flow/test edits. A premature Tovu development tsc during the failed package build reported missing new exports; the correctly ordered rerun and full gate passed. Runtime behavior had no red. Inventory correction: the state unavailable message mentions this site's admin, so that exact constant stays Tovu and the generic state factory requires host messages; a new second-host test proves its refusal is host text before any storage call. No default copy in Jini.

A4 public test recording hash: c6a9fddf3d862e303cbaaaf3ddab062265a1cb5efd093fe0bebf654b62710b53 at ce9e9dcc8c8fcc36869d85e1e2688c3c7322c850. Earlier pins unchanged.

### A5 seam inventory — before edits, no runtime file moves

| Current source:symbol | Resolved seam destination/custody |
| --- | --- |
| T features/agent-plugins/executable-tools/register.ts:36 AGENT_PLUGIN_TOOLS_FILENAME | T executable host-bindings: exact filename/one existing definition and legacy host shape; generic runtime consumes typed ports |
| T features/agent-plugins/executable-tools/register.ts:37 toolContribution | T executable host-bindings: exact filename/one existing definition and legacy host shape; generic runtime consumes typed ports |
| T features/agent-plugins/executable-tools/register.ts:40 AgentPluginExecutableToolHost | T executable host-bindings: exact filename/one existing definition and legacy host shape; generic runtime consumes typed ports |
| T features/agent-plugins/executable-tools/register.ts:65 ApplyAgentPluginApproval | Same register.ts for A5, then agent-plugins/connect/executable in A6; registry/id/build ports injected, core auth/details only |
| T features/agent-plugins/executable-tools/register.ts:70 ToolOwner | Same register.ts for A5, then agent-plugins/connect/executable in A6; registry/id/build ports injected, core auth/details only |
| T features/agent-plugins/executable-tools/register.ts:73 ownersById | Same register.ts for A5, then agent-plugins/connect/executable in A6; registry/id/build ports injected, core auth/details only |
| T features/agent-plugins/executable-tools/register.ts:92 registerAgentPluginExecutableTools | Same register.ts for A5, then agent-plugins/connect/executable in A6; registry/id/build ports injected, core auth/details only |
| T features/agent-plugins/executable-tools/register.ts:109 loadTools | Generic load remains in place; exact admin source/permission/sign-in/handler block retained T behind adminSurfaces.loadActionTools |
| T features/agent-plugins/executable-tools/host-capabilities.ts:29 AgentPluginConnectionTarget | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:37 AgentPluginConnectionAccess | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:45 AgentPluginArtifactWriter | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:50 AgentPluginRateLimiter | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:55 AgentPluginStateReaderFor | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:58 AgentPluginApiOriginsFor | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:61 FrozenConnectionAccounts | Narrow executable port types, with exact why-comments, J agent-plugins/connect/executable/ports.ts; T re-exports preserve callers |
| T features/agent-plugins/executable-tools/host-capabilities.ts:68 MAX_RESPONSE_BYTES | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:69 IDLE_TIMEOUT_MS | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:71 HTTPS_ONLY_MESSAGE | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:72 UNDECLARED_ORIGIN_MESSAGE | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:73 RESPONSE_TOO_LARGE_MESSAGE | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:74 UNAPPROVED_CONNECTION_MESSAGE | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:77 createFrozenConnectionAccounts | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:94 confirmedTokenOptions | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:103 guardedPluginFetch | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:119 createGuardedPluginHttp | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:128 declaredOriginsHttp | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:137 withToolSignal | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/host-capabilities.ts:154 createAgentPluginToolCapabilities | Same host-capabilities.ts in A5; own-domain/core imports only; constants and frozen/HTTP/token behavior unchanged |
| T features/agent-plugins/executable-tools/approval.ts:21 APPROVAL_FAMILY_BY_EFFECT | Same approval.ts in A5; detail type from core; old public wrapper binds T text and new generic function takes ports |
| T features/agent-plugins/executable-tools/approval.ts:25 TOOL_WITHDRAWN_MESSAGE | Exact host strings retained T approval-bindings; generic disclosure requires messages including Account/Affects labels |
| T features/agent-plugins/executable-tools/approval.ts:26 NOT_CONNECTED_MESSAGE | Exact host strings retained T approval-bindings; generic disclosure requires messages including Account/Affects labels |
| T features/agent-plugins/executable-tools/approval.ts:29 AgentPluginDisclosureSource | Same approval.ts in A5; detail type from core; old public wrapper binds T text and new generic function takes ports |
| T features/agent-plugins/executable-tools/approval.ts:46 createAgentPluginDisclosure | Same approval.ts in A5; detail type from core; old public wrapper binds T text and new generic function takes ports |
| T features/api-connections/surface-connections.ts:26 IssuedSignIn | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:31 SurfaceConnectionsDeps | T surface-connection-bindings: legacy API host/frozen map and exact ApiConnectionError identity/text |
| T features/api-connections/surface-connections.ts:41 notAvailable | T surface-connection-bindings: legacy API host/frozen map and exact ApiConnectionError identity/text |
| T features/api-connections/surface-connections.ts:45 codeOf | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:51 SAFE_ATTEMPT_CODE | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:52 failedAttempt | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:58 StatusSource | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:59 NEVER_CONNECTED | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:62 grantedScopeSets | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:71 liveStagedAccount | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:76 statusFrom | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:89 createSurfaceConnections | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:95 resolve | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:102 forActor | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:108 viewAfterAction | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |
| T features/api-connections/surface-connections.ts:116 watchDesktopCompletion | Same surface-connections.ts in A5, then agent-plugins/admin-surfaces/connections in A6; local typed 14-member host port |

Prerequisites: contributions passes the real createRegistry/buildRegistrations/toolIdFor and existing definition; opaque generic registry preserves the actual owner without copying SDK/types/validation. Core adaptLegacyAuthorize/requireToolPermission/LegacyToolAuthorizeFn replaces CMS compatibility imports; SurfaceCardDetail replaces UI type. Host supplies existing approval adapter/read metadata/filename and text, no new confirmation owner. Admin loadActionTools retains source/refresh/auth/revalidation/sign-in decoration exactly in Tovu. connectionKey is the original deriveApiConnectionKey, injected. One issuedTokens/frozen map remains shared across tool/admin paths; old optional frozen fallback preserved.

Surface contract: J admin-surfaces/connections/ports.ts, exactly 14 members from the brief. Opaque generic Connection keeps the canonical loaded connection, with local narrow status/account/staged/attempt/receiver shapes; no integrations/API-error/imported sign-in types. Requested scopes, records, token options, start/account actions, attempts, callback inbox, shared consumer and refusal constructor all delegate to the one host. The old shared-account display suffix remains a host projection, and pinnedTokenOptions reads the same frozen map. All unknowns finalized to consumed shapes, no any, copied rules or extra reads.

New tests inventoried before edits: T executable-tools/__tests__/host-ports.unit.test.ts (second-host definition/disclosure/registry ports) and API __tests__/surface-connections.host-port.unit.test.ts (injected refusal/token pin/status shape); J source/contract assertion as needed. Existing executable/admin/security/vertical-slice/approval/host-capability/register/collision tests and full A4 regressions/pins rerun at A5 and A6. No unresolved crossing.

Progress 17:05:35 UTC: S3-0, A3, A4 seam and move green; original deadline 20:19:09 UTC unchanged.

### A5 implementation — gate running

The generic implementations remain in their Tovu files for A5. New type-only contracts in Jini describe the contribution registry/builders, core permission callbacks, approval/disclosure inputs, and the 14-member surface host. Tovu binding modules retain the exact tool filename and singleton definition, original admin permission/source/handler/sign-in block, approval copy, API error constructor, shared display suffix and frozen-token adapter. No runtime source file has moved in this batch. The contribution registry is generic and opaque rather than importing or copying the plugins SDK vocabulary. Host adapters close over the original owners; no extra store, read or map.

Batch-local development errors fixed under the coordinator's Continuation 2 rule: core exports AuthorizationPort under ToolPermissionAuthorizationPort, corrected the type import; moved admin wiring needed its existing requireToolPermission import, restored it. Both package build and Tovu main tsc then passed. Four newly inventoried tests passed (two executable host-port and two surface host-port). No existing behavior/test red. One incorrectly located pnpm filtered build printed no matching projects; it is excluded from validation and was rerun in Jini.

Formal A5 gate uses the complete A4 move matrix plus the explicit executable/admin matrix and the four new tests; all commands/results will be listed below. No existing test edits.

### Guard validation correction — 17:18 UTC

Raw guard review found a bug in my scratch result verifier: it selected R-number findings only and therefore failed to reject N1-consumer-identity comments introduced by my moves. Prior A3/A4 green statements correctly describe tests/build/checker/custody but incorrectly classified the guard; those guard claims are withdrawn. This is batch-authored code/comment and validation error, repaired under Continuation 2, with no change to the real guard and no waiver. The scratch verifier now captures all capital-letter numbered findings and still permits only exact R2/R10 plus informational R13 and the unchanged HW counts. The full A5 matrix covers all A3/A4 regressions and is being rerun after repair, with raw guard findings reviewed independently.

Only N1-rejected production lines reworded, as expressly permitted by the brief: integrations/byo-client.ts `with the Tovu-owned one` → `with the host-owned one`; integrations/host.ts `with Tovu's vault stores` → `with the host's vault stores`; executable/ports.ts `(Tovu's createRateLimiter)` → `(the host's createRateLimiter)` (backticks unchanged). Every rationale remains beside its implementation; no runtime edits. A5 first Jini push returned HTTP 503; pull/rebase/retry succeeded and remote SHA was verified.

### A5 corrected gate — GREEN, then A6 inventory before edits

Full A5 rerun: integrations build/tsc; agent-plugins build/tsc; J integrations57/admin93/public smoke2; Tovu relink/main tsc and303 tests; original-snapshot cross-package checker; raw guard exactly R2(1)/R10(1), informational R13, fixed HW totals/zero new; plugins; layers0/isolation0/SI-c9/SI-d7; original/new hash custody. All effective exits0, no skipped test. Corrected verifier covers N1 and every guard identifier. This supersedes the earlier misclassified guard claims, with full A3/A4 regression coverage at this pair.

Source pair: J df2698cf66b56bce3103491c79a3dd6273819c32 / T 1ef11e221e379b0b7ea7f7762864b8e6afcbaa6b; following T report-only ac1732c15. Both pushes verified; exact full report tip will be recorded in C-a. A5 new test hashes remain those at 1ef11e221, never re-minted.

A6 transports whole files via git mv into a temporary Tovu path and then filesystem move into Jini, verifies identical bytes before import/wrapper edits, removes the transport index entries, and recreates only thin Tovu shims. Cross-repo final commits cannot retain a Git rename edge; initial hashes and full rationale map make that limitation explicit. Host binding modules and their original filename, messages, error identity, admin source/handlers, sign-in decoration and token pins stay Tovu. Every implementation symbol below moves to its resolved local domain; legacy wrappers remain Tovu.

| Source:line symbol | Destination |
| --- | --- |
| agent-plugins/executable-tools/register.ts:28 ToolOwner | agent-plugins/src/connect/executable/register.ts |
| agent-plugins/executable-tools/register.ts:31 ownersById | agent-plugins/src/connect/executable/register.ts |
| agent-plugins/executable-tools/register.ts:50 registerAgentPluginExecutableToolsWithPorts | agent-plugins/src/connect/executable/register.ts |
| agent-plugins/executable-tools/register.ts:63 loadTools | agent-plugins/src/connect/executable/register.ts |
| agent-plugins/executable-tools/register.ts:133 registerAgentPluginExecutableTools | Tovu same-path thin wrapper; generic WithPorts implementation moves to agent-plugins/src/connect/executable/register.ts |
| agent-plugins/executable-tools/host-capabilities.ts:32 MAX_RESPONSE_BYTES | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:33 IDLE_TIMEOUT_MS | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:35 HTTPS_ONLY_MESSAGE | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:36 UNDECLARED_ORIGIN_MESSAGE | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:37 RESPONSE_TOO_LARGE_MESSAGE | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:38 UNAPPROVED_CONNECTION_MESSAGE | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:41 createFrozenConnectionAccounts | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:58 confirmedTokenOptions | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:67 guardedPluginFetch | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:83 createGuardedPluginHttp | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:92 declaredOriginsHttp | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:101 withToolSignal | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/host-capabilities.ts:118 createAgentPluginToolCapabilities | agent-plugins/src/connect/executable/host-capabilities.ts |
| agent-plugins/executable-tools/approval.ts:24 APPROVAL_FAMILY_BY_EFFECT | agent-plugins/src/connect/executable/approval.ts |
| agent-plugins/executable-tools/approval.ts:30 AgentPluginDisclosureSource | agent-plugins/src/connect/executable/approval.ts |
| agent-plugins/executable-tools/approval.ts:47 createAgentPluginDisclosureWithPorts | agent-plugins/src/connect/executable/approval.ts |
| agent-plugins/executable-tools/approval.ts:73 createAgentPluginDisclosure | Tovu same-path thin wrapper; generic WithPorts implementation moves to agent-plugins/src/connect/executable/approval.ts |
| api-connections/surface-connections.ts:23 IssuedSignIn | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:28 AdminSurfaceConnectionsDeps | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:33 codeOf | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:39 SAFE_ATTEMPT_CODE | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:40 failedAttempt | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:46 StatusSource | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:47 NEVER_CONNECTED | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:50 grantedScopeSets | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:59 liveStagedAccount | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:64 statusFrom | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:77 createAdminSurfaceConnections | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:83 resolve | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:90 forActor | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:96 viewAfterAction | agent-plugins/src/admin-surfaces/connections/connections.ts |
| api-connections/surface-connections.ts:179 createSurfaceConnections | Tovu same-path thin wrapper; generic WithPorts implementation moves to agent-plugins/src/admin-surfaces/connections/connections.ts |

Ports already declared in A5 remain local in their destination directories. New public entries: ./connect/executable and ./admin-surfaces/connections, explicit runtime/type exports and two jini.entries values. Register imports local projection/capabilities/types directly. The necessary executable isolation entry maps to existing lifecycle domain; the admin entry infers admin-surfaces. No isolation.shared or exemption added; actual closure audit decides whether any additional domain metadata is necessary. Universal admin entry uses only its own surface-capabilities/ports and global APIs, no node path. New test inventoried: examples/neutral-host/src/executable-surface-entries.test.ts, public functions/typed contracts and actual emitted runtime/declaration closure. Existing tests and both A5 new files stay frozen and rerun through the shims.

### A6 implementation — full gate running

Whole-file transport hashes (verified before edits):

- apps/website/src/features/agent-plugins/executable-tools/register.ts → packages/agent-plugins/src/connect/executable/register.ts: `c0e7b84ddf07f59bf6001722a368448bf36ca8cfd8099b98d4e5fd251e3ca433`.
- apps/website/src/features/agent-plugins/executable-tools/host-capabilities.ts → packages/agent-plugins/src/connect/executable/host-capabilities.ts: `f34a7516aa077c837cb6703db387bde60264f85d5206d19be0defd09cc92c29b`.
- apps/website/src/features/agent-plugins/executable-tools/approval.ts → packages/agent-plugins/src/connect/executable/approval.ts: `ef05951aaaadd320cfeef82b7d6e3d339579a6e1995a5ddad3593fc01acc2503`.
- apps/website/src/features/api-connections/surface-connections.ts → packages/agent-plugins/src/admin-surfaces/connections/connections.ts: `f0289c69c04bc4b7ebe7f48ed6bd4ab4348a922fa801e903572564dca44c53cb`.

Both new entries are universal: executable imports only local projection/capability runtime, core and @cfworker/json-schema; admin connections imports its own surface-capabilities only. The new emitted-closure test recursively follows actual relative JS imports, rejects node and non-core Jini dependencies, checks public declarations/metadata, frozen-map identity/custom host labels and foreign-scope error identity. Three new public tests pass in development; all existing callers pass Tovu main tsc via unchanged old signatures. Strict complexity/cognitive ceiling10 passes (only original discarded descriptor field warning).

The first raw development guard correctly rejected N1 references in the four moved file comments. Only rejected comment lines reworded; rationale retained. Exact replacements:

- connect/executable/register.ts: `@file Projects executable Agent Plugin tools (`tovu-agent-tools.json` + `.mjs` modules, admitted` → `@file Projects executable Agent Plugin tools (the host-named tools file + `.mjs` modules, admitted`.
- connect/executable/register.ts: `and Tovu's approval owner.` → `and the host's approval owner.`.
- connect/executable/register.ts: `Two Tovu-specific adjustments` → `Two host-specific adjustments`.
- connect/executable/register.ts: `Tovu's executor has no transport` → `the host's executor has no transport`.
- connect/executable/host-capabilities.ts: `@file Tovu's implementation` → `@file Host-scoped implementation`.
- connect/executable/approval.ts: `confirmed in Tovu, on the EXISTING approval` → `confirmed by the host, on the EXISTING approval`.
- admin-surfaces/connections/connections.ts: `@file Tovu's `connections` port` → `@file The host's `connections` port`.

No guard/source-neutrality/shared allowance changed. Existing connect→lifecycle mapping remains; only ./connect/executable→lifecycle added. Admin connections infers its actual admin-surfaces domain, so no arbitrary extra two lines were added to meet an estimate. Two jini.entries values/exports added; no dependency/lock change. The host tool filename stays exactly tovu-agent-tools.json in Tovu. No runtime wording changed.
