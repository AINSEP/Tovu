import { useFetchMutation, useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { ApiError, describeApiError, request } from "@/lib/admin-http/request";
import { adminFailureChannel, publishLocalAdminFailure } from "@/lib/admin-failure-channel";
import { isClipboardRefusal } from "@jini-ai/admin/shell/lib/admin-failure-reporter";
import { trashApi } from "@/features/trash/api/trash-api";
import { authApi } from "@/features/auth/api/auth-api";
import { createTaxonomyApi } from "@jini-ai/admin/screens/taxonomy/api/taxonomy-api";
import { createMergeTermSectionPort } from "@jini-ai/admin/screens/taxonomy/hooks/merge-term-section-dependencies.hooks";
import { createNewTaxonomyFormPort } from "@jini-ai/admin/screens/taxonomy/hooks/new-taxonomy-form-dependencies.hooks";
import { createNewTermFormPort } from "@jini-ai/admin/screens/taxonomy/hooks/new-term-form-dependencies.hooks";
import { createTermPickerPort } from "@jini-ai/admin/screens/taxonomy/hooks/term-picker-dependencies.hooks";
import { createTaxonomyPort } from "@jini-ai/admin/screens/taxonomy/hooks/taxonomy-dependencies.hooks";
import { useTaxonomyHtmlEmbed } from "@jini-ai/admin/screens/taxonomy/hooks/use-taxonomy-html-embed.hooks";
import type { TaxonomyHostKit } from "@jini-ai/admin/screens/taxonomy/taxonomy-host-kit";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { t } from "./taxonomy-i18n";

/**
 * @file The admin's taxonomy bindings: `@jini-ai/admin`'s taxonomy API client and live ports, bound
 * once to this host's authenticated `request`, its Trash client and its auth client's `me`, plus the
 * {@link taxonomyHostKit} every taxonomy hook receives. Every taxonomy hook and
 * the `lib/__tests__` request-shape suites read these singletons; nothing else builds them.
 */

/** The admin API calls of the taxonomy feature, over this host's `request`. */
export const taxonomyApi = createTaxonomyApi({ request });

/** The merge ceremony's live port — matches `integrations/jini-admin/redirects-ports.ts`'s `redirectsHostPorts`. */
export const defaultMergeTermSectionPort = createMergeTermSectionPort({ api: taxonomyApi });

/** The new-taxonomy form's live port. */
export const defaultNewTaxonomyFormPort = createNewTaxonomyFormPort({ api: taxonomyApi });

/** The new-term form's live port. */
export const defaultNewTermFormPort = createNewTermFormPort({ api: taxonomyApi });

/** The term picker's live port; `me` is the host auth client's, for the permission gate. */
export const defaultTermPickerPort = createTermPickerPort({ api: taxonomyApi, me: () => authApi.me() });

/** `useTaxonomy`/`useTermDetailPanel`'s live port: the taxonomy client plus the generic Trash route. */
export const defaultTaxonomyPort = createTaxonomyPort({ api: taxonomyApi, trash: trashApi });

/** This host's translator, request-error class and failure channel, as the taxonomy hooks read them. */
export const taxonomyHostKit: TaxonomyHostKit = {
  translate: t,
  isApiError: (e): e is ApiError => e instanceof ApiError,
  describeApiError,
  failures: {
    getGeneration: () => adminFailureChannel.getGeneration(),
    isClipboardRefusal,
    publishLocalFailure: publishLocalAdminFailure,
  },
  useContentRefreshSubscription,
  useTaxonomyHtmlEmbed,
  useFetchMutation,
  useFetchQuery,
  useInvalidate,
};

/** Builds a real {@link ApiError} for `createFakeTaxonomyPort`'s blocked-trash seed — `describeDeleteBlocked`
 *  (rules.ts) narrows on `e instanceof ApiError` through {@link taxonomyHostKit}, so a plain `Error` with
 *  the same fields would silently fall through to the hard-error branch instead of the blocked one; the
 *  fake must throw the real class. */
export function createTaxonomyBlockedError({ count }: { count: number }, _optional: Record<string, never> = {}): ApiError {
  return new ApiError({ message: "TERM_HAS_CHILDREN", status: 409 }, { code: "TERM_HAS_CHILDREN", body: { code: "TERM_HAS_CHILDREN", count } });
}
