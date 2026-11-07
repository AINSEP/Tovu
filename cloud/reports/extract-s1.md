# Extract, session 1 (V0, V1, V1 review, V2, V3, Z2)

Branch `cloud/extract` in Tovu and Jini, from `origin/cloud/portable-fin` (Tovu `be968c727`, Jini `d3efaed69`).
Merge source for V1: `origin/cloud/more-jini-1` (Tovu `a0c60192c`, Jini `2364f89e7`). Base `origin/cloud/combine` (Tovu `b45d2ee75`, Jini `32e9c9c21`).
Started 2026-11-07 19:52:36 UTC. Caps: 4 h (23:52 UTC), 1.5M tokens (sum of final contexts), 6 batches + 1 follow-up.

## Progress (one line per 30 min)

| UTC | Batch | Token tally (k) | Reds |
|---|---|---|---|
| 19:52 | start, branches created | 0 | - |
| 21:19 | V3 done, Z2 starting | 989 (agents) + coordinator | none new (Tovu `tsconfig.tests.json` 12 errors already there) |
| 20:58 | V2 done, V3 starting | 680 (agents) + coordinator | `sign-in-card.unit.test.ts` 5x `AbortSignal.any` (already failing before V2) |
| 20:43 | review done, V2 starting | 508 (agents) + coordinator | none new |
| 20:37 | V1 done, review starting | 350 (agents) + coordinator | `plugin-host-bundled-identity` (already failing on the V0 tip) |
| 20:20 | V0 done, V1 starting | 206 (V0) + coordinator | none new (baseline: R2-deep-path, R10-chatpane-public-surface) |

## Batches

