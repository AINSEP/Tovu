### jini:packages/agent-plugins/src/lifecycle/install.ts
- **Over:** `buildModule` 303
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/install.unit.test.ts`, `.../install-edges.unit.test.ts`, `.../installed-package-roots.unit.test.ts`, `packages/agent-plugins/src/lifecycle/__tests__/type-cycles.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Pattern:** same as `activation.ts` fragment — `buildModule(ports)` is a per-host closure module (memoised in `instances`); keep ONE `buildModule` per instance that composes module-level ports-scoped sub-factories, each called ONCE inside it, so per-instance state stays per instance. Existing inner functions keep their signatures and comments verbatim. The outline `uses` lists only earlier locals — grep every moved body for later-declared (hoisted) callees and for each bound fs alias it reads, and pass those in.
- **Splits:**
  1. MODULE-LEVEL pure (no ports) verbatim above `buildModule`: `LIMITS`, `SHA256_HEX_PATTERN`, `symlinkRejectionMessage`, `assertEntryCountWithinCap`, `tooManyEntriesError`, `sha256`, `isErrnoException` (~35). Job: archive limits + small predicates. (`maxAgentPluginInstallArchiveBytes` stays in `buildModule`, it is returned.)
  2. SUB-FACTORY `createArchiveExtractor({ ports, mkdir, open, normalizePackageEntryPath, assertContainedOnDisk }: CreateArchiveExtractorInput): { extractEntries }` ← `normalizeEntryPathOrThrow`, `resolveContainedDestinationOrThrow`, `extractOneEntry`, `extractEntries`, `writeContainedFile` (~95). Job: hardened extraction.
  3. SUB-FACTORY `createPublishSteps({ rename, readdir, readFile, stat, chmod, ports }: CreatePublishStepsInput): { reuseOrSetAsideExisting; freezeTree; publish; isRealDirectory }` ← those + `sameTree`, `sameFile` (~60). Job: freeze + compare + atomic publish.
  4. SUB-FACTORY `createRevisionHousekeeping({ ports, persistentState, readFile }: CreateRevisionHousekeepingInput): { assertIdentityAvailable; pruneSupersededRevisions }` (~40). Job: identity lock + superseded-revision pruning.
  5. `buildModule` keeps binds, `index`, `indexInstalledRoot`, `maxAgentPluginInstallArchiveBytes`, `installAgentPlugin`, return (same three names).
- **Importers to update:** none (re-exports at the top unchanged).
- **After:** `buildModule` ~85; sub-factories ≤95; file ~370.
- **Risks / notes:** the module header's hardening-rule list is referenced by `extractOneEntry`/`extractEntries` comments — keep those comments verbatim (they point to "this module's header", still the same file). `type-cycles.test.ts` guards import cycles — no new files, so none added.
