# Tovu jini 0.6.10 recheck — READY
Ref: origin/cloud/tovu-jini-0610 @ b289dfe5 vs published @jini-ai 0.6.10 (no link:jini). Node 24.22.0.
- npm ci + sdk build: OK
- root `npm run typecheck`: 0 errors
- apps/admin `npm run typecheck`: 0 errors
- Website node tests (28 files: changed since 941e191bf + importers of visitor-executor/site-title-write/capability-registry/byok-provider-turn + previously failing set): 464 pass / 0 fail / 0 skipped
- Admin vitest admin-themes.unit.test.ts: 27/27 pass (sourcemap warning in log only)
Previously failing files, all PASS: admin-themes, byok-google-catalog, tool-contribution-registry, bundled-mail-credential-cards, mail-status-tool, content-post-list-filters, site-assistant-routes, visitor-tools-management, no-vendor-in-core.boundary.
Other failures: none. Not run: Postgres/Chromium-dependent tests (env).
