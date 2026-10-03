import { ToolInputError } from "@jini-ai/core";
import { EgressRefusedError, type HttpClientPort } from "#src/platform/http/index";
import { OriginNotVerifiedError, type OriginRegistryPort } from "#src/features/origin/index";
import { selectConnectedDestination, type PublishContentPeerRepoPort } from "#src/features/publish-content/peers";
import type { PublishHistoryStore } from "#src/features/deployments/static-publish/index";
import { readPageBodyOptions, shapePageBody, DEFAULT_MAX_BODY_BYTES, MAX_MAX_BODY_BYTES, type PageBodyOptions } from "./page-body.js";
import { PublishedPagePathError, resolveSameOriginPath, toCookieShapes, type PublishedPageResult } from "./published-page.js";

/** Read ports only; missing ports on a test/older composition do not invent an address. */
export interface LiveOriginSourceDeps {
  workspaceId: string;
  publishContentPeerRepo?: Pick<PublishContentPeerRepoPort, "listByWorkspace">;
  publishHistoryStore?: Pick<PublishHistoryStore, "listLiveUrls">;
  originRegistry?: Pick<OriginRegistryPort, "canonicalOrigin">;
}
export interface FetchLiveUrlDeps {
  /** Fresh workspace-scoped reads, never request Host or a caller-supplied arbitrary URL. */
  listKnownOrigins(): Promise<readonly string[]>;
  /** The shared guarded client with redirects disabled and a raw 1 MB ceiling. */
  httpClient: HttpClientPort;
  /** Optional host instrumentation; receives no body, headers, credentials or query parameters. */
  observeFetch?: (event: { origin: string; status?: number; durationMs: number; outcome: "response" | "refused" | "failed" }) => void;
}
export interface FetchLiveUrlInput extends PageBodyOptions { path: string; origin?: string | undefined }
export type LivePageResult = PublishedPageResult & { url: string; origin: string; redirects: string[]; untrusted: true; location?: string };
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const NO_LIVE_ADDRESS = "fetch_live_url: this site has no known live address yet. Publish it first, or use fetch_published_page to check the local render.";
const DEADLINE_MESSAGE = "fetch_live_url: fetching the live page exceeded 15000ms. Check the hosting service before retrying.";

/** Normalizes saved URLs to origins; embedded credentials never become an allowed origin. */
function liveOrigin(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ToolInputError({ message: "fetch_live_url: a saved live address is invalid. Correct the publishing address and retry." }); }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) throw new ToolInputError({ message: "fetch_live_url: live origins must use HTTPS on port 443 without credentials." });
  return url.origin;
}

/** Reads connected + keyed peers, full-ledger publish URL projection, and the trusted configured origin. */
export async function listKnownLiveOrigins(deps: LiveOriginSourceDeps): Promise<string[]> {
  const peers = await deps.publishContentPeerRepo?.listByWorkspace({ workspaceId: deps.workspaceId }) ?? [];
  const connected = selectConnectedDestination(peers);
  const urls = peers.filter(peer => peer.sealed !== null || peer === connected).map(peer => peer.baseUrl);
  const historyUrls = await deps.publishHistoryStore?.listLiveUrls({ workspaceId: deps.workspaceId }) ?? [];
  if (historyUrls.length > 200) throw new ToolInputError({ message: "fetch_live_url: more than 200 distinct live addresses are recorded. Review the publish history before fetching." });
  urls.push(...historyUrls);
  if (deps.originRegistry) {
    try {
      const configured = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
      if (configured.source === "workspace-setting") urls.push(`${configured.scheme}://${configured.host}${configured.port ? `:${configured.port}` : ""}`);
    } catch (error) {
      if (!(error instanceof OriginNotVerifiedError)) throw error;
    }
  }
  return [...new Set(urls.map(liveOrigin))].sort();
}

/** Only the origin itself is accepted for explicit selection, never a path/userinfo-bearing URL. */
function selectOrigin(known: readonly string[], requested: string | undefined): string {
  const origins = [...new Set(known.map(liveOrigin))].sort();
  if (origins.length === 0) throw new ToolInputError({ message: NO_LIVE_ADDRESS });
  if (requested !== undefined) {
    const normalized = liveOrigin(requested);
    const explicit = new URL(requested);
    if (explicit.pathname !== "/" || explicit.search || explicit.hash) throw new ToolInputError({ message: `fetch_live_url: origin is not a known live address. Pass one of: ${origins.join(", ")}.` });
    if (!origins.includes(normalized)) throw new ToolInputError({ message: `fetch_live_url: origin is not a known live address. Pass one of: ${origins.join(", ")}.` });
    return normalized;
  }
  if (origins.length > 1) throw new ToolInputError({ message: `fetch_live_url: several live origins are known. Pass origin as one of: ${origins.join(", ")}.` });
  return origins[0]!;
}

