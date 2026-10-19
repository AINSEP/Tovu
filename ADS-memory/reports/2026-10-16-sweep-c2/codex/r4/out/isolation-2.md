Programmer(Execution): Selected Programmer for the minimal test setup fix.

Added the existing isolation helper as the first import in all eight files. Static review confirmed correct paths and byte-for-byte preservation of all remaining content, including comments.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/skills/__tests__/unit/install-tool.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/source-control/__tests__/tool-registrations.dry-run.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/source-control/__tests__/tool-registrations.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/taxonomy/__tests__/get-assigned-terms-tool.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/taxonomy/__tests__/tool-registrations.assign-terms-validation-status.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/theme/__tests__/menu-authored-html.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/theme/__tests__/template-render.canary.test.ts

NOT DONE: Tests, typecheck, builds, and package scripts were not run, as instructed. No git commands or git-state changes. Runtime results remain unverified.
