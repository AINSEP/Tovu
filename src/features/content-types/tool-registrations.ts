/**
 * @file Content-types' agent-tool registrations — re-exported from `@jini-ai/cms/content-types`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/` and
 * `navigation/`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains as a
 * single uniform block of `../<domain>/tool-registrations` lines, and this file keeps that block
 * uniform. When more domains move, this file and its siblings retire together.
 */
export {
  buildContentTypesRegistrations,
  contentTypesDerivedRisk,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";
