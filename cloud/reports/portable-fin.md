# portable-fin, session 1

Branch `cloud/portable-fin` in Tovu and Jini, from `cloud/portable-r1` (Tovu `6a084b8db`, Jini `b747e4b8c`).
Session 1 only: P0, P1a, P1b, P2a, P2b, P2c, P3, P-C1. Start: 2026-11-07 17:02:16 UTC. Caps: 6 h, 1.6M final-context total.

## Recorded points

| Point | Tovu | Jini |
|---|---|---|
| Last integrated combine SHA | `b45d2ee75` | `32e9c9c21` |
| Behavior baseline | (end of P0) | (end of P0) |

P0 merge of `origin/cloud/combine` was clean in both repos: Tovu 10 commits, 29 files (merge `91e347f9c`); Jini 5 commits, 19 files (merge `8e9065e6d`; the plan measured 3 commits, 8 files before Jini moved).

## Batches

| Batch | Tovu SHA | Jini SHA | Gate | Final context |
|---|---|---|---|---|

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

## Errors by name

- P0: `AssertionError [ERR_ASSERTION]` x3 in `bundled-higgsfield-media-package` (before fix; fixed).
- P0 baseline, left alone: Jini `plugin-release-consistency` > "imports the release preparation path
  in Node without running a release": `SyntaxError: The requested module './scripts/publish-pending.ts'
  does not provide an export named 'preparePluginRelease'`.

## Not done
