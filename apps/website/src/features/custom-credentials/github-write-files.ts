import { createHash } from "node:crypto";

import type { HttpClientPort, HttpResponse } from "../../platform/http/index.js";
import { buildAuthorizationHeader } from "./credentialed-request.js";
import type { CustomProviderConnectionInput } from "./types.js";
import type { NormalizedWriteFile } from "./write-files-validation.js";

/**
 * @file The blob -> tree -> commit -> ref sequence `custom_credential_write_files` performs against
 * GitHub's Git Data API, once a human has confirmed. Every outbound call goes through the SAME
 * guarded `HttpClientPort` (ADR-038) this domain's other tools already use
 * (`CustomCredentialsToolDeps.customCredentialsHttpClient`) — never a raw `fetch` — so this file
 * inherits the SSRF/DNS-pinning/redirect-stripping guarantees `credentialed-request.ts`'s own header
 * already documents as the reason that module never constructs an `HttpClientPort` itself. Every URL
 * this file builds is assembled from the credential's OWN saved `baseUrl` plus fixed API path
 * segments and this call's own validated `owner`/`repo`/`branch`/file paths (`write-files-
 * validation.ts`) — never from a caller-supplied URL — so there is no arbitrary target to check
 * against a host allowlist the way `credentialed-request.ts`'s `resolveAllowedRequestUrl` must.
 *
 * Deliberately a SMALL, purpose-built rewrite of `features/source-control/github-git-provider.ts`'s
 * own blob/tree/commit/ref sequence, not a reuse of that file (none of its helpers are exported, and
 * this dispatch was told to read it for the SEQUENCE only, never to import or extend its deletion-
 * tracking machinery). What was kept and what was deliberately dropped:
 *
 * - KEPT: `base_tree` threading. That file's own CRITICAL FIX (2026-08-19) is that a tree POST with
 *   no `base_tree` REPLACES the branch's entire file listing, silently deleting everything else on
 *   it. {@link planGitHubFileWrite} reads the branch's current tree sha and {@link commitGitHubFiles}
 *   threads it through as `base_tree` on every tree it creates — there is no "brand new branch, omit
 *   base_tree" case here at all (see the branch-creation point below), so it is always present,
 *   never conditionally omitted the way that file's own version has to handle.
 * - KEPT: no `force` on the ref update. {@link writeRef} does a plain (non-force)
 *   `PATCH .../git/refs/heads/{branch}`, which GitHub itself rejects with 422 if the branch moved
 *   since {@link planGitHubFileWrite}'s own tip lookup. This tool's concurrency story is IDENTICAL:
 *   the loser of a race is refused (`"diverged"`), never silently overwritten.
 * - DROPPED: `MANAGED_MANIFEST_PATH` and the whole deletion-reconciliation pass. This tool writes
 *   EXACTLY the files it is told to, nothing more, and NEVER deletes a path — there is no recurring
 *   export this call reconciles against, so there is no "what did a previous call write that this
 *   one no longer produces" question to answer. Building that machinery here would be exactly the
 *   scope this dispatch was told not to add.
 * - DROPPED: branch creation. `github-git-provider.ts` can create a brand-new branch
 *   (`writeRef`'s `"create"` mode). This tool requires the target branch to already exist and fails
 *   closed with `"branch-not-found"` otherwise — the one caller that exists today (`tovu-deploy-fly`)
 *   always targets the repo's own default branch, which always exists, and silently creating a
 *   branch nobody asked for is exactly the kind of surprise a human confirming a dialog that names an
 *   explicit branch should never get.
 * - DIFFERENT: per-file exists/create-vs-update detection. `github-git-provider.ts` answers a
 *   different question ("did *I* previously write this path, and does it still hold *my* content?")
 *   via one recursive tree fetch plus its own ownership manifest. This tool answers a simpler one
 *   ("does this path currently exist on the branch at all, for display purposes only — the tree
 *   write itself needs no old sha, only `base_tree` plus the new blob shas") via one bounded Contents
 *   API existence check per file (mirrors that file's own `fetchLiveBlobSha` idiom), bounded by
 *   `write-files-validation.ts`'s own file-count cap rather than by however large the branch's whole
 *   tree happens to be — and with no truncation edge case to handle, unlike a `recursive=1` fetch
 *   against a very large repository.
 */

