# subagent-parity-1

Status: the approved **Redesign** is implemented and locally verified. It supersedes the historical full-snapshot and system-overlay carrier design below. Children receive short loading instructions and approved plugin IDs, with an IDs-only manifest for long lists; no full guidance snapshot is replayed. Native signed-in/Windows acceptance and registry release remain unrun.

Started 2026-11-07 19:17 America/Los_Angeles (2026-11-08 03:17 UTC). Hard deadline 21:17 local (05:17 UTC). No publish, tags, deployments, secrets, sign-ins, or writes to cloud/combine/main.

## Branches and pushed commits

Both branches: `cloud/subagent-parity`, created at the exact fetched `origin/cloud/combine` heads:

- Tovu base `eb4c54a2daeb7b1a7c564a0cdd554c14af945f80`. Checkpoint report commit `ca4c75e6757fb078e3eacc27e6321bb2ef25c104` (pushed); the final report-only SHA is the branch head and is included in the final handoff message.
- Jini base `6f16c5ebddc26b1de43828dc7812cf4e0e413d54`.
- Jini item 1: `7f730e4bfd679a6198a84dcd8cfccbf0b87ffc1b` (pushed).
- Jini item 2: `3665df6865fabb4bbc313114f56fdabfc7a16f6e` (pushed).
- Jini item 3: `2106e74ab1a7d263e54b48cb9f2bffa8ac66b1a6` (pushed).

