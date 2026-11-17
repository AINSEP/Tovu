# COMMON: rules every 2026-11-16 R/G/N sheet inherits (read first, then your sheet)

Revision 2 (2026-11-17, after the Codex judgment). Planning only; nothing here was executed. A sheet and this file are ONE contract: if they disagree, **STOP** and report the two lines; do not pick one.

## Base: one paired state in BOTH repos (judge finding 2)
The sheets were re-verified on Jini `integ/merge-a-2026-11-16` @ `dde69a6d` + `integ/merge-b-2026-11-16` @ `9c982fd9` and Tovu merge-a @ `e801e9ae` + merge-b @ `450ac748` (`integ/merge-final-2026-11-16` did not exist on 2026-11-17 02:10 UTC; a local scratch merge of a+b was used for the census: Jini conflicts in 3 files, none of them a lane file except `packages/server/src/kernel-base.ts`).
Tovu merge-b alone still imports `@jini-ai/agent-runtime/ai-trace`, which Jini merge-a removed, so **a lane starts only from a branch pair where each repo contains both merges**. First commands, both must print `ok`; otherwise **STOP**:
```
# Jini                                                                    # Tovu
git merge-base --is-ancestor dde69a6d HEAD && git merge-base --is-ancestor 9c982fd9 HEAD && echo ok
                                                                          git merge-base --is-ancestor e801e9ae HEAD && git merge-base --is-ancestor 450ac748 HEAD && echo ok
rg -n "agent-runtime/ai-trace" apps packages -g '!**/node_modules/**'     # Tovu: prints nothing (the C6 repoint is in)
rg -n 'from "@jini-ai/agent-runtime"' apps/desktop/src/desktop-agent-inventory.ts   # Tovu: prints nothing (desktop part of C6 is in)
```
Then, before reading source (Jini standing rule): `pnpm install --config.prefer-workspace-packages=true && pnpm -r build`; record a green baseline for every package you will touch (`pnpm --filter @jini-ai/<pkg> build && npm --prefix packages/<pkg> run test`), `pnpm guard > /tmp/guard-before.txt`, and in Tovu `npm ci`, build `@tovu/sdk`, Tovu's link script, `npm run typecheck`. A red baseline is reported, not fixed; a red **Tovu typecheck on the unmodified pair is a STOP** (the pair is not compatible). Record both SHAs in the report.

Re-run the census and compare with your lane's rows (cleanup work only, column 12):
`node <U>/sheets-2026-11-16/scripts/census.mjs <jini> <U> /tmp/census --tests && awk -F'\t' '$11=="<LANE>"' /tmp/census/CENSUS-sites.tsv | diff - <(tail -n +2 <U>/sheets-2026-11-16/sites/<LANE>.sites.tsv)`
A new or missing row: handle it if it is the same edge kind in a file your sheet already lists; otherwise **STOP**.

## Compliance classes (judge finding 10; census column `class`)
Only rows with class `work` or `forbidden-target` are cleanup work. Never plan or do work against the others:
- `allowed-preset`: `server`, `cli` (`jini.kind: "host-preset"`): wiring-only, may import anything; nothing imports them.
- `allowed-optionC`: a React file (`.tsx` or under a `react/` folder) may import `@jini-ai/ui-kit/react` (owner option C). Keep those imports. Do **not** replace them with kit slots or props.
- `allowed-adapter`: a `jini.kind: "runtime-adapter"` package (`@jini-ai/node-adapters`, OD-3) may import `platform` and domain port **types**; only a host or a host preset imports it.
- `frozen`: `sqlite`, `infra`, until the next major.

