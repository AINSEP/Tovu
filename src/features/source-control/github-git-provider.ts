import { createHash } from "node:crypto";

import { assertNotRedirected, DeployError, redirectGuardInit } from "@jini-ai/devops/deploy";

import type { CommitFile, GitHubCommitAdapter, GitHubCommitAdapterResult } from "./commit-site.js";

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
 * One further deliberate resilience choice, not present in `github-pages.ts` at all: the previous-
 * manifest read ({@link fetchManagedManifest}, see CRITICAL fix note below) is a pure optimization — if
 * it fails for ANY reason (network or provider), this file does NOT fail the whole commit over it. It
 * silently skips computing which of Tovu's own previously-written paths should now be deleted and
 * proceeds to create a real commit instead (with no stale-path cleanup this one pass). Failing a
 * human's confirmed, wanted commit because of a transient hiccup on a "what did Tovu delete last time"
 * pre-check would be a worse outcome than occasionally leaving one already-removed page around for one
 * extra publish cycle — the same anti-false-negative principle behind divergence #2 above, applied to a
 * non-essential read instead of the irreversible write. The PARENT TREE read ({@link fetchParentTree})
 * does NOT get this same tolerance — see the CRITICAL fix note immediately below for why that one read
 * is now load-bearing rather than best-effort.
 *
 * CRITICAL FIX (2026-08-19, Codex 5.6-sol audit — data-loss class): `buildTree` used to POST to
 * `git/trees` with only the exported site's own entries and no `base_tree` at all. A commit's parent
 * supplies ANCESTRY, not inherited tree contents, so that tree was a COMPLETE REPLACEMENT of the
 * branch's file listing — publishing into a branch that also held a README, `.github/workflows/`,
 * source code, or any hand-maintained asset deleted all of it, silently, while still reporting success.
 * The non-force ref update (divergence #1 above) did not protect anything, because the replacement
 * commit was still a valid fast-forward. This file's own OLD doc comment on `buildTree` rationalized
 * the omission ("deletions are handled for free, not as a special case") — that reasoning is only sound
 * if the branch contains nothing but Tovu's own export, which is not a fact this file ever verified;
 * treat that as the bug's own justification, not as evidence it was safe.
 *
 * The fix has two parts, both required, neither optional:
 *  1. {@link fetchParentTree} reads the parent commit's own tree sha and {@link buildTree} sends it as
 *     `base_tree` on every commit onto an EXISTING branch (never on a brand-new one — see below).
 *     GitHub then builds the new tree ON TOP of that one: entries this file lists are added or updated,
 *     entries it lists with `sha: null` are removed, and every OTHER path already on the branch is
 *     inherited unchanged. This read is therefore load-bearing, not an optimization — a failure here
 *     means this file cannot safely build a tree AT ALL (the one alternative, omitting `base_tree`, is
 *     the exact defect this note describes), so {@link fetchParentTree} fails the whole commit rather
 *     than degrading, the opposite tolerance from {@link fetchManagedManifest} just above. A brand-new
 *     branch has no parent tree to build on top of, so `base_tree` is correctly omitted only in that
 *     one case (there is nothing pre-existing that could be destroyed).
 *  2. Because `base_tree` now means "not present in this call's `tree` list" = "keep unchanged," a page
 *     Tovu itself previously published and then stopped exporting would otherwise persist forever
 *     (matching a real class of the same audit's S3-target finding: content silently never cleaned up).
 *     {@link MANAGED_MANIFEST_PATH} is a small JSON file this adapter commits alongside every export,
 *     listing exactly the paths THIS adapter wrote. Before building the new tree, {@link
 *     fetchManagedManifest} reads the PREVIOUS commit's copy of that file; any path it lists that the
 *     CURRENT export no longer produces is added to the new tree with `sha: null` — an explicit,
 *     targeted delete of a path Tovu is certain it owns, never a path it has no record of writing. A
 *     path this adapter has never recorded (no manifest yet, or the manifest could not be read) is
 *     never deleted — the same "unknown means untouched" default that keeps a branch's non-Tovu content
 *     safe even before this adapter ever committed to it.
 */

const GITHUB_API = "https://api.github.com";
/** Pinned to the SAME version `github-pages.ts` pins — this is the same GitHub REST API, not an
 *  independently chosen value, so the two Tovu-owned callers see identical behavior. */
const GITHUB_API_VERSION = "2026-03-10";

/** Where this adapter records exactly which paths IT wrote — see this file's header CRITICAL fix note.
 *  A hidden, Tovu-namespaced path deliberately: real static exports do not write dotfile directories,
 *  so collision with genuine site content is not a practical concern the way a plain `manifest.json`
 *  at the repo root would be. */
const MANAGED_MANIFEST_PATH = ".tovu/managed-files.json";

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Percent-encodes a repo-relative PATH one segment at a time, preserving `/` as a real path separator
 *  — {@link enc} alone would turn `/` into `%2F`, which breaks GitHub's Contents API path routing (it
 *  splits on literal `/` before decoding each segment). Mirrors `static-publish/s3-compatible-target.ts`
 *  `objectUrl`'s identical per-segment encoding for the same reason, one path shape lower (a Contents
 *  API path here, not a full object URL there). */
