# rel-d4 handoff — desktop 0.1.20 release chain (2026-10-16 ~21:50)

Stopped at the context budget. Owner approval for the public steps: top of 2026-10-16-tovu-5d-to-tovu-d4.md (10:12). Brief: the rel-d4 dispatch from tovu-d4 (steps 1-9).

## Done
1. Secret scan of unpushed added lines (Tovu + Jini): clean. Jini general-work pushed (…03e8a224). Tovu restructure/apps-website-phased pushed through 692afa832, pre-push 6/6 PASS. b1e71a20f also pushed (6/6 PASS).
2. Jini release commit 03e8a224 published from the Jini root: core 0.4.7, platform 0.5.9, db 0.3.5, ui 0.5.5, cms 0.5.13, devops 0.5.5, daemon 0.6.8, chat 0.6.6, admin 0.4.12. All 9 are visible. Packs + SHA256SUMS + publish logs: ADS-memory/.local-artifacts/jini-release/packs-2026-10-16-rel-d4/.
3. Tovu adopt c9105af5e: 4 manifests + 4 lockfiles; root override key is now @jini-ai/chat@^0.6.6. The missing optional-peer set is the same as HEAD. :3000 was restarted once via the dev supervisor's restart-request file (API child only).
4. Gate: published typecheck in a clean git archive of c9105af5e: root 0, admin 0.
5. Bump 692afa832 (0.1.20 + apps/desktop/RELEASE-NOTES-0.1.20.md). Tag desktop-v0.1.20 (annotated) = 692afa832, pushed. tovu-d4 never replied with desktop60's hash. ffa6ca499 (the 180 s serve-port fix) is in the tag.
6. CI run 38999937222 all green, and the release job drafted itself: 11 assets; notes set from RELEASE-NOTES-0.1.20.md; still a DRAFT.
7. Packaged smoke on the CI x64 dmg (logs in ADS-memory/reports/2026-10-16-rel-d4/):
   - codesign OK, Notarized Developer ID, stapler OK (app + dmg), 0.1.20, x86_64.
   - smoke-native PASS (native modules + entry walk) and smoke-bridge PASS (3 bridges' initialize + tools/list).
   - Packaged journeys PASS 2/2: "Create website makes a real site…" and "Start, Restart and Stop…". The second creates a NEW site with the packaged CLI, then the app gets it to Running and it answers on its port.
   - smoke-packaged-chat PASS: jini connected, site_guide tool call, daemon.log "jini bridge preflight ok".
   - verify-package: 188/189 match. The one mismatch is dist/speech/preload-speech.cjs, and it is only because the local dist was bundled from linked Jini paths while CI used registry node_modules. Not corruption.

Test fixes on the way (Codex wrote them; I verified RED→GREEN and committed):
- b4c57764d: site-create-admin-password.test.ts imports isolated-catalog-home.
- 9760bd866: tovu-desktop-cli spawn timeout raised from 5 s to 30 s.
- b1e71a20f: the packaged-chat gate links ~/Library/Keychains into its temp HOME (since 06ea5fd8b it could never see the Claude login).

## Remaining (numbered)
1. Step 7 visual checks on the PACKAGED app. The isolated copy is at /Users/la/.cache/rel-d4-0120/plat/mac/Tovu.app (the dmg is in …/dl).
   - The Sites settings dialog is not clipped at the top.
   - The Settings menu looks right (9e057ff5c).
   - The phone toolbar and code viewer look right (admin).
   - Sites stays hidden inside the desktop app (6c6d5f54c).
   - Use the existing fixtures (launchDesktop, isolated HOME/userData) with TOVU_E2E_DESKTOP_APP, e.g. `node development/e2e/support/run-packaged-desktop.mjs -g …`. Run it under the test lock, with TMPDIR=$(getconf DARWIN_USER_TEMP_DIR).
2. Step 8: `gh release edit desktop-v0.1.20 --repo AINSEP/Tovu --draft=false --latest`. Then check that the dmg (arm64 + x64) and exe download URLs return 200, and that latest-mac.yml/latest.yml say 0.1.20 (the draft's copies already do).
3. Step 9 (optional): install into /Applications as a full copy, never interrupted. Then run `codesign --verify --deep --strict` and check the version.
4. Delete /Users/la/.cache/rel-d4-0120 when done.

## Warnings
- smoke-packaged-chat takes the shared test lock ITSELF. Never wrap it in test-lock.sh: it deadlocks (I lost 20 min to this).
- Real sites.json gained "zoran" (createdBy Web, 21:25:34, /Users/la/Documents/Tovu/zoran). It is NOT from rel-d4. I reported it to tovu-d4 and did not restore it.
- Jini `pnpm -r run build` fails in user-management (src/react/__tests__/screens.test.tsx:40,49 TS2769, `exact` is not in ByRoleOptions, from 23efcaee). Build the release closure with `--filter <pkg>...` until a Codex lane fixes it.
- Mac thermal throttling came back intermittently (CPU_Speed_Limit 25–35).
