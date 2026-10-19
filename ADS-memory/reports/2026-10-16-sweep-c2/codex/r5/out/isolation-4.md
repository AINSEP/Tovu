Programmer(Execution): Chosen for the minimal test setup fix; persona loaded.

Reused `isolated-catalog-home.js` as the first import in all 10 files. Static checks confirmed correct paths and import-only changes; all comments and assertions are preserved.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/external-mcp/__tests__/built-in-connection.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/integrations/__tests__/create.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/integrations/__tests__/integration/create-delete-pause.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/media/__tests__/import-url.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/media/__tests__/integration/providers.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/media/__tests__/providers.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/media/__tests__/update.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/media/__tests__/upload-concurrent.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/media/__tests__/upload.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/members/__tests__/disable.test.ts
```

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed. No git operations performed. Runtime success remains unverified.
