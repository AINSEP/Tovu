import type { Selectable } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";
import type { OriginSettingRepoPort } from "@jini-ai/http-kit/verified-origin";
import {
  createVerifiedOrigin,
  type OriginScheme,
  type OriginSource,
  type VerifiedOrigin,
} from "@jini-ai/http-kit/verified-origin";
import type { ContentKernel } from "../content-kernel.js";
import type { OriginSettingsTable } from "../content-database.generated.js";

/**
 * @file ADR-046 Phase 1 — THE durable `OriginSettingRepoPort` adapter: one Kysely query body for
 * every dialect (storage plan §4, ADR-066); ADR-006 rule-of-two "second adapter" half,
 * `origin/repo.memory.ts`'s `InMemoryOriginSettingRepo` is the first.
 * `sqlite/origin-repo.sqlite.ts` is the thin layer the composition root builds from the content db
 * handle.
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
 * 1. {@link seedDevCapabilityOriginOn} — the idempotent find-or-create dev default
 *    (`http://localhost:3000`), mirroring exactly what the in-memory adapter's constructor-seed did.
 * 2. {@link registerConfiguredOriginOn} — the operator-declared public origin, from
 *    `features/origin/configured-origin.ts`'s `TOVU_PUBLIC_URL` resolver (2026-09-18; design note:
 *    `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`). This is what finally
 *    closes the "no way to register a real production origin" gap this header used to disclose as
 *    permanent, and it is why production's sitemap can emit absolute URLs again.
 *
 * Both writers are async (the kernel is), so the composition root hands the read adapter the boot
 * write's promise as `after`: every read waits for it, and a boot write that failed fails the reads
 * instead of letting them see a half-booted row.
 *
 * Still open, and still a real gap: no ADMIN route or reachability/ownership VERIFICATION flow
 * exists (ADR-040's own "Open" section keeps that as a v0.1 item). Registration authority today is
 * "whoever can set this deployment's process environment", nothing weaker and nothing stronger.
 */

type Row = Selectable<OriginSettingsTable>;

function toVerifiedOrigin(row: Row): VerifiedOrigin {
  // Built up conditionally, not `port: row.port ?? undefined` — an object literal with an
  // explicit `undefined`-valued key is NOT deep-equal to one that never had the key at all
  // (`assert.deepStrictEqual` is strict about this), and `VerifiedOrigin.port`/`.basePath` are
  // genuinely optional fields the in-memory adapter simply omits when unset.
  const candidate: VerifiedOrigin = {
    scheme: row.scheme as OriginScheme,
    host: row.host,
    verifiedAt: row.verified_at,
    source: row.source as OriginSource,
  };
  if (row.port != null) candidate.port = row.port;
  if (row.base_path != null) candidate.basePath = row.base_path;
  return createVerifiedOrigin(candidate);
}

function normalizeHostList(hosts: string[] | undefined): string[] {
  return (hosts ?? []).map((host) => host.trim().toLowerCase());
}

export class SqlOriginSettingRepo implements OriginSettingRepoPort {
  /** @param options.after - Reads wait for it (the composition root's boot write); see the file header. */
  constructor(
    protected readonly kernel: ContentKernel,
    private readonly options: { after?: Promise<unknown> } = {}
  ) {}

  private async row(workspaceId: UUID): Promise<Row | undefined> {
    await this.options.after;
    return this.kernel.run((db) => db.selectFrom("origin_settings").selectAll().where("workspace_id", "=", workspaceId).executeTakeFirst());
  }

  async findByWorkspaceId({ workspaceId }: { workspaceId: UUID }): Promise<VerifiedOrigin | null> {
    const row = await this.row(workspaceId);
    return row ? toVerifiedOrigin(row) : null;
  }

  async findRedirectAllowlist({ workspaceId }: { workspaceId: UUID }): Promise<string[]> {
    const row = await this.row(workspaceId);
    return row ? (JSON.parse(row.redirect_allowlist_json) as string[]) : [];
  }

  async findEgressAllowlist({ workspaceId }: { workspaceId: UUID }): Promise<string[]> {
    const row = await this.row(workspaceId);
    return row ? (JSON.parse(row.egress_allowlist_json) as string[]) : [];
  }
}

