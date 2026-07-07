# Progress Ledger

- workstream: tovu-shell-admin
- scope_type: direct-run
- owner: Programmer(Execution)
- started_at: 2026-04-06T00:00:00Z
- last_updated_at: 2026-04-07T06:30:00Z
- related_state_file: N/A
- active_spec_hash: N/A
- evaluator_mode: not-needed
- evaluator_contract: N/A

## Current Objective

Keep building the first runnable Tovu shell with a WordPress-shaped admin, a real-feeling TipTap editor, and theme switching that proves the frontend is actually changing.

## Last Verified Good State

- `tovu` backend tests passed with `npm test`
- `tovu` typecheck passed with `npm run typecheck`
- `tovu/nextjs` typecheck passed with `npm run typecheck`
- `tovu/nextjs` production build passed with `npm run build`
- Live HTTP smoke checks succeeded for:
  - `http://localhost:3001/admin/workspaces/workspace-local`
  - `http://localhost:3001/admin/workspaces/workspace-local/posts`
  - `http://localhost:3001/admin/workspaces/workspace-local/posts/post-home`
  - `http://localhost:3001/admin/workspaces/workspace-local/appearance`
- `AI-Dev-Shop/` was pulled to commit `f70bd7c`
- AI Dev Shop capability probe now reports `codex-cli browser_automation: enabled`

## Recent Progress

- Added a WordPress-style admin frame in `tovu/nextjs` with:
  - left rail
  - top admin bar
  - dashboard home
  - posts index
  - appearance screen
  - placeholder routes for other wp-admin sections
- Upgraded the TipTap editor from a sparse demo toolbar to a fuller editing surface with heading, formatting, list, quote, code, undo, and redo controls.
- Replaced the seeded welcome post body with richer TipTap JSON so the editor and public render show headings, lists, blockquote, and code block immediately.
- Expanded the public rich-text renderer to support heading attrs, code blocks, and link marks.
- Added the WordPress reference link under “Admin Dashboard” on the Tovu admin home page:
  - `https://leonucla.wordpress.com/wp-admin/index.php`
- Pulled `AI-Dev-Shop/` forward from `d3fa5fa` to `f70bd7c`, which adds browser automation capability wiring and Playwright MCP guidance.

## Next Actions

1. Start a fresh Codex session so the newly configured Playwright MCP/browser automation capability can be picked up by the live tool surface.
2. Use browser automation to visually inspect:
   - the admin dashboard
   - the posts list
   - the TipTap editor page
   - the appearance/theme switcher
3. Continue copying the WordPress admin dashboard structure and styling more precisely, then move on to real post creation/list flows and later auth.

## Blockers Or Open Questions

- The current session verified browser automation at the client/framework level, but the live tool surface in this session may still be stale. A fresh session is the expected fix.
- The admin shell is structurally WordPress-like now, but it has only seeded content and placeholder sections.
- There is still no real post creation flow yet, only editing seeded posts.
- There is still no auth gate yet.

## Artifact References

- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/components/admin/admin-shell.tsx`
  - reusable admin frame with left rail and top bar
- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/app/admin/workspaces/[workspaceId]/page.tsx`
  - WordPress-style admin dashboard home
- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/app/admin/workspaces/[workspaceId]/posts/page.tsx`
  - seeded posts index
- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/app/admin/workspaces/[workspaceId]/posts/[postId]/page.tsx`
  - TipTap editor route
- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/app/admin/workspaces/[workspaceId]/appearance/page.tsx`
  - theme switcher route
- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/components/post-editor/post-editor-client.tsx`
  - upgraded TipTap editor client
- `/Users/la/Desktop/Tovu AI CMS/tovu/nextjs/app/globals.css`
  - current admin/dashboard/editor styling
- `/Users/la/Desktop/Tovu AI CMS/tovu/src/server/app.ts`
  - seeded workspace/posts/theme state
- `/Users/la/Desktop/Tovu AI CMS/tovu/PROJECT_MEMORY.md`
  - compact project reference context
- `/Users/la/Desktop/Tovu AI CMS/AI-Dev-Shop/framework/routing/capability-probes.tsv`
  - browser automation capability entry now present
- `/Users/la/Desktop/Tovu AI CMS/AI-Dev-Shop/skills/browser-live-analysis/SKILL.md`
  - browser automation skill added in `f70bd7c`

## Failure Cluster History

| Cluster | Retry Count | Files Touched | Current Hypothesis | Next Different Approach |
|---|---:|---|---|---|
| browser-automation-session-surface | 1 | `~/.codex/config.toml`, `AI-Dev-Shop/framework/routing/capability-probes.tsv` | MCP config and framework capability wiring are now correct, but this already-running session may not expose the new browser tool surface retroactively. | Start a fresh session and verify browser automation before attempting live browser diagnosis. |
| tiptap-shell-first-pass | 1 | `tovu/nextjs/components/post-editor/post-editor-client.tsx`, `tovu/nextjs/app/globals.css`, `tovu/src/server/app.ts` | The earlier editor looked wrong because it was a thin StarterKit setup with almost no toolbar/content styling, not because TipTap was missing. | Continue refinement using live browser inspection instead of relying only on HTML/output checks. |

## Resume Instructions

Start the next session from `/Users/la/Desktop/Tovu AI CMS`.

Read first:
- `/Users/la/Desktop/Tovu AI CMS/ADS-project-knowledge/reports/continuity/tovu-shell-admin/progress-ledger.md`
- `/Users/la/Desktop/Tovu AI CMS/tovu/PROJECT_MEMORY.md`

Then verify:
1. `codex mcp list`
2. `bash AI-Dev-Shop/harness-engineering/validators/probe_host_capabilities.sh --host codex-cli --capability browser_automation`

If browser automation is exposed in the fresh session, inspect these routes visually:
- `http://localhost:3001/admin/workspaces/workspace-local`
- `http://localhost:3001/admin/workspaces/workspace-local/posts`
- `http://localhost:3001/admin/workspaces/workspace-local/posts/post-home`
- `http://localhost:3001/admin/workspaces/workspace-local/appearance`

Do not spend time re-debugging the old Turbopack/RSC failure path unless it reappears. The shell is currently running against the webpack dev path and passed build/typecheck.
