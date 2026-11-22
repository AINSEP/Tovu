# P1 · Editors and forms

**Bases (all pins checked on these):** Tovu `origin/integ/merge-12-2026-11-22` `41e948ee4` (content tip `748c032db`), Jini `origin/integ/merge-12-2026-11-22` `6b8e0d48a`. Paths: `W/` = Tovu `apps/website/src/`, `A/` = Tovu `apps/admin/src/`, `J/` = Jini `packages/`.
**Lead inputs:** `inputs/r62t-left.md` L1-J, L1-T, L9, L10; `inputs/r62t-howto.md` G16/N3, incident 2; `inputs/r62t-bugs3.md` §4 (B1 rendered-only embeds); combine-12 Tovu bug 5.
**Owner rules for every step:** keep it simple; plain words, no generic errors; custom hooks injected as props (`check:hooks` gate); never remove/rename `_optional = {}` pads or change the args rule; functions 50 warn / 80 error; complexity ≤ 10; never delete why-comments; Jini vendor- and server-framework-neutral; no package above domains; the fix must work for every agent CLI (Claude, Codex, agy).

## Goal
1. An open Form editor picks up assistant changes, and a stale definition Save is refused instead of silently overwriting (owner 11-21 ~7:05 PM).
2. One-click Undo for assistant HTML page edits (full write, section write, section move), refused after an intervening human edit.
3. Page Preview shows the "Watch on YouTube" fallback also for videos that only a template or widget renders.
4. A failed `assistant_ask_choice` row says plain words, not a raw JSON-schema error.
5. Jini ResourceBoard card menu focus (open → first item; Escape → back to its trigger).
6. The new "Load latest" buttons get agent handles like their siblings.

## Current state (verified)
- **Forms, Jini.** `J/admin/src/core/ports/forms.ts:106` `AdminFormDefinition` and `:154` `AdminFormUpdatePatch` carry no version. `forms/adapters/memory.ts` (105 lines), `forms/adapters/http.ts` (62). The editor: `forms/react/hooks/use-form-editor.hooks.ts:128` `useFormEditor`, `:177` `useWiredFormEditor`; `use-form-editor-parts.hooks.ts:44` `useFormEditorQueries`, `:54` `useFormEditorSeed` (seeds once per route), `:76` `useFormEditorMutations`. The list already subscribes to the scoped refresh event: `use-forms-list.hooks.ts:78–88` (`events?.subscribe({ onRefresh })`) and `:183–185` (wired `formsEvents`). The editor does not subscribe. `forms.module.ts:7` registers `formsEvents` as an optional port.
- **Forms, Tovu.** `W/server/inbound/admin-http/routes/forms/update.ts` applies the legacy partial field patch and the `status` toggle (`:35–66`; status branch `:51–54`); no `expectedVersion`. The authoring route already parses it (`routes/forms/authoring.ts:43,53`). `W/features/forms/index.ts:122` `updateFormDefinition({ deps, input }, { expectedVersion })` already supports the conditional write. OpenAPI: `openapi/010-forms.yaml:58` (`put:`; the lead said `:45`). Witness file exists: `W/features/forms/__tests__/lost-update-boundaries.test.ts`.
- **Page HTML undo.** Admin page saves go through `executeCommand` with `changeSets` (`W/server/inbound/admin-http/routes/pages/update.ts:145–160`, mutation `updatePageMutation` `:177`), whose inverse captures `bodyJson` only (`:192–200`). The post reverter restores title/slug/bodyJson/status/ext (`W/features/post/reverters.ts:146–201`) and never `body_html`. The assistant's HTML tools (`W/features/pages/tool-registrations.ts:713–720`: `pages_write_html`, `pages_write_region`, `pages_move_region`) write through `PagesHtmlDocumentStore` (`W/features/pages/html-document-store.ts:229`) and append a `post_revisions` row (`:479–505`) but never record a change set, so `change_sets_revert` cannot undo them. Jini's revert already refuses a stale entity by strict version equality (`J/cms/src/core/commands/revert.ts:234–260`), which gives "refuse after an intervening human edit" for free once the write is recorded. The W11 wording ("Undo a matching recorded change…") is already in `W/features/change-sets/agent-tools.ts:90–103`.
- **YouTube Preview.** Page-owned embeds are done (tv-bugs3b): `A/features/pages/lib/page-preview-youtube.ts:1` `pagePreviewYoutubeIds({ html, bodyJson })`, used at `A/features/pages/PageEditor.tsx:1265`; "Watch on YouTube" is translated in `page-editor-i18n.ts`. A player that only the template/widget renders is invisible to that helper. The preview HTML is served by `W/server/inbound/admin-http/routes/posts/template-preview.ts:180–244` (GET `:237`, POST `:244`) as a real URL with `Content-Security-Policy: sandbox …` (`:178,221`), so the admin cannot read the rendered HTML.
- **Choice failure row.** `J/chat/src/react/components/ToolCard.tsx:64` `ToolCard` (hook injected via `useToolRendererRegistryHook`), the generic fallback card at `:390–400` ("a card tool such as `assistant_ask_choice`"), `ExpandableCard` `:413`, collapsed reader `:433–437`. Redaction path `J/chat/src/core/tool-call-detail.ts:48` `describeToolCallDetail`, `:74` `describeCollapsedToolCall`; normalization `core/tool-presentation.ts:11`. Bug C130 (OPEN).
- **Resource menu.** `J/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:17` `ResourceCardMenuItems`, `ResourceCardMenu` below it; `react/hooks/useResourceBoard.ts:175` `useBoardMenu`. Bug C107 (OPEN). Not mounted in Tovu today.
- **Load latest handles.** `A/features/posts/editor/notices/PostVersionConflictBanner.tsx:42` and `A/features/pages/PageEditor.tsx:409` render `Load latest` with no `agentHandle(...)`; siblings use `post-version-conflict-overwrite`/`-dismiss` and `page-version-conflict-overwrite`/`-dismiss`; the external-change banner already uses `page-external-change-load-latest` (`PageEditor.tsx:496–499`).

