Programmer(Execution): Chosen for the minimal test setup repair; persona loaded.

Added the existing isolation helper as the first import in all 10 files. Static inspection confirmed every `.js` path resolves correctly. Existing comments and fixtures are preserved.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/disable.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/list-access.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/list.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/write-policy-permission.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/http/__tests__/plugin-hook-error.pages.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/http/__tests__/plugin-hook-error.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-files.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-memory.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/comments/__tests__/moderate.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/comments/__tests__/settings.test.ts
```

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed. Git state was untouched. Runtime success remains unverified.
