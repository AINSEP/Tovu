import { SITE_DATABASE_MESSAGES, type DbMessages } from "@jini-ai/db/tools";

/**
 * @file Tovu's copy for the `@jini-ai/db/tools` database tools. Jini's "this site" profile
 * (`SITE_DATABASE_MESSAGES`) carries the wording a Tovu site's tools have always used; the two
 * fields below keep this codebase's own decision references (EC-04, ADR-041 §2), which a
 * product-neutral package must not ship. Together they are the bytes
 * `db-tool-descriptors.snapshot.unit.test.ts` pins from the pre-extraction catalog. The transfer
 * tools' copy is Jini's `SITE_TRANSFER_MESSAGES`.
 */
export const TOVU_DATABASE_MESSAGES: DbMessages = {
  ...SITE_DATABASE_MESSAGES,
  restorePointUnavailable: "EC-04: no restore-point mechanism is available for this site; the in-product migrate is refused with no attestation override (ADR-041 §2)",
  restorePointCostAck: "Explicit cost acknowledgment. Required (must be true) only when this site's restore-point cost class is 'expensive'; ignored when 'cheap'. The call is refused with no override at all when cost class is 'unavailable' (ADR-041 §2 — no attestation override).",
};
