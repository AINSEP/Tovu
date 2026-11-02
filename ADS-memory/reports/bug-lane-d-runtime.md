Programmer(Execution), with TDD: both personas loaded; selected for runtime root-cause fixes and user-path regression tests.

Inputs: PEER_DISPATCH lane D; canonical `/Users/la/Programming/Tovu/development/open-bugs.md` lines 165, 170, 177, 218, 222, 259, 323, 338, 361; Codex batch14 `out/t3-tests.md`; current source and git history. The clone lacks architecture chapters 13/14, so the canonical Tovu copies were consulted. No MCP graph tools are exposed in this session; discovery used targeted source searches.

Verification: tests were written before their fixes, but **no tests, lint, builds, installs, or servers were run**, as instructed. All red→green outcomes below are expectations for the coordinator to establish, not measured passes. Both touched Jini packages' final `npm run typecheck` commands exited **0**, including `src` test files. Targeted `git diff --check` also exited 0. No commits, operational password changes, or processes left running.

## Implemented, awaiting coordinator tests

| Bug / class | Cause and fix | Regression and expected red→green | Command |
|---|---|---|---|
| 218: stale captured configuration | `apps/website/src/server/runtime/composition/app.ts:2389` passed a theme-array snapshot. Registration now supplies a getter, so existing middleware reads the current roster. | `theme-static-assets-live-roster.unit.test.ts`: real app requests first return old inherited bytes, then must return replacement bytes after roster replacement, for public and preview URLs; withdrawal must return 404. Before: stale bytes persist. After: current bytes/404. | T1 |
| 338a: leaked temporary DBs | `server/runtime/composition/publish-content-seed-hash.ts:75` created a temp directory and never released it. The existing native opener now deserializes the seed into a private in-memory DB; existing `openContentDb` still handles migration/open failure. | `publish-content-seed-hash.load-deps.unit.test.ts`: both valid and malformed seeds leave no new temp copies; source bytes stay identical; successful repos remain usable. Before: leaked temp directory. After: none. | T2 |
| 338b: colliding recovery artifacts | Jini `packages/db/src/sqlite/db-ops.ts:64` used only scope, watermark, and milliseconds; SQLite could overwrite an older snapshot. Exclusive file creation now reserves the path before backup, advancing the filename stamp on collisions. Partial failed backups remove only their own reservation. Existing filename syntax is unchanged. | `db-ops.test.ts`: fixed clock/watermark across concurrent independent adapters yields three different paths, preserving the first snapshot's original rows. A failed capture must preserve the pre-existing snapshot and remove its own partial file. Before: collision/overwrite and partial remains. After: distinct restorable artifacts and cleanup. | J1 |
| 338c: repeated boot allocation | `server/runtime/composition/deps.ts:920` reset and backed up on every boot while the secret remained set, even if the stored credential already matched. The boot hook now verifies first and returns without reset, session revocation, or copy when already satisfied. A genuinely requested differing reset keeps its original backup/self-verification path. Logs now describe checking/recovery accurately. | `create-site-route-deps-boot-options.integration.test.ts`: two boots of a disposable database with an already matching credential allocate no reset copies and retain the stored hash. Before: a copy every boot and re-salting. After: no copies or re-salting. Existing different-password and missing-user tests remain intact. | T3 |
| 361a: settings disconnected from enforcement | `features/comments/index.ts:41` built a fixed max=20 limiter. The host now binds the workspace and supplies its live ledger max to the existing Jini limiter. Jini resolves that max within its existing serialized check queue, preserving counters rather than constructing replacement limiters. | Comments `index.test.ts`: submit twice at max=2, refuse the next, lower to 1 without replenishment, raise to 3 and allow exactly one remaining submission. Jini `rate-limit.test.ts` additionally guards concurrent checks, independent keys, expiry, zero budgets, burst preservation, and invalid/failing policy reads. Before: stored setting has no enforcement effect. After: immediate enforcement with the same window. | T4 + J2 |
| 165: assertion-message synthesis can block the test process | Added a focused ESLint config using installed ESLint's `no-restricted-syntax`, with the existing TypeScript parser. It rejects message-less canonical `assert.ok`, callable `assert`, and strict variants, including multiline calls. | `test-safety-eslint.test.ts` invokes the actual Linter/config on unsafe and safe snippets. Before the restriction: unsafe calls produce no diagnostic. After: an error requiring an explicit message; explicit messages and specific assertions remain accepted. | T5; G1 runs the actual guard |
| 170: one teardown error skips owned resources | `site-backup/__tests__/import.fixture.ts:79` registered file removal before a separate DB-close hook. It now owns all cleanup in one hook with `finally`. `peer-site-reads.fixture.ts:48` formerly abandoned all later handles and folder removal after one disposal error; it now tries every close in reverse dependency order, removes the folder, then reports errors. `fs-files/__tests__/asset-tool-fixture.ts:24` formerly registered removal before a separate abort hook; it now aborts pending work before removal in one hook. `server/__tests__/helpers/unrun-site-boot.ts:125` swallowed DB-close failures; it now reports them while still restoring globals and removing fixtures through `finally`. | `resource-teardown.unit.test.ts` spawns actual `node:test` runs of real helpers, injecting a removal/disposal failure. Children must still fail with that error while DBs close, peer folders disappear, and asset work aborts. Existing `helper-teardown.unit.test.ts`/fixture add a close-failure branch: before, that child incorrectly passes; after, it fails with the original close error while all fixture markers still appear. | T6 |

