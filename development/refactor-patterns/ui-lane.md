# UI lane: admin screens for the lost-update and list-cursor patterns

Owner rule: visible admin changes go to ONE Opus agent with Claude in Chrome (look at every screen), not Terra/Codex. Start only after the backend row it depends on has landed and Jini is released + bumped in Tovu (the admin talks to the real server).

## V5 — "someone else changed this" (lost-update)
Shape (`lost-update.md` → V5): send `expectedVersion: loaded.version` (settings: `expectedRevisions` / `expectedRevisionSeq`) on save; on `isVersionConflict(error)` (`apps/admin/src/lib/version-conflict.ts`) show `t(VERSION_CONFLICT_MESSAGE)` in the screen's existing error banner with "Reload" (refetch; drops local edits only when clicked) and the existing "Copy details"; keep unsaved edits on screen; store the returned `version` after a successful save; never retry automatically.

| backend rows | admin files |
|---|---|
| J1, T3, T19, T20 forms | `apps/admin/src/integrations/jini-admin/forms-ports.ts` |
| J2 redirects | `apps/admin/src/integrations/jini-admin/redirects-ports.ts`; Jini `packages/admin/src/redirects/react/hooks/use-redirects.hooks.ts` |
| J3, J3b workspace | `apps/admin/src/features/workspace/hooks/use-workspace.hooks.ts` |
| J7, T5, T6 roles/policies | `apps/admin/src/features/roles/hooks/use-roles.hooks.ts`; Jini `packages/user-management/src/admin/react/hooks/{PoliciesTab,RolesTab}.hooks.ts` |
| T4 users | `apps/admin/src/features/users/hooks/users-controller.hooks.ts`, `apps/admin/src/features/users/UsersPanel.tsx` |
| T1, T17 comments settings | `apps/admin/src/integrations/jini-admin/comments-ports.ts` (`expectedRevisions`) |
| T2, T18 external MCP | `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts`, `apps/admin/src/lib/api.ts` |
| T8, T23, T9, T24 SEO | `apps/admin/src/integrations/jini-admin/seo-ports.ts` (entry: `expectedVersion`; settings: `expectedRevisions`) |
| T10, T11 generic settings | `apps/admin/src/lib/api.ts` (`expectedRevisionSeq` from the raw GET's `revisionSeqs`) |
| T12 preview switcher | none (tool only) |
| T13 media metadata | `apps/admin/src/integrations/jini-admin/media-ports.ts` |
| T14 webhooks | `apps/admin/src/lib/api.ts`, `apps/admin/src/features/providers/Providers.tsx` |
| T15 assistant settings | `apps/admin/src/lib/api.ts`, `apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts` (`expectedRevisions`) |
| T16 site assistant key | `apps/admin/src/lib/api.ts`, `apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts` |
| T21 media providers | DEFERRED with its backend row |
| T22 page HTML | `apps/admin/src/lib/api.ts` (Pages HTML editor save) |

## T5 — "Load more" (list-cursor)
Shape (`list-cursor.md` → T5): keep fetched pages in state; a "Load more" button below the list while `nextCursor !== null` fetches `cursor=nextCursor` and appends; follow Jini `packages/admin/src/react/entities/EntityList.tsx` and the theme's existing button; never auto-load every page; nothing extra on the last page.

| backend rows | admin files |
|---|---|
| members (8–10, done b1aed55c1) | `apps/admin/src/features/members/`, `api.listMembers` in `apps/admin/src/lib/api.ts` |
| newsletter campaigns (11, 14) | admin newsletter campaigns screen (`rg -n "listCampaigns" apps/admin/src`) |
| newsletter subscriptions (12, 15) | admin subscriptions screen (`rg -n "listSubscriptions" apps/admin/src`) |
| newsletter send log (13, 16) | admin send-log screen (`rg -n "send-log\|sendLog" apps/admin/src`) |
| people (6) | Jini `packages/user-management/src/react/members/hooks/use-members.hooks.ts:102` |
