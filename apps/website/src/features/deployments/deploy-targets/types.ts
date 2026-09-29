import type {
  DeployError,
  DeployPublishInput,
  DeployTarget,
  JsonObject,
  checkDeploymentUrl,
  normalizeDeploymentUrl,
  safeDnsLabel,
  safeProjectLabel,
  waitForReachableDeploymentUrl,
} from "@jini-ai/devops/deploy";

/**
 * @file The host contract a deploy-target MODULE (shipped inside an Agent Plugin) is written against.
 *
 * Owner decision 2026-09-29: vendor host code lives in the Tovu `deploy` agent plugin, and
 * `@jini-ai/devops` keeps only the generic port. Hosts are dependency-injected: this app loads a
 * plugin's module (`registry.ts`), hands it a {@link DeployHostKit}, and gets back a plain devops
 * `DeployTarget`. Nothing in this file names a vendor.
 *
 * Two shapes here belong in `@jini-ai/devops` itself and are declared locally only until it ships
 * them (see `ADS-memory/reports/2026-09-29-deploy-agent-plugin-plan.md` §10, J1 and J1b):
 * {@link HostDeployPublishInput}'s `responseHeaders` and the {@link DeployHostKit} /
 * {@link DeployTargetModule} pair. When devops exports them, these become re-exports.
 */

/** A header set the host wants every published page served with. Each target renders it into its
 *  own host format (a `_headers` file, a `vercel.json`, ...) or ignores it where the host has none. */
export type ResponseHeaderSet = Readonly<Record<string, string>>;

/** `DeployPublishInput` plus the J1 field. Structurally a superset, so a target written against it
 *  still satisfies devops' `DeployTarget.publish`. */
export interface HostDeployPublishInput extends DeployPublishInput {
  responseHeaders?: ResponseHeaderSet;
}

/** The resolved saved credential a module builds its target from: always a `token`, plus whatever
 *  extra fields that host's credential carries (an account id, bucket coordinates, ...). */
export type DeployTargetCredential = { readonly token: string } & Readonly<Record<string, string | undefined>>;

/** The per-call timeout classes the kit's `fetch` is used with. Same values as
 *  `@jini-ai/platform`'s `FETCH_TIMEOUT_MS`, which this app does not depend on directly. */
export interface DeployFetchTimeouts {
  readonly QUICK: number;
  readonly DEPLOY: number;
  readonly UPLOAD: number;
}

/**
 * Everything a module may call that is not a Node builtin. A plugin ships no npm dependencies (it is
 * copied verbatim into `packages/sha256/<digest>/`, where nothing could resolve one), so the host
 * passes these in.
 */
export interface DeployHostKit {
  /** `fetch`, aborted after `options.timeoutMs`. */
  fetch(url: string, init: RequestInit, options: { readonly timeoutMs: number }): Promise<Response>;
  readonly timeouts: DeployFetchTimeouts;
  /** Delay between poll attempts. Injected so a test never waits in real time. */
  sleep(ms: number): Promise<void>;
  readonly checkDeploymentUrl: typeof checkDeploymentUrl;
  readonly waitForReachableDeploymentUrl: typeof waitForReachableDeploymentUrl;
  readonly normalizeDeploymentUrl: typeof normalizeDeploymentUrl;
  readonly safeDnsLabel: typeof safeDnsLabel;
  readonly safeProjectLabel: typeof safeProjectLabel;
  readonly DeployError: typeof DeployError;
}

export interface DeployTargetCreateContext {
  readonly credential: DeployTargetCredential;
  readonly config: JsonObject;
  readonly kit: DeployHostKit;
}

/**
 * A deploy-target module's default export. Only `create` is required; the rest have host defaults
 * (no config errors, no base path, no summary rows).
 */
export interface DeployTargetModule {
  create(context: DeployTargetCreateContext): DeployTarget;
  /** A human-readable config error, or `null` when `config` is usable. */
  validateConfig?(config: JsonObject): string | null;
  /** The path prefix the host serves the site from, when it is not the root. */
  basePath?(config: JsonObject): string | undefined;
}

/** One entry of a plugin's `tovu-deploy-targets.json`. `id` is byte-identical to the legacy provider
 *  id for existing hosts: sealed credentials and publish history rows are keyed by it. */
export interface DeployTargetDescriptor {
  readonly id: string;
  readonly label: string;
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
}

export interface LoadedDeployTarget {
  readonly descriptor: DeployTargetDescriptor;
  readonly pluginId: string;
  readonly module: DeployTargetModule;
}

export interface DeployTargetRegistry {
  get(targetId: string): LoadedDeployTarget | undefined;
  list(): readonly LoadedDeployTarget[];
  /** Log-safe, one sentence per plugin or target that was NOT loaded, and why. */
  readonly refusals: readonly string[];
}
