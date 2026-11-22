# Terra job dedupe-01: route preamble → shared guards (RG1 + RG2), part 1 of 2

READY (2026-11-13). Self-contained. Background: `development/refactor-patterns/dedupe/PLAN.md` (groups RG1, RG2).
Repo: the Tovu clone you are given (Tovu only). Scope of this part: admin-http non-route files and `routes/a*`–`routes/m*` (table at the end). Run after the `hung-async-route` job if it is still open; the patterns below are unaffected by its `asyncRoute({ handler: ... })` wrap.

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

## Also in this part
1. `apps/website/src/server/inbound/admin-http/routes/publish-content/route-helpers.ts`: delete `routeParam` and `rejectForeignWorkspace` (and `RouteParamsRequest` if nothing else uses it). Their why-comments are already merged into `shared/route-guards.ts`'s docs (check the `"undefined"` sentence is there; if any other sentence is missing, move it there). Repoint every importer in `routes/publish-content/` (`rg -n "routeParam|rejectForeignWorkspace" apps/website/src/server/inbound/admin-http/routes/publish-content`): `rejectForeignWorkspace(req, res, deps.workspaceId)` → `rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })`; `routeParam(req, "x")` → `readRouteParam({ req, name: "x" })`; import both from `#src/server/inbound/shared/route-guards`. Update the file header of route-helpers.ts: "the mount-path 404" now lives in `shared/route-guards.ts`.
2. `apps/website/src/server/inbound/admin-http/http/newsletter.ts#requireNewsletterPermissionOrRespond` and `http/widgets.ts#requireWidgetsPermissionOrRespond`: keep their signatures and docs; replace their bodies with
   ```ts
   const principal = getAuthedPrincipal(res);
   const params = { principalId: principal.id, permission, workspaceId, entityType };   // widgets: entityType: "widget"
   return (await authorizeDirectOrRespond({ res, authorize, params })) ? principal : null;
   ```
   (Same 403 body, same direct `authorize` call — no behavior change.)

