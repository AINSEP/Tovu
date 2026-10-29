import type { LoadInstalledDeployTargets } from "./deploy-targets/types.js";
import type { LoadPluginCredentialCards } from "../custom-credentials/plugin-credential-card.js";
import type { SiteConsentService } from '#src/features/consent/service';
import type { GatewayDeps } from '#src/contracts/core/gated-mutations/gateway';
import type { OperatorLocaleDeps } from '../../contracts/headless/operator-locale.js';
import type { CredentialCopyToolDeps } from '../custom-credentials/index.js';
import type { Clock } from "@jini-ai/core/primitives";
import type { ExportReport } from "#src/features/site-export/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import type { PublishExecutionMode } from "./publish-credentials/index.js";
import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js";
import type { DeployTargetRegistry } from "./deploy-targets/types.js";
import type { ObservabilityPort } from "#src/platform/observability/index";
import type { PublishCredentialSource, PublishCredentialVerificationCache, PublishHistoryStore, StaticPublishDeps } from "./static-publish/index.js";



/** Composition-root-bound export operation, typed locally to avoid cross-feature type coupling.
 * The composition root closes over full application dependencies; this feature passes only options.
 */
type ExportSiteBoundFn = (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;


/** Only ports the tool handlers read, declared structurally without importing RouteDeps.
 * A real publish needs the full application graph for export; exportSiteBound captures it at the
 * composition root, so that requirement does not widen this feature's dependency contract.
 * Every other field is a direct port type, never indexed from the composition root's wide bag.
 */
export interface StaticPublishToolDeps extends OperatorLocaleDeps {
  readonly loadPluginCredentialCards?: LoadPluginCredentialCards;
  readonly siteConsent?: Pick<SiteConsentService, "deploymentCheck">;
  /** Existing shared gateway; required when publishing with infrastructure changes. */
  readonly gatedMutations?: { readonly gatewayDeps: GatewayDeps };
  readonly hostKit?: StaticPublishDeps["hostKit"];
  /** `RouteDeps.formDestination`: the site's forms and receiver key, for a host that receives submissions. */
  readonly formDestination?: StaticPublishDeps["formDestination"];
  readonly localCredentialCopy?: CredentialCopyToolDeps['localCredentialCopy'];
  readonly ownerPrincipalId?: Promise<string>;
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly idGen: { newId(): string };
  readonly siteAssistantSecretSealer: SecretSealerPort;
  readonly siteAssistantSecretKeyring: KeyringPort;
  readonly publishExecutionMode: PublishExecutionMode;
  readonly publishHistoryStore: PublishHistoryStore;
  readonly publishCredentialVerificationCache: PublishCredentialVerificationCache;
  readonly vendorCredentialSetRepo: VendorCredentialSetRepoPort;
  /** `RouteDeps.publishOutputRootDir`, threaded down for the same reason `exportSiteBound` above is —
   *  `publishStaticSite`'s `StaticPublishInput.publishOutputRootDir` needs it directly. */
  readonly publishOutputRootDir: string;
  /** The pre-bound export call — see {@link ExportSiteBoundFn}'s own doc above for what it is and why
   *  it replaces the `routeDeps: RouteDeps` field this interface used to carry (via `extends RouteDeps`). */
  readonly exportSiteBound: ExportSiteBoundFn;
  /** Test-only override — when supplied, replaces the composed `PublishCredentialSource` entirely
   *  (DB-backed + env-fallback composition, `vendorCredentialSetRepo`/`siteAssistantSecretSealer`/
   *  `publishExecutionMode` are all ignored). Production never sets this. */
  credentialSource?: PublishCredentialSource;
  /** Test-only override for `publishStaticSite`'s own `StaticPublishDeps.buildTarget` — lets a test
   *  substitute a fake `DeployTarget` so `deployment_execute_static_publish`'s CONFIRMED path can be
   *  exercised end-to-end without ever constructing a real host plugin's
   *  client or touching `fetch` (mirrors `static-publish/adapter.ts`'s own test-injection seam,
   *  "adapter tests with a faked deploy target — do not hit real providers in tests"). Production
   *  never sets this — `publishStaticSite`'s own default (the real Jini adapters) applies. */
  buildTarget?: StaticPublishDeps["buildTarget"];
  /** `RouteDeps.loadDeployTargets` — this workspace's deploy registry, which decides which config
   *  fields a target takes and judges them. Production composition injects the installed deploy Agent Plugin
   *  (`loadDeployTargetRegistry`); a test injects a registry read from the plugin's source. */
  loadDeployTargets: (workspaceId: string) => Promise<DeployTargetRegistry>;
  /** Installed metadata; production binds the data contribution loader, never executable discovery. */
  readonly loadInstalledDeployTargets?: LoadInstalledDeployTargets;
  /** Post-save connection checks share the verifier's HTTP seam; fixtures never need real egress. */
  readonly fetchFn?: typeof fetch;
  /** Test-only override for `RouteDeps.publishHistoryStore` (2026-08-16 rework — that field is now
   *  the real, DB-backed `SqlitePublishHistoryStore` in production; see `routes/types.ts`'s own doc)
   *  — lets a test inject an `InMemoryPublishHistoryStore` so it can assert on a recorded publish (or
   *  a capabilities read) without touching a real database. Passed straight through to
   *  `runPublishAndAwait` on a confirmed publish AND used by the capabilities handler's own read, so a
   *  test sees one consistent store on both sides. Production never sets this; both paths fall back to
   *  `deps.publishHistoryStore`, so a real publish's history is visible to this tool with no wiring
   *  change outside this domain (see `publish-run.ts`'s header, "Publish history"). */
  historyStore?: PublishHistoryStore;
  /** `RouteDeps.observability`, forwarded so a confirmed publish's deploy egress is traced. */
  readonly observability?: ObservabilityPort;
  readonly tracker?: import("@jini-ai/diagnostics/observability").Tracker;
}
