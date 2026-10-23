# Round 2 progress (cloud, 2026-10-22, start 16:47 UTC)

| item | owner | status |
|---|---|---|
| A Email Phase 2 | agent-A | done d89a6cc9, 5a425349 |
| B Email Phase 3 | agent-B | done 8d1c288e |
| C Assistant tool failures | agent-CE | done c8af6882 |
| E Jini trust.ts | agent-CE | done Jini a3fb7570 |
| D Email Phase 4 | agent-DF | done fe1420bd |
| F Email Phase 5 | agent-DF | done c0b45f67 |
| G Templates backend | agent-G | done 626adebf |
| integration contract fixes | agent-fix | done e3a22cc4, 99d334df, c9f2e772 |


## Opus round-2 repairs, 2026-10-22

Programmer persona loaded. All 17 review items are implemented or under final static review in this working tree. Tests, installs, builds and commits are prohibited by the dispatch. Report: `.cloud-coord/round2-FIX-REPORT.md`.

## Jini extraction backlog

Owner decision: Jini first. These generic implementations predate this repair and cannot be moved in this checkout: the shared Jini source/release is outside the authorized writable tree, and its release cannot be installed or built during this dispatch. Keep one implementation per behavior until extraction; move it, then replace the Tovu implementation with an import and CMS-specific adapters. Do not copy it into a new parallel owner.

| Source / behavior | Intended owner | Required-object API and ports | Invariants to carry into contract tests |
| --- | --- | --- | --- |
| `apps/website/src/server/runtime/boot/mail-status-cache.ts`: `createTtlCache` | `@jini-ai/platform`, cache subpath | `createTtlCache({ load, ttlMs, nowMs }, { minRefreshIntervalMs? })`; injected loader and clock; preserve `get({ refresh? })` and `invalidate()` | Single-flight ordinary reads and throttled refreshes; TTL; failed loads never cached; invalidation permits immediate rebuild; old generation never overwrites new state or clears its pending promise. Tovu owns the 30 s TTL and 5 s refresh policy. |
| `apps/website/src/features/agent-plugins/mail-provider-setup.ts`: declarative setup parser and defaults | `@jini-ai/agent-plugins`, provider setup contract | Parser `({ value, credentialKeys }, { limits? })`; defaults `({ credentialKeys }, {})`; no hidden registry or credential-store dependency. Preserve/adapt existing concrete field names when moving. | Validate supported fields/types and credential-key membership; bounded field count/labels; reject malformed or duplicate fields; secret fields never contain saved values; caller-safe diagnostics. Tovu keeps its form DTO adapter. |
| `apps/website/src/features/email-templates/render.ts`: placeholders, declarations, email HTML sanitization and plain text | `@jini-ai/platform/mail` renderer, extending the existing `@jini-ai/platform/web` primitives | `({ html, values }, {})`, `({ text, values, escape }, {})`, `({ html }, {})`; parser dependency through the shared package; no CMS, posts, database, provider, or credential imports. | Escape text and attributes; missing/inherited values never become arbitrary HTML; stable declarations; subject CR/LF folding; sanitize after interpolation; strip scripts, handlers, embeds, base/form/link/http-equiv meta and active URL schemes including non-image data URLs; retain email inline styling and image data; plain-text links preserved. Preview and send remain separate explicit contracts. Tovu owns template rows and permissions. |

2026-10-22: addresses Opus round-2 finding 5. These entries live in the already tracked `.cloud-coord/round2-progress.md`, outside `.local-artifacts`, and travel with the eventual change. SMTP remains a core protocol; vendor integrations remain plugins.
