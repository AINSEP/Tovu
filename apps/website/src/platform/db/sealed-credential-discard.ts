import { sql } from "kysely";

import type { ContentKernel } from "./content-kernel.js";
import { listColumns } from "./kernel/dialect.js";
import type { StorageKernel } from "./kernel/port.js";
import {
  descriptorFits,
  discoverSealedColumns,
  siblingColumns,
  type DiscoveredSealedColumn,
  type SealedColumnDescriptor,
  type SealedRowIdentity,
} from "./sealed-credential-inventory.js";
import type { SiteKeyHandle, SecretSealerPort } from "#src/features/webhooks/index";

/**
 * @file The site key tab's last-resort recovery on sealed credentials (historical
 * recovery design dated 2026-09-14 §4.3/§4.6): which sealed values
 * open under a given key ("Paste your old site key" proves a key by opening a real one), and removing
 * the ones that do not ("Start fresh", after a restore point).
 *
 * Discovery and each store's AAD come from `sealed-credential-inventory.ts` (catalog + descriptors),
 * so a sealed column no descriptor knows is still found — it cannot be opened, so it counts as
 * unreadable. Values are matched for removal by their own ciphertext and nonce, never by a guessed
 * row key, so a value re-sealed between the read and the write is left alone.
 *
 * Removal per column: a NOT NULL sealed column is the row's whole point (a credential set), so the
 * row is deleted; a nullable one (an MCP server's OAuth blob, a media key) is cleared together with
 * the columns its shape check ties to it (`masked`, `key_tail`, `token_tail`), and the row is kept.
 * Plaintext from a successful open is discarded unread, except in {@link resealCredentialsOpeningUnder},
 * which passes it straight to `seal` under the new key; nothing here logs.
 */

/** Columns a store's shape check requires to be NULL exactly when its sealed value is. */
const COMPANION_SUFFIXES = ["masked", "key_tail", "token_tail"] as const;

export interface SealedCredentialKeyDeps {
  readonly kernel: ContentKernel;
  /** A sealer over the key being checked (e.g. `FixedSiteKeyKeyring`). Only `open` is used. */
  readonly sealer: Pick<SecretSealerPort, "open">;
  readonly descriptors: readonly SealedColumnDescriptor[];
}

interface SealedValue {
  readonly ref: DiscoveredSealedColumn;
  readonly quad: Quad;
  /** The store's AAD for this row; `undefined` when no descriptor fits or its AAD version is unknown. */
  readonly aad: string | undefined;
  readonly opens: boolean;
}

/**
 * How many sealed values the database holds, and how many open under `deps.sealer`.
 *
 * @complexity O(T·C + R) reads for T tables, C columns, R sealed values; one open per value.
 */
export async function countSealedCredentialsOpening(deps: SealedCredentialKeyDeps): Promise<{ sealed: number; opens: number }> {
  const values = await readSealedValues(deps);
  return { sealed: values.length, opens: values.filter((value) => value.opens).length };
}

/**
 * Removes every sealed value that does not open under `deps.sealer` (see this file's header for how)
 * in one transaction. Callers take a restore point first.
 *
 * @returns how many values were removed and how many were kept.
 * @throws whatever the driver throws; nothing is half-applied (one transaction).
 * @complexity O(T·C + R) reads, one open per value, one write per unreadable value.
 */
export async function discardSealedCredentialsNotOpening(deps: SealedCredentialKeyDeps): Promise<{ discarded: number; kept: number }> {
  const values = await readSealedValues(deps);
  const unreadable = values.filter((value) => !value.opens);
  const catalog = deps.kernel as unknown as StorageKernel<unknown>;
  const notNullByTable = new Map<string, Map<string, boolean>>();
  for (const value of unreadable) {
    if (!notNullByTable.has(value.ref.table)) {
      const columns = await listColumns(catalog, value.ref.table);
      notNullByTable.set(value.ref.table, new Map(columns.map((column) => [column.name, column.notNull])));
    }
  }
  await deps.kernel.transaction(async () => {
    for (const value of unreadable) await removeSealedValue(deps.kernel, value, notNullByTable.get(value.ref.table)!);
  });
  return { discarded: unreadable.length, kept: values.length - unreadable.length };
}

