/** Compose the CMS visitor policy over settings; no admin tool catalog, plugin loader or credentials. */
import { SITE_ASSISTANT_TOOL_SCHEMAS } from "#src/assistant/site/tools";
import { createVisitorToolsManagement, type VisitorToolsServiceDeps } from "#src/features/settings/visitor-tools-service";
import type { VisitorToolDescriptor } from "#src/contracts/site-assistant/visitor-tools-management";

/** T1's six reviewed CMS tools plus site_guide. Later visitor-source declarations extend listCatalog,
 * never by enumerating the admin registry. Page actions affect only the visitor's current page.
 * @complexity O(1), seven fixed entries. @example builtinVisitorToolsCatalog({});
 */
export function builtinVisitorToolsCatalog(_required: Record<string, never>, _options = {}): readonly VisitorToolDescriptor[] {
  return [...SITE_ASSISTANT_TOOL_SCHEMAS.map(schema => ({ id: schema.name, description: schema.description })),
    { id: "site_guide", description: "Read-only guide to the site's public visitor capabilities." }]
    .map<VisitorToolDescriptor>(tool => ({ ...tool, title: tool.id.replaceAll("_", " "), source: "builtin", sourceRevision: "builtin-v1", effect: "read", availability: { available: true } }));
}

/** Shared composition for memory and durable roots; future plugin/T4 sources use the service catalog port.
 * @complexity O(1). @example composeVisitorToolsManagement({workspaceId, settings, ready});
 */
export function composeVisitorToolsManagement(required: Omit<VisitorToolsServiceDeps, "listCatalog">, _options = {}) {
  return createVisitorToolsManagement({ deps: { ...required, listCatalog: async () => builtinVisitorToolsCatalog({}) } });
}
