import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import type { ExportFailureSummary, ExportReport } from "#src/export/index";

import { resolveDefaultForSourceControl } from "./store.js";
import type { SourceControlCredentialSetRepoPort } from "./types.js";

const require = createRequire(import.meta.url);

/**
 * @file The `source-control` domain's "business" layer — everything `source_control_execute_commit`
 * (`tool-registrations.ts`) needs on a confirmed commit, minus the MCP-UI mechanics. Deliberately its
 * own file, mirroring `features/deployments/static-publish/adapter.ts`'s split from
 * `publish-agent-tools.ts`: the tool-wiring layer owns the confirmation dialog and the exchange
 * park/resume, this layer owns "run a fresh export, resolve a credential, and push a real commit" —
 * directly unit-testable with a faked {@link GitHubCommitAdapter}, no surface-exchange store involved.
 *
 * Purpose:
 * "Wrap it, do not reimplement," same discipline `adapter.ts`'s own header states — this module runs
 * Tovu's real static exporter (`#src/export`'s `exportSite`, the SAME engine every publish target and
 * the admin's manual export route already drive), maps the resulting `ExportReport` into the flat
 * `{path, data}` shape {@link GitHubCommitAdapter.commit} takes, and hands that off. It does no GitHub
 * HTTP itself — that lives in `github-git-provider.ts`, injected here as {@link CommitSiteDeps.gitAdapter}.
 *
 * No base path: unlike `static-publish/adapter.ts`'s `computeBasePath` (needed because a GitHub Pages
 * PROJECT site serves from `/<repo>`), a source-control commit is not a hosted site at all — nothing
 * here ever calls `exportSite` with a `basePath`, regardless of provider.
 *
 * Repo root only: this pass commits at the target repository's root, matching every static-publish
 * target's own no-subdirectory assumption (owner decision, 2026-08-16 review — no `path`/subdirectory
 * field exists anywhere in this feature's schemas, and none should be added speculatively).
 *
 * Never throws for an expected outcome: every failure (no credential, invalid target shape, a genuine
 * credential decrypt failure, a failed export, nothing changed, a diverged branch, an unreachable
 * network, a rejected provider call) is returned as `{ok: false, code, message}` — see
 * {@link SourceControlCommitOutcome}'s own header for why each code is its own, not folded into a
 * generic failure, and {@link commitSiteToSourceControl}'s own doc for why this is a real, enforced
 * contract rather than an aspirational one.
 *
 * Architectural role:
 * `features/source-control` domain logic, this feature's one seam into `github-git-provider.ts`. No
 * dependency on `features/deployments/**` — this feature's identity table and Git Data API adapter
 * are its own, deliberately not sharing `publish-credentials`' resolve path (see `store.ts`'s header
 * for why `source_control_credential_sets` is a separate table) or `static-publish/adapter.ts`'s
 * `toDeployFile`/`exportSiteLazily` (a ~6-line duplication, not a shared helper — see this file's
 * `exportSiteLazily` below for why importing the sibling domain's copy would be wrong, not merely
 * redundant).
 */

/** GitHub owner/org name: alphanumeric, may contain single hyphens, cannot start with one, capped at
 *  GitHub's own 39-character username limit. Byte-identical to `static-publish/adapter.ts`'s
 *  `OWNER_PATTERN` — copied, not imported, per this file's header (no dependency on
 *  `features/deployments/**`). */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** GitHub repo name: letters, digits, `.`/`-`/`_`, capped at GitHub's own 100-character limit. */
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
/** Git branch name — permissive (real branch names allow far more), but refuses whitespace/control
 *  characters before the value reaches a URL path segment. */
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,250}$/;
const MAX_COMMIT_MESSAGE_LENGTH = 500;

/**
 * Validates a commit target's shape. Called twice by design: once by `tool-registrations.ts`'s handler
 * BEFORE opening the confirmation dialog (a caller with an invalid target never causes a dialog to be
 * raised — same discipline `deployment_execute_static_publish` applies to its own early
 * `validateStaticPublishConfig` call), and again here, defense-in-depth, for any future caller of
 * {@link commitSiteToSourceControl} that skips the tool layer's own check.
 *
 * @returns `null` when valid, else a human-readable reason safe to return over a tool-result boundary
 *   (never echoes more than the offending field, capped, never a token — there is none in scope here).
 * @complexity O(1) — a handful of fixed-size regex tests.
 */
