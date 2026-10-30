import type { ArtifactStorePort } from "@jini-ai/devops/deploy";
import { createHash } from "node:crypto";
import { createConsoleLogger, type HttpClientPort, type HttpResponse, type Logger } from "@jini-ai/core/primitives";
import { callPeer, type PeerCallDeps } from "../publish-content/peer-transport.js";
import { peerUrl } from "../publish-content/peer-url.js";
import { SiteShareRefusal } from "./share-policy.js";
import { SHARE_TOKEN_PATTERN, type SiteShareRegistry } from "./share-registry.js";
import { receiveSiteShareArtifact, type ShareDelivery } from "./share-service.js";

const ARTIFACT_KEY = new RegExp(`^_share/(${SHARE_TOKEN_PATTERN})/([a-z0-9][a-z0-9-]{0,79}\\.tovu\\.zip)$`);

/** Validates a share artifact key and returns its token and file; refuses INVALID_INPUT otherwise. O(key). */
function parseArtifactKey(key: string): { token: string; file: string } {
  const match = ARTIFACT_KEY.exec(key);
  if (!match) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid share artifact key." });
  return { token: match[1]!, file: match[2]! };
}

/** A 200 anonymous attachment of exactly `bytes`, served uncached, unsniffed and unindexed. */
function isPublicAttachment(required: { response: HttpResponse; bytes?: number }): boolean {
  const headers = new Headers(required.response.headers);
  if (required.response.status !== 200 || Number(headers.get("content-length")) !== required.bytes || headers.get("cache-control") !== "no-store") return false;
  return headers.get("x-content-type-options") === "nosniff" && headers.get("x-robots-tag") === "noindex, nofollow" && /^attachment(?:;|$)/i.test(headers.get("content-disposition") ?? "");
}

/** Both Tovu delivery variants verify through the same anonymous attachment contract. */
async function verifyServerShare(required: { http: HttpClientPort; key: string; url: string; expectedUrl: string; present: boolean; bytes?: number }, optional: { signal?: AbortSignal } = {}): Promise<boolean> {
  parseArtifactKey(required.key);
  if (required.url !== required.expectedUrl) return false;
  // Never send a destination credential to the anonymous download endpoint.
  const response = await required.http.send({ request: { method: "HEAD", url: required.url, headers: {}, idleTimeoutMs: 15_000, totalDeadlineMs: 20_000, maxResponseBytes: 1024, signal: optional.signal } }, { redirect: "error" });
  if (!required.present) return response.status === 404 || response.status === 410;
  return isPublicAttachment({ response, bytes: required.bytes });
}

/** Public origin is an explicit operator capability, never inferred from a local request Host. */
export function createRuntimeShareDelivery(required: { registry: SiteShareRegistry; site: string; publicOrigin: string; http: HttpClientPort }, _optional: Record<string, never> = {}): ShareDelivery {
  const origin = URL.parse(required.publicOrigin);
  const invalidOrigin = !origin || origin.protocol !== "https:" || origin.username || origin.password;
  if (invalidOrigin || origin.pathname !== "/" || origin.search || origin.hash) throw new SiteShareRefusal({ code: "STORAGE_SETUP", message: "TOVU_SHARE_PUBLIC_ORIGIN must be a public HTTPS origin without a path or credentials." });
  const store: ArtifactStorePort = {
    async upload({ key, bytes }, _optional = {}) {
      const { token, file } = parseArtifactKey(key);
      const existing = await required.registry.findToken({ token, file });
      if (existing && (existing.site !== required.site || existing.sha256 !== createHash("sha256").update(bytes).digest("hex"))) throw new SiteShareRefusal({ code: "ARTIFACT_CHANGED", message: "This token already names a different artifact." });
      if (!existing) await receiveSiteShareArtifact({ registry: required.registry, site: required.site, token, file, archive: Buffer.from(bytes) });
      return { url: `${origin.origin}/${key}` };
    },
    async delete({ key }, _optional = {}) {
      parseArtifactKey(key);
      const row = (await required.registry.list({ site: required.site })).find(row => key === `_share/${row.token}/${row.file}`);
      if (!row) return;
      await required.registry.disable({ shareId: row.shareId, site: row.site });
      await required.registry.deleteArtifact({ shareId: row.shareId });
    },
    verify: (input, options = {}) => verifyServerShare({ ...input, http: required.http, expectedUrl: `${origin.origin}/${input.key}` }, options),
  };
  return { provider: "tovu-server", binding: required.registry.directory, store };
}

