import { eq } from "drizzle-orm";

import { originSettings } from "../db/schema";
import type { ContentDb } from "./content-db";
import type { UUID } from "../../core/ports";
import type { OriginSettingRepoPort } from "../../origin/ports";
import { createVerifiedOrigin, type OriginScheme, type OriginSource, type VerifiedOrigin } from "../../origin/types";

/**
 * @file ADR-046 Phase 1 — real SQLite `OriginSettingRepoPort` adapter (ADR-006 rule-of-two
 * "second adapter" half; `origin/repo.memory.ts`'s `InMemoryOriginSettingRepo` is the first — the
 * only implementation that existed before this file, per that file's own "no SQLite adapter yet"
 * disclosure).
 *
 * Purpose:
 * The workspace's verified origin and its two allowlists previously lived only in-memory in the
 * real running server (`server/deps.ts`) — worse, hardcoded fresh into the constructor's seed
 * array on every boot, not even genuinely "seeded once." This adapter makes the row durable.
 *
 * Read-only by design (matches `OriginSettingRepoPort`, which declares no write method): no admin
 * route or verification flow exists yet to let an operator register a real production origin —
 * that is a separate, disclosed, future gap (see `capability-inventory.ts`'s "origin" entry). The
 * only writer is `seedDevCapabilityOrigin` below, an idempotent boot-time seed mirroring exactly
 * what the in-memory adapter's constructor-seed already did.
 */

function toVerifiedOrigin(row: typeof originSettings.$inferSelect): VerifiedOrigin {
  // Built up conditionally, not `port: row.port ?? undefined` — an object literal with an
  // explicit `undefined`-valued key is NOT deep-equal to one that never had the key at all
  // (`assert.deepStrictEqual` is strict about this), and `VerifiedOrigin.port`/`.basePath` are
  // genuinely optional fields the in-memory adapter simply omits when unset.
  const candidate: VerifiedOrigin = {
    scheme: row.scheme as OriginScheme,
    host: row.host,
    verifiedAt: row.verifiedAt,
    source: row.source as OriginSource,
  };
  if (row.port != null) candidate.port = row.port;
  if (row.basePath != null) candidate.basePath = row.basePath;
  return createVerifiedOrigin(candidate);
}

function normalizeHostList(hosts: string[] | undefined): string[] {
  return (hosts ?? []).map((host) => host.trim().toLowerCase());
}

export class SqliteOriginSettingRepo implements OriginSettingRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByWorkspaceId(workspaceId: UUID): Promise<VerifiedOrigin | null> {
    const row = this.db.select().from(originSettings).where(eq(originSettings.workspaceId, workspaceId)).all()[0];
    return row ? toVerifiedOrigin(row) : null;
  }

  async findRedirectAllowlist(workspaceId: UUID): Promise<string[]> {
    const row = this.db.select().from(originSettings).where(eq(originSettings.workspaceId, workspaceId)).all()[0];
    return row ? (JSON.parse(row.redirectAllowlistJson) as string[]) : [];
  }

  async findEgressAllowlist(workspaceId: UUID): Promise<string[]> {
    const row = this.db.select().from(originSettings).where(eq(originSettings.workspaceId, workspaceId)).all()[0];
    return row ? (JSON.parse(row.egressAllowlistJson) as string[]) : [];
  }
}

/**
 * Idempotent boot-time seed — find-or-create, never overwrites an already-registered origin (so a
 * future real verification flow's write is never silently clobbered by a re-run of this seed).
 * Mirrors `content-db.ts`'s `seedContentDb()`'s own "guarded... never re-seeded or overwritten on
 * restart" convention.
 */
export function seedDevCapabilityOrigin(
  required: {
    db: ContentDb;
    seed: { workspaceId: UUID; origin: VerifiedOrigin; redirectAllowlist?: string[]; egressAllowlist?: string[] };
  },
  _optional: Record<string, never> = {}
): void {
  const { db, seed } = required;
  const existing = db.select({ workspaceId: originSettings.workspaceId }).from(originSettings).where(eq(originSettings.workspaceId, seed.workspaceId)).all();
  if (existing.length > 0) return;

  const verified = createVerifiedOrigin(seed.origin);
  db.insert(originSettings)
    .values({
      workspaceId: seed.workspaceId,
      scheme: verified.scheme,
      host: verified.host,
      port: verified.port ?? null,
      basePath: verified.basePath ?? null,
      verifiedAt: verified.verifiedAt,
      source: verified.source,
      redirectAllowlistJson: JSON.stringify(normalizeHostList(seed.redirectAllowlist)),
      egressAllowlistJson: JSON.stringify(normalizeHostList(seed.egressAllowlist)),
    })
    .run();
}
