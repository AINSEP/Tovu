Programmer(Execution): Used Programmer + TDD personas to implement the fix and write the regression first.

Reused migration’s rewriter through a shared helper. Duplication now rewrites exact source-theme prefixes in staged text files before storing the original. Added assertions for similar IDs, binary preservation, and unchanged source files.

CHANGED FILES:

- [asset-path-rewrites.ts](/Users/la/Programming/Tovu/apps/website/src/features/theme/asset-path-rewrites.ts)
- [duplicate-theme.ts](/Users/la/Programming/Tovu/apps/website/src/features/theme/duplicate-theme.ts)
- [migrate-theme.ts](/Users/la/Programming/Tovu/apps/website/src/features/theme/migration/migrate-theme.ts)
- [duplicate-theme.test.ts](/Users/la/Programming/Tovu/apps/website/src/features/theme/__tests__/duplicate-theme.test.ts)

NOT DONE: No tests, typecheck, builds, package scripts, or git commands ran, per instructions. RED/GREEN remains unverified.
