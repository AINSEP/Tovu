import { asc, eq } from "drizzle-orm";

import {
  MAX_REVOCATIONS,
  isRevoked,
  type PublishTrustRevocation,
  type PublishTrustRevocationPort,
  type RevocationRead,
  type RevocationWrite,
} from "#src/features/publish-trust/revocations";
import { publishTrustRevocations } from "../schema.js";
import type { ContentDb } from "./content-db.js";

/**
 * Durable deny store for zero-setup publishing authentication.
 *
 * The site content database is the only backing store deliberately selected here. Its loss is
 * already a visible content-loss outage, so no host can accidentally turn a deploy into a silent
 * reconnect by forgetting to mount a second directory. Construction proves the table is readable:
 * this happens while the real composition root is booting, before it can listen for publishes.
 */
export class SqlitePublishTrustRevocationStore implements PublishTrustRevocationPort {
  constructor(private readonly db: ContentDb) {
    this.assertAvailableAtBoot();
  }

  private assertAvailableAtBoot(): void {
    try {
      this.db
        .select({ sourceInstallationId: publishTrustRevocations.sourceInstallationId })
        .from(publishTrustRevocations)
        .limit(1)
        .all();
    } catch (error) {
      throw new Error(
        `publish trust revocation store is unavailable at boot: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }
  }

  private read(): PublishTrustRevocation[] {
    return this.db
      .select()
      .from(publishTrustRevocations)
      .orderBy(asc(publishTrustRevocations.revokedAt), asc(publishTrustRevocations.sourceInstallationId))
      .all()
      .map((row) => ({
        sourceInstallationId: row.sourceInstallationId,
        revokedAt: row.revokedAt,
        note: row.note,
      }));
  }

  async list(): Promise<RevocationRead> {
    try {
      const revocations = this.read();
      if (revocations.length > MAX_REVOCATIONS) {
        return { ok: false, reason: `revocation list holds more than ${MAX_REVOCATIONS} records` };
      }
      return { ok: true, revocations };
    } catch (error) {
      return {
        ok: false,
        reason: `the list of disconnected computers could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }

  async revoke(input: {
    readonly sourceInstallationId: string;
    readonly nowIso: string;
    readonly note?: string;
  }): Promise<RevocationWrite> {
    const current = await this.list();
    if (!current.ok) return current;
    if (isRevoked(current.revocations, input.sourceInstallationId)) {
      return { ok: true, revocations: current.revocations, changed: false };
    }
    if (current.revocations.length >= MAX_REVOCATIONS) {
      return { ok: false, reason: `this site already lists ${MAX_REVOCATIONS} disconnected computers` };
    }

    try {
      this.db
        .insert(publishTrustRevocations)
        .values({
          sourceInstallationId: input.sourceInstallationId,
          revokedAt: input.nowIso,
          note: input.note ?? null,
        })
        .run();
      return {
        ok: true,
        revocations: [...current.revocations, { sourceInstallationId: input.sourceInstallationId, revokedAt: input.nowIso, note: input.note ?? null }],
        changed: true,
      };
    } catch (error) {
      return {
        ok: false,
        reason: `the disconnected-computer list could not be updated: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }

  async restore(input: { readonly sourceInstallationId: string }): Promise<RevocationWrite> {
    const current = await this.list();
    if (!current.ok) return current;
    if (!isRevoked(current.revocations, input.sourceInstallationId)) {
      return { ok: true, revocations: current.revocations, changed: false };
    }

    try {
      this.db
        .delete(publishTrustRevocations)
        .where(eq(publishTrustRevocations.sourceInstallationId, input.sourceInstallationId))
        .run();
      return {
        ok: true,
        revocations: current.revocations.filter((revocation) => revocation.sourceInstallationId !== input.sourceInstallationId),
        changed: true,
      };
    } catch (error) {
      return {
        ok: false,
        reason: `the disconnected-computer list could not be updated: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }
}
