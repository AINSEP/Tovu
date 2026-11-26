# merge-25 G3-reviewed binding residuals

Each path below was read in full on merge-25 and passes G3 of `reviews/x4-check-1125.md` §1 (imports; host
constants/copy/tables; exactly one call per Jini factory with Tovu arguments; one-expression arrow adapters; at most a
single null-guard; no loop/switch/try, no SQL, no hooks). LOC is the whole file including doc comments.

| path (under `apps/website/src/features/`) | LOC | residual |
|---|---|---|
| `trash/adapters/redirect.ts` | 7 | one `createRedirectTrashAdapter` call with Tovu tables (signature now `({ store }, _optional)`) |
| `trash/member-credential-ports.ts` | 7 | one Jini call with Tovu table names |
| `media/import-video-conversion.ts` | 13 | one call; one null-guard; host copy |
| `project-keys/shared-oauth-disconnect.ts` | 13 | host copy + workspace id; two one-expression adapters |
| `mail-status/provider-operations.ts` | 14 | one call each; one-expression credential adapters |
| `members/tool-registrations.ts` | 15 | one build call + contributor literal |
| `post/tool-registrations.ts` | 15 | one build call + contributor literal |
| `agent-plugins/identity-read-policy.ts` | 16 | host constant (legacy `tovu` namespace, persisted) |
| `mail-status/tool-registrations.ts` | 16 | one build call + contributor literal |
| `source-control/store.ts` | 19 | one call per factory; one-expression type guard |
| `newsletter/tool-registrations.ts` | 20 | one build call; `??` null-guard |
| `plugin-runtime/built-ins/content-analyzer/plugin.ts` | 20 | one factory call (documented type-only cast) |
| `mail-status/delivery-tool-registrations.ts` | 21 | one build call + contributor literal |
| `mail-status/provider-tool-registrations.ts` | 22 | one build call; one conditional spread (null-guard) |
| `source-control/credential-setup.ts` | 22 | one call; host copy; one-expression adapters |
| `plugin-runtime/install-archive.ts` | 24 | one reader factory call; one `??` null-guard |
| `newsletter/delivery/tool-registrations.ts` | 31 | one build call; host copy table |
| `permanent-delete/tool-registrations.ts` | 31 | Jini spec/catalog factories once each; one build call |
| `publish-content/tool-registrations.ts` | 35 | one build call; one conditional spread (null-guard) |
| `site-inspection/tool-registrations.ts` | 37 | one build call; one `live ?` null-guard; one-expression log adapter |

Reviewed and **not** kept (fail G3): `identity/user-purge.ts` (SQL), `vendor-credentials/vault-adapter.ts` (class
bodies, branching cast), `taxonomy/agent-tools.ts` (`if`/throw + host catalog entries),
`admin/src/lib/durable-run-subscription.ts` (multi-statement scheduler default),
`admin/src/features/routines/use-conversation-deep-link.ts` (multi-statement browser adapter).

## Keep rules

```text
^apps/website/src/features/trash/adapters/redirect\.ts$
^apps/website/src/features/trash/member\-credential\-ports\.ts$
^apps/website/src/features/media/import\-video\-conversion\.ts$
^apps/website/src/features/project\-keys/shared\-oauth\-disconnect\.ts$
^apps/website/src/features/mail\-status/provider\-operations\.ts$
^apps/website/src/features/members/tool\-registrations\.ts$
^apps/website/src/features/post/tool\-registrations\.ts$
^apps/website/src/features/agent\-plugins/identity\-read\-policy\.ts$
^apps/website/src/features/mail\-status/tool\-registrations\.ts$
^apps/website/src/features/source\-control/store\.ts$
^apps/website/src/features/newsletter/tool\-registrations\.ts$
^apps/website/src/features/plugin\-runtime/built\-ins/content\-analyzer/plugin\.ts$
^apps/website/src/features/mail\-status/delivery\-tool\-registrations\.ts$
^apps/website/src/features/mail\-status/provider\-tool\-registrations\.ts$
^apps/website/src/features/source\-control/credential\-setup\.ts$
^apps/website/src/features/plugin\-runtime/install\-archive\.ts$
^apps/website/src/features/newsletter/delivery/tool\-registrations\.ts$
^apps/website/src/features/permanent\-delete/tool\-registrations\.ts$
^apps/website/src/features/publish\-content/tool\-registrations\.ts$
^apps/website/src/features/site\-inspection/tool\-registrations\.ts$
```
