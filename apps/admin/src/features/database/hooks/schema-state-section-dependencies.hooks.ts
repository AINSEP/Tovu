import type { AdminSchemaState } from "@jini-ai/admin/core";
import { databaseApi } from "@/features/database/api/database-api";
import type { SchemaStateSectionPort } from "@jini-ai/admin/screens/database/hooks/schema-state-section-port.hooks";
import { useSchemaStateSection, type SchemaStateSectionController, type SchemaStateSectionHost } from "@jini-ai/admin/screens/database/hooks/use-schema-state-section.hooks";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";

/**
 * @file The only place `use-schema-state-section.hooks.ts` reaches `lib/api` — see
 * `schema-state-section-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultSchemaStateSectionPort: SchemaStateSectionPort = {
  getDatabaseSchemaState: () => databaseApi.getDatabaseSchemaState(),
};

/** Seed state for {@link createFakeSchemaStateSectionPort}. Exactly one of `state`/`error` is
 *  meaningful; `error` wins if both are given. */
export interface FakeSchemaStateSectionPortOptions {
  state?: AdminSchemaState;
  /** When set, `getDatabaseSchemaState()` REJECTS with this instead of resolving — the failed-check
   *  path, which must still produce a visible warning. */
  error?: Error;
}

/**
 * An in-memory {@link SchemaStateSectionPort} for tests. Defaults to a clean in-sync pair so a test that
 * only cares about some OTHER section can mount the screen without opting into a warning.
 */
export function createFakeSchemaStateSectionPort(options: FakeSchemaStateSectionPortOptions = {}): SchemaStateSectionPort {
  return {
    async getDatabaseSchemaState() {
      if (options.error) throw options.error;
      return options.state ?? { status: "in-sync", siteMeta: { version: 1, tag: "fake" }, runtime: { version: 1, tag: "fake" } };
    },
  };
}

/** This admin's collaborators for the package's drift-warning hook: its locale query. Module-level,
 *  so the hook field keeps its identity. */
export const SCHEMA_STATE_SECTION_HOST: SchemaStateSectionHost = {
  useLocale: () => useWiredAdminLocale(),
};

/**
 * Binds the real `/api/.../database/schema-state` client — see `defaultSchemaStateSectionPort`
 * above. The zero-argument half of the pair, so `Database.tsx` composes this and a test composes the
 * package's `useSchemaStateSection` with `createFakeSchemaStateSectionPort`.
 *
 * @returns Same controller shape as `useSchemaStateSection`, bound to the real port and this admin's host.
 */
export function useWiredSchemaStateSection(): SchemaStateSectionController {
  return useSchemaStateSection({ port: defaultSchemaStateSectionPort, host: SCHEMA_STATE_SECTION_HOST });
}
