/**
 * @file Entries' agent-tool registrations — re-exported from `@jini-ai/cms/entries`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/` and
 * `navigation/`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains as a
 * single uniform block of `../<domain>/tool-registrations` lines. Pointing only entries somewhere
 * else would make the ported domain the odd line out, and would invite the next reader to "restore
 * consistency" by reaching past a barrel rather than through it. When more domains move, this file
 * and its siblings retire together.
 */
export {
  buildEntriesRegistrations,
  entriesDerivedRisk,
  type EntriesToolDeps,
} from "@jini-ai/cms/entries";
