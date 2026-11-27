# y5p-plugpub — Tovu handoff

## Scope and pinned inputs

- Tovu branch: `codex/tv-y5p-plugpub`.
- Tovu HEAD: `c84b1cba0e934e0ade9bb3183b40275b1b30e342`.
- Read-only Jini ref: `origin/codex/y5p-plugpubj`, SHA `42184dd1d89ad4d3b01a4862726bf29f770a7807`.
- Read the supplied `o-y5p-plugpubj/y5p-plugpubj.md` report and programmer instructions.
- Tovu only; no subagents; no git mutations; no installs, tests, builds, typechecks, linters, or counter runs.

## Completed design commits, in order

None. Every assigned file has an upstream prerequisite failure. No production files, callers, tests, or keep rules changed. This uncommitted handoff is the only new file.

## Stopped: adm-other — AgentPlugins and Plugins

Files left unchanged:

- `apps/admin/src/features/plugins/AgentPlugins.tsx`
- `apps/admin/src/features/plugins/Plugins.tsx`

Exact prerequisite failures at the pinned Jini ref:

- `packages/admin/src/screens/plugins/AgentPlugins.tsx` does not exist (`git show` exit 128).
- `packages/admin/src/screens/plugins/Plugins.tsx` does not exist (`git show` exit 128).

The supplied Jini report also says both moves remain blocked by the conflict between preserving existing why-comments verbatim and forbidding product-name text in Jini. Tovu cannot bind nonexistent screens. No replacement implementation or logic-bearing adapter was added.

## Stopped: adm-other — Providers

File left unchanged: `apps/admin/src/features/providers/Providers.tsx`.

The Jini Providers leaf and export exist, but its collaborator contract does not accept the live host hook directly:

- `packages/admin/src/screens/providers/Providers.tsx`, `bindProviders`: required `hooks.useExternalMcp` has signature `() => ...`.
- `packages/mcp/src/react/external-mcp/hooks/use-external-mcp.hooks.ts:92-95`: `bindExternalMcp` returns `useBoundExternalMcp(_required: Record<string, never>, _optional = {})`. Its first argument is required.
- `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts:13` exports the result of that binder.
- The current Providers controller adapts it with `() => useExternalMcp({})` at line 213. The new binding cannot keep that call: G3 explicitly forbids hook calls in retained Tovu bindings. Directly passing the reference does not satisfy the Jini no-argument function contract.

Stop rather than changing a Jini contract from the Tovu-only job, hiding the mismatch with a cast, or adding a forbidden host hook wrapper. The upstream contract must accommodate the existing required-object hook before this step can proceed.

Named callers checked: `panel-pages.ts` already loads Providers directly; `panels.tsx` already mounts that entry; `features/providers/index.ts` is already absent. Read the named Providers view, i18n, and controller tests. Their edits and the source-probe redirection remain dependent on a completed move.

## Stopped: adm-publish-content — confirmation hook

File left unchanged: `apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts`.

Exact prerequisite failure: `packages/cms/src/react/publish-content/hooks/use-publish-content-confirm.hooks.ts` does not exist at the pinned Jini ref (`git show` exit 128). The supplied Jini report confirms this move was stopped by the same comment/product-name conflict. The existing hook anchor is present at line 448. No binding or keep entry was fabricated.

## Tests first and named mutations

- No Tovu tests added or changed: each step stopped at its upstream prerequisite before implementation.
- The pinned Jini `packages/admin/src/screens/__tests__/y5-admin-surfaces.test.tsx` already contains the Providers localization, fallback, inert-body, and restart-label characterization. The upstream report records `DROP_EXTERNAL_MCP_RESTART_REQUIRED`: dropping the restart-required projection must fail the restart-label assertion. Read only; mutation sensitivity remains unverified.
- adm-other's specified sheet mutation is `EXTERNAL_MCP_LOST_UPDATE` (drop `expectedVersion` from a saved-source update). No new plugin characterization or mutation proof is claimed; the required screen leaves are absent.
- adm-publish-content's specified mutation is `EXECUTE_BEFORE_CONFIRM` (allow a planned phase to execute without a confirmation token). The `y5-publish-ceremony.test.tsx` work and mutation proof remain upstream/dependent; no execution evidence is claimed.
- No tests or mutation runs were executed, as the dispatch prohibits them.

## G3, keep ledger, and final review

- Deleted: none. Counted bindings: none. All four targets remain uncounted.
- `plans/count-1125/y5-adm-keeps.md` is unchanged; no unfinished path was added.
- Review used pinned source contracts, scoped symbol reads, and the final working-tree diff/status only.
- Architecture status: BLOCKER for the assigned extraction; required package leaves and a compatible Providers hook contract are unavailable. No architecture or behavior changes were made.
- Extra implementation deleted during final review: none; no implementation edits were made.
- Remaining work: the four stopped files and their dependent caller/probe updates. All other sheets and Jini edits are outside this job.
