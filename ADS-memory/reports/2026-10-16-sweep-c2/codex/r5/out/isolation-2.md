Programmer(Execution): Chosen for the minimal test setup repair; Programmer persona loaded.

Added the existing isolation helper as the first import in all 10 tests. Static verification confirmed correct `.js` paths and byte-for-byte preservation of all remaining content, including comments.

CHANGED FILES:

```text
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/sites/site-previews-listing.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/sites/sites-wiring.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/skills/__tests__/integration/skills-http.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/system/__tests__/integration/export-site.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/taxonomy/__tests__/list.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-svg-xss.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/themes/__tests__/integration/explore.integration.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/assign-role.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/attach-policy.test.ts
/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/users/__tests__/create-policy.test.ts
```

NOT DONE: Tests, typechecks, builds, package scripts, and git operations were not run, as instructed. Runtime results remain unverified.
