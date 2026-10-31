# Stack + edit notes (from the 2026-10-30 demo reel)

> 2026-10-31 correction: do NOT start test stacks from the clone that serves the owner's :3000 (prov2-tovu at the time) — saving or starting there restarts the owner's site. Use another clone (e.g. tovu-consent); if its Jini is older than the code, temporarily point its node_modules/@jini-ai/* symlinks at a current Jini build and restore them afterwards.

## fake-test-site stack
- Run it from the clone the owner's live site runs from: `/Users/la/Programming/tovu-integration-clones/prov2-tovu`
  (branch merge-1029). The main tree (`/Users/la/Programming/Tovu`) refuses fake-test-site: its DB already has
  migrations 0036/0037 the main tree doesn't know ("upgraded by a newer Tovu").
- Start (background, run_in_background — not `&`, so TaskStop can stop it):
  `cd /Users/la/Programming/tovu-integration-clones/prov2-tovu && PORT=3002 TOVU_ADMIN_DEV_PORT=5175 JINI_AGENT_DAEMON_PORT=4321 TOVU_SITE=fake-test-site TOVU_SITE_DIR=$HOME/Documents/Tovu/fake-test-site npm run dev > <clip>/dev.log 2>&1`
  `TOVU_SITE_DIR` is required: without it the launcher throws "More than one registered directory has this name".
- API listens on 127.0.0.1 only (curl `https://127.0.0.1:3002`, `localhost` hits ::1). Admin: `https://localhost:3002/admin/`.
  Ready ≈ 60–90 s after "API is up" (503 until then).
- Auth: `.env` has TOVU_DEV_OWNER_SIGNIN, so a loopback browser is signed in as owner automatically. Storage state:
  `node charts/make-state.mjs` (opens /admin/ headless, saves `state.json`, cookie `tovu_session_local_3002`).
  Copy it or rerun it in your own folder.
- Playwright import: `/Users/la/Programming/tovu-integration-clones/prov2-tovu/node_modules/playwright/index.mjs`.
- Model on the site: Claude Code / Sonnet 5.5 (a chart prompt ≈ 20 s, ≈ $0.15).
- Seeding data: through the product (assistant tools in a separate unrecorded chat; public form endpoint
  `POST /forms/<slug>/submit`, rate limit 5/min per IP+form). Never direct DB writes. See `charts/seed-signups.sh`.

## Recording (see `charts/take.mjs`)
- Viewport and video 1440x900, headless Chromium, `recordVideo` (raw is 25 fps webm), `ignoreHTTPSErrors`.
- Fresh chat each take: open assistant → "Chats" button → "+ New" (also clears the Playground canvas).
- Type with `pressSequentially(..., {delay: 35})`; glide the mouse with `mouse.move(x, y, {steps: 20-30})`.
- No `page.screenshot()` while recording; poll `innerText` once a second to detect "Done ·" and record event times
  in `events.json` so the edit can cut on real timestamps.

## Editing (see `charts/edit.sh`)
- Output 1440x900, 30 fps, libx264 `-preset slow -crf 18`, yuv420p, `+faststart`, no audio. Every ffmpeg:
  `nice -n 15 ... -threads 2 -filter_threads 1`; wait while load > 12.
- Assistant working time: one sped-up pass at 8x (≈ 3 s), then a 0.25 s `xfade` fade into the result.
- Zoom: render 2x-upscaled (lanczos) → `zoompan` d=1, smoothstep ease `q*q*(3-2q)`, 1.4 s in, 1.0 s out, max 1.4x.
  Render the zoomed segment as its own pass (30 fps before zoompan), then join; doing it in one graph broke timing.
  Pick the zoom centre so the crop edges land on whitespace (no sidebar or chat-panel slivers).
- End on a 2–2.5 s clone hold of the final state.
- Captions: 3–6, ≤ 6 words, plain verbs, no jargon, no exclamation marks ("Ask in plain words", "A clean chart, drawn for you").

## Learned from clip 2 (theme)
- Start the stack with `TOVU_PUBLIC_URL=https://localhost:3002` as well. The clone's `.env` pins it to :3000, so on :3002 the
  public consent save returns 403 ("Cookie preferences must be saved from this site") and the cookie banner never goes away.
- Assistant approval cards (e.g. theme_reset_file, "Restore the original theme file?") need a click on the `Confirm` button
  (`theme/chat.mjs` with `APPROVE=1` does it). The first chat after a fresh stack start can sit ~70 s on
  "Starting assistant… / Sending…": cut it.
