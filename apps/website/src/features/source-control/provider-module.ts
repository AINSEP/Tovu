import type { HttpClientPort } from "../../platform/http/index.js";

/**
 * @file The contract a git-host provider MODULE (shipped inside an Agent Plugin) is written against.
 *
 * Git-host vendors live in plugins, not core (the bundled `github` plugin ships
 * `content/agent-plugins/github/source-control/github.mjs` today). Core loads a plugin's module
 * through `features/agent-plugins/source-control-registry.ts`, builds it with a
 * {@link SourceControlProviderKit}, and calls the generic operations below: committing the site's
 * static export (`source_control_execute_commit`), reading a token's account name (the admin Source
 * Control page), writing files through a saved custom credential (`custom_credential_write_files`)
 * and pushing a site backup (`site_backup_*`). Nothing here names a vendor.
 *
 * Every operation reports failure as a value, never a throw. `network-unreachable` always means no
 * response arrived (so says nothing about the credential); `provider-error` means the host answered
 * and refused; `diverged` means the branch moved and nothing was overwritten.
 */

/** One file of a site export, repository-relative. */
export interface CommitFile {
  readonly path: string;
  readonly data: string | Buffer;
}

/** One commit of a full site export: the result of {@link SourceControlProvider.commitSite}. */
export type SourceControlCommitResult =
  | {
      ok: true;
      branch: string;
      branchCreated: boolean;
      commitSha: string;
      commitUrl: string;
      filesChanged: number;
      filesDeleted: number;
      /** Paths a previous export owned that this one dropped but that were NOT deleted, because their
       *  live content no longer matches what was written (or was never recorded). Optional so a test
       *  double may omit it. */
      divergedPaths?: readonly string[];
    }
  | { ok: false; code: "repository-not-found" | "no-changes" | "diverged" | "network-unreachable" | "provider-error"; message: string };

export interface CommitSiteInput {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  /** The repository's default branch when omitted. */
  readonly branch?: string;
  readonly commitMessage: string;
  readonly files: readonly CommitFile[];
}

/** A failure of a credentialed call. `logDetail` is for the server log only, never the model. */
export type ProviderCallFailure =
  | { ok: false; code: "provider-error"; message: string }
  | { ok: false; code: "network-unreachable"; message: string; logDetail: string };

/** Where a custom-credential call goes: the credential's own API base URL plus the ready-made
 *  `Authorization` header core built from the saved connection. */
export interface CredentialedRepositoryTarget {
  readonly baseUrl: string;
  readonly authorization: string;
  readonly owner: string;
  readonly repo: string;
}

export interface WriteFile {
  readonly path: string;
  readonly content: string;
}

export interface FileWriteState {
  readonly path: string;
  readonly exists: boolean;
}

/** The read-only reconnaissance a confirmed write builds on, so the commit lands on exactly the tree
 *  the human was shown. */
export interface FileWritePlan {
  readonly parentCommitSha: string;
  readonly baseTreeSha: string;
  readonly fileStates: readonly FileWriteState[];
}

export type FileWritePlanResult = { ok: true; plan: FileWritePlan } | { ok: false; code: "branch-not-found"; message: string } | ProviderCallFailure;

export type CommitFilesResult = { ok: true; commitSha: string; commitUrl: string } | { ok: false; code: "diverged"; message: string } | ProviderCallFailure;

export interface BackupRepositoryState {
  readonly branch: string;
  readonly parentCommitSha: string;
  readonly baseTreeSha: string;
  readonly htmlUrl: string;
  readonly folderExists: boolean;
}

export type InspectBackupRepositoryFailureCode = "repo-not-found" | "repo-not-private" | "no-push-permission" | "repo-empty" | "branch-not-found" | "folder-is-file";

export type InspectBackupRepositoryResult =
  | { ok: true; state: BackupRepositoryState }
  | { ok: false; code: InspectBackupRepositoryFailureCode; message: string }
  | ProviderCallFailure;

