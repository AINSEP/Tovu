import { resolveDefinitionRaw, type SettingsRepoPort } from "@jini-ai/core/settings";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE } from "#src/contracts/headless/assistant-permanent-deletes-policy";
import { ASSISTANT_SUBAGENTS_NAMESPACE } from "#src/contracts/headless/assistant-subagents-policy";

/** Generic settings mutations cannot bypass the dedicated owner/acknowledgment endpoint.
 * Resolving aliases also prevents laundering the protected key through another namespace.
 * Definition batches are checked entirely before any item writes; renaming into the namespace
 * is blocked too, so the code-owned false default cannot be replaced through the ledger browser.
 * @complexity O(d) for a namespace reset (d registered definitions), O(b) for a definition batch,
 * otherwise one bounded alias resolution. No writes.
 */
export async function touchesAssistantSubagents(required: {
  body: unknown; repo: SettingsRepoPort; workspaceId: string;
  namespaces?: readonly string[];
}, _optional: Record<string, never> = {}): Promise<boolean> {
  const namespaces = required.namespaces ?? [ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_PERMANENT_DELETES_NAMESPACE];
  const body = required.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return false;
  const definitionBatch = Array.isArray(body.definitions);
  const items = definitionBatch ? body.definitions as unknown[] : [body];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (namespaces.includes(String(item.namespace)) || namespaces.includes(String(item.newNamespace))) return true;
    if (typeof item.namespace !== "string") continue;
    if (definitionBatch && typeof item.key !== "string") continue;
    const keys = typeof item.key === "string" ? [item.key] : [
      ...await required.repo.listActiveDefinitions({ workspaceId: null }),
      ...await required.repo.listActiveDefinitions({ workspaceId: required.workspaceId }),
    ].filter((def) => def.namespace === item.namespace).map((def) => def.key);
    for (const key of keys) {
      const def = await resolveDefinitionRaw({ repo: required.repo }, {
        namespace: item.namespace, key, workspaceId: required.workspaceId,
      });
      if (def && namespaces.includes(def.namespace)) return true;
    }
  }
  return false;
}
