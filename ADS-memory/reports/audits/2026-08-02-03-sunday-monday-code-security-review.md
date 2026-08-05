# Tovu Sunday-Monday Code and Security Review

**Review date:** 2026-08-05  
**Change window:** Sunday 2026-08-02 through Monday 2026-08-03  
**Method:** Reviewed the current final implementations, not historical commit snapshots.

## Result

No actionable defects were found in the reviewed Sunday/Monday Tovu paths.

## Reviewed Areas

- Tool-registration contract refactor and narrowed route dependencies.
- CMS package extraction call sites and public-content reads.
- Public visitor assistant: mode gate, server-side credential resolution, request/history bounds, rate limiting, capability allowlist, published-only content access, and server-resolved navigation directives.
- Site-chat transport, session persistence, cancellation, and directive handling.
- MCP-UI confirmation callback/proxy, exchange binding, allowlist, and principal checks.
- Admin assistant dock wiring and form/editor changes.

## Security Assessment

The public assistant remains off by default, keeps provider keys server-side, limits anonymous requests, and exposes only a fixed read-only capability set. The MCP-UI callback validates the authenticated principal and allowlisted tool before delivering to an exchange bound to that same principal. Reviewed navigation directives derive paths from published records rather than model-controlled URLs.

## Verification

- `env -u GEMINI_API_KEY -u TOVU_SITE_ASSISTANT_MODEL node --import tsx --test src/server/__tests__/site-assistant-routes.test.ts`: 7 passed.
- Public-assistant capability/mode/tools and MCP-UI callback tests: 100 passed.

The route suite was deliberately run without `GEMINI_API_KEY`; this shell normally has a configured key, which otherwise changes the tests that intentionally assert the unconfigured `503` branch.