| Batch | Agent final context (k) | SHA(s) | Gate |
|---|---|---|---|
| V0 | 206 by harness count (agent's own estimate 125) | Jini `5309a136`, `7dd0dbbf`, `11ce1742`; Tovu `8495cabf`, `4d3548a5`, `49a7cee9` | passed |
| V1 | 144 by harness count (agent's own estimate 75) | Jini `0609ee49`; Tovu `9bf77fe7`, `ebcca09a`, `d4d9f85b` | passed except the review part (separate batch); 1 failing test, `plugin-host-bundled-identity`, fails the same way on the V0 tip |
| V1 review | 158 by harness count (agent's own estimate 95) | Tovu `9ef0a65d` | done: 0 blockers, 1 should-fix (R1), 6 minor |
| V2 | 172 by harness count (agent's own estimate 95) | Jini `bf3fbf58`, `39cf677f`; Tovu `f2888904` | passed: tripwire held (`SurfaceCardsPort<Resource>`, generic in the resource) |
| V3 | 309 by harness count, over the 300k ceiling (agent's own estimate 185) | Tovu `dc1169fa`, `99554bf3`, `76ce8f9e`, `3273072a`; Jini `3a8ede8d`, `8fe045ba` | passed: mutating row 1 turns it red, restoring turns it green |
| Z2 | | | not reached |

## V0

Undo of session 1's `server` work, neutral-host move and contract handlers, Commerce's `cms` peer, the search-tool description, and checkpoint P-C1. Raw output: `cloud/reports/raw/extract-s1/` (`setup.txt`, `V0-baseline-*.txt`, `V0-final-*.txt`, `V0-pc1-*.txt`, `V0-contract-mutations.txt`, `V0-search-description-tovu.txt`).

**Baseline by finding name** (unmodified Jini `d3efaed6`):
- `pnpm guard`: `R2-deep-path` (1: `plugin-catalog/scripts/generate.ts`), `R10-chatpane-public-surface` (1: `ChatPane.tsx` `Icon`). Hardwiring HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, all 0 new. R13 MF3 skipped for codex/agy (CLIs absent).
- Package layers: 0 findings. Subpath isolation: 0 failing (non-failing audit: `SI-c` 9, `SI-d` 7). `guard:plugins`: clean.
- The more-jini-1 names (`R8-package-metadata`, `SI-resolution`) are not on this branch; they arrive with V1.

**Commits**
- Jini `5309a136`: `server` undo (entries, six optional peers, `peerDependenciesMeta`, `optionalPeers` text, eight dev deps, `tsconfig.neutral-host.json`, tsconfig exclusion; `typecheck` restored). Contract test and `neutral-host/**` moved by `git mv` to private workspace `examples/neutral-host` (`@jini-example/neutral-host`). Three handlers added (`consent`, `form-destinations` with `formDestinationMissingMethods`, `login-providers`); `.todo` branch deleted; `pluginsDir` rebased. Changeset drops the server entries. Lockfile: Server and the new workspace.
- Jini `7dd0dbbf`: Commerce, one commit: `tools.ts` and `catalog-tools.ts` import from `@jini-ai/core` (`LegacyToolAuthorizeFn as AuthorizeFn`), `cms` peer, meta and `optionalPeers` text removed, changeset. Lockfile has no delta (pnpm does not lock workspace peers; the `cms` dev dep stays for two tests).
- Jini `11ce1742`: `search_agent_plugin_local` description takes host tool names from `messages.searchHostTools`; neutral without them. New unit test, red before and under mutation.
- Tovu `4d3548a5`: Tovu passes today's exact names through `AGENT_PLUGIN_HOST_TOOL_MESSAGES` (ports and catalog). Golden file unchanged and passing; a one-character mutation of the names turns it red.
- Tovu `8495cabf`: setup and baseline raw files.

**Gate**
- Contract test: no `.todo`; 28/28 files check. The three new checks pass, and each goes red under a mutation (consent schema, login `pkce`, form receiver without `pull`).
- `git diff origin/cloud/combine -- packages/server`: empty.
- Guard after V0 equals the baseline by name; layers 0, no `L3-undeclared-edge`; isolation unchanged; `guard:plugins` clean; `check-package-layers.test.ts` 73/73.
- Type checks: `server` typecheck, `agent-plugins`, `commerce`, `examples/neutral-host` `tsc` clean; Tovu `tsc --noEmit` clean.

**P-C1**
- Packed 15 packages (the closure of the neutral host's imports). Installed in a throwaway consumer; every session-1 entry imports with plain `node`. Four entries need `agent-plugins`' optional peers first: `agent-plugins/lifecycle`, `lifecycle/host-tools` and `lifecycle/tools` (`semver`, `@cfworker/json-schema`), and `search/contribution` (reaches `semver` through `agent-plugins`). Listed, not repaired.
- Neutral-host folder copied and run in the consumer: 16 passed, 16 todo. Strict `nodenext` `tsc`: clean with `skipLibCheck`; without it the only errors are in `vite`'s own types.
- Tovu on tarballs for one group (moved-tools golden + agent-plugin search integration): 19 pass, 1 skip (existing root-only skip). It first failed: Tovu's linked install never installs a linked package's own dependencies, so `user-management`'s `otplib` and `@simplewebauthn/*` were missing. Installed nested under that package for the run. Links restored after; consumer and tarballs deleted.

**Errors by name:** none new. Pre-existing: `R2-deep-path`, `R10-chatpane-public-surface`.

**Bugs:** `search_agent_plugin_local` named host tools in Jini (fixed, test first). No other.

**Not done / listed only**
- `neutral-host.test.ts` `.todo` headings still name `@jini-ai/server/agent-plugin-host` and `hosted-mcp` in comments (moved byte-exact; their home is a later batch's call).
- `.changeset/agent-plugin-host-entries.md` still says the host-tools entries are empty; they no longer are.
- Optional-peer reach of `agent-plugins/lifecycle/host-tools` and `search/contribution` (above).

## V1

Merge of `cloud/more-jini-1` onto the repaired V0 tree, both repos. Raw output: `cloud/reports/raw/extract-s1/V1-*.txt`.

**Merge commits** (`git merge --no-ff origin/cloud/more-jini-1`, no rebase, no squash)
- Jini `0609ee49`: merges `2364f89e7` (cms `core/commands`, db `data-modules`, two changesets). 21 paths.
- Tovu `9bf77fe7`: merges `a0c60192c` (13 old paths become re-export shims, plus `cloud/reports/more-jini-1.md`). 14 paths.
- Conflicts: none in either repo. The merge's paths and V0's paths do not overlap (checked with `git diff --name-only` against the merge base before merging). No lockfile change on either side, so no regeneration was needed.
- V0's work stands: `git diff origin/cloud/combine -- packages/server scripts/check-package-layers.ts` is empty; `examples/neutral-host` present; Commerce keeps `cms` only as a dev dependency; search description fix untouched.
- `data-modules` trap: comments (`features/comments/types.ts`) and newsletter (`features/newsletter/data-module-manifest.ts`) still declare `publisher: "tovu-core"`; no diff in either folder from the V0 tip.

**Gate (§8)**
- `cms`, `db` `tsc --noEmit`: pass. `cms`, `db` build: pass (`V1-tsc-build.txt`). Tovu `tsc --noEmit`: pass (`V1-tovu-tsc.txt`).
- Jini targeted tests (`V1-jini-vitest.txt`): cms commands 3 files, 26/26; db `public-entry` 2/2 (SQLite, PGlite); db `public-entry.postgres` 1/1 on a disposable local Postgres 16.
- 30 module files (`V1-tovu-modules30.txt`): 561/561 pass, 28 suites, 0 fail/skip. Same count as the more-jini-1 report.
- 79 importer files (`V1-tovu-importers79.txt`): 920 tests, 919 pass, 1 fail: `plugin-host-bundled-identity` (below). Not caused by the merge: the same test fails the same way on the V0 tip (`V1-v0-tip-plugin-host.txt`, temporary worktree, removed). The more-jini-1 run passed it because its base (combine) predates Jini `291a2200`, which moved bundled manifests to `extensions.jini`.
- Layers: 0 findings (V0: 0). Isolation: 0 failing; audit `SI-c` 9, `SI-d` 7 (V0: same). `guard:plugins`: clean (V0: clean).
- `pnpm guard`: `R2-deep-path` (1), `R10-chatpane-public-surface` (1); HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, all 0 new. Equal to V0's record by name and count.
- Reviewer's report: separate agent, after this batch.

**Findings vs the more-jini-1 report**
- `R10-chatpane-public-surface`: present there and here.
- `R8-package-metadata` (6): did not arrive. Its six `packages/plugin-*` directories are not in either branch's tree; they were untracked leftovers on that machine.
- `SI-resolution` (7): did not arrive. It names `cloudflare/lib/cms-forms.mjs` and `cloudflare/worker/portable-validation.mjs`, which are gitignored build products of `agent-plugins`; that run's `agent-plugins` build failed (missing `esbuild`), so they were absent there. Here they are built.
- `R2-deep-path`: in V0's record, not in that report (its base is older); unchanged.
- Its MF3 skips (codex, agy absent; pi, aider, opencode inapplicable): same here.

**Errors by name:** `plugin-host-bundled-identity` (pre-existing on V0 tip, not repaired). Setup only: the first Postgres attempt in the scratch folder lost its data directory to a permission reset mid-run, failing the three Postgres files with connection refused; restarted under the `postgres` home and the full list was rerun green. No other error.

**Bugs** (logged in `development/open-bugs.md`, not fixed): `L079-force-without-principal-kind`, `L079-partial-inverse-failure` (both pinned by L079 in `revert.unit.test.ts`), `snapshot-stale-header` (Jini `db/data-modules/snapshot.ts`, kept byte-exact), and `plugin-host-bundled-identity` (pre-existing failure). No new bug from the merge, so nothing was fixed.

**Not done / listed only**
- `plugin-host-bundled-identity` is not repaired: Tovu tests stay unedited, and whether the bundled Jini manifests or the test's namespace is right is a call for a later batch.
- Node tests ran with `--test-concurrency=1` (the more-jini-1 report used 2), so durations differ from that report.
- Integrated review (public entries, shims, persisted names) is the reviewer's job, not done here.

## V1 review

Reviewer: separate agent, read-only. Reviewed `git diff 0609ee49^1 0609ee49` (Jini) and `git diff 9bf77fe7^1 9bf77fe7` (Tovu), with the moved files diffed line by line against their pre-merge Tovu versions (`9bf77fe7^1`). Checks run: entry resolution from Tovu (`@jini-ai/cms/core/commands`, `@jini-ai/db/data-modules` import under plain `node`; `executeCommand` is the same object through `/core` and `/core/commands`), `eslint` on both moved Jini folders (clean), and the bundled identity reader on three Jini manifests (below). No suite was run; the V1 gate's raw files stand.

**What holds**
- Public entries: `@jini-ai/cms/core/commands` sits in the `core` domain (first export segment, no override needed) with `jini.entries` `universal`; it imports only `@jini-ai/core` and `@jini-ai/core/primitives` plus its own domain. `@jini-ai/db/data-modules` is the `data-modules` domain of a `node`-runtime package; it reaches only `../kernel/index.js`, already in `isolation.shared`; no new `shared` or `entries` lines. `typesVersions` updated. No `@jini-ai/server` change, no new package, no cross-domain capability import.
- Moved code: byte-identical to the old Tovu files apart from import paths, the `(required, optional)` signature conversion, two type-only edits (`recoveryPoint?: string | undefined`, `ReadonlySet`), one removed lint disable, and the cast in R3. No logic change.
- Shims: every name the 13 old Tovu files exported is still exported from the same path with the old positional signature; each adapter is one line (`f(x) => g({ x })`). Old `features/plugins/index.ts` narrow surface (`declareDataModule`, `ColumnDecl`, `ColumnType`, `DataModuleDecl`, `DataModuleStore`) is kept exactly.
- Persisted names: `_plugin_migration_journal`, `_plugin_identity`, `_plugin_migrations`, their columns, the `p_${pluginId}__${name}` prefix and the `plugin-identity:${pluginId}` lock key are unchanged text. `publisher: "tovu-core"` stays host-owned in comments, newsletter, `lipay` and `store` manifests; nothing in Jini supplies or defaults a publisher. No product name in the moved Jini source.
- Kernel identity (§6 row 2): `pluginKernel` is still an identity cast, the shims return the same object, and Jini's internal `../kernel/index.js` is the same `dist/kernel/index.js` module Tovu already loads through `@jini-ai/db/kernel`, so the kernel's `AsyncLocalStorage` scope and owned-transaction `WeakMap` stay single instances. Row 3 (repo identity in hooks) is not touched by this code.

**Findings**

- **R1, should-fix.** Jini `packages/db/src/data-modules/data-module.ts:910` (`declareDataModule`), `plugin-identity.ts:28` (`PluginProvenance`), `migration-recovery.ts:41` (`recoverIncompleteDataModuleMigrations`). No `@agent-note` on the new public contracts, and each carries a fact the types cannot say. (a) Saved format: `provenance.sourceUrl` and `publisher` are compared byte for byte with the row minted in `_plugin_identity` at first declare. (b) Same instance: `dbPath` must name the SQLite file behind `db`. (c) Ordering: recovery runs right after open, before anything reads the database, and `restoreSnapshots` must close the connection under `store` first. Failure scenario: a second host wires `declareDataModule` with `dbPath: ":memory:"` (or another path) for a file-backed SQLite kernel. `recoverable` turns false, so the pre-DDL snapshot, the journal and the headroom check are all skipped with no error, and the recovery point is lost. Or the host renames its publisher during an upgrade, and every existing plugin's declare is refused as `consent-required`. Smallest fix: one doc comment with an `@agent-note` tag on each of the three, in neutral words (guard N1).
- **R2, minor.** Jini `packages/db/src/data-modules/index.ts:1-8`. The header was copied from Tovu's narrow `features/plugins/index.ts`. It says the barrel exports only the declaration contract and "does not re-export" `migration-recovery.ts`, and it names host folders (`lipay/`, `store/`). The barrel now re-exports all nine modules, recovery included. Scenario: an agent believes the header and goes looking for recovery elsewhere. Fix: rewrite the header to describe the entry as it is.
- **R3, minor.** Jini `packages/cms/src/core/commands/revert.ts:174-183`. The `change-set.reverted` event changed from a checked `const event: DomainEvent<…> = {…}` to `{…} as DomainEvent<…>`. The cast hides the `exactOptionalPropertyTypes` mismatch on `actorId`, and from now on it will also hide any change to the event's shape. Runtime is unchanged. Fix: keep the annotation and spread `actorId` only when it is defined, once someone confirms that no consumer compares an own `actorId: undefined` key.
- **R4, minor.** Tovu `apps/website/src/contracts/core/commands/revert.ts:1`. The shim is `export * from "@jini-ai/cms/core/commands"`, so this path now also exports Jini's two-argument `createRevertRegistry`, `InMemoryChangeSetRepo` and the whole `cms/core` barrel. The old file exported only the revert names. No current importer breaks. Fix: re-export the revert names explicitly.
- **R5, minor.** Jini `packages/cms/src/core/commands/index.ts:8`. `export * from "../index.js"` makes `/core/commands` a superset of `/core`, which gives the same symbols two public entries. It exists to keep Tovu's old `export * from "@jini-ai/cms/core"` names, and the Tovu shim could do that itself. No runtime duplication, because both entries load the same modules.
- **R6, minor.** Docs: the db and cms READMEs and the root `CAPABILITIES.md` do not mention `@jini-ai/db/data-modules` or `@jini-ai/cms/core/commands`, so an index-first search will not find them.
- **R7, minor.** Jini `packages/db/src/data-modules/__tests__/public-entry.postgres.test.ts:10-12`. The test defaults `PGUSER` to a machine-specific `"agent"` and recreates and drops a fixed database name, so two concurrent runs against the same server collide. It is excluded from the default config (`vitest.config.ts`), so normal runs are unaffected.

**`plugin-host-bundled-identity` (pre-existing failure; not a V1 finding, not fixed)**
- Cause: Jini `291a2200` ("make bundled agent plugin metadata portable") moved bundled agent manifests from `extensions.tovu` to `extensions.jini`. It kept the publisher ids (`jini/charts-recharts-agent`, …) and kept reading of legacy `extensions.tovu` manifests through `readAgentPluginPortableExtension`. The Tovu test (`server/runtime/composition/__tests__/plugin-host.integration.test.ts:201`) reads the raw `plugin.json` with `readPluginIdentity({ namespace: 'tovu' })`. That call skips the portable reader, finds no `extensions.tovu`, and falls back to `unknown/<name>`.
- Which side is wrong: the test, which is out of date. Production's default path (`plugin-host.ts:68`, `readInstalledAgentPluginIdentity` from `@jini-ai/agent-plugins/lifecycle/host-tools`) uses the portable reader. Run here on the bundled `charts-recharts`, `formspree` and `commerce` manifests, it returns `jini/charts-recharts-agent`, `jini/formspree-agent` and `jini/commerce` with no warnings, which is exactly what the test expects.
- When: before this branch. `291a2200` is in the V0 tip's history and not in `cloud/more-jini-1` (`2364f89e7`), which matches the V1 report's V0-tip reproduction.
- Related latent item: `plugin-host.ts:67` (the test-only `readAgentManifest` option) also reads agent manifests with `namespace: 'tovu'` only, so any host that supplies that option would see `unknown/…` for Jini-published plugins. Fixing the test is a later batch's call: a Tovu test edit is involved, and the cause is outside V1.

**Recommended for this session's follow-up fix agent:** R1 only. It is the one should-fix, and it is in scope because V1 introduced these public contracts. There are no blockers. R2-R7 are listed and not for fixing this session.

## V2

Cards contract and drift pin, Jini only. Raw output: `cloud/reports/raw/extract-s1/V2-*.txt`.

**Result: TRIPWIRE HELD.** `satisfies` holds over the generics with no builder signature changed, no `any`, no cast, no `core → ui` import.

**Commits (Jini, `cloud/extract`)**
- `bf3fbf58` feat(core,ui): `packages/core/src/surface-cards.ts` (types only), `export type *` in core's root barrel (the established pattern: `surface-exchanges.js` sits there too, no subpath), `packages/ui/src/features/mcp-ui/cards.ts`, new subpath `@jini-ai/ui/mcp-ui/cards` (`jini.entries` `universal`, same as `secret-card`/`sign-in-card`), `integration-exports.test.ts` universal list updated.
- `39cf677f` docs: root `README.md` `@agent-note` section (the §3 sentence verbatim), changesets `surface-cards-port.md` (core) and `mcp-ui-cards-entry.md` (ui), `cards.unit.test.ts`.
- No lockfile change. No Tovu code change.

**Design point to review: the resource is a type parameter.** The port is `SurfaceCardsPort<Resource = unknown>` and the pin is `satisfies SurfaceCardsPort<UIResource>`. Reason: `waitAtSignInCard` takes `card: (state) => UIResource`, a resource in a parameter position, so under strict variance a fixed opaque core type would have to be assignable to `UIResource`, which an opaque type cannot be. A type parameter keeps it opaque to callers and exact for the pin. Consequence for later batches: a consumer that calls `waitAtSignInCard` is generic in `Resource`; one that only builds can take `Omit<SurfaceCardsPort, 'waitAtSignInCard'>` (proved assignable from packed types). Members are property-typed, not method-typed, so parameters are checked contravariantly (method syntax would be bivariant and miss an added required input).

**Tripwire evidence (`V2-tripwire.txt`)**: green (core and ui `tsc --noEmit` exit 0), then five independent mutations, each restored from a byte copy before the next, each red at the pin `cards.ts(10,…)` with TS2322:
- M1 port `submitLabel` optional; M2 port extra field kind `tags`; M3 port drops `Result extends { status: string }`;
- M4 ui `SignInCardSpec` gains required `region`; M5 ui `waitAtSignInCard` narrows its `Result` constraint.
- After restore: files byte-identical (`diff` + `git diff --quiet`), ui `tsc` exit 0.

**Packed `.d.ts` (`V2-pack.txt`)**: no `removeComments` in `tsconfig.base.json` or any `packages/*/tsconfig*.json`. Packed `@jini-ai/core` `dist/surface-cards.d.ts` keeps all four `@agent-note` comments; packed root `index.d.ts` has `export type * from './surface-cards.js'`; packed ui has `./mcp-ui/cards`, no `workspace:` specifiers. Plain `node` import in a throwaway consumer: `mcpUiCards` has the five functions, `buildOutcomeSurface` returns a `resource`. Consumer strict `nodenext` `tsc` assigning `mcpUiCards` to `SurfaceCardsPort<UIResource>` and to the `Omit<…, 'waitAtSignInCard'>` form: exit 0. Throwaway dirs deleted.

**Guard (`V2-final-*.txt`)**: `@agent-note` accepted, no `scripts/check-*` rejects it (none mentions the tag). `pnpm guard`: `R2-deep-path` (1), `R10-chatpane-public-surface` (1), plus the informational `R13-model-fallback-freshness` lines (6, same as V0 and V1 raw); HW1 17, HW2 16, HW3 135, HW4 1, HW8 49, all 0 new. Output identical to `V1-final-guard.txt` apart from timings. Layers: 0. Isolation: 0 failing; audit `SI-c` 9, `SI-d` 7. `guard:plugins`: clean. Equal to the V0/V1 record by name.

**Tests (`V2-final-tsc-tests.txt`)**: core and ui `tsc --noEmit` pass at `39cf677f`. `cards.unit` 1/1, `integration-exports` 1/1, `secret-card.unit` pass.

**Errors by name, not V2's**
- `sign-in-card.unit.test.ts`, 5 failing: `TypeError: AbortSignal.any is not a function` under ui's `jsdom` test environment. Source, test and vitest config unchanged since `0609ee49`; pre-existing. Not fixed (out of scope).
- Consumer `tsc` with `skipLibCheck: false`: `TS2307` in packed `@jini-ai/agentic` `dist/core/gen-ui/encoder.d.ts`, `@jini-ai/protocol` not installed with ui's tarball. Packaging observation for the packed-proof batch; not V2.

**Not done (by design):** no consumer wired to the port (connect, credentials, CMS are later batches). No Tovu change.

## V3

Tests only; no production line changed in either repo (moved lines: 0). Raw output: `cloud/reports/raw/extract-s1/V3-*.txt` (`V3-gate-mutation.txt`, `V3-p1b-access-token.txt`, `V3-counters.txt`, `V3-neutral-host.txt`, `V3-tovu-tsc-tests.txt`).

**Gate: PASSED (mutate one pair: red, revert byte-exact: green).** New `apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts` builds the real SQLite composition once (`initSite` + `bootSiteDir` + `createSiteRouteDeps`, the same boot `sqlite-create-site-app-module-identity.integration.test.ts` uses) and `createApp` over it. Mutation: `app.ts` hands the answer route a second `createSurfaceExchangeStore(...)` instead of `byokAssistantModule.toolSurface.surfaceExchanges`; row 1 red (`503 !== 202`, the route no longer finds the card), the other five green; `app.ts` restored from a byte copy (`sha256sum -c` OK, `git diff --quiet`), 6/6 green.

**§6 rows**
| Row | Covered here | Behavior proof |
|---|---|---|
| 1 SurfaceExchangeStore | `===` (the route's `deliver` receiver is `toolSurface.surfaceExchanges`) | same test: an answer POSTed to the MCP-UI route wakes the call waiting on the card. The surface is built with the production factory and passed through `createApp`'s `assistantToolSurface` seam (the default path builds it where no test can read it) |
| 2 one kernel | `deps.contentKernel === store.content === kernel of settingsRepo, entryRepo, menuRepo, formDeliveryStatus` (protected field read, test-only) | rollback of rows + outbox: waits for the `<domain>/sql` bindings (S lane) |
| 3 repo identity in hook cache | not yet: `onWritten({ owner })` and the repo-keyed WeakMap do not exist in Tovu | S lane (S8) |
| 4 external-mcp-vault | both import forms (`#src/...` and relative) are one module namespace; an envelope made by one is read by the other | P8g fixture and packed run: H0 / packed-proof batch |
| 5 API connection host | `agentPluginTools.connections === apiConnections.host.toolConnections`, tool projection's surface host `=== deps.adminSurfaceHost`, host unchanged across two more `createApp` | existing `agent-plugin-connections.vertical-slice.test.ts` (callback completes a tool-started sign-in) |
| 6 issuedTokens / frozen | tool side present and per site (unchanged across `createApp`); admin-surface side is inside `createAgentPluginAdminSurfaceHandlers`' closure, no public read (not exposed: no production change) | existing vertical-slice tests: "one token memory across seams" x2, "ONE frozen-account map" |
| 7 activation queue | grep gate: no file outside the 11 baseline files builds a lifecycle owner or activation queue | finding below |
| 8 error class identity | not yet (no shim exists) | H lane, packed |
| 9-13 | not yet | goldens G-cred (C1), G-mail (P5m), connect goldens (A10-11), G-theme (T1), G-post/G-news (T2/T3) |

**P1b gaps.** `agent_plugin_set_access_token` is no longer a tool id; it runs as `credential_save` kind `agent-plugin-token` (adapter `agentPluginToken`). New separate golden `assistant/__tests__/moved-tools.access-token.golden.test.ts` + `fixtures/moved-tools.access-token.golden.json`, recorded once from unmoved code, stable across two runs: five refusal texts (each with 0 cards, 0 probes, 0 open exchanges), the card the real tool emits from its form spec, outcome cards and results for saved / 401 / 503 / dismissed, and per-save counters (2 cards, 1 probe GET; dismissed: 1 card, 0 probes). `moved-tools.golden.json` and its test untouched. Real-tool renders of the other form-spec cards (`credential` via `pluginProvider`, `accessTokenWithCredentialCard`) are not added; listed.

**Counter baseline** (`server/runtime/composition/__tests__/cost-counters.baseline.test.ts` + `fixtures/cost-counters.baseline.json`):
- Skill tool call: overview = 2 file opens (`SKILL.md` and every supporting file, read to filter the file list), 4 directory listings, 236 bytes; one supporting file = 2 opens (the file twice), 4 listings, 172 bytes; other skill = 1 open, 3 listings, 105 bytes. Each read allocates a 256 KiB + 1 buffer. Not "one bounded file" per call: candidate for a later plan.
- Token lookup (`getAccessToken`, connected acme fixture): 1 contribution load (`tovu-connections.json`) and 4 credential opens per call, same on repeat. Contribution loads are counted as parses of the file's exact text, because the loader's `readFile` is bound at lifecycle construction and no file-system spy sees it.
- Mail send (resolver level): first and cached send = 1 settings read, 1 credential list of 2 rows, 0 catalog loads, 0 opens; after `invalidate` = 1 settings read, 3 lists (6 rows), 1 catalog load, 1 credential open; unconfigured lane = 1 settings read and 1 catalog load on every send. Per-recipient ledger calls (test-mode read, reserve/mark, suppression, activity) are not counted here: G-mail (P5m).

**Neutral host (Jini `examples/neutral-host`).** The three dispatcher `.todo`s are real tests with test-only tools on public exports (`@jini-ai/core` registry, `@jini-ai/daemon/surface-exchanges` store and `askOnce`): one human card (1 card, answered, 1 effect, store empty), ordinary write approval (1 confirmation, runs once; deny leaves no effect), cancelling a call waiting on a person (`cancelled`, no effect, store empty). Each red under a dispatcher-support mutation (no abort on prompt: timeout; confirm always: `completed` not `confirmation-denied`), restored. 15 passed, 13 todo (was 12 / 16); `tsc` clean. Remaining `.todo`s, each for the moved class's batch: provider status (A1), mail (A2, P5m), credential save (C lane), connect (A10-11), access token (A4), provisioning (A8-9), API connection host (A lane), connect orchestration (A10-11), executable-tool host (A5-6), MCP store (H1b), MCP sign-in (H2), revocation (H lane), vault plugin-state writes (A5-6).

**Changesets (Jini):** `.changeset/core-text-descriptor-i18n.md` (`@jini-ai/core` patch, `parseDescriptorI18n`) and `.changeset/devops-deploy-contribution-contracts.md` (`@jini-ai/devops` patch, deploy contracts from `52365d5b`). `changeset status` lists core and devops under major together with other packages; that comes from the repo's existing peer-bump config and earlier changesets, not from these patch entries. Observation only.

**Commits.** Tovu `dc1169fa` (gate), `99554bf3` (P1b access-token golden), `76ce8f9e` (counters), plus this report commit. Jini `3a8ede8d` (neutral host), `8fe045ba` (changesets).

**Type checks.** Tovu `tsc -p tsconfig.json`: exit 0. Tovu `tsc -p tsconfig.tests.json`: 12 errors, none in V3 files (pre-existing, files V3 did not touch: `external-mcp-connection-source.operator-read-only.test.ts` TS2551 `tovuDefaultTools`; `import-local.integration.test.ts` TS18047 x8; `set-enabled-confirmation-ui.unit.test.ts` TS2353 `scope`; `site-imports.integration.test.ts` TS2741 `tidy`; `agent-plugin-token-boot-order.unit.test.ts` TS2561 `tovuAuthMode`). Neutral host `tsc`: clean.

**Findings, not bugs**
- Row 7 premise: 11 Tovu files build an agent-plugin lifecycle owner, each with its own in-process activation queue (Jini keys the queue by the ports object). Writes from different owners in one process are serialized only by the activations file lock (`lockedActivationsWrite`), as for two processes. No lost write found; the gate stops the count from growing.
- Token lookup opens 4 credentials per call, where the plan's §10 row expects one per BYO connection; recorded as the baseline, not changed.

**Bugs:** none new.

**Not done:** row 6 admin-side `===` (needs a production read); rows 3 and 8-13 (their code or goldens come later); real-tool renders of the `credential` form cards; per-recipient mail ledger counters (P5m).
