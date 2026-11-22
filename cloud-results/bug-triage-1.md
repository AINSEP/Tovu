# bug-triage-1 — Tovu, branch `fix/settings-effective-400`

Base: `origin/refactor/terra` 232764af5. Setup: Node 24 (~/.local/node24), `npm ci` (root + apps/admin), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (Jini at 65d73b0d5, built), `tsc -p packages/contracts` and `packages/sdk`.
Note: running `npm ci` inside `packages/*` re-installs the root workspace and wipes root `node_modules`; run it only at the root.

## Finding: the 400 is not reproducible from the admin; the only 400 is legitimate
- The route (`apps/website/src/server/inbound/admin-http/routes/settings/get-effective.ts`, and Jini's generic twin `packages/core/src/settings/express/http.ts:99`) has exactly one 400: `namespace` missing or empty. The spec (`ADS-memory/specs/007-settings-core-ledger/api.spec.md` §4) says `namespace` is required. No error mapping on this route yields another 400.
- Admin callers (all of them): `settingsApi.getSettingsEffective` (`features/settings/api/settings-api.ts`; reached via `lib/ledger-slice.ts`, `lib/execution-settings.ts`, `settings-tabs.ts`, the AssistantDock preference adapters, `use-site-list-prefs`) and `features/email/email-api.ts:270` (`namespace=core.mail`). Every one passes a constant namespace.
- Real run: `npm run dev:server` (website on :3000, fresh sqlite) + `vite` admin on :5173 with the real proxy, driven by Playwright: logged in, visited all 40 sidebar routes, the AI runtime settings dialog and its tabs, a reload, and a UI login. Every `settings/effective` request was 200 (namespaces core.language/interface/appearance/execution/instructions/notifications/privacy); only the pre-login ones were 401. No 400 anywhere. `curl` of every namespace the admin uses (incl. `principalId=` empty): 200; no `namespace` or `namespace=`: 400.
- So a 400 on a local run can only come from a request that lacks/has an empty `namespace` — I could not find such a caller on a fresh database, so the exact trigger on the owner's machine is NOT identified. Possibly a stale local build/link or a state I could not recreate (stored DB, older Jini link). If it still happens, the server log line and request URL will now name it (below).

## What was changed (both sides, smallest change)
1. Server: the 400 text is now plain words: "Say which group of settings to read: add ?namespace=<group> to the address, for example ?namespace=core.language." (was `'namespace' query param is required`). Code stays `VALIDATION_ERROR`, status stays 400.
2. Admin: `settingsApi.getSettingsEffective` rejects a blank namespace with a `TypeError` ("Cannot read settings without a namespace. Pass the settings group to read, for example "core.language".") before sending, so any such caller fails at its own stack instead of as an anonymous 400. Rejected promise (not a sync throw) so existing `.catch` chains keep working.

Tests first (red shown, then green):
- `apps/website/.../settings/__tests__/json-route-fallbacks.unit.test.ts`: expected text changed → red (`actual: { error: "'namespace' query param is required" … }`), green after the route change; added an empty-`namespace=` case.
- `apps/admin/src/features/settings/api/__tests__/settings-api.unit.test.ts` (new): blank namespace test red (`Cannot read properties of undefined` — it tried to fetch), green after the guard; second test pins the normal URL.

## Gates (exact commands, results)
- Route tests: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks apps/website/src/server/inbound/admin-http/routes/settings/__tests__/*.test.ts apps/website/src/server/__tests__/routes/settings-*.test.ts` → 210 pass, 0 fail.
- Admin, whole package: `cd apps/admin && npx vitest run --maxWorkers=2` → 895 files passed, 1 failed (14787 tests passed, 2 skipped). The failing file is `src/integrations/chart-providers/__tests__/recharts-bundle-integer-ticks.unit.test.ts`: cannot import `Jini/packages/provider-plugins/plugins/charts-recharts/0.7.0/client/provider.js` (a built Jini artifact absent in this checkout) — environmental, unrelated to this change.
- `cd apps/admin && npx tsc --noEmit -p tsconfig.json` → clean. `npx eslint` on the 4 touched files → clean.
- BASE-RED gates (`npm run -s check:size|complexity|architecture|errors`), output recorded on the unmodified tree and after: byte-identical (diff empty after stripping ms). size exit 1, complexity exit 1, architecture exit 1, errors exit 0 — same as base; no new line from this change.
- Pre-push hook: "no apps/desktop changes in this push — skipping desktop gates" (no `--no-verify` used).

## Commit
- 7f0a9cbb `fix(settings): say in plain words what a settings/effective read without a namespace needs` (pushed; rebased onto refactor/terra first).

## Left / next
- Identify the owner's real 400: send the request URL from the browser Network tab (or the admin's failure toast text — it now shows the plain-words message if the server answers one). If the URL has no `?namespace=`, the caller is outside the paths listed above (e.g. a stale bundle).
- Jini's generic route text (`packages/core/src/settings/express/http.ts:100`) still has the terse message; left alone (other repo, no caller here).
- Overlaps: `apps/admin/src/features/settings/api/settings-api.ts`, `.../settings/get-effective.ts`.
