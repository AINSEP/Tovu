import { isBuiltInExternalMcpServer } from "#src/features/external-mcp/built-in-connections";
import { OwnerRequiredError } from "@jini-ai/user-management";
import { assertUserAccountAction, SelfDeleteError, callerMayManageUserTrash } from "#src/features/identity/delete-user-service";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { isDeepStrictEqual } from "node:util";
import { ToolInputError } from "@jini-ai/core";
import { purgeMedia, MediaNotFoundError, MediaStillReferencedError } from "#src/features/media/index";
import type { MediaRepoPort } from "#src/features/media/index";
import { deleteCustomCredential } from "#src/features/custom-credentials/index";
import { deletePublishCredential, describeCredential } from "#src/features/deployments/publish-credentials/index";
import { deleteSourceControlCredential } from "#src/features/source-control/index";
import { deleteExternalMcpServer } from "#src/assistant/index";
import { mayActOnEntityType } from "#src/features/trash/index";
import { type TrashItem } from "@jini-ai/cms/trash";
import type { PermanentDeletePlan, PermanentDeleteToolDeps } from "#src/features/permanent-delete/tool-registrations";
import type { PermanentDeleteToolId } from "#src/features/permanent-delete/agent-tools";
import type { RouteDeps } from "#src/server/routes/types";

/** Host adapter only: the tools never import server or reach credential services directly. */
type Deps = Pick<RouteDeps,
  "workspaceId" | "authorize" | "clock" | "trash" | "registry" | "ownerPrincipalId" | "principalRepo" |
  "assetBlobRepo" | "assetRenditionRepo" | "blobStore" | "forgetRemovedMedia" |
  "idGen" | "userRepo" | "sessionRepo" | "roleRepo" | "policyRepo" | "policyPermissionRepo" | "rolePolicyRepo" | "principalRoleRepo" | "principalPolicyRepo" | "passwordHasher" | "transactions" | "tokens" |
  "commentRepo" | "commentWriteService" | "externalMcpServerRepo" | "builtInExternalMcpServerIds" | "customCredentialSetRepo" |
  "vendorCredentialSetRepo" | "loadDeployTargets" | "sourceControlCredentialSetRepo"
> & { mediaRepo: MediaRepoPort };
const PAGE_SIZE = 100;

/** Caller-correctable lookup refusal; never reveals a credential's secret material. */
function notFound(toolId: string): ToolInputError {
  return new ToolInputError({ message: `${toolId}: item was not found. List the resource and check its id.` });
}

/**
 * Snapshot one resource without decrypting it. The private copy includes ciphertext so rotation
 * during the human wait invalidates consent, while the card exposes only the supplied label/id.
 * Reuses existing delete services; their internal transactions/default promotion remain intact.
 * @param spec - Loader, label formatter and existing deletion service for one fixed saved id.
 * @returns A card preview with an effect that rechecks the snapshot immediately before deleting.
 * @throws ToolInputError for missing or changed records. Service failures propagate to redaction.
 * @complexity O(s) copying/comparing a record of size s plus two indexed reads and service cost.
 */
async function recordPlan<T>(spec: {
  toolId: PermanentDeleteToolId; id: string; load(): Promise<T | null>;
  label(record: T): string; remove(): Promise<Record<string, unknown>>; warning?: string;
}): Promise<PermanentDeletePlan> {
  const found = await spec.load();
  if (!found) throw notFound(spec.toolId);
  const snapshot = structuredClone(found);
  return {
    details: [{ label: "Item", value: `${spec.label(found)} (${spec.id})` }],
    ...(spec.warning ? { warning: spec.warning } : {}),
    execute: async () => {
      const current = await spec.load();
      if (!current) throw notFound(spec.toolId);
      if (!isDeepStrictEqual(current, snapshot)) {
        throw new ToolInputError({ message: `${spec.toolId}: item changed while confirmation was open. Request a new confirmation; nothing was deleted.` });
      }
      return spec.remove();
    },
  };
}

/**
 * Yield listed Trash rows through the public port. Entity-type filters keep user lookup scoped;
 * keyset pagination covers every page. No entity payload is ever parsed.
 * @complexity O(n) Trash rows in the requested kinds; O(100) transient page space.
 */
async function* listedTrashItems(deps: Deps, entityTypes?: string[]): AsyncGenerator<TrashItem> {
  let cursor: string | null = null;
  const now = deps.clock.nowIso();
  do {
    const page = await deps.trash.list({ workspaceId: deps.workspaceId, now, limit: PAGE_SIZE }, { cursor, ...(entityTypes ? { entityTypes } : {}) });
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor !== null);
}

