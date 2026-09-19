import { eq } from "drizzle-orm";

import { originSettings } from "../schema.js";
import type { ContentDb } from "./content-db.js";
import type { UUID } from "@jini-ai/cms/core";
import type { OriginSettingRepoPort } from "#src/features/origin/ports";
import {
  createVerifiedOrigin,
  type OriginScheme,
  type OriginSource,
  type VerifiedOrigin,
} from "#src/features/origin/index";

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
 * The READ adapter is read-only by design (matches `OriginSettingRepoPort`, which declares no write
 * method). Writes are two standalone boot-time functions below, not port methods — ADR-006's
 * rule-of-two says don't abstract before the second adapter needs it, and there is still only one
 * durable adapter:
 *
 * 1. {@link seedDevCapabilityOrigin} — the idempotent find-or-create dev default
 *    (`http://localhost:3000`), mirroring exactly what the in-memory adapter's constructor-seed did.
 * 2. {@link registerConfiguredOrigin} — the operator-declared public origin, from
 *    `features/origin/configured-origin.ts`'s `TOVU_PUBLIC_URL` resolver (2026-09-18; design note:
 *    `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`). This is what finally
 *    closes the "no way to register a real production origin" gap this header used to disclose as
 *    permanent, and it is why production's sitemap can emit absolute URLs again.
 *
 * Still open, and still a real gap: no ADMIN route or reachability/ownership VERIFICATION flow
 * exists (ADR-040's own "Open" section keeps that as a v0.1 item). Registration authority today is
 * "whoever can set this deployment's process environment", nothing weaker and nothing stronger.
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

/** What {@link registerConfiguredOrigin} did, so the composition root can log it. */
export type ConfiguredOriginWriteResult = "inserted" | "updated" | "unchanged";

/** The origin columns only — deliberately NOT the allowlist columns. See
 *  {@link registerConfiguredOrigin}. */
function originColumns(origin: VerifiedOrigin) {
  return {
    scheme: origin.scheme,
    host: origin.host,
    port: origin.port ?? null,
    basePath: origin.basePath ?? null,
    verifiedAt: origin.verifiedAt,
    source: origin.source,
  };
}

/**
 * Whether the stored row already names the same origin. `verifiedAt` is excluded on purpose: it is
 * a stamp, not part of the origin's identity, so including it would make every boot an UPDATE and
 * churn the row forever.
 *
 * @complexity O(1).
 */
function sameOrigin(row: typeof originSettings.$inferSelect, origin: VerifiedOrigin): boolean {
  return (
    row.scheme === origin.scheme &&
    row.host === origin.host &&
    row.port === (origin.port ?? null) &&
    row.basePath === (origin.basePath ?? null) &&
    row.source === origin.source
  );
}

/**
 * Registers the operator-declared public origin — insert-or-correct, NOT find-or-create.
 *
 * This is deliberately a different function with a different contract from
 * {@link seedDevCapabilityOrigin}, not a change to it. The certified idempotency test
 * (`features/origin/__tests__/repo.contract.test.ts`) protects "a re-run of the boot seed can never
 * clobber a real registered origin", and that assertion stands unchanged: the dev seed still never
 * overwrites anything. What this function adds is the one authority that IS allowed to correct the
 * row — whoever can set this deployment's process environment (on Fly, `fly secrets set` /
 * `fly.toml`), which is strictly more privileged than an admin-UI login and can already deploy
 * arbitrary code. Without a correcting writer, production's `http://localhost:3000` row — durably
 * persisted by Fly's first boot and immortal under find-or-create — could never be fixed without a
 * hand-written migration against the live DB.
 *
 * WRITES THE ORIGIN COLUMNS ONLY. `redirect_allowlist_json` and `egress_allowlist_json` are left
 * exactly as found. A blind full-row overwrite would silently empty both, which in production
 * fail-closes every `isAllowedEgressTarget` check — a behavior change with no relationship to the
 * origin it is here to fix. Pinned by that suite's "preserves both allowlists" test.
 *
 * @param required.origin - Re-validated through `createVerifiedOrigin`, so the ADR-040 scheme/source
 * invariant cannot be bypassed by a caller that hand-built the object.
 * @returns which write happened, for the boot log.
 * @throws {InsecureOriginSourceError} if `origin` violates the scheme/source invariant. Callers
 * pass `resolveConfiguredOrigin`'s output, which can never produce that combination.
 * @complexity O(1) — one indexed lookup plus at most one write.
 */
export function registerConfiguredOrigin(
  required: { db: ContentDb; workspaceId: UUID; origin: VerifiedOrigin },
  _optional: Record<string, never> = {}
): ConfiguredOriginWriteResult {
  const { db, workspaceId } = required;
  const verified = createVerifiedOrigin(required.origin);

  const existing = db.select().from(originSettings).where(eq(originSettings.workspaceId, workspaceId)).all()[0];
  if (!existing) {
    db.insert(originSettings)
      .values({ workspaceId, ...originColumns(verified), redirectAllowlistJson: "[]", egressAllowlistJson: "[]" })
      .run();
    return "inserted";
  }

  if (sameOrigin(existing, verified)) return "unchanged";

  db.update(originSettings).set(originColumns(verified)).where(eq(originSettings.workspaceId, workspaceId)).run();
  return "updated";
}
