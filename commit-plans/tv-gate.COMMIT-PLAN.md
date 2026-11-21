# codex/tv-gate

Base: Tovu `0973a5fdc8` (`integ/merge-10-2026-11-21`).
`W` = `apps/website/src`; `A` = `apps/admin/src`.

Implementation status: all four sheets done; execution verification remains owed to the combine.
Tests were written before each sheet's production edits. No tests, builds, installs,
type-checks, linters, commits, staging, or pushes ran. Expected RED descriptions below
are source-based predictions, not executed results. Git metadata was left read-only.

## A10-ABORT-T

- Base: `0973a5fdc8`.
- DEPENDS: jx-w5 GATE-ABORT-J. Written against the sheet's additive Jini contract,
  as dispatched; no installed-build compatibility claim or dependency edit.
- Files: `W/contracts/core/gated-mutations/gateway.ts`;
  `W/features/database/tool-registrations.ts`;
  `W/assistant/__tests__/tool-registrations.database-recovery.test.ts`.
- Tests added: **Stopped migration during confirm authorization saves no token**;
  **Stopped migration after token save leaves approval unused**. The existing
  `startExecute` now returns its controller and supplies its signal to the real handler.
  Witnesses are installed after the real card opens.
- Expected RED before fix: missing confirm signal allows a token save after Stop;
  missing execute signal allows redemption and migration effects after Stop.
  Tests assert rejection, no saves or a still-minted token respectively, and unchanged effects.
- Mutation owed to combine: omit the migration `gatewayConfirm` signal; separately
  omit its `gatewayExecute` signal. Run both named cases with GATE-ABORT-J combined.
- API-baseline delta: additive `signal?: AbortSignal` on the two existing Tovu
  gateway input objects; zero API-baseline gate edits. Existing optional pads and
  spread forwarding are preserved. No import repoints, debt or manifest edits.
- Look owed: Chrome/Electron **Update database**, Stop during approval, no
  migrate-forward restore point before admission.
- File-size note: shared database/recovery test file is now 951 lines; continue
  under the owner's file-size correction.
- Diff re-read deletions: none; no incidental additions found.

## A18-ABORT-T

- Base: `0973a5fdc8` plus A10-ABORT-T.
- DEPENDS: jx-w5 GATE-ABORT-J.
- Files: `W/features/publish-content/tool-registrations.ts`;
  `W/features/publish-content/__tests__/execute-pull-tool.test.ts`.
- Tests added: **Stopped pull during confirm authorization saves no token**;
  **Stopped pull after token save leaves approval unused**. Both use `planned`,
  the returned controller and the real card/gateway.
- Expected RED before fix: missing confirm signal still saves approval; missing
  execute signal still redeems and applies. Tests assert rejection, zero saves or
  a still-minted token respectively, zero restore points and unchanged destination.
- Mutation owed to combine: omit the pull confirm signal; separately omit the
  execute signal. Run the two named cases after the Jini combine.
- API-baseline delta: zero; two existing call objects gain the signal. Permission,
  restore capability, error boundary and apply-report order are preserved.
  Zero import repoints, debt, manifest or lockfile edits.
- Look owed: Chrome **Apply pull**, then Stop during approval.
- Refresh: S13 has not been combined here; reconcile these two call objects if
  S13 lands first, retaining its baseline ordering.
- File-size note: `W/features/publish-content/tool-registrations.ts` has 516 lines;
  no file-size STOP applies.
- Diff re-read deletions: none; no incidental additions found.

## A19-ABORT-T

- Base: `0973a5fdc8` plus A10-ABORT-T and A18-ABORT-T.
- DEPENDS: jx-w5 GATE-ABORT-J.
- Files: `W/features/recovery/tool-registrations.ts`;
  `W/assistant/__tests__/tool-registrations.database-recovery.test.ts`.
- Tests added: **Stopped restore during confirm authorization saves no token**;
  **Stopped restore after token save leaves approval unused**. Both use a real
  seeded restore point, A10's controller and the existing artifact-spy pattern.
