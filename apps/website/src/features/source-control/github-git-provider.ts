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
 *
 * SECOND-ROUND CRITICAL FIX (2026-08-19, three independent auditors — Claude Sonnet 5, Codex 5.6-sol,
 * Codex 5.6-terra, all three converging on overlapping findings with no communication between them): the
 * manifest layer above closed the "content silently never cleaned up" gap, but introduced three of its
 * own, all now fixed together:
 *
 *  1. OWNERSHIP WAS TRUSTED BLINDLY. The first version of this fix deleted any path the manifest LISTED,
 *     with no check that the path's LIVE content still matched what this adapter itself last wrote. A
 *     human editing a Tovu-published page directly on the branch, then a later export simply no longer
 *     producing that page, meant the human's edit got silently deleted on the very next publish — the
 *     manifest never distinguished "Tovu's own stale output" from "content that happens to share a path
 *     Tovu once used." Fixed by giving the manifest real provenance: it is now `{version: 2, files:
 *     [{path, sha}]}`, recording the exact git blob sha this adapter wrote for each path, not just the
 *     path string. {@link buildTree} now verifies, via {@link fetchLiveBlobSha}, that a candidate
 *     deletion's CURRENT live blob sha still equals the recorded one before ever adding `sha: null` for
 *     it — a path is deleted only when this adapter can prove nothing touched it since. A path with no
 *     recorded sha (a pre-this-fix `{version: 1, paths: [...]}` manifest, or a malformed entry) and a
 *     path whose live sha has DIVERGED from the recorded one are treated identically: never deleted,
 *     reported in the result's `divergedPaths` so a human/caller can see exactly what survived and why
 *     (`commit-site.ts`'s `SourceControlCommitOutcome` and `tool-registrations.ts`'s tool result both
 *     surface it — see their own docs). This is a disclosed, bounded limitation, not a silently-accepted
 *     one: content tracked only by a pre-provenance v1 manifest can never be auto-deleted again by this
 *     adapter — reclaiming it requires a human to remove it directly, or a future export to re-publish
 *     that exact path (which re-enters `files` this pass and gets a fresh, verifiable v2 entry the
 *     normal way). Building an automatic "adopt it this cycle, verify next cycle" migration path was
 *     considered and rejected as unnecessary added surface area for a case with a cheap, honest,
 *     manual-recovery fallback.
 *
 *  2. A TRANSIENT MANIFEST READ FAILURE PERMANENTLY FORGOT STALE CONTENT. {@link fetchManagedManifest}
 *     used to return `undefined` on ANY failure — network, a non-404 HTTP error, or a body that failed
 *     to parse — and the caller treated `undefined` exactly like "verified: nothing was ever managed."
 *     The OLD doc comment on this file claimed a failure here "self-heals in one extra publish cycle" —
 *     that claim was FALSE: the very next successful commit wrote a brand-new manifest reflecting only
 *     the current export, permanently overwriting the only record of what a prior pass had tracked, with
 *     no way for ANY future pass to recover it. A page removed from the export during exactly the same
 *     window as a manifest-read blip would then survive on the branch forever, publicly reachable,
 *     invisible to every subsequent manifest — never "healed," never even noticed again. Fixed:
 *     {@link fetchManagedManifest} now returns a real `StepFailure` for every unreadable case, and only a
 *     VERIFIED 404 (GitHub confirming no such file exists) is treated as "zero prior paths." Every other
 *     failure now fails the WHOLE commit — the identical, already-established tolerance
 *     {@link fetchParentTree} gets, not the soft-degrade {@link fetchLiveBlobSha} still gets (see finding
 *     1): unlike a single candidate deletion's verification, a failure to read the manifest AT ALL means
 *     this adapter cannot safely compute ANY deletion for this pass, and proceeding anyway risks writing
 *     a new manifest that forgets everything the unreadable one recorded.
 *
 *  3. CONCURRENT S3-TARGET PUBLISHERS COULD LOSE DATA (this adapter's own sibling finding, not this
 *     file's own bug) — see `static-publish/s3-compatible-target.ts`'s header for the S3-specific fix.
 *     This adapter's own concurrency story is UNCHANGED and re-verified sound by this same round: the
 *     non-force ref update (divergence #1, far above) already gives real optimistic concurrency — two
 *     commits racing on the same branch tip can never both land; the loser is refused with 422
 *     (`"diverged"`), never silently overwritten. Re-confirmed against a genuine interleaving (not
 *     merely a canned single response) in this file's own test suite.
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

/** Bounds one `githubFetch()` round trip against the real `api.github.com`. Generous on purpose —
 *  tree/commit/blob creation can carry a real payload and GitHub itself has occasional latency
 *  spikes, and this file's own multi-step commit flow had NO deadline at all before this constant
 *  existed, so a value that fires on a slow-but-working call would be a worse regression than the
 *  unbounded wait it replaces. Mirrors the `AbortSignal.timeout` pattern already used for outbound
 *  fetches elsewhere in this codebase (`site-inspection/published-page.ts`,
 *  `external-mcp/admissions.ts`) rather than inventing a new one. Not overridable per call — no
 *  caller threads options through `githubFetch` today, and none of its ten call sites need a
 *  different value. */
const GITHUB_FETCH_TIMEOUT_MS = 30_000;

/** The one place every outbound call in this file goes through — adds the timeout and redirect
 *  guard (`redirectGuardInit`/`assertNotRedirected`) and separates a thrown network failure (which
 *  now includes a timeout) from a thrown redirect refusal from a normally-received `Response`.
 *
 * @complexity O(1) — one `fetch()` call.
 */
async function githubFetch(url: string, init: RequestInit): Promise<GithubFetchResult> {
  try {
    const response = await fetch(url, redirectGuardInit({ ...init, signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS) }));
    assertNotRedirected(response, "GitHub");
    return { kind: "response", response };
  } catch (err) {
    if (err instanceof DeployError) {
      // `assertNotRedirected` refused an opaque-redirect response — a server DID answer, it just
      // tried to send this authenticated request somewhere else. Provider-shaped, not a network
      // failure.
      return { kind: "provider-rejected", message: err.message };
    }
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      // A timeout never produced a `Response` either, so it belongs in the same bucket as any
      // other network failure below — but with a message that names the actual cause instead of
      // `fetch`'s own generic abort text, matching `published-page.ts`'s identical choice to give
      // a timeout its own distinguishable wording rather than let it read like a random failure.
      return { kind: "network-unreachable", message: `GitHub request to ${url} timed out after ${GITHUB_FETCH_TIMEOUT_MS}ms` };
    }
    // `fetch` itself threw — no `Response` was ever produced (DNS failure, connection refused, TLS
    // failure). Never conflated with a received HTTP error response — see this file's header.
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
  const sha = typeof object?.sha === "string" ? object.sha : "";
  if (!sha) return { ok: false, code: "provider-error", message: "GitHub branch lookup response did not include a sha" };
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

/** A plausible git blob sha — SHA-1 (40 hex chars, every repo today) or SHA-256 (64 hex chars, GitHub's
 *  documented future repo format) — used only to decide whether a manifest entry's `sha` field is
 *  well-formed enough to trust as a comparison value, never to validate it against real content (that
 *  happens by comparing two of these against each other, see {@link fetchLiveBlobSha}'s call site). */
const GIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/** One path this adapter recorded owning in a previous manifest, together with the git blob sha it had
 *  at write time — or `sha: undefined` when no such provenance exists for this path (this file's header
 *  SECOND-ROUND CRITICAL FIX note, finding 1): either a pre-this-fix `{version: 1, paths: [...]}`
 *  manifest (a real, historical shape this adapter itself used to write, not corruption), or a `v2`
 *  entry whose own `sha` field failed to parse as a plausible git blob sha. `sha: undefined` is
 *  deliberately NOT "safe to delete" — {@link buildTree} treats it exactly like a verified mismatch:
 *  never auto-deleted, always reported. */
interface PreviouslyManagedFile {
  readonly path: string;
  readonly sha: string | undefined;
}

/** Recognizes both manifest shapes this adapter has ever written: the CURRENT one
 *  (`{version: 2, files: [{path, sha}]}`, real per-path provenance) and the shape it wrote before this
 *  file's second-round fix (`{version: 1, paths: [...]}`, no per-path hash at all — a real historical
 *  format, not corruption). Anything else — an unrecognized `version`, a `files`/`paths` entry of the
 *  wrong shape, a hand-edited file that merely resembles one of these — is treated as UNRECOGNIZED, not
 *  as "zero prior paths": {@link fetchManagedManifest}'s own caller-visible contract is that a shape it
 *  cannot recognize is exactly as unreadable as a parse failure or a network error (this file's header
 *  SECOND-ROUND CRITICAL FIX note, finding 2) — never silently treated as an empty manifest.
 * @returns `undefined` when `parsed` matches neither recognized shape.
 * @complexity O(n) in the manifest's own entry count.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** One `v2` `files[]` entry, or `undefined` if it doesn't match `{path: string, sha?: string}`. */
function parseManifestV2Entry(entry: unknown): PreviouslyManagedFile | undefined {
  if (!isPlainObject(entry)) return undefined;
  if (typeof entry.path !== "string") return undefined;
  const sha = typeof entry.sha === "string" && GIT_SHA_PATTERN.test(entry.sha) ? entry.sha : undefined;
  return { path: entry.path, sha };
}

/** The CURRENT manifest shape: `{version: 2, files: [{path, sha}]}`. `undefined` when `obj` isn't
 * this shape at all, OR when it is but any one entry fails validation — a partially-valid `v2`
 * manifest is exactly as unrecognized as a wrong-shaped one (see this function's own header). */
function parseManagedManifestV2(obj: Record<string, unknown>): PreviouslyManagedFile[] | undefined {
  if (!(obj.version === 2 && Array.isArray(obj.files))) return undefined;
  const files: PreviouslyManagedFile[] = [];
  for (const entry of obj.files) {
    const parsed = parseManifestV2Entry(entry);
    if (!parsed) return undefined;
    files.push(parsed);
  }
  return files;
}

/** The legacy, pre-provenance shape: `{version: 1, paths: [...]}` — every listed path is KNOWN but
 * UNVERIFIABLE. See this file's header, SECOND-ROUND CRITICAL FIX note, finding 1. */
function parseManagedManifestV1(obj: Record<string, unknown>): PreviouslyManagedFile[] | undefined {
  if (!(obj.version === 1 && Array.isArray(obj.paths) && obj.paths.every((path) => typeof path === "string"))) {
    return undefined;
  }
  return (obj.paths as string[]).map((path) => ({ path, sha: undefined }));
}

function parseManagedManifestShape(parsed: unknown): PreviouslyManagedFile[] | undefined {
  if (!isPlainObject(parsed)) return undefined;
  // `v1` only matches when `version` isn't 2, so falling through on a v2-shape validation FAILURE
  // still correctly returns `undefined` rather than misreading it as a v1 document.
  return parseManagedManifestV2(parsed) ?? parseManagedManifestV1(parsed);
}

/** Reads the PREVIOUS commit's copy of {@link MANAGED_MANIFEST_PATH} via the Contents API — the record
 *  of exactly which paths this adapter itself wrote last time, and (from `v2` onward) the blob sha it
 *  wrote for each (this file's header CRITICAL fix note, and its SECOND-ROUND CRITICAL FIX note, finding
 *  2, for why this read is no longer best-effort).
 *
 *  A VERIFIED 404 — GitHub confirming no such file exists — is the ONLY case treated as "zero prior
 *  paths"; it is a genuinely different fact than "this file could not be read," and is exactly what a
 *  brand-new-to-this-adapter branch (or the branch this adapter is about to create) looks like. Every
 *  OTHER failure (network, a non-404 HTTP error, a body that fails to parse, or a body that parses but
 *  matches neither manifest shape {@link parseManagedManifestShape} recognizes) now returns a real
 *  {@link StepFailure} — the caller fails the WHOLE commit rather than risk writing a new manifest that
 *  silently forgets what an unreadable one recorded. This is the OPPOSITE tolerance from
 *  {@link fetchLiveBlobSha} below, which stays best-effort per-path — see that function's own doc for
 *  why the two reads get different treatment.
 *
 * @complexity One `fetch()`.
 */
async function fetchManagedManifest(token: string, owner: string, repo: string, branch: string): Promise<{ ok: true; files: readonly PreviouslyManagedFile[] } | StepFailure> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/contents/${encPath(MANAGED_MANIFEST_PATH)}?ref=${enc(branch)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response") return nonResponseFailure(result);
  const { response } = result;
  if (response.status === 404) return { ok: true, files: [] }; // verified: no manifest yet — safe, not "unreadable"
  if (!response.ok) return { ok: false, code: "provider-error", message: await providerErrorMessage(response, "GitHub managed-manifest lookup failed") };

  const body = await readJsonBody(response);
  if (!body.ok) return { ok: false, code: "provider-error", message: "GitHub managed-manifest response did not parse as JSON — cannot confirm which paths this adapter previously owned." };
  const content = typeof body.json.content === "string" ? body.json.content : undefined;
  if (content === undefined) {
    return { ok: false, code: "provider-error", message: "GitHub managed-manifest response did not include file content — cannot confirm which paths this adapter previously owned." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(content, "base64").toString("utf8"));
  } catch {
    return { ok: false, code: "provider-error", message: "GitHub managed-manifest content is not valid JSON — cannot confirm which paths this adapter previously owned." };
  }
  const files = parseManagedManifestShape(parsed);
  if (files === undefined) {
    return { ok: false, code: "provider-error", message: "GitHub managed-manifest content did not match a recognized shape — cannot confirm which paths this adapter previously owned." };
  }
  return { ok: true, files };
}

/** THREE-way, not two: {@link resolveDeletionCandidates} needs "GitHub confirms the path no longer
 *  exists" (`"confirmed-absent"` — nothing to report, there is genuinely nothing left to track) kept
 *  distinct from "still there, we just couldn't look" (`"unverifiable"` — network failure, a non-404
 *  non-2xx status, or a 2xx body this file can't read a sha out of). Collapsing both into one bucket
 *  used to drop an unverifiable path out of `divergedPaths` (which the human does see) exactly like a
 *  verified deletion, silently forgetting its provenance on nothing stronger than a transient read
 *  failure — see this file's header SECOND-ROUND CRITICAL FIX note, finding 1, for the identical
 *  mistake one scope up (the manifest read itself). */
type LiveBlobShaResult = { kind: "found"; sha: string } | { kind: "confirmed-absent" } | { kind: "unverifiable" };

/** Reads the CURRENT blob sha GitHub has for `path` on `branch` right now — used ONLY to verify a
 *  single candidate deletion still matches what this adapter itself last recorded writing (this file's
 *  header SECOND-ROUND CRITICAL FIX note, finding 1). Best-effort, mirroring the tolerance
 *  {@link fetchManagedManifest} itself used to have before this same fix made THAT read load-bearing:
 *  `"unverifiable"` on ANY failure (network, non-2xx other than 404, unparseable body) — {@link
 *  resolveDeletionCandidates} treats it as "cannot confirm this ONE deletion is safe, but must still
 *  account for the path," which always resolves to skipping just that one deletion (never to failing
 *  the whole commit) while still reporting it. That narrower blast radius is exactly why this read gets
 *  the opposite tolerance from the manifest read itself: a failure here can only ever cost one
 *  candidate's cleanup this pass, never the ownership record as a whole. Only a VERIFIED 404 (the path
 *  is genuinely absent, e.g. already deleted by a previous pass or a human) is `"confirmed-absent"` —
 *  the one outcome with nothing left to track or report.
 *
 * @complexity One `fetch()` per call — bounded by the (typically small) number of candidate deletions,
 *   never by the size of the whole repository.
 */
async function fetchLiveBlobSha(token: string, owner: string, repo: string, branch: string, path: string): Promise<LiveBlobShaResult> {
  const result = await githubFetch(`${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}/contents/${encPath(path)}?ref=${enc(branch)}`, { headers: githubHeaders(token) });
  if (result.kind !== "response") return { kind: "unverifiable" };
  if (result.response.status === 404) return { kind: "confirmed-absent" };
  if (!result.response.ok) return { kind: "unverifiable" };
  const body = await readJsonBody(result.response);
  if (!body.ok) return { kind: "unverifiable" };
  return typeof body.json.sha === "string" ? { kind: "found", sha: body.json.sha } : { kind: "unverifiable" };
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
 * see this file's header CRITICAL fix note) is sent as `base_tree`, so the new tree is built ON TOP of
 * the branch's current content: every path this call does not mention is inherited unchanged.
 *
 * A path in `previousManagedFiles` (this adapter's OWN record of what it wrote last time, now WITH a
 * per-path blob sha — this file's header SECOND-ROUND CRITICAL FIX note, finding 1) that the current
 * `files` set no longer produces is a CANDIDATE deletion, never an automatic one: {@link
 * fetchLiveBlobSha} confirms the path's CURRENT live content still has exactly the recorded sha before
 * this function ever adds `sha: null` for it. A candidate with no recorded sha (a legacy manifest entry)
 * or whose live sha has diverged is left alone and reported in `divergedPaths` instead — ownership
 * membership alone is never enough to authorize a delete. `MANAGED_MANIFEST_PATH` is excluded from
 * candidacy defensively (it is never part of `previousManagedFiles`' own meaning — see its own doc — but
 * a manifest written by some future/other version should not be able to delete itself via this path).
 * {@link MANAGED_MANIFEST_PATH} itself is always (re)written alongside the export, now carrying each
 * current path's own blob sha, so the NEXT commit can verify its own deletions the same way.
 *
 * @complexity O(files) `fetch()` calls for blobs (deduped), plus O(candidate deletions) `fetch()` calls
 *   to verify live content (bounded by how many previously-managed paths this export just dropped, never
 *   by the size of the whole repository), plus one more for the manifest blob, plus one for the tree.
 */
/** Phase 1: one blob per distinct file content (deduped by hash), and the tree entries + per-path
 * shas that come out of it. Split out of `buildTree` because this loop's own `if (!blobSha)` /
 * `if (!blobResult.ok)` pair is unrelated to phase 2's deletion-candidate verification below. */
async function buildFileTreeEntries(
  token: string,
  owner: string,
  repo: string,
  files: readonly CommitFile[]
): Promise<
  | { ok: true; tree: Record<string, unknown>[]; currentPaths: Set<string>; currentFileShas: { path: string; sha: string }[] }
  | StepFailure
> {
  const blobShaByHash = new Map<string, string>();
  const tree: Record<string, unknown>[] = [];
  const currentPaths = new Set<string>();
  const currentFileShas: { path: string; sha: string }[] = [];
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
    currentFileShas.push({ path: file.path, sha: blobSha });
  }
  return { ok: true, tree, currentPaths, currentFileShas };
}

/** What {@link resolveDeletionCandidates} does with one candidate once its live content is known —
 *  `"skip"` (confirmed absent: nothing to delete or report), `"diverged"` (never auto-deleted, but
 *  reported: either unverifiable, or verified live content that no longer matches), or `"delete"`
 *  (verified live content matches exactly what this adapter last wrote). Pure classification, split
 *  out of the loop below so the four-way outcome dispatch reads as one flat decision instead of
 *  nesting inside both the candidates loop and its own network-result check. */
function classifyLiveResult(liveResult: LiveBlobShaResult, recordedSha: string): "skip" | "diverged" | "delete" {
  if (liveResult.kind === "confirmed-absent") return "skip";
  if (liveResult.kind === "unverifiable") return "diverged";
  return liveResult.sha === recordedSha ? "delete" : "diverged";
}

/** Phase 2: verifies each deletion CANDIDATE (a path this adapter previously recorded owning that
 * the current export no longer produces) against its LIVE content before treating it as safe to
 * delete — never from list membership alone (this file's header SECOND-ROUND CRITICAL FIX note,
 * finding 1). */
async function resolveDeletionCandidates(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  candidates: readonly PreviouslyManagedFile[]
): Promise<{ deletions: Record<string, unknown>[]; deletedPaths: string[]; divergedPaths: string[] }> {
  const deletions: Record<string, unknown>[] = [];
  const deletedPaths: string[] = [];
  const divergedPaths: string[] = [];
  for (const candidate of candidates) {
    if (candidate.sha === undefined) {
      // No recorded provenance for this path (a pre-provenance v1 manifest entry, or a malformed v2
      // one) — nothing to verify against, so it is never auto-deleted. Reported, not silently dropped.
      divergedPaths.push(candidate.path);
      continue;
    }
    const liveResult = await fetchLiveBlobSha(token, owner, repo, branch, candidate.path);
    // "skip" (confirmed-absent): an absent path in isolation is not evidence of tampering — nothing
    // to delete, nothing to report. "diverged" covers TWO distinct cases, both reported so the path
    // is never silently dropped from `divergedPaths` (which the human does see) or the next manifest
    // (built from this pass's export alone, so a skipped candidate is never a candidate again): an
    // UNVERIFIABLE read (network, a non-404 error status, an unreadable body — the path is
    // presumably still there, we just couldn't confirm it), or a verified live sha that no longer
    // matches (content changed since this adapter wrote it). "delete": verified, safe to remove.
    const verdict = classifyLiveResult(liveResult, candidate.sha);
    if (verdict === "skip") continue;
    if (verdict === "diverged") {
      divergedPaths.push(candidate.path);
      continue;
    }
    deletedPaths.push(candidate.path);
    deletions.push({ path: candidate.path, mode: "100644", type: "blob", sha: null });
  }
  return { deletions, deletedPaths, divergedPaths };
}

/** Phase 3: creates the tree object itself from the assembled entries. */
async function createTreeObject(
  token: string,
  owner: string,
  repo: string,
  tree: readonly Record<string, unknown>[],
  baseTreeSha: string | undefined
): Promise<{ ok: true; sha: string } | StepFailure> {
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
  return { ok: true, sha };
}

async function buildTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: readonly CommitFile[],
  baseTreeSha: string | undefined,
  previousManagedFiles: readonly PreviouslyManagedFile[] | undefined
): Promise<{ ok: true; sha: string; deletedPaths: string[]; divergedPaths: string[] } | StepFailure> {
  const fileTree = await buildFileTreeEntries(token, owner, repo, files);
  if (!fileTree.ok) return fileTree;

  const candidates = (previousManagedFiles ?? []).filter(
    (f) => !fileTree.currentPaths.has(f.path) && f.path !== MANAGED_MANIFEST_PATH
  );
  const { deletions, deletedPaths, divergedPaths } = await resolveDeletionCandidates(token, owner, repo, branch, candidates);

  const manifestBlob = await createBlob(
    token,
    owner,
    repo,
    JSON.stringify({ version: 2, files: fileTree.currentFileShas.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) })
  );
  if (!manifestBlob.ok) return manifestBlob;

  const tree = [...fileTree.tree, ...deletions, { path: MANAGED_MANIFEST_PATH, mode: "100644", type: "blob", sha: manifestBlob.sha }];
  const treeResult = await createTreeObject(token, owner, repo, tree, baseTreeSha);
  if (!treeResult.ok) return treeResult;

  return { ok: true, sha: treeResult.sha, deletedPaths, divergedPaths };
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
 *  4. {@link fetchManagedManifest} — REQUIRED whenever step 2 found a parent (this file's header
 *     SECOND-ROUND CRITICAL FIX note, finding 2): the previous commit's record of which paths THIS
 *     adapter itself wrote (and their blob shas, from `v2` onward), used to compute targeted, VERIFIED
 *     deletions. A verified 404 is the one exception that still degrades to "zero prior paths."
 *  5. {@link buildTree} — blobs (deduped) + per-candidate live-content verification + one manifest blob
 *     + one tree, built ON TOP OF step 3's tree (`base_tree`) whenever a parent exists, with step 4's
 *     stale paths deleted ONLY once their live content is confirmed unchanged since this adapter wrote
 *     it (this file's header SECOND-ROUND CRITICAL FIX note, finding 1).
 *  6. No-changes short-circuit: if the new tree sha equals step 3's, stop here — no commit, no ref
 *     write, `{ok: false, code: "no-changes"}`.
 *  7. {@link createCommitObject}.
 *  8. {@link writeRef} — the one irreversible step.
 *
 * @complexity O(files) `fetch()` calls (blob creation, deduped) plus a small fixed number of
 *   additional calls (repo, ref lookup, parent-tree read, manifest read, tree, commit, ref write).
 */
/** `input.branch`, or the repo's own default when the caller didn't pin one. */
function resolveCommitBranch(inputBranch: string | undefined, defaultBranch: string): string {
  return inputBranch ?? defaultBranch;
}

/**
 * Everything a brand-new branch skips entirely and an existing one REQUIRES (this file's header
 * CRITICAL fix note, and SECOND-ROUND CRITICAL FIX note finding 2): the parent tree to build on top
 * of, and the previous-commit manifest of paths this adapter itself owns. Both gate on the exact
 * same fact — whether a parent commit exists — so one `if` here replaces what were two identical
 * conditions (`parentSha !== undefined` and `!branchCreated`) written out separately in `commit()`.
 */
async function resolveCommitPrerequisites(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  parentSha: string | undefined
): Promise<
  | { ok: true; baseTreeSha: string | undefined; previousManagedFiles: readonly PreviouslyManagedFile[] | undefined; parents: readonly string[] }
  | StepFailure
> {
  if (parentSha === undefined) {
    return { ok: true, baseTreeSha: undefined, previousManagedFiles: undefined, parents: [] };
  }

  const parentTreeResult = await fetchParentTree(token, owner, repo, parentSha);
  if (!parentTreeResult.ok) return parentTreeResult;

  const manifestResult = await fetchManagedManifest(token, owner, repo, branch);
  if (!manifestResult.ok) return manifestResult;

  return { ok: true, baseTreeSha: parentTreeResult.treeSha, previousManagedFiles: manifestResult.files, parents: [parentSha] };
}

/** True when `buildTree` produced the SAME tree the branch already has — nothing to commit. */
function treeUnchanged(baseTreeSha: string | undefined, newTreeSha: string): boolean {
  return baseTreeSha !== undefined && baseTreeSha === newTreeSha;
}

/** `writeRef`'s `mode` parameter, derived from whether this commit is creating the branch. */
function refModeFor(branchCreated: boolean): "create" | "update" {
  return branchCreated ? "create" : "update";
}

export function createGitHubCommitAdapter(): GitHubCommitAdapter {
  return {
    async commit(input): Promise<GitHubCommitAdapterResult> {
      const { token, owner, repo, commitMessage, files } = input;

      const repoResult = await fetchRepo(token, owner, repo);
      if (!repoResult.ok) return repoResult;
      const branch = resolveCommitBranch(input.branch, repoResult.defaultBranch);

      const tipResult = await fetchBranchTip(token, owner, repo, branch);
      if (!tipResult.ok) return tipResult;
      const parentSha = tipResult.tipSha;
      const branchCreated = parentSha === undefined;

      const prereqs = await resolveCommitPrerequisites(token, owner, repo, branch, parentSha);
      if (!prereqs.ok) return prereqs;

      const treeResult = await buildTree(token, owner, repo, branch, files, prereqs.baseTreeSha, prereqs.previousManagedFiles);
      if (!treeResult.ok) return treeResult;

      if (treeUnchanged(prereqs.baseTreeSha, treeResult.sha)) {
        return { ok: false, code: "no-changes", message: "nothing changed since the branch's last commit" };
      }

      const commitResult = await createCommitObject(token, owner, repo, commitMessage, treeResult.sha, prereqs.parents);
      if (!commitResult.ok) return commitResult;

      const refResult = await writeRef(token, owner, repo, branch, commitResult.sha, refModeFor(branchCreated));
      if (!refResult.ok) return refResult;

      return {
        ok: true,
        branch,
        branchCreated,
        commitSha: commitResult.sha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${commitResult.sha}`,
        filesChanged: files.length,
        filesDeleted: treeResult.deletedPaths.length,
        divergedPaths: treeResult.divergedPaths,
      };
    },
  };
}
