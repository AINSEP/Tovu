Programmer(Execution): Chosen for the test-only import fix. Added the existing isolation helper as the first import in all ten files. Static comparison confirmed only those import lines changed and both relative paths resolve.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-agent-list-live-models.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-byok-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-chats-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-proxy-routes.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-run-finalizer.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/b07-admin-permission-gaps.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/content-type-write-provenance.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/identity-policy-permission-removal.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/boot-lifecycle-real-deps.integration.test.ts

NOT DONE: Tests, typecheck, builds, package scripts, commits, and git operations were not run, as instructed. Runtime results remain unverified.
