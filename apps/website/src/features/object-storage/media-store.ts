import { blobStoreFromObjectStore, type BlobStorePort } from "@jini-ai/cms/media";
import { deferObjectStore, type ObjectStore, type ObjectStoreCreateInput } from "@jini-ai/core/object-store";
import { createLocalFsObjectStore } from "@jini-ai/platform/object-store";

import type { LoadedObjectStoreRegistry, ObjectStoreHost } from "./registry.js";

/**
 * @file Where the site's media bytes live — the one seam behind `RouteDeps.blobStore`. Every
 * read/write path (`/m/...` rendition serving, admin upload/purge, static export's asset crawl)
 * goes through the store this returns, so no other file changes when the provider does.
 *
 * Precedence: the operator env override `TOVU_MEDIA_BLOB_STORE` (`local` | `s3`), then the site
 * setting `core.storage.mediaObjectStore`, then the registry default `local`.
 *
 * Fails LOUD, not silently: an unknown env value or an incomplete `s3` env config throws here,
 * synchronously at boot — an operator who typos the opt-in must see a startup error, not have the
 * install quietly write local files nobody expected (which would look like "media works" until the
 * next deploy wipes the ephemeral disk). A site-setting choice that cannot be honoured (provider not
 * installed, credential missing) rejects every media call with the reason, for the same reason: it
 * never falls back to local disk.
 *
 * Keys never change: every provider is handed `computeBlobStorageKey`'s `ws/...` key (plus the
 * operator's key prefix for S3), so no stored `asset_blobs.storage_key` needs migrating.
 */

export const MEDIA_OBJECT_STORE_ENV = "TOVU_MEDIA_BLOB_STORE";

/** The S3 provider's registry id (the env value `s3` maps to it). */
export const S3_OBJECT_STORE_ID = "s3_compatible";

type Credential = NonNullable<ObjectStoreCreateInput["credential"]>;

/** The env override, resolved synchronously: unset, local, or a complete S3 config. */
export type MediaStoreEnvChoice =
  | { readonly kind: "unset" }
  | { readonly kind: "local" }
  | { readonly kind: "s3"; readonly settings: Readonly<Record<string, string | undefined>>; readonly credential: Credential };

/** Late-bound boot ports: read on first media use, after the composition root has built them. */
export interface MediaObjectStorePorts {
  readonly host: ObjectStoreHost;
  /** Bundled-source providers for the env override (no activation gate, like the old env path). */
  loadBundledRegistry(): Promise<LoadedObjectStoreRegistry>;
  /** This workspace's installed providers for the site setting. */
  loadSiteRegistry(): Promise<LoadedObjectStoreRegistry>;
  readSetting(): Promise<string>;
  /** The site's saved connection shared with backup shares, for a remote provider id. */
  resolveSharedCredential(required: { readonly providerId: string }): Promise<Credential | undefined>;
}

/**
 * Reads and validates the env override. Error texts are the ones operators already know.
 * @throws {Error} Unknown backend, or `s3` without every required variable.
 * @complexity O(1).
 */
export function readMediaStoreEnv(required: { readonly env: Readonly<Record<string, string | undefined>> }, _optional: Record<string, never> = {}): MediaStoreEnvChoice {
  const { env } = required;
  const backend = env[MEDIA_OBJECT_STORE_ENV];
  if (backend === undefined) return { kind: "unset" };
  if (backend === "local") return { kind: "local" };
  if (backend !== "s3") throw new Error(`Unknown TOVU_MEDIA_BLOB_STORE '${backend}' — expected 'local' or 's3'.`);
  // Each entry pairs the env var name with its value, so a missing one is reported by its real name.
  const requiredVars: Array<[name: string, value: string | undefined]> = [
    ["TOVU_S3_BUCKET", env.TOVU_S3_BUCKET],
    ["TOVU_S3_REGION", env.TOVU_S3_REGION],
    ["TOVU_S3_ACCESS_KEY_ID", env.TOVU_S3_ACCESS_KEY_ID],
    ["TOVU_S3_SECRET_ACCESS_KEY", env.TOVU_S3_SECRET_ACCESS_KEY],
  ];
  const missing = requiredVars.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`TOVU_MEDIA_BLOB_STORE=s3 requires ${requiredVars.map(([name]) => name).join(", ")} — missing: ${missing.join(", ")}.`);
  }
  return {
    kind: "s3",
    settings: { bucket: env.TOVU_S3_BUCKET, keyPrefix: env.TOVU_S3_KEY_PREFIX },
    credential: { fields: { accessKeyId: env.TOVU_S3_ACCESS_KEY_ID, region: env.TOVU_S3_REGION, endpoint: env.TOVU_S3_ENDPOINT }, secret: env.TOVU_S3_SECRET_ACCESS_KEY as string },
  };
}

