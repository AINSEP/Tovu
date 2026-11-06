Programmer(Direct): Implemented only the Jini supervision pilot.

- Moved three implementations and eight dedicated test suites into `packages/sidecar/src/supervision/`.
- Kept compatibility facades and package exports; preserved function bodies, assertions and why-comments.
- Root cause: scattered lifecycle files, evidenced by `supervision/supervisor.ts:7` and `supervision/supervisor-node.ts:9`.
- Package typecheck passes. No tests run or added; `.git` untouched.
- Added runtime I/O: **0 calls × 0 bytes**.

[Handoff with changed files and all 11 exact `git mv` mappings](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/P7-feature-slices-pilot-handoff.md). Open: coordinator test execution and Git history recording.

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-jini/packages/sidecar
npx vitest run --maxWorkers=2 src/supervision/__tests__ src/__tests__/integration-surface.test.ts src/__tests__/supervisor-isolation.test.ts
npx vitest run --maxWorkers=2
```