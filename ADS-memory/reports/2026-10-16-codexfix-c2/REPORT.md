# codexfix-c2 — 2026-10-17: admin settings waves (A), title fallback (B), zoran titles (C)

Codex rounds: ADS-memory/reports/2026-10-17-codexfix-c2/{prompts-r1,out-r1,prompts-r2,out-r2} (2 rounds, 2 shards each).

## A — 0c5e17584 fix(admin): one admin load fetches each settings/boot resource once
Root cause (3 sources of waves):
1. settings SSE first `open` published an unscoped settings refresh → every settings reader refetched (lib/settings-events.ts). Now only an open after a frame/open (reconnect/resume) re-reads.
2. AssistantDock restored chat history replayed the saved terminal message as a new run completion → settings + content refresh (~1.7 s wave). Markers now seed from restored history.
3. staleTime 0 / direct-api readers refetched on every notification/remount; dashboard re-fetched auth/me. Readers moved onto the existing fetch-query cache with principal-scoped keys (lib/admin-boot-scope.ts), useSiteSectionAvailability shares useSitesSnapshot.
RED: HEAD sources + app-boot-request-volume.test.tsx → "/auth/me: expected 2 to be 1". GREEN: 60 named admin files, 883 pass / 2 skip.
Round 2 sent back to Codex: 23 dock tests lacked FetchQueryProvider; daemonOnline change broke fqfix-daemon-online (offline probe + pending-only share) → reverted to HEAD; first-open skip swallowed a resumed source's open (shared-stream-adapters) → `opened || cursor`; trimmed principal-scoped agents localStorage placeholder (not needed).
/api/agents boot count = 3 by design (inventory + daemon health probe per pane).

## B — 2d878729e fix(site): no Site title set keeps a static theme page's own <title>
Root cause: entry-less static home/marketing pages got the fold's display-name title, and injectExtraHeadIntoStaticPage removed the theme title. New `preserveThemeTitle` option, set when seoDeps.siteTitle (explicit-only) is undefined.
RED: HEAD render.ts/pages.ts in scratch copy → "no Site title preserves Theme Own Title", render.test preserve case, EC-03 fail. GREEN: 3 files 235/235.
Round 2: test used /about, which a seeded post owns → switched to /theme-probe.

## C — zoran theme (outside repo, no commit)
~/Documents/Tovu/zoran/themes/static/zoran-upside-down-city/render/pages/{about,changelog}.html titles → "— Zoran Creative Strategy". Other pages still end "— Tovu": pricing, signin, signup, download, docs (not in scope).

## Notes
- Codex B saved pages.ts/render.ts before I checked chat.db (checked right after: newest run_status succeeded on order-pinch and zoran).
- One admin test run started at CPU_Speed_Limit 74 (should have waited).
- sites.json md5 changed between my snapshot (09:40) and first run: mtime 09:44, only lastOpened for tovu-dev (owner/dev server), before any test of mine; same 5 entries. site-keys 860 unchanged.
- tsc not run (named tests only, per owner). Not looked at in a browser.
- Leftover not mine: apps/website/src/server/inbound/public-http/routes/site/pages.ts.orig (Oct 16 13:10), AllSitesTab.unit.test.tsx diff (other lane).