These class guards cover replacement and withdrawal, both load outcomes, same-clock concurrency and failed copies, repeated satisfied recovery, live budget changes without counter resets, the canonical assertion family, and independent cleanup failures. No existing test was skipped or weakened.

## Already fixed: skipped

- **177 + 323:** commit `cdbddddae0ad097a48a17c17b692f96c0898754b` implements same-dev-session site resumption after a watch restart and explicitly includes the TS18048 guard. Current `local-site-supervisor.ts:201` reads `stored && stored.session === devSession`. Existing `local-site-resume.unit.test.ts` covers both starting/running sites and an interrupted awaited spawn. Run T7; no duplicate implementation or tests added. This is restart-and-resume behavior, not uninterrupted child-process survival.
- **259:** commit `f634c9aea` already changed the shared notice to `The base path was ignored because the public URL sets the path.` Existing `export-base-path-notice.unit.test.ts` covers the exporter and CLI. Run T8; no edits made.
- The newest-five migration-copy retention is already in `87887c4fa`; Jini's shared policy has `DATABASE_COPY_RETENTION = 5`. No retention limit changed here. Five copies can occupy approximately **5× the DB size**, in addition to the live DB, journals, other recovery copies, and transient copy space; this is not a whole-volume cap.

## Not done: design proposals for Coordinator

**222 — campaign-content gap.** The cited Codex t3 report is accurate: `routes/newsletter/create-campaign.ts:27` requires `bodyJson` but discards it before persistence; `update-campaign.ts` also validates and drops it. `CampaignRecord`, `campaign-write-service`, repository row mapping and `newsletter_campaigns` have no body field. ADR-PIPE-011's Decision explicitly owns the bespoke campaign/revision tables, superseding the earlier campaign-as-entry design. Adding a parallel entries owner would violate that record.

Proposal: revise the existing newsletter ADR/spec to extend its current campaign owner with `bodyJson`, persist it through the write chokepoint, include it in revision snapshots, and carry it through create/get/patch and delivery rendering. Add the additive SQLite/Postgres migration and specify an empty-document baseline for old rows, including old revision JSON compatibility. Require create→GET and PATCH→GET/revision round trips with omitted-body preservation, workspace isolation and optimistic conflicts, plus a delivery-output test. A migration/contract decision is necessary before coding; no schema, newsletter production code, or intentionally red test was left behind. Search found no Jini newsletter implementation to reuse. Coordinator must resolve Jini-first ownership before dispatching this generic campaign behavior; this lane adds no new owner.

**361b — navigation `rel` allowlist mismatch.** `features/theme/static-render.ts:218` documents the mismatch, and Jini `cms/src/navigation/types.ts:111` promises validation that `menu-service.ts:252` does not implement. The menu spec/ADR does not enumerate permitted rel tokens or compatibility handling. Tovu's renderers escape attribute text; no attribute-injection exploit was established here.

