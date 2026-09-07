# Outstanding worklist — session `tovu-f6`, 2026-09-06

Everything raised tonight that is **not finished**. Written for a successor session. Items marked
IN FLIGHT had an agent running when this was written — check `git log` before assuming state.

---

## A. Chat attachments / the AVIF story

The original request — *"add this AVIF to my media library"* — **now works**: the file is in the
library as `ai-caps` (`dffa3db6-51fc-4abe-9dc3-041fd00d41e2`), served as
`/m/dffa3db6-.../public.v1/image.webp`. Everything below is what is still open around it.

1. **`detectAttachmentKind` does not sniff AVIF.** `Jini/packages/http-kit/src/attachments.ts` sniffs
   only PNG/JPEG/GIF/WEBP, so a real AVIF upload is classified `kind: 'file'`. The preview modal
   works around it by also checking the file extension. **The sniffer itself is still wrong.**
   Related, already fixed: AVIF and MP4 share the ISO-BMFF `ftyp` tag, which made the *media*
   sniffer call her image `video/mp4` (Jini `670e45ea`, Tovu `04806e6b`).

2. **The AVIF image preview was never verified rendering in a real browser.** The modal ships
   (Jini `f0210b05`) and its jsdom tests pass, but the only screenshot we have is the honest
   metadata fallback. The agent's tab was hijacked twice mid-verification. **Verify in Claude in
   Chrome, not Playwright.**

3. **No HTTP route serves chat attachments back.** Bytes sit at
   `sites/tovu-com/uploads/chat-attachments/<batch>/<file>` with no read-back endpoint. Consequence:
   the preview modal can only show attachments from the *current* session (via a client-side File
   cache keyed by upload path, `attachment-preview-cache.ts`). Anything from an earlier turn or after
   a reload can never be previewed. **Not built.**

4. **DATA LOSS: the attachment upload directory is wiped on every daemon construction.**
   `createDiskAttachmentStore` empties it unconditionally. Its own doc justifies this as crash
   recovery, but it never distinguishes a crash from a clean restart. The agent daemon is started
   from inside `apps/website/src/index.ts`'s `listen()` callback — tsx-watch's entry point — so
   **any save anywhere in `apps/website/src` silently erases every unclaimed attachment.** This is
   what destroyed Leona's original `4e0b5ff5-...` upload. It also undercuts
   `chat_list_pending_attachments`, which can only list what is still in memory.
   Suggested fix: persist attachment records (SQLite), or wipe only on a detected unclean shutdown.
   **Not fixed. Deserves its own ticket.**

5. **`chat_list_pending_attachments` end-to-end was never run.** Code is committed (Jini `b5be630e`,
   Tovu `feb8a777`) with unit tests, but the real path — fresh upload → list → promote → confirm
   content type — has never executed. The agent could not authenticate as the site owner and
   correctly refused to guess credentials. **Leona can run this herself in her chat**, or it needs a
   Chrome-driven run against her real session.

6. **Cross-conversation scoping is a deliberate widening, not narrowed.**
   `chat_list_pending_attachments` scopes by admin account, **not by conversation** — an attachment
   pending in one chat thread is listable and promotable from another. Judged an accepted widening
   of the pre-existing capability-bearer model. Recorded here so it is a decision, not a surprise.

---

## B. SEO

7. **The override restore was never completed.** `eb10f5de` shipped the real capability (a `null`
   patch value now clears a key back to absent, matching the convention `settings.ts` already uses;
   an empty merge result collapses to `seoExtJson: null`). But post
   `8ab0d36b-156b-4efa-9f67-c13381abb236` (`untitled-25`) **still reads `{"description":""}`, now at
   version 4.** Original state was `NULL`/version 1. Two agents were blocked from finishing it: one
   by a Bash classifier denial on the direct SQL, one by being stopped. Finish it **through the
   shipped tool**, not raw SQL.

All six SEO agent tools were verified working at runtime through the real assistant
(`seo_get_settings`, `seo_get_entry_meta`, `seo_analyze_entry`, `seo_set_entry_overrides`,
`seo_set_settings`, `seo_regenerate_sitemap`). The per-entry editor and entry picker are now tagged
(`7198436e`).

---

## C. Admin — content authoring

8. **The Pages editor cannot write HTML into a newly created page.** `New Page` creates a
   `doc`-format row, and `buildPageSavePlan` (`apps/admin/src/features/pages/rules.ts:196`) only
   sends HTML when the row is *already* `html`. **Confirmed independently by two agents**, both of
   which had to route the body through `PUT /api/admin/v1/workspaces/workspace-local/pages/:id/html`
   — the same endpoint the editor's own Save uses. Means you cannot hand-author HTML into a new page
   through the product. **Not fixed.**

