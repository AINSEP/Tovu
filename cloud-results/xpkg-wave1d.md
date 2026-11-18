# xpkg-wave1d (Tovu half)

Full report: `cloud-results/xpkg-wave1d.md` on Jini branch `wave1/xpkg-C9c-C12OBS`.

- Tovu commit `331d9388` (base `232764af5`), checked against Jini `3dae173e`: `userManagementKit` in `apps/admin/src/integrations/jini-kits.ts`, `UserManagementKitProvider` mounted in `apps/admin/src/main.tsx`, host integration test `apps/admin/src/integrations/__tests__/user-management-kit.integration.test.tsx` (4 tests, real implementations).
- `npm run typecheck` exit 0 (base also 0). `check:size`, `check:complexity`, `check:architecture` red on the base and byte-identical after (no worse). `check:hooks` exit 0, identical.
- apps/admin vitest: new test + 4 files that import `jini-kits` = 5 files / 48 passed; the full admin suite was not run.
- C12-OBS: SKIPPED, no Tovu change (census drift: three Tovu importers of moved names are not in the sheet, one listed file no longer exists; see the Jini report).
- Overlap: `jini-kits.ts`, `main.tsx` (R1c, R2a rebase additive lines).
