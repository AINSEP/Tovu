# lo-sc report (wave2/lo-sc, both repos) — FINAL

Run 2026-11-17, unattended. Base: origin/refactor/terra (Tovu 232764af5 / Jini 65d73b0d5). Node 24.22.3, vitest `--maxWorkers=2` equivalent (see "Differed"). Rulebook files read: refactor skills, programmer skills, refactor-patterns, implementation-guardrails, testable-design-patterns, architecture-migration (skimmed; the owner rules in the dispatch were applied).

## Done
**SC-H1 (security, class/location only): DONE.** The source-control account-label probe made a credentialed outbound request through the kit's native `fetch` (plugin `github/source-control/github.mjs`, host store `features/source-control/store.ts`), outside the guarded egress client and with no per-call redirect refusal. Now: the plugin sends it through `kit.httpClient` with `redirect: "error"`; the host store's write deps carry the guarded client (`httpClient`, wired from `RouteDeps.customCredentialsHttpClient` in the admin credential route and the assistant credential-setup path) and the global `fetch` is never used for it.
- Jini `b89543f3` (agent-plugins patch changeset).
- Tovu `e7da7795`.
Other credentialed outbound of the same class noticed, NOT changed (not in this sheet): the site-commit path (`commit-site.mjs`) sends through the kit's native `fetch` and relies on the plugin's own redirect guard, so it is outside the host egress guard (plan table "Outbound A"). Recommend a follow-up sheet.

**SC-1 (HARDEN, Jini devops): DONE**, one commit per gap, each green alone, changeset + devops api-baseline delta in the same commit:
- G1+G1b `ba17cddd` redact provider failure text and host-described thrown-error text with the resolved token (patch).
- G2 `588df0ff` own-property failure-code map (patch).
- G3 `779ff163` optional `stage` on `describeError` (minor).
- G4 `9393d080` optional `CommitLayoutPort.arrangeFiles({ report })`, validation still applies, cleanup after arrange (minor).
- G5 `95b9654d` optional `describeMissingCredential({ providerId })` (minor).
Wording decision (differs from nothing in the sheet, noted for SC-2b): a failure at stage `arrange` is worded ONLY by `describeError` (no Jini prefix), so SC-2b can keep the Tovu texts byte for byte; the `export` stage keeps its existing prefix.

## Branch / SHAs
- Jini `wave2/lo-sc`: b89543f3, ba17cddd, 588df0ff, 779ff163, 9393d080, 95b9654d (pushed).
- Tovu `wave2/lo-sc`: e7da7795 (pushed), def696d2 = cherry-pick of wave1 `53ff98c3` (SC-2a characterization test, needed by SC-2b's precondition; wave1/lo-SC-2a is not merged into terra). SC-0 (`wave1/lo-SC-0`) NOT cherry-picked (SC-2b does not need it).

## Not done
- **SC-2b: NOT STARTED (stopped by budget, not by a failed gate).** S-PRE holds on this branch (`arrangeFiles` is in the linked `@jini-ai/devops` dist; the SC-2a test is present via cherry-pick `def696d2`; S-BLOB `commit-site.ts` = faa002ba, 547 lines, matches). Facts the SC-2b run needs, found while preparing:
  1. `commit-site.ts` is ~300 lines of why-comments of 547. "At most 150 lines" and "move why-comments, never delete" together mean most comments move into Jini neutral wording (an S-COMMENT-accounted Jini commit) before the Tovu file shrinks.
  2. The sheet's STOP command `rg -n "process\.env" .../commit-site.ts` prints a line today, but only because of a COMMENT (line 253); it goes quiet once that comment moves.
  3. `__tests__/commit-site-export-resolution.unit.test.ts` pins (by source text) that `commit-site.ts` statically imports `#src/features/site-export/index`; once `firstExportFailure` lives in Jini that pin has no subject. The sheet only protects the SC-2a tests from edits, so this one needs an owner/Opus decision (repoint to the binding's remaining import, or retire with the file's reason moved).
  4. Binding details to confirm against the 13 SC-2a tests: the plugin input today always carries `folder` (empty string at the root) while Jini omits an empty folder; `branch` stays inside the one input object (matrix in the sheet). Stage wording is ready: `arrange` is worded only by `describeError`, `export` keeps Jini's prefix, `credential` keeps `credential could not be resolved: ` + host text, `commit` is host text only (so the Tovu fixed sentence and its log line live in the binding's `describeError`).
  5. Importers per the sidecar: 3 tests + `tool-registrations.ts:30` + `server/routes/types.ts:1721`; recount with `rg` at run time.
