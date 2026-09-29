import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { countSealedCredentialsOpening, discardSealedCredentialsNotOpening } from "#src/platform/db/sealed-credential-discard";
import { CONTENT_DB_FILENAME, STORAGE_SECRET_FILENAME } from "#src/platform/site-dir/layout";
import { FixedRootKeyKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { installSiteKey, mintSiteKeyHex } from "#src/features/webhooks/site-key-ensure";
import { readSealedConnectionString } from "./storage-secret.js";
import { SEALED_COLUMN_DESCRIPTORS } from "./sealed-credential-descriptors.js";

/**
 * @file What the admin Site Token route's last-resort recovery ("Paste your old token", "Start
 * fresh") needs beyond HTTP, built here because the route may not import the key writer
 * (`site-key-ensure.ts`) or the storage kernel's sealed-row code. `app.ts` hands
 * {@link siteTokenRecovery} to `registerAdminSiteTokenRoutes`.
 *
 * Every check runs against a candidate key held only in memory (`FixedRootKeyKeyring`), so nothing
 * is written until the caller decides. The store checked is the running site's own kernel when
 * there is one, otherwise its `content.db` opened (and closed) here.
 */

/** Whether `.storage-secret.json` (a Postgres site's sealed connection string) opens under a key. */
export type StorageSecretCheck = "absent" | "opens" | "locked";

export interface SiteTokenKeyCheck {
  /** Sealed credential values in the site's database. */
  readonly sealed: number;
  /** How many of them open under the checked key. */
  readonly opens: number;
  readonly storageSecret: StorageSecretCheck;
}

export interface SiteTokenRecoveryInput {
  readonly siteDir: string;
  /** The running site's own store, when it has one open. */
  readonly contentKernel?: ContentKernel;
  readonly hex: string;
}

/** Counts sealed values (and the storage secret) that open under `input.hex`.
 *  @complexity {@link countSealedCredentialsOpening}'s cost plus one small file read. */
async function checkKey(input: SiteTokenRecoveryInput): Promise<SiteTokenKeyCheck> {
  const sealer = new AesGcmSecretSealer(new FixedRootKeyKeyring(input.hex));
  const counts = await withSiteKernel(input, (kernel) => countSealedCredentialsOpening({ kernel, sealer, descriptors: SEALED_COLUMN_DESCRIPTORS }), { sealed: 0, opens: 0 });
  return { ...counts, storageSecret: await checkStorageSecret(input.siteDir, sealer) };
}

/** Removes every sealed value that does not open under `input.hex`. The caller takes a restore point
 *  first. @complexity {@link discardSealedCredentialsNotOpening}'s cost. */
async function discardNotOpening(input: SiteTokenRecoveryInput): Promise<{ discarded: number; kept: number }> {
  const sealer = new AesGcmSecretSealer(new FixedRootKeyKeyring(input.hex));
  return withSiteKernel(input, (kernel) => discardSealedCredentialsNotOpening({ kernel, sealer, descriptors: SEALED_COLUMN_DESCRIPTORS }), { discarded: 0, kept: 0 });
}

async function checkStorageSecret(siteDir: string, sealer: AesGcmSecretSealer): Promise<StorageSecretCheck> {
  if (!existsSync(join(siteDir, STORAGE_SECRET_FILENAME))) return "absent";
  try {
    await readSealedConnectionString({ siteDir }, { sealer });
    return "opens";
  } catch {
    return "locked";
  }
}

/** Runs `use` on the site's open store, or on its `content.db` opened for this call; `empty` when
 *  the site has no database yet. */
async function withSiteKernel<R>(input: SiteTokenRecoveryInput, use: (kernel: ContentKernel) => Promise<R>, empty: R): Promise<R> {
  if (input.contentKernel !== undefined) return use(input.contentKernel);
  const dbPath = join(input.siteDir, CONTENT_DB_FILENAME);
  if (!existsSync(dbPath)) return empty;
  const kernel = openSqliteFileKernel<ContentDatabase>(dbPath);
  try {
    return await use(kernel);
  } finally {
    await kernel.close();
  }
}

/** The recovery half of the route's `SiteTokenServices`. */
export const siteTokenRecovery = { checkKey, discardNotOpening, installSiteKey, mintSiteKeyHex };
