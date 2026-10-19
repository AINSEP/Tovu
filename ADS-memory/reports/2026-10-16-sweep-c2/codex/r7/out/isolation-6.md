Programmer(Direct): Selected Programmer for the minimal test setup fix.

Added the existing isolation helper as the first import, with the correct relative path and `.js` suffix, in all 10 files. Static checks confirmed each helper path resolves and all original content, including comments and assertions, is unchanged.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/settings-workspace-scoping.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/site-phase-handler-fail-policy.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/sites-route-agent-plugin-tokens.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/sites-route-restart.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/sites-route.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/source-control-credentials-route.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/system-routes-gap-fill.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/taxonomy-merge-term-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/theme-file-copy-rename-route.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/theme-file-save-route.integration.test.ts

NOT DONE:

- Tests, typecheck, builds, and package scripts were not run, as instructed; runtime success remains unverified.
- No git commands were run or git state changed.
