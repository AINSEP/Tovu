import { createHash } from "node:crypto";

import {
  createBlob,
  enc,
  encPath,
  extractStringField,
  getJson,
  githubSend,
  isOk,
  nonResponseFailure,
  parseJsonBody,
  postJson,
  providerErrorMessage,
  trimTrailingSlash,
  updateRef,
  type GitHubWriteFilesDeps,
  type GitHubWriteFilesFailure,
} from "../custom-credentials/github-write-files.js";
import type { CustomProviderConnectionInput } from "../custom-credentials/types.js";

/**
 * @file The GitHub half of a site backup: check the target repository, upload the backup's blobs,
 * and commit them as ONE folder. Built on `custom-credentials/github-write-files.ts`'s exported
 * primitives, so every call goes through the same guarded `HttpClientPort` (ADR-038), the same
 * headers, and the same never-publish-transport-detail rule; nothing here builds a URL from caller
 * input other than the validated owner/repo/branch/folder.
 *
 * What differs from `commitGitHubFiles`, and why:
 * - The repository must be PRIVATE ({@link inspectBackupRepository}). A backup carries the whole
 *   database — members, form submissions, admin accounts — so a public (or enterprise-wide
 *   "internal") repository is refused before anything else is read.
 * - The folder is REPLACED, not merged ({@link commitBackupTree}). Its tree is built with no
 *   `base_tree`, so a file deleted from the site since the last backup disappears from the folder;
 *   that tree is then grafted onto the branch's own tree, so nothing outside the folder changes.
 *   No recursive tree fetch and no deletion list are needed.
 * - Blobs are binary (`Uint8Array`), and each one's sha256 is recorded for the manifest.
 *
 * Unchanged: the ref update is never forced. GitHub answers 422 if the branch moved since the plan,
 * and that is reported as `diverged`.
 */

/** The repository a backup targets, plus the credential that reaches it. */
export interface BackupRepositoryTarget {
  readonly baseUrl: string;
  readonly connection: CustomProviderConnectionInput;
  readonly owner: string;
  readonly repo: string;
}

/** What {@link inspectBackupRepository} learned, threaded through to {@link commitBackupTree} so the
 *  commit builds on the exact tip and tree the human was shown. */
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
  | GitHubWriteFilesFailure;

function repoPathOf(target: BackupRepositoryTarget): string {
  return `${trimTrailingSlash(target.baseUrl)}/repos/${enc(target.owner)}/${enc(target.repo)}`;
}

type RepoCheck = { ok: true; defaultBranch: string; htmlUrl: string } | Extract<InspectBackupRepositoryResult, { ok: false }>;

/**
 * Step 1 of {@link inspectBackupRepository}: the repository exists, is private, and this credential
 * can push to it. Visibility is checked before anything else is read from the repository.
 *
 * @complexity O(1) — one GET.
 */
async function checkRepository(deps: GitHubWriteFilesDeps, target: BackupRepositoryTarget): Promise<RepoCheck> {
  const name = `${target.owner}/${target.repo}`;
  const repoJson = await getJson(deps, target.connection, repoPathOf(target), "GitHub repository lookup failed");
  if (!repoJson.ok) return repoJson;
  if (!repoJson.found) {
    return { ok: false, code: "repo-not-found", message: `repository ${name} was not found, or this credential cannot see it` };
  }
  const json = repoJson.json;
  const visibility = typeof json.visibility === "string" ? json.visibility : json.private === true ? "private" : "public";
  if (json.private !== true || visibility !== "private") {
    return {
      ok: false,
      code: "repo-not-private",
      message:
        `repository ${name} is ${visibility}. A site backup contains the whole database — members, form submissions, admin accounts — ` +
        "which would be exposed to everyone who can read that repository. Back up only to a private repository.",
    };
  }
  const permissions = json.permissions;
  if (typeof permissions === "object" && permissions !== null && (permissions as Record<string, unknown>).push === false) {
    return { ok: false, code: "no-push-permission", message: `this credential can read ${name} but cannot push to it` };
  }
  const defaultBranch = extractStringField(json, "default_branch");
  const htmlUrl = extractStringField(json, "html_url");
  if (!defaultBranch || !htmlUrl) return { ok: false, code: "provider-error", message: "GitHub repository lookup response did not include a default branch or URL" };
  return { ok: true, defaultBranch, htmlUrl };
}

