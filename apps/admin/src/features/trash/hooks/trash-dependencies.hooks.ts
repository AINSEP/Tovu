import { api, type AdminTrashItem, type AdminTrashPurgeReport, type AdminTrashRestoreReport } from "@/lib/api";
import type { TrashPort } from "./trash-port.hooks";

/**
 * @file The only place `use-trash.hooks.ts` reaches `lib/api` — see `trash-port.hooks.ts` for why
 * the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultTrashPort: TrashPort = {
  listTrash: (options) => api.listTrash(options),
  restoreTrashItems: (input) => api.restoreTrashItems(input),
  purgeTrashItems: (input) => api.purgeTrashItems(input),
};

/** Seed state for {@link createFakeTrashPort}. */
export interface FakeTrashPortOptions {
  items?: AdminTrashItem[];
  nextCursor?: string | null;
  listError?: Error;
  restoreError?: Error;
  purgeError?: Error;
  /** Overrides the default all-succeeded report, for the mixed-outcome cases that matter most. */
  restoreReport?: AdminTrashRestoreReport;
  purgeReport?: AdminTrashPurgeReport;
}

/**
 * An in-memory {@link TrashPort} for tests — "every port gets a fake".
 *
 * The default reports say everything succeeded, so a test that cares about outcomes has to state
 * them: a fake that silently invented a mixed report would make the screen's outcome copy look
 * tested when it was not.
 *
 * @complexity O(1) to build; every method is O(1) beyond the call log.
 */
export function createFakeTrashPort(options: FakeTrashPortOptions = {}): TrashPort & {
  readonly listCalls: Array<{ cursor?: string }>;
  readonly restoreCalls: Array<{ items: { entityType: string; entityId: string }[] }>;
  readonly purgeCalls: Array<{ ids: string[] }>;
} {
  const listCalls: Array<{ cursor?: string }> = [];
  const restoreCalls: Array<{ items: { entityType: string; entityId: string }[] }> = [];
  const purgeCalls: Array<{ ids: string[] }> = [];

  return {
    listCalls,
    restoreCalls,
    purgeCalls,
    async listTrash(queryOptions) {
      listCalls.push(queryOptions);
      if (options.listError) throw options.listError;
      return { items: options.items ?? [], nextCursor: options.nextCursor ?? null };
    },
    async restoreTrashItems(input) {
      restoreCalls.push(input);
      if (options.restoreError) throw options.restoreError;
      return (
        options.restoreReport ?? {
          restored: input.items.length,
          results: input.items.map((item) => ({ ...item, outcome: "restored" as const })),
        }
      );
    },
    async purgeTrashItems(input) {
      purgeCalls.push(input);
      if (options.purgeError) throw options.purgeError;
      return (
        options.purgeReport ?? {
          purged: input.ids.length,
          results: input.ids.map((id) => ({ id, outcome: "purged" as const })),
        }
      );
    },
  };
}
