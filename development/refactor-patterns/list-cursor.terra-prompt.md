# Terra job: list-cursor pattern — apply at every listed site

STATUS: READY (2026-11-13). Jini lines re-verified on Jini main (clone branch `w3-db-main`). Worked example done: members (commit b1aed55c1).

HARD RULE: stop before ~300k tokens of context. If you get close, commit what you have, list the sites not done, and stop.

You apply ONE pattern. Each site already has its variant. Read `development/refactor-patterns/list-cursor.md` in the Tovu clone FIRST and follow its decision table exactly (T1–T5). Copy the worked example: `git -C /Users/la/Programming/tovu-terra-w3-db show b1aed55c1` (members repo + memory twin + `members_list` + admin route; test `apps/website/src/features/members/__tests__/member-repo.list-cursor.test.ts`).

Workspace, commit rules, test commands (including the full resolver-shim text to recreate if missing), forbidden shortcuts and the per-site loop (failing test FIRST → RED → fix → GREEN → mutation RED → restore → commit) are exactly as in `development/refactor-patterns/lost-update.terra-prompt.md` in the same clone (read everything above its "## Jini type prerequisites" heading). Same clones: Jini clone on branch `w3-db-main` only (check `git -C /Users/la/Programming/jini-terra-w3-db branch --show-current`); one test file at a time, never a suite, nothing left running. Mutation for this pattern: `limit(limit + 1)` → `limit(limit)`, or drop `nextCursor` from the output.

Order: Jini rows first. Group rows that share one list (repo + memory twin + tool + route) into one commit; existing tests that expect the old array move to `.items` in the same commit (find them with `rg -n "<repo var>\.list\(" <feature>/__tests__`). Rows 8–10 (members) are DONE in b1aed55c1 — skip them. Pilot: the newsletter campaigns group (rows 11 + 14 + the `newsletter_list_campaigns` tool + its admin route if one exists — `rg -n "listCampaigns|campaigns" apps/website/src/server/inbound/admin-http/routes/newsletter`). Commit the pilot and STOP for review.

T5 (admin "Load more" buttons) is NOT in this job: it is a visible UI change and goes to a separate UI agent. Leave `apps/admin` alone; keep each response's existing key so the current screens keep working.

If a site does not match its variant's before-shape, skip it and list it under "Needs a decision". Report per site: commit, test file, red/green/mutation lines.

