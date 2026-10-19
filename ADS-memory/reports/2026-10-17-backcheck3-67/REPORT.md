# backcheck3-67 — round-2 checker: g-specs + j-jini-retry (2026-10-17)

## Commits
- Tovu 94049e801 docs(specs): g-specs docs. 1147(+1136) cross-surface embed spec, 1356 theme-bundles + theme-tiers/Liquid isolation specs, 1288 ADR-068 (PROPOSED), 1610 admin-surfaces draft, 1095/1107/1115/1143/1621 review outputs + 003/005/006 ledger appends.
  Checker fixes (Codex fix1/docs-index): wrong Jini parser path `core/embeds/marker.ts` changed to `packages/cms/src/widgets/markers/marker.ts`; bare `theme.ts:44` given its full path; new slices listed as DRAFT supplementary in the 043 and 004 spec-manifests; ADR-068 row moved after 067.
  Citations spot-checked as accurate: PostEditor.tsx:465, theme.ts:44, render.ts renderDocNode/renderWidgetPostContent/substituteHtmlEmbeds, panels.tsx anyOfPermissions/defaultReachable, medusa TODO.md:3.
- Jini (general-work, not pushed):
  - 8108f2df cms media purge reference check + Trash `still-referenced` outcome (1270)
  - 5a830234 core feature-flag evaluator (1502)
  - 137d0936 devops reachability keeps trying after protected (112)
  - cbb7a4b7 diagnostics opt-in page performance (87, partial)
  - 2a5fb095 protocol decodeApiError (1514)

## Tests
- Jini vitest, 9 named files: 141/141 GREEN (feature-flags, reachability-ports, reachability, protocol errors, media-service, blob-gc, trash service, page-performance, web-evidence-playwright). tsc --noEmit GREEN for protocol, core, cms, devops, diagnostics.
- RED→GREEN, argued from diff + test (nothing reverted):
  - media-service: the referenced-trashed and failing/absent-checker tests fail on HEAD, where purge ignored references.
  - reachability: the protected→200/503 cases fail on HEAD, where protected returned early.
  - trash service: the still-referenced test needs the new outcome.
- No mutation run (owner is working today).
- Thermal slip: one 4-second Jini vitest run (11:46) started while CPU_Speed_Limit was 74. My gate printed the value but did not stop the run. Every later run was gated.
- Home snapshot is unchanged (sites.json md5 405aff76…, 860 site-keys, 5 site dirs). No Tovu tests ran.

## Defects found → Codex
- fix1/fix-1270-purge:
  - (a) A referenced trashed media row made Jini `purgeSelected` throw. The admin Trash purge answered 500 and skipped later rows, and the assistant's trash_empty failed the same way. Fix: a new `still-referenced` per-row outcome. The Tovu media trash adapter maps MediaStillReferencedError to it, and the admin Trash copy and outcome type are updated.
  - (b) `forms/form-file-storage.ts` now got the Tovu purge wrapper without entryRefsRepo/postRepo. That caused a runtime TypeError and a type error, left the failed upload's asset behind, and made discard throw. Fix: the repos are wired from app.ts.
  - (c) Two import-placement nits in diagnostics.
- fix2: the reachability-ports test expected the un-normalized URL.
- fix3: in the trash service test, `repo.all()[0]` assumed row order. In page-performance.test, stubbing `Node` as a plain object broke vitest `toContain`.

## Waits on the Jini dist rebuild (JINI-BUILD-OK never appeared within 45 min, 12:03–12:48)
Rebuild cms, core, devops, diagnostics, protocol (protocol and core first). Then run the Tovu tests below plus the root typecheck, and commit. Only these hunks are mine:
- 1270:
  - apps/website/src/features/media/{index.ts,purge-media.ts,where-used.ts}
  - media/__tests__/mediawidget-where-used.test.ts
  - features/permanent-delete/__tests__/deps.test.ts
  - server/inbound/admin-http/routes/media/delete.ts
  - server/runtime/composition/{deps.ts (purgeAsset hunk), permanent-delete-deps.ts, app.ts (createFormFileStorage hunk)}
  - server/__tests__/admin-media-routes.test.ts
  - features/forms/form-file-storage.ts, forms/__tests__/common-fields.test.ts
  - features/trash/adapters/media.ts, trash/__tests__/marker-adapters.dialects.test.ts
  - server/inbound/admin-http/routes/trash/__tests__/request-contracts.test.ts
  - apps/admin/src/lib/api.ts (AdminTrashPurgeOutcome hunk)
  - apps/admin/src/features/trash/{rules.ts,trash-i18n.ts,__tests__/rules.unit.test.ts,__tests__/trash-i18n.unit.test.ts}
- 1502: apps/website/src/features/settings/{feature-flags.ts,index.ts (barrel hunk),__tests__/feature-flags.unit.test.ts}
- 87: apps/website/src/features/site-evidence/{agent-tools.ts,collect-page-evidence.ts,tool-registrations.ts,__tests__/unit/collect-page-evidence.unit.test.ts,__tests__/unit/tool-registrations.unit.test.ts}
- 1514:
  - apps/admin/src/lib/api.ts (decodeApiError hunks)
  - apps/admin/src/lib/__tests__/api-request-onok-and-null-body.unit.test.ts
  - apps/website/src/server/error-mapping/{INFO.md,respond.ts,__tests__/respond.test.ts}
  - server/inbound/admin-http/routes/analytics/recent-hits.ts
  - server/__tests__/route-async-guards.test.ts (recent-hits hunk)
  - server/__tests__/routes/analytics-recent-hits.test.ts
- NOT mine: features/settings/__tests__/site-title.test.ts and other lanes' hunks in api.ts and the composition files.

## Review notes (no action)
- 1514: the admin decoder keeps legacy `{error:"…",code}` behaviour on every other route. Only analytics/recent-hits sends the nested envelope, and no admin caller reads its body fields.
- 1270: this checks current references before deleting. It is not a cross-store lock, as the handoff says. "Must be trashed first" still raises MediaStillReferencedError, so in the Trash path an active-row race also maps to still-referenced.
- 1502: the facility has no consumer yet; that was what the item asked for.
- Not done (owner/coordinator): 1270 ingress, 87 signed-in tab, 1095/1107/1115/1143/1610 gates.
