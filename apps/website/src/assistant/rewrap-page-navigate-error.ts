/**
 * @file Rewraps `page.navigate`'s "not a published page" refusal into wording that cannot be
 * misread as a CMS-content rejection.
 *
 * `page.navigate` (`@jini-ai/agentic`'s `page-executor.ts:414`, wired into the admin assistant's
 * tool set via `frontend-control-capabilities.ts`'s `PAGE_CAPABILITIES` and
 * `agent-daemon-server.ts`'s `createFrontendControl`) refuses an unregistered admin-SPA screen id
 * with:
 *
 * ```
 * "${safePage}" is not a published page. Available: ${safePages join(', ') or '(none)'}
 * ```
 *
 * That message is genuinely correct for what it actually checks — `safePages` is
 * `ADMIN_AGENT_PAGE_PATHS`'s keys (`apps/admin/src/lib/agent-pages.ts`), never a CMS post/page title
 * or slug (`ADS-memory/reports/2026-09-07-page-tool-gap.md` §4). The bug is that "page" and
 * "published" are exactly the vocabulary this codebase's OWN, unrelated
 * `PostRecord.status === "published"` concept uses, so a request that meant a CMS Page ("copy
 * Landing sample and name it 'Landing Page'") reads this refusal as "there is no published page
 * named that" rather than "that is not a registered admin-screen id".
 *
 * Not fixed in `@jini-ai/agentic` itself: that package is a Jini workspace dependency with
 * consumers beyond this repo, and its message is accurate for what it actually checks. Fixed here,
 * Tovu-side, at the `page.navigate` call site — following the `toModelFacingUpdateError` precedent
 * in `features/post/tool-registrations.ts` (reshaping a lower-layer error before it reaches the
 * model, rather than editing the layer that threw it).
 */
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

/** The id `createFrontendCapabilityRegistrations` (`@jini-ai/daemon`) assigns this capability's
 *  `ToolRegistration` — verbatim from `PAGE_CAPABILITIES`'s own `id`, since that module publishes
 *  a capability's `id` as its tool id unchanged (`frontend-capability-tools.ts`'s own doc: "Ids
 *  become tool ids verbatim"). */
export const PAGE_NAVIGATE_TOOL_ID = "page.navigate";

/**
 * Matches `page-executor.ts:414`'s exact refusal shape. Anchored at both ends (`^`/`$`) so a
 * message that merely CONTAINS this phrase (unlikely, but not worth risking) is not mistaken for
 * the refusal itself; `s` so a page id or screen list containing a stray newline (neither is
 * expected, but neither is impossible) does not break the match.
 */
const PAGE_NAVIGATE_NOT_FOUND_PATTERN = /^"(.*)" is not a published page\. Available: (.*)$/s;

/**
 * Detects `page.navigate`'s "not a published page" refusal and rewraps it with a disambiguating
 * note; every other rejection passes through completely unchanged (the SAME object, not a rebuilt
 * copy — this function does not own any other error shape).
 *
 * @complexity O(n) in the message length (one regex match) — negligible, and run at most once per
 * rejected `page.navigate` call.
 */
export function rewrapPageNavigateError(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const match = PAGE_NAVIGATE_NOT_FOUND_PATTERN.exec(err.message);
  if (!match) return err;

  const [, page, availableScreens] = match;
  return new Error(
    `"${page}" is not a registered ADMIN SCREEN id (page.navigate moves the operator's admin UI between a ` +
      `fixed set of screens — it does not open site content). Available screens: ${availableScreens}. ` +
      "Looking for a post or page instead? Use content_post_search / content_read.content_post " +
      "(or content_duplicate to copy one), not page.navigate."
  );
}

/**
 * The wiring half: rewraps ONLY the `page.navigate` registration's handler in a `try`/`catch` that
 * routes its rejection through {@link rewrapPageNavigateError}; every other registration is
 * returned as the identical object, untouched. `agent-daemon-server.ts`'s registration loop calls
 * this on `frontendControl.toolRegistrations` before handing them to the `ToolRegistry` — see that
 * file's own call site, and `agent-daemon-server.page-navigate-error-rewrap.unit.test.ts` for the
 * proof that it actually does.
 *
 * A `.map` over the whole array rather than a lookup-and-splice: `frontendControl.toolRegistrations`
 * is a flat, order-independent list (each entry is one capability's own tool, per
 * `frontend-capability-tools.ts`), so there is no ordering to preserve beyond "same length, same
 * relative order" — which `.map` gives for free.
 *
 * @complexity O(n) in `registrations.length` to build the wrapped array; each wrapped handler adds
 * O(1) overhead (one `try`/`catch`) per invocation.
 */
export function withPageNavigateErrorRewrap(registrations: readonly ToolRegistration[]): readonly ToolRegistration[] {
  return registrations.map((registration) => {
    if (registration.descriptor.id !== PAGE_NAVIGATE_TOOL_ID) return registration;
    return {
      ...registration,
      handler: async (ctx: ToolExecutionContext) => {
        try {
          return await registration.handler(ctx);
        } catch (err) {
          throw rewrapPageNavigateError(err);
        }
      },
    };
  });
}
