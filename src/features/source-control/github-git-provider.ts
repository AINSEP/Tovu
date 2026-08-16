import { createHash } from "node:crypto";

import { assertNotRedirected, DeployError, redirectGuardInit } from "@jini-ai/devops/deploy";

import type { CommitFile, GitHubCommitAdapter, GitHubCommitAdapterResult } from "./commit-site";

/**
 * @file The real GitHub Git Data API adapter — the ONLY file in this feature that calls GitHub's
 * REST API. Plain `fetch`, no library, same choice `@jini-ai/devops/deploy`'s `github-pages.ts`
 * already made and this codebase already trusts for this exact API surface (blob -> tree -> commit
 * -> ref). This is a STRICT SUBSET of that file's own plumbing: no Pages-site-enable
 * (`ensureGitHubPagesSite`), no build-poll (`pollGitHubPagesBuild`), no reachability-wait
 * (`waitForReachableDeploymentUrl`) — none of that is a "commit source" concern, only a "publish a
 * hosted site" one.
 *
 * Deliberately does NOT import `GitHubPagesDeployTarget` or any of `github-pages.ts`'s internal
 * blob/tree/commit/ref helpers (none are exported, and that class is Pages-shaped) — this is this
 * feature's own, independent implementation against the SAME public GitHub REST API, sharing pattern
 * and vocabulary, not code. It DOES reuse `redirectGuardInit`/`assertNotRedirected`/`DeployError` from
 * `@jini-ai/devops/deploy` directly — those are a shared-library security guard (a `Bearer` token
 * carried on an authenticated `fetch()` must never be replayed at a redirect target; see that file's
 * own header for the credential-leak vector it closes), not a Tovu-domain import, so reusing it is the
 * same "wrap it, do not reimplement" discipline `static-publish/adapter.ts` already applies to the
 * rest of that package — reinventing this guard would be strictly worse than importing the
 * already-reviewed one.
 *
 * Two deliberate divergences from `github-pages.ts`, both load-bearing (2026-08-16 review):
 *
 * 1. NO `force: true` on the ref write. `github-pages.ts`'s own `updateGitHubRef` forces the branch
 *    to "last publish wins" — correct for a disposable `gh-pages` build artifact, wrong here: this
 *    commits into what may be someone's real, actively-used git history. {@link writeRef} below does a
 *    plain (non-force) ref update, which GitHub rejects with 422 if the branch moved since this call's
 *    own tip lookup (someone else pushed to it) — surfaced as `"diverged"`, never silently overwritten.
 *
 * 2. {@link writeRef} treats ANY 2xx response as success WITHOUT depending on that response's body
 *    parsing as JSON. This is the same class of defect this codebase paid to fix today for GitHub
 *    Pages' own build-status poll (`github-pages.ts`'s `pollGitHubPagesBuild` doc comment: "every step
 *    up to and including enabling the Pages site has already irreversibly succeeded by the time this
 *    loop runs... a response this file cannot parse as JSON... is exactly as uninformative as a 404,
 *    never a reason to report the whole publish as failed"). Confirmed by reading the current file:
 *    that fix was applied to the BUILD-POLL path only — `github-pages.ts`'s own `updateGitHubRef`/
 *    `createGitHubRef` still call `readGitHubJson` unconditionally, BEFORE checking `resp.ok`, so a
 *    2xx ref update whose body happens to fail to parse would still be misreported as a failure there
 *    today. Not fixed here (`Jini/**` is out of this dispatch's scope — read-only), but deliberately
 *    NOT copied into this file either. The ref write is the ONE genuinely irreversible step in this
 *    whole adapter: once GitHub accepts it, the commit is live on the branch, immediately fetchable by
 *    anyone with read access to the repo. This file does not even need the ref-write response's body
 *    for anything (the commit sha is already known from the earlier commit-object-creation call), so
 *    nothing is lost by not depending on it parsing. Every step BEFORE the ref write (blob/tree/commit
 *    object creation) has no such exemption and correctly aborts on an unparseable success response —
 *    an object GitHub never confirms creating is safe to treat as failed, because nothing became
 *    reachable from any branch yet.
 *
 * One further deliberate resilience choice, not present in `github-pages.ts` at all: the "nothing
 * changed since the last commit" check ({@link fetchParentTreeSha}) is a pure optimization — if the
 * read it depends on fails for ANY reason (network or provider), this file does NOT fail the whole
 * commit over it. It silently skips the optimization and proceeds to create a real commit instead.
 * Failing a human's confirmed, wanted commit because of a transient hiccup on a "was there anything to
 * commit" pre-check would be a worse outcome than occasionally creating a no-op commit — the same
 * anti-false-negative principle behind divergence #2 above, applied to a non-essential read instead of
 * the irreversible write.
 */