function encPath(path: string): string {
  return path.split("/").map(enc).join("/");
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

/** Reads one commit object's own tree sha — REQUIRED (not best-effort) whenever the branch already has
 *  a parent commit: {@link buildTree} needs this value as `base_tree` to build the new tree ON TOP OF
 *  the branch's existing content instead of replacing it (this file's header CRITICAL fix note). Also
 *  still powers the "nothing changed" check (the new tree's sha equals this one when nothing changed),
 *  same as before. Unlike {@link fetchManagedManifest} below, a failure here fails the WHOLE commit —
 *  see this file's header for why the two reads get opposite tolerance.
 *
 * @complexity One `fetch()`.
 */
async function fetchParentTree(token: string, owner: string, repo: string, commitSha: string): Promise<{ ok: true; treeSha: string } | StepFailure> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/commits/${enc(commitSha)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub parent-commit lookup failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const tree = body.json.tree as Record<string, unknown> | undefined;
  const sha = typeof tree?.sha === "string" ? tree.sha : "";
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub parent-commit response did not include a tree sha" };
  return { ok: true, treeSha: sha };
}

/** Reads the PREVIOUS commit's copy of {@link MANAGED_MANIFEST_PATH} via the Contents API — the record
 *  of exactly which paths this adapter itself wrote last time (this file's header CRITICAL fix note).
 *  Best-effort ONLY, mirroring this file's established "a non-essential read degrades gracefully"
 *  pattern: `undefined` on ANY failure (a 404 — no manifest yet, e.g. the first commit this adapter
 *  ever makes onto a branch that already had other content — a network hiccup, or a body that does not
 *  parse as the expected shape). The caller treats `undefined` exactly like "nothing is known to be
 *  Tovu-managed yet," which is always the SAFE direction to fail in: it can only ever mean fewer
 *  deletions get computed this pass, never more. Unlike {@link fetchParentTree}, this read must never
 *  block the commit itself.
 *
 * @complexity One `fetch()`.
 */
async function fetchManagedManifest(token: string, owner: string, repo: string, branch: string): Promise<string[] | undefined> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/contents/${encPath(MANAGED_MANIFEST_PATH)}?ref=${enc(branch)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response" || !result.response.ok) return undefined;
  const body = await readJsonBody(result.response);
  if (!body.ok) return undefined;
  const content = typeof body.json.content === "string" ? body.json.content : undefined;
  if (content === undefined) return undefined;
  try {
    const decoded = Buffer.from(content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { paths?: unknown };
    return Array.isArray(parsed.paths) && parsed.paths.every((path) => typeof path === "string") ? (parsed.paths as string[]) : undefined;
  } catch {
    return undefined;
  }
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
 * `baseTreeSha` (present for every commit onto an EXISTING branch, absent only for a brand-new one —
 * see this file's header CRITICAL fix note) is sent as `base_tree`, so the new tree is built ON TOP OF
 * the branch's current content: every path this call does not mention is inherited unchanged. A path
 * in `previousManagedPaths` (this adapter's OWN record of what it wrote last time) that the current
 * `files` set no longer produces is added to the tree with `sha: null` — GitHub's documented shape for
 * "remove this path" when `base_tree` is present — an explicit, targeted delete of a path this adapter
 * is certain it owns, never a path with no such record. {@link MANAGED_MANIFEST_PATH} itself is always
 * written alongside the export, so the NEXT commit can compute its own deletions the same way.
 *
 * @complexity O(files) `fetch()` calls for blobs (deduped), plus one more for the manifest blob, plus
 *   one for the tree.
 */
async function buildTree(
  token: string,
  owner: string,
  repo: string,
  files: readonly CommitFile[],
  baseTreeSha: string | undefined,
  previousManagedPaths: readonly string[] | undefined
): Promise<{ ok: true; sha: string; deletedPaths: string[] } | StepFailure> {
  const blobShaByHash = new Map<string, string>();
  const tree: Record<string, unknown>[] = [];
  const currentPaths = new Set<string>();
  for (const file of files) {
    currentPaths.add(file.path);
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

  // Only paths THIS adapter previously recorded owning, and that the current export no longer
  // produces, are ever deleted — never a path with no such record. `MANAGED_MANIFEST_PATH` is excluded
  // defensively (it is never part of `previousManagedPaths`' own meaning — see its own doc — but a
  // manifest written by some future/other version should not be able to delete itself via this path).
  const deletedPaths = (previousManagedPaths ?? []).filter((path) => !currentPaths.has(path) && path !== MANAGED_MANIFEST_PATH);
  for (const deletedPath of deletedPaths) {
    tree.push({ path: deletedPath, mode: "100644", type: "blob", sha: null });
  }

  const manifestBlob = await createBlob(token, owner, repo, JSON.stringify({ version: 1, paths: [...currentPaths].sort() }));
  if (!manifestBlob.ok) return manifestBlob;
  tree.push({ path: MANAGED_MANIFEST_PATH, mode: "100644", type: "blob", sha: manifestBlob.sha });

  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/git/trees`, {
    method: "POST",
    headers: githubHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ tree, ...(baseTreeSha !== undefined ? { base_tree: baseTreeSha } : {}) }),
  });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub tree creation failed") };
  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  const sha = typeof body.json.sha === "string" ? body.json.sha : "";
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub tree creation response did not include a sha" };
  return { ok: true, sha, deletedPaths };
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
 *  3. {@link fetchParentTree} — REQUIRED whenever step 2 found a parent (this file's header CRITICAL
 *     fix note); its `treeSha` becomes `base_tree` and also still powers the no-changes check.
 *  4. {@link fetchManagedManifest} — best-effort only; the previous commit's record of which paths THIS
 *     adapter itself wrote, used to compute targeted deletions.
 *  5. {@link buildTree} — blobs (deduped) + one manifest blob + one tree, built ON TOP OF step 3's tree
 *     (`base_tree`) whenever a parent exists, with step 4's stale paths explicitly removed.
 *  6. No-changes short-circuit: if the new tree sha equals step 3's, stop here — no commit, no ref
 *     write, `{ok: false, code: "no-changes"}`.
 *  7. {@link createCommitObject}.
 *  8. {@link writeRef} — the one irreversible step.
 *
 * @complexity O(files) `fetch()` calls (blob creation, deduped) plus a small fixed number of
 *   additional calls (repo, ref lookup, parent-tree read, manifest read, tree, commit, ref write).
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

      // REQUIRED whenever a parent exists — see this file's header CRITICAL fix note. A brand-new
      // branch has no parent tree to build on top of, so `baseTreeSha` is correctly `undefined` only in
      // that one case.
      let baseTreeSha: string | undefined;
      if (parentSha !== undefined) {
        const parentTreeResult = await fetchParentTree(token, owner, repo, parentSha);
        if (!parentTreeResult.ok) return parentTreeResult;
        baseTreeSha = parentTreeResult.treeSha;
      }

      // Best-effort — a brand-new branch cannot have a prior Tovu commit to read one from either.
      const previousManagedPaths = branchCreated ? undefined : await fetchManagedManifest(token, owner, repo, branch);

      const treeResult = await buildTree(token, owner, repo, files, baseTreeSha, previousManagedPaths);
      if (!treeResult.ok) return treeResult;

      if (baseTreeSha !== undefined && baseTreeSha === treeResult.sha) {
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
        filesDeleted: treeResult.deletedPaths.length,
      };
    },
  };
}
