# tv-z3 refresh notes

- AP-T targeted `createVanillaToolConfirmation` lookup also reaches
  `apps/admin/src/features/ai-assistant/__tests__/VisitorToolsPanel.unit.test.tsx:17,101`.
  This is a test-only consumer with the existing injection signature; no import
  repoint or edit is needed. No unlisted production consumers were found by the
  three named AP-T symbol lookups.
- AP-T remains stopped on the existing vanilla function size, recorded in
  `COMMIT-PLAN.md`. Its source, locale rows, and tests remain unchanged.
