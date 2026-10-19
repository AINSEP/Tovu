TDD(Direct): Loaded TDD for the test fixture fix.

Cause: `pickerProps` seeds saved grants as warning rows even when the probe returns no tools. Cleared both grant fields in this test, matching its sibling. Kept the empty-state wait and every focus assertion unchanged.

CHANGED FILES:
- [ExternalMcpToolsModal.unit.test.tsx](/Users/la/Programming/Tovu/apps/admin/src/features/settings/__tests__/ExternalMcpToolsModal.unit.test.tsx:80)

NOT DONE: Tests, typecheck, builds, package scripts, and git operations, as instructed.
