Programmer(Direct): Chosen for the narrow test setup fix.

Added the existing isolation helper as the first import in all ten files. Static inspection confirmed every relative `.js` path resolves correctly. Preserved all comments and test logic.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.site-capabilities-registry-wiring.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/assistant/__tests__/plugin-prompt-prefix.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/__tests__/landing-page-render.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/__tests__/no-silent-drops.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/middleware/__tests__/public-page-security-headers.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/plugin-contributions.auth.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/__tests__/commerce-strip-parity.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/__tests__/feed.route.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/analytics-ingest.integration.test.ts
```

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed. No git commands or state changes. Runtime results remain unverified.
