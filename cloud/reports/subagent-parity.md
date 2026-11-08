# subagent-parity-1

Status: partial implementation; Tovu feature work blocked by missing required bootstrap instructions. No product parity claim.

Started 2026-11-07 19:17 America/Los_Angeles (2026-11-08 03:17 UTC). Hard deadline 21:17 local (05:17 UTC). No publish, tags, deployments, secrets, sign-ins, or writes to cloud/combine/main.

## Branches and pushed commits

Both branches: `cloud/subagent-parity`, created at the exact fetched `origin/cloud/combine` heads:

- Tovu base `eb4c54a2daeb7b1a7c564a0cdd554c14af945f80`. Report-only commits recorded in branch history.
- Jini base `6f16c5ebddc26b1de43828dc7812cf4e0e413d54`.
- Jini item 1: `7f730e4bfd679a6198a84dcd8cfccbf0b87ffc1b` (pushed).
- Jini item 2: `3665df6865fabb4bbc313114f56fdabfc7a16f6e` (pushed).
- Jini item 3: in progress when this checkpoint was written.

The initial push created the new remote branch. Subsequent pushes follow `git pull --rebase` (with `--autostash` once to preserve the helper's concurrent, explicit-path changes). No force push. Tovu alone uses the owner-approved `--no-verify`.

## Scope and blocker

Tovu's `AGENTS.md` requires reading `AI-Dev-Shop/AGENTS.md` and explicitly says: “If `AI-Dev-Shop/AGENTS.md` is missing or unreadable, state that explicitly and stop.” That directory is absent both in the initial checkout and the approved base (`git ls-tree eb4c54a2d AI-Dev-Shop` is empty). An asynchronous clarification asks whether the already-read sibling Jini bootstrap may be used. No answer at this checkpoint. Feature work in Tovu is paused; this requested report records the unaffected Jini work.

Jini's bootstrap, locked architecture, capabilities catalog, and honest-testing skill were read. The required Sidekick helper handles only the daemon hook item. Local code indexes were checked: codebase-memory and Graphify unavailable; the understand-anything graph has no matching automatic-use entries, so source was inspected directly. Dependencies and dist were already present; no all-package install/build or full test suites ran.

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
- Tovu real-tool-executor fresh-caller regression: not written/run because Tovu is blocked. Jini controller cases are not a substitute for that integration test.

## Item 2 — complete automatic primary

Implemented in Jini: the first ranked consented automatic match is delivered in full only when there is a query and no pinned plugin. Other matches retain metadata/load pointers. Only this primary bypasses the automatic 8 KiB attachment threshold; capability attachments retain their guard. The existing 256 KiB skill-file read limit is unchanged.

Same exact changed-file Vitest command as item 1:

- RED: 11 fail, 46 pass (`j-item2-red.log`).
- Mutation: selected the primary but deliberately retained its original 8 KiB guard. Both oversized auto/ask primary tests failed (5 fail total, 52 pass; `j-item2-mutation.log`). Removed mutation by exempting only `primaryId`.
- An intermediate run exposed 3 outdated expectations: two off-plugin metadata suffixes and one already-delivered capability backstop. Expectations were updated to the approved behavior; no test removed or skipped (`j-item2-green-attempt.log`).
- GREEN: 57/57 pass (`j-item2-green.log`). Includes exact complete oversized guidance, pointer for the second candidate, pinned suppression, consent/exclusions, and unchanged capability byte-boundary tests.
- No-emit check: `./node_modules/.bin/tsc -p packages/agent-plugins/tsconfig.json --noEmit` from `/workspace/Jini`: pass (`j-item2-typecheck.log`).
- Tovu retained preflight promise, rejected-promise clearing, full pinned inject mode, and their tests: not implemented/run because Tovu is blocked.

## Item 3 — Claude snapshot hook

Daemon helper work and its evidence will be recorded after the bounded item finishes. Tovu overlay scoping and CLI adapter capability are blocked. Shared `agent-daemon-scope.ts` has no changes, including no Claude ID branch.

## Errors and setup findings

- `ERR_PNPM_BAD_ENVIRONMENT`: `pnpm exec vitest ...` triggered pnpm's dependency setup using installed pnpm 11 against the repository engine requirement. Used the already-installed package-local Vitest binary instead; no manifest/lockfile changes.
- `TS2305` / `TS2459`: stale platform dist did not export existing source `readBootIdentity` / `BootIdentity`. Ran `./node_modules/.bin/tsc -p packages/platform/tsconfig.json` from Jini to refresh ignored local output. That build exited 2 on unrelated stale core HTTP declarations (`TS2561`, `TS2339`, `TS2551`, missing `bodyAs`); it emitted the needed platform declarations, and the touched agent-plugins no-emit check then passed. No platform source was modified.
- `AssertionError`: expected test-first and mutation failures described above; final changed plugin tests pass.
- Missing Tovu `AI-Dev-Shop/AGENTS.md`: implementation blocker, pending explicit clarification.

Logs are local scratch files under `/workspace/work/subagent-parity/`; they are not product files.

## Measured diff at checkpoint

Against the requested Jini base, excluding the pending daemon work:

| Production file | Added | Removed |
| --- | ---: | ---: |
| `packages/agent-plugins/src/lifecycle/automatic-use.ts` | 8 | 13 |

| Test file | Added | Removed |
| --- | ---: | ---: |
| `packages/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.unit.test.ts` | 63 | 39 |

Tovu production/test changes: +0 / -0. Report lines are documentation, excluded from the approximate +80 / -20 production and +220 / -75 test budgets. Final daemon counts remain pending.

## Cost per fresh child

Let S be the complete prepared snapshot's UTF-8 bytes and G its plugin-guidance bytes. Each hook delivery is one SubagentStart, one local snapshot read, S output/context bytes, approximately S/4 English input tokens. No added network call. The fixed snapshot ceiling is 65,536 bytes; oversized input must fail visibly, never truncate. The previously measured UI/UX primary plus Tovu plugin overlay is 15,709 bytes, approximately 3.9k tokens, before common rules, custom instructions, inventory, and framing. Each explicit load adds one resolver read and G bytes, roughly G/4 tokens; reading after hook delivery duplicates those tokens. No startup preload of all seven skills or references. Monetary cost depends on model/pricing and was not measured; no real child ran here. One helper agent worked on the bounded daemon item; its model billing is unavailable.

## Coordinator's signed-in local canary (not run here)

After the Jini registry release and Tovu dependency/lockfile update, on the full integrated branch:

1. Use an already-signed-in Claude CLI locally; do not perform sign-in in this job. Create a disposable random fixture rule absent from the delegation prompt. Include distinguishable beginning/end sentinels beyond 8 KiB and a Tovu rule.
2. Exercise both pinned preflight and explicit parent loading, then automatic-primary preflight. Capture the actual Claude invocation: full snapshot through `--append-system-prompt`, Tovu explicit `--settings`, and empty settings sources. Verify the root sees complete guidance and Tovu rules exactly once.
3. Ask fresh built-in, custom, and background children to report the random rule, final sentinel, and Tovu rule without quoting those rules in the delegation prompt. Verify SubagentStart executes and `hookSpecificOutput.additionalContext` reaches each child without clipping.
4. Change fixture source guidance after preflight; a newly started child must still report the original prepared snapshot. Verify snapshot access under actual filesystem confinement and cleanup at terminal run state.
5. Repeat on a resumed parent turn and replacement attempt; retained preflight must not ask/resolve again, and children must receive the retained snapshot. Exercise paths containing spaces/quotes on Windows, macOS, and Linux; inspect the generated command and real hook execution on each OS.
6. Deny subagents and verify no hook is staged. Induce an oversized snapshot and staging failure: parent must not spawn. Record errors and actual token usage per child.

Claude hook contract: https://code.claude.com/docs/en/hooks#subagentstart . The hook adds context; it cannot prevent child creation. Any unsupported carrier remains unvalidated and must not be called parity.

## Not done

Tovu feature implementation/integration tests and no-emit check are blocked as above. Registry release and dependency/lockfile update are excluded by the no-publish instruction. Product validation and signed-in Claude canary are intentionally not run. No per-child delivery map/registry, public options, dependencies, native plugin installation, reference preloading, cross-CLI bootstrap, delegation framework, or permission/tool parity work was added.
