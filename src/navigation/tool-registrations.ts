/**
 * @file Menus' (navigation's) agent-tool registrations — re-exported from `@jini-ai/cms/navigation`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/
 * tool-registrations.ts`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains
 * as a single uniform block of `../<domain>/tool-registrations` lines. Pointing only navigation
 * somewhere else would make the ported domain the odd line out, and would invite the next reader to
 * "restore consistency" by reaching past a barrel rather than through it. When more domains move,
 * this file and its siblings retire together.
 */
export { buildMenusRegistrations, menusDerivedRisk, type MenusToolDeps } from "@jini-ai/cms/navigation";
