# E2E stress-test ideas and visual-baseline gaps (2026-10-04)

Owner directive 2026-10-04: author journeys, never run them. Every journey listed as "authored" carries `@unrun` and is registered in `development/UNRUN-TESTS.md`. Config: `development/playwright.journeys.config.ts`. Files: `development/e2e/journeys/*.journey.ts`. Scope IDs refer to `ADS-memory/.local-artifacts/e2e-scope/SCOPE.md` (W1-W12 web, D1-D7 desktop).

## 1. Journeys and stress cases

| Scope | Journey / stress case | Status | File |
|---|---|---|---|
| W1 | Login, wrong password, reload keeps session, logout, back/forward after logout | authored | smoke |
| W1 | Session revoked mid-edit: save kicks to login, draft offered back | authored | posts |
| W2 | Post lifecycle: publish -> public -> unpublish 404 -> trash -> restore | authored | posts |
| W2 | Two-tab version conflict (banner, keeps text, Save anyway); simultaneous saves 200 + 409 | authored | posts |
| W2 | Double-click New Post / Publish; reload mid-save; offline save; long unicode; 60 posts | authored | posts |
| W2 / AW-7 T2 | Content analysis card off/on, Analyze now on unsaved draft | authored | posts |
| AW-7 T2 | Enable -> Analyze now (double click = 1 call) -> disable -> card says off, no stale score | authored | plugins |
| W3 | Page publish -> `/<slug>`; phone width; preview sandbox (target=_top, top-nav script, popup) | authored | pages |
| W4 | Upload -> library -> public bytes/content-type; double upload; disallowed type; trash + delete | authored | media |
| W6 | Content type via modal -> entry -> publish -> `{"type":"collection"}` marker renders; unpublish hides | authored | collections |
| W6 | Entry two-tab conflict (dedicated copy, keeps text); double Publish = 1 call; duplicate slug; required field; unicode + escaped markup | authored | collections |
| W6 | Form built in admin -> embedded -> logged-out visitor submits -> admin sees answer | authored | forms |
| W6 | Public form abuse (no-login submission is INTENDED): honeypot stores nothing; 6th submit in 60 s = 429 + retryAfter; spoofed X-Forwarded-For does not reset; rate-limited browser post shows the alert; double-click Send = 1 row; server-side required/maxLength/email; unknown + `__proto__` keys dropped, values capped at 5000; markup in answers renders as text in admin; anonymous caller cannot list submissions; unknown slug 404 without echo | authored | forms |
| W7 | Menu built in admin -> menu widget + text widget + menu marker on a page -> public render, no placeholder | authored | widgets-menus |
| W7 | Missing widget id degrades to placeholder, page still 200 | authored | widgets-menus |
| W7 | Two-tab concurrent menu save: one wins, other gets dedicated conflict copy and keeps its item; simultaneous saves never both 200; double-click Save on new menu = 1 row; `javascript:` item refused or neutralised | authored | widgets-menus |
| W8 | de / hu long labels fit the expanded sidebar; no key screen scrolls sideways | authored | settings-locale |
| W8 | ar: `<html dir="rtl" lang="ar">`, sidebar on the right | authored (asserts INTENDED; likely fails) | settings-locale |
| W8 | Language tile in Settings persists across reload and drives the nav | authored | settings-locale |
| W8 | Phone width 390 px: 9 key screens no sideways scroll; nav drawer opens, navigates, closes | authored | settings-locale |
| W8 | Keyboard only: Skip to content first; Posts reachable by Tab with a visible focus ring; New Post by Enter; confirm dialog traps focus, Escape cancels | authored | settings-locale |
| W8 | Post status select has an accessible name | authored (asserts INTENDED; likely fails) | settings-locale |
| W9 | ask_choice typed answer: one POST with trimmed `__typedAnswer`, second Enter does nothing, no second run | authored | assistant |
| W9 | Stale question (409): notice text, draft kept, no run; delivery 500: retry notice, draft kept | authored | assistant |
| W9 | Typing while a CONFIRM card is pending QUEUES (`chat-pane-queued`), posts nothing to the question endpoint, no second run; cancel removes the queue (Jini 5e4ee497) | authored | assistant |
| W9 | Confirm double click = one decision for the right tool | authored | assistant |
| W9 | Approval countdown under `page.clock` (2:00 -> 0:59 -> expired card, no iframe, no auto-confirm) | authored | assistant |
| AW-7 T1 | Testimonials + FAQ: preview says no code runs, content types, stays off -> enable -> FAQ accordion + FAQPage JSON-LD; keyboard toggles a summary | authored | plugins |
| AW-7 T1 | Testimonials carousel keyboard-scrollable, no sideways page scroll at 390 px | authored | plugins |
| AW-7 | Plugin name conflict in the install preview AND on the Plugins row; enabling the clash is refused (409), holder untouched, readable reason | authored | plugins |
| W11 / W12 | Seeded public routes 200 + phone width; every `ADMIN_PANELS` route loads | authored | smoke |
| W5 | Theme activate -> public home reflects it -> revert; double-click Activate = 1 PATCH | authored | themes |
| W8 | Users: create editor -> log in as editor -> server 403 on users; restricted nav (asserts INTENDED; likely fails); disabled user refused | authored | users |
| W9 | Real tool call through a layer-2 fake model creates a Post row | NOT authored: no reusable fake-model helper exists (only the inline Gemini deputy in `byok-google-tool-schema.spec.ts`); needs `development/e2e/harness/fake-model-server.ts` (scripted SSE turn queue + request capture) and a BYOK provider configured in globalSetup | - |
| W10 | Public site-chat smoke on the shared harness | NOT authored (existing `site-assistant-*` cover it) | - |
| D1-D3 | Desktop: sites home smoke, add/create site, site webview guest (`.desktop.ts`, H2 config `playwright.desktop-journeys.config.ts`) | authored | desktop/smoke, add-site, site-webview |
| D4-D7 | Desktop: guest assistant reply via CDP Fetch stub; lifecycle (power, rename, remove, locate); zoom + window bounds persist; two instances side by side | NOT authored (agent rotated at context cap; see handoff 2026-10-04-e2e-unrun-part3-handoff.md) | - |