/**
 * Builds the media blob store. Synchronous so boot can fail loud before any background work starts;
 * the provider itself is resolved on first media use through `ports()`.
 * @returns The store, and whether media is known to live in `uploadsDir` (backup includes the folder).
 * @throws {Error} See {@link readMediaStoreEnv}.
 * @complexity O(1) now; first media call does one setting read and at most one registry load.
 */
export function createMediaBlobStore(
  required: { readonly uploadsDir: string; readonly env: Readonly<Record<string, string | undefined>>; readonly ports: () => MediaObjectStorePorts },
  _optional: Record<string, never> = {}
): { readonly blobStore: BlobStorePort; readonly mediaIsRemoteByEnv: boolean } {
  const choice = readMediaStoreEnv({ env: required.env });
  const local = () => createLocalFsObjectStore({ rootDir: required.uploadsDir });
  const store = choice.kind === "local" ? local() : deferObjectStore({ load: () => loadMediaObjectStore({ choice, ports: required.ports(), local }) });
  return { blobStore: blobStoreFromObjectStore({ store }), mediaIsRemoteByEnv: choice.kind === "s3" };
}

/**
 * Resolves the provider for an env-`s3` or setting-driven choice.
 * @throws {Error} The chosen provider is not available or refused its configuration.
 * @complexity One setting read, at most one registry load and one credential read.
 */
async function loadMediaObjectStore(required: { readonly choice: Exclude<MediaStoreEnvChoice, { kind: "local" }>; readonly ports: MediaObjectStorePorts; readonly local: () => ObjectStore }): Promise<ObjectStore> {
  const { choice, ports } = required;
  if (choice.kind === "s3") {
    return createFrom({ loaded: await ports.loadBundledRegistry(), providerId: S3_OBJECT_STORE_ID, settings: choice.settings, credential: choice.credential, host: ports.host });
  }
  const providerId = (await ports.readSetting()) || "local";
  if (providerId === "local") return required.local();
  const credential = await ports.resolveSharedCredential({ providerId });
  if (!credential) throw new Error(`Media storage '${providerId}' has no saved connection — connect it first, or clear core.storage.mediaObjectStore.`);
  const bucket = privateMediaBucket({ providerId, credential });
  return createFrom({ loaded: await ports.loadSiteRegistry(), providerId, settings: { bucket, keyPrefix: credential.fields.mediaKeyPrefix }, credential, host: ports.host });
}

/**
 * The shared connection's bucket is the PUBLIC publish/share bucket; media (drafts included) must
 * live in a private bucket of its own, so only an explicit `mediaBucket` is ever used — and one that
 * names the public bucket again (compared trimmed and case-folded, as bucket names are lowercase) is
 * refused, or private originals would be written into public storage.
 * @returns The trimmed `mediaBucket`.
 * @throws {Error} `mediaBucket` is blank, or is the public `bucket`.
 * @complexity O(name length).
 */
function privateMediaBucket(required: { readonly providerId: string; readonly credential: Credential }): string {
  const { providerId, credential } = required;
  const bucket = credential.fields.mediaBucket?.trim();
  if (!bucket) throw new Error(`Media storage '${providerId}' needs the connection's 'mediaBucket' field (a private bucket) — the publish bucket is public and is never used for media.`);
  if (bucket.toLowerCase() === credential.fields.bucket?.trim().toLowerCase()) {
    throw new Error(`Media storage '${providerId}' needs a 'mediaBucket' different from the connection's public 'bucket' — media (drafts included) must live in a private bucket.`);
  }
  return bucket;
}

/**
 * Both callers always hold a credential (env `s3` validates it at boot; the setting path refuses
 * without a saved connection), so it is required here rather than optional.
 * @throws {Error} Unknown provider (with the registry's refusals) or a refused configuration. @complexity O(1).
 */
function createFrom(required: { readonly loaded: LoadedObjectStoreRegistry; readonly providerId: string; readonly credential: Credential } & ObjectStoreCreateInput<ObjectStoreHost>): ObjectStore {
  const { loaded, providerId, settings, credential, host } = required;
  const entry = loaded.registry.get({ id: providerId });
  if (!entry) {
    const why = loaded.refusals.length > 0 ? ` (${loaded.refusals.join("; ")})` : "";
    throw new Error(`Media storage provider '${providerId}' is not available${why}.`);
  }
  const created = entry.provider.create({ settings, credential, host });
  if (created.status !== "ok") throw new Error(`Media storage provider '${providerId}' refused its configuration: ${created.error.message}`);
  return created.value;
}