export function validateCommitTarget(input: { owner: string; repo: string; branch?: string; commitMessage: string }): string | null {
  if (!OWNER_PATTERN.test(input.owner)) return `invalid GitHub owner '${input.owner.slice(0, 60)}'`;
  if (!REPO_PATTERN.test(input.repo) || input.repo === "." || input.repo === "..") return `invalid GitHub repo '${input.repo.slice(0, 100)}'`;
  if (input.branch !== undefined && !BRANCH_PATTERN.test(input.branch)) return `invalid branch name '${input.branch.slice(0, 60)}'`;
  if (input.commitMessage.trim() === "" || input.commitMessage.length > MAX_COMMIT_MESSAGE_LENGTH) {
    return `commitMessage must be 1-${MAX_COMMIT_MESSAGE_LENGTH} characters`;
  }
  return null;
}

/** One file this commit will write, already deploy/commit-relative — the flat shape
 *  {@link GitHubCommitAdapter.commit} takes. Mirrors `static-publish/adapter.ts`'s `DeployFile`
 *  shape exactly (same underlying `ExportedRoute`/`ExportedAsset` source), declared locally rather
 *  than imported — this feature has no dependency on `@jini-ai/devops/deploy`, whose `DeployFile`
 *  this happens to resemble only because both ultimately describe "one exported file." */
export interface CommitFile {
  readonly path: string;
  readonly data: string | Buffer;
}

/** Normalizes an `ExportedRoute`/`ExportedAsset`'s `outputFile` (already commit-relative, per that
 *  interface's own doc) to forward slashes — same reasoning `static-publish/adapter.ts`'s own
 *  `toDeployFile` documents: `path.relative` uses the platform separator, and a stray backslash on a
 *  Windows host would be a wrong path in a git tree entry, not a normalized one. */
export function toCommitFile(entry: { outputFile: string; data: string | Buffer }): CommitFile {
  return { path: entry.outputFile.split(path.sep).join("/"), data: entry.data };
}

/** The resolved credential {@link GitHubCommitAdapter.commit} is called with — this feature's GitHub
 *  connection is `{providerId, token}` only (`types.ts`'s `GitHubSourceControlConnectionInput`), so
 *  this is simpler than `static-publish/adapter.ts`'s `ResolvedPublishCredential` (which carries
 *  provider-specific extra fields for four OTHER providers this feature does not have). */
export interface ResolvedSourceControlCredential {
  readonly token: string;
}

/** One real commit attempt's outcome from the GitHub Git Data API adapter — see
 *  `github-git-provider.ts`'s own header for the full per-code reasoning, most importantly the
 *  `"network-unreachable"` vs `"provider-error"` split (a thrown `fetch` error vs. an HTTP response
 *  that came back non-2xx are never conflated into one code) and `"diverged"` (a non-fast-forward
 *  branch update is refused, never force-overwritten — see that file's header for why). */
export type GitHubCommitAdapterResult =
  | {
      ok: true;
      branch: string;
      branchCreated: boolean;
      commitSha: string;
      commitUrl: string;
      filesChanged: number;
      filesDeleted: number;
      /** Paths this adapter previously recorded owning that the CURRENT export no longer produces, but
       *  did NOT delete — either their live content diverged from what this adapter itself last wrote
       *  (a human, or something else, touched them since), or the previous manifest recorded no
       *  provenance for them at all (a pre-provenance `v1` manifest). Optional so an older/fake adapter
       *  (e.g. a test double) that omits it is still a valid result — see `github-git-provider.ts`'s
       *  header, SECOND-ROUND CRITICAL FIX note, finding 1, for the full reasoning. */
      divergedPaths?: readonly string[];
    }
  | { ok: false; code: "repository-not-found" | "no-changes" | "diverged" | "network-unreachable" | "provider-error"; message: string };

/** The one seam between this file and real GitHub HTTP — `commitSiteToSourceControl` calls exactly
 *  one method, mirroring `@jini-ai/devops/deploy`'s own single-method `DeployTarget.publish()` shape
 *  (no pre-flight/plan call: the same "no network before a human confirms" discipline
 *  `deployment_execute_static_publish` already holds for `publishStaticSite`, unbroken here — a
 *  repository-not-found/diverged-branch/network-unreachable outcome is discovered DURING this one
 *  call, post-confirm, never before). */