### Further stress ideas, not yet authored
- Trash: restore an item whose slug was reused meanwhile (post, menu, form); purge while another tab has it open.
- Media: upload of a 30 MB file; upload while offline; SVG with `<script>` served with a safe content type.
- Forms: 20-field form at max label length; the PRG flash cookie after a validation failure keeps the other fields; submissions "Load more" with 120 rows.
- Collections: deprecate, then tombstone a type while a page marker references it (fallback stays, page 200).
- Plugins: uninstall a plugin whose content type still has entries; the zip install path at 32 MiB + 1 byte.
- Assistant: a dropped SSE stream whose run GET answers 404 shows "The assistant restarted while this answer was running..." once; two docks in two tabs.
- Database timeline: `GET /api/admin/v1/database/timeline?cursor=garbage` -> 400 VALIDATION_ERROR shown as readable copy.
- Locales: fa/ur RTL, ja/th line breaking in buttons, every locale at 390 px.

## 2. Visual-baseline gap inventory

Committed baseline directories (only 4):
- `development/e2e/admin-composer-typeahead-visual.spec.ts-snapshots/` (3 dock states)
- `development/e2e/site-chat-fab-presence.spec.ts-snapshots/` (3 public pages)
- `development/e2e/theme-liquid-preview.spec.ts-snapshots/` (2 shots, no platform suffix)
- `development/e2e/theme-visual.spec.ts-snapshots/` (5 public home/post shots)

**`admin-visual-regression.spec.ts` plans 504 shots (3 viewports) but has NO committed `-snapshots/` directory**, so no admin screen has a baseline at all. Its first run only writes baselines; it can never fail until someone commits them.

Screens with no baseline before tonight: login, posts list, post editor, page editor (HTML/preview/phone), media, collections, entry editor, forms builder and submissions, menus, widgets, plugins (3 tabs, install dialog, conflict row), settings tabs, themes, trash, the dock's ask_choice / approval / expired cards, the content-analysis card, the version-conflict banner, ar RTL, de/hu long labels, every admin screen at phone width, the public FAQ accordion and testimonials carousel.

Baseline steps the journeys now add (written on first run, then compared; 36 shots total):
- smoke/posts/pages/media (part 1): login-card, posts-list, post-editor-empty, content-analysis-card, page-editor-html / preview / phone, media-library.
- collections: collections-list, collection-entries, collection-entry-editor.
- forms: forms-list, form-builder, form-submissions.
- widgets-menus: widgets-library, menus-list, menu-editor.
- assistant: dock-ask-choice-card, dock-confirm-card-countdown, dock-confirm-card-expired.
- plugins: plugin-install-preview-tier1, plugins-installed, public-faq-accordion, public-testimonials-carousel-phone, plugin-install-preview-conflict, plugin-row-conflict.
- settings-locale: settings-language-de / -hu, posts-list-de / -hu, dashboard-ar-rtl, settings-language-ar-rtl, phone-posts-list, phone-post-editor, phone-plugins, phone-settings.

Still without any baseline: themes, trash, taxonomy, users/roles/members, comments, deployment, database, the post version-conflict banner, every non-key screen at phone width.

Snapshot policy: the journeys config writes `{testFilePath}-snapshots/{arg}-{projectName}-{platform}`, so baselines are per platform. Commit only baselines produced on the CI platform, or the first CI run fails on every shot.

## 3. Likely product bugs (journeys assert the INTENDED behaviour)

1. **No RTL in admin.** ar/fa/ur are translated, but nothing sets `dir="rtl"`. `apps/admin/src/features/settings/SettingsUi.tsx:779` passes `syncDocumentAttributes={false}` on the stale premise that "the rest of the admin shell stays English". (settings-locale `ar` test)
2. **Unlabelled post status select.** `[data-agent-element="post-status"]` has no accessible name. (settings-locale)
3. **Raw 409 text for menus and entries.** A menu conflict shows `MenuConflictError`'s message (`update-tree.ts:56`), an entry conflict shows `describeApiError` output; posts have dedicated "saved this while you were editing" copy. (widgets-menus, collections)
4. **Stale existing spec.** `pages-editor.spec.ts` asserts the page preview sandbox lacks `allow-same-origin`; `PAGE_PREVIEW_IFRAME_SANDBOX` includes it since 7c1bcfc5c.
5. **Possible (unverified): double submit on public forms.** The rendered form ships no script that disables Send, so a double click may store two rows. (forms)
6. **Possible (unverified): the long-label check.** Nav labels may be clipped with ellipsis in de/hu once the rail is expanded; the journey treats clipping as a failure.


Not a bug: `javascript:` menu links are rejected at write time by a scheme allowlist (`Jini/packages/cms/src/navigation/menu-service.ts:155`). The widgets-menus journey accepts either refusal at save or no `href="javascript:` in the public HTML, so it guards against a regression.
