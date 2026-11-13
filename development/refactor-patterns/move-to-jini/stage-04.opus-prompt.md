HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS job, stage 04: cut the last 3 cycle edges with ports and one module move

EXECUTOR: Opus (not Terra). Why: port inversion through the composition roots, and moving a tool definition between features; deciding what each bound port carries is judgment.
Precondition: stage 03 has landed. Check first: `node development/refactor-patterns/move-to-jini/feature-cycles.mjs` prints `sccs=1 sizes=[5]` and `node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type` prints `sccs=1 sizes=[5] mutual-pairs=3`. Anything else: stop and report.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Read first: `development/refactor-patterns/move-to-jini/PLAN.md` sections 1.1 (rows C3, C4, C5) and 1.3 (port sketches: follow them; deviate only with a one-line reason in the report).

## Edges to cut (evidence: `node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --edges`)
- C3 custom-credentials -> deployments: `features/custom-credentials/tool-registrations.ts:7` (value `invalidatePublishCredentialCompatibility` from `../deployments/publish-credentials/index.js`), `:9` (type `DeployTargetRegistry` from `../deployments/contracts.js`). Used at `tool-registrations.ts:427-429` through `CustomCredentialsToolDeps.loadDeployTargets` (`:92`) and `.publishCredentialVerificationCache` (`:95`).
- C4b custom-credentials -> source-control: `features/custom-credentials/credential-ports.ts:15` (`buildSourceControlProviderForApi`, `LoadSourceControlProviders` from `../source-control/provider-registry.js`; `bindSourceControlWritePort` is declared at `credential-ports.ts:68`), `tool-registrations.ts:49` (type from `provider-registry.ts`), `:91` (`loadSourceControlProviders` dep), `:299` (`.list()` of providers), `:363` (`bindSourceControlWritePort(...)`). (`write-files-validation.ts:2-3` were handled in stage 03.)
- C5 source-control -> site-backup (pending owner decision D3, default yes: write it, and say in the report it is pending D3): `features/source-control/commit-site.ts:7-11` (static-copy, static-download-layout, static-download-landing, share-zip, share-policy) and `features/source-control/tool-registrations.ts:4` (static-download-landing).

## Do
1. C3 (PLAN 1.3 `CredentialChangedPort`): declare it in `custom-credentials/credential-ports.ts` (doc comment names deployments as the typical binder). `CustomCredentialsToolDeps` drops `loadDeployTargets` and `publishCredentialVerificationCache`, gains `readonly onCredentialChanged?: CredentialChangedPort`; the handler at `:427-429` calls it with `{ workspaceId, after }` exactly where `invalidatePublishCredentialCompatibility` ran (same ordering, same error handling: if the old code swallowed a failure, the port call does too). Bind it in BOTH composition roots that build these deps today: `server/runtime/composition/deps.ts:~2758-2775` and `server/runtime/composition/app.ts:~1663-1679` (both build `loadDeployTargets`/`publishCredentialVerificationCache` now). The binding (a small function in `features/deployments/`, e.g. `custom-credentials-binding.ts`) closes over the registry loader and the verification cache and calls `invalidatePublishCredentialCompatibility`. Tests: the existing custom-credentials tool tests that cover credential rotate/delete invalidation must pass unchanged in meaning; add one test that a missing `onCredentialChanged` is a no-op.
2. C4b (PLAN 1.3 `CustomCredentialsSourceControlPort`): `SourceControlWritePort` already comes from `@jini-ai/core/contracts/credentials`. Move `bindSourceControlWritePort` (`credential-ports.ts:68-`) into `features/source-control/custom-credentials-write-port.ts` (keep its comments); add `listProviders` there (replaces `tool-registrations.ts:299`). `CustomCredentialsToolDeps` drops `loadSourceControlProviders`, gains `readonly sourceControl: CustomCredentialsSourceControlPort` (required). Bind in the same two composition roots. Repoint the tests that built `loadSourceControlProviders` fakes to build the port instead (smallest change).
3. C5 (pending D3): `git mv features/source-control/commit-site.ts features/site-backup/commit-site.ts` (plus its tests in `source-control/__tests__/` that only test it), fix imports (site-backup -> source-control is the allowed direction). Move the `source_control_execute_commit` tool definition from `source-control/tool-registrations.ts` into `site-backup/tool-registrations.ts` with the tool name, schema, description and handler unchanged (the model-facing name must not change). Check every place that registers or lists tools by feature (`rg -n "source_control_execute_commit" apps development`) and keep the tool registered exactly once; if a tool manifest/snapshot test pins which feature owns it, update the pin and say so. `source-control/tool-registrations.ts:4` (static-download-landing) must go too: move whatever uses it with the tool, or report why not.
4. Ratchet: add to the root `package.json` a script `"check:feature-cycles": "node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0 && node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0"`, and wire it next to the existing static checks (find them: `rg -n "check-no-linked-jini|hygiene-audit|bug-class" package.json development/scripts`). Do not add it to any pre-push hook that runs heavy suites.

## Rules for every edit
- Keep every comment. A comment that explains WHY moves with the code it explains; never delete one to make a move fit. Do not add new comments except the doc comments this prompt asks for.
- No new `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!`, no lazy `await import()`.
- Do not change behaviour, error text, signatures or argument order unless this prompt says so. Functions keep the `(required, optional = {})` shape they have.
- Never `git add -A`, `git stash`, `git checkout -- <file>` or `git reset`. Other agents may share the tree.
- Run NO test suites and no repo-wide `tsc`. Allowed checks, one file at a time:
  - Tovu website/assistant/server test: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <one test file>`
  - Tovu admin test: `cd apps/admin && npx vitest run <one test file> --maxWorkers=2`
  - Jini test: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec vitest run <one test file> --maxWorkers=2`
  - Jini typecheck of a package you touched: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`
  - Lint: `npx eslint <changed files>` (no new errors).
  Single-file tests only. Leave nothing running; if a command hangs past 5 minutes, kill only the process you started.
- Commit with explicit paths: `git add -- <paths> && git commit -F msg -- <paths>` (one commit per repo per stage; message given below; end it with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). If `.git` is read-only in your sandbox, do not commit; list every changed path in the report instead. Never push.

## Done check
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --max-scc 0 --max-pairs 0                     # sccs=0 mutual-pairs=0
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0      # sccs=0 mutual-pairs=0
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0
npm run check:feature-cycles
```
Plus: each changed test file run once (single-file commands); `npx eslint <changed files>`. No full tsc (the coordinator's cloud batch runs it).

Commit message: `refactor(tovu): invert custom-credentials ports, move commit-site to site-backup (move-to-jini stage 04)` (C5 part pending D3: say so in the body).

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
