TDD(Direct): Loaded the TDD persona for behavior-based coverage gap filling. Extended 12 existing test files; production code is unchanged.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/create-agent-tool.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/set-token-agent-tool.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/make-request-delete-confirmation.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/write-files-confirmation.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/import-menu.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/publish-content.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/html-document-store.sqlite.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/html-document-store.revisions.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/posts/__tests__/use-post-editor.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/components/__tests__/MediaContentEditor.unit.test.tsx
```

**PER FILE:**

Added scenarios target these current-source paths; execution remains unverified.

| Source | Added scenarios |
|---|---|
| `custom-credentials/tool-registrations.ts` | Form field defaults and validation; secret-shaped label redaction; adapter-level token rejection; rotation abort during fresh read; DELETE permission revocation and abort during reauthorization; missing provider, deleted credential, and aborted file-write reconnaissance. |
| `pages/html-document-store.ts` | Missing conversion target; deletion after read; edit/trash/delete between freshness read and CAS; existing revision preservation; system actor fallback; deletion before conversion transaction. |
| `navigation/import-menu.ts` | Missing dropped-location binding; concurrent creation discovered during slug lookup, with insert-if-absent protection. |
| `navigation/publish-content.ts` | Missing reference/repoint dependencies; menus removed or already repaired after listing; missing outbox; omitted locations. |
| `posts/hooks/use-post-editor.hooks.ts` | Listed callback lines 809–810 and 831; failed conflict re-read at 1144–1145; non-Error load/save/publish/delete failures; restoration without a draft. |
| `pages/html-document-store.memory.ts` | Missing, unconverted and incomplete records; unread writes; deleted/format-changed rows; already-HTML conversion; trashed conversion; disappearance before revision append. |
| `site-backup/push-engine.ts` | Empty and aborted plans; malformed UTF-8, NUL, BOM and size boundaries; stale files; manifest failure; zero concurrency; simultaneous failures; aggregate inline budget. |
| `MediaContentEditor.hooks.ts` | Listed lines 223–227, 252 and 262; row diagnostics; selection cancellation; move/tab no-ops; missing textarea fallback; deferred caret restoration; default API adapter. |

**UNREACHABLE:**

Current source locations, left intact for owner disposition:

- `custom-credentials/tool-registrations.ts:666`: non-string token fallback—Jini’s secret-card engine validates the token before invoking this save callback.
- `custom-credentials/tool-registrations.ts:781–784`: forwarding callbacks unused by the create flow, which uses the vault and guarded insert.
- `navigation/import-menu.ts:173`: `expectedVersion !== undefined` cannot be false once `existing` is true; the earlier guard already rejects that combination.
- `navigation/publish-content.ts:94`: non-Error fallback for ordinary JSON input; the tree validator throws Error subclasses.
- `navigation/publish-content.ts:280`: null-version rollback; the command gateway invokes rollback only after successful mutation execution sets the version.
- `navigation/publish-content.ts:304`: final throw after the fixed retry loop always returns or throws.
- `pages/html-document-store.ts:281`: HTML-with-null-body branch is forbidden by the database CHECK constraint.

**NOT DONE:**

Tests, typecheck, builds, coverage and package scripts were not run, as instructed. **100% coverage is not established.** The locked verifier must execute the suites and report residual gaps. Whitespace checks passed. No commits or git mutations were made.
