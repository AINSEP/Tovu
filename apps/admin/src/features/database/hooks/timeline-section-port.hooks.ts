import type { AdminLedgerRow } from "../../../lib/api";

/**
 * @file What `use-timeline-section.hooks.ts` needs from the outside world, as an interface rather
 * than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair documented
 * in `apps/admin/INFO.md`'s Hooks section.
 */
export interface TimelineSectionPort {
  getDatabaseTimeline(options?: {
    kind?: string;
    outcome?: string;
    fromDate?: string;
    toDate?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AdminLedgerRow[]; nextCursor: string | null }>;
}