The initial push created the new remote branch. Subsequent pushes follow `git pull --rebase` (with `--autostash` once to preserve the helper's concurrent, explicit-path changes). No force push. Tovu alone uses the owner-approved `--no-verify`.

## First-dispatch scope and bootstrap blocker (resolved in follow-up)

Tovu's `AGENTS.md` requires reading `AI-Dev-Shop/AGENTS.md` and explicitly says: “If `AI-Dev-Shop/AGENTS.md` is missing or unreadable, state that explicitly and stop.” That directory is absent both in the initial checkout and the approved base (`git ls-tree eb4c54a2d AI-Dev-Shop` is empty). An asynchronous clarification asks whether the already-read sibling Jini bootstrap may be used. No answer arrived during the first dispatch. In the follow-up, the owner explicitly authorized the already-read Jini bootstrap for this Codex Cloud checkout; the blocker is resolved and all Tovu source work is completed below.

Jini's bootstrap, locked architecture, capabilities catalog, and honest-testing skill were read. The required Sidekick helper handles only the daemon hook item. Local code indexes were checked: codebase-memory and Graphify unavailable; the understand-anything graph has no matching automatic-use entries, so source was inspected directly. Dependencies and dist were already present; no all-package install/build ran; the accidental Tovu pre-push gate is documented below.

## Item 1 — complete explicit guidance reads

Implemented in Jini: removed the explicit dedup shortcut, its function, and inactive-delivery bookkeeping. Consent, exclusions, trust, activation, resolver checks, automatic delivery tracking, and usage publication remain owned by existing code. Every explicit reader receives complete content; repeated parent reads also receive complete content.

From `/workspace/Jini/packages/agent-plugins`, the exact test command for baseline and each stage was:

```sh
../../node_modules/.bin/vitest run src/lifecycle/__tests__/unit/automatic-use.unit.test.ts --maxWorkers=2 --minWorkers=1
```

- Baseline: 53/53 pass (`j-plugins-baseline-direct.log`).
- RED: updated dedup expectations and added pinned/explicit previous-delivery cases with beginning/end sentinels beyond 8 KiB plus subsequent trust refusal. 5 fail, 50 pass (`j-item1-red.log`).
- Mutation: after removing the shortcut, deliberately returned `result.promptPrefix.slice(0, -1)`. Exact-content assertions killed it: 27 fail, 28 pass (`j-item1-mutation.log`). Removed mutation.
- GREEN: 55/55 pass (`j-item1-green.log`).
- No-emit check from `/workspace/Jini`: `./node_modules/.bin/tsc -p packages/agent-plugins/tsconfig.json --noEmit`. Passed after local platform declarations were refreshed (`j-item1-typecheck-refreshed.log`).
- Tovu real-tool-executor fresh-caller regression: completed in **Tovu part** below, including the original-shortcut mutation.

## Item 2 — complete automatic primary

Implemented in Jini: the first ranked consented automatic match is delivered in full only when there is a query and no pinned plugin. Other matches retain metadata/load pointers. Only this primary bypasses the automatic 8 KiB attachment threshold; capability attachments retain their guard. The existing 256 KiB skill-file read limit is unchanged.

Same exact changed-file Vitest command as item 1:

- RED: 11 fail, 46 pass (`j-item2-red.log`).
- Mutation: selected the primary but deliberately retained its original 8 KiB guard. Both oversized auto/ask primary tests failed (5 fail total, 52 pass; `j-item2-mutation.log`). Removed mutation by exempting only `primaryId`.
- An intermediate run exposed 3 outdated expectations: two off-plugin metadata suffixes and one already-delivered capability backstop. Expectations were updated to the approved behavior; no test removed or skipped (`j-item2-green-attempt.log`).
- GREEN: 57/57 pass (`j-item2-green.log`). Includes exact complete oversized guidance, pointer for the second candidate, pinned suppression, consent/exclusions, and unchanged capability byte-boundary tests.
- No-emit check: `./node_modules/.bin/tsc -p packages/agent-plugins/tsconfig.json --noEmit` from `/workspace/Jini`: pass (`j-item2-typecheck.log`).
- Tovu retained preflight promise, rejected-promise clearing, full pinned inject mode, and their tests: completed in **Tovu part** below.

## Item 3 — Claude snapshot hook

Implemented in Jini: one Claude-local helper writes the frozen system overlay into `subagent-start.json` inside the existing run temp directory, mode 0600 with exclusive creation. It rejects snapshots above 64 KiB before writing and merges a catch-all SubagentStart command into existing settings/hooks. The command uses Node with a base64-encoded path, avoiding shell interpolation and POSIX shell quoting. No dependency added. The existing guarded `buildRunArgs` calls it only for Claude when subagents are permitted and a run temp directory exists; existing launch failure/cleanup paths remain in use.

All daemon test commands run from `/workspace/Jini/packages/daemon` (launch tests granted scoped write access to `/var/tmp` for the existing filesystem-enforcement helper):

```sh
../../node_modules/.bin/vitest run src/agent-executor/claude/__tests__/subagent-start.test.ts --maxWorkers=2 --minWorkers=1
../../node_modules/.bin/vitest run src/agent-executor/__tests__/launch-defaults-and-staging.test.ts --maxWorkers=2 --minWorkers=1
../../node_modules/.bin/vitest run src/agent-executor/claude/__tests__/subagent-start.test.ts src/agent-executor/__tests__/launch-defaults-and-staging.test.ts --maxWorkers=2 --minWorkers=1
```

- Existing launch-file baseline: 10/10 pass (`daemon-baseline.log`).
- Hook RED before implementation: helper import missing, file fails collection (`daemon-hook-red.log`); no assertion pass claimed.
- Launch RED with corrected executable/isolation fixture and original absent hook wiring: 3 fail, 11 pass. Complete launch lacked the snapshot, and oversized/staging-failure launches incorrectly spawned (`daemon-launch-valid-red.log`). Earlier runs failed before the target behavior due to existing filesystem policy/isolation fixture requirements; they are not counted as useful RED.
- Snapshot mutation: deliberately wrote changed snapshot bytes; all 4 hook tests failed (`daemon-hook-mutation-fixed-assertions.log`).
- Size mutation: used 65 KiB instead of 64; 1 fail, 3 pass (`daemon-mutation-budget.log`, hook-file command).
- Settings mutation: dropped existing settings; 2 fail, 2 pass (`daemon-mutation-settings.log`, hook-file command).
- Denial mutation: ignored subagent denial; 1 fail, 13 pass (`daemon-mutation-subagents.log`, launch-file command).
- Exclusive-write mutation: changed `wx` to `w`; 2 fail, 16 pass (`daemon-mutation-exclusive-write.log`, both-file command).
- Cleanup mutation: disabled temp directory removal; 4 fail, 10 pass (`daemon-mutation-cleanup.log`, launch-file command).
- Restored GREEN: 18/18 across the two changed daemon files (`daemon-committed-green.log`). Exact snapshot, preserved settings/hooks, source changes after capture, quoted/forward-slash/backslash path fixtures, UTF-8 boundary, staging failure, denied subagents, no spawn on errors, and normal cleanup are covered. Execution was on Linux only; native Windows/macOS execution remains for the coordinator. Windows fixtures avoid illegal nested drive names and POSIX fixture input uses forward slashes.
- No-emit check from the daemon package: `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`: pass (`daemon-committed-typecheck.log`).

Tovu overlay AsyncLocalStorage scoping, the Claude adapter capability, duplicate user-prompt omission and actual assembly tests are completed in **Tovu part**. No new CLI-ID branch was added to shared code. The signed-in product canary remains unrun.

## Errors and setup findings

- `ERR_PNPM_BAD_ENVIRONMENT`: `pnpm exec vitest ...` triggered pnpm's dependency setup using installed pnpm 11 against the repository engine requirement. Used the already-installed package-local Vitest binary instead; no manifest/lockfile changes.
- `TS2305` / `TS2459`: stale platform dist did not export existing source `readBootIdentity` / `BootIdentity`. Ran `./node_modules/.bin/tsc -p packages/platform/tsconfig.json` from Jini to refresh ignored local output. That build exited 2 on unrelated stale core HTTP declarations (`TS2561`, `TS2339`, `TS2551`, missing `bodyAs`); it emitted the needed platform declarations, and the touched agent-plugins no-emit check then passed. No platform source was modified.
- Daemon initial typecheck: stale core/agent-runtime dist declarations caused `TS18046`, `TS2305`, `TS2322`, `TS2339`, `TS2353`, `TS2367`, `TS7006`, `TS7031`. Refreshed ignored outputs with `./node_modules/.bin/tsc -p packages/core/tsconfig.json` and `./node_modules/.bin/tsc -p packages/agent-runtime/tsconfig.json` from Jini; both exited 0. Daemon no-emit then passed. No core/runtime source was changed.
- `NATIVE_TOOL_POLICY_UNSUPPORTED`: fake adapter initially lacked the existing per-run MCP isolation attestation. `FILESYSTEM_POLICY_UNSUPPORTED`: initial launch fixtures lacked the existing filesystem support override and executable discovery setup, then sandbox writes to `/var/tmp` were denied. Corrected the existing test fixture ports and granted scoped `/var/tmp` write for tests, without changing production policy.
- `AGENT_SPAWN_FAILED`: expected launch refusal on oversize and snapshot staging error. `EEXIST`: expected exclusive snapshot write refusal. `SyntaxError`: expected invalid settings JSON refusal. Plain `Error` with “64 KiB”: expected size refusal. Initial new-helper resolution failure is recorded as collection RED only.
- `AssertionError`: expected test-first and mutation failures described above; final changed plugin tests pass.
- Missing Tovu `AI-Dev-Shop/AGENTS.md`: historical blocker, resolved by the owner’s follow-up authorization to use the Jini bootstrap.
- Tovu report push initially omitted `--no-verify`, starting `apps/desktop/scripts/hooks/pre-push` → `npm run gates` → a broad desktop test invocation. This violated the intended changed-file-only restriction. It was terminated promptly with `kill -TERM -- -3758`; the push exited 130. No result from that gate is claimed. Process inspection confirmed its remaining entries were terminated zombies, not running tests. The retry `git -C Tovu push --no-verify -u origin cloud/subagent-parity` succeeded. This deviation was disclosed immediately.

Logs are local scratch files under `/workspace/work/subagent-parity/`; they are not product files.

## Measured diff

Against the requested bases, documentation excluded:

| Production file (Jini) | Added | Removed |
| --- | ---: | ---: |
| `packages/agent-plugins/src/lifecycle/automatic-use.ts` | 8 | 13 |
| `packages/daemon/src/agent-executor/launch.ts` | 6 | 0 |
| `packages/daemon/src/agent-executor/claude/subagent-start.ts` | 20 | 0 |
| **Total** | **34** | **13** |

| Test file (Jini) | Added | Removed |
| --- | ---: | ---: |
| `packages/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.unit.test.ts` | 63 | 39 |
| `packages/daemon/src/agent-executor/__tests__/launch-defaults-and-staging.test.ts` | 46 | 2 |
| `packages/daemon/src/agent-executor/claude/__tests__/subagent-start.test.ts` | 49 | 0 |
| **Total** | **158** | **41** |

First-dispatch Tovu production/test changes: +0 / -0; see **Tovu part** for current totals. Report lines are documentation, excluded from the approximate +80 / -20 production and +220 / -75 test budgets. These are partial implementation totals, not a claim that the full approved plan fit or shipped. No new Jini package-to-package imports were added; the new helper imports Node built-ins only. No inline lint disables. `git diff --check` passed for both working diffs. No test process is left running. Final changed-file count is 75 passing tests (57 agent-plugins + 18 daemon), against 63 baseline tests in the two pre-existing files (53 + 10).

## Cost per fresh child

Let S be the complete prepared snapshot's UTF-8 bytes and G its plugin-guidance bytes. Each hook delivery is one SubagentStart, one local snapshot read, S output/context bytes, approximately S/4 English input tokens. No added network call. The fixed snapshot ceiling is 65,536 bytes; oversized input must fail visibly, never truncate. The previously measured UI/UX primary plus Tovu plugin overlay is 15,709 bytes, approximately 3.9k tokens, before common rules, custom instructions, inventory, and framing. Each explicit load adds one resolver read and G bytes, roughly G/4 tokens; reading after hook delivery duplicates those tokens. No startup preload of all seven skills or references. Monetary cost depends on model/pricing and was not measured; no real child ran here. One helper agent worked on the bounded daemon item; its model billing is unavailable.

## Historical snapshot canary (superseded; use Redesign canary below)

After the Jini registry release and Tovu dependency/lockfile update, on the full integrated branch:

1. Use an already-signed-in Claude CLI locally; do not perform sign-in in this job. Create a disposable random fixture rule absent from the delegation prompt. Include distinguishable beginning/end sentinels beyond 8 KiB and a Tovu rule.
2. Exercise both pinned preflight and explicit parent loading, then automatic-primary preflight. Capture the actual Claude invocation: full snapshot through `--append-system-prompt`, Tovu explicit `--settings`, and empty settings sources. Verify the root sees complete guidance and Tovu rules exactly once.
3. Ask fresh built-in, custom, and background children to report the random rule, final sentinel, and Tovu rule without quoting those rules in the delegation prompt. Verify SubagentStart executes and `hookSpecificOutput.additionalContext` reaches each child without clipping.
4. Change fixture source guidance after preflight; a newly started child must still report the original prepared snapshot. Verify snapshot access under actual filesystem confinement and cleanup at terminal run state.
5. Repeat on a resumed parent turn and replacement attempt; retained preflight must not ask/resolve again, and children must receive the retained snapshot. Exercise paths containing spaces/quotes on Windows, macOS, and Linux; inspect the generated command and real hook execution on each OS.
6. Deny subagents and verify no hook is staged. Induce an oversized snapshot and staging failure: parent must not spawn. Record errors and actual token usage per child.

Claude hook contract: https://code.claude.com/docs/en/hooks#subagentstart . The hook adds context; it cannot prevent child creation. Any unsupported carrier remains unvalidated and must not be called parity.

## Not done

Tovu source implementation, integration tests and no-emit checks are now complete as recorded below. Registry release and dependency/lockfile update are excluded by the no-publish instruction. Product validation and signed-in Claude canary are intentionally not run. No per-child delivery map/registry, public options, dependencies, native plugin installation, reference preloading, cross-CLI bootstrap, delegation framework, or permission/tool parity work was added.

The first dispatch completed its unblocked Jini items before the two-hour cap. The authorized follow-up is recorded next.


## Tovu part

Owner follow-up explicitly authorizes the Jini bootstrap despite its expected absence from the Tovu Codex Cloud checkout. Follow-up started 2026-11-07 19:30:57 America/Los_Angeles (2026-11-08 03:30:57 UTC); hard deadline 20:30:57 local (04:30:57 UTC). Completed before the one-hour cap. No writes to cloud/combine/main; no publish, tags, deployments, secrets or sign-ins.

### Pushed commits

All remain on `cloud/subagent-parity` from the original exact bases:

- Jini `7cc21a69a7c02f727ecb89289f6f2726a280b4ff`: Claude adapter declares `pluginGuidanceViaSystemOverlay: true`; one optional boolean field on the existing runtime definition. This is the Jini branch head, following the three first-dispatch commits above.
- Tovu `8486b0ead3831def507bf527ed582b71adf05cda`: pinned preflight uses the existing structured resolver with explicit inject delivery.
- Tovu `c5eee94a5d2786f31ca392197e8f7dbbac74afa4`: turn entry stores successful preflight, rejoin shares the promise, rejection clears it; original identity checks and disposal remain in place.
- Tovu `ef22c26d23ee642f7bccd3a131491f787167fcee`: scoped prepared prefix reaches the system overlay for adapters declaring the carrier, and their separate user-prompt insertion is omitted. Other adapters retain their prompt carrier. Existing Tovu/custom rules are retained once.
- This final report is a separate explicit-path Tovu documentation commit; its SHA is in branch history and the final handoff.

Commits used explicit paths. Every subsequent push followed pull/rebase; autostash was used only to preserve concurrent parent/helper edits. `--no-verify` was used only on the authorized Tovu branch. All pushes succeeded; no force pushes.

### Exact commands and red / mutation / green

From `/workspace/Jini/packages/agent-runtime`:

```sh
../../node_modules/.bin/vitest run src/defs/__tests__/claude.test.ts --maxWorkers=2 --minWorkers=1
../../node_modules/.bin/tsc -p tsconfig.json --noEmit
```

Adapter RED: 1 failure/50 pass with the field absent (`t-adapter-red.log`). Mutation: declared the field false; same 1 failure/50 pass (`t-adapter-mutation.log`). Correct true declaration GREEN: 51/51 pass (`t-adapter-green.log`). Runtime package no-emit passed (`t-adapter-typecheck.log`). No new package import edge/dependency was added.

The Tovu test-command prefix for every command below was exactly:

```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2
```

Append the following exact arguments to that prefix:

| Run | Arguments | Result |
| --- | --- | --- |
| Initial new-behavior RED | `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts` | 14 fail / 31 pass; includes original replacement snapshot loss and outdated first-dispatch metadata/dedup expectations (`t-behavior-red.log`) |
| Rejected-promise mutation | `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts` | Cached a rejected promise instead of clearing it: 2 fail / 34 pass; both existing CAS retry and new retry regression caught it (`t-retention-mutation.log`) |
| Fresh-child original-shortcut mutation | `--test-name-pattern='fresh child' apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts` | 2 fail / 0 pass after temporarily restoring the original no-skill/no-file delivered/alreadyLoaded shortcut in ignored local Jini output; original output restored in finally (`t-fresh-child-shortcut-mutation.log`) |
| Valid overlay RED | `apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts` | 1 fail / 8 pass: Claude guidance absent from system carrier (`t-overlay-valid-red.log`) |
| Overlay duplication mutation | `apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts` | 1 fail / 8 pass: full guidance appeared twice when the original user insertion remained (`t-overlay-valid-mutation.log`) |
| Retention + overlay GREEN | `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts` | 45/45 pass (`t-retention-overlay-green.log`) |
| Pinned RED | `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts` | 1 fail / 2 pass: pointer-only HTTP prefix instead of complete >8KiB guidance (`t-pinned-behavior-red.log`) |
| Pinned mutation | same pinned-file argument | Explicit structured `deliveryMode: 'pointer'`: 1 fail / 2 pass (`t-pinned-mutation.log`) |
| Pinned GREEN | same pinned-file argument | Explicit `deliveryMode: 'inject'`: 3/3 pass (`t-pinned-green.log`) |
| Final combined GREEN | `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts` | 48/48 pass, no skips/cancellations (`t-final-green.log`) |

The fresh-child regression uses the real registered `load_agent_plugin` through a newly created real tool executor, retaining the same principal/run bridge identity. Parent delivery is parameterized pinned/explicit; the child requests only `{pluginId}`. Exact complete guidance includes beginning/end sentinels beyond 8 KiB. Existing assertions were updated for the approved complete-primary/repeatable-explicit behavior; no tests were removed or skipped. Capability-only and metadata-only fixtures use unrelated queries or an existing pinned selection to preserve their original focus.

Replacement preflight is checked after removing the skill source and changing the replacement query: the replacement receives the exact original prefix without resolution/publication or a new consent exchange. Rejected preflight retries use the same turn with a real failed consent emission. Existing pending-consent recovery cases still pass.

Actual production `onStarted` and `assistantPromptAugmenter` AST expressions are evaluated with controlled I/O via the existing harness. Claude gets full primary bytes and Tovu/custom rules once in the system overlay; Codex retains its existing prompt carrier. The AsyncLocalStorage store is empty outside launch. No new `agentId === 'claude'` branch appears in the shared launch code; adapter choice uses the declared field. The pre-existing unrelated Windows filesystem warning branch was not changed.

### Snapshot hook wiring and validation limits

The environment already had ignored Tovu node_modules symlinks to local Jini agent-plugins, agent-runtime and daemon packages. Refreshed ignored dist from the committed branch source; no dependency/lockfile edits or registry publish were needed for local validation. Tovu now passes its complete prepared plugin prefix through the existing system overlay, which is the same `systemPromptOverlay` the committed Jini Claude `buildRunArgs` snapshots into the run temp hook. The first-dispatch Jini tests verify generated hook output, preserved settings, staging/budget refusal and cleanup. Tovu tests verify actual launch assembly up to the executor boundary. No real Claude process was launched.

A registry release and Tovu version/lockfile update remain required before installed-product validation, as anticipated in the approved plan. The signed-in root/built-in/custom/background/resumed-child canary remains intentionally unrun; its exact coordinator steps are above. Native Windows/macOS execution remains unrun; generated hook commands were executed with both path styles on Linux.

### No-emit checks and setup/errors

From `/workspace/Tovu`:

```sh
node_modules/.bin/tsc -p tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p tsconfig.tests.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p /workspace/work/subagent-parity/tsconfig.tovu-changed-tests.json --noEmit
```

- Production root no-emit: pass (`t-final-production-typecheck.log`).
- Changed-test no-emit: pass (`t-changed-tests-typecheck-resolved.log`). Scratch config extends the repository test config, sets absolute files for the three changed tests, clears include/exclude and explicitly resolves the existing Tovu @types directory. It changes no repository check configuration.
- Broad test no-emit: exits 2 on ten errors in three unchanged files: eight TS18047 in `cli/__tests__/integration/import-local.integration.test.ts`, TS2353 in `features/plugin-runtime/__tests__/unit/set-enabled-confirmation-ui.unit.test.ts`, TS2741 in `server/inbound/admin-http/routes/system/site-imports.integration.test.ts`. No errors in changed test/helper files; no unrelated fix attempted (`t-test-types.log`). This compile check ran no tests.
- Startup `ERR_MODULE_NOT_FOUND` for stale/missing ignored sidecar, commerce, UI, http-kit and Tovu contracts outputs was resolved by package-local tsc output refresh. Additional baseline TypeScript errors from stale declarations disappeared after refreshing required dependency outputs. Commands used `node_modules/.bin/tsc -p packages/<package>/tsconfig.json` from Jini for agent-plugins, daemon, agent-runtime, sidecar, commerce, ui, ui-kit, db, mcp, chat, devops, cms, cookie-consent, user-management, capability-providers, http-kit, integrations and sandbox, plus contracts from Tovu. Some initial refreshes emitted while reporting stale dependent declarations; no tracked source in these setup-only packages was changed.
- Declared dependencies missing from installed user-management output: `otplib@13.6.0`, `@simplewebauthn/browser@14.0.0`, `@simplewebauthn/server@14.0.3`. Installed exactly those already-declared versions in scratch and linked ignored package node_modules. First install failed `EROFS` on the default npm cache; retry with writable scratch cache succeeded:

```sh
npm install --prefix /workspace/work/subagent-parity/existing-deps --cache /workspace/work/subagent-parity/npm-cache --no-save --package-lock=false --ignore-scripts otplib@13.6.0 @simplewebauthn/browser@14.0.0 @simplewebauthn/server@14.0.3
```

- `ERR_ASSERTION` failures above are expected behavioral RED/mutation records. An intermediate overlay attempt raised `ReferenceError: pluginPromptPrefix is not defined` because the nested launch helper is outside the preparation callback's lexical scope. Corrected by scoping the existing launch call where the prefix is available; no public argument or larger design added. Initial overlay test expected an owner native-tool grant from a non-owner fixture; corrected that fixture expectation before recording valid RED.
- Initial scratch test config could not resolve node types (`TS2688`); corrected its scratch-only typeRoots before the passing changed-test check.
- No inline lint disables, package dependencies, public options, registry, per-child state, or extra product features. The unrelated untracked Jini `packages/plugin-ui-ux-design/` residue from the starting checkout was left untouched. `git diff --check` passed against both bases.

### Whole-job measured lines

Documentation excluded; both repositories compared to their originally requested bases:

| Production file | Added | Removed |
| --- | ---: | ---: |
| Jini `packages/agent-plugins/src/lifecycle/automatic-use.ts` | 8 | 13 |
| Jini `packages/daemon/src/agent-executor/launch.ts` | 6 | 0 |
| Jini `packages/daemon/src/agent-executor/claude/subagent-start.ts` | 20 | 0 |
| Jini `packages/agent-runtime/src/types.ts` | 2 | 0 |
| Jini `packages/agent-runtime/src/defs/claude.ts` | 1 | 0 |
| Tovu `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts` | 8 | 3 |
| Tovu `apps/website/src/server/runtime/composition/modules/assistant-byok.ts` | 3 | 2 |
| Tovu `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` | 7 | 3 |
| **Production total** | **55** | **21** |

| Test/helper file | Added | Removed |
| --- | ---: | ---: |
| Jini automatic-use unit tests | 63 | 39 |
| Jini launch-defaults-and-staging tests | 46 | 2 |
| Jini subagent-start tests | 49 | 0 |
| Jini Claude adapter tests | 1 | 0 |
| Tovu automatic-agent-plugins integration tests | 74 | 26 |
| Tovu plugin-prompt-prefix unit tests | 43 | 0 |
| Tovu daemon-source test harness | 1 | 0 |
| Tovu assistant-agent-plugin-preflight integration tests | 38 | 0 |
| **Test/helper total** | **315** | **67** |

Production is below the approximate +80/-20 budget. Test additions exceed the planning estimate (+220/-75); these are the requested regressions, actual assembly fixtures and existing expectation updates, with no added production scope.

### Cost and remaining work

Per fresh child: one local Node hook, one snapshot read, S bytes of complete context, roughly S/4 English input tokens (64 KiB fixed ceiling). Every explicit loader read adds G bytes and roughly G/4 tokens, including duplicate tokens if guidance was already delivered by the hook. No all-skill/reference preload or added network request. Actual model tokens/currency were not measured because real child runs were excluded. One Sidekick helper completed the pinned injection test/fix in this follow-up; helper billing unavailable.

All approved source items are complete. Remaining: registry release/version-lockfile integration, native Windows/macOS execution and the signed-in Claude canary. No secrets, sign-ins, releases, tags or deployments were performed. No test processes remain running. Follow-up finished before the cap.

SUBAGENT-PARITY-2 DONE


## Redesign

Approved follow-up began 2026-11-07 20:00:16 America/Los_Angeles (2026-11-08 04:00:16 UTC); hard deadline 21:30:16 local (05:30:16 UTC). Work completed before the 90-minute cap on the same `cloud/subagent-parity` branches. The owner explicitly permits the Jini bootstrap for the Tovu Codex Cloud checkout. No sign-ins, releases, tags, deployments, force pushes, or writes to cloud/combine/main.

This section supersedes the snapshot/overlay architecture and canary expectations in the earlier historical sections. Redesign diff bases are the previous delivered tips: Tovu `fbc2ef25df1cf816a33fffa3f14e9696cfc03024`, Jini `7cc21a69a7c02f727ecb89289f6f2726a280b4ff`.

### Commits and behavior

- Jini `3abec54ac061c9b81be878a5aca9735c24106dfe`: short child context, IDs-only manifest, platform hook commands, generic run option and capability-based staging.
- Jini `4395cdef59a3b0cf70c3adf587d50cd40f69bd59`: repeatable full explicit loads retained; unreachable already-loaded status removed; 16,384-byte automatic primary cap; selected IDs separate from text; pointer-only preparation and valid prior-selection carryover.
- Jini `f6efd0af44e4babdedf70c5f5c316d79a77d8244`: Claude declares `subagentStartHook`, Codex declares `automaticPluginGuidance: 'pointer'`; old overlay field removed. This is the Jini branch head.
- Tovu `82d4a00968e572759468ad167e69cdbcc7b98fd0`: IDs and adapter policy through existing preflight RPC; normal plugin prompt insertion restored; forced pinned injection removed; argv-budgeted adapters receive concrete load pointers; short child instructions passed through the generic option. Parent delegation rules also require naming plugins loaded after preflight.
- The report is a separate explicit-path documentation commit; its final SHA is in the handoff and branch history.

All implementation commits were pushed per logical item and confirmed. Required pull/rebase preceded pushes; autostash preserved concurrent parent/helper edits in Jini. No `--no-verify` in Jini. Only the explicitly authorized Tovu branch used `--no-verify`.

### Item 1: repeatable complete explicit reads

Kept the original dedup removal and existing resolver, consent, exclusions, trust and activation checks. Removed the now-unreachable `already-loaded` union member and Tovu message. Every admitted explicit request still returns the whole content; no skill/file workaround is needed.

The real Tovu fresh-child regression now uses 61,309-byte content with beginning/end sentinels. Both parent delivery paths (pinned and explicit) are followed by a fresh real tool executor with the same principal/run identity and only `{pluginId}`. It returns exact complete text. Existing refusal and inactive-read cases remain covered.

### Items 2 and 5: short child pointers and adapter gate

Added `subagentStartContext?: { ids: readonly string[]; instructions: string }` to the existing run contract and both run-option plumbing declarations. `buildRunArgs` stages it only when the adapter declares `subagentStartHook`, supports subagents, the run grant permits them, the existing run temp directory exists, and context was supplied. No Claude-ID dispatch for hook staging.

Normal hook context is `Parent plugins: <JSON IDs>.` plus the loader instruction and essential Tovu rules, strictly fewer than 2,000 JS characters. Long ID lists are written as an IDs-only JSON array in the existing run temp directory; context explicitly tells the child to read it and apply the instruction to every ID. No IDs are truncated; if the short context still cannot fit, launch is refused visibly. Both files use existing exclusive-write/private-mode discipline and existing run cleanup.

No system overlay, skill body or custom instruction snapshot is staged. Existing settings and all previous hooks survive the merge. POSIX command uses `cat --` with apostrophe quoting. Windows uses explicit `shell: 'powershell'` and `Get-Content -Raw -Encoding UTF8 -LiteralPath` with doubled apostrophes. The hook requires no system Node or Electron environment propagation.

IDs are selection/admission metadata, not evidence of delivery. They are derived from catalog/controller state (pinned/current/valid prior selections), never parsed from guidance. Disabled, missing and excluded prior IDs are filtered; Off and skipped consent expose no automatic IDs. New explicit deliveries update the controller's IDs. Every child loader call still passes through existing admission checks. Newly loaded plugins after startup are handled by the required parent delegation brief, without a new session cache or child registry.

### Items 3, 4 and 6: prompt delivery and limits

Removed `assistantPluginGuidanceContext`, plugin overlay concatenation and the Claude prompt omission. Normal adapters receive plugin guidance once in the prompt, and never in the system overlay. Existing Tovu/custom rules remain in the overlay. Pinned preflight again uses `resolveAgentPluginRefs` with the existing delivery/environment policy. Successful preflight promises remain cached across attempt rejoin; rejected promises are cleared.

Automatic primaries have a 16,384 UTF-8 byte cap; other capability attachments retain 8 KiB. Oversize primaries use the existing load pointer. The existing explicit skill-file read limit is unchanged. Tests cover 15,709, 16,384, 16,385 and 61,309 bytes, including multibyte content; the first two inline, larger values defer, and explicit reads remain complete.

Codex declares pointer-only automatic preparation. Two matching turns return pointers, without resolving/repeating automatic skill bodies; an explicit load returns the full body into CLI history. Selection state persists as selection, not a delivery ledger. An unrelated later turn retains valid prior IDs. Tovu forwards pointer policy through preflight and also forces concrete load pointers during final assembly for any adapter declaring an argv byte budget. A 30,000-byte fixture with a 10,000-byte request, 8,000-byte overlay and 61,309-byte candidate guidance stays within budget using pointers; existing final launch guards remain authoritative for arbitrary requests/overlays.

### Test commands and red / mutation / green

All tests are changed files only. Vitest always uses `--maxWorkers=2 --minWorkers=1`; Node always uses `--test-concurrency=2`. All child spawns are controlled fakes. No test process is left running.

Jini plugin command, cwd `/workspace/Jini/packages/agent-plugins`:

```sh
../../node_modules/.bin/vitest run src/lifecycle/__tests__/unit/automatic-use.unit.test.ts --maxWorkers=2 --minWorkers=1
```

- Test-first RED: 4 fail / 59 pass (`redesign-plugins-red.log`): old unbounded primary and absent IDs/policy API.
- Cap mutation 16 KiB → 32 KiB: the 16,385-byte boundary fails. Initial mutation run had 3 fail / 60 pass, including two old publication expectations; those were updated to check an empty loaded-plugin list while selection metadata is published (`redesign-plugins-mutation.log`).
- IDs getter mutation returns `[]`: 2 fail / 61 pass, catching both pointer-turn and prior/pinned ID behavior (`redesign-plugin-ids-mutation.log`).
- Restored GREEN: 63/63 pass, including unrelated later turns, inactive transitions, Off, skipped consent, capability limits and complete explicit reads (`redesign-plugins-committed-green.log`).

Jini adapter command, cwd `/workspace/Jini/packages/agent-runtime`:

```sh
../../node_modules/.bin/vitest run src/defs/__tests__/claude.test.ts src/defs/__tests__/codex.test.ts --maxWorkers=2 --minWorkers=1
```

- RED missing new fields: 2 fail / 116 pass (`redesign-adapters-red.log`).
- Mutation declares false/undefined: same 2 fail / 116 pass (`redesign-adapters-mutation.log`).
- Correct declarations GREEN: 118/118 pass (`redesign-adapters-green.log`).

Jini daemon commands, cwd `/workspace/Jini/packages/daemon`:

```sh
../../node_modules/.bin/vitest run src/agent-executor/claude/__tests__/subagent-start.test.ts --maxWorkers=2 --minWorkers=1
../../node_modules/.bin/vitest run src/agent-executor/__tests__/launch-defaults-and-staging.test.ts --maxWorkers=2 --minWorkers=1
../../node_modules/.bin/vitest run src/agent-executor/claude/__tests__/subagent-start.test.ts src/agent-executor/__tests__/launch-defaults-and-staging.test.ts --maxWorkers=2 --minWorkers=1
```

- Baseline both-file command: 18/18 pass (`redesign-daemon-baseline.log`).
- Test-first RED both-file command: 10 fail / 13 pass (`redesign-daemon-red.log`), old snapshot API and ID-specific staging.
- Truncate IDs to the first element: both-file command 2 fail / 22 pass (`redesign-daemon-mutation-ids-with-cleanup.log`). Both manifest tests catch missing IDs.
- Restore ID dispatch instead of field: launch-file command 5 fail / 13 pass (`redesign-daemon-mutation-id-dispatch.log`). Differently named adapters with the field stage; Claude-named adapters without it do not.
- Remove supportsSubagents gate: launch-file command 1 fail / 17 pass (`redesign-daemon-mutation-support.log`). Remove run grant: 1 fail / 17 pass (`redesign-daemon-mutation-grant.log`).
- Copy overlay into child context: launch-file command 3 fail / 15 pass (`redesign-daemon-mutation-overlay.log`).
- Change final context refusal 2,000 → 10,000: both-file command 2 fail / 22 pass (`redesign-daemon-mutation-bound.log`).
- Remove explicit PowerShell shell or apostrophe doubling: hook-file command 1 fail / 5 pass for each (`redesign-daemon-mutation-powershell.log`, `redesign-daemon-mutation-windows-quote.log`).
- Disable existing temp cleanup: launch-file command 8 fail / 10 pass, including manifest cleanup (`redesign-daemon-mutation-cleanup.log`). Mutation-only owned temp files were removed in finally.
- Restored final GREEN both-file command: 24/24 pass (`redesign-daemon-green.log`).

Tovu command prefix, cwd `/workspace/Tovu`:

```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2
```

Arguments appended exactly to that prefix:

- Main pair: `apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts`
- Pinned file: `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts`
- Final combined: all three paths above, in that order.

Records:

- Initial main-pair RED had 4 fail / 44 pass (`redesign-tovu-red.log`). Two are genuine prompt-carrier/argv-budget failures; two RPC fixtures failed before reaching assertions because they needed `host.start`. Those two are setup failures, not claimed as useful RED.
- Corrected RPC fixtures use real live-run registration and preflight. Deliberate response-ID dropping, restoration of Claude prompt omission, and removal of argv pointer protection together give 4 fail / 44 pass (`redesign-tovu-mutation.log`): both pinned/automatic RPC IDs, Claude prompt delivery, and 30,000-byte adapter budget assertions fail.
- Pinned test with the phase-2 forced-inject callback restored gives 1 fail / 2 pass (`redesign-pinned-valid-red.log`), exact pointer-policy mismatch. An earlier run had an incorrect test import (`redesign-pinned-red.log`); that setup failure is excluded from behavioral RED.
- Restored main/pinned behavior and final committed combined GREEN: 51/51 pass, no skips/cancellations (`redesign-tovu-committed-green.log`). Real fresh-child default loads return exact 61,309-byte guidance; IDs survive RPC for pinned/automatic preflight; retries reuse preflight; parent custom instructions and consent-retry tests pass.

Final changed-file total across repos: **256 passing tests** (63 plugins + 118 adapters + 24 daemon + 51 Tovu). No unchanged test files/full suites were run in this redesign.

### No-emit checks and errors

All changed production packages pass no-emit:

```sh
# cwd /workspace/Jini
node_modules/.bin/tsc -p packages/agent-plugins/tsconfig.json --noEmit
node_modules/.bin/tsc -p packages/agent-runtime/tsconfig.json --noEmit
node_modules/.bin/tsc -p packages/daemon/tsconfig.json --noEmit
# cwd /workspace/Tovu
node_modules/.bin/tsc -p tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=6144 node_modules/.bin/tsc -p /workspace/work/subagent-parity/tsconfig.tovu-changed-tests.json --noEmit
```

Logs: `redesign-plugins-final-typecheck.log`, `redesign-runtime-typecheck.log`, `redesign-daemon-typecheck.log`, `redesign-tovu-final-production-typecheck.log`, `redesign-tovu-test-typecheck.log`. The scratch test config is the same repository-extending changed-file config described in Tovu part; no checked-in exclusions/settings were changed. The previously reported broad test typecheck's ten unrelated errors were not changed or retested.

Existing ignored outputs were refreshed with package-local tsc for agent-plugins, agent-runtime and daemon, enabling Tovu's pre-existing local links to consume the new contract. No dependency install, manifest/lockfile update or new cross-package import was added in this redesign. Initial Tovu TS2353 for subagentStartContext was stale daemon declarations and disappeared after its emitted build.

Expected errors: `AssertionError` / `ERR_ASSERTION` for red/mutations; old snapshot API `TypeError [ERR_INVALID_ARG_TYPE]`; `ENOENT` for a deliberately truncated manifest; guarded `AGENT_SPAWN_FAILED`, `EEXIST` and explicit 2,000-character refusal for staging/context errors. Corrected test setup errors: missing live run, `ReferenceError` from a renamed resolver import, and one scratch edit attempted from the wrong repo directory. None remains in final checks.

Tovu's broad composition fixture emits `PluginLoadError` / `INTEGRITY_FAILED` warnings for linked bundled charts artifacts while all isolated target assertions pass. No bundled-content repair or actual installed-product validation is claimed. No inline lint disables or unrelated production fixes. The pre-existing untracked Jini plugin-ui-ux-design residue remains untouched.

### Measured redesign diff

Relative to the phase-2 tips above, documentation excluded:

Production — Jini:

| File | Added | Removed |
| --- | ---: | ---: |
| `packages/agent-plugins/src/lifecycle/automatic-use.ts` | 12 | 6 |
| `packages/agent-runtime/src/defs/claude.ts` | 1 | 1 |
| `packages/agent-runtime/src/defs/codex.ts` | 1 | 0 |
| `packages/agent-runtime/src/types.ts` | 3 | 2 |
| `packages/daemon/src/agent-executor/claude/subagent-start.ts` | 16 | 9 |
| `packages/daemon/src/agent-executor/contracts.ts` | 3 | 1 |
| `packages/daemon/src/agent-executor/launch.ts` | 4 | 4 |

Production — Tovu:

| File | Added | Removed |
| --- | ---: | ---: |
| `apps/website/src/features/agent-plugins/automatic-agent-plugins.ts` | 3 | 4 |
| `apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` | 11 | 11 |
| `apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts` | 3 | 3 |
| `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts` | 1 | 0 |
| `apps/website/src/server/runtime/composition/modules/assistant-byok.ts` | 2 | 3 |
| `apps/website/src/server/runtime/composition/modules/assistant-tool-exec.ts` | 11 | 11 |

Tests/helpers — Jini:

| File | Added | Removed |
| --- | ---: | ---: |
| `packages/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.unit.test.ts` | 53 | 2 |
| `packages/agent-runtime/src/defs/__tests__/claude.test.ts` | 1 | 1 |
| `packages/agent-runtime/src/defs/__tests__/codex.test.ts` | 1 | 0 |
| `packages/daemon/src/agent-executor/__tests__/launch-defaults-and-staging.test.ts` | 17 | 7 |
| `packages/daemon/src/agent-executor/claude/__tests__/subagent-start.test.ts` | 47 | 27 |

Tests/helpers — Tovu:

| File | Added | Removed |
| --- | ---: | ---: |
| `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts` | 21 | 4 |
| `apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts` | 1 | 2 |
| `apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts` | 26 | 8 |
| `apps/website/src/server/runtime/composition/modules/__tests__/assistant-agent-plugin-preflight.integration.test.ts` | 6 | 6 |

Redesign production **+71 / -55**, net +16 (estimate +84 / -33). Tests/helpers **+173 / -57** (estimate +140 / -90). The smaller production result reuses the existing controllers, RPC, run options, temp directory and cleanup. Across the entire job against the originally requested bases, production is +96 / -46, net +50; tests/helpers +436 / -72. No new session cache, delivery ledger, child registry, public API beyond the approved adapter fields/run context, or dependencies.

### Cost and remaining validation

Each child gets one hook response read and fewer than 2,000 JS characters of pointer context (roughly under 500 English tokens). Long lists add one IDs-manifest read. Each required explicit plugin load adds its full G bytes and roughly G/4 English input tokens; the 61 KB theme is loaded explicitly rather than replayed in hook context. No all-skill/reference preload or startup skill body replay. Actual model usage/currency and child compliance were not measured; no signed-in CLI ran. One Sidekick helper handled the bounded daemon item; helper billing unavailable.

Existing local Jini links validate source integration only. Registry release and the Tovu dependency/lockfile update remain necessary before installed-product validation; no publish was performed.

### Coordinator's redesigned signed-in canary (not run)

1. Use **fake-test-site**, never **tovu-dev**. Use an already-signed-in Claude CLI; record version and effective hook policy, including managed hook restrictions and acceptance under `--setting-sources ''`.
2. Request UI/UX work. Spawn general-purpose, custom and background children. Require every child to call `load_agent_plugin` for its parent IDs and quote the final guidance heading plus an essential Tovu rule. Confirm child MCP/tool availability and actual load compliance; absence of clipping alone is insufficient.
3. Continue with an unrelatedly worded edit and repeat. Verify resumed history, valid prior IDs and new plugins named in delegation after preflight.
4. Repeat with a pinned plugin and the 61,309-byte theme. Confirm pointer launch succeeds, automatic cap defers the theme and explicit load returns its ending.
5. Repeat on Windows with Git Bash and PowerShell-only, no Node on PATH, apostrophes/Unicode paths and custom instructions. Verify actual hook shell acceptance and actual argv's absence of plugin guidance for argv-budgeted adapters. Native Windows/macOS commands were not executed here; Linux executed the POSIX form, and platform command objects/quoting were asserted.
6. Check consent retry, subagents Off, hook/manifest cleanup and refusal-before-spawn. Separately inspect two Codex turns for repeated automatic body absence and full explicit read delivery. Unsupported hook policy/tool availability remains unvalidated and must not be called parity.

The approved source redesign is complete. Remaining: registry/version integration, native platform execution and this signed-in canary. No test process remains running. Finished before the 90-minute cap.

SUBAGENT-PARITY-3 DONE
