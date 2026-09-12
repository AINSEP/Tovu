# Handoff: session tovu-83 → new session (2026-09-12, ~13:20)

**Owner preferences:**
- Replies VERY short: only relevant things, 2-3 lines. The owner uses voice dictation.
- **Opus 5** does substantive programming. **Sonnet** does simple tasks, checks, sweeps, doc and plan edits, commits, and publishes.
- The coordinator dispatches and never implements. Treat every subagent report as a claim and verify it.
- Rules live in memory `subagent_granularity.md`.
- Never `pgrep -l`, `pgrep -fl`, or `ps eww`: they leak API keys.

## Running when I handed off: SPEC-050 Step 2 (agent `site-title-step2`, Opus, in session tovu-83)

- **Spec:** `ADS-memory/specs/050-core-site-title/feature.spec.md` v0.2.0, APPROVED.
  - Owner answers: NC-1=A, NC-2=B, NC-3=A.
  - The spec dir is **untracked** and the hash is only on disk. Commit it.
- **Step 1 landed:** `dfec609f`, plus fix `b68c9de7`.
  - `core.site.title` is registered with default "Tovu Demo Site".
  - All 9 call sites read `resolveSiteTitle`.
  - No rendered change.
- **Step 2 (migration, existing-site pin, new-site name from config.json, race guard): uncommitted at handoff.**
  - Modified: `schema.ts`, `site-title.ts`, `site-title.integration.test.ts`.
  - New: `site-title-preservation.sqlite.ts`, plus tests (`site-title.test.ts`, the preservation store contract test, the pre-existing-marker migration test, the preservation integration test, `helpers/pre-site-title-marker-db.ts`).
  - tovu-com DB backup, 44 MB, taken 13:00: `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/c7d20e40-125d-4b9e-b0a0-0d07d67aac47/scratchpad/tovu-com-db-backup/content.db`
  - **Risk to check:** the owner's desktop app restarted around 13:05, with `schema.ts` already modified. Migrations auto-apply on boot. Verify tovu-com's `content.db` didn't get a half-written migration; compare against the backup.
  - **Open owner decision, REQ-08/AC-14:** blank titles, or titles over 200 characters, can't be rejected at write time, because Jini's string schema only checks `typeof` (`Jini/packages/cms/src/settings/settings.ts:103-108`). They're saved but never rendered.
- **Media work:** `render.ts`, `pages.ts`, `resolver-service.ts`, `media-repo.sqlite.ts` and ~15 more files carry someone else's uncommitted media work. **The owner said to leave it uncommitted.** Commit only your own hunks, with context-anchored patches (`--unidiff-zero` broke `pages.ts` once).

## Landed today in this session (all verified)

**Desktop**
- Coverage floors re-cut by role: `352d76e2`, `45519aeb` (renderer funcs floor 66).
- Min width 480: `eb6f8241`.
- Orphaned `tovu serve` on SIGTERM: `1c5d9f72`, `d1772c82` (every quit held during drain).
- `lucide-react` excluded from the payload: `c8824fa6`.
- Grayed-out Marketplace nav item: `2c832694`.
- Tasks hidden from the nav (id kept, it's a contract): `0393f2ce`.

**Theme reset**
- Modified detection: `acfdedad`, `8f0fe76c`.
- Byte-exact reset: `5bc04b8e`.
- Refresh after save/reset: `b68cad83`.
- Never save an unloaded buffer: `12232a2b`, `fb6f62b8`.

**Jini**
- Icons vendored, lucide dropped: `1e46cfe2`.
- `@jini-ai/ui` and `@jini-ai/admin` 0.3.8 **published**: `1bad8ad6`, `c5583eba`.
- `.map` files excluded from all 24 package tarballs from the next release: `c90a1da2`. Branch `general-work`, not pushed.

**Docs**
- Register O6: `63deed09`.
- Memory store: 366 filenames shortened; backup in `ADS-memory/.local-artifacts/memory-backup-2026-09-12-prerename/`.
- Card preview verified working at runtime.

## Open worklist

1. **Finish SPEC-050 Step 2**, then a Sonnet verification: tests plus a mutation check.
2. **Clean repackage and real app size.** Projected ~544 MB minus lucide, but never measured. This needs a quiet tree, so the owner must stop the desktop app.
   - `cd apps/admin && npx vite build`. Admin changed since the last build. Never `npm run admin:build` or `unlink:jini`.
   - `npm install` `@electron/asar` ^3.4.1 and `@types/node` as desktop devDependencies.
   - Stage, then `electron-builder`, then `verify-package`. Record `checkedCount`.
3. **Desktop → TypeScript**, Phases 2-5. Plan: `ADS-memory/reports/2026-09-12-desktop-typescript-migration-plan.md`.
   - Phase 0/1 done. The rewrite goes to Opus.
   - Phase 3 is the atomic rename. It needs the owner's OK to restart, and follows the restart order in the plan.
   - **The plan needs an update batch** (Sonnet) for commits it doesn't list yet: `2c832694`, `0393f2ce`.
4. **Architecture + coverage sweep** (Sonnet), after the TS rewrite. Includes the "no state/hooks in .tsx" check.
5. **Jini `chat` 0.3.8 is ON HOLD.**
   - Its dist contains someone's uncommitted `run.reattach` effect in `useConversation`.
   - `packages/chat/package.json` has a 0.3.8 bump, uncommitted.
   - `sqlite` needs a re-release after chat.
   - `agentic`/`core`/`devops`/`mcp` have other people's pending version bumps, uncommitted.
6. **Publishing blocker.** The auto-mode classifier blocks `pnpm publish` from Claude, even with a matching allow rule ("Create Public Surface"). The owner runs `! cd …/packages/<pkg> && pnpm publish --no-git-checks --access public`. Two untested alternatives: `autoMode.allow` in `~/.claude/settings.json`, or permission mode → default in `/config`.
7. **Small items:**
   - The site window (`createWindow()`) still has no `minWidth`.
   - The quit deadline is double-armed on the signal path (harmless).
   - Theme copy/rename still has a 1 MB cap.
   - Server PUT `/file` can overwrite a large file (by design?).
   - `coverage-floors.js` says "18 .ts files" (it's 21), and a test title is stale.
8. **Uncommitted docs:** `ADS-memory/reports/2026-09-12-desktop-typescript-migration-plan.md` edits and this handoff.

## Mistakes logged today

- `ADS-memory/knowledge/mistakes/2026-09-12-dispatch-omitted-pgrep-fl-ban.md`. A subagent leaked `NVIDIA_API_KEY` and `CLAUDE_CODE_MESSAGING_TOKEN`; the owner was told to rotate both.
- `ADS-memory/knowledge/mistakes/2026-09-12-publish-denial-cause-misdiagnosed.md`
