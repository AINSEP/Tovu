# land-sites-46 — desktop Sites-hide fix (saved by tovu-46 from the agent's final message; the harness blocked its own write)

- Commit: Tovu 6c6d5f54c (App.hooks.ts + app-sites-section-visibility.unit.test.tsx). No Jini commit. No Codex round 2.
- Marker: main.ts:668-670 `will-attach-webview` → applyGuestWebPreferences(SPEECH_PRELOAD_PATH) gives every site-tab webview `tovuVoice` (+ `tovuFiles` on /admin*); `isDesktopAdmin` reuses it.
- RED→GREEN: HEAD App.hooks.ts 4 failed / 12 passed (the 4 desktop cases); fix 16/16.
- Mutation: both changed guards killed by manual reruns (line 414: "listSites not called" + logout test; line 430: 4 tests). 20 survivors, all in untouched code.
- Visual: browser localhost:3000/admin/sites still shows Sites. Isolated attach-mode desktop (scratch TOVU_DESKTOP_USER_DATA_DIR; owner's pid 29959 untouched) redirects /admin/sites → /admin/, no Sites row. Caveat: attach mode is a BrowserWindow, not a webview tab; both get the same preload.
- Tool bug: mutation-sweep.mjs:108 `/Expected ["']/i` matches vitest's `expected 'x' to be 'y'` → real kills scored INCONCLUSIVE (lines 414, 430, 497-499 here). Sent to Codex: codex/2026-10-15-mutation-tool-r1.
- Notes: admin vitest rejects `--minWorkers`. sites.json still 4 sites (tovu-dev lastOpened changed from live desktop use). Lock starvation cost ~1h.