export interface GitHubWriteFilesDeps {
  readonly httpClient: HttpClientPort;
}

/** Pinned to the same value `github-git-provider.ts` pins — the same GitHub REST API, not an
 *  independently chosen version. */
const GITHUB_API_VERSION = "2026-03-10";
/** Same reasoning and same value as `github-git-provider.ts`'s own `GITHUB_FETCH_TIMEOUT_MS`: blob/
 *  tree/commit creation can carry a real payload, and GitHub itself has occasional latency spikes. */
const GITHUB_WRITE_FILES_TIMEOUT_MS = 30_000;

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Percent-encodes a repo-relative path one segment at a time, preserving `/` — same reasoning
 *  `github-git-provider.ts`'s own `encPath` documents (branch names and file paths both routinely
 *  contain `/`, which {@link enc} alone would turn into `%2F`). */
function encPath(path: string): string {
  return path.split("/").map(enc).join("/");
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(Buffer.from(data, "utf8")).digest("hex");
}

type GitHubSendResult = { kind: "response"; response: HttpResponse } | { kind: "network-unreachable"; message: string };

/** The one place every outbound call in this file goes through — builds the GitHub-specific headers
 *  (`Authorization` via the SAME per-credential scheme precedence `credentialed-request.ts` uses,
 *  `Accept`, `X-GitHub-Api-Version`) and separates a thrown transport failure from a normally-received
 *  response, mirroring `github-git-provider.ts`'s own `githubFetch` split — adapted to `HttpClientPort`
 *  (which already applies its own timeout/SSRF/redirect guard) rather than raw `fetch`.
 *
 * @complexity O(1) — one `httpClient.send()` call.
 */
