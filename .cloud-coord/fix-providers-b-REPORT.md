# fix-providers-b REPORT (2026-10-21, unattended, 21:31–22:10 UTC)

Branches (all pushed, clean): Tovu+Jini `cloud/fix-email-dns-2026-10-21`, Tovu+Jini `cloud/fix-search-2026-10-21`.
J = Jini commit, T = Tovu commit. A failing test was written first for every behaviour fix. 3 Opus subagents (DNS, email, search).

## 13-dns.md (email-dns branch)
| # | finding | outcome |
|---|---|---|
| 1 H | plan.ts A/AAAA deleted for TXT/MX-only names | fixed J8fd903fa |
| 2 H | destructive changes ignore managedBy | fixed J8fd903fa, ccc8ee2a (blocker `record_not_owned`) |
| 3 M | manual inventory "complete" without NS/SRV; drops unreadable | fixed J84de031f |
| 4 M | ancestor CAA not fetched | fixed Tbb2db6ad |
| 5 M | queryNs used recursive resolver | fixed J162b8e95, Tb333fad0 (raw NS query to parent servers) |
| 6 M | one matching answer = propagated | fixed J2107b2e4 (stale RRset values / >1 SPF -> mismatch) |
| 7 M | requirement names not checked against zone | fixed Tbb2db6ad (mixed-zone -> ToolInputError) |
| 8 M | binding upsert overwrites newer state | fixed T8300b48a (CAS, migration 0026 version col) |
| 9 M | IPv6 not canonicalized | fixed J61f09fe8, ccc8ee2a (`canonicalIpv6`, RFC 5952) |
| 10 M | Node resolver in Tovu | fixed J162b8e95 (`@jini-ai/devops/dns/node`), Tb333fad0 |
| 11 M | isMxValue positional | fixed J61f09fe8 (`isMxValue({value},{})`) |

## 12-email.md (email-dns branch)
| # | finding | outcome |
|---|---|---|
| 1 H | lockfile pins old Jini / Unreleased | listed (release order: platform 0.5.9 published, changes Unreleased) |
| 2 H | inbox commits before suppression | fixed Je22da6b2, T8bddd8fb, 4ecb9de4 (processed_at, migration 0025; replay re-applies) |
| 3 H | concurrent unknown-outcome resend | fixed J17cb1b7a, T8bddd8fb (atomic reclaim in reserve) |
| 4 H | quota deferral burns outbox attempts | fixed T8dd249a7 (inline wait <=2s via sleep port, else fresh continuation event) |
| 5 M | Resend 429 terminal | fixed J7a8fab21, T45b4cf9c (`MAIL_RATE_LIMITED`, retryAfterMs) |
| 6 M | transactional reserve 0 at burst 2 | fixed J195d047d |
| 7 M | unsigned flood blocks signed feedback | fixed Je1502f9e |
| 8 M | console provider hides links | fixed Jcd60171f |
| 9 M | payload hash incomplete | fixed J8ff3bbe7, 086a7b55 |

## 23-search.md (search branch)
| # | finding | outcome |
|---|---|---|
| 1 H | @jini-ai/search undeclared | fixed Tb4272afa (manifest `^0.1.0`); lockfile/publish listed (release order) |
| 2 H | disabled plugin keeps serving | fixed T840e13c2 (activation rechecked before each provider use) |
| 3 H | meilisearch revision race | fixed T3cd1251d, Jbd4c7067 (per-index serialization + task-queue wait; conformance case) |
| 4 H | stale completion overwrites bookkeeping | fixed J87198644, d054798f, Tecfe41d8 (CAS settle) |
| 5 M | lossy index names | fixed Jbc455dad (sha256 of identity tuple + _g<gen>) |
| 6 M | exhausted rows starve reconcile | fixed J48e8e125, T57bae103 |
| 7 M | dropIndex result ignored | fixed J5beaaed2, Tdd79f327 (retired targets, migration 0024_search_index_retired) |
| 8 M | HTML edits not reindexed | fixed Tc37e27e8, 3151753e |
| 9 M | weak conformance kit | fixed J9327284e (+5 broken-provider checks; in-memory provider now tenant-scoped) |
| 10 L | scalar public helpers | listed |
| 11 L | meilisearch setTimeout not injected | listed |

