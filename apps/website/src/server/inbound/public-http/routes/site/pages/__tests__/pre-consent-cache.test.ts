import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG_ID, CONSENT_COOKIE } from "@jini-ai/cookie-consent";
import { CACHE_CONTROL_PRE_CONSENT_TRACKING, hasConsentGatedScripts, preConsentCacheControl } from "../pre-consent-cache.js";

const PUBLIC = "public, max-age=60, stale-while-revalidate=300";
const config = (client: unknown) => `<script type="application/json" id="${CONFIG_ID}">${JSON.stringify(client).replace(/</g, "\\u003c")}</script>`;
const TRACKED_PAGE = `<html><head>${config({ contract: 1, banner: "jini", scripts: [{ src: "https://analytics.example/t.js", consent: "analytics" }] })}</head><body>hi</body></html>`;
const NO_GATED_PAGE = `<html><head>${config({ contract: 1, banner: "jini", scripts: [] })}</head><body>hi</body></html>`;
const NO_BANNER_PAGE = `<html><head><script data-jini-declared-script src="/a.js" defer></script></head><body>hi</body></html>`;
const CHOICE = encodeURIComponent(JSON.stringify({ v: 1, p: "policy-1", t: 1_700_000_000_000, a: "accept", c: { functional: true, analytics: true, marketing: true } }));
const request = (cookie?: string) => ({ headers: cookie === undefined ? {} : { cookie } });

test("preConsentCacheControl: a page rendered before consent that carries consent-gated tracking scripts is private, no-store", () => {
  assert.equal(preConsentCacheControl({ html: TRACKED_PAGE, request: request(), cacheControl: PUBLIC }), CACHE_CONTROL_PRE_CONSENT_TRACKING);
  assert.equal(preConsentCacheControl({ html: TRACKED_PAGE, request: request("other=1"), cacheControl: PUBLIC }), CACHE_CONTROL_PRE_CONSENT_TRACKING);
  assert.equal(CACHE_CONTROL_PRE_CONSENT_TRACKING, "private, no-store");
});

test("preConsentCacheControl: after a consent decision, or with no gated scripts, the route's directive stands", () => {
  assert.equal(preConsentCacheControl({ html: TRACKED_PAGE, request: request(`${CONSENT_COOKIE}=${CHOICE}`), cacheControl: PUBLIC }), PUBLIC);
  assert.equal(preConsentCacheControl({ html: NO_GATED_PAGE, request: request(), cacheControl: PUBLIC }), PUBLIC);
  assert.equal(preConsentCacheControl({ html: NO_BANNER_PAGE, request: request(), cacheControl: PUBLIC }), PUBLIC);
});

test("preConsentCacheControl: never loosens an already-private directive", () => {
  assert.equal(preConsentCacheControl({ html: TRACKED_PAGE, request: request(), cacheControl: "private, max-age=0" }), "private, max-age=0");
});

test("hasConsentGatedScripts: reads only the consent config's scripts; unparsable config fails safe as gated", () => {
  assert.equal(hasConsentGatedScripts({ html: TRACKED_PAGE }), true);
  assert.equal(hasConsentGatedScripts({ html: NO_GATED_PAGE }), false);
  assert.equal(hasConsentGatedScripts({ html: NO_BANNER_PAGE }), false);
  assert.equal(hasConsentGatedScripts({ html: `<script type="application/json" id="${CONFIG_ID}">{not json</script>` }), true);
});