- **LO-SC3 (retire the unused object-style plugin interface): not executed.** Decided = Rec (retire). No sheet in `SC-source-control.md` implements the retirement (only "SC cleanup" is blocked on it), so nothing in this run's scope applied.
- Not run: `pnpm guard:plugins:catalog` and a plugin manifest version bump for the changed `github` plugin file. The catalog digests and `plugin.json` version are release-time (INDEX stage P); `catalog.json` still holds the 0.7.1 digest of `source-control/github.mjs` and will need regeneration at release.
- HELD ids: none of this run's parts waited on one (LO-SC3/LO-SC4 = Rec).

## Gates (exact command -> result)
Environment: Node v24.22.3; Jini `pnpm install --frozen-lockfile` then `pnpm --no-bail -r build` (exit 0); Tovu `npm ci` (exit 0), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (71 links), `npx tsc -p tsconfig.json` in `packages/contracts` and `packages/sdk`.

Baselines on the unmodified trees:
- Jini: `pnpm guard` exit 0, saved as guard-before; `pnpm --filter @jini-ai/devops run typecheck` ok; devops vitest 83 files / 1248 tests pass; `pnpm run test:agent-plugins:content` after the build 1411 pass 0 fail (before the build one file could not import the unbuilt devops dist: 108 pass 1 fail, setup, not a regression).
- Tovu: `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run typecheck:tests` exit 0. BASE-RED (recorded): `npm run check:size` exit 1, `check:complexity` exit 1, `check:architecture` exit 1 (4 metrics regressed), `check:errors` exit 0 in WARN mode (12 new/worse entries).