## Steps

### P1-J1 · Jini · form definition versions + editor refresh (~2 h)
Files: `J/admin/src/core/ports/forms.ts` (`AdminFormDefinition.version?: number`, `AdminFormUpdatePatch.expectedVersion?: number`), `forms/adapters/memory.ts` (versioned write; plain typed `VERSION_CONFLICT`; precondition never stored), `forms/react/hooks/use-form-editor.hooks.ts` (`useFormEditor` takes optional `events?: FormsEventsPort` in its deps object; `useWiredFormEditor` passes `formsEvents` from `useFormsPorts()` exactly like `use-forms-list.hooks.ts:183–185`), `use-form-editor-parts.hooks.ts` (replace once-per-route seed with apply-or-prompt; send the **applied** version on definition Save; status action still sends `{ status }` only), `react/pages/FormEditor.tsx` (Reload form prompt with discard confirm, existing dialog pattern), `forms/messages.en.ts` (keys below).
Rules from L1-J kept: clean editor applies a newer read; dirty editor keeps its draft and base version and offers **Reload form**; ignore late results for another form and results arriving during save/toggle; omit `expectedVersion` when the read had no version (old hosts); a status response that carries a definition changed elsewhere goes through the same compare.
**Tests first** (`forms/react/__tests__/FormEditor.unit.test.tsx`, a new `use-form-editor.refresh.unit.test.tsx`, `forms/__tests__/forms-api.conformance.test.ts`, `memory-adapter.unit.test.ts`):
- `clean editor re-reads on the forms refresh event and shows the assistant's change` — red: editor never subscribes.
- `dirty editor keeps the draft, Save sends the version it was based on, and the stale save shows the reload notice` — red: no version sent.
- `late result for the previous form is ignored after switching forms`; `status response with an independently changed definition does not advance the draft version`; `legacy read without version saves without expectedVersion`.
- conformance: `memory adapter refuses a stale expectedVersion with VERSION_CONFLICT and stores no precondition`.
Mutations: remove the subscribe; seed every same-form result; adopt the status response's version while keeping the old baseline.
i18n (`forms/messages.en.ts`, host supplies other locales): `"This form changed since you opened it. Reload it to see the latest version."`, `"Reload form"`, `"Reloading discards your unsaved changes."`.
API baseline: additive `AdminFormDefinition.version`, `AdminFormUpdatePatch.expectedVersion` (`pnpm api:update` in the combine, not by the implementer). No catalog delta.
STOP if the draft and the version sent on Save can come from different reads, or if a route switch can apply the previous form's result.

