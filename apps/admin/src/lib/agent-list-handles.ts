/**
 * @file Thin re-export of `@jini-ai/agentic`'s `buildAgentListHandles`.
 *
 * The per-item agent-handle-uniqueness policy used to live here alone (derived from
 * `features/settings/rules.ts`'s `buildExternalMcpCardHandles` once a second list screen needed
 * the identical logic — see git history on this file for that original doc comment, with the
 * fuller rationale on why uniqueness needs a suffix search and why handles derive from stable ids
 * rather than list position). It has since moved into Jini's `@jini-ai/agentic` package (see that
 * package's `src/contracts/core/list-handles.ts`), so every host built on Jini gets the same policy for
 * free instead of each one re-deriving — and possibly re-breaking — the same two rules.
 *
 * This file's import path and export name stay byte-identical to before the move, so nothing
 * already written against `apps/admin/src/lib/agent-list-handles.ts` needs to change.
 */
export { buildAgentListHandles } from "@jini-ai/agentic";
