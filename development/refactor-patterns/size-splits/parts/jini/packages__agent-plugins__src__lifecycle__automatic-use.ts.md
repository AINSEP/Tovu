### jini:packages/agent-plugins/src/lifecycle/automatic-use.ts
- **Over:** `createAutomaticAgentPluginUse` 143
- **Phase:** now · **Batch:** size-27
- **Tests:** `packages/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.unit.test.ts`, `.../automatic-cancellation-m1.unit.test.ts`, `.../load-supporting-files.unit.test.ts` (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `resolveOneGuidance`, `recordDelivery`, `resolveGuidance`, `preparedGuidance` — guidance resolution + delivery recording (reads only `ports`, `delivered`); B = `isPrimaryInstructions`, `offPluginNote` — closure-free helpers; C = rest (consent, state persistence, usage, queue, `prepare`, `load`) — run owner.
- **Splits:**
  1. HELPERS at module level above the factory: `isPrimaryInstructions` (verbatim; drop the unused `_options` param only if it is literally unused — otherwise keep it) and `offPluginNote({ ports, catalog, input }: OffPluginNoteInput): <existing return>` ← body verbatim.
  2. SUB-FACTORY `createGuidanceResolver({ ports, delivered }: CreateGuidanceResolverInput): { resolveOneGuidance; recordDelivery; resolveGuidance; preparedGuidance }` (module level) ← unit A verbatim with comments. `delivered: Map<string, string>` is the factory's map (same instance).
  3. Factory: `const { resolveOneGuidance, recordDelivery, resolveGuidance, preparedGuidance } = createGuidanceResolver({ ports, delivered });` right after `const delivered = …`. Call sites of `offPluginNote` pass `ports`.
- **Importers to update:** none.
- **After:** factory ~95; resolver ~48; file ~225.
- **Risks / notes:** thin margin; `delivered` must be the same Map (`rememberDelivery`, `publishUsage` read it). Queue/serialization comment on `enqueue` stays.
