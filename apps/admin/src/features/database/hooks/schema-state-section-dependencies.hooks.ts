import { api, type AdminSchemaState } from "@/lib/api";
import type { SchemaStateSectionPort } from "./schema-state-section-port.hooks";

/**
 * @file The only place `use-schema-state-section.hooks.ts` reaches `lib/api` — see
 * `schema-state-section-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultSchemaStateSectionPort: SchemaStateSectionPort = {
  getDatabaseSchemaState: () => api.getDatabaseSchemaState(),
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
 * An in-memory {@link SchemaStateSectionPort} for tests — "every port gets a fake" (see
 * `restore-points-section-dependencies.hooks.ts`). Defaults to a clean in-sync pair so a test that
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