export interface GitHubCommitAdapter {
  commit(input: {
    readonly token: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch?: string;
    readonly commitMessage: string;
    readonly files: readonly CommitFile[];
  }): Promise<GitHubCommitAdapterResult>;
}

/**
 * Every outcome {@link commitSiteToSourceControl} can produce — one variant per row of this feature's
 * own proposal doc's failure-contract table (`ADS-memory/reports/2026-08-16-source-control-tools.md`).
 * `NO_CHANGES`/`DIVERGED_BRANCH`/`REPOSITORY_NOT_FOUND`/`NETWORK_UNREACHABLE`/`PROVIDER_ERROR` are all
 * discovered post-confirm (this function's own single call to `GitHubCommitAdapter.commit`), never
 * pre-dialog — `tool-registrations.ts`'s handler only ever pre-checks credential PRESENCE (a cheap,
 * non-decrypting DB read), matching `deployment_execute_static_publish`'s own "one cheap pre-check,
 * everything else discovered after confirm" shape.
 */
export type SourceControlCommitOutcome =
  | { ok: false; code: "INVALID_CONFIG"; message: string }
  | { ok: false; code: "NO_CREDENTIALS_CONFIGURED"; message: string }
  | { ok: false; code: "EXPORT_FAILED"; message: string }
  | { ok: false; code: "REPOSITORY_NOT_FOUND"; message: string }
  | { ok: false; code: "NO_CHANGES"; message: string }
  | { ok: false; code: "DIVERGED_BRANCH"; message: string }
  | { ok: false; code: "NETWORK_UNREACHABLE"; message: string }
  | { ok: false; code: "PROVIDER_ERROR"; message: string }
  | {
      ok: true;
      owner: string;
      repo: string;
      branch: string;
      branchCreated: boolean;
      commitSha: string;
      commitUrl: string;
      filesChanged: number;
      filesDeleted: number;
      /** See {@link GitHubCommitAdapterResult}'s own doc — passed through verbatim, always present
       *  (defaults to `[]`) for the real adapter, so a caller can tell a human exactly what survived a
       *  shrinking publish because it could not be verified as still Tovu's own. */
      divergedPaths: readonly string[];
    };

export interface CommitSiteDeps {
  readonly credentialDeps: { repo: SourceControlCredentialSetRepoPort; sealer: SecretSealerPort; keyring?: KeyringPort };
  /** The real GitHub Git Data API adapter when omitted (`github-git-provider.ts`'s
   *  `realGitHubCommitAdapter`) — tests inject a fake here instead of touching `fetch`, same seam
   *  shape `StaticPublishDeps.buildTarget` gives `static-publish/adapter.ts`. */
  readonly gitAdapter?: GitHubCommitAdapter;
}

/**
 * The composition-root-bound export call this domain takes instead of `RouteDeps` itself
 * (2026-08-20 RouteDeps-narrowing fix, superseding `b6144774`'s config-only attempt — see
 * `tool-registrations.ts`'s own `SourceControlToolDeps` doc for the fuller design rationale).
 * Deliberately NOT named anything close to `RouteDeps.runExportSite`
 * (`server/routes/types.ts`) — that field is `ExportEngine<RouteDeps>`, which takes a `routeDeps`
 * parameter the caller must supply on every call; THIS function takes none, because `RouteDeps` is
 * already closed over at the composition root (`server/app.ts`'s `createRouteDeps()`/
 * `server/deps.ts`'s `createSqliteRouteDeps()`, bound as `RouteDeps.exportSiteBound`). Naming the two
 * similarly was reviewed and rejected specifically because a caller mixing them up (passing a
 * `routeDeps` field this function does not want, or omitting one `runExportSite` requires) would
 * still type-check — see this domain's own `tool-registrations.ts` for where that exact class of bug
 * was caught during this fix. Declared locally, never imported from `RouteDeps` or from
 * `features/deployments/static-publish/adapter.ts`'s identical copy — same "duplicate the tiny type,
 * never share across features" convention this file already follows for `OWNER_PATTERN`/
 * `exportSiteLazily`'s own former copy.
 */
