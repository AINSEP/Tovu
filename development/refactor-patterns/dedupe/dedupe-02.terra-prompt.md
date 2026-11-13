# Terra job dedupe-02: route preamble → shared guards (RG1 + RG2), part 2 of 2

READY (2026-11-13). Self-contained. Background: `development/refactor-patterns/dedupe/PLAN.md` (groups RG1, RG2).
Repo: the Tovu clone you are given (Tovu only). Scope of this part: `routes/n*`–`routes/z*`, public-http and anything outside admin-http (table at the end). Run after the `hung-async-route` job if it is still open; the patterns below are unaffected by its `asyncRoute({ handler: ... })` wrap.

## Why
~190 route files hand-roll the same 4-line workspace 404 and ~80 hand-roll the same 14-line `deps.authorize()` + 403 block. Both now exist once:
- `apps/website/src/server/inbound/shared/route-guards.ts`: `rejectForeignWorkspace({ req, res, workspaceId }): boolean` (writes `404 {"error":"workspace was not found"}`, returns true when the caller must stop) and `readRouteParam({ req, name }): string`.
- `apps/website/src/server/inbound/admin-http/authorize-guard.ts`: `authorizeDirectOrRespond({ res, authorize, params }): Promise<boolean>` — calls `authorize(params)` directly and writes the exact same 403 body. It deliberately does NOT use the publish-trust override that `authorizeOrRespond` adds (switching is an owner decision, O1). Never replace an inline block with `authorizeOrRespond`.
Worked examples already converted (copy their shape): `apps/website/src/server/inbound/admin-http/routes/redirects/get-by-id.ts`, `.../routes/comments/get-settings.ts`, `.../routes/media/trash.ts`.

## Pattern W (workspace 404)
Before (any of: `?? ""` or `?? ''` or no `??`; single or double quotes; one line or four; deps variable may be `deps`, `routeDeps`, `d`, ...):
```ts
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
```
After (same indentation; keep the same deps variable):
```ts
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;
```
If the block is inside a helper that returns a boolean/null instead of `return;` (e.g. `rejectUnlessAuthorized` in `system/custom-credentials.ts` / `system/source-control-credentials.ts` returns `true`), keep that return value: `if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return true;`.
Note: blocks without `?? ""` change only for a request with no `workspaceId` param at all (unreachable through Express; a direct handler call now gets the 404 instead of comparing with "undefined"). That is intended.
Do NOT convert: a 404 with a different body (e.g. `posts/template-preview.ts` sends plain text, `settings/shared.ts` routes through `rejectSettingsRequest`, `analytics/recent-hits.ts` uses `respondToApiError`).

## Pattern A (inline authorize + 403)
Before (result variable may be `authResult`, `auth`, `result`...; `entityType`/`entityId` lines optional; deps variable may differ):
```ts
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.redirects.manage",
        workspaceId: deps.workspaceId,
        entityType: "redirect",
        entityId: id,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.redirects.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.redirects.manage", reason: authResult.reason },
        });
        return;
      }
```
After (keep field order; one line each):
```ts
      const params = { principalId: principal.id, permission: "admin.redirects.manage", workspaceId: deps.workspaceId, entityType: "redirect", entityId: id };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return;
```
Rules: only convert when the 403 body is exactly `error` / `code: "FORBIDDEN"` / `details: { permission, reason }` with the same permission in all three places. If `params` is already a name in that scope, use `authParams`. If the block `return true;`/`return null;` instead of `return;`, keep that value. If the result variable is used again after the block (e.g. `authResult.reason` later), do NOT convert that site; list it in the report.

## Imports (per converted file)
`import { rejectForeignWorkspace } from "#src/server/inbound/shared/route-guards";` and/or `import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";` (if the file already imports from `authorize-guard`, add the name to that import). Keep `getAuthedPrincipal` (still used for `principal`).

## Tests for this part
`apps/website/src/server/inbound/shared/__tests__/route-guards.unit.test.ts`, `apps/website/src/server/inbound/admin-http/__tests__/authorize-guard.test.ts`, and every `__tests__/*.test.ts` inside each `routes/<folder>/` you changed (run each file alone). For `public-http` changes: the `__tests__` beside the changed route.