type TipCheck = { ok: true; parentCommitSha: string; baseTreeSha: string } | Extract<InspectBackupRepositoryResult, { ok: false }>;

/**
 * Steps 2-3 of {@link inspectBackupRepository}: the branch's tip commit and its tree. A missing branch
 * is refused, never created; an empty repository (GitHub answers 409 on its refs) is refused with
 * what to do about it, because the Git Data API cannot write a first commit.
 *
 * @complexity O(1) — two GETs.
 */
async function readBranchTip(deps: GitHubWriteFilesDeps, target: BackupRepositoryTarget, branch: string): Promise<TipCheck> {
  const name = `${target.owner}/${target.repo}`;
  const refResult = await githubSend(deps, target.connection, { method: "GET", url: `${repoPathOf(target)}/git/ref/heads/${encPath(branch)}` });
  if (refResult.kind !== "response") return nonResponseFailure(refResult);
  const refResponse = refResult.response;
  if (refResponse.status === 409) {
    return { ok: false, code: "repo-empty", message: `repository ${name} is empty. Add a first commit (for example a README) on GitHub, then back up again.` };
  }
  if (refResponse.status === 404) return { ok: false, code: "branch-not-found", message: `branch '${branch}' does not exist in ${name}` };
  if (!isOk(refResponse)) return { ok: false, code: "provider-error", message: await providerErrorMessage(refResponse, "GitHub branch lookup failed") };
  const refBody = parseJsonBody(refResponse);
  const parentCommitSha = refBody.ok ? extractStringField(refBody.json.object, "sha") : "";
  if (!parentCommitSha) return { ok: false, code: "provider-error", message: "GitHub branch lookup response did not include a sha" };

  const commitJson = await getJson(deps, target.connection, `${repoPathOf(target)}/git/commits/${enc(parentCommitSha)}`, "GitHub parent-commit lookup failed");
  if (!commitJson.ok) return commitJson;
  const baseTreeSha = commitJson.found ? extractStringField(commitJson.json.tree, "sha") : "";
  if (!baseTreeSha) return { ok: false, code: "provider-error", message: "GitHub parent-commit lookup did not return a tree sha" };
  return { ok: true, parentCommitSha, baseTreeSha };
}

/**
 * Read-only reconnaissance before a backup: the repository is private and pushable, the branch (the
 * repository's default when none is named) exists, its tip and tree, and whether the backup folder
 * already exists there. A folder path that is a FILE on the branch is refused rather than replaced.
 *
 * @throws Never — every failure is a returned value.
 * @complexity O(1) — at most four GETs, every one of them a fixed request.
 */
export async function inspectBackupRepository(
  deps: GitHubWriteFilesDeps,
  input: BackupRepositoryTarget & { readonly branch?: string; readonly folder: string }
): Promise<InspectBackupRepositoryResult> {
  const repo = await checkRepository(deps, input);
  if (!repo.ok) return repo;
  const branch = input.branch ?? repo.defaultBranch;

  const tip = await readBranchTip(deps, input, branch);
  if (!tip.ok) return tip;

  const folderJson = await getJson(deps, input.connection, `${repoPathOf(input)}/contents/${encPath(input.folder)}?ref=${enc(branch)}`, "GitHub folder lookup failed");
  if (!folderJson.ok) return folderJson;
  // The Contents API answers an ARRAY for a directory; any object is a file, symlink or submodule.
  if (folderJson.found && !Array.isArray(folderJson.json)) {
    return { ok: false, code: "folder-is-file", message: `'${input.folder}' exists on branch '${branch}' but is not a folder — refusing to replace it` };
  }

  return { ok: true, state: { branch, parentCommitSha: tip.parentCommitSha, baseTreeSha: tip.baseTreeSha, htmlUrl: repo.htmlUrl, folderExists: folderJson.found } };
}

/** One uploaded blob: where it goes in the backup folder, GitHub's sha for it, and the local
 *  size/sha256 the manifest records. */
