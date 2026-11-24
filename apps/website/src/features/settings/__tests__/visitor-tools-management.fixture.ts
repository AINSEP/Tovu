import { visitorSettingsFixture, ws } from "./visitor-tools.fixture.js";
import { createVisitorToolsManagement } from "../visitor-tools-service.js";
import type { VisitorToolConfigureInput } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";
import type { VisitorToolDescriptor } from "../../../contracts/site-assistant/visitor-tools-management.js";
import { SETTINGS_WRITE_POLICIES, VISITOR_TOOLS_HOST } from "../settings-write-policies.js";
import type { VisitorToolsConfigureInput } from "@jini-ai/core/contracts/site/site-assistant-visitor-tools-management";

export const readTool: VisitorToolDescriptor = { id: "list_categories", title: "Categories", description: "Public content categories", source: "builtin", sourceRevision: "v1", effect: "read", availability: { available: true } };
export const pluginTool: VisitorToolDescriptor = { ...readTool, id: "plugin_catalog", source: "plugin", publication: { endpoint: "https://catalog.example/public", credentialId: "opaque-public-reader", returnedFields: ["name", "price"] } };
export const createdTool: VisitorToolDescriptor = { ...pluginTool, id: "created_catalog", source: "created" };
export async function visitorManagementFixture() {
  const f = await visitorSettingsFixture();
  let catalog: readonly VisitorToolDescriptor[] = [readTool, pluginTool, createdTool];
  const service = createVisitorToolsManagement({ deps: { visitorTools: VISITOR_TOOLS_HOST, writePolicies: SETTINGS_WRITE_POLICIES, workspaceId: ws, settings: f.deps, ready: Promise.resolve(), listCatalog: async () => catalog } });
  const callerPrincipalId = "owner";
  return { ...f, service, callerPrincipalId, setCatalog: (next: readonly VisitorToolDescriptor[]) => { catalog = next; },
    list: () => service.list({ callerPrincipalId }),
    prepare: async (input: Omit<VisitorToolConfigureInput, "expectedRevisionSeq"> & { expectedRevisionSeq?: number }) => service.prepare({ callerPrincipalId,
      input: { expectedRevisionSeq: (await service.list({ callerPrincipalId })).revisionSeq, ...input } }),
  };
}
