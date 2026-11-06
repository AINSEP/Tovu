# older-fixes — in progress

Branch: `cloud/older-fixes`. Base: `c11d491f3cb2a695caa5d0f2e700581d747af735`.

O01–O08 pending; C11–C30 pending focused traces. C01–C10 excluded as instructed.

Setup: rebuilding Jini from the specified base before relinking Tovu; focused baselines follow.

## Bugs found

- O01: static options use allocated archive folder names.
- O02: export history has no type label.

O01 fixed: static options return installed theme titles; archive allocation unchanged. Old backend assertion expected folder names and now asserts the installed titles.
O02 fixed: history Type column uses the established `.tovu.zip` backup filename contract. Chrome follow-up: check picker titles, Type column width and mobile cards.
Tests: `node --import tsx --test --experimental-test-module-mocks apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts` — 12 pass after red (11 pass, 1 fail).
Tests: `npm --prefix apps/admin run test -- src/features/sites/__tests__/SiteExportTab.history.unit.test.tsx` — 2 pass after red (1 pass, 1 fail).
Baseline: `pnpm -r build` in Jini fails in provider-plugins (fix-round scope). Remaining-package build fails in chat on existing test import of @jini-ai/ui-kit/react. Contracts rebuilt and local Jini links refreshed.
