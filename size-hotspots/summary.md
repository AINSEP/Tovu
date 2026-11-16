# Size hotspots — 2026-11-11

Limits: file > 500 lines; function > 80 / 100 lines. Lines = non-blank, non-comment (ESLint max-lines skipBlankLines+skipComments). Nested functions counted separately.
Hotspot score = lines × commits in last 90 days (functions use their file's commits). Exception categories are CANDIDATES for the owner to accept or reject.
Script: development/scripts/size-hotspots.mjs (read-only).

## Counts

| repo | prod files | files>500 | …minus candidates | …minus accepted | fns>80 | …minus candidates | …minus accepted | fns>100 | …minus candidates | …minus accepted |
|---|---|---|---|---|---|---|---|---|---|---|
| tovu | 3371 | 88 | 45 | 47 | 233 | 224 | 226 | 147 | 141 | 143 |
| jini | 3479 | 32 | 31 | 31 | 249 | 242 | 242 | 176 | 171 | 171 |

"…minus candidates" = what stays over the limit if every exception candidate is accepted; "…minus accepted" = what stays over after the owner-accepted list (size-exceptions.json).

## tovu — top 30 hotspots

| # | kind | file | function | lines | churn90 | churn365 | score | candidate |
|---|---|---|---|---|---|---|---|---|
| 1 | file | `apps/website/src/server/runtime/composition/deps.ts` |  | 1913 | 317 | 317 | 606421 | wiring |
| 2 | file | `apps/admin/src/lib/api.ts` |  | 2530 | 194 | 234 | 490820 |  |
| 3 | file | `apps/website/src/server/runtime/composition/app.ts` |  | 1698 | 254 | 254 | 431292 | wiring |
| 4 | function | `apps/website/src/server/runtime/composition/deps.ts` | `composeSiteRouteDeps`:1047 | 1187 | 317 | 317 | 376279 | wiring |
| 5 | function | `apps/website/src/server/runtime/composition/app.ts` | `createRouteDeps`:466 | 873 | 254 | 254 | 221742 | wiring |
| 6 | file | `apps/admin/src/features/plugins/plugins-i18n.ts` |  | 4360 | 41 | 44 | 178760 | i18n |
| 7 | file | `apps/website/src/server/inbound/public-http/routes/site/pages.ts` |  | 1482 | 95 | 95 | 140790 |  |
| 8 | file | `apps/website/src/server/inbound/public-http/http/site/render.ts` |  | 1663 | 83 | 83 | 138029 |  |
| 9 | file | `apps/admin/src/features/posts/PostEditor.tsx` |  | 1589 | 65 | 100 | 103285 |  |
| 10 | file | `apps/website/src/server/routes/types.ts` |  | 519 | 176 | 176 | 91344 |  |
| 11 | file | `apps/admin/src/features/posts/posts-i18n.ts` |  | 3205 | 25 | 27 | 80125 | i18n |
| 12 | file | `apps/admin/src/features/security/security-i18n.ts` |  | 2238 | 35 | 35 | 78330 | i18n |
| 13 | file | `apps/admin/src/features/themes/themes-i18n.ts` |  | 3646 | 20 | 22 | 72920 | i18n |
| 14 | file | `apps/admin/src/features/deployment/deployment-i18n.tsx` |  | 2395 | 30 | 30 | 71850 | i18n |
| 15 | file | `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx` |  | 1018 | 66 | 66 | 67188 |  |
| 16 | file | `apps/admin/src/features/media/Media.tsx` |  | 1151 | 57 | 65 | 65607 |  |
| 17 | function | `apps/website/src/server/runtime/composition/app.ts` | `createApp`:2030 | 247 | 254 | 254 | 62738 |  |
| 18 | file | `apps/website/src/features/post/post.ts` |  | 1120 | 55 | 55 | 61600 |  |
| 19 | file | `apps/admin/src/features/pages/PageEditor.tsx` |  | 1017 | 55 | 67 | 55935 |  |
| 20 | file | `apps/admin/src/components/AssistantDock/assistant-dock-i18n.ts` |  | 2109 | 26 | 28 | 54834 | i18n |
| 21 | file | `apps/website/src/platform/db/schema.postgres.ts` |  | 1143 | 47 | 47 | 53721 | generated |
| 22 | file | `apps/admin/src/features/media/media-i18n.ts` |  | 1791 | 27 | 30 | 48357 | i18n |
| 23 | file | `apps/admin/src/panels.tsx` |  | 726 | 66 | 79 | 47916 |  |
| 24 | file | `apps/admin/src/components/shared-components-i18n.ts` |  | 3344 | 14 | 14 | 46816 | i18n |
| 25 | file | `apps/website/src/features/deployments/publish-agent-tools.ts` |  | 754 | 62 | 62 | 46748 |  |
| 26 | file | `apps/website/src/platform/db/schema.sqlite.ts` |  | 1370 | 34 | 34 | 46580 | data-table |
| 27 | file | `apps/admin/src/features/deployment/StaticSiteTab.tsx` |  | 942 | 49 | 49 | 46158 |  |
| 28 | file | `apps/desktop/src/project-ipc.ts` |  | 1069 | 43 | 43 | 45967 |  |
| 29 | file | `apps/admin/src/features/ai-assistant/ai-assistant-i18n.ts` |  | 2807 | 15 | 17 | 42105 | i18n |
| 30 | file | `apps/admin/src/features/themes/ThemeExplore.tsx` |  | 1021 | 37 | 53 | 37777 |  |

Candidates by category (tovu): file:wiring=2, function:wiring=7, file:i18n=36, file:generated=2, file:data-table=3, function:data-table=1, function:embedded-text=1

## jini — top 30 hotspots

| # | kind | file | function | lines | churn90 | churn365 | score | candidate |
|---|---|---|---|---|---|---|---|---|
| 1 | file | `packages/chat/src/react/features/chat-pane/styles.ts` |  | 2034 | 52 | 55 | 105768 | embedded-text |
| 2 | file | `packages/daemon/src/agent-executor/launch.ts` |  | 1012 | 42 | 42 | 42504 |  |
| 3 | file | `packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts` |  | 864 | 39 | 40 | 33696 |  |
| 4 | file | `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx` |  | 759 | 37 | 40 | 28083 |  |
| 5 | file | `packages/daemon/src/agent-executor/events.ts` |  | 929 | 27 | 27 | 25083 |  |
| 6 | function | `packages/chat/src/react/features/chat-pane/hooks/useChatPane.hooks.ts` | `useChatPane`:403 | 614 | 39 | 40 | 23946 |  |
| 7 | function | `packages/daemon/src/agent-executor/launch.ts` | `createAgentExecutor`:971 | 422 | 42 | 42 | 17724 |  |
| 8 | file | `packages/core/src/redact.ts` |  | 601 | 21 | 22 | 12621 |  |
| 9 | file | `packages/chat/src/react/components/ToolCard.tsx` |  | 516 | 24 | 26 | 12384 |  |
| 10 | file | `packages/chat/src/react/components/Composer.tsx` |  | 555 | 22 | 29 | 12210 |  |
| 11 | file | `packages/daemon/src/http/attachments.ts` |  | 871 | 14 | 14 | 12194 |  |
| 12 | file | `packages/agent-runtime/src/json-event-stream.ts` |  | 819 | 14 | 19 | 11466 |  |
| 13 | file | `packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx` |  | 516 | 20 | 21 | 10320 |  |
| 14 | file | `packages/agent-runtime/src/agent-protocol/acp/session.ts` |  | 1236 | 8 | 11 | 9888 |  |
| 15 | file | `packages/daemon/src/run-lifecycle.ts` |  | 690 | 14 | 24 | 9660 |  |
| 16 | function | `packages/daemon/src/agent-executor/events.ts` | `wireChildLifecycle`:467 | 336 | 27 | 27 | 9072 |  |
| 17 | file | `packages/agent-runtime/src/claude-stream.ts` |  | 685 | 11 | 17 | 7535 |  |
| 18 | file | `packages/user-management/src/react/users/Users.tsx` |  | 748 | 10 | 10 | 7480 |  |
| 19 | file | `packages/commerce/src/payments/ledger/rows.ts` |  | 726 | 10 | 10 | 7260 |  |
| 20 | file | `packages/cms/src/taxonomy/write-service.ts` |  | 712 | 10 | 13 | 7120 |  |
| 21 | file | `packages/cms/src/widgets/resolver-service.ts` |  | 701 | 10 | 10 | 7010 |  |
| 22 | file | `packages/admin/src/seo/react/pages/SeoPage.tsx` |  | 608 | 11 | 11 | 6688 |  |
| 23 | function | `packages/chat/src/react/features/chat-pane/components/ChatPane.tsx` | `ChatPane`:746 | 176 | 37 | 40 | 6512 |  |
| 24 | file | `packages/server/src/builtin-features.ts` |  | 566 | 11 | 16 | 6226 |  |
| 25 | function | `packages/daemon/src/tool-executor.ts` | `createToolExecutor`:254 | 338 | 18 | 26 | 6084 |  |
| 26 | function | `packages/chat/src/react/components/Composer.tsx` | `Composer`:166 | 270 | 22 | 29 | 5940 |  |
| 27 | function | `packages/chat/src/react/components/MessageRow.tsx` | `AssistantMessageRow`:338 | 159 | 35 | 38 | 5565 |  |
| 28 | function | `packages/daemon/src/run-lifecycle.ts` | `createRunLifecycle`:571 | 393 | 14 | 24 | 5502 |  |
| 29 | function | `packages/daemon/src/agent-executor/launch.ts` | `run`:1391 | 131 | 42 | 42 | 5502 |  |
| 30 | file | `packages/mcp/src/federation/hosted/store.ts` |  | 988 | 5 | 5 | 4940 |  |

Candidates by category (jini): file:embedded-text=1, function:embedded-text=6, function:wiring=1

## Notes

- Churn counts commits by path, no rename following; a file renamed recently shows low churn.
- days90 = distinct commit days in 90 days (stand-in for sessions); authors365 is near-useless here (owner + agent identities).
- Cloud scan (11-11) counted raw lines; these counts drop blanks/comments, so totals are lower.
- Full lists: hotspots-<repo>.tsv, exceptions-candidates.tsv.

## Accepted exceptions no longer over the limit (delete from size-exceptions.json)

- none
