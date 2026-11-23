import { request } from "@/lib/admin-http/request";
import { authApi } from "@/features/auth/api/auth-api";
import { createTaxonomyApi } from "@jini-ai/admin/screens/taxonomy/api/taxonomy-api";
import { createMergeTermSectionPort } from "@jini-ai/admin/screens/taxonomy/hooks/merge-term-section-dependencies.hooks";
import { createNewTaxonomyFormPort } from "@jini-ai/admin/screens/taxonomy/hooks/new-taxonomy-form-dependencies.hooks";
import { createNewTermFormPort } from "@jini-ai/admin/screens/taxonomy/hooks/new-term-form-dependencies.hooks";
import { createTermPickerPort } from "@jini-ai/admin/screens/taxonomy/hooks/term-picker-dependencies.hooks";

/**
 * @file The admin's taxonomy bindings: `@jini-ai/admin`'s taxonomy API client and live ports, bound
 * once to this host's authenticated `request` and its auth client's `me`. Every taxonomy hook and
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