### P1-T1 · Tovu · version-checked ordinary form PUT (~1.5 h; after P1-J1 contract is pinned, can run in parallel with it)
Files: `W/server/inbound/admin-http/routes/forms/update.ts` (parse `expectedVersion` with the same helper as `authoring.ts:43`; pass it to `updateFormDefinition` at `W/features/forms/index.ts:122`; refuse a versioned request that also has `status`, or has no definition fields, with a plain 400 **before** any write), `openapi/010-forms.yaml:58` (optional `expectedVersion`, 400/409), Tovu forms dictionary for the three P1-J1 keys in all admin locales.
Error words: 409 → "This form changed since you opened it. Reload it before saving."; 400 mixed → "Save the form and change its status as two separate actions."
**Tests first** in `W/features/forms/__tests__/lost-update-boundaries.test.ts`: `ordinary PUT with a stale expectedVersion is refused with 409 and changes no row and no outbox`, `fresh expectedVersion saves`, `versioned PUT with status is refused before either write`, `malformed version is a 400`, `legacy unversioned field patch, status-only and mixed requests behave as before`. Red now: route ignores the field.
Mutation: drop `expectedVersion` from the `updateFormDefinition` call.
STOP if the check happens only in a route pre-read, or a refused definition save can still flip status.

### P1-T2 · Tovu · scoped undo for assistant HTML page edits (~2 h)
Design (simplest that reuses what exists): record each successful `pages_write_html` / `pages_write_region` / `pages_move_region` as one change set through the same `executeCommand` gateway the admin route uses, with a new entity type `page-html` whose inverse is `{ html, format }` of the row before the write, and a new reverter that writes the inverse back through `PagesHtmlDocumentStore` with `expectedVersion` = the version the change set recorded. Jini's revert version guard (`revert.ts:234–260`) then refuses when a human saved in between, with no new logic.
Files: `W/features/pages/tool-registrations.ts` (wrap the three handlers; keep `toModelFacingWriteError` and `withModelFacingErrors` as they are; add `changeSets`, `clock`, `idGen`, `outbox`, `authorize` to `PagesToolDeps` at `:392` only if not reachable — check `routeDeps` first), new `W/features/pages/html-reverter.ts` `createPageHtmlReverter({ store }, _optional = {})`, registration next to `createPostRevertRegistry` (`W/features/post/reverters.ts:326`), composition where the post revert registry is built (`grep createPostRevertRegistry W/server/runtime/composition`). Return `changeSetId` in the tool result so the assistant can say "I can undo this."
**Tests first:** new `W/features/pages/__tests__/html-undo.integration.test.ts`: `an assistant full write records a change set and change_sets_revert restores the earlier HTML`, `a section write and a section move each revert to the exact prior HTML`, `revert after a human save is refused with the version message and keeps the newer HTML`, `a refused write records no change set`. Red now: no change set is recorded. Extend `change-sets` catalog test: undo wording only promises a recorded change.
Mutations: skip recording for `pages_move_region`; restore the inverse without `expectedVersion`.
No i18n (tool text is English model guidance). Catalog delta: `pages_*` result gains `changeSetId` → re-record `moved-tools.golden.test.ts` bytes per the `c4b928926` precedent.
STOP if `executeCommand` cannot wrap the store write without splitting the store's own transaction (`html-document-store.ts:272–279`) — report the exact seam instead of adding a second transaction.

### P1-T3 · Tovu · "Watch on YouTube" for template/widget-only embeds (~1.5 h; owner 11-21 1:50 PM: link fallback first)
Add a sibling read-only JSON route that renders exactly what the preview renders and returns only validated IDs: `POST /api/admin/posts/template-preview/embeds` → `{ youtubeIds: string[] }` (11-char IDs from `youtube.com`/`youtube-nocookie.com`/`youtu.be` iframe `src` only). Reuse the render path in `template-preview.ts:180–244` (extract the shared render into one function both handlers call; do not grow the handler). Admin: `PagePreview` (`A/features/pages/PageEditor.tsx:1212`) unions page-owned IDs with the route's IDs through an **injected** hook prop (`usePreviewEmbedIds`) and renders the existing link list. No sandbox/CSP change.
**Tests first:** website `template-preview-embeds.test.ts`: `a template-rendered youtube-nocookie iframe yields its id`, `a deceptive host and a non-YouTube iframe yield nothing`, `same auth as the preview route`. Admin `PageEditor.preview-youtube.unit.test.tsx`: `a template-only video shows Watch on YouTube`. Red now: route does not exist.
Mutation: accept host substrings (`youtube.com.evil.test`).
i18n: none new ("Watch on YouTube" exists in all locales).
STOP if the reproducing video comes from a runtime script (not an iframe in rendered HTML) — report it; do not execute scripts server-side.

