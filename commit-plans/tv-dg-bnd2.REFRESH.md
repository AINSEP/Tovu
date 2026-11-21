# Refresh notes

## DG2-01

- Coordinator-ruling importer inspected: `apps/website/src/cli/commands/init.ts:4` already imports `../../platform/site-dir/errors.js`. Declaring the entry requires no repoint or behavior change; no forced edit.
- Coordinator-ruling importer inspected: `apps/website/src/server/runtime/composition/move-site-storage.ts:11` already imports `#src/platform/site-dir/errors`. Declaring the entry requires no repoint or behavior change; no forced edit.
- Additional test importer, unchanged: `apps/website/src/cli/__tests__/integration/init-agent-plugin-tokens.integration.test.ts:8` imports site-dir errors.
- Additional test importer, unchanged: `apps/website/src/cli/__tests__/integration/init-storage.integration.test.ts:10` imports site-dir errors.
- Additional test importer, unchanged: `apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts:16` imports site-dir errors.
- Additional test importer, unchanged: `apps/website/src/server/runtime/boot/__tests__/content-db-schema-guard.unit.test.ts:11` imports site-dir errors.
- Additional test importer, unchanged: `apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts:18` imports site-dir errors.
- Additional test importer, unchanged: `development/e2e/journeys/visitor-page-tools.journey.ts:9` imports visitor publication.
- Theme-local readers, barrel exports, and direct tests of the five static leaves remain unchanged. DG2-06's existing production repoints match the named leaves; no further production importer found by the targeted entry-path lookup.
- Inherited fixture issue: the existing `deep-import rules exempt tests and current composition, retaining other production boundaries` case in `development/scripts/__tests__/dependency-cruiser.test.ts` copies the config without `development/boundaries/feature-ranks.json`, which that config reads. It remains unchanged to preserve the sheet's single-new-case scope and the existing function boundary. The new case supplies the table. Coordinator must address the inherited setup before expecting the whole file to pass; no test was run here.
- Combine must execute the new case, all three named mutations, and the sheet's existing behavior/import-graph checks. Runtime package-transitive validation and the Chrome check remain owed.
