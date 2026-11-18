import { type ContentKernel, contentKernel, schemaErasedKernel } from "../content-kernel.js";
import { seedDevCapabilityOriginOn } from "../repos/origin-repo.js";
import type { ContentDb } from "./content-db.js";
import type { UUID } from "@jini-ai/core/primitives";
import type { VerifiedOrigin } from "@jini-ai/core/contracts/server/verified-origin";
import { type ConfiguredOriginWriteResult, registerConfiguredOrigin as registerConfiguredOriginRow, SqlOriginSettingRepo } from "@jini-ai/db/verified-origin";

/** Tovu owns the persisted name; the origin reads, the writer and the dev seed use the same wiring. */
export const ORIGIN_TABLES = { origins: "origin_settings" } as const;

/**
 * @file ADR-046 Phase 1 — the origin setting store on a site's SQLite `content.db`: {@link
 * SqlOriginSettingRepo} (the one Kysely query body, in Jini `@jini-ai/db/verified-origin`) and its two boot
 * writers (the configured-origin writer in Jini, the dev seed in `repos/origin-repo.ts`, whose header carries
 * the design), kept under their names so the composition root that builds them from the content db handle
 * stays as it is.
 */
export class SqliteOriginSettingRepo extends SqlOriginSettingRepo {
  /**
   * @param required.store - The connection's kernel, or the content db handle it is derived from.
   * @param options.after - Reads wait for it (the boot write).
   */
  constructor({ store }: { store: ContentKernel | ContentDb }, options: { after?: Promise<unknown> } = {}) {
    super({ kernel: schemaErasedKernel({ store }), tables: ORIGIN_TABLES }, options);
  }
}

/** {@link seedDevCapabilityOriginOn} on `db`: the idempotent find-or-create dev default. */
export function seedDevCapabilityOrigin(
  required: {
    db: ContentKernel | ContentDb;
    seed: { workspaceId: UUID; origin: VerifiedOrigin; redirectAllowlist?: string[]; egressAllowlist?: string[] };
  },
  _optional: Record<string, never> = {}
): Promise<void> {
  return seedDevCapabilityOriginOn(contentKernel({ store: required.db }), required.seed);
}

/** {@link registerConfiguredOriginOn} on `db`: the operator-declared origin, insert-or-correct. The writer is Jini's `registerConfiguredOrigin`. */
export function registerConfiguredOrigin(
  required: { db: ContentKernel | ContentDb; workspaceId: UUID; origin: VerifiedOrigin },
  _optional: Record<string, never> = {}
): Promise<ConfiguredOriginWriteResult> {
  return registerConfiguredOriginRow({ kernel: schemaErasedKernel({ store: required.db }), tables: ORIGIN_TABLES, workspaceId: required.workspaceId, origin: required.origin }, {});
}