After the last commit (Tovu `e7da7795` content; Jini `95b9654d`):
- Jini, every commit (V2 script): `pnpm --filter @jini-ai/devops run build` ok; `... run typecheck` ok; devops vitest `npx vitest run --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1` 1250 / 1251 / 1252 / 1256 / 1257 pass after G1..G5, 83 files, 0 fail; `pnpm guard` exit 0 and `diff guard-before guard-after` empty each time; `pnpm api:check` exit 0 (it prints other packages' pending, changeset-covered drift; no `source-control` line); `pnpm check:size` exit 0; `pnpm check:complexity` exit 0; S-LIM (per touched production file vs origin/refactor/terra): nothing new; S-IMPORT, S-BARREL, S-RUNTIME, S-SUPPRESS, S-MOCK, S-DELETE, S-BOOT, S-ARGS print nothing; S-TEXT prints only the pre-existing doc-comment line `github.mjs:9` (not in this run's diff).
- Jini H1 commit: `pnpm run test:agent-plugins:content` 1411 pass 0 fail; `npx vitest run --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1` in `packages/agent-plugins`: 147 files, 2165 pass, 2 skipped.
- Tovu: `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run typecheck:tests` exit 0 (re-run after the last Jini commit, against Jini `95b9654d`); `node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks` over every `features/source-control/__tests__/*.test.ts` (incl. SC-2a's 13), `credential-safety/stores.test.ts`, `assistant/moved-tools.credential-cards.golden.test.ts`, `site-backup/tool-registrations.unit.test.ts`, the admin credential route tests, `agent-plugins/__tests__/unit/bundled-github-*.test.ts`, `static-publish/adapter.unit.test.ts`: 553 pass 0 fail 0 skipped; a wider sweep before the last commit (route, custom-credentials, all `agent-plugins/__tests__/unit`, installed-deploy-verb): 1256 tests, 0 fail. `npx eslint` on touched files: no error that is not already on the base (`updateSourceControlCredential` complexity 11 is on the base). S-LIM vs terra: no new line. S-SUPPRESS, S-MOCK, S-FORWARD, S-CRED, S-BOOT print nothing; S-NET hits are strings asserted on only.
- Tovu ratchets after vs base, `npm run check:size|check:complexity|check:architecture|check:errors`: outputs identical to the base (same exit codes), except one informational line of check:architecture `deep-import edges 2828 -> 2830` (my new end-to-end test imports the composition-only `platform/http/client` and `egress-policies` directly, as `platform/http/__tests__/client.test.ts` does).

## RED evidence (first-line failures on the parent code)
- Jini H1 (`github.test.mjs`): `✖ readAccountLabel: GET /user with the token through the guarded client, bounded, redirects refused, login only` and `✖ readAccountLabel: a redirect is refused; no request with the credential reaches the redirected host` (`actual: 'attacker-controlled'`, expected `null`), 2 of 5 fail on the parent.
- Tovu H1 (`store.unit.test.ts`, parent `store.ts` restored): 3 of the 4 new tests fail (`actual: null, expected: 'octo'`; `actual: 'saved', expected: 'unreachable'`; `actual: 'saved', expected: 'timeout'`). The 4th ("without a guarded client...") is a pin that was already true on the parent because the fixture no longer calls `kit.fetch`.
- SC-1: G1/G1b 2 red, G2 1 red, G3 1 red, G4 4 red, G5 1 red on the parent commit.js.
- The end-to-end Tovu test `account-probe.guarded.unit.test.ts` (real bundled plugin + real guarded client + a redirecting fake transport) is a green pin of the combined wiring; I did NOT run it against the old plugin because the old code path would send a fixture token to a real host. Its red coverage is the two layers above.

## Differed from the sheet / plan
- SC-H1 has no sheet text (a design-queue item). Design follows the decision: plugin asks `kit.httpClient.send(req, { redirect: "error" })`; the Tovu kit already hands the guarded client to plugins unchanged, so no Jini kit type changed (only the plugin's `Kit` typedef gained the optional second argument).
- Store write deps: `fetchFn` and `observability` replaced by `httpClient?` (the guarded client is traced where it is built, `deps.ts` builds it with observability). Absent client: the provider is still asked and its request fails as a transport error (the existing test "saves with no injected fetch" stays green and unedited); nothing falls back to the global `fetch`.
- Existing tests: no assertion changed. Only how a test hands the probe its transport changed (fetch stub -> client double), in `store.unit`, `project-scope.unit`, `propose-credential-tool`, `tool-registrations.unit`, `credential-safety/stores`, `moved-tools.credential-cards.golden`, `site-backup/tool-registrations.unit`, and the example provider fixture (it models a plugin and now sends through the guarded client).
- Jini existing probe tests in `github.test.mjs` were rewritten for the new transport (same assertions: login only, bounded, every failure null; the bound is now `timeoutMs: 10000`).
- `vitest --maxWorkers=2` crashes on Jini's vitest 2.1.9 (`minThreads and maxThreads must not conflict`); `--poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1` used instead.
- `api-baseline/jini-ai__devops.json`: the file has pending drift from other lanes (env-access etc.); each commit changes only the `./source-control` entry (`pnpm api:update` rewrites 11 baselines; reverted the rest).
- Two typed new members share one wording rule: stage `arrange` has no Jini prefix (see SC-1 note).

## Overlaps with parallel runs
- Tovu: `features/source-control/{store,credential-setup,tool-registrations}.ts`, `server/inbound/admin-http/routes/system/source-control-credentials.ts` (the route's Pick of RouteDeps now lists `customCredentialsHttpClient` instead of `observability`), and one-line test edits in `credential-safety/__tests__/stores.test.ts`, `assistant/__tests__/moved-tools.credential-cards.golden.test.ts`, `site-backup/__tests__/tool-registrations.unit.test.ts`. wave1 SC-0 (`wave1/lo-SC-0`, not merged): inspected, not executed here; its route test builds deps through casts and its kit tests pin `kit.fetch`/`httpClient` which this run did not change, so it should stay green on top of this branch (verify when merging).
- Jini: `agent-plugins/github/source-control/*` (BK/DC lanes touching the github plugin files), `devops/src/source-control/{commit,contracts}.ts`, `api-baseline/jini-ai__devops.json` (any other lane that regenerates that file will conflict textually), `.changeset/`.

## Next step
Dispatch SC-2b as its own run on `wave2/lo-sc` (it already has SC-1 and the SC-2a test), starting with a Jini comment-carrying commit for the why-text that moves, then the Tovu binding; decide item 3 above first. Then SC-0 merge check, then the release step (plugin version + catalog regeneration) before any publish.

## Process notes
Pushes: Jini `git push -u origin wave2/lo-sc` ran the repo pre-push hook (no `--no-verify`); Tovu push ran its hook ("no apps/desktop changes in this push - skipping desktop gates"). No force-push. No test/server processes left running (checked with pgrep).