export interface UploadedBackupBlob {
  readonly path: string;
  readonly blobSha: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CommitBackupTreeInput extends CredentialedRepositoryTarget {
  readonly branch: string;
  readonly folder: string;
  readonly commitMessage: string;
  readonly parentCommitSha: string;
  readonly baseTreeSha: string;
  readonly htmlUrl: string;
  readonly blobs: readonly UploadedBackupBlob[];
}

/** The host facts a plugin DECLARES in `tovu-source-control.json` (`provider-registry.ts`), carried
 *  on every built provider so core copy and checks can name the host without hard-coding one. */
export interface SourceControlHostFacts {
  /** The `source_control_credential_sets.provider_id` this host serves. */
  readonly id: string;
  /** The host's display name ("GitHub"). */
  readonly label: string;
  /** The API origin a saved custom credential for this host points at (used to pick one when the
   *  caller named none). */
  readonly apiOrigin: string;
  /** The largest single file the host accepts in a push, when it has such a limit. */
  readonly maxFileBytes?: number;
  /** Repository folders the host gives a meaning of its own (GitHub runs whatever is under
   *  `.github/workflows`), so a site backup is never written into or under one. Compared
   *  case-insensitively. */
  readonly reservedPaths?: readonly string[];
  /** Repository folders whose files the host RUNS automatically (GitHub: `.github/workflows`), so a
   *  write confirmation names such a file with an extra warning. Compared exactly and
   *  case-sensitively, from the repository root: the host recognizes no other spelling. */
  readonly workflowPaths?: readonly string[];
}

/** What a provider module's `create()` returns: the operations only. */
export interface SourceControlProviderOperations {
  commitSite(input: CommitSiteInput): Promise<SourceControlCommitResult>;
  /** The account name a token belongs to, or `null` when it cannot be learned. Never throws. */
  readAccountLabel(token: string): Promise<string | null>;
  planFileWrite(input: CredentialedRepositoryTarget & { readonly branch: string; readonly files: readonly WriteFile[] }): Promise<FileWritePlanResult>;
  commitFiles(
    input: CredentialedRepositoryTarget & { readonly branch: string; readonly commitMessage: string; readonly files: readonly WriteFile[] },
    plan: FileWritePlan,
  ): Promise<CommitFilesResult>;
  inspectBackupRepository(input: CredentialedRepositoryTarget & { readonly branch?: string; readonly folder: string }): Promise<InspectBackupRepositoryResult>;
  uploadBackupBlob(target: CredentialedRepositoryTarget, file: { readonly path: string; readonly content: Uint8Array }): Promise<{ ok: true; blob: UploadedBackupBlob } | ProviderCallFailure>;
  commitBackupTree(input: CommitBackupTreeInput): Promise<CommitFilesResult>;
}

/** A built provider: the module's operations plus the host facts its plugin declares, and the
 *  module's own owner/repo rules when it has them. */
export type SourceControlProvider = SourceControlProviderOperations & SourceControlHostFacts & { readonly validateTarget?: RepositoryTargetValidator };

/** A transport error, described without leaking it: `refusal` is set (caller-safe text) only when the
 *  egress policy refused the request; `logDetail` is for the server log. */
export interface DescribedTransportError {
  readonly refusal: string | undefined;
  readonly logDetail: string;
}

/** What a module may call that is not a Node builtin: a plugin ships no npm dependencies. */
export interface SourceControlProviderKit {
  /** Plain `fetch`, looked up at call time. */
  fetch(url: string, init: RequestInit): Promise<Response>;
  /** A `RequestInit` that never follows a redirect. */
  redirectGuardInit(init: RequestInit): RequestInit;
  /** Throws when `response` is a redirect, so a token is never sent on to another host. */
  assertNotRedirected(response: Response, hostName: string): void;
  /** True for the error {@link assertNotRedirected} throws. */
  isRedirectRefusal(error: unknown): boolean;
  /** The guarded outbound-HTTP seam (ADR-038) for credentialed custom-credential calls. */
  readonly httpClient: HttpClientPort;
  describeTransportError(error: unknown): DescribedTransportError;
}

/** A repository named by owner and name, before anything is sent. */
export interface RepositoryTarget {
  readonly owner: string;
  readonly repo: string;
}

/** The host's own owner/repo rules: `null` when valid, else a caller-safe reason naming the field
 *  (e.g. "invalid GitHub owner 'x'"). Pure, never throws. */
export type RepositoryTargetValidator = (target: RepositoryTarget) => string | null;

/** A provider module's default export. */
export interface SourceControlProviderModule {
  create(context: { readonly kit: SourceControlProviderKit }): SourceControlProviderOperations;
  /** Optional, needs no kit, so core can refuse a malformed target before building anything or
   *  raising a dialog. Core still applies its own generic one-path-segment rule afterwards. */
  validateTarget?: RepositoryTargetValidator;
}