## There are no coordinator-only files (judge finding 1)
Every commit carries **everything it needs to be green**: the source edit, its tests, and in the same commit
- the `scripts/injection-debt.json` entries it retires (the gate fails on a stale allowance, `scripts/lib/injection-debt.ts` rule `injection-debt-stale`). Delete **only your own keys by hand**; never regenerate the file, so parallel lanes make disjoint hunks. A rebase conflict there is resolved by keeping both deletions. The file only shrinks (`injection-debt-growth`).
- any `packages/core/package.json` export + `jini.entries` line + README row for a core entry the commit creates, and `pnpm api:update` output;
- `pnpm-lock.yaml` after `pnpm install` when a manifest changed;
- the host lines that use a new binding (Jini `packages/server/src/**`, `examples/**`; Tovu `composition/{deps,app}.ts`, `apps/admin/src/main.tsx`, `integrations/jini-kits.ts`), in the Jini commit or its paired Tovu commit.
Shared files are kept conflict-free by **order**, not by deferral: INDEX §4 names, per shared file, which lanes touch it and the wave order; two lanes that touch the same shared source file never run in the same wave. If your lane must edit a file INDEX §4 gives to a later lane, **STOP**.

## STOP conditions, each with the command that enforces it (judge finding 15)
`BASE` = the SHA you started from. Run all of these before every push; paste the output into the report.
| Rule | Command (must print nothing unless stated) | What the command does NOT prove (review obligation in the report) |
|---|---|---|
| Every commit green alone | per commit: `pnpm --filter <touched pkgs> build`, their tests, `pnpm guard`, `pnpm typecheck`; for a pair, Tovu `npm run typecheck` linked to the Jini SHA | — never push red and "fix forward"; if a step cannot be green alone, stop and report the step |
| Tests first | the RED run (or, for characterization tests, GREEN on old code **and** RED under the named mutation) is pasted before the production diff | — |
| No shells, barrels, forwarders, aliases | `git diff $BASE..HEAD -- packages apps \| rg "^\+\s*export (\*\|\{[^}]*\}) from "` and `git diff $BASE..HEAD -U0 -- packages apps \| rg "^\+export (const\|function) \w+.*=> \w+(\.\w+)*\(\.\.\.\|@deprecated"` | a multi-line forwarding function: list every exported function you added whose body is one call, with why it is not a forwarder (it adapts an argument shape, named in the sheet) |
| No lazy import of a declared dep | `git diff $BASE..HEAD -- packages apps \| rg "^\+.*(await import\(\|loadOptionalPeer\(\|\brequire\()"` | — |
| Hooks are injected | `pnpm check:hooks` (Jini `scripts/check-hook-injection.mjs`) and `git diff $BASE..HEAD -- packages \| rg "^\+import .*\buse[A-Z]\w*\b.* from ['\"]@jini-ai/"` | a hook reached through a namespace import: list every `use*` call you added and the prop (defaulted to the real hook) or kit it arrives through, and the fake-hook output test |
| Fakes, not mocks | `git diff $BASE..HEAD -- packages apps \| rg "^\+.*vi\.(mock\|doMock)\("` ; and the lane packages' row count in `/tmp/census/CENSUS-test-mocks.tsv` (which **includes** core and protocol) is not higher than in `census/merged/CENSUS-test-mocks.tsv` | a relative-path mock of another package's file is caught by the first command only if added in this lane |
| Why-comments move with the code | `git diff $BASE..HEAD -U0 -- packages apps \| rg '^-\s*(//\|/?\*)' \| sed 's/^-\s*//' \| sort -u > /tmp/c-del; git diff $BASE..HEAD -U0 -- packages apps \| rg '^\+\s*(//\|/?\*)' \| sed 's/^+\s*//' \| sort -u > /tmp/c-add; comm -23 /tmp/c-del /tmp/c-add` | every line it prints is a comment that vanished: the report gives its new wording and location, or it is restored |
| Limits (owner: function ≤ 50, complexity ≤ 10, file ≤ 500) | on every file you created or grew: `npx eslint --rule 'max-lines-per-function: ["error", {"max": 50, "skipBlankLines": true, "skipComments": true}]' --rule 'complexity: ["error", 10]' --rule 'max-lines: ["error", 500]' <files>`; plus `pnpm check:size && pnpm check:complexity` | the repo ratchet (`scripts/check-size.mjs`) only **fails** at 80 lines; the eslint line above is the 50 gate. A file already over a limit before you (listed in your sheet) must not grow: `git diff --stat $BASE..HEAD -- <file>` net ≤ 0 |
| `(required, optional = {})` on exported functions | `git diff $BASE..HEAD -U0 -- packages \| rg "^\+export (async )?function \w+"` lists every exported function you added or re-signed | the command only lists them: for each line the report states the two-object shape, or the sheet line that keeps an existing positional signature unchanged |
| No new suppressions or casts on bindings | `git diff $BASE..HEAD -- packages apps \| rg "^\+.*(eslint-disable\|@ts-ignore\|@ts-expect-error\|as any\|as unknown as\|satisfies .* as )"` | — |
| Errors are never swallowed | `git diff $BASE..HEAD -- packages apps \| rg "^\+.*catch\s*(\(\w*\))?\s*\{\s*\}"` | a catch that only logs: list each new `catch` and what it rethrows or returns |
| Port bindings keep behaviour | the sheet's binding test (recording fake asserts argument order, object vs positional, field placement) | — |
| Honest testing | test count before/after per package (`npm --prefix packages/<pkg> run test` summary line); `git diff $BASE..HEAD -- '**/*.test.*' '**/__tests__/**' \| rg "^-\s*(it\|test\|expect)\("` lists every removed case/assertion, each with its new home | a weakened matcher: review every changed `expect` line |
| No package beyond base + exceptions | `pnpm guard`; `diff /tmp/guard-before.txt <(pnpm guard 2>&1)` shows only your lane's findings disappearing | — |
| Security | repos are public: describe security changes by class and location only | characterize a security path before moving it (lesson 31): the sheet names the real producer of each invariant |

