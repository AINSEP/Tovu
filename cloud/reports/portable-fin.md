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
| P0 | `37e3feadb`, `efabd36b7` | `df9e0c83a` | passed (Round 1 groups green except baseline `plugin-release-consistency`; Higgsfield grants byte-identical) | ~60k |

## Progress (every 30 min)

| UTC | Batch | Final-context tally | Reds |
|---|---|---|---|
| 17:10 | P0 merge done, P0 subagent next | coordinator only | none yet |

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

## Not done
