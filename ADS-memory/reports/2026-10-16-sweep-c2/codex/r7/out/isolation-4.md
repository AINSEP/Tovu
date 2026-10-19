Programmer(Execution): Chose Programmer for the minimal test setup fix. Added the existing isolation helper as the first import in all ten files. Static checks confirmed import order and paths. Comments and assertions preserved.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/readiness-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/recovery-restore-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/recovery-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/redirects-auth.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/redirects-create.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/render-depth-bound-site-serving.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed; runtime results remain unverified. No git commands or commits.
