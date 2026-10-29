import { resolveDefinitionRaw, type SettingsRepoPort } from "@jini-ai/core/settings";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE } from "#src/contracts/headless/index";
import { ASSISTANT_SUBAGENTS_NAMESPACE } from "#src/contracts/headless/index";

type BodyItem = Record<string, unknown>;

/** What every item check needs: the repo to resolve through and the namespaces being protected. */
type ProtectedScope = { repo: SettingsRepoPort; workspaceId: string; namespaces: readonly string[] };

/** The items a request body asks to change: each entry of a definition batch, otherwise the body
 * itself. A null or non-object body changes nothing checkable.
 * @complexity O(1).
 */
function bodyItems(body: unknown): { items: unknown[]; definitionBatch: boolean } {
  if (!body || typeof body !== "object") return { items: [], definitionBatch: false };
  const definitions = (body as BodyItem).definitions;
  return Array.isArray(definitions) ? { items: definitions, definitionBatch: true } : { items: [body], definitionBatch: false };
}

/** True when the item names a protected namespace directly, or renames into one. Values are
 * compared by their string form, so a non-string namespace still fails closed when it stringifies
 * to a protected name.
 * @complexity O(n) over the protected namespaces.
 */
function namesProtectedNamespace(item: BodyItem, namespaces: readonly string[]): boolean {
  return namespaces.includes(String(item.namespace)) || namespaces.includes(String(item.newNamespace));
}

/** The keys whose resolution decides the item: its own key, or for a key-less reset every active
 * platform-then-workspace definition in its namespace. A key-less definition-batch item is never
 * expanded (it cannot address a definition), so it resolves nothing.
 * @complexity O(d) over the registered definitions for a reset, otherwise O(1).
 */
async function keysToResolve(item: BodyItem & { namespace: string }, scope: ProtectedScope, definitionBatch: boolean): Promise<string[]> {
  if (typeof item.key === "string") return [item.key];
  if (definitionBatch) return [];
  return [
    ...await scope.repo.listActiveDefinitions({ workspaceId: null }),
    ...await scope.repo.listActiveDefinitions({ workspaceId: scope.workspaceId }),
  ].filter((def) => def.namespace === item.namespace).map((def) => def.key);
}

/** True as soon as one key resolves (through aliases) to a protected namespace; later keys are not
 * resolved.
 * @complexity O(k) bounded alias resolutions.
 */
async function anyKeyResolvesProtected(namespace: string, keys: readonly string[], scope: ProtectedScope): Promise<boolean> {
  for (const key of keys) {
    const def = await resolveDefinitionRaw({ repo: scope.repo }, { namespace, key, workspaceId: scope.workspaceId });
    if (def && scope.namespaces.includes(def.namespace)) return true;
  }
  return false;
}

/** Whether one body item reaches a protected namespace by name, rename, alias or reset.
 * Non-object items and items without a string namespace touch nothing.
 * @complexity As `keysToResolve` plus `anyKeyResolvesProtected`.
 */
async function itemTouchesProtected(raw: unknown, scope: ProtectedScope, definitionBatch: boolean): Promise<boolean> {
  if (!raw || typeof raw !== "object") return false;
  const item = raw as BodyItem;
  if (namesProtectedNamespace(item, scope.namespaces)) return true;
  if (typeof item.namespace !== "string") return false;
  const namespaced = item as BodyItem & { namespace: string };
  return anyKeyResolvesProtected(namespaced.namespace, await keysToResolve(namespaced, scope, definitionBatch), scope);
}

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
  const scope: ProtectedScope = {
    repo: required.repo, workspaceId: required.workspaceId,
    namespaces: required.namespaces ?? [ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_PERMANENT_DELETES_NAMESPACE],
  };
  const { items, definitionBatch } = bodyItems(required.body);
  for (const raw of items) {
    if (await itemTouchesProtected(raw, scope, definitionBatch)) return true;
  }
  return false;
}
