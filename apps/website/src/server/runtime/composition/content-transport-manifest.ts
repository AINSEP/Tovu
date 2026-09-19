import { contributePageTransport, contributePostTransport } from "#src/features/post/content-transport";
import { registerContentTransportContributor } from "#src/features/content-transport/type-registry";

/**
 * @file Task 2 of the content-transport (Publish Content) feature — the composition-root wiring
 * point plan §3 rule 1 calls for: "`server/runtime/composition/tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors` (or a **sibling** `installFirstPartyTransportTypes`)".
 *
 * A sibling, NEW file — deliberately not folded into `tool-catalog-manifest.ts` itself. That file
 * wires the AI-assistant's tool CATALOG (`ToolContributor`s); this registers content TYPES for the
 * Publish Content HTTP feature, a different registry with a different consumer (Task 4's export
 * route and Task 5's planner, not `buildAssistantToolRegistrations`). Keeping the two `install*`
 * functions in separate files means a future Task 3/4 PR that starts calling this one does not have
 * to touch — or risk a merge conflict in — `tool-catalog-manifest.ts`'s own ~35-domain call list.
 *
 * NOT YET CALLED from a real boot path. Nothing in the tree yet consumes
 * `listContentTransportContributors()` (Task 4's export route is the first real reader), so calling
 * this from `agent-daemon-server.ts`/`assistant-byok.ts` today would register two contributors that
 * are never read by anything and add a shared-file edit with no test coverage to justify it. Task 4's
 * own composition module (`server/runtime/composition/modules/content-transport.ts`, not yet built)
 * is the natural place to call `installFirstPartyTransportTypes()` once there is a real consumer —
 * see `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 */
export function installFirstPartyTransportTypes(): void {
  registerContentTransportContributor(contributePostTransport());
  registerContentTransportContributor(contributePageTransport());
}
