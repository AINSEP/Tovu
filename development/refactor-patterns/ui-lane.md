# UI lane: admin screens for the lost-update and list-cursor patterns

Owner rule: visible admin changes go to ONE Opus agent with Claude in Chrome (look at every screen), not Terra/Codex. Start only after the backend row it depends on has landed and Jini is released + bumped in Tovu (the admin talks to the real server).

## Step 0 — Jini contracts and adapters FIRST (non-visual; Terra/Codex may do it, before any screen)
Several screens are Jini React screens that Tovu only binds. Editing the Tovu host files alone leaves their saves unguarded and their lists incomplete. Land these in `jini-terra-w3-db` (branch `w3-db-main`) and release them first:
- **Forms** — `packages/admin/src/core/ports/forms.ts`:
  - `AdminFormDefinition.version: number`;
  - `updateFormDefinition(requiredArgs, optionalArgs?)` — `AdminFormUpdatePatch` gains `expectedVersion?: number`;
  - every Forms adapter (`rg -n "updateFormDefinition" packages/admin/src`) forwards it, and the memory adapter compares it (V1 memory shape);
  - Tovu `apps/admin/src/integrations/jini-admin/forms-ports.ts` maps `version` in and `expectedVersion` out.
  - The patch already carries `status`, so a combined save stays ONE call (backend J-FORMS/T20).
- **People** — `packages/user-management/src/react/ports.ts` `MembersPort.listMembers(required, optional?: { cursor?: string \| null; limit?: number })` returns `{ members, nextCursor: string \| null }`. The memory/testing fakes page with `pageFromArray` (shape `['string']`), and the Tovu binding forwards both.
- **Conflict classification is injected, never imported from Tovu.** A Jini hook that saves takes a port function `classifySaveError(error): { kind: "version-conflict" \| "version-required" \| "other"; message: string; details?: string }` from its ports object (default: `other` with the error's own message).
  - Tovu wires it once, from `apps/admin/src/lib/version-conflict.ts` (`isVersionConflict` + the 428 `VERSION_REQUIRED` code).
  - Jini code never imports `apps/admin` or any Tovu path (Jini never imports Tovu).
- **Notice field** — `ProjectKeyRow.siteNotice?` (list-cursor row 18) is passed through by the admin key picker's port type.

## Per-screen switch to "version required" (428)
In the SAME commit that makes a screen send its basis, switch that screen's server route from `parseExpectedVersion` to `requireEditorVersion` (Jini `@jini-ai/core/optimistic-concurrency`, row J-REQ). Map `RecordVersionRequiredError` to 428 `versionRequiredBody`, and delete the route's "documented last-write-wins" comment.
- Exception: a route that also has a non-admin caller (public API, CLI, MCP) keeps the optional basis. It keeps its last-write-wins comment, rewritten to name that caller as the reason.
- The screen shows a 428 like a conflict (plain words + "Reload" + "Copy details"), never as a generic failure.

## V5 — "someone else changed this" (lost-update)
Shape (`lost-update.md` → V5): send `expectedVersion: loaded.version` (settings: `expectedRevisions` / `expectedRevisionSeq`) on save; on `isVersionConflict(error)` (`apps/admin/src/lib/version-conflict.ts`; inside Jini screens, the injected `classifySaveError` port — Step 0) show `t(VERSION_CONFLICT_MESSAGE)` in the screen's existing error banner with "Reload" (refetch; drops local edits only when clicked) and the existing "Copy details"; keep unsaved edits on screen; store the returned `version` after a successful save; never retry automatically.

| backend rows | admin files |
|---|---|
| J1, T3, T19, T20 forms | Step 0 Forms contract first; then `apps/admin/src/integrations/jini-admin/forms-ports.ts` and Jini `packages/admin/src/forms/react/hooks/use-form-editor.hooks.ts` + `use-form-fields-editor.hooks.ts` (store `version`, send `expectedVersion`, classify via the injected port) |
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
| list-cursor 18 other-site keys | the admin key picker: show `siteNotice` once under that site's group (no new button) |

## T5 — "Load more" (list-cursor)
Shape (`list-cursor.md` → T5): keep fetched pages in state; a "Load more" button below the list while `nextCursor !== null` fetches `cursor=nextCursor` and appends; follow Jini `packages/admin/src/react/entities/EntityList.tsx` and the theme's existing button; never auto-load every page; nothing extra on the last page.

| backend rows | admin files |
|---|---|
| members (8–10, done b1aed55c1) | `apps/admin/src/features/members/`, `api.listMembers` in `apps/admin/src/lib/api.ts` |
| newsletter campaigns (11, 14) | admin newsletter campaigns screen (`rg -n "listCampaigns" apps/admin/src`) |
| newsletter subscriptions (12, 15) | admin subscriptions screen (`rg -n "listSubscriptions" apps/admin/src`) |
| newsletter send log (13, 16) | admin send-log screen (`rg -n "send-log\|sendLog" apps/admin/src`) |
| people (6) | Step 0 People contract first; then Jini `packages/user-management/src/react/members/hooks/use-members.hooks.ts:102` |
