import { isAdminAssistantEnabled, shouldStartAgentDaemon } from "../composition/admin-assistant-enabled.js";

/**
 * @file 2026-09-06 composition-root fix — `agentDaemonWanted` was hand-copied, verbatim, between
 * `src/index.ts` and `cli/commands/serve.ts`, each with a comment claiming boot-only logic in
 * those two files is "never imported by, or shared via import with, a tested module." That claim
 * was already false the same day it was written: `4dfbfe80` (`content-db-schema-guard.ts`)
 * extracted a different piece of `index.ts`'s own boot-only logic into exactly this kind of shared,
 * imported, unit-tested module, and both files already import several others
 * (`registerPluginSdkResolver`, `runProductionReadinessGateOrExit`, `buildBootModules`,
 * `installUnhandledRejectionGuard`) — this pair of functions was the exception, not the rule.
 *
 * Worse than an ordinary duplication: this function's own DECISION logic
 * (`isAdminAssistantEnabled() || externalMcpConfigured`) was ALREADY factored into
 * `admin-assistant-enabled.ts`'s `shouldStartAgentDaemon` — a pure, exported, unit-tested function
 * with, until this fix, ZERO real call sites anywhere in the codebase (verified: `grep` found only
 * its own definition file and its own test). Both copies of `agentDaemonWanted` re-implemented that
 * same boolean by hand instead of calling it — the repo's own dominant defect shape, "a correct
 * primitive with an unwired call site," here duplicated in two places rather than one.
 *
 * This module is the one shared caller: it does the async work `shouldStartAgentDaemon` cannot do
 * itself (fetching whether external MCP is configured, and logging the decline) and delegates the
 * actual on/off decision to that primitive, so the two can never drift again.
 */

/** `TOVU_ADMIN_ASSISTANT=off` skips the daemon ONLY when external MCP is also unconfigured — the
 *  daemon owns external-MCP federation too, not just chat (see `admin-assistant-enabled.ts`). */
export async function agentDaemonWanted(deps: {
  workspaceId: string;
  externalMcpServerRepo: { listByWorkspaceId: (id: string) => Promise<readonly unknown[]> };
}): Promise<boolean> {
  // Short-circuits before the async repo fetch below, same as both duplicated originals did — the
  // common case (assistant ON) never needs to ask whether external MCP is configured at all.
  if (isAdminAssistantEnabled()) return true;
  const configured = await deps.externalMcpServerRepo.listByWorkspaceId(deps.workspaceId);
  if (shouldStartAgentDaemon(configured.length > 0)) return true;
  console.log("[assistant] TOVU_ADMIN_ASSISTANT=off and no external MCP configured — not starting the agent daemon");
  return false;
}
