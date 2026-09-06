# Handoff — mic button + the AVIF upload bridge

From `tovu-72` (coordinating in this repo, branch `restructure/apps-website-phased`). Two tasks from Leona.

---

## Task 1 — move the mic button next to the plus sign

In the assistant chat composer the mic button currently floats **above** the composer, top-left, half-overlapping the input's top edge — it reads as a stray circular badge rather than part of the control row. Leona wants it **in the bottom action row, next to the `+`**, with the other composer controls.

Her words: *"can you move the the mic button next to the plus sign? rather than having it be on top?"*

The composer is Jini's ChatPane. **It has TWO stylesheet mechanisms** — establish which one owns the mic's positioning before changing anything. Jini is at `/Users/la/Programming/Jini`; Tovu's `node_modules/@jini-ai/*` are **symlinks** into that checkout.

---

## Task 2 — the AVIF upload. Already diagnosed; do not redo the diagnosis

Leona attached `/Users/la/Desktop/ai-caps.avif` in the assistant chat and asked it to add the image to her media library. It failed.

From the real transcript in `sites/tovu-com/chat.db` (`ai_chat_messages`), the assistant named two blockers:

1. AVIF was not an accepted upload type.
2. *"The tool only takes bytes, not a path. `media_upload_asset` requires `dataBase64`. There is no tool that reads a local file (or a chat attachment) off disk and feeds it in."*

### Blocker 1 is FIXED — Jini `670e45ea`, Tovu `04806e6b`

That change also closed something subtler: **AVIF and MP4 share the same ISO-BMFF `ftyp` tag**, so the sniffer identified AVIF as `video/mp4` — and that guess is **persisted** as the image-vs-video source of truth for the admin tabs and `widgets/resolver-service.ts`. Allowing AVIF *without* fixing the sniffer would have made her image render as an unplayable `<video>` on public pages: worse than a clean refusal. Both were fixed and verified by uploading her actual file through the tool.

### Blocker 2 is the live one — a missing capability, not a bug

Confirmed on disk: **her attachment did reach the server.** `sites/tovu-com/uploads/chat-attachments/4e0b5ff5-9aab-4e09-b62d-63d34c412260/` exists, created 14:05.

But `media_upload_asset`'s schema (`Jini/packages/cms/src/media/agent-tools.ts:92-110`) requires `filename` + `contentType` + `dataBase64`, and **nothing bridges an existing chat attachment to it.** The assistant can see the file arrived and has no way to hand it to the media library.

This is the dominant defect shape in this repo: a correct primitive with no wired call site.

**Build the bridge.** Either a tool that promotes a chat attachment into a media asset by id, or let `media_upload_asset` take an attachment reference as an alternative to `dataBase64`. Decide which and say why.

**Do not add a tool that reads arbitrary paths off the user's disk.** That is a capability the assistant should not have.

**Check first:** the **agent daemon is a separate process from the API** and may still hold the pre-fix `@jini-ai/cms` module. The cms dist was rebuilt at 13:30 and the API restarted at 13:53 — but verify the daemon separately before concluding the format fix is live in the chat path.

Ship a RED-first regression test with the bridge.

---

## House rules — these cost real time when skipped

- **RUN NO INSTALLS** in Tovu or Jini. `node_modules/@jini-ai/*` are symlinks, and a second product (Zana) consumes Jini through `link:` entries — an install silently replaces them and breaks that product. **Never `pnpm -r build`** (it flaps the dev API for every session on this machine). Scoped only: `pnpm --filter @jini-ai/<pkg> build`, then a restart to reach Tovu. **Do not restart the dev server without checking** — several sessions are on it.
- **No publishing, no version bumps.** Leona has ruled Jini versions must not be bumped.
- `sites/tovu-com/content.db` is her **real 44 MB database**, not a fixture. **Never run a migration** — they auto-apply and a dry run is not read-only.
- **Use `https://localhost:5173/admin/`, not `:3000`.** The `:3000` hop is HTTP/1.1 (Node crashes with HTTP/2 + SSE open) and Chrome's ~6-connection cap makes the admin hang in a way indistinguishable from a dead backend.
- **Shared git tree with several live agents.** Never `git add -A`; explicit paths only; never bare `git stash`/`git stash pop`; uniquely-named commit-message file with `git commit -F`; no backticks in heredoc commit messages. Commit incrementally.
- **OFF LIMITS:** `apps/admin/src/features/menus/**` (Leona's own uncommitted work); `apps/website/src/server/routes/types.ts`; `apps/website/src/server/runtime/composition/{app,deps}.ts`; `.../modules/assistant-byok.ts`. Also currently owned by other agents: `apps/admin/src/features/seo/**`, `apps/admin/src/features/{pages,posts}/**`, `apps/desktop/**`.
- Never read an exit code through a pipe; `timeout` does not exist on macOS; never `2>/dev/null`; `grep` here is ugrep — it ignores `--include`/`--exclude` and silently skips files containing NUL bytes.
- Scoped test runs only. Three runners: `apps/admin` runs from `apps/admin`, `apps/website` runs from the **repo root**, Jini has its own.
- **Reporting:** only mistakes and things Leona must approve. No progress updates, no completion announcements. Verify a success and stay quiet. She dictates by voice, so resolve garbled proper nouns against repo vocabulary and state your reading.