## Public-shape changes (recorded)
- DNS: `DnsPlanBlockerCode`+`record_not_owned`; `isMxValue({value},{})`; +`canonicalIpv6`; +export `./dns/node`; `DomainBinding.version`; `DomainBindingStore.put({binding,now,expectedVersion})->boolean`.
- Mail: `MailFeedbackInboxPort.complete()`; `MailSendLedgerPort.reserve(..., {reclaimUnknown})`; `SendPipelineDeps.sleep?`; +`MAIL_RATE_LIMITED`/`isMailRateLimited`; payload hash changed (old ledger rows -> conflict on same-key retry).
- Search contract.ts: signatures unchanged; `searchIndexName` format changed; `query` documented site/workspace-scoped. ports.ts: +`SearchIndexStatePort.settle({row,expected})`, `listByStatus(.., {failedBelowAttempts})`, +`SearchTargetPort.listRetired/forgetRetired`, `promote` retires. Tovu: +`isPluginActive`, `PagesHtmlDocumentStoreDeps.outbox?`.

## Tests run (all green)
Agents: Jini devops 969; Jini platform 2411 (+6 skip); Jini search 319; Tovu DNS 176, mail/newsletter/resend 657, search 140 + migrations/parity/registries/pages. Coordinator re-run: devops dns 151, platform mail 89, search 319, Tovu domain-dns 108, mail+newsletter+resend 426, site-search+meilisearch 48.
Pre-existing, untouched: `pnpm guard` self-test failures; 10 Tovu tsc errors in unrelated files; 4 eslint errors Jini search tools.ts.

## Coverage (touched files)
100/100/100: Jini dns plan/verify/records/manual/contract/node/*; mail feedback/policy/rate-limit/builtin-providers; all search files. Tovu dns-changes, binding.repo, authoritative-dns, 0026; ledger.repo, feedback-inbox.repo, 0025, resend.mjs; index-state-store, meilisearch.mjs, site-search.ts, html-document-store, cms-document-source.
Exceptions: send-pipeline.ts branches 99.38% (line 254 dispatchRow, unchanged code); newsletter deps.ts lines 97% (type-only imports); 0024_search_index_retired + meili emulator not measured.

## Complexity (cc/cognitive, eslint + sonarjs, limit 10)
No touched function >10. handleSendBatchClaimed 7/9 (was cog 11); classifyError <=5 (was cc 11); dispatchWithinBudget 8/8; dispatchRow 9/6; deliver 9/6; handle 7/8; checkRevisions split (was 12). Untouched debt: resolveTarget (dns-changes.ts:95, cc 11), validateMailProvider (cc 11).

## LOCAL-RUN NEEDED
- `runner.postgres.test.ts` on both branches (email-dns head 0026; search head 0024, 85 tables).
- Search index-state store on real Postgres; meilisearch conformance vs real Meilisearch v1.x.
- No Playwright needed.

## LOCAL VISUAL CHECK
None (no UI touched).

## Owner questions
1. DNS #2: manual provider never marks records `self`, so it can never plan replace/delete (blocker only). Intended UX?
2. DNS #7: mixed-zone requests are rejected, not split per zone. OK?
3. Email #4: continuation event's `occurredAt` doubles as due time; or add delayed-enqueue to the outbox contract?
4. Search #3: cross-process race remains (in-process serialized). Is one serving process per site guaranteed?
5. Search #2: revocation happens at next use (`search_status` shows registered until then). Add a lifecycle hook?
6. Migration numbers collide at the big merge: email-dns 0023_mail_ledgers/0024_domain_bindings/0025/0026 vs search 0023_search_index/0024_search_index_retired. Renumber at merge.

## Noticed, not fixed (out of scope / rules-check items)
- verifyDueDomainBindings aborts the whole sweep if one binding throws (poison binding).
- Email rules check: sender resolver should move to Jini; MailStatusBanner fetches its own data; createSmtpMailProvider lacks the optional arg; deleted "why" comment in resolve-mailer.ts; send-pipeline test imports the Resend plugin.
- Peer-site / in-memory HTML stores don't emit entry.updated; 2 sonarjs no-nested-functions warnings in index-state-store.ts.
