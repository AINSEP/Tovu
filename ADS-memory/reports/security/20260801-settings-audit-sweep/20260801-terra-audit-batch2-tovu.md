# Terra audit — batch 2, Tovu (37 files)

Generated: 2026-07-31 ~21:25 local.
Auditor: **`gpt-5.6-terra`, `model_reasoning_effort=xhigh`**, dispatched via `codex exec` as an
external reviewer with no repo instructions loaded (`--ignore-rules --ignore-user-config --ephemeral`).
Packet: `terra-audit-scope/packet-batch2-tovu.md`. Raw: `terra-audit-scope/runs/batch2-tovu.jsonl`.

Run health (checked, not assumed): `"type":"error"` = 0, `turn.failed` = 0, `turn.completed` = 1,
stderr empty. Usage: 3,211,822 input tokens (2,984,960 cached), 17,229 output, 11,691 reasoning.

Scope: the admin UI section components, `apps/admin/src/lib/api.ts`, and the assistant execution
routes — the second batch of least-recently-revisited code on `feat/ai-chat-persistence`.

> **UNVERIFIED.** These are Terra's claims, reproduced verbatim below. Batch 1's verification pass
> killed two of six HIGH findings, so do not fix from this document. Verify each against current
> code first, the way `20260801-terra-high-findings-verification.md` did.

## Coordinator note on finding 1

This is very likely the **same defect** batch 1 reported in Jini
(`agent-runtime/src/providers/connection-test.ts:349`), seen from the Tovu route boundary rather than
the library. That one was verified CONFIRMED but severity-overstated: the key is the caller's own,
supplied to test their own endpoint, so exposure is to logs and rendered error text rather than to a
third party. Check whether fixing the Jini side closes this one too before writing a second fix.

---

**[SEVERITY: HIGH] Connection probe can return the submitted API key in a 200 response**
- **File:** `src/server/modules/assistant-execution.ts:28`
- **What is wrong:** The registered connection-test route forwards provider detail text. Its runtime redacts non-2xx errors, but an unexpected 2xx completion containing the API key is returned unchanged and displayed by the execution UI.
- **Failure scenario:** Submit `apiKey: "sk-secret"` to a configured OpenAI-compatible endpoint that returns HTTP 200 with `choices[0].message.content = "sk-secret"` → the probe returns `{ok:false,message:'…"sk-secret"'}` → the key is rendered in the admin response/UI.
- **Fix:** Redact `apiKey` at the route response boundary for every provider detail, including 2xx paths; also redact the runtime’s unexpected-success sample before formatting it.

**[SEVERITY: HIGH] Late route loads can overwrite and save a different record**
- **File:** `apps/admin/src/sections/PostEditor.tsx:138`; `apps/admin/src/sections/CollectionEntryEditor.tsx:180`; `apps/admin/src/sections/MenuEditor.tsx:222`; `apps/admin/src/sections/WidgetInstanceEditor.tsx:58`; `apps/admin/src/sections/WidgetRegionEditor.tsx:35`; `apps/admin/src/sections/FormEditor.tsx:280`
- **What is wrong:** These effects accept every response after route props change. A slower request for the previous record can overwrite the fields for the current URL; several save paths then use the current route ID or stale loaded ID.
- **Failure scenario:** Open `/admin/posts/A`, navigate to `/admin/posts/B` before A returns, B loads, then A resolves → the editor displays A’s values at B’s URL → Save updates B with A’s content. The menu, collection, widget, region, and form editors have equivalent cross-record writes.
- **Fix:** Abort or sequence-tag each route load and ignore stale resolutions/finalizers; reset editor state on identity change and disable saving until the loaded record identity matches the current route.

**[SEVERITY: MEDIUM] Existing collection-entry body edits are silently discarded**
- **File:** `apps/admin/src/sections/CollectionEntryEditor.tsx:230`
- **What is wrong:** The edit path sends only `title` and `fieldsJson`; unlike creation, it never sends `editor.getJSON()`. The client API also excludes `bodyJson` from `updateEntry`.
- **Failure scenario:** Edit rich text in an existing collection entry and click Save → “Saved” is shown → reload restores the old body.
- **Fix:** Add `bodyJson` to the update API/server contract and send `bodyJson: editor.getJSON()` for existing entries.

**[SEVERITY: MEDIUM] Widget title edits report success but are never persisted**
- **File:** `apps/admin/src/sections/WidgetInstanceEditor.tsx:95`
- **What is wrong:** The editable title is omitted from `updateWidget`, which sends only `baseVersion` and `config`.
- **Failure scenario:** Rename an existing widget and click Save → success is shown while the server retains the old title; the rename disappears on reload.
- **Fix:** Extend widget updates to accept and persist `title`, pass it from this editor, and replace local title state from the saved response; otherwise make existing titles read-only.

**[SEVERITY: LOW] Dashboard failures leave permanent loading placeholders and unhandled rejections**
- **File:** `apps/admin/src/sections/Dashboard.tsx:11`
- **What is wrong:** Neither initial request has a rejection handler.
- **Failure scenario:** A session expiry or 500 from posts/presentation → browser emits an unhandled rejection and the affected dashboard card remains `…` indefinitely with no error state.
- **Fix:** Catch each request and render an error/retry state.

## Assessed and found clean

- Assistant execution authentication and workspace-scoped authorization
- Command/argument injection and filesystem-path traversal in detect/test-agent
- XSS and unsafe markup/URL rendering in the listed UI
- `api.ts` non-2xx propagation and endpoint workspace scoping