/** Find one row without retaining the entire Trash; returns null when absent.
 * @complexity O(n) row comparisons, O(100) page space.
 */
async function findTrashItem(deps: Deps, matches: (item: TrashItem) => boolean, entityTypes?: string[]): Promise<TrashItem | null> {
  for await (const item of listedTrashItems(deps, entityTypes)) {
    if (matches(item)) return item;
  }
  return null;
}

/** Preserve the existing per-kind evaluator, with the dedicated permanent-delete force gates.
 * Self and seeded-owner protection applies to ALL Trash purge tools, not only user-delete.
 * @complexity O(1) plus one authorization/owner lookup.
 */
async function mayPurgeItem(deps: Deps, item: TrashItem, principalId: string): Promise<boolean> {
  if (item.entityType === "user") {
    const identity = identityServiceDepsFrom(deps);
    try {
      await assertUserAccountAction({ deps: identity, workspaceId: deps.workspaceId, principalId: item.entityId, action: "purge" },
        { callerPrincipalId: principalId, seededOwnerPrincipalId: await deps.ownerPrincipalId });
    } catch (error) {
      if (error instanceof SelfDeleteError || error instanceof OwnerRequiredError) return false;
      throw error;
    }
    return callerMayManageUserTrash({ deps: identity, workspaceId: deps.workspaceId, callerPrincipalId: principalId });
  }
  const forcePermission = item.entityType === "media" ? "media.delete.force" : item.entityType === "comment" ? "comments.delete.force" : null;
  if (forcePermission) {
    return (await deps.authorize({ workspaceId: deps.workspaceId, principalId, permission: forcePermission, entityType: item.entityType, entityId: item.entityId })).allowed;
  }
  return (await mayActOnEntityType(deps, { principalId, entityType: item.entityType, entityId: item.entityId })).allowed;
}

/**
 * Fix the reviewed selection before opening the card, then let Trash resolve/authorize each stored
 * row again inside purgeSelected. New arrivals and replacements cannot inherit old consent.
 * @throws ToolInputError when any selected row is unauthorized, before its title is shown.
 * @complexity O(k) authorization calls and snapshot space for k selected rows.
 */
async function trashPlan(deps: Deps, toolId: PermanentDeleteToolId, items: TrashItem[], principalId: string): Promise<PermanentDeletePlan> {
  const snapshots = new Map(items.map(item => [item.id, structuredClone(item)]));
  for (const item of items) {
    if (!await mayPurgeItem(deps, item, principalId)) throw new ToolInputError({ message: `${toolId}: permission denied for a selected Trash item. Nothing was deleted.` });
  }
  return {
    details: items.map(item => ({ label: item.entityType, value: `${item.displayTitle} (${item.id})` })),
    execute: async () => {
      const report = await deps.trash.purgeSelected({
        workspaceId: deps.workspaceId, ids: [...snapshots.keys()], actor: { principalId },
        authorizeItem: async ({ item }) => isDeepStrictEqual(item, snapshots.get(item.id)) && await mayPurgeItem(deps, item, principalId),
      });
      return { removed: report.purged > 0, purged: report.purged, results: report.results };
    },
  };
}

/** Prepare the exact public Trash selection across every page. The single-user branch follows
 * the existing Trash-only deletion ladder. No new arrival inherits consent after preparation.
 * @complexity O(n) reads for n listed items, O(n) snapshot/card space for Empty Trash.
 */
async function prepareTrash(deps: Deps, toolId: PermanentDeleteToolId, id: string | null, principalId: string): Promise<PermanentDeletePlan> {
  if (toolId === "trash_empty") {
    const items: TrashItem[] = [];
    for await (const item of listedTrashItems(deps)) items.push(item);
    if (items.length === 0) throw new ToolInputError({ message: "trash_empty: Trash is empty. Nothing to permanently delete." });
    return trashPlan(deps, toolId, items, principalId);
  }
  if (id === null) throw notFound(toolId);
  if (toolId === "identity_user_delete") {
    if (id === principalId || id === await deps.ownerPrincipalId) throw new ToolInputError({ message: "identity_user_delete: cannot permanently delete yourself or the seeded owner." });
    const item = await findTrashItem(deps, item => item.entityId === id, ["user"]);
    if (!item) {
      const principal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id });
      if (!principal) throw notFound(toolId);
      throw new ToolInputError({ message: "identity_user_delete: user is not in Trash. Move the user to Trash first, then request permanent deletion." });
    }
    return trashPlan(deps, toolId, [item], principalId);
  }
  const item = await findTrashItem(deps, item => item.id === id);
  if (!item) throw notFound(toolId);
  return trashPlan(deps, toolId, [item], principalId);
}

