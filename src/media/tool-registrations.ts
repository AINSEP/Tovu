/**
 * @file Media's agent-tool registrations — re-exported from `@jini-ai/cms/media`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports all 22 domains as a single uniform block of
 * `../<domain>/tool-registrations` lines. Pointing only media somewhere else would make the one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 */
export { buildMediaRegistrations, mediaDerivedRisk, type MediaToolDeps } from "@jini-ai/cms/media";
