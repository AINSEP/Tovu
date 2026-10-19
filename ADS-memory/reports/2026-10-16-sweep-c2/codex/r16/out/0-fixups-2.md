TDD(Direct): Chose TDD to fix test cleanup; persona loaded.

CHANGED FILES:
- /Users/la/Programming/Tovu/apps/website/src/features/settings/__tests__/publish-content.round-trip.test.ts

Changed five cleanup hooks to use `db.$client.close()`, matching sibling tests. Assertions unchanged.

NOT DONE: Tests, typecheck, builds, package scripts, and git operations; coverage remains unverified.

VERDICT: test bug — `publish-content.round-trip.test.ts:366,379,395,416,427`.
