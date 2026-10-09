import { resolveRuntimeMode } from "./runtime-mode.js";

/**
 * @file The assistant agent CLI's permission mode, resolved from env. Extracted from
 * `agent-daemon-server.ts` (2026-10-08 hardwiring audit #5) so the boot-readiness warning can name
 * the mode the daemon will actually run in, from the one function the daemon itself uses, instead
 * of a second copy of the rule that could drift.
 *
 * A spawned agent CLI has no TTY to answer an interactive permission prompt, so "restricted"
 * here means every permission-gated action (including MCP tool use) silently stalls rather than
 * executing — confirmed live (2026-07-30) that `identity_user_create` and every other agent-tool
 * call hangs on an unanswerable "requested permission... but you haven't granted it yet" prompt
 * without an explicit bypass.
 *
 * `TOVU_AGENT_PERMISSION_MODE` still wins when set explicitly, either direction. With no
 * override, this follows `resolveRuntimeMode()`'s own safe-default philosophy (SPEC-022 INV-04:
 * anything not explicitly `TOVU_RUNTIME_MODE=production` resolves to the permissive/local case) —
 * bypass unless running in production. A fresh clone with no env vars at all (`git clone && npm
 * install && npm run dev`) gets a working assistant with no setup step to discover, regardless of
 * which script or command actually launches this process; a real production deployment stays
 * restricted-by-default unless an operator explicitly opts into bypass.
 */

export type AgentPermissionMode = "bypass" | "restricted";

/** @complexity O(1). Pure over the env it is given. */
export function resolveAgentPermissionMode(
  required: { env: Record<string, string | undefined> },
  _optional: Record<string, never> = {}
): AgentPermissionMode {
  if (required.env.TOVU_AGENT_PERMISSION_MODE === "bypass") return "bypass";
  if (required.env.TOVU_AGENT_PERMISSION_MODE === "restricted") return "restricted";
  return resolveRuntimeMode({ env: required.env }) === "production" ? "restricted" : "bypass";
}
