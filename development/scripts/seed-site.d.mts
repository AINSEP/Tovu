/**
 * @file Type declarations for `seed-site.mjs`, a plain-JS dev script whose two exports are imported
 * by TypeScript tests (`development/scripts/__tests__/seed-site.unit.test.ts` and the website's
 * `site-title-preservation.integration.test.ts`). Without this file those imports are implicitly
 * `any` (TS7016). Signatures mirror the JSDoc on each export in `seed-site.mjs`; keep them in step.
 */
import type BetterSqlite3 from "better-sqlite3";

/** One `asset_blobs` row whose bytes a fresh deploy would not get. See `findMissingSeedBlobs`. */
export interface MissingSeedBlob {
  storageKey: string;
  reason: "missing" | "untracked";
}

/** Cross-checks the seed's `asset_blobs` rows against `<liveDir>/uploads/`; empty means consistent. */
export declare function findMissingSeedBlobs(db: BetterSqlite3.Database, liveDir: string): MissingSeedBlob[];

/** The whole `npm run seed:site` flow for one site directory. Rejects if any check fails. */
export declare function seedSite(required: {
  siteName: string;
  liveDir: string;
  liveDbPath: string;
  seedDbPath: string;
}): Promise<void>;
