# COMMON: rules every 2026-11-16 R/G/N sheet inherits (read first, then your sheet)

Revision 3 (2026-11-16 PT, after the Opus review; revision 2 answered the Codex judgment). Planning only; nothing here was executed. A sheet and this file are ONE contract: if they disagree, **STOP** and report the two lines; do not pick one.

## Base: `origin/refactor/terra` (= `integ/merge-final-2026-11-16`) in BOTH repos (judge finding 2; Opus review C; re-pinned 2026-11-17)
**Base = `origin/refactor/terra`: Jini `65d73b0d5`, Tovu `232764af5`** (= the tips of `integ/merge-final-2026-11-16`; Tovu 232764af5 contains the earlier merge-final commits `a28cb1bf` and `f70017dc`). Revision 3 re-read the facts it changed on this base (`git show refs/remotes/github/integ/merge-final-2026-11-16:<path>`). The census files under `census/merged/` and `sites/` were re-run on Jini `65d73b0d5` on 2026-11-17 (same totals as the scratch a+b merge; only `server/src/kernel-base.ts` line count changed, 268 -> 257). Every lane still re-runs the census first (below) and treats a difference as the STOP rule there says. `GUARDS.tsv` column 6 is the refactor/terra blob of every edge file.
Tovu merge-b alone still imports `@jini-ai/agent-runtime/ai-trace`, which Jini merge-a removed, so **a lane starts only from a branch pair where each repo contains merge-final**. First commands; both `ok` lines must print and both `rg` lines must print nothing; otherwise **STOP**:
```bash
# in Jini
git merge-base --is-ancestor 65d73b0d HEAD && echo ok
# in Tovu
git merge-base --is-ancestor 232764af5 HEAD && echo ok
rg -n "agent-runtime/ai-trace" apps packages -g '!**/node_modules/**'                # prints nothing (the C6 repoint is in)
rg -n 'from "@jini-ai/agent-runtime"' apps/desktop/src/desktop-agent-inventory.ts   # prints nothing (desktop part of C6 is in)
```
Then, before reading source (Jini standing rule): `pnpm install --config.prefer-workspace-packages=true && pnpm -r build`; record a green baseline for every package you will touch (`pnpm --filter @jini-ai/<pkg> build && npm --prefix packages/<pkg> run test`), `pnpm guard > /tmp/guard-before.txt 2>&1` (the same capture as the STOP check), and in Tovu `npm ci`, build `@tovu/sdk`, Tovu's link script, `npm run typecheck`. A red baseline is reported, not fixed; a red **Tovu typecheck on the unmodified pair is a STOP** (the pair is not compatible). Record both SHAs in the report.

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
- the generated `api-baseline/jini-ai__<pkg>.json` of every package whose public surface the commit changes. These files are **generated, never hand-merged**: when two lanes of one wave write the same baseline (INDEX §4 lists them), the second lane runs `git pull --rebase`, then `pnpm api:update`, and commits the regenerated file; a rebase conflict in `api-baseline/` is resolved by taking either side and regenerating;
- `pnpm-lock.yaml` after `pnpm install` when a manifest changed;
- the host lines that use a new binding (Jini `packages/server/src/**`, `examples/**`; Tovu `composition/{deps,app}.ts`, `apps/admin/src/main.tsx`, `integrations/jini-kits.ts`), in the Jini commit or its paired Tovu commit.
Shared files are kept conflict-free by **order**, not by deferral: INDEX §4 names, per shared file, which lanes touch it and the wave order; two lanes that touch the same shared source file never run in the same wave. If your lane must edit a file INDEX §4 gives to a later lane, **STOP**.

## STOP conditions, each with the command that enforces it (judge finding 15; Opus review: commands live in code blocks)
`BASE` = the SHA you started from. Run every block below before every push and paste its output into the report. **Copy commands only from the fenced blocks**: the table names the rule and what the command does not prove; it holds no commands (a `\|` inside a table cell is not a shell pipe when copied). The blocks name `packages apps`, which covers both repos.

