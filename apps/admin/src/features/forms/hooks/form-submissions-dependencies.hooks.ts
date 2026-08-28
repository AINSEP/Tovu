import { api, type AdminFormSubmission } from "@/lib/api";
import type { FormSubmissionsPort } from "./form-submissions-port.hooks";

/**
 * @file The only place under `features/forms/hooks` that reaches `lib/api` for submission
 * routes — see `form-submissions-port.hooks.ts` for why the split exists.
 */

/** The live implementation, as a module-level singleton — matches `redirects-dependencies.hooks.ts`'s
 *  `defaultRedirectsPort`. */
export const defaultFormSubmissionsPort: FormSubmissionsPort = {
  listFormSubmissions: (target, options) => api.listFormSubmissions(target, options),
  getFormSubmission: (target) => api.getFormSubmission(target),
  deleteFormSubmission: (target) => api.deleteFormSubmission(target),
};

/** Seed state for {@link createFakeFormSubmissionsPort}. */
export interface FakeFormSubmissionsPortOptions {
  submissions?: AdminFormSubmission[];
}

/**
 * An in-memory {@link FormSubmissionsPort} for tests — the fake that lets a test describe "this
 * form has these submissions" or "the delete fails" directly, instead of hand-building fetch
 * `Response`s. Shipped alongside the real binding per the pattern's "every port gets a fake" rule
 * (see `assistant-chats-dependencies.hooks.ts`).
 *
 * `listFormSubmissions` ignores `cursor`/`limit` and returns the full seeded list with
 * `nextCursor: null` — none of this feature's existing behavior tests a multi-page cursor walk, so
 * a fake pagination implementation would be untested surface, not a simplification.
 */
export function createFakeFormSubmissionsPort(options: FakeFormSubmissionsPortOptions = {}): FormSubmissionsPort & {
  /** Every submission currently in the fake's store, in list order. */
  readonly submissions: AdminFormSubmission[];
} {
  const submissions = [...(options.submissions ?? [])];

  return {
    submissions,

    async listFormSubmissions({ formId }) {
      return { data: submissions.filter((s) => s.formDefinitionId === formId), nextCursor: null };
    },

    async getFormSubmission({ submissionId }) {
      const found = submissions.find((s) => s.id === submissionId);
      if (!found) throw new Error(`fake form submissions port: unknown submission ${submissionId}`);
      return { data: found };
    },

    async deleteFormSubmission({ submissionId }) {
      const index = submissions.findIndex((s) => s.id === submissionId);
      if (index < 0) throw new Error(`fake form submissions port: unknown submission ${submissionId}`);
      submissions.splice(index, 1);
    },
  };
}