async function githubSend(
  deps: GitHubWriteFilesDeps,
  connection: CustomProviderConnectionInput,
  request: { method: "GET" | "POST" | "PATCH"; url: string; body?: string }
): Promise<GitHubSendResult> {
  try {
    const response = await deps.httpClient.send({
      method: request.method,
      url: request.url,
      headers: {
        Authorization: buildAuthorizationHeader(connection),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      timeoutMs: GITHUB_WRITE_FILES_TIMEOUT_MS,
      ...(request.body !== undefined ? { body: request.body } : {}),
    });
    return { kind: "response", response };
  } catch (err) {
    return { kind: "network-unreachable", message: err instanceof Error ? err.message : String(err) };
  }
}

function parseJsonBody(response: HttpResponse): { ok: true; json: Record<string, unknown> } | { ok: false; message: string } {
  try {
    return { ok: true, json: JSON.parse(response.bodyText) as Record<string, unknown> };
  } catch {
    return { ok: false, message: "GitHub returned a non-JSON response." };
  }
}

async function providerErrorMessage(response: HttpResponse, fallback: string): Promise<string> {
  const body = parseJsonBody(response);
  const providerMessage = body.ok && typeof body.json.message === "string" ? body.json.message : undefined;
  return providerMessage ? `${fallback}: ${providerMessage}` : `${fallback} (status ${response.status})`;
}

/** A GitHub-shaped failure common to both phases below. */
export type GitHubWriteFilesFailure = { ok: false; code: "network-unreachable" | "provider-error"; message: string };

function nonResponseFailure(result: Extract<GitHubSendResult, { kind: "network-unreachable" }>): GitHubWriteFilesFailure {
  return { ok: false, code: "network-unreachable", message: result.message };
}

function isOk(response: HttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/** Reads a string field off a JSON value that may not even be an object — every `sha`/`tree.sha`
 *  extraction in this file goes through this one narrowing, so a malformed provider response reads
 *  as "field absent" everywhere, never a thrown `TypeError` on a `null`/non-object value. */
function extractStringField(value: unknown, field: string): string {
  if (typeof value !== "object" || value === null) return "";
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : "";
}

/** `ok` is the discriminant shared by all three members (matching this file's own `{ok: true} |
 *  {ok: false, ...}` convention everywhere else) — `found` then splits the success case into
 *  "confirmed absent" (a 404) versus "confirmed present," so a caller narrows in two steps
 *  (`!result.ok`, then `!result.found`) rather than a single field that would not exist on the
 *  failure branch. */
type GitHubJsonResult = { ok: true; found: false } | { ok: true; found: true; json: Record<string, unknown> } | GitHubWriteFilesFailure;

/** One GET, fully classified: a 404 becomes `{ok: true, found: false}` (the caller decides what that
 *  means — a missing branch is fatal, a missing file is just "create" — never assumed here), a
 *  transport/provider failure becomes {@link GitHubWriteFilesFailure}, and a 2xx becomes the parsed
 *  body. Extracted so {@link planGitHubFileWrite} states its OWN steps in a straight line instead of
 *  repeating this five-way classification three times inline — the direct cause of that function
 *  tripping this repo's complexity ceiling before this extraction.
 *
 * @complexity O(1) — one `httpClient.send()` call.
 */
async function getJson(deps: GitHubWriteFilesDeps, connection: CustomProviderConnectionInput, url: string, failureFallback: string): Promise<GitHubJsonResult> {
  const result = await githubSend(deps, connection, { method: "GET", url });
  if (result.kind !== "response") return nonResponseFailure(result);
  if (result.response.status === 404) return { ok: true, found: false };
  if (!isOk(result.response)) return { ok: false, code: "provider-error", message: await providerErrorMessage(result.response, failureFallback) };
  const body = parseJsonBody(result.response);
  if (!body.ok) return { ok: false, code: "provider-error", message: body.message };
  return { ok: true, found: true, json: body.json };
}

/** One POST, classified the same way {@link getJson} is, minus the 404-is-meaningful case no POST in
 *  this file ever has. Shared by blob/tree/commit creation — the three POSTs
 *  {@link commitGitHubFiles} makes before its one PATCH — for the identical reason {@link getJson}
 *  is shared by the plan phase's three GETs.
 *
 * @complexity O(1) — one `httpClient.send()` call.
 */
async function postJson(
  deps: GitHubWriteFilesDeps,
  connection: CustomProviderConnectionInput,
  url: string,
  body: Record<string, unknown>,
  failureFallback: string
): Promise<{ ok: true; json: Record<string, unknown> } | GitHubWriteFilesFailure> {
  const result = await githubSend(deps, connection, { method: "POST", url, body: JSON.stringify(body) });
  if (result.kind !== "response") return nonResponseFailure(result);
  if (!isOk(result.response)) return { ok: false, code: "provider-error", message: await providerErrorMessage(result.response, failureFallback) };
  const parsed = parseJsonBody(result.response);
  if (!parsed.ok) return { ok: false, code: "provider-error", message: parsed.message };
  return { ok: true, json: parsed.json };
}

/** One file this call will write, together with whether it already exists on the target branch —
 *  the create-vs-update fact `write-files-confirmation-ui.ts` renders per path. */
export interface FileWriteState {
  readonly path: string;
  readonly exists: boolean;
}

/** Everything {@link commitGitHubFiles} needs that only the plan phase can supply — the branch's
 *  current tip and tree, read ONCE and threaded through rather than re-fetched, so the write phase
 *  cannot observe a different tree than the one the confirmation dialog was built from (the ref
 *  write's own non-force check is still what actually protects against a real race — see this file's
 *  header). */
export interface GitHubWriteFilesPlan {
  readonly parentCommitSha: string;
  readonly baseTreeSha: string;
  readonly fileStates: readonly FileWriteState[];
}

export type GitHubWriteFilesPlanResult = { ok: true; plan: GitHubWriteFilesPlan } | { ok: false; code: "branch-not-found"; message: string } | GitHubWriteFilesFailure;

export interface PlanGitHubFileWriteInput {
  readonly baseUrl: string;
  readonly connection: CustomProviderConnectionInput;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly files: readonly NormalizedWriteFile[];
}

/** Phase 2 of {@link planGitHubFileWrite}: one bounded Contents API existence check per file (see
 *  this file's header, "DIFFERENT: per-file exists/create-vs-update detection"). Split out so the
 *  loop's own branching is measured independently of the two fixed lookups before it.
 *
 * @complexity O(files) `httpClient.send()` calls.
 */
async function checkFileExistence(
  deps: GitHubWriteFilesDeps,
  connection: CustomProviderConnectionInput,
  repoPath: string,
  branch: string,
  files: readonly NormalizedWriteFile[]
): Promise<{ ok: true; fileStates: FileWriteState[] } | GitHubWriteFilesFailure> {
  const fileStates: FileWriteState[] = [];
  for (const file of files) {
    const existsResult = await getJson(deps, connection, `${repoPath}/contents/${encPath(file.path)}?ref=${enc(branch)}`, `GitHub lookup of '${file.path}' failed`);
    if (!existsResult.ok) return existsResult;
    if (!existsResult.found) {
      fileStates.push({ path: file.path, exists: false });
      continue;
    }
    fileStates.push({ path: file.path, exists: true });
  }
  return { ok: true, fileStates };
}

/**
 * Read-only reconnaissance for the confirmation dialog: the branch's current tip commit, its tree
 * sha (the `base_tree` {@link commitGitHubFiles} will build on top of), and, for each file this call
 * would write, whether a file already exists at that path on the branch. Never creates, updates, or
 * deletes anything.
 *
 * @throws Never — every failure is a returned value, per this codebase's `StepFailure`-shaped
 *   convention (`github-git-provider.ts`'s own).
 * @complexity O(files) `httpClient.send()` calls for the existence checks, plus 2 fixed calls
 *   (branch ref, parent commit).
 */
export async function planGitHubFileWrite(deps: GitHubWriteFilesDeps, input: PlanGitHubFileWriteInput): Promise<GitHubWriteFilesPlanResult> {
  const base = trimTrailingSlash(input.baseUrl);
  const repoPath = `${base}/repos/${enc(input.owner)}/${enc(input.repo)}`;

  const refJson = await getJson(deps, input.connection, `${repoPath}/git/ref/heads/${encPath(input.branch)}`, "GitHub branch lookup failed");
  if (!refJson.ok) return refJson;
  if (!refJson.found) return { ok: false, code: "branch-not-found", message: `branch '${input.branch}' does not exist in ${input.owner}/${input.repo}` };
  const parentCommitSha = extractStringField(refJson.json.object, "sha");
  if (!parentCommitSha) return { ok: false, code: "provider-error", message: "GitHub branch lookup response did not include a sha" };

  const commitJson = await getJson(deps, input.connection, `${repoPath}/git/commits/${enc(parentCommitSha)}`, "GitHub parent-commit lookup failed");
  if (!commitJson.ok) return commitJson;
  if (!commitJson.found) return { ok: false, code: "provider-error", message: "GitHub parent-commit lookup returned 404 for a sha this call just resolved" };
  const baseTreeSha = extractStringField(commitJson.json.tree, "sha");
  if (!baseTreeSha) return { ok: false, code: "provider-error", message: "GitHub parent-commit response did not include a tree sha" };

  const existence = await checkFileExistence(deps, input.connection, repoPath, input.branch, input.files);
  if (!existence.ok) return existence;

  return { ok: true, plan: { parentCommitSha, baseTreeSha, fileStates: existence.fileStates } };
}

async function createBlob(deps: GitHubWriteFilesDeps, connection: CustomProviderConnectionInput, repoPath: string, content: string): Promise<{ ok: true; sha: string } | GitHubWriteFilesFailure> {
  const result = await postJson(
    deps,
    connection,
    `${repoPath}/git/blobs`,
    { content: Buffer.from(content, "utf8").toString("base64"), encoding: "base64" },
    "GitHub blob creation failed"
  );
  if (!result.ok) return result;
  const sha = extractStringField(result.json, "sha");
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub blob creation response did not include a sha" };
  return { ok: true, sha };
}

export type GitHubCommitFilesResult = { ok: true; commitSha: string; commitUrl: string } | { ok: false; code: "diverged"; message: string } | GitHubWriteFilesFailure;

export interface CommitGitHubFilesInput {
  readonly baseUrl: string;
  readonly connection: CustomProviderConnectionInput;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly commitMessage: string;
  readonly files: readonly NormalizedWriteFile[];
}

/** Phase 1 of {@link commitGitHubFiles}: one blob per distinct file content (deduped by a local
 *  sha256 key, matching `github-git-provider.ts`'s own optimization — a dedup key only, not a
 *  wire-protocol requirement) and the tree entries that reference them. Split out so this loop's own
 *  branching is measured independently of the fixed tree/commit/ref steps after it.
 *
 * @complexity O(files) `httpClient.send()` calls for blob creation (deduped).
 */
async function buildTreeEntries(
  deps: GitHubWriteFilesDeps,
  connection: CustomProviderConnectionInput,
  repoPath: string,
  files: readonly NormalizedWriteFile[]
): Promise<{ ok: true; entries: Record<string, unknown>[] } | GitHubWriteFilesFailure> {
  const blobShaByHash = new Map<string, string>();
  const entries: Record<string, unknown>[] = [];
  for (const file of files) {
    const hash = sha256Hex(file.content);
    let blobSha = blobShaByHash.get(hash);
    if (!blobSha) {
      const blobResult = await createBlob(deps, connection, repoPath, file.content);
      if (!blobResult.ok) return blobResult;
      blobSha = blobResult.sha;
      blobShaByHash.set(hash, blobSha);
    }
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blobSha });
  }
  return { ok: true, entries };
}

