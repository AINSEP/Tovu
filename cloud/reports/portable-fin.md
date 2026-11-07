# portable-fin, session 1

Branch `cloud/portable-fin` in Tovu and Jini, from `cloud/portable-r1` (Tovu `6a084b8db`, Jini `b747e4b8c`).
Session 1 only: P0, P1a, P1b, P2a, P2b, P2c, P3, P-C1. Start: 2026-11-07 17:02:16 UTC. Caps: 6 h, 1.6M final-context total.

## Recorded points

| Point | Tovu | Jini |
|---|---|---|
| Last integrated combine SHA | `b45d2ee75` | `32e9c9c21` |
| Behavior baseline | `efabd36b72fc1e1b667ebb3062e90f4f0a360e52` | `df9e0c83adc290612e1f0faf6f05a3d908dcda1c` |

`tool-metadata.baseline.json` sha256 at baseline: `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`.

P0 merge of `origin/cloud/combine` was clean in both repos: Tovu 10 commits, 29 files (merge `91e347f9c`); Jini 5 commits, 19 files (merge `8e9065e6d`; the plan measured 3 commits, 8 files before Jini moved).

## Batches

| Batch | Tovu SHA | Jini SHA | Gate | Final context |
|---|---|---|---|---|
| P0 | `37e3feadb`, `efabd36b7` | `df9e0c83a` | passed (Round 1 groups green except baseline `plugin-release-consistency`; Higgsfield grants byte-identical) | 115k |
| P1a | `6def6cdaa` | `fedca02d6`, `4ebd5d234` | **failed on one item**: `pnpm guard` exit 1 on `R2-deep-path` (`plugin-catalog/scripts/generate.ts`) and `R10-chatpane-public-surface` (`chat/.../ChatPane.tsx`), both files unchanged since the behavior baseline, so red at baseline, not from P1a. Not fixed (outside plan scope; no follow-up spent). Every other item passed: tests run with 44 `.todo`, layers unchanged 130/130, tsc exit 0, `guard:plugins` exit 0 | 225k |
| P1b | `682d34bac` | none | passed: golden green at baseline twice; description mutation and card-label mutation each red, reverted; metadata sha256 unchanged; tsc exit 0. Not captured by name: `agent_plugin_set_access_token` (not a registered tool at baseline; covered via `credential_save` kind `agent-plugin-token` and its card); credential and access-token cards rendered from form specs, not emitted live; §10 counters for skill reads, token lookup, trusted scans and mail not recorded | 205k |
| P2a | `2671b5553` | `52365d5b0` | passed: 3 deploy kinds off `.todo` (JSON + modules, 12 files); Jini parser tests 18/18; listed Tovu tests 167/168 + golden green, the 1 red (`no-vendor-in-core.boundary` › "real core tree has only reviewed pattern exceptions") is identical at pre-P2a HEAD `52407d262`; tsc clean both repos; layers 73/73, guard only the 2 baseline violations. Departures: 5 moved comment lines reworded (guard `N1-consumer-identity` forbids the product name), 5 Jini type names `Plugin`-prefixed to avoid clashes (Tovu re-exports old names) | 207k |

## Progress (every 30 min)

| UTC | Batch | Final-context tally | Reds |
|---|---|---|---|
| 17:10 | P0 merge done, P0 subagent next | coordinator only | none yet |
| 17:33 | P0, P1a done; P1b next | ~400k (P0 115k + P1a 225k + coordinator ~60k) | `pnpm guard` red at baseline (R2-deep-path, R10-chatpane-public-surface); Jini `plugin-release-consistency` baseline |
| 17:58 | P0-P2a done; P2b next | ~830k (subagents 752k + coordinator ~75k) | as above, plus Tovu `no-vendor-in-core.boundary` red before P2a |

## Bugs found

- **P0 / Higgsfield SKILL.md lost its history (regression from Jini `291a22004`).** Test: Tovu
  `bundled-higgsfield-media-package` > "SKILL.md forbids inventing a cause..." (`/invented/i`).
  Red: `raw/P0-higgsfield-red.txt`. Fix: Jini `df9e0c83a` restores, in neutral words, that an
  assistant once invented a wrong cause and two sessions were lost; the evidence sentences stay.
  Mutation ("once invented" -> "once made up") turns it red again: `raw/P0-higgsfield-mutations.txt`.
  Catalog digest for `skills/higgsfield-media/SKILL.md` regenerated in the same commit.