const GITHUB_API = "https://api.github.com";
/** Pinned to the SAME version `github-pages.ts` pins — this is the same GitHub REST API, not an
 *  independently chosen value, so the two Tovu-owned callers see identical behavior. */
const GITHUB_API_VERSION = "2026-03-10";

function enc(value: string): string {
  return encodeURIComponent(value);
}

function githubHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...extra,
  };
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(Buffer.from(data)).digest("hex");
}

/** A GitHub-shaped failure code, sharable across every step below — the exact subset
 *  {@link GitHubCommitAdapterResult}'s own `ok: false` branch declares, minus `"no-changes"` (decided
 *  once, in {@link createGitHubCommitAdapter}'s own orchestration, never by an individual step) and
 *  `"repository-not-found"` (returned by {@link fetchRepo} alone — no other step can produce it). */
type StepFailure = { ok: false; code: "network-unreachable" | "provider-error"; message: string };

/** One `fetch()` call's outcome, before any status-code interpretation — the seam that keeps "the
 *  request never reached a server" (`"network-unreachable"`, a thrown error) structurally distinct
 *  from "a server responded" (`"response"`, checked for `.ok`/status by the caller) and from "a
 *  server tried to redirect an authenticated request" (`"provider-rejected"`, `assertNotRedirected`'s
 *  own refusal — a REAL response was received, just not one this file will follow). See this file's
 *  header for why the network-vs-provider split matters. */
type GithubFetchResult =
  | { kind: "network-unreachable"; message: string }
  | { kind: "provider-rejected"; message: string }
  | { kind: "response"; response: Response };

/** The one place every outbound call in this file goes through — adds the redirect guard
 *  (`redirectGuardInit`/`assertNotRedirected`) and separates a thrown network failure from a thrown
 *  redirect refusal from a normally-received `Response`.
 *
 * @complexity O(1) — one `fetch()` call.
 */