export interface UploadedBackupBlob {
  readonly path: string;
  readonly blobSha: string;
  readonly bytes: number;
  readonly sha256: string;
}

/**
 * Uploads one file's bytes as a blob, byte-for-byte (base64 on the wire).
 *
 * @complexity O(file size) — one POST, plus hashing the bytes once.
 */
export async function uploadBackupBlob(
  deps: GitHubWriteFilesDeps,
  target: BackupRepositoryTarget,
  file: { readonly path: string; readonly content: Uint8Array }
): Promise<{ ok: true; blob: UploadedBackupBlob } | GitHubWriteFilesFailure> {
  const result = await createBlob(deps, target.connection, repoPathOf(target), file.content);
  if (!result.ok) return result;
  const sha256 = createHash("sha256").update(file.content).digest("hex");
  return { ok: true, blob: { path: file.path, blobSha: result.sha, bytes: file.content.byteLength, sha256 } };
}

export interface CommitBackupTreeInput extends BackupRepositoryTarget {
  readonly branch: string;
  /** Repository-relative, already validated (`normalizeWriteFilePath`). */
  readonly folder: string;
  readonly commitMessage: string;
  /** From the PLAN's {@link inspectBackupRepository}, never re-read: the non-force ref update then
   *  refuses the push if the branch moved in between. */
  readonly parentCommitSha: string;
  readonly baseTreeSha: string;
  readonly htmlUrl: string;
  /** Every file in the folder; paths relative to the folder. */
  readonly blobs: readonly UploadedBackupBlob[];
}

export type CommitBackupTreeResult = { ok: true; commitSha: string; commitUrl: string } | { ok: false; code: "diverged"; message: string } | GitHubWriteFilesFailure;

/**
 * Commits the uploaded blobs as the backup folder: the folder's own fresh tree (no `base_tree`, so
 * nothing stale survives inside it), that tree grafted onto the branch's tree (everything outside the
 * folder kept), one commit on the planned parent, and one non-force ref update.
 *
 * @complexity O(blobs) to build the folder tree; four fixed requests.
 */
export async function commitBackupTree(deps: GitHubWriteFilesDeps, input: CommitBackupTreeInput): Promise<CommitBackupTreeResult> {
  const repoPath = repoPathOf(input);

  const folderTree = await postJson(
    deps,
    input.connection,
    `${repoPath}/git/trees`,
    { tree: input.blobs.map((blob) => ({ path: blob.path, mode: "100644", type: "blob", sha: blob.blobSha })) },
    "GitHub folder tree creation failed"
  );
  if (!folderTree.ok) return folderTree;
  const folderTreeSha = extractStringField(folderTree.json, "sha");
  if (!folderTreeSha) return { ok: false, code: "provider-error", message: "GitHub folder tree creation response did not include a sha" };

  const rootTree = await postJson(
    deps,
    input.connection,
    `${repoPath}/git/trees`,
    { base_tree: input.baseTreeSha, tree: [{ path: input.folder, mode: "040000", type: "tree", sha: folderTreeSha }] },
    "GitHub tree creation failed"
  );
  if (!rootTree.ok) return rootTree;
  const rootTreeSha = extractStringField(rootTree.json, "sha");
  if (!rootTreeSha) return { ok: false, code: "provider-error", message: "GitHub tree creation response did not include a sha" };

  const commit = await postJson(
    deps,
    input.connection,
    `${repoPath}/git/commits`,
    { message: input.commitMessage, tree: rootTreeSha, parents: [input.parentCommitSha] },
    "GitHub commit creation failed"
  );
  if (!commit.ok) return commit;
  const commitSha = extractStringField(commit.json, "sha");
  if (!commitSha) return { ok: false, code: "provider-error", message: "GitHub commit creation response did not include a sha" };

  const ref = await updateRef(deps, input.connection, repoPath, input.branch, commitSha);
  if (!ref.ok) {
    if (ref.code !== "diverged") return ref;
    return {
      ok: false,
      code: "diverged",
      message: `branch '${input.branch}' moved since the backup was planned (someone pushed to it). Nothing was overwritten. Call site_backup_plan again.`,
    };
  }
  return { ok: true, commitSha, commitUrl: `${input.htmlUrl}/commit/${commitSha}` };
}
