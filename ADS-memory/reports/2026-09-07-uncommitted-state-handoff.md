# Uncommitted working-tree state (2026-09-07 21:38)

Three agents were stood down on context size before committing. **All work is intact on disk but
UNCOMMITTED.** Do not `git clean`, `git stash`, or `git checkout` any path below.

## Committed and safe (do not redo)
```
d2bb8629 fix(assistant): actually restrict the admin-chat assistant's tool grant   [F-ISOLATE]
f2a03af9 docs(ads-memory): close the three settlement-sweep scope gaps
71daa2bf feat(post): content_post_duplicate, adminUrl, page.navigate error rewrap  [F-PAGECOPY]
4a982f72 fix(cli/serve-tests): scale runCliSync's timeout by load, delete debug copy
c5d10181 fix(assistant/mcp-federation): surface a refused federated tool CALL
c9a9ad7b fix(admin/posts): guard the Posts list reload against out-of-order responses
333eb70e fix(admin,website/mcp-federation): flag a deleted-but-still-live MCP connection
```

## UNCOMMITTED — F-WIRETOOLS (tool wiring, stopped ~450k)
Untracked:
- `apps/website/src/features/external-mcp/tool-registrations.ts` — the `external_mcp_*` wiring
  (5 tools: list/save/test_connection/oauth_connect/oauth_poll_device). This is the headline fix:
  the catalog existed but was never registered, so "connect me to Higgsfield" had no path.
  **Root `tsc` was reported non-zero with both errors inside this file** — assume unfinished.
- `apps/website/src/assistant/__tests__/tool-registrations.external-mcp.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.plugins-uninstall.test.ts`
- `apps/website/src/assistant/__tests__/tool-search-keywords.theme-copy.test.ts`

Modified: `assistant/tool-search-keywords.ts`, `features/plugin-runtime/agent-tools.ts`,
`features/plugin-runtime/tool-registrations.ts`, `server/runtime/composition/tool-catalog-manifest.ts`,
`assistant/tool-registrations.ts`, `assistant/index.ts`.

Its dispatch covered: external_mcp wiring, theme_copy_file, plugins_uninstall (+ correcting that
file's false "no admin route exists for uninstall" comment), and filling 26 tool ids that have NO
search-keyword entry (notably `sites_duplicate_site`, which has no "duplicate" keyword at all).
**Unknown how much of that landed.** Verify each against the file, do not assume.

## UNCOMMITTED — F-PAGECOPY (generic duplicate tool, stopped ~450k)
Untracked:
- `apps/website/src/assistant/duplicate-resource-registry.ts`
- `apps/website/src/features/content-duplication/agent-tools.ts`
- `apps/website/src/features/content-duplication/tool-registrations.ts`

See `2026-09-07-page-duplicate-tool.md`'s HANDOFF section for the design constraint that must be
preserved (resources contribute data via type-only import; `registerDuplicateResourceHandler` is
called ONLY at the composition root, or an `[assistant, features/post]` module cycle reopens).

## Shared files — three agents' edits are INTERLEAVED here
`assistant/tool-registrations.ts`, `assistant/index.ts`,
`server/runtime/composition/tool-catalog-manifest.ts`, `features/post/*`.
**Do not commit these as one unit.** Separate by concern, verify each compiles.

## First action for whoever picks this up
Run root `npx tsc -p tsconfig.json --noEmit` and fix what is broken in
`features/external-mcp/tool-registrations.ts` before anything else — the tree does not currently
typecheck, and every later verification is meaningless until it does.
