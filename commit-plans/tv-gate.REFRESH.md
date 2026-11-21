# codex/tv-gate refresh

Base: Tovu `0973a5fdc8`. `W` = `apps/website/src`; `A` = `apps/admin/src`.

- A10-ABORT-T, A18-ABORT-T, A19-ABORT-T: **DEPENDS: jx-w5 GATE-ABORT-J**.
  The dispatch explicitly requested writing against its sheet while Jini runs
  in parallel. No Jini working tree, package version or lockfile was changed.
  The combine must supply the additive Jini confirm/execute signal contract and
  run its three boundary tests/mutations, including abort after redemption.
- A10: the named handler, fixture, gateway and effects seam are present. The
  controller is added only to the existing test helper; no production seam was needed.
  Existing gateway consumers may omit the additive signal, as the sheet permits;
  they retain their imports and behavior. No repoints are needed.
- A18: source matches the sheet's original call objects. S13 has not been merged
  into this candidate. Refresh the two call objects if S13 arrives before combine;
  preserve its baseline ordering and these signals.
- A19: named confirmer and runner are present. Existing recovery result mapping
  and operation-lock API required no changes.
- T46: targeted `git grep -n -F` lookups of the named symbols confirm the source
  reader feeds `createKeyList`, the service forwards choices with `...row`, the
  GET route maps every choice, the security API preserves the response, and
  `AccessTokensTab` passes the whole controller to `CopyKeysDialog`. No production
  consumer on this path filters away the first key or treats a notice as a radio.
- Additional test consumers observed: `A/features/security/__tests__/AccessTokensTab.unit.test.tsx`,
  `A/features/security/hooks/__tests__/use-copy-keys.unit.test.tsx`, and
  `A/features/security/__tests__/copy-keys.fixture.ts`. Existing additive types
  and inferred controller results need no repoints or fixture edits. The API
  request-shape and endpoint tests likewise retain their imports and request shapes.
- All imports stay in place. No unlisted production importer required an edit;
  no sheet STOP condition was found during the scoped source review.
- Eight named test cases were added and one existing route case extended,
  tests first per sheet. No test execution, mutation run or browser look occurred;
  expected RED reasons and combine obligations are in `COMMIT-PLAN.md`.
