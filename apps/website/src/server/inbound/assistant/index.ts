/**
 * @file Public surface (barrel) for `server/agent-daemon/` — mirrors the shape
 * `assistant/index.ts` used to expose for these same three symbols before this directory was
 * relocated out of `assistant/` (2026-08-17). `src/index.ts` and `cli/commands/serve.ts` (2026-08-28
 * dispatch — both are composition roots for their own boot process) use this; `apps/website/src/server/runtime/composition/modules/assistant.ts`
 * and `apps/website/src/server/inbound/admin-http/routes/system/assistant-daemon.ts` already live inside the
 * `server` module themselves, so they import `daemon-supervisor.ts` directly.
 */
export {
  startAssistantDaemon,
  restartAssistantDaemon,
  ensureAssistantDaemonStarted,
  shutdownAssistantDaemon,
} from "../../runtime/lifecycle/daemon-supervisor.js";
export type {
  RestartAssistantDaemonResult,
  EnsureAssistantDaemonStartedResult,
  StartAssistantDaemonOptions,
} from "../../runtime/lifecycle/daemon-supervisor.js";