| # | Rule | What the command does NOT prove (review obligation in the report) |
|---|---|---|
| S1 | Every commit green alone | never push red and "fix forward"; if a step cannot be green alone, stop and report the step |
| S2 | Tests first | the RED run (or, for characterization tests, GREEN on old code **and** RED under the named mutation) is pasted before the production diff |
| S3 | No shells, barrels, forwarders, aliases | a multi-line forwarding function: list every exported function you added whose body is one call, with why it is not a forwarder (it adapts an argument shape, named in the sheet) |
| S4 | No lazy import of a declared dep | — |
| S5 | Hooks are injected | a hook reached through a namespace import: list every `use*` call you added and the prop (defaulted to the real hook) or slot it arrives through, and the fake-hook output test |
| S6 | Fakes, not mocks | a relative-path mock of another package's file is caught only if added in this lane |
| S7 | Why-comments move with the code | every line it prints is a comment that vanished: the report gives its new wording and location, or it is restored |
| S8 | Limits (owner: function ≤ 50 lines, cyclomatic **and** cognitive complexity ≤ 10, file ≤ 500) | the repo ratchets (`scripts/check-size.mjs`) only **fail** at 80 lines; S8's eslint block is the 50/10 gate. A line it prints for a function that was already over the limit and **shrank** is allowed: say so in the report |
| S9 | `(required, optional = {})` on exported functions | the command only lists them: for each line the report states the two-object shape, or the sheet line that keeps an existing positional signature unchanged |
| S10 | No new suppressions or casts on bindings | an **edited** existing cast that a sheet names as allowed (e.g. R6-R9 §2) is listed with its before/after line; any other hit is a STOP |
| S11 | Errors are never swallowed | a catch that only logs: list each new `catch` and what it rethrows or returns |
| S12 | Port bindings keep behaviour | the sheet's binding test (recording fake asserts argument order, object vs positional, field placement) |
| S13 | Honest testing | a weakened matcher: review every changed `expect` line |
| S14 | No package beyond base + exceptions | — |
| S15 | Security | repos are public: describe security changes by class and location only; characterize a security path before moving it (lesson 31): the sheet names the real producer of each invariant |