/**
 * Bind each confirmed effect to the same resource service the admin route uses. Credential lookups
 * never decrypt; publish-host lookup uses the current vendor table and deploy registry.
 * @param deps - Workspace-scoped ports from the host's composition root.
 * @returns Permission evaluator and preparation adapter for all nine permanent-delete tools.
 * @throws ToolInputError for missing targets, changed state and deletion-ladder refusals.
 * @complexity O(1) to compose; each preparation delegates the costs documented above.
 */
export function buildPermanentDeleteDeps(deps: Deps): PermanentDeleteToolDeps {
  return {
    workspaceId: deps.workspaceId, authorize: deps.authorize,
    prepare: async (toolId, id, principalId) => {
      if (toolId === "trash_empty" || toolId === "trash_purge_item" || toolId === "identity_user_delete") return prepareTrash(deps, toolId, id, principalId);
      if (id === null) throw notFound(toolId);
      const key = { workspaceId: deps.workspaceId, id };
      switch (toolId) {
        case "media_purge_asset":
          return recordPlan({
            toolId, id, load: async () => {
              const asset = await deps.mediaRepo.findById(key);
              if (asset && asset.status !== "trashed") throw new ToolInputError({ message: "media_purge_asset: media must be trashed first. Use media_trash_asset, then request permanent deletion." });
              return asset;
            }, label: asset => asset.title,
            warning: "The asset and renditions are permanently removed. Shared file bytes remain; unshared bytes follow the existing garbage-collection grace period.",
            remove: async () => {
              try {
                await purgeMedia({ deps: { mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore, clock: deps.clock }, input: key });
                await deps.forgetRemovedMedia(key);
                return { removed: true, id };
              } catch (error) {
                if (error instanceof MediaNotFoundError || error instanceof MediaStillReferencedError) throw new ToolInputError({ message: error.message });
                throw error;
              }
            },
          });
        case "comments_purge_comment":
          return recordPlan({ toolId, id, load: () => deps.commentRepo.findById(key), label: comment => `Comment by ${comment.authorName}`, remove: async () => {
            const result = await deps.commentWriteService.purge({ ...key, actorPrincipalId: principalId, note: null });
            if (!result.ok) throw notFound(toolId);
            return { removed: true, id };
          } });
        case "external_mcp_delete": {
          if (isBuiltInExternalMcpServer({ serverId: id, ids: deps.builtInExternalMcpServerIds })) {
            throw new ToolInputError({ message: "built-in MCP connections cannot be removed" });
          }
          const serverKey = { workspaceId: deps.workspaceId, serverId: id };
          return recordPlan({ toolId, id, load: () => deps.externalMcpServerRepo.findByServerId(serverKey), label: server => server.label ?? server.serverId,
            warning: "Deletes saved configuration and authentication. Its tools refuse future calls; restart the assistant to remove their stale listings.",
            remove: async () => {
              if (!await deleteExternalMcpServer({ repo: deps.externalMcpServerRepo }, serverKey)) throw notFound(toolId);
              return { removed: true, id, restartRequired: true };
            },
          });
        }
        case "custom_credential_delete":
          return recordPlan({ toolId, id, load: () => deps.customCredentialSetRepo.findById(key), label: credential => credential.label,
            warning: "Deletes the saved custom credential. The token is not revoked at its provider.",
            remove: async () => { await deleteCustomCredential({ repo: deps.customCredentialSetRepo }, key); return { removed: true, id }; } });
        case "deployment_delete_provider_credential":
          return recordPlan({ toolId, id, load: async () => {
            const summary = await describeCredential({ repo: deps.vendorCredentialSetRepo, loadDeployTargets: deps.loadDeployTargets }, key);
            return summary ? deps.vendorCredentialSetRepo.findById(key) : null;
          }, label: credential => `${credential.label} (${credential.vendorId})`,
            warning: "Deletes this vendor credential shared by its publish hosts. Another credential may become the default. Deployed sites remain; the token is not revoked at its provider.",
            remove: async () => { await deletePublishCredential({ repo: deps.vendorCredentialSetRepo }, key); return { removed: true, id }; } });
        case "source_control_delete_credential":
          return recordPlan({ toolId, id, load: () => deps.sourceControlCredentialSetRepo.findById(key), label: credential => credential.label,
            warning: "Deletes the saved source-control credential. Another credential may become the default. Repositories remain; the token is not revoked at its provider.",
            remove: async () => { await deleteSourceControlCredential({ repo: deps.sourceControlCredentialSetRepo }, key); return { removed: true, id }; } });
      }
    },
  };
}
