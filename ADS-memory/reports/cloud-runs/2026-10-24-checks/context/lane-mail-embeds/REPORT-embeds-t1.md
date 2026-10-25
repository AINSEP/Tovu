Programmer(Direct): Programmer persona selected for the T1 runtime integration.

Changed the export adapter, render/save wiring, asset route, static exporter, catalog rows, and focused tests. Full file list and decisions: [handoff](ADS-memory/.local-artifacts/plugin-embeds-t1/HANDOFF.md).

Scoped production/test-source typechecks and CCN checks passed. No tests, installs, or commits ran. Google’s manifest and assets remain U1 work.

One upstream gap remains: linked Jini accepts static local template URLs despite the brief’s refusal requirement. The expected-refusal test is included; runtime verification remains pending.

Scoped commands, from this clone:

```bash
node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks \
  apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-*.test.ts \
  apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces/__tests__/export-files.security.test.ts \
  apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts \
  apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts \
  apps/website/src/features/site-export/__tests__/site-exporter.test.ts \
  apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts \
  apps/website/src/features/plugin-runtime/__tests__/unit/plugins-list.agent-plugins-rows.test.ts
```

From `jini-int2`, after the upstream fix:

```bash
pnpm --filter @jini-ai/cms exec vitest run --maxWorkers=2 --minWorkers=1 src/widgets/__tests__/plugin-export.unit.test.ts
```
