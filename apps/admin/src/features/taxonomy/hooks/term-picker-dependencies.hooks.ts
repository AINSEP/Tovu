import { api, type AdminTaxonomyWithTerms } from "@/lib/api";
import type { TermPickerPort } from "./term-picker-port.hooks";

/**
 * @file The only place `use-term-picker.hooks.ts` reaches `lib/api` — see `term-picker-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultTermPickerPort: TermPickerPort = {
  listTaxonomies: () => api.listTaxonomies(),
  assignedTerms: (input) => api.assignedTerms(input),
  assignTerms: (input) => api.assignTerms(input),
  unassignTerms: (input) => api.unassignTerms(input),
};

/** Seed state for {@link createFakeTermPickerPort}. */
export interface FakeTermPickerPortOptions {
  /** The taxonomies (with their terms) the picker lists. */
  taxonomies?: AdminTaxonomyWithTerms[];
  /** The term ids the post, page or entry holds before any save. */
  assigned?: string[];
  /** When set, `assignedTerms()` rejects with this. */
  loadError?: Error;
  /** When set, `listTaxonomies()` rejects with this. */
  taxonomiesError?: Error;
  /** When set, `assignTerms()`/`unassignTerms()` reject with this instead of resolving. */
  saveError?: Error;
}

type TermWrite = { kind: "assign" | "unassign"; contentType: string; contentId: string; termIds: string[] };

/**
 * An in-memory {@link TermPickerPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). Keeps the assigned set, so a reload after a save reads
 * what the save wrote, and records every write for assertions.
 */
export function createFakeTermPickerPort(options: FakeTermPickerPortOptions = {}): TermPickerPort & {
  /** Every assign/unassign call this fake has received, in call order. */
  readonly calls: TermWrite[];
} {
  const calls: TermWrite[] = [];
  const assigned = new Set(options.assigned ?? []);
  const write = async (kind: TermWrite["kind"], input: Omit<TermWrite, "kind">) => {
    calls.push({ kind, ...input });
    if (options.saveError) throw options.saveError;
    for (const id of input.termIds) {
      if (kind === "assign") assigned.add(id);
      else assigned.delete(id);
    }
  };

  return {
    calls,
    async listTaxonomies() {
      if (options.taxonomiesError) throw options.taxonomiesError;
      return { items: options.taxonomies ?? [] };
    },
    async assignedTerms() {
      if (options.loadError) throw options.loadError;
      return { termIds: [...assigned].sort() };
    },
    assignTerms: (input) => write("assign", input),
    unassignTerms: (input) => write("unassign", input),
  };
}