## Tests for this part
`apps/website/src/server/inbound/shared/__tests__/route-guards.unit.test.ts`, `apps/website/src/server/inbound/admin-http/__tests__/authorize-guard.test.ts`, every `__tests__/*.test.ts` file inside a `routes/<folder>/` you changed (run each file alone), `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/*` one at a time, and any newsletter/widgets route test (`rg -l "requireNewsletterPermissionOrRespond|requireWidgetsPermissionOrRespond|registerAdminNewsletter|registerAdminWidget" apps/website/src --glob "*.test.ts"`).

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
| 1 | `server/inbound/admin-http/routes/agent-plugins/files.ts` | 1 | 0 |
| 2 | `server/inbound/admin-http/routes/agent-plugins/list.ts` | 1 | 0 |
| 3 | `server/inbound/admin-http/routes/agent-plugins/memory.ts` | 1 | 0 |
| 4 | `server/inbound/admin-http/routes/assistant/delete-execution-credential.ts` | 1 | 0 |
| 5 | `server/inbound/admin-http/routes/assistant/delete-site-credential.ts` | 1 | 1 |
| 6 | `server/inbound/admin-http/routes/assistant/detect-agents.ts` | 1 | 1 |
| 7 | `server/inbound/admin-http/routes/assistant/get-execution-credential.ts` | 1 | 0 |
| 8 | `server/inbound/admin-http/routes/assistant/get-settings.ts` | 1 | 1 |
| 9 | `server/inbound/admin-http/routes/assistant/get-site-credential.ts` | 1 | 1 |
| 10 | `server/inbound/admin-http/routes/assistant/list-models.ts` | 1 | 1 |
| 11 | `server/inbound/admin-http/routes/assistant/put-execution-credential.ts` | 1 | 0 |
| 12 | `server/inbound/admin-http/routes/assistant/put-settings.ts` | 1 | 1 |
| 13 | `server/inbound/admin-http/routes/assistant/put-site-credential.ts` | 1 | 1 |
| 14 | `server/inbound/admin-http/routes/assistant/test-agent.ts` | 1 | 1 |
| 15 | `server/inbound/admin-http/routes/assistant/test-connection.ts` | 1 | 1 |
| 16 | `server/inbound/admin-http/routes/assistant/visitor-tools.ts` | 1 | 0 |
| 17 | `server/inbound/admin-http/routes/change-sets/get.ts` | 1 | 1 |
| 18 | `server/inbound/admin-http/routes/change-sets/list.ts` | 1 | 1 |
| 19 | `server/inbound/admin-http/routes/change-sets/revert.ts` | 1 | 1 |
| 20 | `server/inbound/admin-http/routes/comments/moderate.ts` | 2 | 2 |
| 21 | `server/inbound/admin-http/routes/comments/moderation-queue.ts` | 1 | 1 |
| 22 | `server/inbound/admin-http/routes/comments/put-settings.ts` | 1 | 1 |
| 23 | `server/inbound/admin-http/routes/commerce/status.ts` | 1 | 1 |
| 24 | `server/inbound/admin-http/routes/consent/routes.ts` | 1 | 0 |
| 25 | `server/inbound/admin-http/routes/content-types/lifecycle.ts` | 0 | 1 |
| 26 | `server/inbound/admin-http/routes/content-types/list.ts` | 0 | 1 |
| 27 | `server/inbound/admin-http/routes/content-types/register.ts` | 0 | 1 |
| 28 | `server/inbound/admin-http/routes/content-types/update-fields.ts` | 0 | 1 |
| 29 | `server/inbound/admin-http/routes/database/restore-points.ts` | 0 | 2 |
| 30 | `server/inbound/admin-http/routes/database/schema-state.ts` | 0 | 1 |
| 31 | `server/inbound/admin-http/routes/database/timeline.ts` | 0 | 1 |
| 32 | `server/inbound/admin-http/routes/email-templates/routes.ts` | 1 | 0 |
| 33 | `server/inbound/admin-http/routes/entries/lifecycle.ts` | 0 | 1 |
| 34 | `server/inbound/admin-http/routes/entries/list.ts` | 0 | 1 |
| 35 | `server/inbound/admin-http/routes/entries/update.ts` | 0 | 1 |
| 36 | `server/inbound/admin-http/routes/forms/authoring.ts` | 1 | 0 |
| 37 | `server/inbound/admin-http/routes/forms/create.ts` | 1 | 0 |
| 38 | `server/inbound/admin-http/routes/forms/delete-submission.ts` | 1 | 1 |
| 39 | `server/inbound/admin-http/routes/forms/get-by-id.ts` | 1 | 1 |
| 40 | `server/inbound/admin-http/routes/forms/get-submission.ts` | 1 | 1 |
| 41 | `server/inbound/admin-http/routes/forms/list-submissions.ts` | 1 | 1 |
| 42 | `server/inbound/admin-http/routes/forms/list.ts` | 1 | 1 |
| 43 | `server/inbound/admin-http/routes/forms/providers.ts` | 1 | 0 |
| 44 | `server/inbound/admin-http/routes/forms/pull-submissions.ts` | 1 | 1 |
| 45 | `server/inbound/admin-http/routes/forms/update.ts` | 1 | 0 |
| 46 | `server/inbound/admin-http/routes/integrations/create.ts` | 1 | 0 |
| 47 | `server/inbound/admin-http/routes/integrations/delete.ts` | 1 | 1 |
| 48 | `server/inbound/admin-http/routes/integrations/deliveries.ts` | 1 | 1 |
| 49 | `server/inbound/admin-http/routes/integrations/list.ts` | 1 | 1 |
| 50 | `server/inbound/admin-http/routes/integrations/pause.ts` | 1 | 0 |
| 51 | `server/inbound/admin-http/routes/media/get-providers.ts` | 1 | 1 |
| 52 | `server/inbound/admin-http/routes/media/import-url.ts` | 1 | 0 |
| 53 | `server/inbound/admin-http/routes/media/list.ts` | 1 | 1 |
| 54 | `server/inbound/admin-http/routes/media/put-providers.ts` | 1 | 1 |
| 55 | `server/inbound/admin-http/routes/media/text.ts` | 1 | 0 |
| 56 | `server/inbound/admin-http/routes/media/update.ts` | 1 | 1 |
| 57 | `server/inbound/admin-http/routes/media/where-used.ts` | 1 | 0 |
| 58 | `server/inbound/admin-http/routes/members/delete.ts` | 1 | 0 |
| 59 | `server/inbound/admin-http/routes/members/disable.ts` | 1 | 0 |
| 60 | `server/inbound/admin-http/routes/members/get-by-id.ts` | 1 | 1 |
| 61 | `server/inbound/admin-http/routes/members/list.ts` | 1 | 1 |
| 62 | `server/inbound/admin-http/routes/members/request-magic-link.ts` | 1 | 1 |
| 63 | `server/inbound/admin-http/routes/menus/assign-location.ts` | 1 | 1 |
| 64 | `server/inbound/admin-http/routes/menus/create.ts` | 1 | 0 |
| 65 | `server/inbound/admin-http/routes/menus/delete.ts` | 1 | 0 |
| 66 | `server/inbound/admin-http/routes/menus/get-by-id.ts` | 1 | 1 |
| 67 | `server/inbound/admin-http/routes/menus/list.ts` | 1 | 1 |
| 68 | `server/inbound/admin-http/routes/menus/update-tree.ts` | 1 | 1 |
| 69 | `server/inbound/public-http/routes/content/posts/get-by-slug.ts` | 1 | 0 |
