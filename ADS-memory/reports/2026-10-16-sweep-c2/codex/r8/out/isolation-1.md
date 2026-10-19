Programmer(Execution): Selected for the minimal test-only setup fix.

Reused `isolated-catalog-home` as the first import in all ten files, with correct relative paths and `.js` suffixes. Confirmed import order by source inspection. Only imports changed; existing comments remain.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-site.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/site-dir/__tests__/unit/site-registry.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/custom-credential-tools-search-discoverability.test.ts
/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/domain-dns-search-discoverability.test.ts
/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/external-mcp-setup-search.test.ts
/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/honesty-lines-search.test.ts
/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/mcp-federation.registrations.test.ts
```

NOT DONE: Tests, typechecks, builds, and package scripts were not run, as instructed. Runtime success remains unverified. No git commands or Jini changes were made.