## Done check
Run this; both counts for your part's files must be 0 (report any remaining site with the reason it was skipped):
```bash
cd apps/website/src && python3 - <<'PY'
import re,glob
ws=re.compile(r'''if \(String\(req\.params\.workspaceId( \?\? (""|''))?\) !== (\w+)\.workspaceId\) \{\s*res\.status\(404\)\.json\(\{ error: ["']workspace was not found["'] \}\);\s*return(?: true| null)?;\s*\}''')
au=re.compile(r'''const (\w+) = await (\w+)\.authorize\(\{\s*principalId: (\w+)\.id,\s*permission: ([^,\n]+),\s*workspaceId: [\w.]+,?\s*(?:entityType: [^,\n]+,?\s*)?(?:entityId: [^,\n]+,?\s*)?\}\);\s*if \(!\1\.allowed\) \{\s*res\.status\(403\)\.json\(\{\s*error: `principal '\$\{\3\.id\}' is not authorized for [^`]*`,\s*code: "FORBIDDEN",\s*details: \{ permission: [^}]*\},?\s*\}\);\s*return(?: true| null)?;\s*\}''')
for f in sorted(glob.glob('**/*.ts',recursive=True)):
    if '__tests__' in f or '.test.' in f: continue
    s=open(f).read(); a=len(ws.findall(s)); b=len(au.findall(s))
    if a or b: print(f,a,b)
PY
```
Then `npx eslint <changed files>` (no new errors). Commit message: "refactor(website): route preamble uses the shared workspace guard and direct 403 (dedupe RG1/RG2 part N)".

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`.
- Signatures: every function this job creates or gives a new shared home takes `(required: {...}, optional: {...} = {})`; with nothing optional write `_optional: Record<string, never> = {}`, with nothing required `_required: Record<string, never> = {}`. A defaulted trailing object never breaks an existing caller. Where an existing exported name has a different shape and callers exist, keep that name as a one-line adapter over the new function. Only three shapes are exempt: React components (one props object), callbacks whose shape a library fixes (e.g. DataTable compare `(a, b)`), and the positional type guards owner decision O2 covers. Each recipe that uses an exemption names it.
- Size: every function you create, move or merge is at most 50 lines, with cyclomatic AND cognitive complexity at most 10 (at most 9/9 under Tovu `apps/admin`). A recipe that moves code says how to split it when needed. If a body you move is still over a limit, split it only by pure extract-function: the same statements in the same order, locals passed in one object, and each comment moving with its lines. If that cannot be done without changing behavior, SKIP the group and report `OVER-LIMIT <id>: <function> <lines>/<complexity>`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Plugins never import each other (`packages/agent-plugins/src/<id>/`, `content/agent-plugins/<id>/`); no new package; a shared helper goes only where the recipe says.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running. Jini: after editing a package, type-check that package only, no emit (`cd packages/<pkg> && npx tsc --noEmit -p tsconfig.json`), and do NOT rebuild/publish it.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group (or once per job if the groups are tiny), by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Files in this part (W = workspace blocks, A = authorize blocks, as of 2026-11-13; re-run the done-check script for the live list)
| # | file (under `apps/website/src/`) | W sites | A sites |
|---|---|---|---|
| 1 | `server/inbound/admin-http/routes/newsletter/archive-list.ts` | 1 | 0 |
| 2 | `server/inbound/admin-http/routes/newsletter/cancel-campaign.ts` | 1 | 0 |
| 3 | `server/inbound/admin-http/routes/newsletter/create-campaign.ts` | 1 | 0 |
| 4 | `server/inbound/admin-http/routes/newsletter/create-list.ts` | 1 | 0 |
| 5 | `server/inbound/admin-http/routes/newsletter/create-subscription.ts` | 1 | 0 |
| 6 | `server/inbound/admin-http/routes/newsletter/get-campaign.ts` | 1 | 0 |
| 7 | `server/inbound/admin-http/routes/newsletter/import-subscriptions.ts` | 1 | 0 |
| 8 | `server/inbound/admin-http/routes/newsletter/list-campaigns.ts` | 1 | 0 |
| 9 | `server/inbound/admin-http/routes/newsletter/list-lists.ts` | 1 | 0 |
| 10 | `server/inbound/admin-http/routes/newsletter/list-send-log.ts` | 1 | 0 |
| 11 | `server/inbound/admin-http/routes/newsletter/list-subscriptions.ts` | 1 | 0 |
| 12 | `server/inbound/admin-http/routes/newsletter/pause-campaign.ts` | 1 | 0 |
| 13 | `server/inbound/admin-http/routes/newsletter/remove-subscription.ts` | 1 | 0 |
| 14 | `server/inbound/admin-http/routes/newsletter/resend-confirmation.ts` | 1 | 0 |
| 15 | `server/inbound/admin-http/routes/newsletter/resume-campaign.ts` | 1 | 0 |
| 16 | `server/inbound/admin-http/routes/newsletter/schedule-campaign.ts` | 1 | 0 |
| 17 | `server/inbound/admin-http/routes/newsletter/send-campaign.ts` | 1 | 0 |
| 18 | `server/inbound/admin-http/routes/newsletter/send-test-campaign.ts` | 1 | 0 |
| 19 | `server/inbound/admin-http/routes/newsletter/update-campaign.ts` | 1 | 0 |
| 20 | `server/inbound/admin-http/routes/pages/create.ts` | 1 | 0 |
| 21 | `server/inbound/admin-http/routes/pages/delete.ts` | 1 | 0 |
| 22 | `server/inbound/admin-http/routes/pages/get-by-id.ts` | 1 | 0 |
| 23 | `server/inbound/admin-http/routes/pages/list.ts` | 1 | 0 |
| 24 | `server/inbound/admin-http/routes/pages/update-html.ts` | 1 | 0 |
| 25 | `server/inbound/admin-http/routes/pages/update.ts` | 1 | 0 |
| 26 | `server/inbound/admin-http/routes/plugins/chart-providers.ts` | 1 | 0 |
| 27 | `server/inbound/admin-http/routes/plugins/files.ts` | 1 | 0 |
| 28 | `server/inbound/admin-http/routes/plugins/provider-settings.ts` | 1 | 0 |
| 29 | `server/inbound/admin-http/routes/plugins/set-enabled.ts` | 1 | 0 |
| 30 | `server/inbound/admin-http/routes/plugins/uninstall.ts` | 1 | 0 |
| 31 | `server/inbound/admin-http/routes/posts/autosave.ts` | 3 | 0 |
| 32 | `server/inbound/admin-http/routes/posts/create.ts` | 1 | 0 |
| 33 | `server/inbound/admin-http/routes/posts/delete.ts` | 1 | 0 |
| 34 | `server/inbound/admin-http/routes/posts/get-by-id.ts` | 1 | 0 |
| 35 | `server/inbound/admin-http/routes/posts/list.ts` | 1 | 0 |
| 36 | `server/inbound/admin-http/routes/posts/update.ts` | 1 | 0 |
| 37 | `server/inbound/admin-http/routes/presentation/get.ts` | 1 | 1 |
| 38 | `server/inbound/admin-http/routes/presentation/patch-active-theme.ts` | 1 | 1 |
| 39 | `server/inbound/admin-http/routes/presentation/rescan-themes.ts` | 1 | 1 |
| 40 | `server/inbound/admin-http/routes/publish-content/blob-get.ts` | 1 | 0 |
| 41 | `server/inbound/admin-http/routes/publish-content/blob-put.ts` | 1 | 0 |
| 42 | `server/inbound/admin-http/routes/publish-content/blobs-probe.ts` | 1 | 0 |
| 43 | `server/inbound/admin-http/routes/publish-content/capabilities.ts` | 1 | 0 |
| 44 | `server/inbound/admin-http/routes/recovery/deep-link.ts` | 0 | 1 |
| 45 | `server/inbound/admin-http/routes/recovery/disclosure.ts` | 0 | 1 |
| 46 | `server/inbound/admin-http/routes/recovery/restore-points.ts` | 0 | 1 |
| 47 | `server/inbound/admin-http/routes/recovery/status.ts` | 0 | 1 |
| 48 | `server/inbound/admin-http/routes/redirects/create.ts` | 1 | 0 |
| 49 | `server/inbound/admin-http/routes/redirects/hits.ts` | 1 | 1 |
| 50 | `server/inbound/admin-http/routes/redirects/import.ts` | 1 | 1 |
| 51 | `server/inbound/admin-http/routes/redirects/list.ts` | 1 | 1 |
| 52 | `server/inbound/admin-http/routes/redirects/tombstone.ts` | 1 | 1 |
| 53 | `server/inbound/admin-http/routes/redirects/update.ts` | 1 | 1 |
| 54 | `server/inbound/admin-http/routes/seo/get-entry-analyze.ts` | 1 | 1 |
| 55 | `server/inbound/admin-http/routes/seo/get-entry.ts` | 1 | 1 |
| 56 | `server/inbound/admin-http/routes/seo/get-settings.ts` | 1 | 1 |
| 57 | `server/inbound/admin-http/routes/seo/post-sitemap-regenerate.ts` | 1 | 1 |
| 58 | `server/inbound/admin-http/routes/seo/put-entry.ts` | 1 | 0 |
| 59 | `server/inbound/admin-http/routes/seo/put-settings.ts` | 1 | 1 |
| 60 | `server/inbound/admin-http/routes/site/profile.ts` | 1 | 0 |
| 61 | `server/inbound/admin-http/routes/sites/local-sites.ts` | 1 | 0 |
| 62 | `server/inbound/admin-http/routes/sites/site-previews.ts` | 1 | 0 |
| 63 | `server/inbound/admin-http/routes/skills/list.ts` | 1 | 0 |
| 64 | `server/inbound/admin-http/routes/skills/manage.ts` | 1 | 0 |
| 65 | `server/inbound/admin-http/routes/system/assistant-daemon.ts` | 1 | 1 |
| 65a | `server/inbound/admin-http/routes/system/custom-credentials.ts` (RG4: both blocks sit inside `rejectUnlessAuthorized`, which returns `true` after each response; keep `return true`) | 1 | 1 |
| 66 | `server/inbound/admin-http/routes/system/deployment-overview.ts` | 1 | 1 |
| 67 | `server/inbound/admin-http/routes/system/dockerfile-source.ts` | 2 | 2 |
| 68 | `server/inbound/admin-http/routes/system/export-site.ts` | 2 | 2 |
| 69 | `server/inbound/admin-http/routes/system/mail-status.ts` | 0 | 1 |
| 70 | `server/inbound/admin-http/routes/system/module-status.ts` | 1 | 1 |
| 71 | `server/inbound/admin-http/routes/system/observability-status.ts` | 2 | 1 |
| 72 | `server/inbound/admin-http/routes/system/server-logs.ts` | 1 | 1 |
| 72a | `server/inbound/admin-http/routes/system/source-control-credentials.ts` (RG4: same `rejectUnlessAuthorized` twin, keep `return true`) | 1 | 1 |
| 73 | `server/inbound/admin-http/routes/system/sites.ts` | 4 | 0 |
| 74 | `server/inbound/admin-http/routes/system/tool-gaps.ts` | 1 | 0 |
| 75 | `server/inbound/admin-http/routes/taxonomy/list.ts` | 0 | 1 |
| 76 | `server/inbound/admin-http/routes/themes/duplicate.ts` | 1 | 1 |
| 77 | `server/inbound/admin-http/routes/themes/list.ts` | 1 | 1 |
| 78 | `server/inbound/admin-http/routes/themes/preview.ts` | 1 | 0 |
| 79 | `server/inbound/admin-http/routes/trash/items.ts` | 1 | 0 |
| 80 | `server/inbound/admin-http/routes/trash/list.ts` | 1 | 1 |
| 81 | `server/inbound/admin-http/routes/trash/purge.ts` | 1 | 1 |
| 82 | `server/inbound/admin-http/routes/trash/restore.ts` | 1 | 1 |
| 83 | `server/inbound/admin-http/routes/users/assign-role.ts` | 1 | 0 |
| 84 | `server/inbound/admin-http/routes/users/attach-policy.ts` | 1 | 0 |
| 85 | `server/inbound/admin-http/routes/users/create-policy.ts` | 1 | 0 |
| 86 | `server/inbound/admin-http/routes/users/create-role.ts` | 1 | 0 |
| 87 | `server/inbound/admin-http/routes/users/create.ts` | 1 | 0 |
| 88 | `server/inbound/admin-http/routes/users/delete-policy.ts` | 1 | 0 |
| 89 | `server/inbound/admin-http/routes/users/delete-role.ts` | 1 | 0 |
| 90 | `server/inbound/admin-http/routes/users/delete.ts` | 1 | 0 |
| 91 | `server/inbound/admin-http/routes/users/disable.ts` | 1 | 0 |
| 92 | `server/inbound/admin-http/routes/users/enable.ts` | 1 | 0 |
| 93 | `server/inbound/admin-http/routes/users/list-policies.ts` | 1 | 0 |
| 94 | `server/inbound/admin-http/routes/users/list-policy-permissions.ts` | 1 | 0 |
| 95 | `server/inbound/admin-http/routes/users/list-roles.ts` | 1 | 0 |
| 96 | `server/inbound/admin-http/routes/users/list.ts` | 1 | 0 |
| 97 | `server/inbound/admin-http/routes/users/remove-policy-permission.ts` | 1 | 0 |
| 98 | `server/inbound/admin-http/routes/users/reset-password.ts` | 1 | 0 |
| 99 | `server/inbound/admin-http/routes/users/update-policy.ts` | 1 | 0 |
| 100 | `server/inbound/admin-http/routes/users/update-role.ts` | 1 | 0 |
| 101 | `server/inbound/admin-http/routes/users/update.ts` | 1 | 0 |
| 102 | `server/inbound/admin-http/routes/users/write-policy-permission.ts` | 1 | 0 |
| 103 | `server/inbound/admin-http/routes/widgets/agent-tools.ts` | 4 | 0 |
| 104 | `server/inbound/admin-http/routes/widgets/create.ts` | 1 | 0 |
| 105 | `server/inbound/admin-http/routes/widgets/embed-insert.ts` | 1 | 0 |
| 106 | `server/inbound/admin-http/routes/widgets/embed-remove.ts` | 1 | 0 |
| 107 | `server/inbound/admin-http/routes/widgets/embed-reorder.ts` | 1 | 0 |
| 108 | `server/inbound/admin-http/routes/widgets/get-by-id.ts` | 1 | 0 |
| 109 | `server/inbound/admin-http/routes/widgets/list.ts` | 1 | 0 |
| 110 | `server/inbound/admin-http/routes/widgets/preview.ts` | 1 | 0 |
| 111 | `server/inbound/admin-http/routes/widgets/region-bind.ts` | 1 | 0 |
| 112 | `server/inbound/admin-http/routes/widgets/region-get.ts` | 1 | 0 |
| 113 | `server/inbound/admin-http/routes/widgets/region-mutate-placements.ts` | 1 | 0 |
| 114 | `server/inbound/admin-http/routes/widgets/regions-list.ts` | 1 | 0 |
| 115 | `server/inbound/admin-http/routes/widgets/trash.ts` | 1 | 0 |
| 116 | `server/inbound/admin-http/routes/widgets/update.ts` | 1 | 0 |
| 117 | `server/inbound/admin-http/routes/workspace/get.ts` | 1 | 0 |
| 118 | `server/inbound/admin-http/routes/workspace/update.ts` | 1 | 0 |
| 119 | `server/inbound/public-http/middleware/theme-preview-refresh.ts` | 1 | 0 |