Proposal: define the token policy and unknown-token behavior in ADR-029/spec, implement it in Jini's existing navigation write chokepoint, and apply the same approved policy to previously persisted values through the shared renderer. Explicitly decide treatment of `opener`, custom tokens, case, duplicate tokens, and `_blank` security tokens. Test create/update/import writes and emitted anchors for legacy values. Do not add a Tovu-only competing validator. No renderer/contract change made pending that policy decision.

**Verification and guard rollout.** Runtime red/green and regression suites remain unrun by explicit owner instruction. The assertion config is a standalone guard, not wired into default lint/CI; G1 demonstrates enforcement without changing root tooling outside this lane. Thousands of historical message-less assertions remain (the t3 report measured 4,129 under website). Renamed assertion imports are outside the syntactic guard's current coverage. Existing orphan copies on disk are not deleted by this work. No owner database or credential was accessed or modified.

## Exact coordinator commands

Run from `prov2-tovu` unless a `cd` is shown. Build/link the changed Jini packages in the coordinator's authorized workflow before Tovu tests; Tovu's limiter adapter needs the new http-kit declarations/runtime. To demonstrate red, apply regression-test hunks to the pre-fix checkout, then apply production hunks and repeat the same command. No red/green evidence is claimed by this lane.

```bash
# T1 — theme replacement/withdrawal through the real app
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=120000 apps/website/src/server/inbound/public-http/middleware/__tests__/theme-static-assets-live-roster.unit.test.ts

# T2 — seed lifecycle + existing seed-hash behavior
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=120000 apps/website/src/server/runtime/composition/__tests__/publish-content-seed-hash.load-deps.unit.test.ts apps/website/src/server/runtime/composition/__tests__/publish-content-seed-hash.test.ts

# T3 — satisfied reset and existing real boot recovery branches
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=120000 apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts

# T4 — public comment submission and live ledger settings
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=120000 apps/website/src/features/comments/__tests__/index.test.ts

# T5 — guard behavior
node --import tsx --test development/scripts/__tests__/test-safety-eslint.test.ts

# G1 — actual assertion lint (historical violations are expected; no blanket rewrite performed)
npx --no-install eslint --no-config-lookup --config development/scripts/test-safety-eslint.config.mjs 'apps/website/src/**/*.test.ts'

# T6 — actual node:test failure hooks and existing server/boot helper contracts
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=300000 apps/website/src/server/__tests__/resource-teardown.unit.test.ts apps/website/src/server/__tests__/helper-teardown.unit.test.ts apps/website/src/server/__tests__/helper-teardown.integration.test.ts

# T7 — already-landed Q3 coverage
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=120000 apps/website/src/platform/site-dir/__tests__/unit/local-site-resume.unit.test.ts apps/website/src/platform/site-dir/__tests__/unit/local-site-intent.unit.test.ts apps/website/src/server/runtime/lifecycle/__tests__/local-site-resume-boot.unit.test.ts

# T8 — already-landed caller-neutral notice
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --test-timeout=120000 apps/website/src/cli/__tests__/unit/export-base-path-notice.unit.test.ts

# J1
(cd ../prov2-jini/packages/db && npx --no-install vitest run src/__tests__/sqlite/db-ops.test.ts src/__tests__/sqlite/backup-policy.test.ts)

# J2
(cd ../prov2-jini/packages/http-kit && npx --no-install vitest run src/__tests__/rate-limit.test.ts)

# Already executed here, both exit 0, after final Jini edits:
(cd ../prov2-jini/packages/db && npm run typecheck)
(cd ../prov2-jini/packages/http-kit && npm run typecheck)
```

## Reuse and risks

