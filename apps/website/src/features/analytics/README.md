# analytics: vendor forwarding and cookie consent

Decision (owner, 2026-11-24, A310): when cookie consent is off, or consent is required and the visitor has
not given it, **nothing is forwarded to any analytics vendor plugin** (PostHog, Plausible and the like). No
forwarder is bound and the vendor module is not constructed. The built-in, cookie-less analytics sink is
unaffected; only the vendor fan-out is gated. The gate is the `consentAllowsAnalytics` option of
`createAnalyticsForwarding` (`forwarding.ts`), wired in `server/runtime/composition/analytics-providers.ts` to
require the consent engine's `analyticsLevel === 'full'`. Pinned by
`server/runtime/composition/__tests__/analytics-consent-off.pin.unit.test.ts`.
