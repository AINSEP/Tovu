import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolCatalogQuery } from "@jini-ai/daemon/http";
import { DEFAULT_PERMANENT_DELETES_POLICY, PERMANENT_DELETE_TOOLS, type AssistantPermanentDeletesPolicy } from "../contracts/headless/index.js";
import { isChatToolAllowed } from "./assistant-permanent-deletes-policy.js";
/** The complete boot catalog contains eligible handlers, never the two forbidden ones. */
export const ALL_CHAT_DELETE_TOOLS = { enabled: true, allowedToolIds: PERMANENT_DELETE_TOOLS.map(tool => tool.id) };
/** Filter discovery before results/schemas reach the model. Overfetch the bounded withheld set
 * so a disabled candidate does not hide a lower-ranked permitted result.
 * @param required - Existing catalog owner and the current async-context policy reader.
 * @returns A synchronous catalog adapter that hides schemas and search hits before model access.
 * @example filterChatDeleteCatalog({ catalog, policy: () => sitePolicy });
 * @complexity O(limit + 15) adapter time/space plus indexed search; no durable effects. */
export function filterChatDeleteCatalog(required: { catalog: ToolCatalogQuery; policy: () => AssistantPermanentDeletesPolicy }, _optional = {}): ToolCatalogQuery {
  const allowed = (toolId: string) => isChatToolAllowed({ toolId, policy: required.policy() });
  return {
    search: ({ query }, { limit = 10 } = {}) => required.catalog.search({ query }, { limit: limit + PERMANENT_DELETE_TOOLS.length + 2 }).filter(hit => allowed(hit.id)).slice(0, limit),
    describe: ({ id }) => allowed(id) ? required.catalog.describe({ id }) : null,
  };
}
/** Each site root owns one scope, with native async context keeping concurrent requests isolated.
 * Fresh reads happen at run dispatch and each catalog request/meta call; no grant lives in a boot cache.
 * @param required - Site-specific fresh settings read; errors propagate before dispatch.
 * @returns The catalog adapter and fresh async scope; outside a scope grants are OFF.
 * @example const scope = createChatDeleteScope({ readPolicy }); await scope.fresh({ run: executeRun });
 * @complexity O(1) local time/space per scope plus the injected settings read. */
export function createChatDeleteScope(required: { readPolicy(input: { principalId?: string }): Promise<AssistantPermanentDeletesPolicy> }, _optional = {}) {
  const context = new AsyncLocalStorage<AssistantPermanentDeletesPolicy>();
  const policy = () => context.getStore() ?? DEFAULT_PERMANENT_DELETES_POLICY;
  return {
    policy,
    catalog: ({ catalog }: { catalog: ToolCatalogQuery }) => filterChatDeleteCatalog({ catalog, policy }),
    async fresh<T>(input: { run: () => T | Promise<T>; principalId?: string }, _options = {}): Promise<T> {
      const snapshot = await required.readPolicy({ principalId: input.principalId });
      return context.run(snapshot, input.run);
    },
  };
}
