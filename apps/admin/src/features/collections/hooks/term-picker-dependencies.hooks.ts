import { api } from "../../../lib/api";
import type { TermPickerPort } from "./term-picker-port.hooks";

/**
 * @file The only place `use-term-picker.hooks.ts` reaches `lib/api` — see `term-picker-
 * port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultTermPickerPort: TermPickerPort = {
  assignTerms: (input) => api.assignTerms(input),
};

/** Seed state for {@link createFakeTermPickerPort}. */
export interface FakeTermPickerPortOptions {
  /** When set, `assignTerms()` rejects with this instead of resolving — for failure-path tests. */
  assignError?: Error;
}

/**
 * An in-memory {@link TermPickerPort} for tests — "every port gets a fake" (see
 * `assistant-chats-dependencies.hooks.ts`). Records every call for assertions.
 */
export function createFakeTermPickerPort(options: FakeTermPickerPortOptions = {}): TermPickerPort & {
  /** Every `assignTerms` call this fake has received, in call order. */
  readonly calls: Array<{ contentType: string; contentId: string; termIds: string[] }>;
} {
  const calls: Array<{ contentType: string; contentId: string; termIds: string[] }> = [];

  return {
    calls,
    async assignTerms(input) {
      calls.push(input);
      if (options.assignError) throw options.assignError;
    },
  };
}