/** Connected deployment artifact adapter. Reuses publishing credentials and guarded transport;
 * the deployed receiver needs no environment opt-in. The base URL pins revocation to that site. */
export function createPeerShareDelivery(required: { peer: PeerCallDeps; http: HttpClientPort }, _optional: Record<string, never> = {}): ShareDelivery {
  const baseUrl = required.peer.credential.baseUrl;
  const artifactPath = (key: string) => {
    const { token, file } = parseArtifactKey(key);
    return `/api/admin/v1/workspaces/${encodeURIComponent(required.peer.credential.remoteWorkspaceId)}/site-shares/artifacts/${token}/${file}`;
  };
  return { provider: "tovu-server", binding: baseUrl, store: {
    async upload({ key, bytes }, options = {}) {
      await callPeer(required.peer, { method: "PUT", path: artifactPath(key), archive: bytes, signal: options.signal });
      return { url: peerUrl(baseUrl, `/${key}`) };
    },
    async delete({ key }, options = {}) {
      // DELETE is idempotent, including after a previous successful remote cleanup.
      try { await callPeer(required.peer, { method: "DELETE", path: artifactPath(key), signal: options.signal }); }
      catch (error) { if ((error as { peerStatus?: number }).peerStatus !== 404) throw error; }
    },
    verify: (input, options = {}) => verifyServerShare({ ...input, http: required.http, expectedUrl: peerUrl(baseUrl, `/${input.key}`) }, options),
  } };
}

type ShareDeliverySources = {
  peer: () => Promise<PeerCallDeps | undefined>;
  http: HttpClientPort;
  objectStore: () => Promise<ShareDelivery | undefined>;
  runtime?: () => ShareDelivery;
  /** Where a skipped runtime delivery is reported; defaults to the console. */
  logger?: Pick<Logger, "warn">;
};
type SavedShareDelivery = { provider?: string; binding?: string };

/** No saved binding accepts any delivery; a saved one must name this delivery's own binding. */
function bindingMatches(required: { saved?: string; actual?: string }): boolean {
  return required.saved === undefined || required.saved === required.actual;
}

/** The connected deployed peer, else this server's runtime delivery, when its binding matches. */
async function resolveServerDelivery(required: ShareDeliverySources, optional: SavedShareDelivery = {}): Promise<ShareDelivery | undefined> {
  try {
    const peer = await required.peer();
    if (peer && bindingMatches({ saved: optional.binding, actual: peer.credential.baseUrl })) return createPeerShareDelivery({ peer, http: required.http });
  } catch { /* An unavailable connection still permits the configured object-store/ZIP fallback. */ }
  const runtime = runtimeDelivery(required);
  return runtime && bindingMatches({ saved: optional.binding, actual: runtime.binding }) ? runtime : undefined;
}

/** This server's runtime delivery; a misconfigured public origin leaves the object-store/ZIP fallback.
 * The warning carries the refusal code only: the configured origin may hold credentials. */
function runtimeDelivery(required: ShareDeliverySources): ShareDelivery | undefined {
  try { return required.runtime?.(); } catch (error) {
    const code = error instanceof SiteShareRefusal ? error.code : "UNEXPECTED";
    (required.logger ?? createConsoleLogger({ prefix: "" })).warn({ message: "[site-share] runtime share delivery is misconfigured; falling back to object storage or a private ZIP." }, { meta: { code } });
    return undefined;
  }
}

/** The configured object-store delivery when its provider and binding match the saved ones. */
async function resolveObjectStoreDelivery(required: ShareDeliverySources, optional: SavedShareDelivery = {}): Promise<ShareDelivery | undefined> {
  try {
    const objectStore = await required.objectStore();
    if (!objectStore || (optional.provider && optional.provider !== objectStore.provider)) return undefined;
    return bindingMatches({ saved: optional.binding, actual: objectStore.binding }) ? objectStore : undefined;
  } catch { return undefined; } // Failed credential resolution still leaves a private ZIP download.
}

/** Selection is shared by create and revoke: connected deployed peer, object store, then ZIP only.
 * A saved binding is mandatory on revoke; a changed default may never delete another site's ZIP. */
export async function resolveShareDelivery(required: ShareDeliverySources, optional: SavedShareDelivery = {}): Promise<ShareDelivery | undefined> {
  if (!optional.provider || optional.provider === "tovu-server") {
    const server = await resolveServerDelivery(required, optional);
    if (server || optional.provider) return server;
  }
  // Any object-store provider exposing an artifact store may deliver (not one hard-coded vendor);
  // a saved provider must be the one the site's object store resolves to now.
  return resolveObjectStoreDelivery(required, optional);
}
