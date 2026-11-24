/**
 * @file Tovu's wording for `page.navigate`'s "not a published page" refusal, injected into
 * `@jini-ai/agentic`'s `withPageNavigateErrorRewrap` as `describeRefusal` so the refusal cannot be
 * misread as a CMS-content rejection.
 *
 * `page.navigate` (`@jini-ai/agentic`'s `page-executor.ts`, wired into the admin assistant's tool
 * set via `frontend-control-capabilities.ts`'s `PAGE_CAPABILITIES` and
 * `agent-daemon-scope-tools.ts`'s `createFrontendControl`) refuses an unregistered admin-SPA screen
 * id with `"${safePage}" is not a published page. Available: …`.
 *
 * That message is genuinely correct for what it actually checks — `safePages` is
 * `ADMIN_AGENT_PAGE_PATHS`'s keys (`apps/admin/src/lib/agent-pages.ts`), never a CMS post/page title
 * or slug (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §4). The bug is that "page" and
 * "published" are exactly the vocabulary this codebase's OWN, unrelated
 * `PostRecord.status === "published"` concept uses, so a request that meant a CMS Page ("copy
 * Landing sample and name it 'Landing Page'") reads this refusal as "there is no published page
 * named that" rather than "that is not a registered admin-screen id".
 *
 * Detection and registration wrapping live in Jini (the executor's message stays accurate for
 * every host); only this CMS-aware wording is Tovu's — following the `toModelFacingUpdateError`
 * precedent in `features/post/tool-registrations.ts` (reshaping a lower-layer error before it
 * reaches the model, rather than editing the layer that threw it).
 */
import type { PageNavigateRefusal } from "@jini-ai/agentic";

/** The admin-screen refusal, steering a CMS-page request to the content tools. */
export function describeAdminScreenRefusal({ page, availableScreens }: PageNavigateRefusal, _optional: Record<string, never> = {}): string {
  return (
    `"${page}" is not a registered ADMIN SCREEN id (page.navigate moves the operator's admin UI between ` +
    `published screens and resolved entity editors). Available screens: ${availableScreens}. ` +
    "Looking for a post or page instead? Use content_post_search / content_read.content_post " +
    "to resolve its identity, then navigate using the published entity target."
  );
}
