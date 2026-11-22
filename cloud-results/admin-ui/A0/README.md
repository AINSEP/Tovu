# A0: admin before-pictures (base `232764af5`, branch wave2/admin-a)

Captured by `a0-capture.journey.ts.txt` (a Playwright spec; rename to `.journey.ts` and drop it in
`development/e2e/journeys/` to re-run: `A0_OUT=<dir> npm run e2e:journeys -- a0-capture.journey.ts --project=chromium --workers=2`).
It runs on the journeys config's hermetic seeded site (the same one `npm run test:visual` uses), logs in once and walks
the 51 panel ids of `apps/admin/src/panels.tsx`.

- Files: `<panelId>__<view>__<theme>-<scheme>-<width>.png`. `view` = `list` (the panel's route) or `tab-<n>-<label>`
  for each `[role=tab]` inside `<main>` (first 8). Themes classic and glass, light and dark, 1440 px and 390 px.
- All 1056 pictures (230 MB) were captured; over the sheet's 150 MB line, so only **classic-light at 390 and 1440** is
  committed (264 pictures, 13 MB). The scheme/theme are set by writing the three attributes `applyAdminThemeToDocument`
  writes (`data-admin-theme`, `data-color-scheme`, `data-theme`) after the page loads.
- `landed-<width>.tsv`: for each view, the picture name, the URL the browser ended on, and the first `<h1>`. Read it before
  trusting a picture: `sites` lands on the Dashboard (the Sites panel is not reachable in this single-site seed),
  `admin-themes`/`admin-appearance`/`design-system` land on `admin-ui?tab=...`, `notifications` lands on Email,
  `workspace` lands on `settings?tab=workspace`; `agent-plugins`, `skills`, `settings` have no `<h1>`.
- `request-counts-1440.json`: API requests (all methods) seen while each panel route loaded (browser, 1440 px, includes the
  shell boot reads). It is an extra; the sheet's request-count baseline is the vitest harness (see the report).
- NOT captured: the first editor/detail view of each panel (needs a seeded row per panel; the existing
  `development/e2e/journeys/admin-visual.pins.journey.ts` has named editors for page, post, form, menu, collection, widget),
  dialogs, and the dock open/closed pair. Animations were frozen (`animation: none`) for stable pictures.