## Sites to fix
| # | repo | site (file:line) | variant | limit | exposed by | note |
|---|---|---|---|---|---|---|
| 1 | jini | `packages/chat/src/store/runtime/history-tools.ts:120` (`listInput`; output at :141-149) | T3 | 20 (max 50) | assistant_chats_list | recent chats capped; `truncated` only covers text caps, no cursor for older chats |
| 2 | jini | `packages/chat/src/store/sql/store.ts:386` (history `list`, `.limit(limit)` at :405) | T1, but with the chat store's OWN owner-bound cursor (`sql/cursor.ts` `encodeCursor`/`decodeCursor`, kind `conversations`) exactly as the conversation page reader at store.ts:547-561 does, NOT `encodeListCursor` | 20 (max 50) | assistant_chats_list | array only, no nextCursor; also its memory twin if one implements the same method (`rg -n "async list\(_required, \{ query" packages/chat/src`) |
| 3 | jini | `packages/cms/src/redirects/resolver.ts:102` (`DYNAMIC_SET_LIMIT` :57) | T1 (repo `listDynamic` pages; the resolver reads every page until `nextCursor` is null — it must not expose a cursor) | 500 | public redirect resolver | wildcard rules past 500 silently never match; create does not cap count |
| 4 | jini | `packages/commerce/src/catalog/repo.ts:91` | T1 | 100 | - | active products capped at 100, array only; no live caller in clone |
| 5 | jini | `packages/daemon/src/http/routines.ts:266` (`parseRoutineRunsQuery`) | T4 | 20 default, max 100 | GET /api/routines/:id/runs | run history capped, no cursor for older runs |
| 6 | jini | `packages/user-management/src/admin/adapters/memory.ts:258` (`listMembers`) | T2 + its port: `src/admin/ports.ts:104` returns `{ members }` only; the http adapter `src/admin/adapters/http.ts:62`, controller `src/admin/controllers/members.controller.ts:47` and conformance `src/admin/conformance/index.ts:115` change in the same commit (add `nextCursor`, keep `members`; `afterId` stays an alias). Do NOT touch `src/react/` (UI lane) | 100 | user-management/src/react/members/hooks/use-members.hooks.ts:102 | memory admin people list slices 100, returns no nextCursor |
| 7 | tovu | `apps/website/src/assistant/site/tools.ts:172` | T3 | 20 | search_published_entries (visitor assistant) | unranked substring filter; empty query lists only first 20 published entries |
| 8 | tovu | `apps/website/src/features/members/repo.memory.ts` | T2 | 100 | members_list | DONE b1aed55c1 |
| 9 | tovu | `apps/website/src/features/members/repo.ts` | T1 | 100 | members_list, admin members route | DONE b1aed55c1 |
| 10 | tovu | `apps/website/src/features/members/tool-registrations.ts` | T3 | 100 | members_list | DONE b1aed55c1 (route T4 too) |
| 11 | tovu | `apps/website/src/features/newsletter/repo.memory.ts:53` | T2 | 100 | newsletter_list_campaigns | campaign list array only |
| 12 | tovu | `apps/website/src/features/newsletter/repo.memory.ts:158` | T2 | 100 | newsletter_list_subscriptions | subscription list array only |
| 13 | tovu | `apps/website/src/features/newsletter/repo.memory.ts:234` | T2 | 100 | newsletter_list_send_log | send list array only |
| 14 | tovu | `apps/website/src/features/newsletter/repo.ts:103` | T1 | 100 | newsletter_list_campaigns | campaign list array only |
| 15 | tovu | `apps/website/src/features/newsletter/repo.ts:309` | T1 | 100 | newsletter_list_subscriptions | subscription list array only |
| 16 | tovu | `apps/website/src/features/newsletter/repo.ts:446` | T1 | 100 | newsletter_list_send_log | send list array only; tool at tool-registrations.ts:385 passes no limit |
| 17 | tovu | `apps/website/src/server/runtime/composition/domain-dns-adapters.ts:134` | T1 | 100 | domain DNS host picker | hosts only from last 100 publishes; older targets silently dropped |
| 18 | tovu | `apps/website/src/server/runtime/composition/other-site-keys.ts:99` | T1 | 50 | other-site key reuse | other site's shared keys past 50 silently omitted from reuse list |

T5 for admin screens (members, newsletter campaigns/subscriptions/send log, user-management people) is the separate UI lane — not this job.