/** The ONE irreversible step of {@link commitGitHubFiles} — see this file's header, "KEPT: no force
 *  on the ref update". A plain (non-force) `PATCH`, which GitHub itself rejects with 422 if the
 *  branch moved since {@link planGitHubFileWrite}'s own tip lookup; reported as `"diverged"`, never
 *  silently overwritten.
 *
 * @complexity O(1) — one `httpClient.send()` call.
 */
async function updateRef(deps: GitHubWriteFilesDeps, connection: CustomProviderConnectionInput, repoPath: string, branch: string, sha: string): Promise<{ ok: true } | { ok: false; code: "diverged" | "provider-error" | "network-unreachable"; message: string }> {
  const result = await githubSend(deps, connection, { method: "PATCH", url: `${repoPath}/git/refs/heads/${encPath(branch)}`, body: JSON.stringify({ sha }) });
  if (result.kind !== "response") return nonResponseFailure(result);
  if (result.response.status === 422) {
    return { ok: false, code: "diverged", message: "the branch has moved since this write was confirmed — refusing to overwrite it" };
  }
  if (!isOk(result.response)) return { ok: false, code: "provider-error", message: await providerErrorMessage(result.response, "GitHub branch update failed") };
  return { ok: true };
}

/**
 * The write itself, run only after a human has confirmed: one blob per distinct file content, one
 * tree built ON TOP of `plan.baseTreeSha`, one commit object, and one non-force ref update. `plan`
 * must come from a prior {@link planGitHubFileWrite} call against the SAME `files` list — this
 * function trusts `plan.baseTreeSha`/`parentCommitSha` rather than re-fetching them, so the
 * confirmation dialog and the actual write are guaranteed to build on the identical tree the human
 * was shown.
 *
 * @complexity O(files) `httpClient.send()` calls for blob creation (deduped), plus 3 fixed calls
 *   (tree, commit, ref).
 */
