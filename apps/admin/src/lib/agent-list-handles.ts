import { buildAgentListHandles as buildPackageHandles } from "@jini-ai/agentic";

/** Keep existing host call sites positional; Jini owns handle sanitization and collisions.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
 * @file Thin re-export of `@jini-ai/agentic`'s `buildAgentListHandles`.
 *
 * The per-item agent-handle-uniqueness policy used to live here alone (derived from
 * `features/settings/rules.ts`'s `buildExternalMcpCardHandles` once a second list screen needed
 * the identical logic — see git history on this file for that original doc comment, with the
 * fuller rationale on why uniqueness needs a suffix search and why handles derive from stable ids
 * rather than list position). It has since moved into Jini's `@jini-ai/agentic` package (see that
 * package's `src/core/list-handles.ts`), so every host built on Jini gets the same policy for
 * free instead of each one re-deriving — and possibly re-breaking — the same two rules.
 *
 * This file's import path and export name stay byte-identical to before the move, so nothing
 * already written against `apps/admin/src/lib/agent-list-handles.ts` needs to change.
 */
// Stable-id handles and collision suffix-search rationale: Jini/packages/agentic/src/core/list-handles.ts.
export function buildAgentListHandles(prefix: string, ids: readonly string[]): string[] {
  return buildPackageHandles({ prefix, ids });
}
