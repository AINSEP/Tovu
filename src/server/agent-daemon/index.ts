/**
 * @file Public surface (barrel) for `server/agent-daemon/` — mirrors the shape
 * `assistant/index.ts` used to expose for these same three symbols before this directory was
 * relocated out of `assistant/` (2026-08-17). Only `src/index.ts` needs this: `server/modules/
 * assistant.ts` and `server/routes/admin/system/assistant-daemon.ts` already live inside the
 * `server` module themselves, so they import `daemon-supervisor.ts` directly.
 */
export { startAssistantDaemon, restartAssistantDaemon, ensureAssistantDaemonStarted } from "./daemon-supervisor.js";
export type { RestartAssistantDaemonResult, EnsureAssistantDaemonStartedResult } from "./daemon-supervisor.js";