9. **`PageEditor`'s top-level function is at cognitive complexity 10, ceiling is 9.** Pre-existing on
   the committed baseline, confirmed by linting the pre-edit version. **Not fixed.**

10. **`updatePost` has no optimistic-concurrency check for doc-format saves.** Two operators editing
    the same post silently clobber each other on the live document — no version compare, no warning,
    last write wins. Pre-existing, unrelated to autosave. **Own ticket.**

---

## D. Agent-element tagging (`agentHandle`)

Largely done — ~30 screens across two sweeps. What remains:

11. **Settings tabs.** IN FLIGHT (`jini-ui-agent-handles`). 11 of 13 tabs mount `@jini-ai/ui`
    components that accept no `agentHandle` prop at all. Requires an additive, non-breaking change to
    `@jini-ai/ui` — which **Zana also consumes via `link:`** — plus passing the handles from the Tovu
    side. Both halves or it is worthless.

12. **A misattribution note was never written.** Commit `f3579456` contains ~15 `agentHandle`
    additions authored by a *different* agent plus 3 of its own, committed under one name after one
    agent absorbed another's uncommitted work. Nothing is lost and the code is correct, but the
    history is wrong and the note I asked for never landed — I stopped the agent first. **Add a line
    to `ADS-memory/reports/2026-09-06-admin-agent-tag-coverage.md`.** Do not rewrite shared history;
    other commits sit on top.

---

## E. Desktop app

13. **Seed the Projects screen from the repo's `sites/`.** IN FLIGHT (`desktop-seed-sites`). The
    Projects screen renders only from `desktop-projects.json` in Electron's `userData`, which does
    not exist, so the screen is empty. `main.cjs:587` already carries
    `devFallbackDir: <repo>/sites/tovu-com` but it feeds the boot path, not the Projects screen —
    a gap left when the Projects front page became the default (`a53c80df`).

14. **Unify the site-adoption arms.** QUEUED behind item 13, same agent, same files.
    `resolveSiteDir`'s first branch is `if (envDir) return envDir`, so the path never reaches
    `adoptSiteDir`; `TOVU_DESKTOP_SITE_DIRS` bypasses it the same way. Either env var pointed at an
    empty folder dies `SITE_DIR_INVALID` with no window. **Leona's ruling: do the structural fix, not
    either quick option** — one shared adoption chokepoint with an explicit per-entry-point policy,
    so picker / env-single / env-multi / CLI cannot diverge again. Un-RED the E2E test and cover
    every arm.

15. **The desktop E2E suite has never been run in this session.** "5 pass / 1 documented red" is
    another session's claim. The RED one is verified from source; the passes are not.

16. **Electron's `app.getPath("userData")` ignores a `HOME` override on macOS.** Every "isolated"
    E2E launch reads and writes the real `~/Library/Application Support/tovu-desktop/`; stray
    `tovu-desktop-e2e-*` entries are already in there. Nothing has failed yet only because the specs
    pin their site dir explicitly. Real fix is `app.setPath("userData", ...)` behind an E2E-only env
    var. **Own ticket.**

---

## F. Landing pages

17. **Four draft variants exist; none chosen, none published.** `landing-a1`, `landing-a2`,
    `landing-b1`, `landing-b2` — all `kind=page`, `status=draft`, `body_format=html`,
    `template_choice=pages-default.html`, in `workspace-local`. Hero copy and the two-column video
    slot are per brief; gold is a single `--accent: #f8b838` token per file. **Drafts 404 publicly**,
    so they can only be seen through the editor unless one is published. The video slot is a
    placeholder awaiting Leona's video.

---

## G. Process

18. **Switch visual verification to Claude in Chrome.** Leona's call, already made. The shared
    Playwright browser was hijacked **four times** tonight — one agent's `navigate` moved another's
    tab mid-measurement, and one screenshot captured the wrong tab entirely. Chrome also uses her
    real signed-in session, which removes the login wall that blocked item 5. Future dispatches
    should specify Chrome for "look at it and tell me if it's right" work, keeping Playwright for
    scripted, repeatable assertions.

19. **`MEMORY.md` is 20.4KB against a 17.1KB target.** Compaction was started and interrupted;
    it still loads (limit is 24.4KB) but should be finished.

---

## Verified working, for the record — do not redo

- The attachment→media bridge (`media_promote_chat_attachment`), generic across content types,
  delegating to `media_upload_asset`'s own handler so it shares one validation/rendition gate.
- Autosave standing drafts, both editors: type → reload → banner → Restore returns the work.
  A real data-loss bug was found and fixed on the way (`10efb899`): the flush half was never
  implemented and unmount *cancelled* the pending write, so work inside the debounce window was
  silently discarded on navigate-away.
- The mic button now sits next to the `+` in the composer footer.
- The attachment preview modal opens with X / Escape / backdrop close and correct ARIA.
- All six SEO tools, driven live.