export type ExportSiteBoundFn = (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;

export interface CommitSiteInput {
  readonly workspaceId: UUID;
  /** `RouteDeps.sourceControlExportRootDir`, threaded down rather than the whole `RouteDeps` bag —
   *  see `exportSiteBound`'s own doc immediately below for why. */
  readonly sourceControlExportRootDir: string;
  readonly idGen: { newId(): string };
  /** The pre-bound export call — see {@link ExportSiteBoundFn}'s own doc for what it is and why it
   *  replaces the `routeDeps: RouteDeps` field this input used to carry. */
  readonly exportSiteBound: ExportSiteBoundFn;
  readonly owner: string;
  readonly repo: string;
  readonly branch?: string;
  readonly commitMessage: string;
}

/**
 * Each source-control export RUN gets its OWN directory under `infra/` (the Docker-volume-mounted
 * directory every other export/publish artifact already lives under) — `<parent>/github/<runId>`,
 * not merely `<parent>/github`. Exported (not merely internal) specifically so this per-run
 * isolation is directly testable — this file's own copy of `static-publish/adapter.ts`'s identical
 * `publishOutputDir` fix, for the identical reason.
 *
 * MEDIUM audit finding (2026-08-19, Codex sol bug/architecture audit): a fixed `<parent>/github`
 * directory meant this feature had NO concurrency guard at all — not even the process-local
 * single-flight `publish-run.ts` gives `static-publish/adapter.ts` — so two commits (the assistant's
 * confirmed `source_control_execute_commit` tool call firing twice, or overlapping with a future
 * second trigger) could `clean:true` and rewrite the same directory out from under each other.
 * `runId` (always a fresh `input.idGen.newId()` value, minted once per
 * {@link commitSiteToSourceControl} call) makes that collision structurally impossible. The
 * directory is disposable once `exportSiteBound` returns — see {@link cleanupCommitRunDir}'s own
 * doc for why nothing downstream re-reads it from disk.
 *
 * `parent` is `RouteDeps.sourceControlExportRootDir` (`TOVU_SOURCE_CONTROL_EXPORT_DIR` env, then
 * `infra/source-control-export` — mirroring `export-site.ts`'s `TOVU_EXPORT_DIR`/`adapter.ts`'s
 * `TOVU_PUBLISH_DIR`), resolved ONCE by the composition root (`server/app.ts`/`server/deps.ts`) and
 * threaded through as {@link CommitSiteInput.sourceControlExportRootDir} (2026-08-20
 * RouteDeps-narrowing fix — this used to be `input.routeDeps.sourceControlExportRootDir`; the field
 * moved, the value and its single-resolution-point discipline did not) — never read from
 * `process.env` in this file. A test overrides it the same way it always did: by setting
 * `sourceControlExportRootDir` on the fake `CommitSiteInput` it constructs, not by mutating real
 * process env vars.
 * @complexity O(1) — fixed-shape path join, no I/O.
 */
export function commitExportDir(parent: string, runId: string): string {
  return path.join(parent, "github", runId);
}

/** Best-effort cleanup of one run's isolated export directory (see {@link commitExportDir}'s own
 *  doc) — this file's own copy of `static-publish/adapter.ts`'s identical `cleanupPublishRunDir`.
 *  Safe to call once `exportSiteLazily` has returned or thrown: every byte
 *  `commitSiteToSourceControl` still needs travels through `report.routes.succeeded`/
 *  `report.assets.succeeded`'s own `data` fields, never by re-reading this directory. Never throws —
 *  same best-effort, disclosed-rather-than-silent posture as its `static-publish` twin.
 * @complexity O(n) in the (typically small) exported file count — a recursive directory removal. */
function cleanupCommitRunDir(outputDir: string): void {
  try {
    rmSync(outputDir, { recursive: true, force: true });
  } catch {
    // Swallowed deliberately — see this function's own doc.
  }
}

/**
 * `firstExportFailure`, resolved at CALL time instead of at import time — this file's own copy of
 * `static-publish/adapter.ts`'s identical helper. A static `import { firstExportFailure } from
 * "#src/export/index"` at this file's top would close a circular import the moment anything
 * reachable from `src/assistant` imports THIS module (`assistant/tool-registrations.ts ->
 * features/source-control/tool-registrations.ts -> commit-site.ts -> #src/export/index -> ... ->
 * server/app.ts -> ... assistant`), the same class of `ReferenceError: Cannot access '...' before
 * initialization` `adapter.ts`'s own header documents having actually observed for the sibling
 * domain. `exportSite` itself no longer needs this treatment here (2026-08-20 RouteDeps-narrowing
 * fix): this file never calls it directly anymore — {@link CommitSiteInput.exportSiteBound} is
 * already the composition root's own lazily-resolved binding (`server/app.ts`/`server/deps.ts`), so
 * threading a second lazy `require` for the same function here would be redundant, not merely
 * stylistic. `firstExportFailure` still needs its own lazy resolution, since it is a SEPARATE named
 * export of the same `#src/export/index` module and importing it eagerly would reopen the identical
 * cycle regardless of `exportSite`'s own fix.
 */
function firstExportFailureLazily(report: ExportReport): ExportFailureSummary | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see exportSiteLazily's doc above.
  return (require("#src/export/index") as typeof import("#src/export/index")).firstExportFailure(report);
}

