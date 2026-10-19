Programmer(Execution): Chose Programmer for the minimal test setup repair.

Added the existing isolation helper as the first import in all nine files. Static verification confirmed correct paths and preserved every original byte and comment. The busy-plugin test also calls unisolated `createRouteDeps()`, consistent with the reported guard failure.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/__tests__/autosave.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/__tests__/revision-attribution.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/__tests__/template-preview-render.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/__tests__/update.featured-image.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/posts/__tests__/update.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/get.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/rescan-themes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled-busy.integration.test.ts

NOT DONE:

- Tests, typecheck, builds, and package scripts were not run, as instructed; runtime results remain unverified.
- No git operations, Jini edits, or production-file edits.
