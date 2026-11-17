import type { PublishHistoryStore } from "#src/features/deployments/static-publish/index";
import type { Clock } from "@jini-ai/core/primitives";
import type { requireToolPermission } from "@jini-ai/cms/core";
import type { GatewayDeps } from "../../contracts/core/gated-mutations/gateway.js";
import type { BuildPublishContentImportHooksInput } from "./gated-hooks.js";
import type { PublishContentRunRepoPort } from "./run-repo.js";
import type { PublishContentPullDeps } from "./pull.js";
import type { PublishTrustProvisioningPort } from "../publish-trust/provisioning.js";
import type { resolvePublishDestinationCredential } from "./destination-credential.js";
import type { PublishContentPeerRepoPort } from "./peers.js";
import type { BeforeSaveHookPort } from "#src/features/post/index";
import type { OutboxPort } from "@jini-ai/core/contracts/events";
import type { CompositeBlobStoreRead } from "./composite-blob-source.js";
import type { PublishContentDeps } from "./type-registry.js";
import type { TovuPublishPorts, EntryPublishPorts, WidgetPublishPorts } from "./tovu-publish-ports.js";



/** Publish planning needs the complete contributor ports, including taxonomy import lookups.
 * Other tools' read-only repo slices cannot describe these capabilities; composition supplies the
 * same concrete ports it supplies to the HTTP importer. */
interface PublishContentToolSources {
  postRepo: TovuPublishPorts["post"]["repo"];
  formDefinitionRepo: TovuPublishPorts["form"]["repo"];
  contentTypeRepo: TovuPublishPorts["content-type"]["repo"];
  contentTypeIndexProvisioner: TovuPublishPorts["content-type"]["indexProvisioner"];
  taxonomyRepo: TovuPublishPorts["taxonomy"]["taxonomies"];
  termRepo: TovuPublishPorts["taxonomy"]["terms"];
  entryTermRepo: TovuPublishPorts["taxonomy"]["entryTerms"];
  taxonomyRevisionRepo: TovuPublishPorts["taxonomy"]["revisions"];
  stampWatermark: TovuPublishPorts["taxonomy"]["stampWatermark"];
  entryRepo: EntryPublishPorts["entries"] & WidgetPublishPorts["entries"];
  entryRefsRepo: WidgetPublishPorts["entryRefs"];
  widgetBindingRepo: WidgetPublishPorts["bindings"];
  settingsRepo: TovuPublishPorts["site-setting"]["settings"];
  principalRepo: TovuPublishPorts["site-setting"]["principals"];
  presentationRepo: TovuPublishPorts["active-theme"]["presentation"];
  themes: TovuPublishPorts["active-theme"]["themes"];
}


export interface PublishContentToolDeps extends PublishContentPullDeps, PublishContentToolSources {
  blobStore: PublishContentPullDeps["blobStore"] & CompositeBlobStoreRead;
  gatedMutations: { gatewayDeps: GatewayDeps };
  publishContentBaselineRepo: BuildPublishContentImportHooksInput["baselineRepo"];
  publishContentRunRepo: PublishContentRunRepoPort;
  publishContentApplyPort: BuildPublishContentImportHooksInput["applyPort"];
  publishContentSeedHash?: BuildPublishContentImportHooksInput["getSeedHash"];
  restorePointsRepo: BuildPublishContentImportHooksInput["restorePointsRepo"];
  dbOps: BuildPublishContentImportHooksInput["dbOps"] & {
    getCapabilities(): Promise<{ restorePoint: { costClass: "cheap" | "expensive" | "unavailable" } }>;
  };
  /** Composition injects the SAME projection the HTTP importer uses, without a feature->server import. */
  makePublishContentDeps?: () => PublishContentDeps;
  workspaceId: string;
  authorize: PublishContentToolAuthorize;
  clock: Clock;
  idGen: { newId(): string };
  pluginBeforeSaveHook: BeforeSaveHookPort | undefined;
  outbox: OutboxPort | undefined;
  /** One-bag-per-type ports for callers supplying an explicit projection. Production uses
   *  makePublishContentDeps so pulls share the HTTP importer's complete projection. */
  publishContentPorts?: Partial<TovuPublishPorts>;
  /** Needed by the shared production content projection for theme-file pulls. */
  fileBlobIndex: NonNullable<TovuPublishPorts["theme-files"]["fileBlobIndex"]>;
  mediaRepo: TovuPublishPorts["media"]["repo"];
  workspaceRepo: { findById(required: { id: string }, optional?: {}): Promise<{ name?: string } | null> };
  publishContentPeerRepo: PublishContentPeerRepoPort;
  publishHistoryStore?: PublishHistoryStore;
  publishContentPeerHttpClient: Parameters<typeof resolvePublishDestinationCredential>[0]["deps"]["httpClient"];
  siteAssistantSecretSealer: Parameters<typeof resolvePublishDestinationCredential>[0]["deps"]["sealer"];
  siteAssistantSecretKeyring: Parameters<typeof resolvePublishDestinationCredential>[0]["deps"]["keyring"];
  /** Test seam. Absent in production, where the committed-config port is composed below. */
  publishTrustProvisioning?: PublishTrustProvisioningPort;
  /** Test seam. Absent in production, where the repo's own deploy config is read. */
  findPublishCandidate?: () => Promise<string | null>;
}


type PublishContentToolAuthorize = Parameters<typeof requireToolPermission>[0]["authorize"];
