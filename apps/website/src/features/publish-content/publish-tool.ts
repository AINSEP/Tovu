import { createPublishContentFromTool } from "@jini-ai/cms/publish/content/publish-tool";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolvePublishDestinationCredential } from "./destination-credential.js";
import { confirmPeerImport, executePeerImport } from "./peer-transport-binding.js";
import { planPublishToPeer } from "./push-plan.js";
import type { PublishContentToolDeps } from "./tool-deps.js";
import type { TovuPublishPorts } from "./tovu-publish-ports.js";
import { PUBLISH_CONTENT_CAPABILITY } from "./ui/index.js";
import { applyPublishCriteria, parsePublishContentToolInput, preparePublishConfirmation, toPublishReportRows } from "./ui/index.js";

/**
 * @file Host binding for `@jini-ai/cms`'s autonomous `publishContentFromTool`: supplies this app's
 * runtime-mode resolver, its destination-credential resolution (sealed key or connected handshake,
 * with the deps this app names them), its bound plan builder and peer transport, its publish-dialog
 * policy, and the `admin.publish_content` capability id its criteria errors are prefixed with. The
 * selection, plan, confirm and execute logic lives in the package.
 */
export const publishContentFromTool = createPublishContentFromTool<PublishContentToolDeps, TovuPublishPorts>({
  host: {
    resolveRuntimeMode,
    resolveCredential: ({ deps, input }) => resolvePublishDestinationCredential({ deps: {
      repo: deps.publishContentPeerRepo,
      sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, httpClient: deps.publishContentPeerHttpClient,
    }, input }),
    planPublishToPeer,
    peerTransport: { confirmPeerImport, executePeerImport },
    ui: { applyPublishCriteria, parsePublishContentToolInput, preparePublishConfirmation, toPublishReportRows },
    criteriaCapabilityId: PUBLISH_CONTENT_CAPABILITY.id,
  },
});
