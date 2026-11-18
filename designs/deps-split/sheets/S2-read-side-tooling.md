# S2 — tools and tests that read `deps.ts` text learn `site-deps/` (no move yet)

Responsibility: source readers only, so S3-S13 never break them silently (lesson 45). Budget ≤70k. Commits: 2. Prerequisites: S1; COMMON §1-§4 (`DS_SHEET=S2`).

## Edits
- `development/scripts/check-capability-inventory.ts` (`DEPS_SOURCE`, line 20 on `b5fbf2a5`): read `deps.ts` plus every `.ts` under `composition/site-deps/` if the folder exists (sorted). Messages keep their text.
- `production-readiness-boot.integration.test.ts` (`COMPOSITION = compositionReferences(deps.ts, app.ts)`, line 168): `compositionReferences` is variadic and parses **each file separately** with `ts.createSourceFile` (140-175). Pass `deps.ts`, every `site-deps/**/*.ts` (sorted, as separate paths) and `app.ts` — never a concatenated text.
- `agent-daemon-import-graph.unit.test.ts`: the rule list is the `FORBIDDEN` regexes at **25-34** (unchanged on `b5fbf2a5`); add `/^server\/runtime\/composition\/site-deps\//` there, and add one example path `server/runtime/composition/site-deps/stages/foundation.ts` to the examples list of the test at **160-166** (forbidden) plus one non-forbidden neighbour (`server/runtime/composition/site-paths.ts`). Both places, one commit.
- `development/scripts/__tests__/dependency-cruiser.test.ts:29`: read what the list is for; if it lists composition roots, add the `site-deps/` prefix the same way; if it is a cruiser-output fixture, leave it and say so.

```bash
SHEET_TESTS=(
  development/scripts/__tests__/dependency-cruiser.test.ts
)   # the other two readers are in SR_TESTS
```

## Carries
| behaviour | pin |
|---|---|
| inventory finds capabilities wherever composition code lives | `check:inventory` **exits 0 even on findings** (`check-capability-inventory.ts:42-47`, report-only by design), so the proof reads its output: red first — pick one inventory entry whose name today appears only in `deps.ts`, cut that line into a throwaway `site-deps/zz-plant.ts` (unstaged): before the S2 edit the output loses its `check:inventory — OK` line and names the entry; after the edit the OK line is back; restore `deps.ts`, delete the plant |
| daemon must not import the site root's pieces | red first: the new example path fails before the regex is added |
| production-readiness keeps per-file AST parsing | the call passes ≥2 paths; red first with a plant file under `site-deps/` holding a wired hint |

## STOP (before the report commit)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
test ! -e "$D/site-deps/zz-plant.ts" || { echo "STOP-S2-PLANT-LEFT"; exit 1; }
npm run -s check:inventory > "$W/inv.txt" 2>&1
grep -qF 'check:inventory — OK' "$W/inv.txt" || { cat "$W/inv.txt"; echo "STOP-S2-INVENTORY"; exit 1; }
F=apps/website/src/server/inbound/assistant/__tests__/agent-daemon-import-graph.unit.test.ts
test -f "$F"
grep -nF 'composition\/site-deps\/' "$F" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S2-DAEMON-RULE"; exit 1; }
```