async function githubFetch(url: string, init: RequestInit): Promise<GithubFetchResult> {
  try {
    const response = await fetch(url, redirectGuardInit(init));
    assertNotRedirected(response, "GitHub");
    return { kind: "response", response };
  } catch (err) {
    if (err instanceof DeployError) {
      // `assertNotRedirected` refused an opaque-redirect response — a server DID answer, it just
      // tried to send this authenticated request somewhere else. Provider-shaped, not a network
      // failure.
      return { kind: "provider-rejected", message: err.message };
    }
    // `fetch` itself threw — no `Response` was ever produced (DNS failure, connection refused, TLS
    // failure, timeout). Never conflated with a received HTTP error response — see this file's
    // header.
    return { kind: "network-unreachable", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Attempts to parse `response`'s body as JSON, never throwing — a parse failure is reported as a
 *  value, so every call site decides for itself whether that failure matters (per this file's header,
 *  it does NOT matter for a successful ref-write response). */
async function readJsonBody(response: Response): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  try {
    return { ok: true, json: (await response.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, message: "GitHub returned a non-JSON response." };
  }
}

/** Builds a `provider-error` message from a non-2xx response — GitHub's own `message` field when the
 *  body parsed and carries one, else a fixed, status-code-naming fallback. Never echoes more than
 *  GitHub's own stated reason; never a token (none is in scope in a response body). */
async function providerErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await readJsonBody(response);
  if (body.ok && typeof body.json.message === "string" && body.json.message.trim() !== "") return body.json.message;
  return `${fallback} (${response.status}).`;
}

/** Maps a {@link GithubFetchResult} that turned out to be `"network-unreachable"` or
 *  `"provider-rejected"` into a {@link StepFailure} — the two non-`"response"` branches every step
 *  function below handles identically before it ever looks at a status code. */
function nonResponseFailure(result: Extract<GithubFetchResult, { kind: "network-unreachable" | "provider-rejected" }>): StepFailure {
  return { ok: false, code: result.kind === "network-unreachable" ? "network-unreachable" : "provider-error", message: result.message };
}

/** Confirms `owner/repo` is reachable with this token and reads its default branch — the one call
 *  made unconditionally, even when the caller already named a branch, since a caller-supplied branch
 *  name says nothing about whether the repository itself exists or is visible to this token.
 *
 * @complexity One `fetch()`.
 */
async function fetchRepo(token: string, owner: string, repo: string): Promise<{ ok: true; defaultBranch: string } | StepFailure | { ok: false; code: "repository-not-found"; message: string }> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (response.status === 404) {
    return { ok: false, code: "repository-not-found", message: `no repository '${owner}/${repo}' is reachable with this token — it may not exist, or the token cannot see it` };
  }
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub repository lookup failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const defaultBranch = typeof body.json.default_branch === "string" ? body.json.default_branch : "main";
  return { ok: true, defaultBranch };
}

/** Looks up `heads/{branch}`'s current tip commit sha, or `undefined` if the branch does not exist
 *  yet (a brand-new commit target).
 *
 * @complexity One `fetch()`.
 */
async function fetchBranchTip(token: string, owner: string, repo: string, branch: string): Promise<{ ok: true; tipSha: string | undefined } | StepFailure> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/ref/heads/${enc(branch)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (response.status === 404) return { ok: true, tipSha: undefined };
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub branch lookup failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const object = body.json.object as Record<string, unknown> | undefined;
  const sha = typeof object?.sha === "string" ? object.sha : undefined;
  return { ok: true, tipSha: sha };
}

/** Reads one commit object's own tree sha — used only for the "nothing changed" optimization (this
 *  file's header). `undefined` on ANY failure here (never a hard stop) — the caller treats that
 *  exactly like "could not determine, proceed without the optimization."
 *
 * @complexity One `fetch()`.
 */
async function fetchParentTreeSha(token: string, owner: string, repo: string, commitSha: string): Promise<string | undefined> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/commits/${enc(commitSha)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response" || !result.response.ok) return undefined;
  const body = await readJsonBody(result.response);
  if (!body.ok) return undefined;
  const tree = body.json.tree as Record<string, unknown> | undefined;
  return typeof tree?.sha === "string" ? tree.sha : undefined;
}

/** Creates one blob object, returning its sha.
 *
 * @complexity One `fetch()`.
 */
async function createBlob(token: string, owner: string, repo: string, data: string | Buffer): Promise<{ ok: true; sha: string } | StepFailure> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/blobs`, {
    method: "POST",
    headers: githubHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ content: Buffer.from(data).toString("base64"), encoding: "base64" }),
  });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub blob creation failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const sha = typeof body.json.sha === "string" ? body.json.sha : "";
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub blob creation response did not include a sha" };
  return { ok: true, sha };
}

/**
 * Creates one blob per distinct file content (deduped by a local sha256 key — a plain dedup key, not
 * a wire-protocol requirement, so any stable digest works; sha256 mirrors `github-pages.ts`'s own
 * no-new-dependency choice for the identical problem) and assembles the resulting tree in one call.
 * Always creates real blobs rather than the tree endpoint's inline `content` shortcut — that shortcut
 * only accepts text, and a static export's asset set is not reliably valid UTF-8.
 *
 * No `base_tree`: the new tree fully REPLACES the file listing (`commit-site.ts`'s own doc on this —
 * a file the export no longer produces silently drops out of the new tree, i.e. deletions are handled
 * for free, not as a special case).
 *
 * @complexity O(files) `fetch()` calls for blobs (deduped), plus one for the tree.
 */
async function buildTree(token: string, owner: string, repo: string, files: readonly CommitFile[]): Promise<{ ok: true; sha: string } | StepFailure> {
  const blobShaByHash = new Map<string, string>();
  const tree: Record<string, unknown>[] = [];
  for (const file of files) {
    const hash = sha256Hex(file.data);
    let blobSha = blobShaByHash.get(hash);
    if (!blobSha) {
      const blobResult = await createBlob(token, owner, repo, file.data);
      if (!blobResult.ok) return blobResult;
      blobSha = blobResult.sha;
      blobShaByHash.set(hash, blobSha);
    }
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blobSha });
  }

  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/trees`, {
    method: "POST",
    headers: githubHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ tree }),
  });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub tree creation failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const sha = typeof body.json.sha === "string" ? body.json.sha : "";
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub tree creation response did not include a sha" };
  return { ok: true, sha };
}

/** Creates the commit object (not yet reachable from any branch — see this file's header on why this
 *  step is NOT the irreversible one).
 *
 * @complexity One `fetch()`.
 */
