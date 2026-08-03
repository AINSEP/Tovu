/**
 * @file Settings' agent-tool registrations — re-exported from `@jini-ai/cms/settings`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports all 22 domains as a single uniform block of
 * `../<domain>/tool-registrations` lines. Pointing only settings somewhere else would make the
 * one ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 */
export { buildSettingsRegistrations, settingsDerivedRisk, type SettingsToolDeps } from "@jini-ai/cms/settings";