/**
 * Idempotent boot-time seed — find-or-create, never overwrites an already-registered origin (so a
 * future real verification flow's write is never silently clobbered by a re-run of this seed).
 * Mirrors `content-db.ts`'s `seedContentDb()`'s own "guarded... never re-seeded or overwritten on
 * restart" convention. One `INSERT … ON CONFLICT DO NOTHING` on the `workspace_id` primary key, so
 * find-or-create is a single atomic statement on every dialect.
 */
export async function seedDevCapabilityOriginOn(
  kernel: ContentKernel,
  seed: { workspaceId: UUID; origin: VerifiedOrigin; redirectAllowlist?: string[]; egressAllowlist?: string[] }
): Promise<void> {
  const verified = createVerifiedOrigin(seed.origin);
  await kernel.run((db) =>
    db
      .insertInto("origin_settings")
      .values({
        workspace_id: seed.workspaceId,
        scheme: verified.scheme,
        host: verified.host,
        port: verified.port ?? null,
        base_path: verified.basePath ?? null,
        verified_at: verified.verifiedAt,
        source: verified.source,
        redirect_allowlist_json: JSON.stringify(normalizeHostList(seed.redirectAllowlist)),
        egress_allowlist_json: JSON.stringify(normalizeHostList(seed.egressAllowlist)),
      })
      .onConflict((oc) => oc.column("workspace_id").doNothing())
      .execute()
  );
}

/** What {@link registerConfiguredOriginOn} did, so the composition root can log it. */
export type ConfiguredOriginWriteResult = "inserted" | "updated" | "unchanged";

/** The origin columns only — deliberately NOT the allowlist columns. See
 *  {@link registerConfiguredOriginOn}. */
function originColumns(origin: VerifiedOrigin) {
  return {
    scheme: origin.scheme,
    host: origin.host,
    port: origin.port ?? null,
    base_path: origin.basePath ?? null,
    verified_at: origin.verifiedAt,
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
function sameOrigin(row: Row, origin: VerifiedOrigin): boolean {
  return (
    row.scheme === origin.scheme &&
    row.host === origin.host &&
    row.port === (origin.port ?? null) &&
    row.base_path === (origin.basePath ?? null) &&
    row.source === origin.source
  );
}

/**
 * Registers the operator-declared public origin — insert-or-correct, NOT find-or-create.
 *
 * This is deliberately a different function with a different contract from
 * {@link seedDevCapabilityOriginOn}, not a change to it. The certified idempotency test
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
 * The read and the write run in one kernel transaction under `lockKey` on the workspace's row, so
 * two booting processes cannot both see "no row" and both insert.
 *
 * @param origin - Re-validated through `createVerifiedOrigin`, so the ADR-040 scheme/source
 * invariant cannot be bypassed by a caller that hand-built the object.
 * @returns which write happened, for the boot log.
 * @throws {InsecureOriginSourceError} if `origin` violates the scheme/source invariant. Callers
 * pass `resolveConfiguredOrigin`'s output, which can never produce that combination.
 * @complexity O(1) — one indexed lookup plus at most one write.
 */
export async function registerConfiguredOriginOn(
  kernel: ContentKernel,
  workspaceId: UUID,
  origin: VerifiedOrigin
): Promise<ConfiguredOriginWriteResult> {
  const verified = createVerifiedOrigin(origin);
  return kernel.transaction(async () => {
    await kernel.lockKey(`origin_settings:${workspaceId}`);
    const existing = await kernel.run((db) =>
      db.selectFrom("origin_settings").selectAll().where("workspace_id", "=", workspaceId).executeTakeFirst()
    );
    if (!existing) {
      await kernel.run((db) =>
        db
          .insertInto("origin_settings")
          .values({ workspace_id: workspaceId, ...originColumns(verified), redirect_allowlist_json: "[]", egress_allowlist_json: "[]" })
          .execute()
      );
      return "inserted";
    }

    if (sameOrigin(existing, verified)) return "unchanged";

    await kernel.run((db) => db.updateTable("origin_settings").set(originColumns(verified)).where("workspace_id", "=", workspaceId).execute());
    return "updated";
  });
}
