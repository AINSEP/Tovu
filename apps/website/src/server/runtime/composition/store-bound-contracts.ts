import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";

/** The services whose implementation depends on the storage engine. */
export interface StoreBoundServices {
  /** Restore points; shared by the body and the boot password reset. */
  readonly dbOps: DbOpsPort;
  /** Advances `database_write_watermark` after a taxonomy write; callers await it (O2). */
  readonly stampWatermark: () => Promise<void> | void;
}
