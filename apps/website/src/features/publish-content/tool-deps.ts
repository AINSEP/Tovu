import type { PublishHistoryStore } from "#src/features/deployments/static-publish/publish-history";
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
import type { OutboxPort } from "@jini-ai/cms/core";
import type { CompositeBlobStoreRead } from "./composite-blob-source.js";
import type { PublishContentPorts, PublishContentDeps, EntryPublishPorts, WidgetPublishPorts } from "./type-registry.js";



/** Publish planning needs the complete contributor ports, including taxonomy import lookups.
 * Other tools' read-only repo slices cannot describe these capabilities; composition supplies the
 * same concrete ports it supplies to the HTTP importer. */
interface PublishContentToolSources {
  postRepo: PublishContentPorts["post"]["repo"];
  formDefinitionRepo: PublishContentPorts["form"]["repo"];
  contentTypeRepo: PublishContentPorts["content-type"]["repo"];
  contentTypeIndexProvisioner: PublishContentPorts["content-type"]["indexProvisioner"];
  taxonomyRepo: PublishContentPorts["taxonomy"]["taxonomies"];
  termRepo: PublishContentPorts["taxonomy"]["terms"];
  entryTermRepo: PublishContentPorts["taxonomy"]["entryTerms"];
  taxonomyRevisionRepo: PublishContentPorts["taxonomy"]["revisions"];
  stampWatermark: PublishContentPorts["taxonomy"]["stampWatermark"];
  entryRepo: EntryPublishPorts["entries"] & WidgetPublishPorts["entries"];
  entryRefsRepo: WidgetPublishPorts["entryRefs"];
  widgetBindingRepo: WidgetPublishPorts["bindings"];
  settingsRepo: PublishContentPorts["site-setting"]["settings"];
  principalRepo: PublishContentPorts["site-setting"]["principals"];
  presentationRepo: PublishContentPorts["active-theme"]["presentation"];
  themes: PublishContentPorts["active-theme"]["themes"];
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
  publishContentPorts?: Partial<PublishContentPorts>;
  /** Needed by the shared production content projection for theme-file pulls. */
  fileBlobIndex: NonNullable<PublishContentPorts["theme-files"]["fileBlobIndex"]>;
  mediaRepo: PublishContentPorts["media"]["repo"];
  workspaceRepo: { findById(required: { id: string }): Promise<{ name?: string } | null> };
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