type CommitCredentialResult =
  | { ok: true; credential: ResolvedSourceControlCredential }
  | { ok: false; code: "NO_CREDENTIALS_CONFIGURED"; message: string };

/**
 * Resolves and validates the workspace's default GitHub source-control credential. Split out of
 * `commitSiteToSourceControl` so that function reads as one guard per phase (credential, export,
 * commit) rather than one long chain — this phase alone covers the decrypt-failure catch, the
 * missing-credential case, and the (practically unreachable, but explicitly typed) wrong-provider
 * guard documented at the inline comment below.
 */
async function resolveCommitCredential(
  credentialDeps: CommitSiteDeps["credentialDeps"],
  workspaceId: UUID
): Promise<CommitCredentialResult> {
  let credential: Awaited<ReturnType<typeof resolveDefaultForSourceControl>>;
  try {
    credential = await resolveDefaultForSourceControl(credentialDeps, { workspaceId, providerId: "github" });
  } catch (err) {
    // `resolveDefaultForSourceControl`'s own doc documents this as a real, deliberate possibility
    // (`store.ts`'s `decryptRecord`: a decrypt failure throws rather than degrading to `null`) — this
    // function's own contract (this doc, right above) is that IT never throws regardless, so a
    // genuine decrypt failure still needs to "surface", just through this function's own established
    // `{ok:false, code, message}` channel instead of an uncaught exception. `NO_CREDENTIALS_CONFIGURED`
    // is the closest existing code — this feature has no dedicated "credential exists but cannot be
    // decrypted" code, and adding one is a wider API change than this fix, same bucket
    // `static-publish/adapter.ts`'s own `credentialSource.resolve()` catch uses for the analogous case.
    return {
      ok: false,
      code: "NO_CREDENTIALS_CONFIGURED",
      message: `credential could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!credential) {
    return {
      ok: false,
      code: "NO_CREDENTIALS_CONFIGURED",
      message: "No source control credential is configured for 'github'. Connect one in the admin's Source Control page first.",
    };
  }
  if (credential.connection.providerId !== "github") {
    // Unreachable in practice — `resolveDefaultForSourceControl` was called with `providerId: "github"`,
    // so `findDefaultByProvider` can only ever return a row already stored under that same provider
    // (the write path never lets `record.providerId` disagree with the group it was inserted into).
    // Kept as an explicit, typed guard rather than a cast, so a future bug in that invariant fails
    // loudly here instead of forwarding a GitLab/Bitbucket token to a GitHub API call.
    return { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: "The resolved default credential is not a 'github' connection." };
  }
  return { ok: true, credential: { token: credential.connection.token } };
}

type CommitExportResult = { ok: true; files: CommitFile[] } | { ok: false; code: "EXPORT_FAILED"; message: string };

/**
 * Runs the fresh, isolated export `commitSiteToSourceControl` commits from, and checks it for
 * failures (both route AND asset failures — see the inline comment below). Split out for the same
 * one-guard-per-phase reason as {@link resolveCommitCredential}.
 */
async function exportForCommit(input: CommitSiteInput): Promise<CommitExportResult> {
  const outputDir = commitExportDir(input.sourceControlExportRootDir, input.idGen.newId());
  let report: ExportReport;
  try {
    report = await input.exportSiteBound({ outputDir, clean: true });
  } catch (err) {
    cleanupCommitRunDir(outputDir);
    return { ok: false, code: "EXPORT_FAILED", message: `export failed before committing could start: ${err instanceof Error ? err.message : String(err)}` };
  }
  cleanupCommitRunDir(outputDir);

  // Checks BOTH `routes.failed` and `assets.failed` (HIGH audit finding, 2026-08-19 Codex sol bug/
  // architecture audit) — this used to check only `routes.failed`, so a page could export fine
  // while its own stylesheet or hero image 404s and the commit would still go through. See
  // `firstExportFailure`'s own doc (`#src/export/index`) for the shared check both this function
  // and `static-publish/adapter.ts`'s `publishStaticSite` now use.
  const failure = firstExportFailureLazily(report);
  if (failure) {
    return {
      ok: false,
      code: "EXPORT_FAILED",
      message: `refused to commit: ${failure.count} ${failure.kind}(s) failed to export (first: '${failure.identifier}' — ${failure.reason})`,
    };
  }

  const files: CommitFile[] = [...report.routes.succeeded.map(toCommitFile), ...report.assets.succeeded.map(toCommitFile)];
  return { ok: true, files };
}

/**
 * Commits Tovu's current site export to `input.owner/input.repo`. Always runs a fresh, `clean` export
 * immediately before committing — never reuses a previously-produced export directory (same
 * "correctness over one extra pass" tradeoff `static-publish/adapter.ts`'s header accepts for its own
 * publish call).
 *
 * Never throws: every failure is returned as `{ok: false, code, message}` — see
 * {@link SourceControlCommitOutcome}'s own header for the full per-code reasoning.
 *
 * This is a REAL contract, not aspirational (live-found 2026-08-16, mirroring `static-publish/
 * adapter.ts`'s own `publishStaticSite` fix for the identical shape): the call to
 * `resolveDefaultForSourceControl` below used to run unguarded, so a genuine decrypt failure (a
 * missing master secret, a tampered row) propagated as an UNCAUGHT exception, breaking this exact doc
 * comment. `tool-registrations.ts`'s `source_control_execute_commit` handler is written assuming this
 * function never throws, so that was a real crash risk, not just a documentation lie — worse than the
 * publish-credentials sibling's version of this bug, since this call runs inside
 * `agent-daemon-server.ts`, a separate OS process with no process-level `unhandledRejection` guard of
 * its own at the time and no restart supervisor at all (`index.ts`'s `spawnAgentDaemon()` is called
 * exactly once per boot) — an escaping rejection here would have taken the WHOLE daemon down, not
 * just answered one tool call with an error.
 *
 * @complexity One `exportSite` pass (O(routes + assets) HTTP requests against the in-process app) plus
 *   one `GitHubCommitAdapter.commit()` call (bounded by that adapter's own fixed request count — see
 *   `github-git-provider.ts`).
 */
export async function commitSiteToSourceControl(deps: CommitSiteDeps, input: CommitSiteInput): Promise<SourceControlCommitOutcome> {
  const configError = validateCommitTarget(input);
  if (configError) return { ok: false, code: "INVALID_CONFIG", message: configError };

  const credentialResult = await resolveCommitCredential(deps.credentialDeps, input.workspaceId);
  if (!credentialResult.ok) return credentialResult;

  const exportResult = await exportForCommit(input);
  if (!exportResult.ok) return exportResult;

  const gitAdapter = deps.gitAdapter;
  if (!gitAdapter) {
    // Only reachable if a caller omits BOTH this and relies on a default that does not exist yet —
    // `tool-registrations.ts` always supplies the real adapter (`github-git-provider.ts`) in
    // production. Fails loudly rather than silently no-op'ing a commit.
    return { ok: false, code: "PROVIDER_ERROR", message: "no GitHub commit adapter is configured — this is a wiring bug, not a credential or network problem" };
  }

  const result = await gitAdapter.commit({
    token: credentialResult.credential.token,
    owner: input.owner,
    repo: input.repo,
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    commitMessage: input.commitMessage,
    files: exportResult.files,
  });

  if (!result.ok) {
    const codeByAdapterCode = {
      "repository-not-found": "REPOSITORY_NOT_FOUND",
      "no-changes": "NO_CHANGES",
      diverged: "DIVERGED_BRANCH",
      "network-unreachable": "NETWORK_UNREACHABLE",
      "provider-error": "PROVIDER_ERROR",
    } as const;
    return { ok: false, code: codeByAdapterCode[result.code], message: result.message };
  }

  return {
    ok: true,
    owner: input.owner,
    repo: input.repo,
    branch: result.branch,
    branchCreated: result.branchCreated,
    commitSha: result.commitSha,
    commitUrl: result.commitUrl,
    filesChanged: result.filesChanged,
    filesDeleted: result.filesDeleted,
    divergedPaths: result.divergedPaths ?? [],
  };
}
