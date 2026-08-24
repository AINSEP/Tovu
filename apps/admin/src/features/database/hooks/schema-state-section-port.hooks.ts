import type { AdminSchemaState } from "../../../lib/api";

/**
 * @file What `use-schema-state-section.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair
 * documented in `apps/admin/INFO.md`'s Hooks section, same as this feature's three older sections.
 *
 * READ-ONLY BY CONSTRUCTION: one method, no counterpart that repairs or reconciles anything. The
 * server exposes no such route either (see `src/server/routes/admin/database/schema-state.ts`), so
 * there is nothing here to widen this port to. Bringing a drifted database back in line is the
 * migrate-forward ceremony's job, and it has its own gated plan/confirm/execute port already.
 */
export interface SchemaStateSectionPort {
  /** Rejects on failure — never resolves a reassuring sentinel. `lib/fetch-query`'s own contract
   *  requires this, and here it is load-bearing twice over: a resolved-on-error value would render
   *  as a clean database. */
  getDatabaseSchemaState(): Promise<AdminSchemaState>;
}