async function createCommitObject(
  token: string,
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  parents: readonly string[]
): Promise<{ ok: true; sha: string } | StepFailure> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/commits`, {
    method: "POST",
    headers: githubHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ message, tree: treeSha, parents }),
  });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub commit creation failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const sha = typeof body.json.sha === "string" ? body.json.sha : "";
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub commit creation response did not include a sha" };
  return { ok: true, sha };
}

/**
 * The ONE irreversible step — see this file's header for the full reasoning on both divergences it
 * embodies (no `force`, and a 2xx is trusted without depending on the body parsing).
 *
 * @param mode - `"create"` for a branch that does not exist yet (`POST .../git/refs`); `"update"` for
 *   an existing branch (`PATCH .../git/refs/heads/{branch}`, no `force`). The caller decides this from
 *   {@link fetchBranchTip}'s own result, never re-derived here.
 * @complexity One `fetch()`.
 */
async function writeRef(token: string, owner: string, repo: string, branch: string, sha: string, mode: "create" | "update"): Promise<{ ok: true } | { ok: false; code: "diverged" | "network-unreachable" | "provider-error"; message: string }> {
  const url = mode === "create" ? `${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/refs` : `${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/refs/heads/${enc(branch)}`;
  const init: RequestInit =
    mode === "create"
      ? { method: "POST", headers: githubHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) }
      : { method: "PATCH", headers: githubHeaders(token, { "Content-Type": "application/json" }), body: JSON.stringify({ sha }) };

  const result = await githubFetch(url, init);
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;

  // The irreversible moment: a 2xx here means the branch now points at `sha`, full stop — this file
  // needs nothing from the response body (the commit sha is already known), so nothing is lost by not
  // depending on it parsing. See this file's header divergence #2.
  if (response.ok) return { ok: true };

  if (mode === "update" && response.status === 422) {
    // GitHub's documented shape for "the ref update is not a fast-forward" — the branch moved between
    // `fetchBranchTip` and this write (someone else pushed). A real, expected outcome, not a hard
    // provider error — refused, never overwritten (this file's header divergence #1).
    return { ok: false, code: "diverged", message: "the branch has moved since this commit started — refusing to overwrite it" };
  }

  return { ok: false, code: "provider-error", message: await providerErrorMessage(response, `GitHub branch ${mode} failed`) };
}

/**
 * Builds the real {@link GitHubCommitAdapter} — the one `commit-site.ts` uses in production
 * (`tool-registrations.ts` supplies it as `SourceControlToolDeps.gitAdapter`'s default once wired;
 * see `commit-site.ts`'s own header for today's checkpoint: this file lands with stubbed-`fetch` tests
 * only, no live credential, per the owner's explicit instruction — `source_control_credential_sets` is
 * empty and stays that way until the owner saves a real token through the admin UI themselves).
 *
 * Sequencing, mirroring `github-pages.ts`'s own `publish()` order for the steps this file shares with
 * it (confirm repo -> read branch tip -> build tree -> create commit -> write ref), minus every
 * Pages-only step:
 *  1. {@link fetchRepo} — confirms the repo exists / resolves the default branch when none was given.
 *  2. {@link fetchBranchTip} — the branch's current tip sha, or `undefined` for a brand-new branch.
 *  3. {@link fetchParentTreeSha} — best-effort only (this file's header); powers the no-changes check.
 *  4. {@link buildTree} — blobs (deduped) + one tree, from the FULL file set (no `base_tree`).
 *  5. No-changes short-circuit: if step 3 succeeded and the new tree sha equals the parent's, stop
 *     here — no commit, no ref write, `{ok: false, code: "no-changes"}`.
 *  6. {@link createCommitObject}.
 *  7. {@link writeRef} — the one irreversible step.
 *
 * @complexity O(files) `fetch()` calls (blob creation, deduped) plus a small fixed number of
 *   additional calls (repo, ref lookup, optional parent-commit read, tree, commit, ref write).
 */
export function createGitHubCommitAdapter(): GitHubCommitAdapter {
  return {
    async commit(input): Promise<GitHubCommitAdapterResult> {
      const { token, owner, repo, commitMessage, files } = input;

      const repoResult = await fetchRepo(token, owner, repo);
      if (!repoResult.ok) return repoResult;
      const branch = input.branch ?? repoResult.defaultBranch;

      const tipResult = await fetchBranchTip(token, owner, repo, branch);
      if (!tipResult.ok) return tipResult;
      const parentSha = tipResult.tipSha;
      const branchCreated = parentSha === undefined;

      const parentTreeSha = parentSha !== undefined ? await fetchParentTreeSha(token, owner, repo, parentSha) : undefined;

      const treeResult = await buildTree(token, owner, repo, files);
      if (!treeResult.ok) return treeResult;

      if (parentTreeSha !== undefined && parentTreeSha === treeResult.sha) {
        return { ok: false, code: "no-changes", message: "nothing changed since the branch's last commit" };
      }

      const commitResult = await createCommitObject(token, owner, repo, commitMessage, treeResult.sha, parentSha !== undefined ? [parentSha] : []);
      if (!commitResult.ok) return commitResult;

      const refResult = await writeRef(token, owner, repo, branch, commitResult.sha, branchCreated ? "create" : "update");
      if (!refResult.ok) return refResult;

      return {
        ok: true,
        branch,
        branchCreated,
        commitSha: commitResult.sha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${commitResult.sha}`,
        filesChanged: files.length,
      };
    },
  };
}
