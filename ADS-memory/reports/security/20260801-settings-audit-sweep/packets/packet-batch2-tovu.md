You are performing a rigorous code audit as an external reviewer. Answer directly; do not perform any startup ceremony.

DO NOT READ `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or any `AI-Dev-Shop/` or `ADS-memory/` file. They are irrelevant and expensive. If you open one by reflex, stop and move on.

## Repo
`/Users/la/Programming/Tovu` — a TypeScript CMS whose React admin app (`apps/admin/`) embeds an AI assistant. Branch `feat/ai-chat-persistence`. Node server + Drizzle/SQLite.

## What you are auditing and why
These 37 files are the SECOND batch of least-recently-revisited code on this branch. Batch 1 covered the chat-persistence layer. This batch is mostly the **admin UI section components**, the **admin API client**, and the **assistant execution routes**. They have had the least recent scrutiny of anything remaining. Assume nobody has looked hard at them.

```
apps/admin/src/lib/api.ts
apps/admin/src/lib/execution-settings.ts
apps/admin/src/lib/agent-pages.ts
apps/admin/src/lib/router.ts
apps/admin/src/nav.ts
apps/admin/src/main.tsx
apps/admin/src/App.tsx
apps/admin/src/components/Sidebar.tsx
apps/admin/src/sections/AiAssistant.tsx
apps/admin/src/sections/CollectionEntries.tsx
apps/admin/src/sections/CollectionEntryEditor.tsx
apps/admin/src/sections/Collections.tsx
apps/admin/src/sections/Dashboard.tsx
apps/admin/src/sections/Database.tsx
apps/admin/src/sections/FormEditor.tsx
apps/admin/src/sections/FormsList.tsx
apps/admin/src/sections/IntegrationDeliveries.tsx
apps/admin/src/sections/Integrations.tsx
apps/admin/src/sections/MenuEditor.tsx
apps/admin/src/sections/Menus.tsx
apps/admin/src/sections/Pages.tsx
apps/admin/src/sections/Plugins.tsx
apps/admin/src/sections/PostEditor.tsx
apps/admin/src/sections/Posts.tsx
apps/admin/src/sections/Recovery.tsx
apps/admin/src/sections/Redirects.tsx
apps/admin/src/sections/Roles.tsx
apps/admin/src/sections/Taxonomy.tsx
apps/admin/src/sections/WidgetInstanceEditor.tsx
apps/admin/src/sections/WidgetRegionEditor.tsx
apps/admin/src/sections/WidgetRegions.tsx
apps/admin/src/sections/WidgetsLibrary.tsx
apps/admin/src/sections/Workspace.tsx
src/server/modules/assistant-execution.ts
src/server/routes/admin/assistant/detect-agents.ts
src/server/routes/admin/assistant/test-agent.ts
src/forms/manifest.ts
```

Read surrounding/imported files freely to judge correctness, but FINDINGS must be about the files above.

## What matters most, in priority order

1. **Server-side authorization on the assistant execution routes.** `detect-agents.ts`, `test-agent.ts` and `assistant-execution.ts` are real HTTP endpoints. Verify each one actually enforces authentication AND workspace-scoped authorization before doing work — do not assume a shared middleware covers it; trace it. A route that probes the local filesystem or makes outbound requests on behalf of an unauthenticated or wrong-workspace caller is the highest-severity bug class here.
2. **Credential handling.** `execution-settings.ts` and the execution routes carry a user-supplied `apiKey`. The documented intent is that it is used for exactly ONE outbound request and never persisted or logged. Verify that holds on ERROR paths, in thrown exception messages, and in anything returned to the client — not just the happy path. A sibling audit already found a real case where a non-error 2xx path returned an unredacted key, so check response paths specifically.
3. **Command/argument injection and path traversal.** `detect-agents.ts`/`test-agent.ts` detect and probe locally-installed CLI tools. If any caller-controlled value reaches a shell, a spawn argument, an env var, or a filesystem path, treat it as critical and prove the path.
4. **XSS and unsafe rendering in the React sections.** Look for `dangerouslySetInnerHTML`, direct DOM injection, `href`/`src` built from user content (a `javascript:` URL is a real finding), and any place server or user content is rendered as markup. `PostEditor.tsx`, `CollectionEntryEditor.tsx`, `WidgetInstanceEditor.tsx` and `FormEditor.tsx` are the likely candidates.
5. **API client correctness in `api.ts`.** Unchecked `response.ok`, silently swallowed non-2xx responses treated as success, missing error propagation, and any request that omits workspace scoping where siblings include it. A sibling audit found exactly this bug class in a related transport file, so look hard.
6. **React correctness in the sections**: state set after unmount, missing effect cleanup/abort, stale closures, races where a slow earlier fetch overwrites a fast later one, unstable dependency arrays causing loops, and unhandled promise rejections. Report these only where a concrete user-visible failure follows.

## Caveats that will otherwise waste your time
- The working tree has UNCOMMITTED modifications and other agents are actively editing OTHER files in this repo (chiefly `apps/admin/src/sections/SettingsUi.tsx` and CSS). None of those are in your list. Audit what is on disk; do not report uncommitted state as a defect.
- Do NOT report missing/incomplete CSS or visual styling — separately tracked and not your finding to make.
- Do NOT report that a settings control saves a value nothing consumes — that is a known, separately-documented gap. Report it only if the LISTED files contain a distinct, concrete defect.
- Do not report: formatting, naming, "add a comment", "extract a helper", test-coverage gaps as such, or anything you cannot tie to a concrete failure.

## Output format — strict

Return ONLY findings, most severe first. For each:

**[SEVERITY: CRITICAL | HIGH | MEDIUM | LOW] Short title**
- **File:** `path:line`
- **What is wrong:** one or two sentences.
- **Failure scenario:** concrete inputs or event sequence → the actual bad outcome. If you cannot write this, do not report the finding.
- **Fix:** the specific change.

End with `## Assessed and found clean` listing which of the six priority areas you checked and believe are sound, so absence of a finding is distinguishable from not having looked.

Do not pad. A short correct report beats a long speculative one. Do not report anything you have not verified by reading the actual code path.