- Expected RED before fix: missing confirm signal permits approval to save;
  missing execute signal redeems approval and applies the artifact. Tests assert
  an unsuccessful call, zero saves or a still-minted token respectively, and no applications.
- Mutation owed to combine: omit `signal: confirmer.signal` from confirmation;
  separately omit the execute signal. Run both named restore cases.
- API-baseline delta: zero public baseline edits; the private confirmer input
  gains the sheet's required `signal: AbortSignal`. Its existing caller supplies
  the context signal. Result mapping and operation-lock API remain intact.
  Zero import repoints, debt, manifest or lockfile edits.
- Look owed: Chrome/Electron Stop during confirmed restore; current data remains
  when redemption is skipped.
- File-size note: the shared test file is 951 lines, as noted under A10.
- Diff re-read deletions: none; no incidental additions found.

## T46

- Base: `0973a5fdc8`, after the three cancellation sheets in this workspace.
- Files: `W/server/runtime/composition/other-site-keys.ts`;
  `W/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`;
  `W/features/project-keys/service.ts`;
  `W/server/inbound/admin-http/routes/system/credential-copy.ts`;
  `W/server/inbound/admin-http/routes/system/__tests__/credential-copy.tw4.pins.test.ts`;
  `A/features/security/api/security-api.types.ts`;
  `A/features/security/hooks/use-copy-keys.hooks.ts`;
  `A/features/security/CopyKeysDialog.tsx`;
  `A/features/security/__tests__/CopyKeysDialog.unit.test.tsx`.
- Tests added: **picker keeps fifty per source and reports each omitted count**
  with 51 A rows and 52 B rows; **shows omitted saved keys for each source**
  with counts 1/2 and an ordinary row. Extended the existing owner GET/POST case
  to require both source name and omitted count in GET; POST checks are intact.
  Kept the known-ID-beyond-list-limit case unchanged.
- Expected RED before fix: the bounded list has no omission metadata; GET drops
  the count; the dialog has no site-labeled notices. The tests require one count
  per overflowing source, exact notices and only the three actual-key radios.
- Mutation owed to combine: remove the listing limit; suppress `omittedCount`;
  remove it from GET projection; omit notice rendering. Run all three affected
  test files, including the unchanged known-ID case.
- API-baseline delta: optional `omittedCount?: number` on the three named row
  shapes; additive controller `omissions`; internal `MetaRow.sourceCount`.
  Zero API-baseline gate edits, imports, debt, package exports or manifest edits.
- Look owed: Chrome/Electron **Use a saved key** with two overflowing sources;
  inspect both counts and grant one visible key.
- Refresh: targeted importer inspection found no production consumer filtering
  the first metadata-bearing row or treating omissions as choices; see `REFRESH.md`.
- Diff re-read deletions: none; no incidental additions found.

## Static handoff audit

PASS against the supplied sheets: no new helpers, imports, casts, dependencies,
comments, argument pads or production seams; existing pads and args rules remain.
No edits outside the named production/test files and the two required handoff files.
Only targeted symbol lookups, source reads and diff review were used for discovery.

Affected declaration lengths, including declaration and closing lines:
gateway confirm/execute 3 each; migration handler 49; pull handler 49;
recovery confirmer 17 / restore runner 42; source reader 23 / key-list factory 20;
credential route registration 36; `useCopyKeys` 50; dialog 26.
Branch inspection found no affected function above complexity 10, treating nested
callbacks as their own functions. New test callbacks are also below both caps.
This was a source review, with no linter or metric runner invoked.

Function quality: no additional findings in these scoped edits. The variable-name
review confirmed `sourceCount` counts eligible rows before LIMIT and `omittedCount`
is the positive difference from 50; `omissions` never enters the selectable key list.
The count shares the existing query; only 50 metadata rows per source are returned.
Authorization, lock cleanup, token lifecycle and post-redemption behavior stay with
their existing owners. No check was added after redemption.

Open verification: combine Jini, execute named tests/mutations, then perform the
listed browser looks. Runtime/self-validation is unrun under the machine rule.