## Exempt — do NOT touch
| repo | site | code | why |
|---|---|---|---|
| jini | `packages/chat/src/store/sql/cursor.ts:10` | X4 | page size for cursor-paged reads that already return nextCursor (store.ts:561, :580) |
| jini | `packages/chat/src/store/sql/maintenance.ts:13` | X1 | drained in do/while until < 500 (`packages/chat/src/store/runtime/chat-expiry-sweep.ts:33-35`) |
| jini | `packages/cms/src/forms/sql/submission-ip-retention-repo.ts:14` | X1 | drained until < batch (`packages/cms/src/forms/submission-ip-retention.ts:37-39`) |
| jini | `packages/core/src/batch-tool-inputs.ts:56` (`DEFAULT_MAX_BATCH_ITEMS`) | X4 | batch-size cap of tool input validator |
| jini | `packages/daemon/src/core/read-only-tools.ts:114` | X2 | tool-catalog search top-K |
| jini | `packages/daemon/src/http/research-tavily.adapter.ts:134` | X2 | ranked web research sources |
| jini | `packages/integrations/src/media-providers/staging.ts:46` (`DEFAULT_MAX_ITEMS`, used :170) | X4 | cap on staged attachment files kept on disk, not a list read |
| jini | `packages/registry/src/tool-catalog-builder/query.ts:59` | X2 | ranked tool-catalog search |
| jini | `packages/registry/src/tool-catalog/sqlite.ts:119` | X2 | BM25-ranked tool search |
| jini | `packages/vibecoding/src/core/history.ts:176` | X4 | undo ring buffer depth |
| tovu | `apps/admin/src/components/WidgetConfigFields/WidgetConfigFields.tsx:343` | X3 | recent-entries widget default count |
| tovu | `apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts:76` | X3 | recent server errors view |
| tovu | `apps/admin/src/features/taxonomy/rules.ts:283` | X3 | term picker collapse with expand and search; ticked terms always shown |
| tovu | `apps/admin/src/features/themes/hooks/use-theme-explore-file-groups.hooks.ts:94` | X3 | collapse with show-all toggle (expanded returns all files) |
| tovu | `apps/desktop/src/workspace-conversation-store.ts:116` | X3 | latest N tool-gap log entries, ring of 1000 |
| tovu | `apps/website/src/assistant/byok-tool-surface.ts:310` | X2 | ranked tool search |
| tovu | `apps/website/src/assistant/component-catalog-query.ts:99` | X2 | scored component search |
| tovu | `apps/website/src/assistant/component-catalog-tool.ts:144` | X2 | scored component search |
| tovu | `apps/website/src/assistant/permanent-delete-tool-gate.ts:16` | X2 | filtered ranked tool search |
| tovu | `apps/website/src/assistant/tool-catalog-query.ts:142` | X2 | FTS ranked tool search |
| tovu | `apps/website/src/features/analytics/tool-registrations.ts:54` | X3 | recent-hits window by design |
| tovu | `apps/website/src/features/entries/public-list.ts:296` | X3 | collection-list block display count |
| tovu | `apps/website/src/features/identity/passkeys.repo.ts:13` | X4 | max 5 passkeys per owner; 6 probes over-cap |
| tovu | `apps/website/src/features/newsletter/send-pipeline.ts:399` | X1 | for(;;) afterId loop until short page (send-pipeline.ts:401) |
| tovu | `apps/website/src/features/post/search.ts:262` | X2 | ranked admin post search |
| tovu | `apps/website/src/features/tool-audit/tool-gaps.repo.ts:11` | X3 | latest distinct tool gaps per person (recent-issues log) |
| tovu | `apps/website/src/features/webhooks/tool-registrations.ts:208` | X4 | lookup of most recent delivery per subscription, not the listed rows |
| tovu | `apps/website/src/platform/db/vault-credential-inventory.ts:195` | X4 | counts first and refuses truncation |
| tovu | `apps/website/src/platform/server-logs/log-buffer.ts:91` | X4 | in-memory log ring buffer |
| tovu | `apps/website/src/server/inbound/admin-http/routes/integrations/list.ts:55` | X4 | lookup of most recent delivery per subscription |
| tovu | `apps/website/src/server/runtime/composition/commerce.ts:259` | X3 | needs-attention indicator capped at 10 |

## Gone — nothing to do
- jini: `packages/agent-plugins/src/lifecycle/automatic-use.ts` (offPluginNote)
- jini: `packages/cms/src/forms/attachment-purge.ts` (beforePurge)
- jini: `packages/cms/src/forms/attachment-purge.ts` (protectFormAttachments)
- jini: `packages/commerce/src/catalog-tools.ts` (storefrontWarnings)
- jini: `packages/commerce/src/catalog/repo.storefront.ts` (listProducts)
- jini: `packages/devops/src/deploy/ops-runner.ts` (runDeployOps)
- jini: `packages/search/src/indexer.ts` (reconcile)
