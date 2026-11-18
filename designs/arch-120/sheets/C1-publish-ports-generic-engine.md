# Sheet C1 — the publish-content engine is generic over its host bag; contributors own their slices

Executor: one agent, unattended. Budget ≤ 250k context, ≤ 180 tool calls, 150 min. Branch `refactor/arch-120-c1` from a `$BASE` that contains R1 and `wave3/moves-b1`. Design: REVISION-2 §4, rows N068–N078 (11 upward type edges out of `features/publish-content`, rank 1).
Owner rules: same as R1. The package states a contract and the host wires it. No package above domains. No shells or forwarders: `tovu-publish-ports.ts` is deleted, not left re-exporting.

## 1. Prerequisites (each STOPs)

```bash
set -euo pipefail
F=apps/website/src/features
grep -q 'feature-ranks' development/scripts/check-architecture.ts || { echo "STOP P1: R1 not in base"; exit 1; }
git merge-base --is-ancestor origin/wave3/moves-b1 HEAD || { echo "STOP P2: wave3/moves-b1 is not merged (it edits tovu-publish-ports.ts)"; exit 1; }
test -f $F/publish-content/tovu-publish-ports.ts || { echo "STOP P3: tovu-publish-ports.ts gone"; exit 1; }
test -f apps/website/src/server/runtime/composition/content-publish-ports.ts || { echo "STOP P4: composition bag file gone"; exit 1; }
git grep -l 'tovu-publish-ports' -- 'apps/website/src/**/*.ts' ':!**/__tests__/**' | sort > "$RUN/c1-importers"
wc -l < "$RUN/c1-importers"   # 19 files on b5fbf2a5e (2 of them mention it only in comments)
```

Run Setup and Gate block G for the base. `$RUN/base/architecture.new` holds the 11 C1 lines.

## 2. Characterization (green on base)

```bash
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks \
  "apps/website/src/features/publish-content/**/*.test.ts" "apps/website/src/features/*/__tests__/**/publish-content*.test.ts" \
  "apps/website/src/server/inbound/admin-http/routes/publish-content/**/*.test.ts" "apps/website/src/server/runtime/composition/__tests__/wiring-identity.test.ts" > "$RUN/char.log" 2>&1
```

It must exit 0 (STOP C1 otherwise). Record the pass count; it may only grow.

## 3. Shape of the change

- **Each contributor owns its slice.** In each contributor's own `publish-content.ts`, which is already exposed: content-types, entries, media, navigation, post, taxonomy, theme, settings, forms, widgets. Declare `export type <X>PublishPorts = { … }` with exactly the ports that file reads from today's bag. Taxonomy's `TaxonomyPublishPorts`, entries' `EntryPublishPorts` and widgets' `WidgetPublishPorts` move home under their current names.
- **The engine is generic.** `publish-content/type-registry.ts`, `apply-port.ts`, `tool-deps.ts` and `tool-registrations.ts` take a type parameter `P` for the host bag wherever they named `TovuPublishPorts`. They name only the `@jini-ai/cms/*` contract types they already import. `peer-transport.ts` and `tool-deps.ts`/`tool-registrations.ts` (`PublishHistoryStore`, `PublishTrigger` from `deployments/static-publish`) and `push-plan.ts` (`PostRecord`) get consumer-owned port shapes in the same file, as in sheet P1.
- **The host assembles.** `server/runtime/composition/content-publish-ports.ts` defines `TovuPublishPorts` as the intersection of the contributor slices and instantiates the engine with it. `server/inbound/admin-http/routes/publish-content/deps.ts` imports it from there (composition may import features; the reverse is forbidden by `feature-no-server-or-framework-imports`).
- Delete `publish-content/tovu-publish-ports.ts`. Move its header why-comment to `content-publish-ports.ts`.

## 4. Steps, one commit each (red test, then change, then Gate block G)

1. Red: `server/runtime/composition/__tests__/content-publish-ports.types.unit.test.ts` asserts with a type assignment that `TovuPublishPorts` from the composition file is assignable to each contributor slice. `npm run typecheck:tests` must exit non-zero, naming the missing export. Then introduce the slices and the composition bag; for this commit only, the old file stays in place and unchanged.
2. Make the 4 engine files generic and repoint every contributor importer in `$RUN/c1-importers` to its own slice. Delete `tovu-publish-ports.ts`. `git grep tovu-publish-ports -- 'apps/website/src/**/*.ts'` must print only comments, or nothing.
3. Give `peer-transport.ts`, `push-plan.ts`, `tool-deps.ts` and `tool-registrations.ts` consumer-owned shapes for `PublishHistoryStore`, `PublishTrigger` and `PostRecord`.

After each step, re-run step 2's command (exit 0, pass count not lower) and Gate block G. After step 3, `architecture.new` has lost all 11 C1 lines, and G4 and G6 hold: no new warning, no API-surface rise. If removing the 11 edges needs a new exposed file anywhere, STOP S1 and report the file. The design allows moves only into already-exposed files.

## 5. Finish

`git pull --rebase`, re-run G, push. Report the SHAs and the before/after counts. If `wave2/publish-p0-rest` (publish-engine lane) has unmerged edits to any file in `$RUN/c1-importers` when you start, STOP L1 and report: that lane owns the engine and must sequence with this sheet.