- **P0 / two stale assertions** (not a product bug): `plugins_set_enabled` and `media_generate_asset`
  moved to the overlay on purpose. Tovu `37e3feadb` retargets only those two assertions to
  `readHostGuidance()`. Mutating each name out of `GUIDANCE.md` turns its test red.

- **P1a:** no product bug found. Harness mutations (not bugs): pointing a search provider at a
  non-module turns `contribution-contracts` red; a support file importing `../../../index.js` turns
  `support-imports` red. Both reverted.

- **P1b:** no product bug found. Golden mutations (not bugs): provider_status description
  "status" -> "state" turns `moved-tools.golden` red on `tools`; sign-in card "Skip" -> "Skip for now"
  turns it red on `cards`. Both reverted. `raw/P1b-mutations.txt`.

- **P2a:** no product bug found.
- **P2b:** no product bug found.

## Errors by name

- P0: `AssertionError [ERR_ASSERTION]` x3 in `bundled-higgsfield-media-package` (before fix; fixed).
- P0 baseline, left alone: Jini `plugin-release-consistency` > "imports the release preparation path
  in Node without running a release": `SyntaxError: The requested module './scripts/publish-pending.ts'
  does not provide an export named 'preparePluginRelease'`.
- P1a: `pnpm guard` exits 1 with 2 violations, both in files untouched since the baseline
  (`git diff df9e0c83a -- packages/plugin-catalog packages/chat` is empty), so they came in with the
  P0 merge: `R2-deep-path` (`packages/plugin-catalog/scripts/generate.ts` imports
  `../../agent-plugins/src/core/identity-namespace.js`) and `R10-chatpane-public-surface`
  (`packages/chat/src/react/features/chat-pane/components/ChatPane.tsx` imports `Icon` outside the
  public barrel). Not fixed (outside P1a). `raw/p1a-guard.txt`.
- P1a: `TS5097` (`.ts` import paths) in server's build tsconfig for the neutral-host folder, fixed
  by excluding the folder there and type-checking it with `tsconfig.neutral-host.json` (nodenext).

- P1b, while writing the golden (test authoring, none in product code): esbuild `TransformError`
  (a paren slip in the new test); `VaultError` code `context` (fake sealed envelopes are refused by the
  in-memory MCP repo, so the counter now seals with the real AES-GCM sealer); `AssertionError
  [ERR_ASSERTION]` on symbol-keyed batch markers in input schemas (compared as serialized JSON now).

- P2a: guard `N1-consumer-identity` on `packages/devops/src/deploy/{config,target}-contracts.ts`
  (the product name in moved comments: "Tovu", a frozen `tovu-*` filename and a `TOVU_*` env name).
  Fixed by neutral wording in those comment lines only; guard back to the two baseline violations.
- P2a: Tovu `no-vendor-in-core.boundary.test.ts` test "real core tree has only reviewed pattern
  exceptions" `AssertionError [ERR_ASSERTION]` (60 unreviewed vendor counts outside the deploy
  files). Red before this batch: the same 60-line list on pre-P2a HEAD `52407d262`. Not fixed.

- **P2b:** `pnpm guard` shows only the two baseline violations (`R2-deep-path`, `R10-chatpane-public-surface`).
  Jini `tsc` TS2322 (`exactOptionalPropertyTypes`) on the moved object-store `descriptorMetadata` cast; fixed type-only
  (`NonNullable<...>`), no runtime change. Contract check for `form-destinations` blocked: `@jini-ai/cms` is not a
  dependency of `@jini-ai/server` (module not resolvable); adding it needs a lockfile edit. Left `.todo`.

## Coordinator decisions

- `pnpm guard` is red at the behavior baseline (2 violations above). Later batches' guard gates are reported as failed-at-baseline with the list of violations, so any new violation is visible by name. Fixing the two is left to the owner.

## Not done
