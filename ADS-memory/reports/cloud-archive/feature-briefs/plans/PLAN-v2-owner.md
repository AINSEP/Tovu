# v2 — owner decisions 2026-10-20 (supersede PLAN-trimmed.md where they differ)

1. AUTO PULL: NO interval polling. Pull ONCE at Tovu serving startup and ONCE when an owner/admin signs in to the admin (debounced: at most one in-flight per receiver; skip if the last pull < ~1 min ago). Setting `core.forms/autoPull` default ON, user can turn it off. Manual pull always available (tool + admin button). Shared lease between manual/auto stays. No backoff schedule needed beyond "next trigger".
2. MULTI-DESTINATION: as trimmed plan (receiver + N delivery bindings, per-binding outbox jobs, independent retry/status). Email unchanged in v1.
3. GOOGLE = ONE general "Google" plugin (content/agent-plugins/google), one Google sign-in (Jini OAuth, PKCE, refresh, vault) with INCREMENTAL scopes per product; Sheets is its first product (Drive/Docs/Calendar/Gmail can be added later on the same sign-in). Sign-in can be updated/reconnected/re-scoped (switch account, add a product's scopes, revoke).
4. SHEETS TOOLS: broad — every generally available Sheets API capability: spreadsheet get/create/copy, read ranges (values + batchGet), append, update, batchUpdate values, clear, find/replace, add/rename/delete/duplicate tabs, sort/filter views, basic formatting, named ranges, protected ranges read, export as CSV. Destructive ops (delete tab, clear, overwrite) go through Tovu's confirmation rules.
5. PICK EXISTING SHEET: YES — Google Picker in the admin (drive.file grant per picked file), plus create-new. Keep drive.file (non-sensitive) as default scope; no broad drive scope.
6. Desktop closed → deliver on reopen: OK.
7. External copies stay in sheets on local delete for now; later add an OPTION to delete delivered sheet rows too.
8. OAuth client: Tovu-owned Google client (recommended answer, owner said "sure").
Build order: P1 fan-out + P2 pull-on-start/login (Codex, non-UI) → P3 Google sign-in connection (Codex backend + Opus/Chrome flow) → P4 Google plugin + Sheets tools + form-destination adapter (Codex) → P5 admin UI: bindings/status, autoPull toggle, Picker, connect/reconnect (Opus+Chrome).

## Update 2026-10-20 (owner): ONE "Google Workspace" plugin
- content/agent-plugins/google-workspace: contains the Google sign-in (declares its OAuth config; uses core/Jini OAuth engine + vault) AND all products as modules: Sheets (v1), then Docs, Slides, Drive; later Gmail, Calendar. Each product enabled separately with incremental scopes.
- ALL Google-specific code + all Sheets/Docs/Slides tools live in the plugin. Nothing Google-specific in core. Core keeps only existing generic pieces (OAuth engine, vault, credential capture, form-destinations category, plugin connect).
- Why not a separate login plugin: plugins never import each other (owner 10-09).
- Flow: Codex plans → owner approves → Codex builds (UI parts Opus+Chrome).