export interface ResealCredentialsDeps extends SealedCredentialKeyDeps {
  /** A sealer over the new key; `seal` writes the moved values. */
  readonly sealer: Pick<SecretSealerPort, "open" | "seal">;
  /** The new key's handle, as its keyring's `activeKey()` reports it. */
  readonly key: SiteKeyHandle;
  /** A sealer over the key the values may have been sealed under instead. */
  readonly previous: Pick<SecretSealerPort, "open">;
}

/**
 * Moves every sealed value that does not open under `deps.sealer` but does open under
 * `deps.previous` onto the new key: same plaintext, same AAD, a fresh nonce. "Paste your old token"
 * runs this so credentials saved under the wrong key in the meantime are not stranded by the switch.
 * A value neither key opens is left as it was. All writes in one transaction, matched on the old
 * ciphertext + nonce so a value changed in between is left alone.
 *
 * @returns how many values were moved, and how many open under neither key.
 * @throws whatever the driver throws; nothing is half-applied (one transaction).
 * @complexity O(T·C + R) reads, up to two opens per value, one write per moved value.
 */
export async function resealCredentialsOpeningUnder(deps: ResealCredentialsDeps): Promise<{ resealed: number; unreadable: number }> {
  const moves: Array<{ value: SealedValue; sealed: { keyId: string; ciphertext: string; nonce: string; alg: string } }> = [];
  let unreadable = 0;
  for (const value of await readSealedValues(deps)) {
    if (value.opens) continue;
    const aad = value.aad;
    const plaintext = aad === undefined ? undefined : await openValue(deps.previous, value.quad, aad);
    if (aad === undefined || plaintext === undefined) {
      unreadable += 1;
      continue;
    }
    moves.push({ value, sealed: await deps.sealer.seal({ plaintext, key: deps.key, aad }) });
  }
  await deps.kernel.transaction(async () => {
    for (const { value, sealed } of moves) {
      const { table, column } = value.ref;
      const siblings = siblingColumns(column);
      await deps.kernel.execute(sql`UPDATE ${sql.id(table)} SET ${sql.id(siblings.keyId)} = ${sealed.keyId}, ${sql.id(column)} = ${sealed.ciphertext}, ${sql.id(siblings.nonce)} = ${sealed.nonce}, ${sql.id(siblings.alg)} = ${sealed.alg} WHERE ${sql.id(column)} = ${value.quad.ciphertext} AND ${sql.id(siblings.nonce)} = ${value.quad.nonce}`);
    }
  });
  return { resealed: moves.length, unreadable };
}

/** One DELETE (NOT NULL column) or UPDATE … SET NULL (nullable), matched on ciphertext + nonce. */
async function removeSealedValue(kernel: ContentKernel, value: SealedValue, notNull: ReadonlyMap<string, boolean>): Promise<void> {
  const { table, column } = value.ref;
  const siblings = siblingColumns(column);
  const match = sql`${sql.id(column)} = ${value.quad.ciphertext} AND ${sql.id(siblings.nonce)} = ${value.quad.nonce}`;
  if (notNull.get(column)) {
    await kernel.execute(sql`DELETE FROM ${sql.id(table)} WHERE ${match}`);
    return;
  }
  const prefix = column.slice(0, column.length - "sealed_ciphertext".length);
  const companions = COMPANION_SUFFIXES.map((suffix) => `${prefix}${suffix}`).filter((name) => notNull.get(name) === false);
  const cleared = [siblings.keyId, column, siblings.nonce, siblings.alg, ...companions];
  const assignments = sql.join(cleared.map((name) => sql`${sql.id(name)} = NULL`));
  await kernel.execute(sql`UPDATE ${sql.id(table)} SET ${assignments} WHERE ${match}`);
}

