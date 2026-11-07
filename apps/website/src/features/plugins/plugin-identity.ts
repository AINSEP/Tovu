import { ensurePluginIdentityTable as ensureTable, type PluginStore } from "@jini-ai/db/data-modules";
export { getPluginIdentity, checkNamespaceAdoption, type PluginProvenance, type PluginIdentityRecord, type NamespaceAdoptionDecision } from "@jini-ai/db/data-modules";

export function ensurePluginIdentityTable(store: PluginStore): Promise<void> { return ensureTable({ store }); }
