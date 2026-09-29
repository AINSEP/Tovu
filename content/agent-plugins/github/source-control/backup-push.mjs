// @ts-check
import { createHash } from "node:crypto";

import { enc, encPath, extractStringField, isOk, parseJsonBody, providerErrorMessage, repoPathOf } from "./write-files.mjs";

/**
 * @file Pushes a site backup into a folder of a PRIVATE GitHub repository. Moved out of core
 * (`apps/website/src/features/site-backup/github-push.ts`) unchanged in behavior.
 *
 * Three steps, the tool (`site_backup_*` in core) sequencing them: `inspectBackupRepository` checks
 * the repository BEFORE anything is uploaded (it must exist, be private — a backup holds the whole
 * database — be pushable and non-empty, and the folder must not be a file); `uploadBackupBlob` sends
 * one file as a git blob; `commitBackupTree` replaces the backup folder with a tree of the uploaded
 * blobs on top of the planned parent, with an unforced ref update (a moved branch is `diverged`).
 * No recursive tree fetch and no deletion list are needed: the folder's tree is replaced whole.
 *
 * @typedef {import("./write-files.mjs").Target} Target
 * @typedef {import("./write-files.mjs").GitDataClient} GitDataClient
 * @typedef {{ path: string, blobSha: string, bytes: number, sha256: string }} UploadedBackupBlob
 */

/** @param {GitDataClient} git */
export function createBackupPusher(git) {
  /** @param {Target} target */
  async function checkRepository(target) {
    const name = `${target.owner}/${target.repo}`;
    const repoJson = await git.getJson(target, repoPathOf(target), "GitHub repository lookup failed");
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
    if (typeof permissions === "object" && permissions !== null && permissions.push === false) {
      return { ok: false, code: "no-push-permission", message: `this credential can read ${name} but cannot push to it` };
    }
    const defaultBranch = extractStringField(json, "default_branch");
    const htmlUrl = extractStringField(json, "html_url");
    if (!defaultBranch || !htmlUrl) return { ok: false, code: "provider-error", message: "GitHub repository lookup response did not include a default branch or URL" };
    return { ok: true, defaultBranch, htmlUrl };
  }

  /** GitHub answers 409 for the ref of an EMPTY repository. @param {Target} target @param {string} branch */
  async function readBranchTip(target, branch) {
    const name = `${target.owner}/${target.repo}`;
    const refResult = await git.send(target, { method: "GET", url: `${repoPathOf(target)}/git/ref/heads/${encPath(branch)}` });
    if (refResult.kind !== "response") return git.nonResponseFailure(refResult);
    const refResponse = refResult.response;
    if (refResponse.status === 409) {
      return { ok: false, code: "repo-empty", message: `repository ${name} is empty. Add a first commit (for example a README) on GitHub, then back up again.` };
    }
    if (refResponse.status === 404) return { ok: false, code: "branch-not-found", message: `branch '${branch}' does not exist in ${name}` };
    if (!isOk(refResponse)) return { ok: false, code: "provider-error", message: providerErrorMessage(refResponse, "GitHub branch lookup failed") };
    const refBody = parseJsonBody(refResponse);
    const parentCommitSha = refBody.ok ? extractStringField(refBody.json?.object, "sha") : "";
    if (!parentCommitSha) return { ok: false, code: "provider-error", message: "GitHub branch lookup response did not include a sha" };

    const commitJson = await git.getJson(target, `${repoPathOf(target)}/git/commits/${enc(parentCommitSha)}`, "GitHub parent-commit lookup failed");
    if (!commitJson.ok) return commitJson;
    const baseTreeSha = commitJson.found ? extractStringField(commitJson.json.tree, "sha") : "";
    if (!baseTreeSha) return { ok: false, code: "provider-error", message: "GitHub parent-commit lookup did not return a tree sha" };
    return { ok: true, parentCommitSha, baseTreeSha };
  }

  /** @param {Target & { branch?: string, folder: string }} input */
  async function inspectBackupRepository(input) {
    const repo = await checkRepository(input);
    if (!repo.ok) return repo;
    const branch = input.branch ?? repo.defaultBranch;

    const tip = await readBranchTip(input, branch);
    if (!tip.ok) return tip;

    const folderJson = await git.getJson(input, `${repoPathOf(input)}/contents/${encPath(input.folder)}?ref=${enc(branch)}`, "GitHub folder lookup failed");
    if (!folderJson.ok) return folderJson;
    if (folderJson.found && !Array.isArray(folderJson.json)) {
      return { ok: false, code: "folder-is-file", message: `'${input.folder}' exists on branch '${branch}' but is not a folder — refusing to replace it` };
    }
    return { ok: true, state: { branch, parentCommitSha: tip.parentCommitSha, baseTreeSha: tip.baseTreeSha, htmlUrl: repo.htmlUrl, folderExists: folderJson.found } };
  }

  /** @param {Target} target @param {{ path: string, content: Uint8Array }} file */
  async function uploadBackupBlob(target, file) {
    const result = await git.createBlob(target, file.content);
    if (!result.ok) return result;
    const sha256 = createHash("sha256").update(file.content).digest("hex");
    return { ok: true, blob: { path: file.path, blobSha: result.sha, bytes: file.content.byteLength, sha256 } };
  }

  /**
   * @param {Target & { branch: string, folder: string, commitMessage: string, parentCommitSha: string,
   *   baseTreeSha: string, htmlUrl: string, blobs: readonly UploadedBackupBlob[] }} input
   */
  async function commitBackupTree(input) {
    const repoPath = repoPathOf(input);

    const folderTree = await git.postJson(
      input,
      `${repoPath}/git/trees`,
      { tree: input.blobs.map((blob) => ({ path: blob.path, mode: "100644", type: "blob", sha: blob.blobSha })) },
      "GitHub folder tree creation failed"
    );
    if (!folderTree.ok) return folderTree;
    const folderTreeSha = extractStringField(folderTree.json, "sha");
    if (!folderTreeSha) return { ok: false, code: "provider-error", message: "GitHub folder tree creation response did not include a sha" };

    const rootTree = await git.postJson(
      input,
      `${repoPath}/git/trees`,
      { base_tree: input.baseTreeSha, tree: [{ path: input.folder, mode: "040000", type: "tree", sha: folderTreeSha }] },
      "GitHub tree creation failed"
    );
    if (!rootTree.ok) return rootTree;
    const rootTreeSha = extractStringField(rootTree.json, "sha");
    if (!rootTreeSha) return { ok: false, code: "provider-error", message: "GitHub tree creation response did not include a sha" };

    const commit = await git.postJson(
      input,
      `${repoPath}/git/commits`,
      { message: input.commitMessage, tree: rootTreeSha, parents: [input.parentCommitSha] },
      "GitHub commit creation failed"
    );
    if (!commit.ok) return commit;
    const commitSha = extractStringField(commit.json, "sha");
    if (!commitSha) return { ok: false, code: "provider-error", message: "GitHub commit creation response did not include a sha" };

    const ref = await git.updateRef(input, input.branch, commitSha);
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

  return { inspectBackupRepository, uploadBackupBlob, commitBackupTree };
}
