import { createPublishContentDisconnectTools } from "@jini-ai/cms/publish/content/disconnect-tool";
import { disconnectDestination, PublishTrustConnectError } from "@jini-ai/cms/publish/trust/connect";
import { requirePublishTrustProvisioning } from "./tool-registrations.js";
import type { PublishContentToolDeps } from "./tool-deps.js";

/** Only the ports the admin disconnect handler uses; no HTTP handshake or secret decryption. */
export type Deps = Pick<PublishContentToolDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "publishContentPeerRepo" | "siteAssistantSecretKeyring" | "publishTrustProvisioning" | "findPublishCandidate">;

/**
 * @file Host binding for `@jini-ai/cms`'s `publish_content_disconnect` tool: supplies this app's
 * grant reversal (`publish-trust`'s `disconnectDestination` against the committed deploy config),
 * the error class and recovery copy for a failed settings write, and this file's path as the
 * catalog module recorded in the tool metadata.
 */
export const { buildRegistrations, contributePublishContentDisconnectTools } = createPublishContentDisconnectTools<Deps>({
  host: {
    catalogModule: "features/publish-content/disconnect-tool.ts",
    reverseGrant: ({ deps }) => disconnectDestination({ deps: { keyring: deps.siteAssistantSecretKeyring, provisioning: requirePublishTrustProvisioning({ deps }), workspaceId: deps.workspaceId } }),
    settingsWriteFailure: {
      isInstance: ({ error }) => error instanceof PublishTrustConnectError,
      message: "Publishing settings could not be saved. Check that this project's files can be written, then disconnect again.",
    },
  },
});