export async function commitGitHubFiles(deps: GitHubWriteFilesDeps, input: CommitGitHubFilesInput, plan: GitHubWriteFilesPlan): Promise<GitHubCommitFilesResult> {
  const base = trimTrailingSlash(input.baseUrl);
  const repoPath = `${base}/repos/${enc(input.owner)}/${enc(input.repo)}`;

  const treeEntries = await buildTreeEntries(deps, input.connection, repoPath, input.files);
  if (!treeEntries.ok) return treeEntries;

  // `base_tree` is ALWAYS sent — see this file's header, "KEPT: base_tree threading" — every path
  // not named in `treeEntries.entries` is inherited unchanged from the branch's current tree.
  const treeResult = await postJson(deps, input.connection, `${repoPath}/git/trees`, { tree: treeEntries.entries, base_tree: plan.baseTreeSha }, "GitHub tree creation failed");
  if (!treeResult.ok) return treeResult;
  const newTreeSha = extractStringField(treeResult.json, "sha");
  if (!newTreeSha) return { ok: false, code: "provider-error", message: "GitHub tree creation response did not include a sha" };

  const commitResult = await postJson(
    deps,
    input.connection,
    `${repoPath}/git/commits`,
    { message: input.commitMessage, tree: newTreeSha, parents: [plan.parentCommitSha] },
    "GitHub commit creation failed"
  );
  if (!commitResult.ok) return commitResult;
  const commitSha = extractStringField(commitResult.json, "sha");
  if (!commitSha) return { ok: false, code: "provider-error", message: "GitHub commit creation response did not include a sha" };

  const refResult = await updateRef(deps, input.connection, repoPath, input.branch, commitSha);
  if (!refResult.ok) return refResult;

  return { ok: true, commitSha, commitUrl: `https://github.com/${input.owner}/${input.repo}/commit/${commitSha}` };
}
