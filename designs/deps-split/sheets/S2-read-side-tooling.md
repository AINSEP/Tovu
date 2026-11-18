# S2 — tools and tests that read `deps.ts` text learn `site-deps/` (no move yet)

Responsibility: source readers only, so S3-S13 never break them silently (lesson 45). Budget ≤70k. Commits: 2. Prerequisites: S1; COMMON §1-§3 (`DS_SHEET=S2`).

## Edits
- `development/scripts/check-capability-inventory.ts` (`DEPS_SOURCE`, lines 19-20 at `f0613d9e`): read `deps.ts` plus every `.ts` under `composition/site-deps/` if the folder exists (sorted). Messages keep their text.
- `production-readiness-boot.integration.test.ts` (`COMPOSITION = compositionReferences(deps.ts, app.ts)`, line 168): `compositionReferences` is variadic and parses **each file separately** with `ts.createSourceFile` (140-175). Pass `deps.ts`, every `site-deps/**/*.ts` (sorted, as separate paths) and `app.ts` — never a concatenated text.
- `agent-daemon-import-graph.unit.test.ts`: the rule list is the `FORBIDDEN` regexes at **25-34**; add `/^server\/runtime\/composition\/site-deps\//` there, and add one example path `server/runtime/composition/site-deps/stages/foundation.ts` to the examples list of the test at **160-166** (forbidden) plus one non-forbidden neighbour (`server/runtime/composition/site-paths.ts`). Both places, one commit.
- `development/scripts/__tests__/dependency-cruiser.test.ts:29`: read what the list is for; if it lists composition roots, add the `site-deps/` prefix the same way; if it is a cruiser-output fixture, leave it and say so.

## Carries
| behaviour | pin |
|---|---|
| inventory finds capabilities wherever composition code lives | red first: throwaway `site-deps/zz-plant.ts` with a capability name only it mentions → `npm run check:inventory` changes as expected; plant removed (`gates.sh absent`) |
| daemon must not import the site root's pieces | red first: the new example path fails before the regex is added |
| production-readiness keeps per-file AST parsing | the call passes ≥2 paths; red first with a plant file under `site-deps/` holding a wired hint |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"
npm run check:inventory   # its own exit status decides
$G absent S2-PLANT-LEFT apps/website/src/server/runtime/composition/site-deps/zz-plant.ts
$G expect-count S2-DAEMON-RULE 1 'composition\\/site-deps' apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts
```
Gates: COMMON §5.