/** Every sealed value with whether it opens, read in one kernel transaction (one snapshot); the
 *  opens happen after it. */
async function readSealedValues(deps: SealedCredentialKeyDeps): Promise<SealedValue[]> {
  const byColumn = new Map(deps.descriptors.map((descriptor) => [`${descriptor.table}\u0000${descriptor.column}`, descriptor]));
  const rows = await deps.kernel.transaction(async () => {
    const read: Array<{ ref: DiscoveredSealedColumn; descriptor: SealedColumnDescriptor | undefined; identity: SealedRowIdentity; quad: Quad }> = [];
    for (const ref of await discoverSealedColumns(deps.kernel)) {
      const candidate = byColumn.get(`${ref.table}\u0000${ref.column}`);
      const descriptor = candidate && descriptorFits(ref, candidate) ? candidate : undefined;
      for (const row of await readColumn(deps.kernel, ref, descriptor)) read.push({ ref, descriptor, ...row });
    }
    return read;
  });
  const values: SealedValue[] = [];
  for (const row of rows) {
    const aad = row.descriptor === undefined ? undefined : aadOf(row.descriptor, row.identity);
    const opens = aad !== undefined && (await openValue(deps.sealer, row.quad, aad)) !== undefined;
    values.push({ ref: row.ref, quad: row.quad, aad, opens });
  }
  return values;
}

interface Quad {
  readonly keyId: unknown;
  readonly ciphertext: string;
  readonly nonce: unknown;
  readonly alg: unknown;
}

/** Identity columns (when a descriptor fits) plus the sealed quad, for every non-null value. */
async function readColumn(
  kernel: ContentKernel,
  ref: DiscoveredSealedColumn,
  descriptor: SealedColumnDescriptor | undefined
): Promise<Array<{ identity: SealedRowIdentity; quad: Quad }>> {
  const siblings = siblingColumns(ref.column);
  const identityColumns = descriptor?.identityColumns ?? [];
  const optional = (name: string) => (ref.tableColumns.has(name) ? sql.id(name) : sql`NULL`);
  const selected = [
    ...identityColumns.map((name, index) => sql`${sql.id(name)} AS ${sql.id(`i${index}`)}`),
    sql`${optional(siblings.keyId)} AS ${sql.id("q_key_id")}`,
    sql`${sql.id(ref.column)} AS ${sql.id("q_ciphertext")}`,
    sql`${optional(siblings.nonce)} AS ${sql.id("q_nonce")}`,
    sql`${optional(siblings.alg)} AS ${sql.id("q_alg")}`,
  ];
  const rows = await kernel.query<Record<string, unknown>>(
    sql`SELECT ${sql.join(selected)} FROM ${sql.id(ref.table)} WHERE ${sql.id(ref.column)} IS NOT NULL`
  );
  return rows.map((row) => ({
    identity: Object.fromEntries(identityColumns.map((name, index) => [name, row[`i${index}`]])),
    quad: { keyId: row.q_key_id, ciphertext: String(row.q_ciphertext), nonce: row.q_nonce, alg: row.q_alg },
  }));
}

/** The store's AAD for a row, or `undefined` when this build cannot compute it (an unknown AAD
 *  version, or a descriptor that throws). */
function aadOf(descriptor: SealedColumnDescriptor, identity: SealedRowIdentity): string | undefined {
  try {
    const selection = descriptor.aadFor(identity);
    return selection.kind === "aad" ? selection.aad : undefined;
  } catch {
    return undefined;
  }
}

/** One open under `aad`; `undefined` on any failure. Callers that only need "does it open" drop the
 *  plaintext unread. */
async function openValue(sealer: Pick<SecretSealerPort, "open">, quad: Quad, aad: string): Promise<string | undefined> {
  const { keyId, ciphertext, nonce, alg } = quad;
  if (typeof keyId !== "string" || typeof nonce !== "string" || typeof alg !== "string") return undefined;
  try {
    return await sealer.open({ sealed: { keyId, ciphertext, nonce, alg } }, { aad });
  } catch {
    return undefined;
  }
}
