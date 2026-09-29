import type {
  DeployError,
  assertNotRedirected,
  DeployPublishInput,
  DeployTarget,
  JsonObject,
  checkDeploymentUrl,
  normalizeDeploymentUrl,
  redirectGuardInit,
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

/** What {@link DeployHostKit.createSigV4Client} takes: an access-key pair scoped to one service and
 *  region, the shape every S3-compatible store (and any other SigV4 API) signs with. */
export interface SigV4ClientOptions {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly service: string;
  readonly region: string;
}

/** A client whose `fetch` signs each request with AWS Signature Version 4 before sending it through
 *  the global `fetch`, retrying a 5xx/429 with backoff the way `aws4fetch`'s `AwsClient` does. */
export interface SigV4Client {
  fetch(input: string, init?: RequestInit): Promise<Response>;
  /** Signs a request without sending it, so the caller can send it through `DeployHostKit.fetch`. */
  sign(input: string, init?: RequestInit): Promise<Request>;
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
  /** devops' redirect guard: a request built with `redirectGuardInit` never follows a redirect, and
   *  `assertNotRedirected` fails a 3xx instead of sending the token on to another host. */
  readonly redirectGuardInit: typeof redirectGuardInit;
  readonly assertNotRedirected: typeof assertNotRedirected;
  /** A SigV4-signing client (a protocol, not a vendor: S3, R2, B2, MinIO and others all speak it). */
  createSigV4Client(options: SigV4ClientOptions): SigV4Client;
  readonly DeployError: typeof DeployError;
}

export interface DeployTargetCreateContext {
  readonly credential: DeployTargetCredential;
  readonly config: JsonObject;
  readonly kit: DeployHostKit;
}

/** One credential check's raw outcome. `rejected`: the host answered and refused the credential (the
 *  person must replace it). `unreachable`: a transport failure, timeout or unexpected status that
 *  says nothing about the credential itself. `accountLabel` is the account's PUBLIC handle only
 *  (never an email, plan or org), and only from a host whose descriptor sets `yieldsAccountLabel`. */
export type DeployCredentialCheck =
  | { readonly ok: true; readonly accountLabel?: string }
  | { readonly ok: false; readonly reason: "rejected" | "unreachable"; readonly statusCode?: number };

export interface DeployCredentialCheckContext {
  readonly credential: DeployTargetCredential;
  readonly kit: DeployHostKit;
}

/**
 * A deploy-target module's default export. Only `create` is required; the rest have host defaults
 * (no config errors, no base path, no summary rows, no credential check).
 */
export interface DeployTargetModule {
  create(context: DeployTargetCreateContext): DeployTarget;
  /** A human-readable config error, or `null` when `config` is usable. */
  validateConfig?(config: JsonObject): string | null;
  /** The path prefix the host serves the site from, when it is not the root. */
  basePath?(config: JsonObject): string | undefined;
  /** The confirmation/outcome card rows for `config`, when the host reads better than one row per
   *  config field (a repository as `owner/repo`, for example). */
  summarize?(config: JsonObject): readonly { readonly label: string; readonly value: string }[];
  /** ONE bounded, read-only authenticated request against the host's own API. May throw: the host
   *  folds any throw into `unreachable`. Never returns the credential or a response body. */
  verifyCredential?(context: DeployCredentialCheckContext): Promise<DeployCredentialCheck>;
  /** Steps the person applies in their own host console before the site is reachable (making a
   *  storage bucket public, for example). Pure: no request, no credential. `fields` are the non-secret
   *  credential fields the agent passed. Throws a plain `Error` with a person-facing message for a
   *  missing field. */
  hostingSetup?(input: { readonly fields: Readonly<Record<string, string>> }): DeployHostingSetup;
}

/** A module's hosting-setup answer, relayed to the person as prose plus copyable `consoleJson`. */
export interface DeployHostingSetup {
  /** Which flavour of the host the steps are for, when the module tells them apart. */
  readonly provider?: string;
  readonly steps: readonly { readonly title: string; readonly description: string; readonly consoleJson?: string }[];
  /** Relayed verbatim when non-empty. */
  readonly warning: string;
}

/** One entry of a plugin's `tovu-deploy-targets.json`. `id` is byte-identical to the legacy provider
 *  id for existing hosts: sealed credentials and publish history rows are keyed by it. */
export interface DeployTargetDescriptor {
  readonly id: string;
  readonly label: string;
  /** Plugin-relative path of the `.mjs` module. */
  readonly module: string;
  /** Per-publish settings the person supplies (a repository, a team), in display order. Read from a
   *  publish request under the same names; values are strings. Empty when the host needs none. */
  readonly configFields: readonly DeployTargetFieldSpec[];
  /** The server-environment credential fallback. Absent when the host has none. */
  readonly env?: DeployTargetEnvFallback;
  /** What a saved connection for this host holds. Absent when the host takes no saved credential. */
  readonly credential?: DeployTargetCredentialSpec;
}

/**
 * A host's saved credential: flat string fields, sealed as one JSON object together with its
 * `providerId` (the target id). `tokenField` names the required field that becomes the resolved
 * credential's `token`; every other field is handed to the module under its own name.
 */
export interface DeployTargetCredentialSpec {
  /** The account/company the credential authenticates to (`vendor_credential_sets.vendor_id`). */
  readonly vendorId: string;
  /** The name a credential-check message uses ("GitHub accepted this credential."). Defaults to the
   *  target's `label`. */
  readonly vendorLabel?: string;
  /** The module's `verifyCredential` can return an `accountLabel`, so a saved row without one is
   *  worth re-checking in the background. */
  readonly yieldsAccountLabel?: true;
  /** Shown above the credential form's fields (what to have ready before filling it in). */
  readonly help?: string;
  readonly tokenField: string;
  readonly fields: readonly DeployTargetFieldSpec[];
}

/** One named string field a person fills in. */
export interface DeployTargetFieldSpec {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  readonly help?: string;
  /** Never echoed back once saved (credential fields only). */
  readonly secret?: true;
}

/** Where an env-configured install finds a target's credential: the first set `tokenVars` entry
 *  is the token, and each `fields` entry names the env var that supplies that extra credential field
 *  (all required). */
export interface DeployTargetEnvFallback {
  readonly tokenVars: readonly string[];
  readonly fields?: Readonly<Record<string, string>>;
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
