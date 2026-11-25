/**
 * @file G7-8 (owner decision): a public page rendered BEFORE the visitor made a consent choice, and
 * carrying consent-gated tracking scripts, must never be stored by a shared cache.
 *
 * The consent banner delivers consent-gated scripts inside its JSON page config (`CONFIG_ID`,
 * `@jini-ai/cookie-consent` `renderBanner`); the browser client activates them only after the visitor
 * opts in. A CDN copy of that pre-consent document would keep being replayed after the site's
 * tracking set or consent policy changes, so such responses are `private, no-store` instead.
 */
import { preConsentCacheControl as sharedPreConsentCacheControl } from "@jini-ai/cookie-consent/site/pre-consent-cache";
import type { Request } from "express";
import { CONFIG_ID, CONSENT_COOKIE } from "@jini-ai/cookie-consent";
import { parseStored } from "@jini-ai/cookie-consent/policy";
import { readRequestCookie } from "#src/server/http/request-cookie";

/** Parses the stored consent cookie value; the library's own trust-boundary parser, so anything it
 *  rejects (wrong shape, wrong version, oversize, not JSON) is "no choice". */
export type ParseConsentCookie = (input: { raw: string }, options?: Record<string, never>) => unknown;

/**
 * True when the request carries a consent cookie that PARSES as a stored choice. A cookie that merely
 * exists under the consent name (empty, truncated, hand-edited) is not a choice: the banner would
 * still be shown, so the page is still a pre-consent page.
 * @complexity O(cookie header).
 */
export function hasParsedConsentChoice(
  { request }: { request: Pick<Request, "headers"> },
  { parseConsentCookie = parseStored as ParseConsentCookie }: { parseConsentCookie?: ParseConsentCookie } = {},
): boolean {
  const raw = readRequestCookie({ request, name: CONSENT_COOKIE });
  return raw !== undefined && Boolean(parseConsentCookie({ raw }));
}

/**
 * The `Cache-Control` to send: the route's own directive, tightened to
 * {@link CACHE_CONTROL_PRE_CONSENT_TRACKING} for a pre-consent request (no parsed consent choice yet)
 * whose page carries consent-gated scripts. Never loosens an already-private directive.
 * @complexity O(html length).
 */
export function preConsentCacheControl(
  { html, request, cacheControl }: { html: string; request: Pick<Request, "headers">; cacheControl: string },
  options: { parseConsentCookie?: ParseConsentCookie } = {},
): string {
  return sharedPreConsentCacheControl({ html, cacheControl, configId: CONFIG_ID,
    hasConsentChoice: () => hasParsedConsentChoice({ request }, options),
  });
}