/** Reuses the local path boundary while retaining actionable errors at the assistant boundary. */
function resolveLivePath(path: string, origin: string): string {
  try { return resolveSameOriginPath(path, origin); }
  catch (error) {
    if (error instanceof PublishedPagePathError) throw new ToolInputError({ message: `fetch_live_url: ${error.message}` });
    throw error;
  }
}

/** Validates raw and resolved same-origin paths before URL normalization can erase traversal. */
function redirectTarget(location: string, current: string, origin: string): string | null {
  let next: URL;
  try { next = new URL(location, current); }
  catch { throw new ToolInputError({ message: "fetch_live_url: the live site returned an invalid redirect address. Check the hosting service before retrying." }); }
  if (next.origin !== origin) return null;
  if (next.username || next.password) throw new ToolInputError({ message: "fetch_live_url: redirects with embedded credentials are refused." });
  const rawPath = location.replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*/i, "").split("#")[0]!;
  resolveLivePath(rawPath.startsWith("/") ? rawPath : "/" + rawPath, origin);
  resolveLivePath(next.pathname + next.search, origin);
  next.hash = "";
  return next.href;
}

/**
 * GETs this site's own live copy through the existing pinned-public-peer guard. One 15 s deadline
 * covers origin reads, DNS, redirects and body reads. Cross-origin and fourth redirects are results.
 * @returns Visitor response evidence; third-party text is explicitly untrusted, cookie values omitted.
 * @throws ToolInputError for address selection, unsafe input/egress, or timeout.
 */
export async function fetchLiveUrl(deps: FetchLiveUrlDeps, input: FetchLiveUrlInput): Promise<LivePageResult> {
  const options = readPageBodyOptions(input as unknown as Record<string, unknown>);
  const deadline = AbortSignal.timeout(15_000);
  return awaitWithDeadline(fetchWithinDeadline(deps, input, options, deadline), deadline);
}

/** One bounded operation, including slow repositories and time between redirect hops. */
async function fetchWithinDeadline(deps: FetchLiveUrlDeps, input: FetchLiveUrlInput, options: PageBodyOptions, deadline: AbortSignal): Promise<LivePageResult> {
  const started = Date.now();
  const origin = selectOrigin(await deps.listKnownOrigins(), input.origin);
  const path = resolveLivePath(input.path, origin);
  const rawReadCap = options.textOnly || options.find !== undefined ? MAX_MAX_BODY_BYTES : options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  let url = origin + path;
  const redirects: string[] = [];
  for (;;) {
    deadline.throwIfAborted();
    const response = await sendPage(deps, url, deadline, Math.max(1, 15_000 - (Date.now() - started)), rawReadCap);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) if (key.toLowerCase() !== "set-cookie") headers[key.toLowerCase()] = value;
    const location = headers.location;
    if (REDIRECTS.has(response.status) && location && redirects.length < 3) {
      const next = redirectTarget(location, url, origin);
      if (next !== null) { redirects.push(next); url = next; continue; }
    }
    const cookies = new Headers();
    for (const cookie of response.setCookies ?? []) cookies.append("set-cookie", cookie);
    const raw = Buffer.from(response.bodyText).subarray(0, MAX_MAX_BODY_BYTES).toString("utf8");
    const shaped = shapePageBody(raw, options);
    return { path: new URL(url).pathname + new URL(url).search, status: response.status, ok: response.status >= 200 && response.status < 300, headers, cookies: toCookieShapes(cookies), ...shaped, truncated: shaped.truncated || response.bodyTruncated === true || Buffer.byteLength(response.bodyText) > MAX_MAX_BODY_BYTES, url, origin, redirects, untrusted: true, ...(REDIRECTS.has(response.status) && location ? { location } : {}) };
  }
}

/** Caller-safe egress refusals, following media-import's policy-error projection without leaking IPs. */
async function sendPage(deps: FetchLiveUrlDeps, url: string, signal: AbortSignal, timeoutMs: number, maxResponseBytes: number) {
  const started = Date.now();
  try {
    const response = await deps.httpClient.send({ method: "GET", url, headers: {}, timeoutMs, signal, maxResponseBytes });
    deps.observeFetch?.({ origin: new URL(url).origin, status: response.status, durationMs: Date.now() - started, outcome: "response" });
    return response;
  } catch (error) {
    deps.observeFetch?.({ origin: new URL(url).origin, durationMs: Date.now() - started, outcome: error instanceof EgressRefusedError ? "refused" : "failed" });
    if (error instanceof EgressRefusedError) throw new ToolInputError({ message: `fetch_live_url: ${error.callerSafeMessage}` });
    if (signal.aborted) throw new ToolInputError({ message: DEADLINE_MESSAGE });
    throw error;
  }
}

/** Bounds the whole operation while releasing its listener on either completion path. */
async function awaitWithDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      abort = () => reject(new ToolInputError({ message: DEADLINE_MESSAGE }));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    })]);
  } finally { if (abort) signal.removeEventListener("abort", abort); }
}