- Reuse: live theme sources; traced app registration → existing theme-static middleware → inherited-source lookup; used a getter at registration, without a new middleware or source owner.
- Reuse: seed snapshots; inspected `content-db.ts` and native SQLite opener/snapshot support; used the driver's existing buffer-deserialization capability and the existing migration/open-failure owner. Trade-off: the cached seed now holds its complete private DB image in memory rather than in an abandoned temp file.
- Reuse: restore capture; searched Tovu facade, Jini db core naming, SQLite backup/retention; extended the existing Jini DB adapter using exclusive-create from `node:fs`, preserving the shared name contract.
- Reuse: live comment budgets; traced public ingress → comment host ports → Tovu facade → Jini http-kit queue/store. Extended the existing limiter, with Tovu supplying workspace-specific settings. No new store/limiter lifecycle or CMS implementation.
- Reuse: test assertion guard; installed ESLint already supplies the selector rule, and installed typescript-eslint supplies parsing. No custom parser, analyzer, dependency, or production abstraction added.
- Reuse: teardown; inspected HTTP/provider/boot helpers, dialect fixtures, consent fixture, import/peer/asset helpers. The existing HTTP/provider helpers already close sockets. Applied the own-all-cleanup invariant to the three unsafe multi-resource helpers and strengthened the existing boot helper's `finally` so close errors remain visible. This does not change node:test semantics or guarantee cleanup after an unrelated external hook throws first.

## Bugs found

All assigned unresolved defects are listed above, including the two design proposals. Additional observations:

- `update-campaign.ts` documents another unresolved spec/domain mismatch: the API prose allows scheduled-campaign editing while the write chokepoint accepts only drafts. Left for the newsletter ADR decision.
- Static `menuItemLinkAttrs` emits `_blank` without automatically adding `noopener noreferrer`, whereas navigation's `render-entry.ts` explicitly adds those tokens. Include this renderer drift in the `rel` decision and legacy-content tests.
- Older Jini DB-ops tests open native connections without closing them. New concurrency tests close their own handles; this lane did not broaden into rewriting all older DB test resource ownership. Existing in-memory capture mocks now remove the real exclusive reservations they cause.
- Startup architecture documents are absent at the clone's prescribed paths; canonical copies were used. Graph tools are unavailable. Neither absence was treated as evidence that the code or policy was missing.

## Files for coordinator commit

Only this lane's files are listed; concurrent admin, desktop, platform, agent-plugin and other workers' edits are excluded.

Tovu:

```text
apps/website/src/contracts/core/rate-limit/rate-limit.ts
apps/website/src/features/comments/index.ts
apps/website/src/features/comments/__tests__/index.test.ts
apps/website/src/features/fs-files/__tests__/asset-tool-fixture.ts
apps/website/src/features/site-backup/__tests__/import.fixture.ts
apps/website/src/server/inbound/public-http/middleware/__tests__/theme-static-assets-live-roster.unit.test.ts
apps/website/src/server/__tests__/resource-teardown.fixture.ts
apps/website/src/server/__tests__/resource-teardown.unit.test.ts
apps/website/src/server/__tests__/helper-teardown.unit.test.ts
apps/website/src/server/__tests__/helper-teardown.fixture.ts
apps/website/src/server/__tests__/helpers/unrun-site-boot.ts
apps/website/src/server/runtime/composition/app.ts
apps/website/src/server/runtime/composition/deps.ts
apps/website/src/server/runtime/composition/publish-content-seed-hash.ts
apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts
apps/website/src/server/runtime/composition/__tests__/publish-content-seed-hash.load-deps.unit.test.ts
apps/website/src/server/runtime/composition/__tests__/peer-site-reads.fixture.ts
development/scripts/test-safety-eslint.config.mjs
development/scripts/__tests__/test-safety-eslint.test.ts
ADS-memory/reports/bug-lane-d-runtime.md
```

Jini:

```text
packages/db/src/sqlite/db-ops.ts
packages/db/src/__tests__/sqlite/db-ops.test.ts
packages/http-kit/src/rate-limit.ts
packages/http-kit/src/__tests__/rate-limit.test.ts
```

Jini packages to rebuild: **@jini-ai/db, @jini-ai/http-kit**. No manifest/dependency/lockfile changes needed. No desktop, plugin-catalog, agent-plugin lifecycle/content, or packaging-script edits made. No new schema/migration, newsletter owner, rel-token policy, test runner, or teardown framework built.

Next assignee: Coordinator/TestRunner for independent red→green, package rebuild/link, regression commands, and the two ADR decisions.
