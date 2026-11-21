# Tovu owner sheets — codex/tv-own

Base supplied by dispatch: `0973a5fdc8` (`integ/merge-10-2026-11-21`). Scope: seven Tovu sheets from `r62t-rsy-4.md`, in the requested order. No subagents, git writes, installs, tests, builds, type checks, linters, mutations, packaging or browser runs were performed. Status `done` below means edits written and diff reviewed; combine owns execution evidence. Existing tests were read first; new behavior assertions were written before production edits.

## SHARE-ZIP — STOPPED

- Base: `0973a5fdc8`, including merged `tv-sharezip`.
- Files: none; stopped before editing tests or production.
- Blocker: sheet step 2, `apps/website/src/features/site-backup/share-service.ts:136` / `:144`. The exact required expression `const deliveryStorage = row.storage && !row.credentialWarnings?.length;` yields a boolean or an absent value, but the same step requires `deliveryStorage.key`. This cannot preserve the storage key as written. A cast cannot repair the value. The sheet needs to authorize an object-preserving expression, such as `const deliveryStorage = !row.credentialWarnings?.length && row.storage;`, before execution can continue.
- Tests: none added. All named owner-download, static ZIP, provider-refusal, public-token and admin acknowledgement cases remain owed after correction.
- Mutation owed to combine: unconditional full/static ZIP guards; 409 status; provider refusal removal; public-token warning-predicate removal.
- API-baseline delta: none.
- Look owed after correction: warned owner GET → acknowledge → download; warned provider refusal; clean public download.
- Diff re-read deletions: none. Owner acknowledgement behavior remains unmodified because the sheet stopped.

## Q3 — done

- Base: `0973a5fdc8`.
- Files: `apps/website/src/features/site-backup/backup-service.ts`; `apps/website/src/features/site-backup/__tests__/integration/archive-round-trip.integration.test.ts`.
- Tests first: parameterized the existing repository round trip into clean/warned sources. The clean source removes only `themes/static/site/credential.js` before planning and retains inventory, scope and saved-key assertions. The warned source requires a successful plan followed by the exact `UNSAFE_FILE` refusal, no write routes, no uploaded blobs and an unchanged tip. Before the guard, the warned branch pushes successfully and violates those assertions; this is source reasoning, not an executed RED.
- Implementation: one warning guard after repository/parent checks and before `uploadBackupPlan`; deferred freshness logic retained. Existing `_optional` declarations unchanged. `pushPlannedBackup` occupies 49 physical lines after the guard; no extraction or reformatting added.
- Mutation owed to combine: remove the warning guard; the warned case must fail. Run the clean round trip and confirm no second warning source.
- API-baseline delta: none; existing refusal shape reused.
- Look owed: none.
- Refresh: additional test importer `features/source-control/__tests__/github-backup-secrets.integration.test.ts` recorded in `REFRESH.md`; no production importer additions or repoints.
- Deletions required by sheet: three warned-byte/warning-on-success assertions. Diff re-read deletions: none beyond those named removals.
- File-size note: `backup-service.ts` is 801 lines after Q3 and T7; continuing under the owner correction.

## ARCH-CYCLE — done

- Base: `0973a5fdc8`; baseline witness is the sheet's Combine-10 B3 runtime comparison, not a fresh local graph run.
- Files: `development/scripts/check-architecture.baseline.json` only.
- Tests first: existing removed-pair acceptance check, using the supplied witness. No new test case.
- Implementation: removed only `features/custom-credentials <-> features/source-control` from `moduleCycles.pairs`; count 2 → 1; `largestScc: 2` and the assistant/external-MCP pair retained.
- Mutation owed to combine: restore the removed row and count; require removed-pair check failure. Accept one live pair and zero removed baseline pairs; report runtime propagation separately.
- API-baseline delta: none; only the named cycle debt row changes.
- Look owed: none.
- Diff re-read deletions: only the required obsolete pair; no extra deletions.

## ENGAPS-T2-PREP — done

- Base: `0973a5fdc8`, including merged `tv-engaps2`.
- Files: `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts` only.
- Tests first: existing identity re-seed and Constitution Article VIII cases; no new test case or expected pre-refactor RED.
- Implementation: extracted only `seedAndConflictOwnerRole`, `installOtlpProvider`, and `assertExportedRequestSpan`. Original statements, assertions, casts and why-comments moved verbatim except required indentation. Replaced each block with one awaited call; restart, collector lifetime and outer cleanup remain in place. The two OTLP helpers are immediately before their shared provider test. No new cast or pad.
- Mutation owed to combine: omit `installOtlpProvider`; existing span assertion must fail. Real CLI/provider witness owed.
- API-baseline delta: none; named helpers are private with the sheet's object inputs.
- Look owed: none.
- Diff re-read deletions: only original copies of the three moved blocks; no extra deletions.
- File-size note: the test file is 806 lines after PREP and T2; continuing under the owner correction.

## ENGAPS-T2 — done

- Base: `0973a5fdc8` plus ENGAPS-T2-PREP.
- Files: `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts` only.
- Tests first: existing foreign-CWD and AC-08 seeded-route cases; no new test case or expected pre-refactor RED.
- Implementation: added the named `initSite` import; made `initFixture` async with the specified Promise annotation; replaced only its init subprocess/status assertion with `await initSite({ dir, name }, { withSampleContent: true })`. Awaited all 16 calls, retaining `initFixture("Dir Wins")`; made only the four named synchronous test callbacks async. Actual serve subprocess assertions unchanged.
- Mutation owed to combine: remove `withSampleContent: true`; AC-08 must fail. Complete the serve integration run and provider witness, and compare fixture subprocess counts and elapsed time on the same linked build.
- API-baseline delta: none; existing fixture parameters preserved.
- Look owed: none.
- Deletions required by sheet: fixture init subprocess and its status assertion. Diff re-read deletions: none beyond those named removals.

