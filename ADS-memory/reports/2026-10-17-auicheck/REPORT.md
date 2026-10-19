# auicheck — Admin UI (A) + test type fixes (B), 2026-10-17

## Commits
- B: 2dd5ffeda test(admin,website): fix the four remaining test type errors without weakening assertions
- A: NOT committed (2 red tests).

## Verification
- apps/admin vitest, 54 files (Admin UI, settings, admin-themes, nav/panels, Placeholder, agent-pages,
  admin-screens-manifest, panel-access, settings-tabs/events, use-admin-appearance, app-boot-request-volume,
  3 tsc1 files, adminthemes-67 list): 827 pass, 2 fail, 2 skipped.
- apps/admin `npx tsc --noEmit -p .`: 0 errors.
- apps/website assistant-tool-approval-policy (node:test): 7/7.
- REAL HOME before/after identical (sites.json md5 9dea5d41..., 860 site-keys, 5 site dirs).
- No test processes of mine left (remaining vitest/playwright pids predate this run: playwright MCP, a 10-15 node).

## Red for Codex
1. src/lib/__tests__/admin-screens-manifest.unit.test.ts:79 — apps/website/src/features/site-inspection/admin-screens.generated.ts
   is stale: missing `admin-ui` ("Admin UI", /admin-ui) and `admin-themes` ("Admin Themes", /admin-themes);
   still lists `design-system`; `admin-appearance` label is "Appearance", expected "Admin Appearance".
   Regenerate: cd apps/admin && UPDATE_ADMIN_SCREENS_MANIFEST=1 npx vitest run src/lib/__tests__/admin-screens-manifest.unit.test.ts
   (writes under apps/website/src -> tsx watch restarts :3000; check chat.db run_status first).
2. src/features/settings/__tests__/AdminAppearance.unit.test.tsx:119 "uses the existing debounced settings lifecycle..."
   expected '#059669', received '#a855f7' (deterministic, also alone). Cause: test fake. useSettingsSlice publishes a
   settings refresh after save; `persistence.load` is pinned to `previous` (#a855f7), so the reload reverts the draft
   and useSettingsAppearance re-applies the old accent. Make the fake stateful (save updates what load returns), or
   assert the preview before the save settles. Not a product bug (real load returns the saved value).

## Look (Chrome, desktop + 390px iframe, light + dark)
- Nav: one "Admin UI" row in Studio, then Playground; no Admin Themes/Appearance/Design System rows. OK.
- Theme tab: only Tovu Classic card (Active), no scheme control. OK both schemes.
- Appearance tab: exactly one Light/Dark/System control; switching repaints live; Dark persisted across reload
  (pre-paint too); left on LIGHT, verified after reload. OK.
- Design System: Soon notice. NIT: renders a second "STUDIO" kicker + second <h1>"Design System" under the page
  <h1>"Admin UI" (admin-ui.css hides the nested heading only for the Theme tab).
- Redirects: /admin/admin-themes -> ?tab=theme, /admin/admin-appearance -> ?tab=appearance,
  /admin/design-system -> ?tab=design-system, /admin/settings?tab=appearance -> /admin/admin-ui?tab=appearance. OK.
- Settings: 9 tabs (AI agent, Instructions, Notifications, Privacy, Language, User Interface, Memory, Workspace, Info), no Appearance. OK.
- Phone 390px: no horizontal overflow or clipped text on any tab. OK.
- NIT: the scheme control has no visible label while "Accent color" does.
- NIT (pre-existing .segmented dark style): active "Dark" segment bg oklch(0.185) on track oklch(0.22) -> weak active state in dark.

## Scope notes
- ADS-memory/reports/architecture/admin-theme-token-contract.md: NOT owned by Admin UI (edited 13:03, before
  this work at ~19:09; absent from both Codex CHANGED FILES lists; its 2nd paragraph is about Jini UI chat aliases). Left unstaged.
- AdminAppearance.tsx keeps a `data-theme="light"` pin on .settings-ui-section; no visible harm in dark.
