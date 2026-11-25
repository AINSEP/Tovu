import { WORKSPACE_ID } from "@jini-ai/admin/shell/lib/admin-http/config";
import { authenticatedAdminRequest, request } from "@/lib/admin-http/request";
import { createDeploymentApi } from "@jini-ai/admin/deployment/api/deployment-api";
import type { DeploymentDestination } from "@jini-ai/core/contracts/site/deployment-admin";

type TovuPeerDestination = { id: string; kind: "tovu-peer"; peerId: string; label: string; url: string; lastPublishedAt: string };
export type AdminPublishDestination = DeploymentDestination<TovuPeerDestination>;

/**
 * @file The admin's deployment bindings: `@jini-ai/admin`'s deployment API client bound once to this
 * host's authenticated requests and workspace, plus the one call whose result names this product's
 * own peer-site kind and so stays here.
 */

/** The admin API calls of the deployment feature, over this host's requests. */
export const deploymentApi = {
  ...createDeploymentApi({ request, authenticatedRequest: authenticatedAdminRequest, workspaceId: WORKSPACE_ID }),
  /** Past static publishes, Tovu peers pushed to, and deploys of this site, newest first. Read-only:
   *  publishing again still goes through `triggerPublish` or the publish-content push. */
  listPublishDestinations: () =>
    request<AdminPublishDestination[]>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/destinations` }),
};
