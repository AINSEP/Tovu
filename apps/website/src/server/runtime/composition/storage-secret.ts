import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import type { KeyringPort, SecretSealerPort } from "#src/features/webhooks/ports";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { ensureSiteKey } from "#src/features/webhooks/site-key-ensure";
import { resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-sources";
import type { SealedSecret } from "#src/features/webhooks/types";
import { STORAGE_SECRET_FILENAME } from "#src/platform/site-dir/layout";
import type { SiteStorage } from "#src/platform/site-dir/types";

/**
 * @file Where a Postgres site's connection string comes from (owner decision O3, ADR-067): never
 * `.site-meta.json`. `secretRef: "site"` = sealed with the site key (AES-256-GCM, ADR-058's sealer)
 * in {@link STORAGE_SECRET_FILENAME} inside the site folder; `secretRef: { env }` = that environment
 * variable, for servers and containers that inject secrets instead of keeping them on disk.
 *
 * The sealer is built the way the composition's credential sealer is (`deps.ts`
 * `siteAssistantSecretSealer`): the site's own key sources, may read a key file, never mints one.
 * Errors never carry the connection string or the sealer's own message.
 */

/** The sealed connection string, in the site folder (mode 0600); named in `site-dir/layout.ts`. */
export { STORAGE_SECRET_FILENAME };

/** Bound into the ciphertext: a sealed value from any other store never opens as this one. */
const STORAGE_SECRET_AAD = "tovu:site-storage:postgres-connection:v1";

interface StorageSecretFile {
  version: 1;
  sealed: SealedSecret;
}

/** The connection string cannot be found or opened. The message says where to look, never the value. */
export class StorageSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageSecretError";
  }
}

export interface SiteSecretSealer {
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
}

/**
 * The site key's sealer for `siteDir` (its `.site-meta.json` names the key; `siteKeyId` names it
 * for a site whose meta file is not written yet).
 */
export function siteSecretSealer(
  siteDir: string,
  env: NodeJS.ProcessEnv = process.env,
  siteKeyId: string | undefined = resolveSiteKeyId({ siteDir })
): SiteSecretSealer {
  const keyring = new EnvOrFileKeyring({
    allowFileFallback: true,
    allowFileAutoGenerate: false,
    sources: siteKeySources({ mode: resolveRuntimeMode(), env, home: homedir(), cwd: process.cwd(), siteKeyId }),
  });
  return { keyring, sealer: new AesGcmSecretSealer(keyring) };
}

/**
 * Seals `connectionString` with the site key into `<siteDir>/.storage-secret.json`, replacing any
 * earlier one. Written to a 0600 temp file and renamed, so a reader never sees half a file.
 *
 * @complexity One AES-GCM seal, one small file write.
 */
export async function writeSealedConnectionString(
  required: { siteDir: string; connectionString: string },
  optional: Partial<SiteSecretSealer> = {}
): Promise<void> {
  const { sealer, keyring } = { ...siteSecretSealer(required.siteDir), ...optional };
  const sealed = await sealer.seal({ plaintext: required.connectionString, key: await keyring.activeKey(), aad: STORAGE_SECRET_AAD });
  const file: StorageSecretFile = { version: 1, sealed };
  const target = path.join(required.siteDir, STORAGE_SECRET_FILENAME);
  const temp = path.join(required.siteDir, `.${STORAGE_SECRET_FILENAME}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(file, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}

/**
 * `tovu init --storage postgres` without `--storage-env`: makes sure the new site's key exists (the
 * one place outside boot that may mint it, `ensureSiteKey`), then seals `connectionString` with it.
 * The site's `.site-meta.json` is written last by init, so the key id is passed in.
 *
 * @returns the sealer, so init can open the store before the meta file names the key.
 * @throws {StorageSecretError} when the site key cannot be made (an invalid key source, or a refusal).
 */
export async function sealConnectionStringForNewSite(required: {
  siteDir: string;
  siteKeyId: string;
  connectionString: string;
}): Promise<SiteSecretSealer> {
  const { siteDir, siteKeyId, connectionString } = required;
  // A site being created holds no key-dependent data yet.
  const ensured = await ensureSiteKey({ siteDir, siteKeyId, findKeyDependentData: async () => false });
  if (ensured.action === "invalid" || ensured.action === "refuse") {
    throw new StorageSecretError(`could not prepare this site's key to seal its Postgres connection string (${ensured.action}); fix the site key, then retry`);
  }
  const sealing = siteSecretSealer(siteDir, process.env, siteKeyId);
  await writeSealedConnectionString({ siteDir, connectionString }, sealing);
  return sealing;
}

/**
 * Opens `<siteDir>/.storage-secret.json`.
 *
 * @throws {StorageSecretError} when the file is missing or malformed, or does not open with this
 *   site's key (a different key, a tampered file).
 */
export async function readSealedConnectionString(required: { siteDir: string }, optional: { sealer?: SecretSealerPort } = {}): Promise<string> {
  const target = path.join(required.siteDir, STORAGE_SECRET_FILENAME);
  let file: StorageSecretFile;
  try {
    file = JSON.parse(fs.readFileSync(target, "utf8")) as StorageSecretFile;
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    throw new StorageSecretError(
      missing ? `this site stores its Postgres connection string sealed in ${target}, which does not exist` : `${target} is not valid JSON`
    );
  }
  const sealed = file?.sealed;
  if (file?.version !== 1 || typeof sealed?.ciphertext !== "string" || typeof sealed.nonce !== "string") {
    throw new StorageSecretError(`${target} is not a sealed connection string (version 1)`);
  }
  const sealer = optional.sealer ?? siteSecretSealer(required.siteDir).sealer;
  try {
    return await sealer.open({ sealed, aad: STORAGE_SECRET_AAD });
  } catch {
    // The sealer's own error may describe the key; it is replaced, never passed on.
    throw new StorageSecretError(`${target} does not open with this site's key (a different site key, or the file was changed)`);
  }
}

/**
 * The connection string a `postgres` site names: its environment variable, or its sealed file.
 *
 * @throws {StorageSecretError} when the variable is unset/empty or the sealed file cannot be opened.
 */
export async function resolvePostgresConnectionString(
  storage: Extract<SiteStorage, { kind: "postgres" }>,
  required: { siteDir: string },
  optional: { env?: NodeJS.ProcessEnv; sealer?: SecretSealerPort } = {}
): Promise<string> {
  const { secretRef } = storage;
  if (secretRef === "site") return readSealedConnectionString(required, { sealer: optional.sealer });
  const value = (optional.env ?? process.env)[secretRef.env];
  if (value === undefined || value.trim() === "") {
    throw new StorageSecretError(`this site reads its Postgres connection string from the environment variable ${secretRef.env}, which is not set`);
  }
  return value;
}
