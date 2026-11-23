# Route Tests

Route-level and transport integration tests should live here.

Examples:

- request parsing and content-type handling
- status-code and error-envelope mapping
- delivered vs degraded success responses
- middleware-driven request-context and authorization behavior

## Wiring

`recovery-routes.test.ts` mounts the real `register*Recovery*` registrars from
`runtime/composition/modules/database-recovery.ts`, which bind the Jini specs'
`computeDisclosure` / `resolveDeepLinkContext` / `listRestorePoints` deps to `@jini-ai/db`. The
Jini spec tests use typed fakes for those deps; the tests here pin what the host bindings forward
and the exact wire bodies.