### P1-J2 · Jini · failed `assistant_ask_choice` row in plain words (~1.5 h)
As lead L10: classify the exact choice tool (bare, MCP-qualified, normalized wrapper via `core/tool-presentation.ts:11`) **before** any renderer; failed result → small row in `ExpandableCard` with "The assistant couldn't open the choice form. Ask it to try again." and **Copy details**; header, collapsed reader, badge, title and accessible text get only the safe text; Copy uses `describeToolCallDetail` redaction and an injected `useCopyToClipboardHook` prop (default the existing hook). Pending/success paths unchanged.
**Tests first** (`J/chat/src/react/components/__tests__/ToolCard.test.tsx`): `a failed bare and MCP-qualified assistant_ask_choice shows the plain sentence collapsed and expanded`, `no schema text in title or accessible description`, `Copy details copies the redacted detail without the secret canary`, existing `WebFetch` error case stays. Red now: raw schema error shown.
Mutations: pass the original result to the collapsed reader; copy unredacted `result.content`.
i18n: two translator keys via the chat adapter (`chat.toolCard.choiceFailed`, `chat.toolCard.copyDetails`), English defaults. STOP if the fix depends on one CLI's schema-error wording.

### P1-J3 · Jini · ResourceBoard menu focus (~1 h)
As lead L9: first enabled item gets focus on open (local ref); none enabled → focus stays on trigger; `useBoardMenu` (`useResourceBoard.ts:175`) focuses the trigger inside `menuContainerRef` on Escape before clearing; outside click does not steal focus.
**Tests first:** `ResourceCard.test.tsx` `opening by click or keyboard focuses the first enabled item`; `ResourceBoard.test.tsx` `Escape returns focus to the exact trigger after opening a second card's menu`, `outside click keeps focus on the clicked control`. Mutations: remove mount focus; remove Escape restore. No i18n/API delta.

### P1-T4 · Tovu · agent handles on Load latest (~0.5 h)
`PostVersionConflictBanner.tsx:42` → `agentHandle({ handle: "post-version-conflict-load-latest" }, { role: "button", label: "Load latest version, discarding my unsaved edits" })`; `PageEditor.tsx:409` → `page-version-conflict-load-latest`, same label.
**Tests first:** extend the two banner unit tests: `Load latest carries data-agent-element, role and label` (red now). Mutation: drop the spread on one banner. Note `PageEditor.tsx` is over the size baseline (1015 lines, combine-12 decision 1): this edit adds no lines (attribute spread on an existing element is +4; keep it ≤ the "Worsened" row or batch with P7-T1's split).

## Chrome / Electron owed (after combine)
Form editor: open a form, have the assistant edit it → clean editor updates; dirty editor shows Reload form. Page: assistant edits a section → "undo that" reverts; make a human save first → undo refused in plain words. Preview with a template-only video shows the link. Admin chat: a broken choice tool row reads plainly; Copy details works. Banner buttons reachable by the assistant.

## Dependencies and parallel batches
- Batch A (parallel): P1-J1, P1-J2, P1-J3 (Jini, different packages).
- Batch B (parallel, after P1-J1's port shape is pinned): P1-T1, P1-T2, P1-T3, P1-T4. P1-T1's editor rollout needs a Jini release with P1-J1 (see P7-J1); the server side can land first because unversioned PUT stays legal.
- P1-T2 and P1-T3 both touch admin `PageEditor.tsx` only in P1-T3; P1-T4 also touches it → run P1-T3 then P1-T4 in one implementer if batched.

## Estimate
~10 implementer-hours (J1 2, J2 1.5, J3 1, T1 1.5, T2 2, T3 1.5, T4 0.5).
