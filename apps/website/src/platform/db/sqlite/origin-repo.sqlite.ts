import { type ContentKernel, contentKernel } from "../content-kernel.js";
import {
  type ConfiguredOriginWriteResult,
  registerConfiguredOriginOn,
  seedDevCapabilityOriginOn,
  SqlOriginSettingRepo,
} from "../repos/origin-repo.js";
import type { ContentDb } from "./content-db.js";
import type { UUID } from "@jini-ai/core/primitives";
import type { VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";

export type { ConfiguredOriginWriteResult } from "../repos/origin-repo.js";

/**
 * @file ADR-046 Phase 1 — the origin setting store on a site's SQLite `content.db`: {@link
 * SqlOriginSettingRepo} and its two boot writers (the one Kysely query body,
 * `repos/origin-repo.ts`, whose header carries the design), kept under their names so the
 * composition root that builds them from the content db handle stays as it is.
 */
export class SqliteOriginSettingRepo extends SqlOriginSettingRepo {
  /**
   * @param store - The connection's kernel, or the content db handle it is derived from.
   * @param options.after - Reads wait for it (the boot write).
   */
  constructor(store: ContentKernel | ContentDb, options: { after?: Promise<unknown> } = {}) {
    super(contentKernel(store), options);
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
  return seedDevCapabilityOriginOn(contentKernel(required.db), required.seed);
}

/** {@link registerConfiguredOriginOn} on `db`: the operator-declared origin, insert-or-correct. */
export function registerConfiguredOrigin(
  required: { db: ContentKernel | ContentDb; workspaceId: UUID; origin: VerifiedOrigin },
  _optional: Record<string, never> = {}
): Promise<ConfiguredOriginWriteResult> {
  return registerConfiguredOriginOn(contentKernel(required.db), required.workspaceId, required.origin);
}