## What a lane may edit
Its own package's files listed in the sheet; the shared files its sheet names (debt, core manifest, lockfile, host lines: see above); the Tovu files its sheet names. A lane deletes a manifest dependency of **its own package** in the same commit as the last import of it, with the debt entry and any manifest-assertion test.

## Cross-repo pairs
A step that changes a signature a host calls is a **pair**: one Jini commit, then one Tovu commit whose message names the Jini SHA it was checked against. Tovu is typechecked linked to that Jini SHA. No forwarder is left in Jini to bridge the gap; between the two commits Tovu's branch is red against that Jini SHA by construction, so **push the Tovu commit in the same run, before the report**.
The first Tovu commit that imports `@jini-ai/node-adapters` also adds it wherever Tovu enumerates Jini packages (`rg -n "jini-ai/platform" package.json apps/*/package.json development/scripts -g '!**/node_modules/**'`: add the new name next to each `platform` line).

## Git
Branch `xpkg/<lane>` in Jini (and Tovu when the sheet has Tovu files). Commit by explicit paths. `git pull --rebase` before every push. Never force-push. Push after every step. Last commit: `cloud-results/xpkg/<lane>.md` with DONE / PARTIAL / SKIPPED; SHAs; each step; debt keys retired; every command above with its output; errors classified LANE-CAUSED / PRE-EXISTING / ENV; test counts; what the sheet got wrong.

## Owner rules in force (acceptance criteria, not advice)
A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`; **option C: React entries may import `@jini-ai/ui-kit/react`**; `server`/`cli` are host presets; `sqlite`/`infra` are frozen; **OD-3: Node runtime adapters live in `@jini-ai/node-adapters` (kind `runtime-adapter`), not in the preset** (this replaces Q8). DI through typed ports from the host; exported functions `(required, optional = {})`; functions ≤ 50, complexity ≤ 10, files ≤ 500; feature slicing; no barrels, re-export shells or forwarders; why-comments move with the code; every custom hook (including `useT`, `useAdminLocale`) is a prop defaulted to the real hook, with a fake-hook output test; tests use fakes of interfaces; errors in plain words with Copy details, never swallowed; declared deps imported statically; schema changes are ADR-066 TS migrations with N-1 fixtures and automatic migration; never permanent deletes; `jini-` class prefix; i18n in all locales; no new `eslint-disable`/`@ts-ignore`; no silent behaviour changes. Pure helpers may live in core; no vendor code in core; plugins never import each other.
