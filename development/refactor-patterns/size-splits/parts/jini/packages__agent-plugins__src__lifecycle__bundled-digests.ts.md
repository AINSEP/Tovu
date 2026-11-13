### jini:packages/agent-plugins/src/lifecycle/bundled-digests.ts
- **Over:** `buildModule` 126
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/bundled-digests.unit.test.ts`, `.../module-memoisation.unit.test.ts`, `.../seed-bundled-edges.unit.test.ts`, `.../resolve-agent-plugin-refs.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `SHA256_DIGEST_PATTERN`, `SAFE_PLUGIN_ID_PATTERN`, `resolveThisBootsDigests`, `preferBundledAgentPluginDigests`, `idsNarrowableToTheirBundledDigest`, `isPlainObject` — pure ledger selection (no `ports`, no per-instance state); B = binds, `EMPTY_LEDGER`, `readBundledAgentPluginDigests`, `normalizeBundledDigests`, `recordBundledAgentPluginDigests`, `removeBundledAgentPluginDigest`, `writeLedgerAtomically`, return — ledger file I/O + per-instance empty ledger.
- **Splits:**
  1. MOVE unit A verbatim (with every comment) to module level above `buildModule`, same order. Existing signatures unchanged. Grep each body for hoisted callees first (anything it calls must also be module-level).
  2. `buildModule` keeps unit B (`EMPTY_LEDGER` stays inside: it is a `new Map()` handed to callers, per instance) and returns the same five names.
- **Importers to update:** none.
- **After:** `buildModule` ~85; file ~145.
- **Risks / notes:** if `normalizeBundledDigests` calls `isPlainObject`, fine (module-level is visible). Do not move `EMPTY_LEDGER` to module level.
