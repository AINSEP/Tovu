import type { DescriptorI18n } from "#src/features/agent-plugins/descriptor-i18n";
import type { DeployPublishInput, DeployTargetModule as DevopsDeployTargetModule, JsonObject } from "@jini-ai/devops/deploy";

/**
 * @file The host contract a deploy-target MODULE (shipped inside an Agent Plugin) is written against.
 *
 * Owner decision 2026-09-29: vendor host code lives in the Tovu `deploy` agent plugin, and
 * `@jini-ai/devops` keeps only the generic port. Hosts are dependency-injected: this app loads a
 * plugin's module (`registry.ts`), hands it a {@link DeployHostKit}, and gets back a plain devops
 * `DeployTarget`. Nothing in this file names a vendor.
 *
 * The injection contract itself (the kit, the credential, the create/check contexts, the response
 * header set) is `@jini-ai/devops/deploy`'s since 0.4.0 and is re-exported here unchanged. Only the
 * Tovu-specific module extras ({@link DeployTargetModule}'s `summarize`/`hostingSetup`) and the
 * plugin descriptor shapes are declared locally.
 */

export type {
  DeployCredentialCheck,
  DeployCredentialCheckContext,
  DeployFetchTimeouts,
  DeployHostKit,
  DeployTargetCreateContext,
  DeployTargetCredential,
  ResponseHeaderSet,
  SigV4Client,
  SigV4ClientOptions,
} from "@jini-ai/devops/deploy";

/** devops' `DeployPublishInput`, which carries `responseHeaders` since 0.4.0. Kept as a name so
 *  existing call sites read unchanged. */
export type HostDeployPublishInput = DeployPublishInput;

/**
 * A deploy-target module's default export: devops' {@link DevopsDeployTargetModule} plus two
 * Tovu-only extras. Only `create` is required; the rest have host defaults (no config errors, no
 * base path, no summary rows, no credential check, no hosting steps).
 */
export interface DeployTargetModule extends DevopsDeployTargetModule {
  /** The confirmation/outcome card rows for `config`, when the host reads better than one row per
   *  config field (a repository as `owner/repo`, for example). */
  summarize?(config: JsonObject): readonly { readonly label: string; readonly value: string }[];
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
  /** What the publish form calls the per-publish project name for this host (a commit message, a
   *  site name). Absent: the generic "Project name". */
  readonly projectName?: DeployTargetProjectNameCopy;
  /** The server-environment credential fallback. Absent when the host has none. */
  readonly env?: DeployTargetEnvFallback;
  /** What a saved connection for this host holds. Absent when the host takes no saved credential. */
  readonly credential?: DeployTargetCredentialSpec;
  /** Translations of this target's own person-facing text, keyed by locale then by the English
   *  string (`features/agent-plugins/descriptor-i18n.ts`). Absent: English only. */
  readonly i18n?: DescriptorI18n;
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
  /** The same guidance written for the person; the admin shows it over {@link help} when present. */
  readonly userHelp?: string;
  /** The host's own page for creating the credential (https), linked from the credential form. */
  readonly tokenPageUrl?: string;
  readonly tokenField: string;
  readonly fields: readonly DeployTargetFieldSpec[];
}

/** What the publish form's project-name field means for one host. */
export interface DeployTargetProjectNameCopy {
  readonly label: string;
  readonly help?: string;
}

/** One named string field a person fills in. */
export interface DeployTargetFieldSpec {
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  readonly help?: string;
  /** The help a PERSON sees in the admin form, when it should read differently from `help` (which
   *  the agent sees as the field's hint). Absent = the form shows `help`. */
  readonly userHelp?: string;
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
