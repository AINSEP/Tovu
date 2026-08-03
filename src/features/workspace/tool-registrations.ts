/**
 * @file Workspace's agent-tool registrations — re-exported from `@jini-ai/cms/workspace`.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every domain as a single uniform block of
 * `../<domain>/tool-registrations` lines. Pointing only workspace somewhere else would make one
 * ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 */
export { buildWorkspaceRegistrations, workspaceDerivedRisk, type WorkspaceToolDeps } from "@jini-ai/cms/workspace";