## PERFOBS-T7 — done

- Base: `0973a5fdc8`, including merged `tv-xd5-publish`, after Q3.
- Files: `apps/website/src/features/site-backup/backup-service.ts`; `apps/website/src/features/site-backup/__tests__/push-cancellation.unit.test.ts`.
- Tests first: added only the named `recordBackupOperations` helper and no-op-port import. Three new cases cover held upload plus repeat polling/completion, moved-branch refusal, and injected provider-getter rejection; extended both existing cancellation variants. Every new assertion carries a plain-words message. Before observation, each operation-log assertion sees an empty log rather than the required start/settlement; this is source reasoning, not an executed RED. Refusal/result and rejection identity assertions preserve existing behavior.
- Implementation: private `runObservedBackupPush` uses the existing optional observability port; absent port delegates directly. One operation wraps the job promise and settles completed, cancelled, not_pushed or failed; rejection rethrows unchanged. Changed only the job callback's callee. Admission, wait, cancellation, cleanup and archive code unchanged.
- Mutation owed to combine: instrument wait instead of the job; classify cancellation as not_pushed; bypass refusal or rejection settlement separately. Each corresponding operation assertion must fail.
- API-baseline delta: none; operation name `site.backup` uses the existing observability contract.
- Look owed: none.
- Diff re-read deletions: none.
- Cost: one operation per observed push job, constant extra retained operation state until settlement; no new timer, queue, retry or upload.

## WORKER-TOVU — done; dependency pending

- Base: `0973a5fdc8`.
- **DEPENDS: jx-w4 WORKER-JINI** — combine must supply the packed CMS candidate with all three narrow subpaths. No local package pin, manifest, dependency or lockfile edit.
- Files: `apps/website/src/server/inbound/public-http/http/site/render/content-html.ts`; `apps/website/src/server/inbound/public-http/http/site/render/contact-form-widget.ts`; `apps/website/src/server/inbound/public-http/http/site/render/widgets/media.ts`; `apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts`; `apps/website/src/features/widgets/deps.ts`; `.dependency-cruiser.mjs`.
- Tests first: read existing Handlebars/Liquid source/runtime, public-page, product and member-page graph cases. No new cases; the sheet identifies seven baseline graph failures. Local graph execution is prohibited; combine target is 26/26 against the candidate.
- Implementation: exactly the three CMS import replacements, SEO leaf import, five named post-leaf import lines, and two post public-entry additions. Other symbol uses retain imports as expressly directed by the sheet.
- Mutation owed to combine: restore each CMS import separately; restore SEO barrel; restore post barrel. Require the named worker/page/product/member failures.
- API-baseline delta: no new exported symbols; only `post-update` and `post-trash` added to `PUBLIC_ENTRIES["features/post"]`. Three upstream CMS API additions belong to WORKER-JINI.
- Look owed: rendered page with SEO head and widget, plus existing static form appearance.
- Diff re-read deletions: only replaced import lines; no extra deletions.
- File-size note: `.dependency-cruiser.mjs` remains 885 lines; continuing under the owner correction.

## Review and execution boundary

- Scoped diff re-read completed; no unlisted production edits, new dependencies, helpers beyond sheet names, new casts, suppressions, wrappers, options or comments. Existing pads remain untouched. New private helper signatures follow their explicitly prescribed sheet inputs; no speculative options pads added.
- Reuse: Q3 reuses `pushRefusal`; T7 reuses `trackOperation` and the named static-publish fake-port precedent; T2 calls the existing `initSite` owner; worker changes reuse the named existing leaves. No platform module introduced.
- Architecture review: WARNING / execution evidence pending. Static changes follow the sheet boundaries, but packed worker graph, runtime cycle graph, provider witness and browser looks are unverified. SHARE-ZIP is blocked by its own inconsistent expression.
- Documentation: original comments retained/moved verbatim; no public API added; no new code comments under the owner rule.
- Function review (manual only; no metrics tools): Q3 push body 49 lines; observed wrapper 12; extracted helpers 35/25/25; split identity/provider callbacks 43/36. New operation bookkeeping uses constant time/space; the push retains its existing bounded upload cost. Manual branch review found no added function above the named limits; combine must validate mechanically.

| Unit | Disposition | Evidence / remaining work | Local fix |
| --- | --- | --- | --- |
| `pushPlannedBackup` | INCONCLUSIVE | Named clean/warned assertions written; runtime and mutation prohibited locally | Named guard only |
| Three CLI extractions / `initFixture` | INCONCLUSIVE | Verbatim moves and 16 awaited calls reviewed; real CLI/provider evidence owed | Named extracts and direct fixture init |
| `runObservedBackupPush` / operation recorder | INCONCLUSIVE | Named outcomes, polling and rejection identity asserted; execution owed | Named job wrapper only |
| Worker import boundaries | INCONCLUSIVE | Exact imports reviewed; packed candidate and graph evidence owed | Named import replacements only |

No measured test, coverage, performance, graph or browser result is claimed. Self-validation was not run because the dispatch explicitly prohibits tests/builds and assigns runtime execution to combine. Suggested next routing: combine for the six edited sheets; sheet correction for SHARE-ZIP.
