import { readMediaStoreEnvChoice, selectMediaBlobStore, type BlobStorePort, type MediaObjectStorePorts as JiniMediaObjectStorePorts, type MediaStoreEnvChoice } from "@jini-ai/cms/media";
import { createLocalFsObjectStore } from "@jini-ai/platform/object-store";

import type { ObjectStoreEnvDeclaration, ObjectStoreHost } from "./registry.js";

/**
 * @file Tovu's binding of `selectMediaBlobStore` (`@jini-ai/cms/media`): the one seam behind
 * `RouteDeps.blobStore`. Every read/write path (`/m/...` rendition serving, admin upload/purge,
 * static export's asset crawl) goes through the store this returns.
 *
 * Precedence: the operator env override `TOVU_MEDIA_BLOB_STORE` (`local` | `s3`), then the site
 * setting `core.storage.mediaObjectStore`, then the registry default `local` (the site's uploads
 * folder). Keys are `computeBlobStorageKey`'s `ws/...` keys (plus the operator's key prefix for S3),
 * so no stored `asset_blobs.storage_key` needs migrating.
 */

export const MEDIA_OBJECT_STORE_ENV = "TOVU_MEDIA_BLOB_STORE";
const MEDIA_OBJECT_STORE_SETTING = "core.storage.mediaObjectStore";

/** The boot ports, bound to Tovu's object-store host (SigV4 signing + optional request tracing). */
export type MediaObjectStorePorts = JiniMediaObjectStorePorts<ObjectStoreHost>;

/**
 * Reads and validates `TOVU_MEDIA_BLOB_STORE`; messages are the ones operators already know.
 * @throws {Error} Unknown backend, or a declared selector without every required variable.
 */
export function readMediaStoreEnv(required: { readonly env: Readonly<Record<string, string | undefined>> }, optional: { readonly envDeclarations?: readonly ObjectStoreEnvDeclaration[] } = {}): MediaStoreEnvChoice {
  return readMediaStoreEnvChoice({ env: required.env, envName: MEDIA_OBJECT_STORE_ENV }, optional);
}

/**
 * Builds the media blob store rooted at `uploadsDir` for the local choice.
 * @throws {Error} See {@link readMediaStoreEnv}.
 */
export function createMediaBlobStore(
  required: { readonly uploadsDir: string; readonly env: Readonly<Record<string, string | undefined>>; readonly ports: () => MediaObjectStorePorts },
  optional: { readonly envDeclarations?: readonly ObjectStoreEnvDeclaration[] } = {}
): { readonly blobStore: BlobStorePort; readonly mediaIsRemoteByEnv: boolean; readonly isMediaRemote: () => Promise<boolean> } {
  return selectMediaBlobStore({
    env: required.env, envName: MEDIA_OBJECT_STORE_ENV, settingName: MEDIA_OBJECT_STORE_SETTING,
    local: () => createLocalFsObjectStore({ rootDir: required.uploadsDir }),
    ports: required.ports,
  }, optional);
}
