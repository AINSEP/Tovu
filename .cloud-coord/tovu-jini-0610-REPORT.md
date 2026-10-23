# Tovu @ 941e191bf (Jini 0.6.10 from npm) — VERDICT: NOT READY
(~15 min, Node 24.22.0, no Postgres/Chromium; no source edited)

## Release gate
- Jini: @jini-ai/core, chat, cms (and all other @jini-ai/*) = 0.6.10 (confirmed via npm ls).
- sdk build: OK.
- Root `npm run typecheck`: 2 errors (both TS2322, same root cause):
  1. apps/website/src/features/settings/tool-registrations.ts(102,5)
  2. apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts(46,11)
  Tovu's setValue `optional` param ({canEnablePublicAssistant?, preparePreviewSwitcherWrite?}) is not assignable from Jini's
  `SettingsValueWriteOptions` ("no properties in common") -> Jini 0.6.10 type drift. [UPGRADE]
- apps/admin typecheck: 1 error: ../website/src/features/settings/tool-registrations.ts(102,5), same as #1. [UPGRADE]

## Tests (247 changed test files since 2026-10-22: 183 website, 50 admin, 9 desktop, 5 site-chat)
- node (website+site-chat, 188 files): 2841 tests, 2824 pass, 16 fail, 1 skip.
- admin vitest (50 files): 1127 tests, 1123 pass, 2 fail, 2 skip.
- desktop (9 files, own runner): 127 tests, 124 pass, 3 fail (all ENV: electron/react not installed; apps/desktop & site-chat have no node_modules).

## Failures
ENV (not installed / no DB):
- site-chat SiteAssistantWidget.confirmation, SiteToolConfirmation.hooks, vanilla-host.confirmation .test.ts: Cannot find module 'react' (site-chat deps not installed).
- website platform/db/migrations/__tests__/runner.postgres.test.ts (4 tests): psql socket /tmp/.s.PGSQL.5432 missing.
- desktop preload.test.ts (electron), renderer/App.render.test.ts + icons.test.ts (react): not installed.
LIKELY UPGRADE (Jini 0.6.10 package layout):
- admin src/admin-themes/__tests__/admin-themes.unit.test.ts "preserves all inherited root token values" (dark=false, dark=true): ENOENT node_modules/@jini-ai/ui/src/styles/variables.css; published 0.6.10 ships only dist/styles/variables.css (no src/). Test reads src path.
LIKELY PRE-EXISTING test/code drift (assertion mismatches, unrelated to Jini imports; verify on base):
- website assistant/__tests__/byok-google-catalog.test.ts "EVERY wired tool's outbound Gemini schema is structurally valid": deepEqual, extra 'visitor-tools' entry.
- website assistant/__tests__/tool-contribution-registry.test.ts "installFirstPartyToolContributors installs exactly the converted domains": extra 'visitor-tools' (same cause as above; domain list in test not updated).
- agent-plugins unit/bundled-mail-credential-cards.unit.test.ts "cloudflare: ..." and "s3-compatible: ..." cards: expected fields ['accountId','zoneId'] but got [].
- mail-status/__tests__/mail-status-tool.test.ts "mail_send_test reports a refusal, ...": message 'No mail provider is configured. Nothing was sent.' vs expected 'no provider'.
- post/__tests__/content-post-list-filters.test.ts "t02: list publishes the optional query, real status enum and exact projection enum": expected enum schema, got undefined.
- server/__tests__/site-assistant-routes.test.ts "T1 policy on: HTTP path honors Off or restores literal tools without deleting choices": strictEqual false vs true. (possibly Jini-related settings; check)
- server/runtime/composition/__tests__/visitor-tools-management.unit.test.ts "the existing assistant-settings module mounts both visitor routes over the injected management owner": deepEqual mismatch; description text drift ("live taxonomy category names" vs "content types..."). (possibly related to settings-options type drift above)
- deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts "real core tree has only reviewed pattern exceptions": stale counts in vendor-exceptions.json; "approval is always manual".

## Blockers
1. 2 TS errors in the registry-only gate (Jini SettingsValueWriteOptions vs Tovu setValue options) -> the jini-published-typecheck workflow would fail.
2. admin-themes test reads a src/ path not published.
Note: full logs in /tmp (not committed).
