import { sql } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";
import { createVerifiedOrigin, type VerifiedOrigin } from "@jini-ai/core/contracts/server/verified-origin";
import type { ContentKernel } from "../content-kernel.js";

/**
 * @file ADR-046 Phase 1 — THE durable `OriginSettingRepoPort` adapter: one Kysely query body for
 * every dialect (storage plan §4, ADR-066); ADR-006 rule-of-two "second adapter" half,
 * `Jini packages/http-kit/src/verified-origin/repo.memory.ts`'s `InMemoryOriginSettingRepo` is the first.
 * `sqlite/origin-repo.sqlite.ts` is the thin layer the composition root builds from the content db
 * handle.
 *
 * Purpose:
 * The workspace's verified origin and its two allowlists previously lived only in-memory in the
 * real running server (`apps/website/src/server/runtime/composition/deps.ts`) — worse, hardcoded fresh into the constructor's seed
 * array on every boot, not even genuinely "seeded once." This adapter makes the row durable.
 *
 * The READ adapter is read-only by design (matches `OriginSettingRepoPort`, which declares no write
 * method). Writes are two standalone boot-time functions below, not port methods — ADR-006's
 * rule-of-two says don't abstract before the second adapter needs it, and there is still only one
 * durable adapter:
 *
 * 1. {@link seedDevCapabilityOriginOn} — the idempotent find-or-create dev default
 *    (the current loopback listener), preserving operator registrations.
 * 2. {@link registerConfiguredOriginOn} — the operator-declared public origin, from
 *    `features/origin/configured-origin.ts`'s `TOVU_PUBLIC_URL` resolver (2026-09-18; design note:
 *    `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`). This is what finally
 *    closes the "no way to register a real production origin" gap this header used to disclose as
 *    permanent, and it is why production's sitemap can emit absolute URLs again.
 *
 * The read adapter and {@link registerConfiguredOriginOn} (now `registerConfiguredOrigin`) live in Jini
 * `@jini-ai/db/verified-origin`; only the dev seed below is Tovu boot policy and stays here.
 *
 * Both writers are async (the kernel is), so the composition root hands the read adapter the boot
 * write's promise as `after`: every read waits for it, and a boot write that failed fails the reads
 * instead of letting them see a half-booted row.
 *
 * Still open, and still a real gap: no ADMIN route or reachability/ownership VERIFICATION flow
 * exists (ADR-040's own "Open" section keeps that as a v0.1 item). Registration authority today is
 * "whoever can set this deployment's process environment", nothing weaker and nothing stronger.
 */

function normalizeHostList({ hosts }: { hosts: string[] | undefined }, _optional: Record<string, never> = {}): string[] {
  return (hosts ?? []).map((host) => host.trim().toLowerCase());
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1"];

/**
 * Idempotent boot seed. Only a dev-capability loopback row follows a changed listener's scheme
 * and port. Owner registrations, non-loopback rows, base paths and allowlists are never overwritten.
 * The conditional upsert is atomic, including when another process registers an origin concurrently.
 * @complexity O(1), one primary-key upsert.
 */
export async function seedDevCapabilityOriginOn(
  { kernel, workspaceId, origin }: { kernel: ContentKernel; workspaceId: UUID; origin: VerifiedOrigin },
  optional: { redirectAllowlist?: string[]; egressAllowlist?: string[] } = {}
): Promise<void> {
  const verified = createVerifiedOrigin(origin);
  const refreshesLoopback = verified.source === "dev-capability" && LOOPBACK_HOSTS.includes(verified.host);
  await kernel.run((db) =>
    db
      .insertInto("origin_settings")
      .values({
        workspace_id: workspaceId,
        scheme: verified.scheme,
        host: verified.host,
        port: verified.port ?? null,
        base_path: verified.basePath ?? null,
        verified_at: verified.verifiedAt,
        source: verified.source,
        redirect_allowlist_json: JSON.stringify(normalizeHostList({ hosts: optional.redirectAllowlist })),
        egress_allowlist_json: JSON.stringify(normalizeHostList({ hosts: optional.egressAllowlist })),
      })
      .onConflict((oc) => !refreshesLoopback ? oc.column("workspace_id").doNothing() : oc.column("workspace_id").doUpdateSet({
        scheme: verified.scheme, port: verified.port ?? null, verified_at: verified.verifiedAt,
      }).where("origin_settings.source", "=", "dev-capability")
        .where("origin_settings.host", "in", LOOPBACK_HOSTS)
        // Unchanged listener: no write, so its verification stamp does not churn on every boot.
        .where(sql<boolean>`(origin_settings.scheme <> ${verified.scheme} OR origin_settings.port IS DISTINCT FROM ${verified.port ?? null})`))
      .execute()
  );
}
