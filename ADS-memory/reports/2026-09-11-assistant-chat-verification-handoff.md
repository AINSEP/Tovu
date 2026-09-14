# Handoff — verify today's work from the assistant chat

**Status: NOT STARTED. Do not begin until the owner says so.** She wants `generic-media-node`
finished and a review of what did and did not land first. This note exists so the next session
starts from fact rather than re-deriving it.

**Everything below is UNCOMMITTED in the working tree** on `restructure/apps-website-phased`.
Nothing has been committed all session. The tree is shared with other sessions that have their own
uncommitted work — check `git status` before assuming a change is yours.

## The test, in one line

Drive the Tovu assistant chat as a user and confirm the capabilities added today actually **show up
and work in chat** — not just in tests.

## Preconditions before testing

1. **Restart the API/daemon** so the daemon picks up today's source changes. A save under
   `apps/website/src` restarts it anyway (~3s), and it is a child of the tsx-watch API.
2. **Do NOT rebuild Jini** without the owner's explicit go-ahead. See "Known dead" below.
3. Do not edit `apps/website/src` or `apps/admin/src` while she is mid-chat — a save destroys a live
   run. That is a real source of false "it's broken" results.

## What to verify in chat

- **Post images.** Ask the assistant to put a media-library image into a post. It should author an
  `image` node (ref-based: `assetId` + `transformName: "public"`) and NOT claim it is impossible.
  That false refusal is the bug this fixes.
- **The wider node vocabulary.** Tables, task lists, `mention`, `youtube`, `hardBreak`, plus
  `textAlign` on paragraph/heading and `language` on codeBlock — all were previously either
  undocumented or actively blocked by `additionalProperties: false`.
- **Marks.** The schema went from 4 to all 10 the renderer honours (adds strike, underline,
  subscript, superscript, textStyle, highlight). Note `color` means different things on `textStyle`
  vs `highlight`.
- **Generic `media` node — LANDED.** `attrs: {assetId, transformName: "public", alt?}`, ref-only, no
  `src` field. `renderDocMedia` dispatches on the asset's content type: `video/*` → `renderVideoTag`,
  otherwise it reuses `tryRenderRefImage` — the same function the `image` node uses, so no duplicated
  render path. Content type reaches the doc path via `MediaContentTypeStorePort`, which the route
  deps already carried unused; `MediaAssetRenderMeta` gained `contentType: string | null`.
  **`image` still exists and still works** — the editor's "Insert image by URL" and all legacy
  content are untouched. But `EmbedInsertControl`'s Media button, drag-drop and paste were all
  redirected to insert `media`, so a dropped video now plays instead of becoming a broken `<img>`.
  So the `image`-vs-`media` question resolved as "both, `media` preferred for new content" rather
  than the single-node outcome that was proposed — worth a second look if that bothers the owner.
  Test: ask the assistant to put a VIDEO from the media library into a post.
- **External MCP / Higgsfield cold start.** Delete the `external_mcp_servers` row and redo it from
  chat. Expect: no Client ID prompt, no "Sign-in method" prompt, and — because of federation
  hot-reload — **no restart banner**. Tools should light up mid-run after sign-in. That last part has
  only unit/route coverage; this is its first real-world test.
- **Media ordering.** Newest-first in the admin grid, plus an "Order by" dropdown
  (Created / Alphabetical).

## Known dead — do not report these as new bugs

- **`reattach()` still does nothing.** The Tovu half (durable run stub) shipped; the Jini half is
  written and unit-tested but **deliberately unbuilt**. Until `Jini/packages/chat` is rebuilt, a
  dropped browser subscription still looks like a frozen chat. The owner hit this three times today.
  The rebuild is gated on her because Jini's tree carries other sessions' uncommitted work across
  `admin`, `agentic`, `core`, `devops`, `mcp`, `server`, `vibecoding` and `ChatPane.tsx` — a rebuild
  compiles all of it, not just the reattach change.
- **`media_list_assets` has no ordering.** The sort is client-side in admin only. The tool lives in
  `@jini-ai/cms` (separate repo, built `dist/`), so the agent-facing arm is unfixed.
- **Collection entries have no public rendering path at all.** Authored, published, invisible to
  visitors, sitemap and `llms.txt`. The `recent-entries` widget emits dead-ended slugs today. This is
  the worst gap found and it is untouched.
- **Audio is unbuilt** end to end — not even in the server upload MIME allowlist.
- **BYOK `reattachRun`** answers `onDone([])` unconditionally (pre-existing). Reattach will clear the
  stub rather than resume on that path.
- 5 pre-existing failures in `external-mcp-repo.sqlite.test.ts` (fixtures missing `aadVersion`).

## Fixed late, worth knowing

`apps/website/src/assistant/__tests__/tool-registrations.post.test.ts:208` was a **fake gate** — its
name claimed it checked the published schema against "every renderDocNode node type", but the
assertion was a hand-copied list of eight literals that never read `DOC_NODE_HANDLERS`. It sat green
beside the exact gap that made the assistant refuse to place an image. It now derives from the
handler map (13 block-level types required, verified non-vacuous) and is 38/38. If you find another
test whose NAME promises coverage its assertion does not provide, treat that as the same class.

## Open decisions for the owner

1. When to rebuild `Jini/packages/chat` — the only thing that makes `reattach()` live.
2. `image` vs `media` node: one authored type with `image` as a legacy alias, or two.
3. A `renderUnknownNode` signal — the fallback exists (`render.ts:1326`, renders children silently);
   what is missing is a marker/log so unknown types are discoverable instead of silently degraded.
   Agreed as a good idea, not dispatched. Note a generic "render anything" is NOT safe: unknown attrs
   are untrusted author/agent input, so it can only degrade predictably and signal, never improvise.
6. Whether `image` should become a legacy alias now that `media` exists, or stay a peer node.
4. `createdBy` / media provenance — deferred; issues written up in `development/todos.md`.
5. Whether collection entries are a product being kept.

## Reports from today

`ADS-memory/reports/` — `2026-09-11-chat-stack-recon-sonnet.md`,
`2026-09-11-chat-stack-recon-codex-terra.md`, `2026-09-11-ask-choice-render-trace.md`,
`2026-09-11-content-capability-gap-audit.md`, `2026-09-11-wire-reattach.md`.

## Traps that cost time today

- A save under `apps/website/src` kills the agent daemon; under `apps/admin/src` it destroys a live
  chat run. Several "frozen chat" reports were this.
- Admin tests run from `apps/admin` (vitest); website tests from the repo ROOT (`node --test`).
  Admin `tsc` DOES typecheck tests and its baseline is zero.
- Admin media route tests need `env -u TOVU_ADMIN_PASSWORD` — unset, not empty, or they 401.
- `SendMessage` to a busy subagent silently fails to deliver. Confirm receipt; do not assume silence
  means refusal.