S1, per commit (for a pair, also the Tovu line, linked to the Jini SHA):
```bash
pnpm --filter <touched pkgs> build && npm --prefix packages/<pkg> run test && pnpm guard && pnpm typecheck
# Tovu, linked to the Jini SHA:
npm run typecheck
```
S3 (must print nothing):
```bash
git diff $BASE..HEAD -- packages apps | rg '^\+\s*export (\*|\{[^}]*\}) from '
git diff $BASE..HEAD -U0 -- packages apps | rg '^\+export (const|function) \w+.*=> \w+(\.\w+)*\(\.\.\.|@deprecated'
```
S4 (must print nothing):
```bash
git diff $BASE..HEAD -- packages apps | rg '^\+.*(await import\(|loadOptionalPeer\(|\brequire\()'
```
S5 (`check:hooks` must pass with **no new key** in `scripts/hook-injection-debt.json`; the `rg` must print nothing):
```bash
pnpm check:hooks
git diff $BASE..HEAD -- scripts/hook-injection-debt.json | rg '^\+\s*"[A-Za-z]+::use'
git diff $BASE..HEAD -- packages | rg '^\+import .*\buse[A-Z]\w*\b.* from ['"'"'"]@jini-ai/'
```
S6 (first line prints nothing; the count after is not higher than the count before; both TSVs **include** core and protocol):
```bash
git diff $BASE..HEAD -- packages apps | rg '^\+.*vi\.(mock|doMock)\('
awk -F'\t' '$1=="<owner>"' /tmp/census/CENSUS-test-mocks.tsv | wc -l
awk -F'\t' '$1=="<owner>"' <U>/sheets-2026-11-16/census/merged/CENSUS-test-mocks.tsv | wc -l
```
S7 (prints the comment lines that vanished):
```bash
git diff $BASE..HEAD -U0 -- packages apps | rg '^-\s*(//|/?\*)' | sed 's/^-\s*//' | sort -u > /tmp/c-del
git diff $BASE..HEAD -U0 -- packages apps | rg '^\+\s*(//|/?\*)' | sed 's/^+\s*//' | sort -u > /tmp/c-add
comm -23 /tmp/c-del /tmp/c-add
```
S8: the 50/10/500 gate on every source file you created or changed, compared with the same file at `BASE` (prints only findings that are new or changed; must print nothing, except the "shrank" case in the table). Then the repo ratchets.
```bash
LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
FILES=$(git diff --name-only --diff-filter=AM $BASE..HEAD -- packages apps | rg '\.(ts|tsx|mts|mjs|js)$' | rg -v '(__tests__|__mocks__|/fixtures/|\.test\.|\.spec\.|\.typecheck\.|\.d\.ts$)')
# eslint 10 has no line formatter: print "rule message" per finding from the JSON report
msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
for f in $FILES; do
  npx eslint --no-inline-config --rule "$LIM" -f json "$f" | msgs > /tmp/lim-after
  { git show "$BASE:$f" 2>/dev/null || true; } | npx eslint --no-inline-config --rule "$LIM" -f json --stdin --stdin-filename "$f" | msgs > /tmp/lim-before
  comm -13 /tmp/lim-before /tmp/lim-after | sed "s|^|$f: |"
done
# Jini
pnpm check:size && pnpm check:complexity
# Tovu
npm run check:size && npm run check:complexity
```
S9 (lists every exported function you added or re-signed):
```bash
git diff $BASE..HEAD -U0 -- packages | rg '^\+export (async )?function \w+'
```
S10 (must print nothing except the allowed edited casts the sheet names):
```bash
git diff $BASE..HEAD -- packages apps | rg '^\+.*(eslint-disable|@ts-ignore|@ts-expect-error|as any|as unknown as|satisfies .* as )'
```
S11 (must print nothing):
```bash
git diff $BASE..HEAD -- packages apps | rg '^\+.*catch\s*(\(\w*\))?\s*\{\s*\}'
```
S13 (test count before/after per package, then every removed case or assertion, each with its new home in the report):
```bash
npm --prefix packages/<pkg> run test
git diff $BASE..HEAD -- '**/*.test.*' '**/__tests__/**' | rg '^-\s*(it|test|expect)\('
```
S14 (shows only your lane's findings disappearing; same capture as the baseline):
```bash
pnpm guard > /tmp/guard-after.txt 2>&1; diff /tmp/guard-before.txt /tmp/guard-after.txt
```

## What a lane may edit
Its own package's files listed in the sheet; the shared files its sheet names (debt, core manifest, lockfile, host lines: see above); the Tovu files its sheet names. A lane deletes a manifest dependency of **its own package** in the same commit as the last import of it, with the debt entry and any manifest-assertion test.

## Cross-repo pairs
A step that changes a signature a host calls is a **pair**: one Jini commit, then one Tovu commit whose message names the Jini SHA it was checked against. Tovu is typechecked linked to that Jini SHA. No forwarder is left in Jini to bridge the gap; between the two commits Tovu's branch is red against that Jini SHA by construction, so **push the Tovu commit in the same run, before the report**.
The first Tovu commit that imports `@jini-ai/node-adapters` also adds it wherever Tovu enumerates Jini packages (`rg -n "jini-ai/platform" package.json apps/*/package.json development/scripts -g '!**/node_modules/**'`: add the new name next to each `platform` line).

## Git
Branch `xpkg/<lane>` in Jini (and Tovu when the sheet has Tovu files). Commit by explicit paths. `git pull --rebase` before every push. Never force-push. Push after every step. Last commit: `cloud-results/xpkg/<lane>.md` with DONE / PARTIAL / SKIPPED; SHAs; each step; debt keys retired; every command above with its output; errors classified LANE-CAUSED / PRE-EXISTING / ENV; test counts; what the sheet got wrong.

## Owner rules in force (acceptance criteria, not advice)
A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`; **option C: React entries may import `@jini-ai/ui-kit/react`**; `server`/`cli` are host presets; `sqlite`/`infra` are frozen; **OD-3: Node runtime adapters live in `@jini-ai/node-adapters` (kind `runtime-adapter`), not in the preset** (this replaces Q8). DI through typed ports from the host; exported functions `(required, optional = {})`; functions ≤ 50, complexity ≤ 10, files ≤ 500; feature slicing; no barrels, re-export shells or forwarders; why-comments move with the code; every custom hook (including `useT`, `useAdminLocale`) is a prop defaulted to the real hook, with a fake-hook output test; tests use fakes of interfaces; errors in plain words with Copy details, never swallowed; declared deps imported statically; schema changes are ADR-066 TS migrations with N-1 fixtures and automatic migration; never permanent deletes; `jini-` class prefix; i18n in all locales; no new `eslint-disable`/`@ts-ignore`; no silent behaviour changes. Pure helpers may live in core; no vendor code in core; plugins never import each other.
