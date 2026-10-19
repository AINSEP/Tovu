# uilane-c2 — agent plugin text + phone tabs (2026-10-17)

## Phone "no upload section" — cause
Not a phone bug. :3000 listens on 127.0.0.1 only, so the phone was on tovu.dev (Fly). There,
`createSitePluginPolicy` (apps/website/src/features/plugin-runtime/install.ts) marks the site hosted
(FLY_APP_NAME) and, without TOVU_PLUGIN_LOCAL_INSTALL=1, `GET .../plugins` returns installSources: [] ->
AddPluginPanel shows "Local folder installs are disabled on this server." with no upload. Verified on
tovu.dev desktop Chrome: same text. Agent Plugins' Add tab is ungated and shows upload on prod.
Owner decision: set TOVU_PLUGIN_LOCAL_INSTALL=1 on Fly (lets admins run uploaded server plugin code) or keep off.
Secondary real issue fixed: at 360px the 4-tab strips hid Marketplace with no cue -> right-edge fade
(the Themes pattern) on `.tab-bar` and the Jini tabbed-dialog strip on phones.

## Technical details
Fed by manifest `description` (agent-facing). The model reads it via search_agent_plugin_local, so it is
untouched; the card no longer renders it, nor `keywords` (40-chip cloud on higgsfield). Human text =
`extensions.tovu.summary`, rewritten to 1-2 sentences for all 19 plugins except shopify; displayName
added for github ("GitHub") and ui-ux-design ("UI/UX Design").

## Delivery
Bundled packages are content-addressed and reseeded on every server boot (seed-bundled + digest ledger),
no version bump. tovu-dev reseeded at 09:14 and shows the new text; vercel's fix (aa70f22cd) lands on
the next :3000 restart.

## Commits
8b252413f, aa70f22cd. Tests: admin vitest 45/45; node bundled manifest tests 56/56.
