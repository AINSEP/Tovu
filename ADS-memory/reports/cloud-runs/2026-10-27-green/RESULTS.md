# RESULTS 2026-10-27 GREEN run (report only, Sonnet 5.5 cloud)

Tovu HEAD `07a37c6d` (cloud/green-1027, fix-lot snapshot), Jini HEAD `555b7504` (cloud/green-1027). All counts are tests EXECUTED in this run. Raw per-file JSON stayed in the sandbox /tmp (not committed). Mutations were applied only through `mutate.mjs`; after every `restore` both trees were clean (see RUN-LOG).

## 1. Summary

| item | count |
|---|---|
| lots (LOTS.json) | 34 (33 mutation-tested, `ui-two` skipped: Mac/Chrome later) |
| lot test files run in phase 1 (unique, helpers `fixture.ts`/`import.fixture.ts` not run) | 112 |
| LOAD-FAIL (whole file failed to load) in phase 1 | 0 |
| lot names GREEN-ok (summed over lots; a name shared by 2 lots counts in both) | 239 |
| RED-on-mutation-ok | 178 |
| guard-ok | 2 |
| UNEXPECTED (lot names + other failing tests in lot files) | 89 |
| sweep items run | 1263 of 1263 (1256 test files + 7 Jini full package suites), NOT RUN: 0; tests executed 24549 |
| sweep failing items | 84 (incl. 3 Jini package suites) |
| &nbsp;&nbsp;sweep failures: ENV | 11 |
| &nbsp;&nbsp;sweep failures: expected-by-fed-security | 5 |
| &nbsp;&nbsp;sweep failures: pre-existing | 24 |
| &nbsp;&nbsp;sweep failures: unsure | 44 |
| sweep failures classified NEW (pass at BASE, fail now) | 0 (none of the 15+4 files rechecked at BASE passed there) |
| typecheck: Jini (server,db,mcp,daemon,agent-runtime,memory,cookie-consent) | 2 errors |
| typecheck: website tsconfig.json | 1 errors |
| typecheck: website tsconfig.tests.json | 394 errors |
| typecheck: desktop `npm run typecheck` | 13 errors |

### Per-lot summary

| lot | files | load-fail | GREEN-ok | RED-on-mutation-ok | guard-ok | UNEXPECTED | pre-existing tests passing in lot files |
|---|---|---|---|---|---|---|---|
| urgent.gemini-blockers | 5 | 0 | 13 | 11 | 0 | 2 | 231 |
| urgent.sentry-env | 1 | 0 | 1 | 1 | 0 | 0 | 40 |
| urgent.w002 | 2 | 0 | 4 | 4 | 0 | 1 | 28 |
| keys | 8 | 0 | 3 | 3 | 0 | 0 | 109 |
| gem-ch.C | 1 | 0 | 3 | 3 | 0 | 0 | 13 |
| gem-ch.D | 3 | 0 | 3 | 3 | 0 | 0 | 67 |
| gem-ch.E | 6 | 0 | 7 | 6 | 0 | 1 | 96 |
| gem-ch.F | 2 | 0 | 4 | 4 | 0 | 0 | 19 |
| gem-ch.G | 3 | 0 | 3 | 3 | 0 | 0 | 91 |
| gem-ch.H | 2 | 0 | 3 | 2 | 0 | 1 | 29 |
| gem-ip.I | 3 | 0 | 6 | 6 | 0 | 3 | 104 |
| gem-ip.J | 4 | 0 | 6 | 6 | 0 | 3 | 69 |
| gem-ip.L | 2 | 0 | 2 | 2 | 0 | 0 | 15 |
| gem-ip.M | 2 | 0 | 2 | 2 | 0 | 0 | 40 |
| gem-ip.N | 1 | 0 | 2 | 2 | 0 | 0 | 2 |
| gem-ip.O | 7 | 0 | 7 | 7 | 0 | 0 | 96 |
| gem-kp.K | 3 | 0 | 1 | 1 | 0 | 0 | 127 |
| gem-kp.P | 2 | 0 | 4 | 1 | 0 | 3 | 80 |
| gem-leftovers | 2 | 0 | 9 | 7 | 1 | 1 | 28 |
| consent-backup | 1 | 0 | 1 | 1 | 0 | 1 | 36 |
| sec1 | 4 | 0 | 3 | 2 | 1 | 1 | 99 |
| shared-keys.tovu | 9 | 0 | 38 | 38 | 0 | 0 | 82 |
| shared-keys.jini | 3 | 0 | 10 | 10 | 0 | 0 | 71 |
| export-followups | 14 | 0 | 35 | 7 | 0 | 41 | 400 |
| export-leftovers | 2 | 0 | 3 | 2 | 0 | 5 | 90 |
| all-clis-test | 1 | 0 | 0 | 0 | 0 | 1 | 0 |
| codex-isolation | 3 | 0 | 12 | 6 | 0 | 6 | 105 |
| fed-security.jini | 10 | 0 | 32 | 20 | 0 | 12 | 320 |
| fed-security.tovu | 6 | 0 | 7 | 5 | 0 | 3 | 196 |
| fed-security.cross | 6 | 0 | 7 | 7 | 0 | 1 | 196 |
| ui-two | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| jini-small | 1 | 0 | 0 | 0 | 0 | 0 | 67 |
| gemini-chat | 1 | 0 | 2 | 1 | 0 | 2 | 14 |
| agy-install-path | 1 | 0 | 6 | 5 | 0 | 1 | 52 |

Notes: `GREEN-ok` includes names that are also RED-on-mutation-ok. "name absent from failing run" = the lot name did not appear in the output of a mutated run that exited non-zero (file aborted/failed before or while reporting it); counted RED-on-mutation-ok, flagged in the per-lot table. Lot `jini-small` has no test names; its proof is the cookie-consent budget check below.

### jini-small build check

- Under mutation (cookie-consent `src/client/index.ts` at BASE): `pnpm --filter @jini-ai/cookie-consent build` **FAILED** (exit 1): `client.min.js: 10613 bytes, 4615 bytes gzipped (budget 4608)`.
- After restore: build **PASSED** (exit 0): `client.min.js: 10559 bytes, 4599 bytes gzipped (budget 4608)`. (Mac measured 4621 / 4605; cloud differs by a few bytes, same verdict.)
- `@jini-ai/memory` build still FAILS in this run (`src/__tests__/note-store.test.ts(134,42): TS2345 string|number|undefined not assignable to OpenMode`, a different code than last night's TS2352) although the vitest file passes (67 tests). `@jini-ai/mcp` build also fails tsc (`fed-presets.unit.test.ts(45,50) TS2353 presetRegistry`) but emits dist.

### Extra shared-step checks (`--extra`)

- **gem-leftovers** expect: _T9 invalid-row tests RED; gem-ch.F's T9 also RED (same file)_
  - `approval.unit.test.ts`: exit 1, 15 tests, failing: `T13: an approval for nested connection A is refused when the call asks for nested connecti`; `T13: every connection the schema declares is bound, through arrays and anyOf branches`; `T13: without a schema every nested connectionRef is bound, so none is left unpinned`; `T13: one unconnected connection among several refuses the call and freezes nothing`
  - `import-remote-submissions.test.ts`: exit 1, 13 tests, failing: `rows the live validator rejects are imported with declared text fields only and listed wit`; `T9: remote imports report the live submit path's default text-length violations`; `T9: an invalid remote row is stored cut to the live text caps (100 one-line, 2000 long tex`; `T9: an invalid remote row emits no form.submission.received; a valid one beside it still d`
- **export-leftovers** expect: _share-legacy-adoption revoke test RED; export-followups' share-registry adoption tests also RED (same file)_
  - `share-legacy-adoption.integration.test.ts`: exit 1, 1 tests, failing: `apps/website/src/features/site-backup/__tests__/share-legacy-adoption.integration.test.ts`
  - `import-malicious.integration.test.ts`: exit 1, 93 tests, failing: `an old flat-layout site plugin's data/ folder stays out of the export, which then imports `; `B untrusted schema objects and partial restore errors leave no site, including app-data DB`; `duplicate manifest path`; `missing DB inventory`; `verifier refuses malformed manifest contracts before invoking the database owner`

## 2. Per-lot results (every lot name and its class)

### urgent.gemini-blockers  (mutation: revert-exclusive; files: 5)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| preview and execute use the chosen credential when two compatible keys have no default | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| readiness honors an attached project key among non-default peers and refuses an unattached key | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a project rename cannot be hidden by a site-owned label, including a provider move | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| create and rename translate hidden project label conflicts without attaching or changing either row | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a stale project update remains a CAS conflict when no other row owns the requested label | ok | ok | UNEXPECTED (passed under mutation) |
| credentialId: readiness selects a named non-default key without decrypting an ambiguous inventory | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| credentialId: readiness refuses missing, foreign and incompatible IDs despite a valid default | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| credentialId: neither composed nor env readiness falls back for an unavailable saved connection | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| ${count} body items report truncation only when another gated item exists | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a dry run at exactly 200 gated items remains complete with ordinary DOM nodes left | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| deployment accepts explicit OFF before validating legacy or published copy; enabled copy stays strict | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| legacy editor reads default only invalid text without changing activation or stored state | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| legacy editor reads preserve valid text at each limit and an empty optional link label | ok | ok | UNEXPECTED (passed under mutation) |

Pre-existing tests passing in this lot's files (phase 1): 231 passing / 0 failing in 5 files.

### urgent.sentry-env  (mutation: revert-exclusive; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| 1: saved provider environment wins over the host default; blank uses host and release stays host-owned | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 40 passing / 0 failing in 1 files.

### urgent.w002  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T30: an already limited IP cannot consume a victim's email or identity budget | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T30: Retry-After and its JSON detail report the longest applicable wait | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T30: password limits check normalized email only after IP admission | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T30: forgot and sign-in skip the shared email counter when their IP is denied | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `member-password-auth.test.ts` :: D2: ip limiter denies before hashing and both strict counters are charged

Pre-existing tests passing in this lot's files (phase 1): 28 passing / 1 failing in 2 files.

### keys  (mutation: revert-exclusive; files: 8)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| a receiver key stays site-owned with a project store and republishing reuses the installed secret | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| mail card saves attach the project key immediately and re-saving rotates that same key | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a project provider save commits its attachment before returning usage | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 109 passing / 0 failing in 8 files.

### gem-ch.C  (mutation: revert-exclusive; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T6: project key renames refuse site-owned and unattached project labels | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a site label collision is refused before it hides the renamed project key | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| an unattached project label collision is translated to the domain duplicate error | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 13 passing / 0 failing in 1 files.

### gem-ch.D  (mutation: revert-exclusive; files: 3)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T3: navigating away from Websites and back preserves the open admin webview | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| T5: a boot failure after long startup logs reports the final CLI error | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T18: a poll started before creation cannot erase the new site and its token notice | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 67 passing / 0 failing in 3 files.

### gem-ch.E  (mutation: revert-exclusive; files: 6)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T7: re-saving a binding preserves its temporarily hidden trashed form ids | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T8: a retired embed remains savable when its old props no longer match the current schema | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T13: a confirmed call refuses a token for a connection absent from its frozen approval | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T23: aborting a tool propagates to its in-flight HTTP request even with a plugin signal | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T14: an older refresh cannot restore tools withdrawn by a newer refresh | ok | ok | UNEXPECTED (passed under mutation) |
| T15: re-enabling preserves an operator-edited disabled connection and its OAuth tokens | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T21: OAuth sign-in respects an operator's explicit plugin-off decision | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 96 passing / 0 failing in 6 files.

### gem-ch.F  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T9: remote imports report the live submit path's default text-length violations | ok | ok | RED-on-mutation-ok (only under gem-leftovers --extra shared step) |
| T9: the static-host manifest includes default text caps and preserves authored limits | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T9: an invalid remote row is stored cut to the live text caps (100 one-line, 2000 long text) and nothing is lost | ok | ok | RED-on-mutation-ok (only under gem-leftovers --extra shared step) |
| T9: an invalid remote row emits no form.submission.received; a valid one beside it still does | ok | ok | RED-on-mutation-ok (only under gem-leftovers --extra shared step) |

Pre-existing tests passing in this lot's files (phase 1): 19 passing / 0 failing in 2 files.

### gem-ch.G  (mutation: revert-exclusive; files: 3)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T10: a colliding slug override leaves no half-made media copy | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T12: malformed bundle hashes are refused before any filesystem blob probe or read | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T17: a legacy keyless provider does not block another provider's metadata edit | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 91 passing / 0 failing in 3 files.

### gem-ch.H  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T20: bodyless POST and DELETE omit content-type while JSON writes retain it | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T24: blankAsAbsent refuses non-string declared fields instead of silently dropping them | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| readStaticPublishConfig keeps declared string fields, refuses non-strings in JSON mode, and drops unknown keys | ok | ok | UNEXPECTED (passed under mutation) |

Pre-existing tests passing in this lot's files (phase 1): 29 passing / 0 failing in 2 files.

### gem-ip.I  (mutation: revert-exclusive; files: 3)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T26: token-only rotation retains the saved provider | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T36: blank-token patches refuse changes to other connection fields | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T27: renaming a project credential refuses a label already claimed by this site | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T35: ambiguous site credentials never fall back to a shadowed project default | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T28: commit targets reject traversal and malformed Git branch names | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T37: plugin exceptions and unknown error codes become safe PROVIDER_ERROR outcomes | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `store.unit.test.ts` :: vault default resolution never lists sibling credentials; `commit-site.unit.test.ts` :: commitSiteToSourceControl: a vault result from another provider group is rejected as NO_CREDENTIALS_; `commit-site.unit.test.ts` :: commitSiteToSourceControl: a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CO

Pre-existing tests passing in this lot's files (phase 1): 104 passing / 3 failing in 3 files.

### gem-ip.J  (mutation: revert-exclusive; files: 4)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T31: a term write failure after importing a post removes the unrecorded post | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T32: reverting a retirement from history restores the holder's original free slug | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T33: the update body schema accepts an empty editor paragraph and preserves existing widget styling | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T34: reverts record their new revision and preserve an edit committed after their read | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| ${operation}: new revision is present in history | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| ${operation}: a concurrent edit survives | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `publish-content.test.ts` :: apply() restores an existing destination forward when change-set recording fails (byline=null, visib; `publish-content.test.ts` :: apply() restores an existing destination forward when change-set recording fails (byline=Hidden cred; `publish-content.test.ts` :: apply() restores an existing destination forward when change-set recording fails (byline=Visible cre

Pre-existing tests passing in this lot's files (phase 1): 69 passing / 3 failing in 4 files.

### gem-ip.L  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T43: a keyless session response does not disclose whether the source has a grant | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T44: a rate-limited OIDC email continuation redirects the browser to the sign-in error page | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 15 passing / 0 failing in 2 files.

### gem-ip.M  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T38: a synchronous source-open failure releases the owner lock | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T42: a completed file undo reclaims its backup and keeps another pending undo | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 40 passing / 0 failing in 2 files.

### gem-ip.N  (mutation: revert-exclusive; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T40: end-only HTML over 4 MiB and empty HEAD responses pass through with their validators | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T41: collector requests from rotating IPv6 addresses share one /64 rate budget | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 2 passing / 0 failing in 1 files.

### gem-ip.O  (mutation: revert-exclusive; files: 7)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T45: critical start failure releases resources of modules prepared but not yet started | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T46: telemetry from a frame disposed during delivery is dropped without throwing | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T47/runtime-0#3: beforeExit stops the daemon before closing its shared store | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T47/runtime-0#5: stderr overflow retains the later fatal tail | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T47/runtime-0#6: a binding can assemble a usable supervisor after its prior host shuts down | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T47/site-dir-1#2: a crash queued behind Stop cannot overwrite the stopped state | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T47/site-dir-1#3: owner loss during a pending bundle build prevents the later site import | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 96 passing / 0 failing in 7 files.

### gem-kp.K  (mutation: revert-exclusive; files: 3)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T25: interrupted verification and orphaned payloads release the staging budget without discarding live owner setup | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 127 passing / 0 failing in 3 files.

### gem-kp.P  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T48: other principals and workspaces cannot evict a caller's live backup plan | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T48: an unparseable public origin raises a typed STORAGE_SETUP refusal | ok | ok | UNEXPECTED (passed under mutation) |
| T48: an invalid runtime origin falls back to object storage or private ZIP delivery | ok | ok | UNEXPECTED (passed under mutation) |
| a skipped runtime delivery logs one warning with its refusal code and never the configured origin | ok | ok | UNEXPECTED (passed under mutation) |

Pre-existing tests passing in this lot's files (phase 1): 80 passing / 0 failing in 2 files.

### gem-leftovers  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| T13: an approval for nested connection A is refused when the call asks for nested connection B | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T13: every connection the schema declares is bound, through arrays and anyOf branches | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T13: without a schema every nested connectionRef is bound, so none is left unpinned | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T13: one unconnected connection among several refuses the call and freezes nothing | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T9: an invalid remote row is stored cut to the live text caps (100 one-line, 2000 long text) and nothing is lost | ok | ok | RED-on-mutation-ok (only under gem-leftovers --extra shared step) |
| T9: an invalid remote row emits no form.submission.received; a valid one beside it still does | ok | ok | RED-on-mutation-ok (only under gem-leftovers --extra shared step) |
| T13: a write tool whose input names no connection binds nothing and still runs | ok | ok | guard-ok |
| T13: a connectionRef key inside data the schema does not declare as one is the user\'s data, not a connection | ok | ok | UNEXPECTED (passed under mutation) |
| T9: remote imports report the live submit path's default text-length violations | ok | ok | RED-on-mutation-ok (only under gem-leftovers --extra shared step) |

Pre-existing tests passing in this lot's files (phase 1): 28 passing / 0 failing in 2 files.

### consent-backup  (mutation: revert-exclusive; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| S6: shared sites preserve published cookie-banner settings and the separate draft | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `share-database.integration.test.ts` :: ordinary media travels unchanged; an active document loses its uploader; an inactive document is dro

Pre-existing tests passing in this lot's files (phase 1): 36 passing / 1 failing in 1 files.

### sec1  (mutation: revert-exclusive; files: 4)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| SEC-1: GitHub backup excludes password hashes, sessions, magic-link tokens and sealed vault rows | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| SEC-1: a share-policy refusal of the database is the plan's refusal, with nothing written | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| SEC-1 restore: restoring a sanitized GitHub backup keeps the target site's owner and member, and both can still sign in | ok | ok | guard-ok |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `site-backup-wiring.integration.test.ts` :: the composed plan and push back up THIS site: a credential sealed by the composed sealer, the real d

Pre-existing tests passing in this lot's files (phase 1): 99 passing / 1 failing in 4 files.

### shared-keys.tovu  (mutation: revert-exclusive; files: 9)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| S3 all four channels reject untrusted, null, child and navigated frames before any effect | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| S3 invalid renderer paths/profile/unknown fields, sources and oversize requests never spawn | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| project saves and listing forward only the project store and never copy, list grants or sync | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| S3 a refused save returns its fixed failure and makes no further call | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| import is a dry run first; only a confirmed dry run applies, with the same source fields | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| import: cancelling the confirmation never applies; nothing new or a failed dry run skips the dialog | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| S3 the backup picker owns the path; cancellation/opaque picker errors do not spawn or echo secrets | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| S3 an open backup picker or confirmation does not hold the queue; its CLI calls still queue | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| the confirmation names what imports, what does not and why, and which sites keep their copies | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| start-up settle: an empty legacy store (0 entries AND 0 grants) is deleted without a notice | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| start-up settle: a store holding keys is kept and the import notice shows; settled/none do nothing | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| start-up settle: a failed or thrown status keeps every file, shows nothing and only logs | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| S3 argv is only the fixed action and --json; no --site or request value ever reaches it | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| status and import replies keep only the published fields, including an optional reason | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| S3 a backup import keeps the passphrase and backup path exclusively on stdin | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| S3 caps UTF-8 stdin at 64 KiB before spawning and refuses relative profiles and removed actions | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a site start never calls the owner-store CLI: the sync-on-start path is gone | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| the one start-up check runs once, after the shared-key IPC is registered | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| only an empty store is removed, and only its four files | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| owner-store status requires no legacy owner store and zero entries/grants without echoing diagnostics | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| loads metadata; import feedback counts imported keys and mentions kept site copies | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| backup import sends only the source and passphrase, clears it, and shows fixed feedback | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| replace carries the displayed revision; importing from this computer sends only the source | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| status and import on a profile without owner.db report none/empty and create no owner file | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| an empty legacy store (0 entries, 0 grants) reports empty and the CLI leaves deleting it to the desktop | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a legacy store imports only on apply, non-default, reports site copies, and is never modified | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| an import whose label is already a project key reports label-taken and writes nothing | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| relative and traversal paths are refused before any owner file is created or read | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a backup import never moves or rewrites the file; empty imports nothing and damaged is refused | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a dry run plans every entry and writes nothing, not even a transaction | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| apply writes only the new entries, non-default and project-owned, in one transaction | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a vault refusal mid-apply rejects the whole import; the transaction owns the rollback | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| the same id with the same metadata and decrypted payload is already imported; apply writes nothing | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| the same id with a different secret, metadata or identity is a conflict and stays untouched | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a taken name (same kind and label, or the same media provider) is a conflict; another kind is not | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| site-assistant and database-destination kinds are refused by name; plugin-owned rows by owner | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| every recorded site destination is reported pending: grants keep a copy, revocations may still hold one | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| an empty snapshot is the empty report and touches nothing | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |

Pre-existing tests passing in this lot's files (phase 1): 82 passing / 0 failing in 9 files.

### shared-keys.jini  (mutation: revert-exclusive; files: 3)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| counts an empty published-0000 store without its key, leaving the file and its ledger unchanged | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| counts entries and grants of a used store | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| reads decrypted entries and grants read-only, never migrating a 0000 store to 0001 | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| a store past the unpublished 0001 step also lists its pending cleanups | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| a %s owner key is a recovery error and never creates a key file | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| reading a missing owner.db fails without creating it | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| a published version-1 backup reads its entries with no recorded destinations | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| a version-2 backup returns grants and pending cleanups as destinations, without hints | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| a wrong passphrase fails authentication | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |
| rejects an authenticated but invalid %s snapshot | ok | FAIL(load) | GREEN-ok + RED-on-mutation-ok (whole-file load failure) |

Pre-existing tests passing in this lot's files (phase 1): 71 passing / 0 failing in 3 files.

### export-followups  (mutation: revert-exclusive; files: 14)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| export snapshots the database into the injected private folder, never the source site, and leaves nothing behind | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| the private snapshot folder is removed even when the capture fails | ok | ok | UNEXPECTED (passed under mutation) |
| a missing snapshot root refuses with the caller-safe message and captures nothing | ok | ok | UNEXPECTED (passed under mutation) |
| captureRestorePoint with a directory writes the whole-file copy there and nothing beside content.db | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a legacy share catalog moves to the private folder once, files intact | ok | ok | UNEXPECTED (passed under mutation) |
| an existing private catalog is never overwritten by a legacy one | ok | ok | UNEXPECTED (passed under mutation) |
| no legacy catalog leaves the private folder untouched | ok | ok | UNEXPECTED (passed under mutation) |
| default share storage is the sites root's private folder, never the source site, and adopts the legacy catalog | FAIL | FAIL | UNEXPECTED (phase1 FAIL) |
| TOVU_SHARE_STORAGE_DIR inside the source site or its database folder disables only sharing | ok | ok | UNEXPECTED (passed under mutation) |
| buffered files, then the database, then disk files, then the manifest reach the encoder once | ok | ok | UNEXPECTED (passed under mutation) |
| each archived entry keeps its exact bytes | ok | ok | UNEXPECTED (passed under mutation) |
| the manifest inventories every entry with its size and sha256, in archive order | ok | ok | UNEXPECTED (passed under mutation) |
| a plan without a database is refused with the exact v2 message before encoding | ok | ok | UNEXPECTED (passed under mutation) |
| progress counts every archived entry and its bytes, not the manifest | ok | ok | UNEXPECTED (passed under mutation) |
| the plan's expanded caps are checked before any path claim or read | ok | ok | UNEXPECTED (passed under mutation) |
| an unsafe path is refused before any entry is scanned | ok | ok | UNEXPECTED (passed under mutation) |
| a file at the manifest path is refused as a duplicate | ok | ok | UNEXPECTED (passed under mutation) |
| a buffered file and the database at the same path are refused as a duplicate | ok | ok | UNEXPECTED (passed under mutation) |
| credential-shaped bytes refuse the share before encoding | ok | ok | UNEXPECTED (passed under mutation) |
| a disk file that changed since the plan is refused as stale | ok | ok | UNEXPECTED (passed under mutation) |
| an already-aborted signal stops at the first entry | ok | ok | UNEXPECTED (passed under mutation) |
| an aborted signal stops before encoding even when the plan has no disk files | ok | ok | UNEXPECTED (passed under mutation) |
| a live signal lets the share encode | ok | ok | UNEXPECTED (passed under mutation) |
| a manifest over 2 MiB is refused before encoding | ok | ok | UNEXPECTED (passed under mutation) |
| a manifest of exactly 2 MiB is accepted | ok | ok | UNEXPECTED (passed under mutation) |
| the file cap counts the manifest itself after every entry is scanned | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| an encoder size failure ('${message}') is reported as the archive cap | ok | ok | UNEXPECTED (passed under mutation) |
| any other encoder Error propagates unchanged | ok | ok | UNEXPECTED (passed under mutation) |
| a non-Error encoder failure propagates unchanged, even if it mentions a limit | ok | ok | UNEXPECTED (passed under mutation) |
| a theme named overrides and the overrides folder map to distinct archive paths and units | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a theme named overrides and the site's theme overrides both round-trip without colliding | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| import refuses exactly what export refuses inside a site plugin package | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| an old flat-layout site plugin's data/ folder stays out of the export, which then imports cleanly | ok | ok | RED-on-mutation-ok (only under export-leftovers --extra shared step) |
| T48: an unparseable public origin raises a typed STORAGE_SETUP refusal | ok | ok | UNEXPECTED (passed under mutation) |
| T48: an invalid runtime origin falls back to object storage or private ZIP delivery | ok | ok | UNEXPECTED (passed under mutation) |
| a skipped runtime delivery logs one warning with its refusal code and never the configured origin | ok | ok | UNEXPECTED (passed under mutation) |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `site-share-wiring.integration.test.ts` :: switchable site; `site-share-wiring.integration.test.ts` :: install-dir site; `share.integration.test.ts` :: fresh share projection preserves drafts/schedules/autosaves, excludes private rows and secret bytes ; `library-share.integration.test.ts` :: L3 local: share/import preserves private documents and deduplicates blobs; `library-share.integration.test.ts` :: L3 s3: share/import preserves private documents and deduplicates blobs; `library-share.integration.test.ts` :: L3 import explicitly rejects corrupt document before creating a site; `library-share.integration.test.ts` :: L3 genuine pre-L3 share omits Trash and orphan payloads but rejects arbitrary uploads; `library-share.integration.test.ts` :: L3 isolated guard: destination-collision; `import-malicious.integration.test.ts` :: B untrusted schema objects and partial restore errors leave no site, including app-data DBs; `import-malicious.integration.test.ts` :: duplicate manifest path; `import-malicious.integration.test.ts` :: missing DB inventory; `import-malicious.integration.test.ts` :: verifier refuses malformed manifest contracts before invoking the database owner

Pre-existing tests passing in this lot's files (phase 1): 400 passing / 13 failing in 14 files.

### export-leftovers  (mutation: revert-exclusive; files: 2)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| an old flat-layout site plugin's data/ folder stays out of the export, which then imports cleanly | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a runtime-delivered share made before the share-storage move still revokes after it, delivery removed | ok | ok | RED-on-mutation-ok (only under export-leftovers --extra shared step) |
| import refuses exactly what export refuses inside a site plugin package | ok | ok | UNEXPECTED (passed under mutation) |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `import-malicious.integration.test.ts` :: B untrusted schema objects and partial restore errors leave no site, including app-data DBs; `import-malicious.integration.test.ts` :: duplicate manifest path; `import-malicious.integration.test.ts` :: missing DB inventory; `import-malicious.integration.test.ts` :: verifier refuses malformed manifest contracts before invoking the database owner

Pre-existing tests passing in this lot's files (phase 1): 90 passing / 4 failing in 2 files.

### all-clis-test  (mutation: cross-repo; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| every registered CLI starts, or is refused naming the CLI and each OFF switch, under Tovu's default chat settings | FAIL | FAIL | UNEXPECTED (phase1 FAIL) |

Pre-existing tests passing in this lot's files (phase 1): 0 passing / 1 failing in 1 files.

### codex-isolation  (mutation: revert-exclusive; files: 3)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| Codex with personal MCP OFF loads only the Tovu bridge | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| turns off every config-file server and keeps the bridge as the only enabled one | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| keeps personal settings while personal MCP is off | ok | ok | UNEXPECTED (passed under mutation) |
| turns off plugin-bundled servers and ChatGPT apps on the CLI layer, on create and resume | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| turns off plugins and apps when native tools are locked | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| scans only the project layers Codex loads: cwd up to the nearest .git/HEAD | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| scans every ancestor when the user config sets its own project_root_markers | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| ignores plugin-scoped server settings in a project layer (plugins are off on the CLI layer) | ok | ok | UNEXPECTED (passed under mutation) |
| Codex with personal MCP ON keeps personal servers | ok | ok | UNEXPECTED (passed under mutation) |
| keeps home servers and adds no disabled placeholders | ok | ok | UNEXPECTED (passed under mutation) |
| leaves plugins and apps on | ok | ok | UNEXPECTED (passed under mutation) |
| does not refuse a project forcing a server on | ok | ok | UNEXPECTED (passed under mutation) |

Pre-existing tests passing in this lot's files (phase 1): 105 passing / 0 failing in 3 files.

### fed-security.jini  (mutation: revert-exclusive; files: 10)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| a preset's write tool with no write grant is refused per call and never sent | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a preset's explicit default write grant lets the write run, and the admission report shows it | ok | ok | UNEXPECTED (passed under mutation) |
| a preset's read tool needs no write grant | ok | ok | UNEXPECTED (passed under mutation) |
| fed-security 1: ${label} without a write grant is refused under current grants | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 1: ${label} with a write grant is not refused | ok | ok | UNEXPECTED (passed under mutation) |
| fed-security 1: ${label} is unaffected by an empty write list | ok | ok | UNEXPECTED (passed under mutation) |
| fed-security 1: the write grant never admits a tool the allowlist dropped | ok | ok | UNEXPECTED (passed under mutation) |
| fed-security 1: the registration-time classification (with the operator's read list) is honoured; absent, it is re-derived | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 1: an operator read list cannot override a remote's own write or destructive declaration | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 1: the handler hands the gate its write classification, made with the operator's read list | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 1: through the revocation gate, a write tool without 'may write' is refused and never sent | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 1: through the revocation gate, the same write tool runs once 'may write' is granted | ok | ok | UNEXPECTED (passed under mutation) |
| fed-security 1: through the revocation gate, a read tool runs with no write grant | ok | ok | UNEXPECTED (passed under mutation) |
| fed-security 2: Jini ${required} + host ${host} = ${expected} | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 2: a Jini-required card still shows when the host policy says no confirmation | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 2: host policy adds a card to a call Jini would run directly | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 2: host policy receives the frozen call arguments and the admitted hints | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 3: a connection revoked while the card is parked refuses the approved call and sends nothing | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 3: a write grant withdrawn while the card is parked refuses the approved call | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 3: a permission lost while the card is parked refuses the approved call | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 3: a run cancelled while the card is parked is abandoned, not sent | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 3: an approved call that still clears every check is sent once, after the re-check | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-security 3: a call with no card is checked once — the re-check belongs to the approval wait | ok | ok | UNEXPECTED (passed under mutation) |
| fed-presets: a preset's write tool with no write grant is refused per call and never sent | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| fed-presets: a preset's explicit default write grant lets the write run, and the admission report shows it | ok | ok | UNEXPECTED (passed under mutation) |
| fed-presets: a preset's read tool needs no write grant | ok | ok | UNEXPECTED (passed under mutation) |
| refusalForAdmittedToolUnderCurrentGrants: a write tool off the write list is refused — 'may write' is a grant | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| refusalForAdmittedToolUnderCurrentGrants: a tool with no declared hints and an opaque name removed from the write list is refused — unclassifiable fai | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| an allowlisted destructive tool without a write grant is refused | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| an allowlisted destructive tool with a write grant is not refused | ok | ok | UNEXPECTED (passed under mutation) |
| a write-declaring tool on the allowlist and the write list is not refused | ok | ok | UNEXPECTED (passed under mutation) |
| a write-declaring tool on the allowlist but absent from the write list is refused as write-not-allowed | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 320 passing / 0 failing in 10 files.

### fed-security.tovu  (mutation: revert-exclusive; files: 6)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| a Jini-gated action Tovu classifies as a reversible Trash still asks the host — policy cannot remove Jini's card | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a Jini-gated assistant-access change Tovu classifies as an ordinary restore still asks the host | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a Jini-gated action Tovu classifies as a reversible Trash is refused, unsent, with no host confirmer | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| trash and restore keep Jini\'s card when a remote marks every write destructive; Jini-named trash runs directly | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| Jini-named reversible federation runs without a confirmation channel but still checks permissions and liveness | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| T1-7: removing write_thing from the write list refuses it ('may write' is enforced); read_thing still completes | ok | ok | UNEXPECTED (passed under mutation) |
| rosterRefusalFor passes an allowlisted read tool, refuses a write tool with no write grant, and refuses one no longer allowlisted | ok | ok | UNEXPECTED (passed under mutation) |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `external-mcp-oauth.test.ts` :: beginConnect persists the discovered protected resource (typed endpoints)

Pre-existing tests passing in this lot's files (phase 1): 196 passing / 1 failing in 6 files.

### fed-security.cross  (mutation: cross-repo; files: 6)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| a Jini-gated action Tovu classifies as a reversible Trash still asks the host — policy cannot remove Jini's card | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a Jini-gated assistant-access change Tovu classifies as an ordinary restore still asks the host | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| a Jini-gated action Tovu classifies as a reversible Trash is refused, unsent, with no host confirmer | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| trash and restore keep Jini\'s card when a remote marks every write destructive; Jini-named trash runs directly | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| Jini-named reversible federation runs without a confirmation channel but still checks permissions and liveness | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| T1-7: removing write_thing from the write list refuses it ('may write' is enforced); read_thing still completes | ok | FAIL(absent in failing file) | GREEN-ok + RED-on-mutation-ok (name absent from failing run) |
| rosterRefusalFor passes an allowlisted read tool, refuses a write tool with no write grant, and refuses one no longer allowlisted | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Other (non-lot-name) tests that FAILED in phase 1 in this lot's files — UNEXPECTED: `external-mcp-oauth.test.ts` :: beginConnect persists the discovered protected resource (typed endpoints)

Pre-existing tests passing in this lot's files (phase 1): 196 passing / 1 failing in 6 files.

### ui-two  (mutation: mac-chrome-later; files: 0)

_no lot names (see notes)_

Pre-existing tests passing in this lot's files (phase 1): 0 passing / 0 failing in 0 files.

### jini-small  (mutation: revert-exclusive; files: 1)

_no lot names (see notes)_

Pre-existing tests passing in this lot's files (phase 1): 67 passing / 0 failing in 1 files.

### gemini-chat  (mutation: shared; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| names every OFF switch, and the Full CLI switch when no single switch is the cause | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| still runs %s with personal MCP OFF | FAIL | FAIL | UNEXPECTED (phase1 FAIL) |
| runs antigravity in parity once personal MCP is ON | ok | ok | UNEXPECTED (passed under mutation) |

Pre-existing tests passing in this lot's files (phase 1): 14 passing / 1 failing in 1 files.

### agy-install-path  (mutation: revert-exclusive; files: 1)

| lot name | phase-1 | under mutation | class |
|---|---|---|---|
| antigravity targets the config/ registry the agy CLI reads | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| antigravity install against a temp HOME | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| a fresh HOME gets the bridge entry in config/ and no antigravity/ file | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| an antigravity/ symlink to config/ ends with exactly one entry, still a symlink | ok | ok | UNEXPECTED (passed under mutation) |
| a regular-file antigravity/ config is left byte-for-byte untouched | ok | FAIL | GREEN-ok + RED-on-mutation-ok |
| keeps the user's other servers and top-level keys in config/ | ok | FAIL | GREEN-ok + RED-on-mutation-ok |

Pre-existing tests passing in this lot's files (phase 1): 52 passing / 0 failing in 1 files.

## 2b. UNEXPECTED details

- **urgent.gemini-blockers** — `a stale project update remains a CAS conflict when no other row owns the requested label` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: publish-agent-tools.unit.test.ts: 1 fail/106 tests (exit 1); project-scope.unit.test.ts: 3 fail/13 tests (exit 1); credentials.unit.test.ts: 3 fail/57 tests (exit 1); readiness.pins.test.ts: 2 fail/14 tests (exit 1); service.test.ts: 2 fail/42 tests (exit 1)
- **urgent.gemini-blockers** — `legacy editor reads preserve valid text at each limit and an empty optional link label` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: publish-agent-tools.unit.test.ts: 1 fail/106 tests (exit 1); project-scope.unit.test.ts: 3 fail/13 tests (exit 1); credentials.unit.test.ts: 3 fail/57 tests (exit 1); readiness.pins.test.ts: 2 fail/14 tests (exit 1); service.test.ts: 2 fail/42 tests (exit 1)
- **gem-ch.E** — `T14: an older refresh cannot restore tools withdrawn by a newer refresh` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: delivery-bindings.unit.test.ts: 1 fail/22 tests (exit 1); plugin-embed-save.test.ts: 1 fail/5 tests (exit 1); host-capabilities.unit.test.ts: 3 fail/18 tests (exit 1); register.unit.test.ts: 0 fail/9 tests (exit 0); federate-mcp.unit.test.ts: 1 fail/34 tests (exit 1); apply-connect-defaults.unit.test.ts: 1 fail/8 tests (exit 1)
- **gem-ch.H** — `readStaticPublishConfig keeps declared string fields, refuses non-strings in JSON mode, and drops unknown keys` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: run-ops.test.ts: 1 fail/25 tests (exit 1); adapter.plan.unit.test.ts: 1 fail/4 tests (exit 1)
- **gem-kp.P** — `T48: an unparseable public origin raises a typed STORAGE_SETUP refusal` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: plan-store.unit.test.ts: 1 fail/8 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **gem-kp.P** — `T48: an invalid runtime origin falls back to object storage or private ZIP delivery` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: plan-store.unit.test.ts: 1 fail/8 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **gem-kp.P** — `a skipped runtime delivery logs one warning with its refusal code and never the configured origin` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: plan-store.unit.test.ts: 1 fail/8 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **gem-leftovers** — `T13: a connectionRef key inside data the schema does not declare as one is the user\'s data, not a connection` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: approval.unit.test.ts: 4 fail/15 tests (exit 1); import-remote-submissions.test.ts: 0 fail/13 tests (exit 0)
- **export-followups** — `the private snapshot folder is removed even when the capture fails` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a missing snapshot root refuses with the caller-safe message and captures nothing` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a legacy share catalog moves to the private folder once, files intact` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `an existing private catalog is never overwritten by a legacy one` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `no legacy catalog leaves the private folder untouched` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `default share storage is the sites root's private folder, never the source site, and adopts the legacy catalog` — UNEXPECTED (phase1 FAIL)
  - file: apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts
```
not ok 2 - default share storage is the sites root's private folder, never the source site, and adopts the legacy catalog
  ---
  duration_ms: 1301.550747
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts:1:1955'
  failureType: 'subtestsFailed'
  error: '2 subtests failed'
  code: 'ERR_TEST_FAILURE'
  ...
# [migrations] /tmp/share-boot-inside-XZcZqN/app-db/content-0.db: applied 0000_legacy_baseline, 0001_post_search, 0002_drop_empty_legacy_chat_tables, 0003_coercion_json_as_json, 0004_drop_unused_deployment_tables, 0005_media_createdby, 0006_submission_ip_retention, 0007_publish_backstop, 0008_posts_publish_at_featured_media, 0009_posts_author, 0010_members_credentials_revoked_at, 0011_drop_empty_core_commerce_tables, 0012_secrets_vault, 0013_unify_vault_credentials, 0014_media_library, 0015_document_blob_ownership, 0016_publish_destination_history, 0017_publish_history_kind, 0018_form_submission_remote_receipts, 0019_form_delivery_plans, 0020_vault_api_connection_kind, 0021_site_consent_revisions, 0022_workspace_mcp_cascade, 0023_mail_ledgers, 0024_domain_bindings, 0025_mail_feedback_processed, 0026_domain_binding_version, 0027_search_index, 0028_search_index_retired, 0029_mail_activity_indexes, 0030_mail_suppression_admin, 0031_mail_activity_retention, 0032_member_signup_email, 0033_mail_activity_message, 0034_member_auth, 0035_member_external_identities
# [migrations]   vault coverage sit
```
- **export-followups** — `TOVU_SHARE_STORAGE_DIR inside the source site or its database folder disables only sharing` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `buffered files, then the database, then disk files, then the manifest reach the encoder once` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `each archived entry keeps its exact bytes` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `the manifest inventories every entry with its size and sha256, in archive order` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a plan without a database is refused with the exact v2 message before encoding` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `progress counts every archived entry and its bytes, not the manifest` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `the plan's expanded caps are checked before any path claim or read` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `an unsafe path is refused before any entry is scanned` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a file at the manifest path is refused as a duplicate` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a buffered file and the database at the same path are refused as a duplicate` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `credential-shaped bytes refuse the share before encoding` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a disk file that changed since the plan is refused as stale` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `an already-aborted signal stops at the first entry` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `an aborted signal stops before encoding even when the plan has no disk files` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a live signal lets the share encode` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a manifest over 2 MiB is refused before encoding` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a manifest of exactly 2 MiB is accepted` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `an encoder size failure ('${message}') is reported as the archive cap` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `any other encoder Error propagates unchanged` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a non-Error encoder failure propagates unchanged, even if it mentions a limit` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `T48: an unparseable public origin raises a typed STORAGE_SETUP refusal` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `T48: an invalid runtime origin falls back to object storage or private ZIP delivery` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-followups** — `a skipped runtime delivery logs one warning with its refusal code and never the configured origin` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-snapshot-location.integration.test.ts: 1 fail/3 tests (exit 1); db-ops.integration.test.ts: 1 fail/14 tests (exit 1); share-registry.unit.test.ts: 0 fail/15 tests (exit 0); site-share-wiring.integration.test.ts: 3 fail/5 tests (exit 1); share-zip.unit.test.ts: 1 fail/27 tests (exit 1); archive-paths.unit.test.ts: 1 fail/1 tests (exit 1); archive-v2.integration.test.ts: 1 fail/6 tests (exit 1); share.integration.test.ts: 1 fail/10 tests (exit 1); import-verifier-refusals.unit.test.ts: 1 fail/91 tests (exit 1); share-preparation.unit.test.ts: 0 fail/30 tests (exit 0); share-preparation-gaps.unit.test.ts: 0 fail/22 tests (exit 0); library-share.integration.test.ts: 5 fail/20 tests (exit 1); import-malicious.integration.test.ts: 9 fail/93 tests (exit 1); share-hosting.unit.test.ts: 0 fail/72 tests (exit 0)
- **export-leftovers** — `import refuses exactly what export refuses inside a site plugin package` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: share-legacy-adoption.integration.test.ts: 0 fail/1 tests (exit 0); import-malicious.integration.test.ts: 5 fail/93 tests (exit 1)
- **all-clis-test** — `every registered CLI starts, or is refused naming the CLI and each OFF switch, under Tovu's default chat settings` — UNEXPECTED (phase1 FAIL)
  - file: apps/website/src/server/inbound/assistant/__tests__/every-cli-default-settings.contract.test.ts
```
not ok 1 - every registered CLI starts, or is refused naming the CLI and each OFF switch, under Tovu's default chat settings
  ---
  duration_ms: 695.000922
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/every-cli-default-settings.contract.test.ts:1:4636'
  failureType: 'testCodeFailure'
  error: |-
    Every registered CLI under Tovu's default chat settings:
    amr          | AMR                  | refused NATIVE_TOOL_POLICY_UNSUPPORTED   | OFF: Your MCP servers | ok
    claude       | Claude Code          | refused FILESYSTEM_POLICY_UNSUPPORTED    | OFF: Your MCP servers | BROKEN: failed with FILESYSTEM_POLICY_UNSUPPORTED: "Folder-limited launch refused: invalid host settings or private runtime directory."
    codex        | Codex CLI            | refused FILESYSTEM_POLICY_UNSUPPORTED    | OFF: Your MCP servers | BROKEN: failed with FILESYSTEM_POLICY_UNSUPPORTED: "Folder-limited launch refused: invalid host settings or private runtime directory."
    devin        | Devin for Terminal   | refused NATIVE_TOOL_POLICY_UNSUPPORTED   | OFF: Your MCP servers | ok
```
- **codex-isolation** — `keeps personal settings while personal MCP is off` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: codex-mcp-sources-isolation.test.ts: 10 fail/15 tests (exit 1); native-capability-isolation.test.ts: 2 fail/24 tests (exit 1); codex.test.ts: 3 fail/66 tests (exit 1)
- **codex-isolation** — `ignores plugin-scoped server settings in a project layer (plugins are off on the CLI layer)` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: codex-mcp-sources-isolation.test.ts: 10 fail/15 tests (exit 1); native-capability-isolation.test.ts: 2 fail/24 tests (exit 1); codex.test.ts: 3 fail/66 tests (exit 1)
- **codex-isolation** — `Codex with personal MCP ON keeps personal servers` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: codex-mcp-sources-isolation.test.ts: 10 fail/15 tests (exit 1); native-capability-isolation.test.ts: 2 fail/24 tests (exit 1); codex.test.ts: 3 fail/66 tests (exit 1)
- **codex-isolation** — `keeps home servers and adds no disabled placeholders` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: codex-mcp-sources-isolation.test.ts: 10 fail/15 tests (exit 1); native-capability-isolation.test.ts: 2 fail/24 tests (exit 1); codex.test.ts: 3 fail/66 tests (exit 1)
- **codex-isolation** — `leaves plugins and apps on` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: codex-mcp-sources-isolation.test.ts: 10 fail/15 tests (exit 1); native-capability-isolation.test.ts: 2 fail/24 tests (exit 1); codex.test.ts: 3 fail/66 tests (exit 1)
- **codex-isolation** — `does not refuse a project forcing a server on` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: codex-mcp-sources-isolation.test.ts: 10 fail/15 tests (exit 1); native-capability-isolation.test.ts: 2 fail/24 tests (exit 1); codex.test.ts: 3 fail/66 tests (exit 1)
- **fed-security.jini** — `a preset's explicit default write grant lets the write run, and the admission report shows it` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `a preset's read tool needs no write grant` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-security 1: ${label} with a write grant is not refused` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-security 1: ${label} is unaffected by an empty write list` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-security 1: the write grant never admits a tool the allowlist dropped` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-security 1: through the revocation gate, the same write tool runs once 'may write' is granted` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-security 1: through the revocation gate, a read tool runs with no write grant` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-security 3: a call with no card is checked once — the re-check belongs to the approval wait` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-presets: a preset's explicit default write grant lets the write run, and the admission report shows it` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `fed-presets: a preset's read tool needs no write grant` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `an allowlisted destructive tool with a write grant is not refused` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.jini** — `a write-declaring tool on the allowlist and the write list is not refused` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: fed-security.unit.test.ts: 23 fail/34 tests (exit 1); fed-presets.unit.test.ts: 1 fail/3 tests (exit 1); mcp-federation.trust.test.ts: 2 fail/43 tests (exit 1); trust.pins.unit.test.ts: 1 fail/114 tests (exit 1); revocation.pins.test.ts: 1 fail/21 tests (exit 1); revocation.p5.test.ts: 1 fail/11 tests (exit 1); mcp-federation.registrations.test.ts: 1 fail/48 tests (exit 1); integration-contracts.test.ts: 1 fail/11 tests (exit 1); confirmation-policy.unit.test.ts: 0 fail/31 tests (exit 0); registrations.read-only.test.ts: 0 fail/4 tests (exit 0)
- **fed-security.tovu** — `T1-7: removing write_thing from the write list refuses it ('may write' is enforced); read_thing still completes` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: registrations.host-policy.unit.test.ts: 4 fail/31 tests (exit 1); registrations.test.ts: 0 fail/50 tests (exit 0); federated-approval-policy.test.ts: 2 fail/13 tests (exit 1); external-mcp-connection-revocation.test.ts: 0 fail/14 tests (exit 0); external-mcp-revocation.unit.test.ts: 0 fail/11 tests (exit 0); external-mcp-oauth.test.ts: 1 fail/78 tests (exit 1)
- **fed-security.tovu** — `rosterRefusalFor passes an allowlisted read tool, refuses a write tool with no write grant, and refuses one no longer allowlisted` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: registrations.host-policy.unit.test.ts: 4 fail/31 tests (exit 1); registrations.test.ts: 0 fail/50 tests (exit 0); federated-approval-policy.test.ts: 2 fail/13 tests (exit 1); external-mcp-connection-revocation.test.ts: 0 fail/14 tests (exit 0); external-mcp-revocation.unit.test.ts: 0 fail/11 tests (exit 0); external-mcp-oauth.test.ts: 1 fail/78 tests (exit 1)
- **gemini-chat** — `still runs %s with personal MCP OFF` — UNEXPECTED (phase1 FAIL)
  - file: packages/daemon/src/agent-executor/__tests__/runtime-policy.test.ts
```
AgentExecutorError: AgentExecutor: disabling personal Codex configuration requires run-scoped home staging.
    at Object.failBeforeSpawn (/home/user/Jini/packages/daemon/src/agent-executor/launch.ts:1029:11)
    at processTicksAndRejections (node:internal/process/task_queues:104:5)
    at Object.run (/home/user/Jini/packages/daemon/src/agent-executor/launch.ts:1532:25)
    at startFixture (/home/user/Jini/packages/daemon/src/agent-executor/__tests__/runtime-policy.test.ts:46:3)
    at /home/user/Jini/packages/daemon/src/agent-executor/__tests__/runtime-policy.test.ts:107:15
    at file:///home/user/Jini/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:533:5
    at runTest (file:///home/user/Jini/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1056:11)
    at runSuite (file:///home/user/Jini/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1205:15)
    at runFiles (file:///home/user/Jini/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1262:5)
    at startTests (file:///home/user/Jini/node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/dist/index.js:1271:3)
```
- **gemini-chat** — `runs antigravity in parity once personal MCP is ON` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: runtime-policy.test.ts: 4 fail/15 tests (exit 1)
- **agy-install-path** — `an antigravity/ symlink to config/ ends with exactly one entry, still a symlink` — UNEXPECTED (passed under mutation)
  - under mutation the lot files had these failures instead: install.test.ts: 4 fail/52 tests (exit 1)
- **urgent.w002** — OTHER failing test in phase 1: `D2: ip limiter denies before hashing and both strict counters are charged` in `apps/website/src/server/__tests__/routes/member-password-auth.test.ts`
```
not ok 7 - D2: ip limiter denies before hashing and both strict counters are charged
  ---
  duration_ms: 112.304595
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/server/__tests__/routes/member-password-auth.test.ts:1:10379'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
```
- **gem-ip.I** — OTHER failing test in phase 1: `vault default resolution never lists sibling credentials` in `apps/website/src/features/source-control/__tests__/store.unit.test.ts`
```
not ok 43 - vault default resolution never lists sibling credentials
  ---
  duration_ms: 0.870003
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/source-control/__tests__/store.unit.test.ts:1:27547'
  failureType: 'testCodeFailure'
  error: 'The credential could not be saved or unlocked. Check the site credential store.'
  code: 'ERR_TEST_FAILURE'
  stack: |-
    resolveDefaultForSourceControl (/home/user/Tovu/apps/website/src/features/source-control/store.ts:538:19)
```
- **gem-ip.I** — OTHER failing test in phase 1: `commitSiteToSourceControl: a vault result from another provider group is rejected as NO_CREDENTIALS_CONFIGURED before opening or forwarding ` in `apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts`
```
not ok 13 - commitSiteToSourceControl: a vault result from another provider group is rejected as NO_CREDENTIALS_CONFIGURED before opening or forwarding its token
  ---
  duration_ms: 160.910458
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:1:9715'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
```
- **gem-ip.I** — OTHER failing test in phase 1: `commitSiteToSourceControl: a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CONFIGURED message without exposing adapte` in `apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts`
```
not ok 14 - commitSiteToSourceControl: a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CONFIGURED message without exposing adapter details
  ---
  duration_ms: 181.778252
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:1:11894'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
```
- **gem-ip.J** — OTHER failing test in phase 1: `apply() restores an existing destination forward when change-set recording fails (byline=null, visible=false)` in `apps/website/src/features/post/__tests__/publish-content.test.ts`
```
not ok 21 - apply() restores an existing destination forward when change-set recording fails (byline=null, visible=false)
  ---
  duration_ms: 6.496398
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:1:14439'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
```
- **gem-ip.J** — OTHER failing test in phase 1: `apply() restores an existing destination forward when change-set recording fails (byline=Hidden credit, visible=false)` in `apps/website/src/features/post/__tests__/publish-content.test.ts`
```
not ok 22 - apply() restores an existing destination forward when change-set recording fails (byline=Hidden credit, visible=false)
  ---
  duration_ms: 3.115596
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:1:14439'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
```
- **gem-ip.J** — OTHER failing test in phase 1: `apply() restores an existing destination forward when change-set recording fails (byline=Visible credit, visible=true)` in `apps/website/src/features/post/__tests__/publish-content.test.ts`
```
not ok 23 - apply() restores an existing destination forward when change-set recording fails (byline=Visible credit, visible=true)
  ---
  duration_ms: 1.377321
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:1:14439'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
```
- **consent-backup** — OTHER failing test in phase 1: `ordinary media travels unchanged; an active document loses its uploader; an inactive document is dropped` in `apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts`
```
not ok 16 - ordinary media travels unchanged; an active document loses its uploader; an inactive document is dropped
  ---
  duration_ms: 258.31248
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts:1:11823'
  failureType: 'testCodeFailure'
  error: "Media 'm1' has no source blob."
  code: 'MISSING_MEDIA'
  name: 'SiteShareRefusal'
  stack: |-
```
- **sec1** — OTHER failing test in phase 1: `the composed plan and push back up THIS site: a credential sealed by the composed sealer, the real database snapshot, and the site's own fil` in `apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts`
```
not ok 4 - the composed plan and push back up THIS site: a credential sealed by the composed sealer, the real database snapshot, and the site's own files land in one commit
  ---
  duration_ms: 907.558197
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/site-backup-wiring.integration.test.ts:1:9125'
  failureType: 'testCodeFailure'
  error: |-
    the composed plan must succeed: {"planned":false,"code":"CREDENTIAL_NOT_FOUND","message":"no saved credential points at https://api.github.com (none are saved). Connect GitHub with credential_save with kind source-control (a form in this chat), or save a token on the Access Tokens page ('Add custom provider', base URL https://api.github.com), or name one with 'credential'."}
    
    false !== true
```
- **export-followups** — OTHER failing test in phase 1: `switchable site` in `apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts`
```
    not ok 1 - switchable site
      ---
      duration_ms: 669.39152
      type: 'test'
      location: '/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts:1:2354'
      failureType: 'testCodeFailure'
      error: 'sharing stays available'
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: true
```
- **export-followups** — OTHER failing test in phase 1: `install-dir site` in `apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts`
```
    not ok 2 - install-dir site
      ---
      duration_ms: 629.909861
      type: 'test'
      location: '/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/site-share-wiring.integration.test.ts:1:2354'
      failureType: 'testCodeFailure'
      error: 'sharing stays available'
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: true
```
- **export-followups** — OTHER failing test in phase 1: `fresh share projection preserves drafts/schedules/autosaves, excludes private rows and secret bytes across the WHOLE zip` in `apps/website/src/features/site-backup/__tests__/share.integration.test.ts`
```
not ok 2 - fresh share projection preserves drafts/schedules/autosaves, excludes private rows and secret bytes across the WHOLE zip
  ---
  duration_ms: 535.136924
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/share.integration.test.ts:1:8971'
  failureType: 'testCodeFailure'
  error: |-
    asset_blobs
    + actual - expected
    
```
- **export-followups** — OTHER failing test in phase 1: `L3 local: share/import preserves private documents and deduplicates blobs` in `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts`
```
not ok 1 - L3 local: share/import preserves private documents and deduplicates blobs
  ---
  duration_ms: 826.736861
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:5153'
  failureType: 'testCodeFailure'
  error: `Share path 'media/download-key.key' is unsafe: "media/download-key.key" has a '.key' extension, which is never published`
  code: 'UNSAFE_PATH'
  name: 'SiteShareRefusal'
  stack: |-
```
- **export-followups** — OTHER failing test in phase 1: `L3 s3: share/import preserves private documents and deduplicates blobs` in `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts`
```
not ok 2 - L3 s3: share/import preserves private documents and deduplicates blobs
  ---
  duration_ms: 749.509554
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:5153'
  failureType: 'testCodeFailure'
  error: `Share path 'media/download-key.key' is unsafe: "media/download-key.key" has a '.key' extension, which is never published`
  code: 'UNSAFE_PATH'
  name: 'SiteShareRefusal'
  stack: |-
```
- **export-followups** — OTHER failing test in phase 1: `L3 import explicitly rejects corrupt document before creating a site` in `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts`
```
not ok 4 - L3 import explicitly rejects corrupt document before creating a site
  ---
  duration_ms: 533.350299
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:12408'
  failureType: 'testCodeFailure'
  error: 'Invalid v2 share manifest, inventory or schema identity.'
  code: 'INVALID_ARCHIVE'
  name: 'SiteShareRefusal'
  stack: |-
```
- **export-followups** — OTHER failing test in phase 1: `L3 genuine pre-L3 share omits Trash and orphan payloads but rejects arbitrary uploads` in `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts`
```
not ok 14 - L3 genuine pre-L3 share omits Trash and orphan payloads but rejects arbitrary uploads
  ---
  duration_ms: 4598.53756
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:17987'
  failureType: 'testCodeFailure'
  error: 'Missing expected rejection.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
```
- **export-followups** — OTHER failing test in phase 1: `L3 isolated guard: destination-collision` in `apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts`
```
not ok 19 - L3 isolated guard: destination-collision
  ---
  duration_ms: 2423.982112
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:21742'
  failureType: 'testCodeFailure'
  error: |-
    The input did not match the regular expression /Conflicting imported document blob keys/. Input:
    
    'SiteShareRefusal: Referenced media is missing or failed its hash.'
```
- **export-followups** — OTHER failing test in phase 1: `B untrusted schema objects and partial restore errors leave no site, including app-data DBs` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
not ok 6 - B untrusted schema objects and partial restore errors leave no site, including app-data DBs
  ---
  duration_ms: 483.835119
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:14034'
  failureType: 'testCodeFailure'
  error: "Cannot set properties of undefined (setting 'bytes')"
  code: 'ERR_TEST_FAILURE'
  name: 'TypeError'
  stack: |-
```
- **export-followups** — OTHER failing test in phase 1: `duplicate manifest path` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
    not ok 14 - duplicate manifest path
      ---
      duration_ms: 14.190024
      type: 'test'
      location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:18369'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly deep-equal:
        + actual - expected
        
```
- **export-followups** — OTHER failing test in phase 1: `missing DB inventory` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
    not ok 17 - missing DB inventory
      ---
      duration_ms: 89.157135
      type: 'test'
      location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:18369'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly deep-equal:
        + actual - expected
        
```
- **export-followups** — OTHER failing test in phase 1: `verifier refuses malformed manifest contracts before invoking the database owner` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
not ok 7 - verifier refuses malformed manifest contracts before invoking the database owner
  ---
  duration_ms: 766.361335
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:16867'
  failureType: 'subtestsFailed'
  error: '2 subtests failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: share preflight independently rejects disagreeing local headers and ambiguous directory metadata
```
- **export-leftovers** — OTHER failing test in phase 1: `B untrusted schema objects and partial restore errors leave no site, including app-data DBs` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
not ok 6 - B untrusted schema objects and partial restore errors leave no site, including app-data DBs
  ---
  duration_ms: 483.835119
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:14034'
  failureType: 'testCodeFailure'
  error: "Cannot set properties of undefined (setting 'bytes')"
  code: 'ERR_TEST_FAILURE'
  name: 'TypeError'
  stack: |-
```
- **export-leftovers** — OTHER failing test in phase 1: `duplicate manifest path` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
    not ok 14 - duplicate manifest path
      ---
      duration_ms: 14.190024
      type: 'test'
      location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:18369'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly deep-equal:
        + actual - expected
        
```
- **export-leftovers** — OTHER failing test in phase 1: `missing DB inventory` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
    not ok 17 - missing DB inventory
      ---
      duration_ms: 89.157135
      type: 'test'
      location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:18369'
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly deep-equal:
        + actual - expected
        
```
- **export-leftovers** — OTHER failing test in phase 1: `verifier refuses malformed manifest contracts before invoking the database owner` in `apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts`
```
not ok 7 - verifier refuses malformed manifest contracts before invoking the database owner
  ---
  duration_ms: 766.361335
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:16867'
  failureType: 'subtestsFailed'
  error: '2 subtests failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: share preflight independently rejects disagreeing local headers and ambiguous directory metadata
```
- **fed-security.tovu** — OTHER failing test in phase 1: `beginConnect persists the discovered protected resource (typed endpoints)` in `apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts`
```
not ok 2 - beginConnect persists the discovered protected resource (typed endpoints)
  ---
  duration_ms: 5.023698
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts:1:4146'
  failureType: 'testCodeFailure'
  error: "provider 'connection-higgs' declares no supported grants"
  code: 'OAUTH_INVALID_REQUEST'
  name: 'OAuthError'
  stack: |-
```
- **fed-security.cross** — OTHER failing test in phase 1: `beginConnect persists the discovered protected resource (typed endpoints)` in `apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts`
```
not ok 2 - beginConnect persists the discovered protected resource (typed endpoints)
  ---
  duration_ms: 5.023698
  type: 'test'
  location: '/home/user/Tovu/apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts:1:4146'
  failureType: 'testCodeFailure'
  error: "provider 'connection-higgs' declares no supported grants"
  code: 'OAUTH_INVALID_REQUEST'
  name: 'OAuthError'
  stack: |-
```

## 3. Typecheck (a) — report only

### Jini (7 packages, `tsc --noEmit`, run with `--no-bail`; the brief's bailing form stops after the first failing package): 2 errors
```
src/__tests__/note-store.test.ts(134,42): error TS2345: Argument of type 'string | number | undefined' is not assignable to parameter of type 'OpenMode'.
src/federation/__tests__/fed-presets.unit.test.ts(45,50): error TS2353: Object literal may only specify known properties, and 'presetRegistry' does not exist in type 'AttachFederatedMcpToolsRequiredArgs'.
```

### Tovu website `tsconfig.json`: 1 errors
```
apps/website/src/cli/commands/owner-store.ts(79,21): error TS2322: Type 'Promise<LegacyImportReport>' is not assignable to type 'Promise<Record<string, unknown>>'.
```

### Tovu website `tsconfig.tests.json`: 394 errors
```
apps/website/src/assistant/__tests__/batch-tool-inputs.test.ts(308,59): error TS2345: Argument of type '{ workspaceId: string; themesDir: string; siteBinding: { dir: string; }; themes: DiscoveredTheme[]; resolveRoots: () => { repo: string; site: string; custom: string; }; authorize: (request: { ...;
apps/website/src/assistant/__tests__/byok-provider-turn.test.ts(858,17): error TS7022: 'tools' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
apps/website/src/assistant/__tests__/byok-provider-turn.test.ts(859,36): error TS7006: Parameter 'tool' implicitly has an 'any' type.
apps/website/src/assistant/__tests__/byok-provider-turn.test.ts(860,35): error TS7006: Parameter 'tool' implicitly has an 'any' type.
apps/website/src/assistant/__tests__/tool-registrations.theme-import-file.test.ts(68,3): error TS2322: Type '{ asked: string[]; client: FakeHttpClient; logged: string[]; workspaceId: string; themesDir: string; siteBinding: { dir: string; }; resolveRoots: () => { repo: string; site: string; custom: s
apps/website/src/cli/__tests__/unit/export-l149.unit.test.ts(27,7): error TS2322: Type '(input: ExportSiteOptions) => Promise<{ outputDir: string; routes: { succeeded: never[]; failed: never[]; }; assets: { succeeded: never[]; failed: never[]; }; skippedManifestEntries: never[]; unreferencedThemeFil
apps/website/src/cli/commands/owner-store.ts(79,21): error TS2322: Type 'Promise<LegacyImportReport>' is not assignable to type 'Promise<Record<string, unknown>>'.
apps/website/src/contracts/core/events/__tests__/outbox-drainer.test.ts(283,5): error TS2322: Type '({ name, attributes }: OperationTrackingInput) => { end: ({ outcome, failed }: OperationTrackingOutcome) => void; }' is not assignable to type '(input: OperationTrackingInput) => OperationTracker'.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch-provider.unit.test.ts(374,61): error TS2339: Property 'value' does not exist on type 'ProviderResult<SearchWriteResult>'.
apps/website/src/features/agent-plugins/__tests__/unit/bundled-search-meilisearch-provider.unit.test.ts(375,59): error TS2339: Property 'value' does not exist on type 'ProviderResult<SearchWriteResult>'.
apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts(648,68): error TS2345: Argument of type '{ workspaceId: string; authorize: () => Promise<{ allowed: true; reason: string; }>; clock: { nowMs: () => number; nowIso: () => string; }; externalMcpServerRepo: InMemoryExterna
apps/website/src/features/agent-plugins/__tests__/unit/tw2-L224-characterization.unit.test.ts(27,42): error TS2339: Property 'errors' does not exist on type 'never'.
apps/website/src/features/api-connections/__tests__/support/starting-browser.ts(35,5): error TS2322: Type '(url: string | URL) => { cookie?: undefined; } | { cookie: string; }' is not assignable to type '(url: string | URL) => Readonly<Record<string, string>>'.
apps/website/src/features/consent/__tests__/settings-link.test.ts(4,23): error TS7016: Could not find a declaration file for module 'jsdom'. '/home/user/Tovu/node_modules/jsdom/lib/api.js' implicitly has an 'any' type.
apps/website/src/features/consent/__tests__/unit/validation.property.unit.test.ts(13,5): error TS2339: Property 'diagnostic' does not exist on type 'TestContext | SuiteContext'.
```

### Desktop `npm run typecheck`: 13 errors
```
src/preload/preload.mts(85,3): error TS2353: Object literal may only specify known properties, and 'delete' does not exist in type 'OwnerStoreBridge'.
src/preload/preload.mts(85,12): error TS7006: Parameter 'input' implicitly has an 'any' type.
src/preload/preload.mts(85,77): error TS2339: Property 'delete' does not exist on type '{ readonly status: "runner:owner-store:status"; readonly list: "runner:owner-store:list"; readonly put: "runner:owner-store:put"; readonly import: "runner:owner-store:import"; }'.
src/preload/preload.mts(86,11): error TS7006: Parameter 'input' implicitly has an 'any' type.
src/preload/preload.mts(86,76): error TS2339: Property 'grant' does not exist on type '{ readonly status: "runner:owner-store:status"; readonly list: "runner:owner-store:list"; readonly put: "runner:owner-store:put"; readonly import: "runner:owner-store:import"; }'.
src/preload/preload.mts(87,12): error TS7006: Parameter 'input' implicitly has an 'any' type.
src/preload/preload.mts(87,77): error TS2339: Property 'revoke' does not exist on type '{ readonly status: "runner:owner-store:status"; readonly list: "runner:owner-store:list"; readonly put: "runner:owner-store:put"; readonly import: "runner:owner-store:import"; }'.
src/preload/preload.mts(88,10): error TS7006: Parameter 'input' implicitly has an 'any' type.
src/preload/preload.mts(88,75): error TS2339: Property 'sync' does not exist on type '{ readonly status: "runner:owner-store:status"; readonly list: "runner:owner-store:list"; readonly put: "runner:owner-store:put"; readonly import: "runner:owner-store:import"; }'.
src/preload/preload.mts(89,12): error TS7006: Parameter 'input' implicitly has an 'any' type.
src/preload/preload.mts(89,77): error TS2339: Property 'export' does not exist on type '{ readonly status: "runner:owner-store:status"; readonly list: "runner:owner-store:list"; readonly put: "runner:owner-store:put"; readonly import: "runner:owner-store:import"; }'.
src/preload/preload.mts(90,13): error TS7006: Parameter 'input' implicitly has an 'any' type.
src/preload/preload.mts(90,78): error TS2339: Property 'restore' does not exist on type '{ readonly status: "runner:owner-store:status"; readonly list: "runner:owner-store:list"; readonly put: "runner:owner-store:put"; readonly import: "runner:owner-store:import"; }'.
```

Manifest nit candidates: `as never` casts, `VaultPutInput` import, `openSqliteFileKernel` generic, `DbOpsPort` implementers — **none of these four showed up** in any of the four logs (grep found 0 matches). The website test-config errors (394) are mostly implicit-any / mock-shape errors in test files (e.g. `batch-tool-inputs.test.ts`, `byok-provider-turn.test.ts`, missing `jsdom` types); the desktop 13 are all `preload.mts` referencing `OwnerStoreBridge` actions (`delete/grant/revoke/sync/export/restore`) that `src/contracts/owner-store.ts` does not declare; the website `tsconfig.json` single error is `cli/commands/owner-store.ts(79,21)` (`Promise<LegacyImportReport>` vs `Promise<Record<string, unknown>>`).
## 4. Rechecks (d)

All 10 pass now (each file run fresh, `timeout 300`, website / desktop-renderer runners). Last night's results file (`cloud/red-1026-night-results`, RESULTS.md, 1981 lines) was used for comparison; last night these 8 names failed while GREEN-expected and the 2 files died.

| file | test | now | file duration | exit |
|---|---|---|---|---|
| `features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts` | a stale project update remains a CAS conflict when no other row owns the requested label | ok (13 tests in file, 0 failed) | 2.0 s | 0 |
| `features/consent/__tests__/service.test.ts` | legacy editor reads preserve valid text at each limit and an empty optional link label | ok (42 tests in file, 0 failed) | 3.4 s | 0 |
| `features/consent/__tests__/readiness.pins.test.ts` | inventory caps at 200 entries and distinguishes an exhausted head from more templates | ok (14 tests in file, 0 failed) | 0.3 s | 0 |
| `features/project-keys/__tests__/tools.unit.test.ts` | save attaches to this site immediately, and detach leaves the saved row | ok (12 tests in file, 0 failed) | 0.7 s | 0 |
| `features/project-keys/__tests__/tools.unit.test.ts` | a committed provider save attaches immediately and retains the restart outcome | ok (12 tests in file, 0 failed) | 0.7 s | 0 |
| `server/inbound/admin-http/routes/plugins/__tests__/unit/provider-settings-route.unit.test.ts` | a provider settings save attaches to this site and reopening shows the saved fields | ok (18 tests in file, 0 failed) | 2.1 s | 0 |
| `server/runtime/composition/__tests__/provider-config-source.unit.test.ts` | an attached project's migrated OTel choice feeds boot, both cards and the next save without secret r | ok (16 tests in file, 0 failed) | 0.4 s | 0 |
| `server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts` | provider_status reports presence only: configured, missing, store, never a value | ok (12 tests in file, 0 failed) | 0.8 s | 0 |
| `renderer/App.render.test.ts` | T3: navigating away from Websites and back preserves the open admin webview | ok (16 tests in file, 0 failed) | 2.5 s | 0 |
| `platform/site-dir/__tests__/integration/duplicate-pglite-store.integration.test.ts` | T38: a synchronous source-open failure releases the owner lock | ok (7 tests in file, 0 failed) | 12.2 s | 0 |

The two file aborts do not recur: `App.render.test.ts` completes all 16 tests in 2.5 s (T3 passes; last night it died at ~99.5 s after 6 tests) and `duplicate-pglite-store.integration.test.ts` completes 7 tests in 12 s (T38 passes; last night it died at 14 s with no output). No last lines to quote because nothing died.
## 5. Known-failure diagnosis (e)

### 5.1 "Hanging" share suites (each run ALONE, `timeout 300`, `--test-timeout=60000 --test-reporter=spec`)

**Result: none of the eight hangs the process here. All exited on their own in 1–71 s; the only stall is ONE test in share-refusals that hit the 60 s per-test timeout. Six of the eight FAIL (not hang) with assertion/validation errors; two pass.** (Note: the *sweep* run of `share-backend.unit.test.ts`, a different file, did stall until the 300 s timeout — see section 6.)

| file | exit | wall s | pass | fail | notes |
|---|---|---|---|---|---|
| import-malicious.integration | 1 | 23 | 91 | 4 |  |
| library-share.integration | 1 | 43 | 15 | 5 |  |
| share.integration | 1 | 4 | 9 | 1 |  |
| share-delivery.integration | 1 | 3 | 5 | 1 |  |
| share-hosting.contract.integration | 0 | 1 | 3 | 0 |  |
| share-plugin-policy.integration | 0 | 13 | 3 | 0 |  |
| share-refusals.integration | 1 | 71 | 40 | 1 | 60 s test-timeout hit |
| share-round-trip.integration | 1 | 7 | 4 | 3 |  |

**import-malicious.integration** — failing: `B untrusted schema objects and partial restore errors leave no site, including app-data DBs`; `duplicate manifest path`; `missing DB inventory`; `verifier refuses malformed manifest contracts before invoking the database owner`
```
test at apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:14034
✖ B untrusted schema objects and partial restore errors leave no site, including app-data DBs (646.075416ms)
  TypeError [Error]: Cannot set properties of undefined (setting 'bytes')
      at <anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:268:79)
      at <anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:68:57)
      at mutateManifest (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:66:16)
test at apps/website/src/features/site-backup/__tests__/import-malicious.integration.test.ts:1:18369
✖ duplicate manifest path (14.134819ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    Comparison {
  +   code: 'UNSAFE_PATH'
  -   code: 'INVALID_ARCHIVE'
    }
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: SiteShareRefusal: Duplicate file or file/directory collision.
        at unsafeSharePath (/home/user/Tovu/apps/website/src/features/site-backup/share-file-policy.ts:125:58)
        at claimSharePath (/home/user/Tovu/apps/website/src/features/site-backup/share-file-policy.ts:147:109)
        at validateFiles (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:71:5)
        at validateManifest (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:58:17)
        at parseArchiveManifest (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:48:3)
        at parseShareManifest (/home/user/Tovu/apps/website/src/features/site-backup/import-verifier-inventory.ts:143:10)
        at verifySiteImport (/home/user/Tovu/apps/website/src/features/site-backup/import-verifier.ts:32:20)
    expected: { code: 'INVALID_ARCHIVE' },
    operator: 'rejects',
```
**library-share.integration** — failing: `L3 genuine pre-L3 share omits Trash and orphan payloads but rejects arbitrary uploads`; `L3 import explicitly rejects corrupt document before creating a site`; `L3 isolated guard: destination-collision`; `L3 local: share/import preserves private documents and deduplicates blobs`; `L3 s3: share/import preserves private documents and deduplicates blobs`
```
test at apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:5153
✖ L3 local: share/import preserves private documents and deduplicates blobs (918.472138ms)
  SiteShareRefusal: Share path 'media/download-key.key' is unsafe: "media/download-key.key" has a '.key' extension, which is never published
      at validateSharePath (/home/user/Tovu/apps/website/src/features/site-backup/share-file-policy.ts:105:11)
      at mediaPath (/home/user/Tovu/apps/website/src/features/site-backup/archive-media.ts:83:3)
      at bufferArchiveMedia (/home/user/Tovu/apps/website/src/features/site-backup/archive-media.ts:36:18)
    code: 'UNSAFE_PATH'
  }
test at apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:5153
✖ L3 s3: share/import preserves private documents and deduplicates blobs (966.842174ms)
  SiteShareRefusal: Share path 'media/download-key.key' is unsafe: "media/download-key.key" has a '.key' extension, which is never published
      at validateSharePath (/home/user/Tovu/apps/website/src/features/site-backup/share-file-policy.ts:105:11)
      at mediaPath (/home/user/Tovu/apps/website/src/features/site-backup/archive-media.ts:83:3)
      at bufferArchiveMedia (/home/user/Tovu/apps/website/src/features/site-backup/archive-media.ts:36:18)
    code: 'UNSAFE_PATH'
  }
test at apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts:1:12408
✖ L3 import explicitly rejects corrupt document before creating a site (695.097737ms)
  SiteShareRefusal: Invalid v2 share manifest, inventory or schema identity.
      at invalid (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:31:35)
      at validateMedia (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:83:53)
      at validateManifest (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:60:3)
      at buildArchiveManifest (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:36:3)
      at fixtureManifest (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/archive.fixture.ts:48:10)
      at Object.archiveWithDatabase (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import.fixture.ts:112:46)
    code: 'INVALID_ARCHIVE'
```
**share.integration** — failing: `fresh share projection preserves drafts/schedules/autosaves, excludes private rows and secret bytes across the`
```
test at apps/website/src/features/site-backup/__tests__/share.integration.test.ts:1:8971
✖ fresh share projection preserves drafts/schedules/autosaves, excludes private rows and secret bytes across the WHOLE zip (611.768319ms)
  AssertionError [ERR_ASSERTION]: asset_blobs
  + actual - expected
    [
      {
  +     content_type: 'application/octet-stream',
  -     content_type: null,
        created_at: '2026-10-18T12:00:00.000Z',
        created_by_principal: 'owner',
        document_owned: 0,
        id: 'blob',
        sha256: '81e146c91637ae2a33fda11a66dea39f1fbc493dc3050cd691ae3e40f7125d85',
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ { id: 'blob', workspace_id: 'ws', sha256: '81e146c91637ae2a33fda11a66dea39f1fbc493dc3050cd691ae3e40f7125d85', storage_key: 'ws/ws/blobs/81/81e146c91637ae2a33fda11a66dea39f1fbc493dc3050cd
    expected: [ { id: 'blob', workspace_id: 'ws', sha256: '81e146c91637ae2a33fda11a66dea39f1fbc493dc3050cd691ae3e40f7125d85', storage_key: 'ws/ws/blobs/81/81e146c91637ae2a33fda11a66dea39f1fbc493dc3050
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```
**share-delivery.integration** — failing: `no delivery returns a private ZIP download and a clear link-setup message`
```
test at apps/website/src/features/site-backup/__tests__/share-delivery.integration.test.ts:1:7711
✖ no delivery returns a private ZIP download and a clear link-setup message (125.124228ms)
  SiteShareRefusal: Invalid v2 share manifest, inventory or schema identity.
      at invalid (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:31:35)
      at validateFiles (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:74:81)
      at validateManifest (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:58:17)
      at buildArchiveManifest (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:36:3)
      at buildManifestFile (/home/user/Tovu/apps/website/src/features/site-backup/share-zip.ts:61:32)
      at buildShareZip (/home/user/Tovu/apps/website/src/features/site-backup/share-zip.ts:93:24)
    code: 'INVALID_ARCHIVE'
  }
```
**share-refusals.integration** — failing: `backend reports archive progress without starting a second ZIP and keeps verified links private`; `export leaves the source's publish history destinations untouched and never carries them`
```
test at apps/website/src/features/site-backup/__tests__/share-refusals.integration.test.ts:1:7775
✖ export leaves the source's publish history destinations untouched and never carries them (1007.620041ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  false !== true
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
test at apps/website/src/features/site-backup/__tests__/share-refusals.integration.test.ts:1:27563
✖ backend reports archive progress without starting a second ZIP and keeps verified links private (60002.27114ms)
  'test timed out after 60000ms'
```
**share-round-trip.integration** — failing: `A production preparation → public download → B import preserves content: appData`; `A production preparation → public download → B import preserves content: inSite`; `production export still refuses literal credentials inside a hashed plugin package`
```
test at apps/website/src/features/site-backup/__tests__/share-round-trip.integration.test.ts:1:4453
✖ A production preparation → public download → B import preserves content: inSite (1166.810007ms)
  AssertionError [ERR_ASSERTION]: A exports every required package byte
  + actual - expected
  + Map(0) {}
  - Map(10) {
  -   'mcp.json' => Buffer(68) [Uint8Array] [
  -     123,
  -     34,
  -     109,
  -     99,
  -     112,
  -     83,
  -     101,
  -     114,
  -     118,
  -     101,
  -     114,
  -     115,
  -     34,
  -     58,
  -     123,
  -     34,
  -     112,
  -     111,
  -     114,
```
### 5.2 `tool-contribution-registry.test.ts` — "installs exactly the converted domains — no more, no fewer"

Fails (17 pass / 1 fail). Error: `Expected values to be strictly deep-equal` — the **actual** installed list contains three domains the **expected** list does not: `observability` (after `system-server-logs`), `project-keys` and `provider-status` (after `credential-save`). Likely cause: the fix lots (keys: `project-keys`, `provider-status`; sentry-env/observability) registered new first-party tool domains in `installFirstPartyToolContributors`, and the test's hard-coded expected domain list was not updated. Evidence: diff above (`+ 'observability'`, `+ 'project-keys'`, `+ 'provider-status'`, nothing missing from actual). Not a hang or env problem.

### 5.3 `publish-site-route.test.ts` — 7 failing tests (26 pass)

1. `publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CREDENTIALS_CONFIGURED result, never touching a real GitHub/Vercel API`
2. `publish-site: a concurrent second trigger gets 409 while the first provider request is held open`
3. `publish-site: a concurrent call through the ASSISTANT TOOL while the HTTP route's own publish is in flight is refused, not raced — the two callers share one guard (Terra audit finding #1, 2026-08-16)`
4. `publish-site: a github-pages trigger WITH a valid 'branch', and a vercel trigger WITH a valid 'teamId', both parse and start a real run (202) -- same hermetic NO_CREDENTIALS_CONFIGURED settle ...`
5. `publish-site: a trigger naming a credential this workspace does not own is refused by the run — never falls back to the default/env credential`
6. `publish-site: branch, teamId and projectName reach the provider port and a successful run completes`
7. `publish-site: netlify, cloudflare-pages and s3-compatible TRIGGER requests (not just their preview counterparts above) parse and start a real run (202) ...`

All seven fail with the same assertion: `409 !== 202` (`actual: 409, expected: 202`). Likely cause (read from code, not proven by dumping the 409 body): `server/inbound/admin-http/routes/system/publish-site.ts:271-274` now runs a cookie-consent gate (`deps.siteConsent.deploymentCheck(...)`, else `deploymentRefusal(CONSENT_UNAVAILABLE)`) before the run-slot check and answers **409** when it refuses; the test file overrides `siteConsent.deploymentCheck` only in its last test (`publish-site-route.test.ts:1079-1080`) and in the assistant-tool deps at ~L419, so the hermetic route deps most tests use get the real consent service, which refuses a site with no reviewed consent policy. (The "busy" 409 at L284 is the other candidate; the 7 tests are exactly those that POST a trigger, which the consent gate precedes.) Suggested confirmation: print `res.body` in one failing test.

### 5.4 Lot gem-ip.I and gem-ip.J failures (phase-1 errors)

- **I — "vault default resolution never lists sibling credentials"** (`store.unit.test.ts:626`): error `The credential could not be saved or unlocked. Check the site credential store.` thrown from `resolveDefaultForSourceControl` (`store.ts:538`). The test sets `deps.repo.vault.list = async () => { throw ... }` ("default reads must not list"). **Theory CONFIRMED in substance, with a refinement:** `resolveDefaultForSourceControl` → `findDefaultOpened` (`store.ts:509-523`) → `selectSourceControlCredential` (`store.ts:489-494`) resolves through `repo.listByProvider`, which in `vault-adapter.ts:60-62` is `this.vault.list(...)`. So the store DOES list (via `listByProvider`) instead of `findDefault`, the test's `vault.list` trap throws, and the catch at `store.ts:541` converts it into the generic store-unconfigured error.
- **commit-site.unit "a vault result from another provider group is rejected as NO_CREDENTIALS_CONFIGURED before opening or forwarding its token"** and **"a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CONFIGURED message..."**: actual message `No source control credential is configured for 'example-git'. Connect one in the admin's Source Control page first.` vs expected `credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.` The tests mock `vault.findDefault` (`commit-site.unit.test.ts:288`, `:312`) to return a wrong-group / throwing result, but the store no longer calls `findDefault` (it calls `listByProvider`→`vault.list`, then `vault.get` by id, `store.ts:519`), so the mock is never hit and the real (empty) inventory yields plain "no credential configured". **Theory CONFIRMED** (mock on `vault.findDefault` while `store.ts` resolves through `listByProvider`). With the Jini/Tovu lot sources at BASE the sweep did not need rechecking: these are lot-file tests (p1).
- **J — three "apply() restores an existing destination forward when change-set recording fails (byline=...)"** (`publish-content.test.ts`): `Expected values to be strictly deep-equal` — the actual event list has an extra leading `'content.saved'` before `'entry.unpublished','entry.published'` in all three variants. **Theory CONFIRMED**: J gets an extra `content.saved` event (the forward-restore now emits `content.saved`; the test's expected sequence omits it).

### 5.5 `run-ops-contract.test.ts` — 2 failures; keys / gem-ch.H as cause?

Both fail in the sweep (HEAD), **and still fail identically with lot `keys` applied and with lot `gem-ch.H` applied** (8 tests run, same 2 failures each time): 
- `transport failures are named per method; a credential removed after binding is reported as changed` — `ToolInputError: No saved custom credential labeled 'ops'. Choose another credentialLabel.`
- `a request fault the host does not classify (a row this site's sealer cannot open) passes through unchanged and sends nothing` — `ToolInputError: Credential 'ops' does not allow host 'api.example-host.dev'. Add that host to the saved credential or choose another credentialLabel.`

Verdict: **not keys, and not gem-ch.H** (reverting either lot's sources does not make them pass). Likely cause: the test seeds a custom credential labelled `ops` through a fixture whose shape no longer matches what the custom-credential resolver looks up (label not found / host allowlist not carried), i.e. a fixture/contract drift outside both lots; not investigated further (cap).

## 6. Sweep failures (c)

Tier 1 (186 files) then tier 2 ran in the brief's order; every queued item ran (NOT RUN: 0). The 9 files labelled `expected-by-fed-security` were run; 5 failed, 4 passed (listed below). BASE re-check (`mutate.mjs ALL apply`, 15 files, one batch) and a Jini analogue (all 6 Jini lot mutations reverted, 4 failing Jini files) were used for classification: every rechecked file also fails at BASE, so **no failure is classified NEW**. Files not rechecked (cap of 15) are `unsure` — they do not appear in any manifest as known; error signatures are given so they can be grouped.

| file | tier | failed/tests | class |
|---|---|---|---|
| `FULL-daemon` | pkg | 7/3712 | pre-existing (still fails with all Jini lot sources reverted to BASE) |
| `FULL-db` | pkg | 1/697 | pre-existing (still fails with all Jini lot sources reverted to BASE) |
| `FULL-server` | pkg | 3/459 | pre-existing (still fails with all Jini lot sources reverted to BASE) |
| `apps/desktop/src/renderer/rescan-wiring.test.ts` | 2 | 1/6 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/desktop/src/renderer/site-card-actions-wiring.test.ts` | 2 | 1/22 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/desktop/src/renderer/site-card-menu-wiring.test.ts` | 2 | 1/10 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/desktop/src/renderer/site-port.rules.test.ts` | 2 | 1/7 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/desktop/src/renderer/use-add-site.hooks.test.ts` | 2 | 1/16 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/desktop/src/renderer/visible-interval.test.ts` | 2 | 1/7 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/desktop/src/renderer/websites-width.test.ts` | 1 | 2/2 | pre-existing (fails at BASE: ALL apply) |
| `apps/desktop/src/site-dir-store.test.ts` | 2 | 1/49 | pre-existing (fails at BASE: ALL apply) |
| `apps/desktop/src/webview-guest-policy.test.ts` | 2 | 1/13 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/approval-single-path.test.ts` | 2 | 1/1 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/byok-google-catalog.test.ts` | 2 | 1/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts` | 2 | 1/77 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/credential-setup-search.test.ts` | 2 | 1/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/cross-site-read-catalog.test.ts` | 2 | 1/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/mcp-federation.call-confirmation.test.ts` | 1 | 12/21 | expected-by-fed-security |
| `apps/website/src/assistant/__tests__/mcp-federation.extra-approval-checks.test.ts` | 1 | 7/35 | expected-by-fed-security |
| `apps/website/src/assistant/__tests__/mcp-federation.remembered-approvals.test.ts` | 1 | 27/30 | expected-by-fed-security |
| `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` | 2 | 1/9 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.ask-choice.integration.test.ts` | 2 | 1/1 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts` | 2 | 1/4 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts` | 2 | 1/20 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/assistant/__tests__/newsletter-delivery-search-discoverability.test.ts` | 2 | 1/2 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts` | 2 | 1/18 | pre-existing (listed as KNOWN, brief (e)2) |
| `apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts` | 2 | 2/4 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/assistant/__tests__/tool-search-keywords.operator-requests.test.ts` | 2 | 1/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/assistant/mcp-federation/__tests__/confirmation-policy.unit.test.ts` | 1 | 21/33 | expected-by-fed-security |
| `apps/website/src/assistant/mcp-federation/__tests__/registrations.read-only.test.ts` | 1 | 2/4 | expected-by-fed-security |
| `apps/website/src/cli/__tests__/integration/export-command.integration.test.ts` | 2 | 1/5 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts` | 2 | 3/3 | ENV (no Postgres server) |
| `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts` | 2 | 2/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts` | 1 | 4/4 | ENV (no Postgres server) |
| `apps/website/src/features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts` | 2 | 1/6 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/deployments/deploy-ops/__tests__/run-ops-contract.test.ts` | 1 | 2/8 | pre-existing (listed as KNOWN, brief (e)5) |
| `apps/website/src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts` | 1 | 3/16 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/features/forms/__tests__/repo.postgres.test.ts` | 2 | 1/1 | ENV (no Postgres server) |
| `apps/website/src/features/post/__tests__/post.delete.test.ts` | 2 | 1/41 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/post/__tests__/post.schedule-events.test.ts` | 2 | 10/18 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/features/post/__tests__/post.transition-events.test.ts` | 2 | 5/5 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/post/__tests__/repo.postgres.test.ts` | 2 | 1/1 | ENV (no Postgres server) |
| `apps/website/src/features/post/__tests__/retire-post.test.ts` | 2 | 1/8 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/site-backup/__tests__/import-private-rows.integration.test.ts` | 2 | 1/2 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts` | 1 | 1/31 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts` | 1 | 1/1 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/features/site-backup/__tests__/share-delivery.integration.test.ts` | 1 | 1/6 | pre-existing (listed as KNOWN, brief (e)1) |
| `apps/website/src/features/site-backup/__tests__/share-file-policy.unit.test.ts` | 1 | 2/146 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/features/site-backup/__tests__/share-refusals.integration.test.ts` | 1 | 1/38 | pre-existing (listed as KNOWN, brief (e)1) |
| `apps/website/src/features/site-backup/__tests__/share-round-trip.integration.test.ts` | 1 | 3/7 | pre-existing (listed as KNOWN, brief (e)1) |
| `apps/website/src/features/site-backup/__tests__/share-service.unit.test.ts` | 1 | 1/34 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/features/site-backup/__tests__/sources.unit.test.ts` | 1 | 1/60 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts` | 1 | 6/6 | ENV (no Postgres server) |
| `apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts` | 2 | 2/2 | ENV (no Postgres server) |
| `apps/website/src/platform/site-dir/__tests__/unit/resolve-workspace.postgres.test.ts` | 2 | 1/1 | ENV (no Postgres server) |
| `apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts` | 2 | 2/3 | ENV (no Postgres server) |
| `apps/website/src/server/__tests__/routes/export-site-route.test.ts` | 2 | 1/10 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/__tests__/routes/members-public-complete-sign-in.test.ts` | 1 | 2/12 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/__tests__/routes/members-public-sign-in.test.ts` | 1 | 2/18 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` | 1 | 7/33 | pre-existing (listed as KNOWN, brief (e)3) |
| `apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts` | 2 | 1/6 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts` | 2 | 2/6 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site.tw4.pins.test.ts` | 2 | 1/1 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/inbound/admin-http/routes/system/site-shares.integration.test.ts` | 1 | 1/1 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-kind-filter.unit.test.ts` | 2 | 2/5 | unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.event-log-bound-wiring.unit.test.ts` | 2 | 1/2 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.federation-runtime-wiring.unit.test.ts` | 2 | 1/11 | unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.page-context-wiring.unit.test.ts` | 2 | 1/2 | unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.run-start-branches.unit.test.ts` | 2 | 6/35 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts` | 2 | 6/16 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts` | 2 | 7/13 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/server/inbound/assistant/__tests__/message-attachment-delivery.unit.test.ts` | 2 | 2/2 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/inbound/assistant/__tests__/native-fallback-wiring.unit.test.ts` | 2 | 1/7 | unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE |
| `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts` | 2 | 4/9 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/server/runtime/composition/__tests__/commerce-data-retention.integration.test.ts` | 1 | 1/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts` | 1 | 2/2 | ENV (no Postgres server) |
| `apps/website/src/server/runtime/composition/__tests__/form-delivery-purge.integration.test.ts` | 2 | 3/3 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/runtime/composition/__tests__/form-delivery-vertical-slice.integration.test.ts` | 2 | 9/11 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts` | 2 | 6/6 | ENV (no Postgres server) |
| `apps/website/src/server/runtime/composition/__tests__/open-site-store.postgres.test.ts` | 2 | 2/2 | ENV (no Postgres server) |
| `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts` | 2 | 1/20 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/runtime/composition/__tests__/site-key-recovery.unit.test.ts` | 2 | 2/12 | pre-existing (fails at BASE: ALL apply) |
| `apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts` | 1 | 1/6 | unsure — not rechecked at BASE (cap 15 files) |
| `apps/website/src/server/runtime/lifecycle/__tests__/daemon-supervisor.test.ts` | 2 | 1/23 | unsure — not rechecked at BASE (cap 15 files) |

### Details

- `FULL-daemon` — tier pkg, 7/3712 failed, exit 1 — **pre-existing (still fails with all Jini lot sources reverted to BASE)**
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/runtime-policy.test.ts :: still runs codex with personal MCP OFF`: AgentExecutorError: AgentExecutor: disabling personal Codex configuration requires run-scoped home staging.
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/usage-cost-basis.test.ts :: uses session cost basis for third-party`: AssertionError: expected [ { type: 'usage', …(4) } ] to deeply equal [ { type: 'usage', …(3) } ]
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/usage-cost-basis.test.ts :: uses run cost basis for third-party`: AssertionError: expected [ { type: 'usage', …(3) } ] to deeply equal [ { type: 'usage', …(2) } ]
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/usage-cost-basis.test.ts :: uses default run cost basis for third-party`: AssertionError: expected [ { type: 'usage', …(3) } ] to deeply equal [ { type: 'usage', …(2) } ]
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/usage-cost-basis.test.ts :: uses session cost basis for claude`: AssertionError: expected [ { type: 'usage', …(4) } ] to deeply equal [ { type: 'usage', …(3) } ]
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/usage-cost-basis.test.ts :: uses run cost basis for claude`: AssertionError: expected [ { type: 'usage', …(3) } ] to deeply equal [ { type: 'usage', …(2) } ]
  - `/home/user/Jini/packages/daemon/src/agent-executor/__tests__/usage-cost-basis.test.ts :: uses default run cost basis for claude`: AssertionError: expected [ { type: 'usage', …(3) } ] to deeply equal [ { type: 'usage', …(2) } ]
- `FULL-db` — tier pkg, 1/697 failed, exit 1 — **pre-existing (still fails with all Jini lot sources reverted to BASE)**
  - `/home/user/Jini/packages/db/src/__tests__/import-isolation.test.ts :: database import isolation scans every production TypeScript file and confines op`: AssertionError: expected [ Array(1) ] to deeply equal []
- `FULL-server` — tier pkg, 3/459 failed, exit 1 — **pre-existing (still fails with all Jini lot sources reverted to BASE)**
  - `/home/user/Jini/packages/server/src/__tests__/create-local-node-daemon.test.ts :: createLocalNodeDaemon reflects the resolved bind host onto env.JINI_`: AssertionError: expected undefined to be '127.0.0.1' // Object.is equality
  - `/home/user/Jini/packages/server/src/__tests__/create-local-node-daemon.test.ts :: L039a preset option forwarding pins keeps default and host-supplied `: AssertionError: expected { JINI_BIND_HOST: '127.0.0.1' } to be {} // Object.is equality
  - `/home/user/Jini/packages/server/src/__tests__/create-local-node-daemon.test.ts :: L039a preset option forwarding pins keeps default and host-supplied `: AssertionError: expected { JINI_BIND_HOST: '127.0.0.1' } to be {} // Object.is equality
- `apps/desktop/src/renderer/rescan-wiring.test.ts` — tier 2, 1/6 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the Projects header renders a Rescan control wired to that hook`: not ok 5 - the Projects header renders a Rescan control wired to that hook | error: 'SharedKeysLauncher is not defined' | MainHeader (eval at sourceFunction (file:///home/user/Tovu/apps/desktop/src/renderer/source-test-harness.ts:1:735), <anonymous>:10:33) | TestContext.<anonymous> (/home/user/Tovu/apps/desktop/src/renderer/rescan-wiring.test.ts:86:27) | Test.runInAsyncScope (node:async_hooks:227:14)
- `apps/desktop/src/renderer/site-card-actions-wiring.test.ts` — tier 2, 1/22 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `main's refreshed record reaches the grid, rather than waiting on the 4s poll`: not ok 18 - main's refreshed record reaches the grid, rather than waiting on the 4s poll | error: 'MainArea must forward the actual update callback' | expected: | actual: |- | import { navAvailability } from './nav-availability.js';
- `apps/desktop/src/renderer/site-card-menu-wiring.test.ts` — tier 2, 1/10 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `a running record with a local stopping status omits Open in browser throughout the rendered card`: not ok 10 - a running record with a local stopping status omits Open in browser throughout the rendered card | error: 'ResourceSiteFigure is not defined' | SiteCard (eval at <anonymous> (file:///home/user/Tovu/apps/desktop/src/renderer/site-card-menu-wiring.test.ts:1:5211), <anonymous>:46:37) | Object.react_stack_bottom_frame (/home/user/Tovu/apps/desktop/node_modules/react-dom/cjs/react-dom-server-legacy.node.develo
- `apps/desktop/src/renderer/site-port.rules.test.ts` — tier 2, 1/7 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the rendered card keeps the running address in the status title, never in its copy`: not ok 4 - the rendered card keeps the running address in the status title, never in its copy | error: 'ResourceSiteFigure is not defined' | SiteCard (eval at sourceFunction (file:///home/user/Tovu/apps/desktop/src/renderer/source-test-harness.ts:1:735), <anonymous>:46:37) | TestContext.<anonymous> (/home/user/Tovu/apps/desktop/src/renderer/site-port.rules.test.ts:58:18) | Test.runInAsyncScope (node:async_hooks:227:1
- `apps/desktop/src/renderer/use-add-site.hooks.test.ts` — tier 2, 1/16 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the Projects header renders the Add Tovu Website button, wired and disableable`: not ok 11 - the Projects header renders the Add Tovu Website button, wired and disableable | error: |- | The input did not match the regular expression /onClick=\{\(\) => void onAddSite\(\)\}/. Input: | "import { navAvailability } from './nav-availability.js';\n" + | "import { reportShellTelemetry } from './product-telemetry.js';\n" +
- `apps/desktop/src/renderer/visible-interval.test.ts` — tier 2, 1/7 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the projects polling hook schedules its listSites callback every 4000ms`: not ok 6 - the projects polling hook schedules its listSites callback every 4000ms | error: 'useRef is not defined' | useSitesPolling (eval at <anonymous> (file:///home/user/Tovu/apps/desktop/src/renderer/visible-interval.test.ts:1:3248), <anonymous>:9:27) | TestContext.<anonymous> (/home/user/Tovu/apps/desktop/src/renderer/visible-interval.test.ts:128:3) | Test.runInAsyncScope (node:async_hooks:227:14)
- `apps/desktop/src/renderer/websites-width.test.ts` — tier 1, 2/2 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `Websites fits at 375px with every nav control and header action inside the page`: not ok 1 - Websites fits at 375px with every nav control and header action inside the page | error: 'ResourcesChip is not defined' | TopNav (eval at sourceFunction (file:///home/user/Tovu/apps/desktop/src/renderer/source-test-harness.ts:1:735), <anonymous>:22:33) | Object.react_stack_bottom_frame (/home/user/Tovu/apps/desktop/node_modules/react-dom/cjs/react-dom-server-legacy.node.development.js:9808:18) | renderWith
- `apps/desktop/src/site-dir-store.test.ts` — tier 2, 1/49 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `initSiteDir creates a complete blank site with the requested name through Tovu's actual CLI`: not ok 40 - initSiteDir creates a complete blank site with the requested name through Tovu's actual CLI | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/desktop/src/webview-guest-policy.test.ts` — tier 2, 1/13 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the sites-home attach registration executes the admission check before granting the preload`: not ok 13 - the sites-home attach registration executes the admission check before granting the preload | error: |- | Expected values to be strictly deep-equal: | + actual - expected | {
- `apps/website/src/assistant/__tests__/approval-single-path.test.ts` — tier 2, 1/1 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `human approval asking stays in the shared owner and its named host transports`: not ok 1 - human approval asking stays in the shared owner and its named host transports | error: |- | Expected values to be strictly deep-equal: | + actual - expected | + [
- `apps/website/src/assistant/__tests__/byok-google-catalog.test.ts` — tier 2, 1/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `EVERY wired tool's outbound Gemini schema is structurally valid — the whole catalog, not a sample`: not ok 1 - EVERY wired tool's outbound Gemini schema is structurally valid — the whole catalog, not a sample | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts` — tier 2, 1/77 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `BYOK federation: settled admitted tools execute with remote names and arguments, while unlisted tools stay refused`: not ok 35 - BYOK federation: settled admitted tools execute with remote names and arguments, while unlisted tools stay refused | error: 'Expected "actual" to be strictly unequal to: true' | expected: true | actual: true | operator: 'notStrictEqual'
- `apps/website/src/assistant/__tests__/credential-setup-search.test.ts` — tier 2, 1/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `t10 credential_save ranks top 3 for credential setup requests`: not ok 1 - t10 credential_save ranks top 3 for credential setup requests | error: |- | credential_save search misses: save a repository host source control credential: source_control_get_capabilities, site_backup_plan, source_control_execute_commit; set up repository backup credentials: site_backup_plan, site_backup_push, backup_get_capabilities | + actual - expected | + [
- `apps/website/src/assistant/__tests__/cross-site-read-catalog.test.ts` — tier 2, 1/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `complete production catalog classifies every reader and exercises every scoped read on B`: not ok 1 - complete production catalog classifies every reader and exercises every scoped read on B | error: |- | 66 cross-site tools, 82 EXCLUDED tools; unclassified/overlapping domains: visitor-tools: visitor_tools_list, visitor-tools: visitor_tool_save, visitor-tools: visitor_tool_delete, project-keys: project_keys_list, provider-status: provider_status | + actual - expected | + [
- `apps/website/src/assistant/__tests__/mcp-federation.call-confirmation.test.ts` — tier 1, 12/21 failed, exit 1 — **expected-by-fed-security** (failing tests whose error contains *_WRITE_NOT_ALLOWED: 11/12)
  - first failing: `G3 per-call grants: an allowlisted destructive tool is not refused; removed from the allowlist it is`: not ok 7 - G3 per-call grants: an allowlisted destructive tool is not refused; removed from the allowlist it is | error: |- | Expected values to be strictly equal: | + actual - expected | + 'remote-declares-not-read-only'
- `apps/website/src/assistant/__tests__/mcp-federation.extra-approval-checks.test.ts` — tier 1, 7/35 failed, exit 1 — **expected-by-fed-security** (failing tests whose error contains *_WRITE_NOT_ALLOWED: 7/7)
  - first failing: `G3 drift: an unchanged tool stays allowed — Always allow and Allow for this chat both keep skipping the card`: not ok 1 - G3 drift: an unchanged tool stays allowed — Always allow and Allow for this chat both keep skipping the card | error: `EXTERNAL_MCP_WRITE_NOT_ALLOWED: mcp__acme__assistant_set_instructions: the server says this tool makes changes, and it is not in this connection's "Allowed to make changes" list. Fix: in Settings → External MCP, add it to BOTH "Allowed tools" and "Allowed to make changes", then restart the
- `apps/website/src/assistant/__tests__/mcp-federation.remembered-approvals.test.ts` — tier 1, 27/30 failed, exit 1 — **expected-by-fed-security** (failing tests whose error contains *_WRITE_NOT_ALLOWED: 27/27)
  - first failing: `G3 remembered: a non-destructive card offers Allow / Allow for this chat / Always allow / Cancel`: not ok 1 - G3 remembered: a non-destructive card offers Allow / Allow for this chat / Always allow / Cancel | error: `EXTERNAL_MCP_WRITE_NOT_ALLOWED: mcp__supabase__assistant_set_instructions: the server says this tool makes changes, and it is not in this connection's "Allowed to make changes" list. Fix: in Settings → External MCP, add it to BOTH "Allowed tools" and "Allowed to make changes", then restart the assista
- `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` — tier 2, 1/9 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `every surfaceExchanges.open(...) call names a toolId constant this scan can resolve`: not ok 5 - every surfaceExchanges.open(...) call names a toolId constant this scan can resolve | error: |- | Expected values to be strictly deep-equal: | + actual - expected | + [
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.ask-choice.integration.test.ts` — tier 2, 1/1 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `real round trip: an mcp-ui submission of assistant_ask_choice's form is redeemed, not refused as unallowlisted`: not ok 1 - real round trip: an mcp-ui submission of assistant_ask_choice's form is redeemed, not refused as unallowlisted | error: |- | Expected values to be strictly deep-equal: | + actual - expected | {
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts` — tier 2, 1/4 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `deployment_execute_static_publish waits for one human approval over HTTP before publishing`: not ok 1 - deployment_execute_static_publish waits for one human approval over HTTP before publishing | error: |- | expected a real publish to have happened: {"published":false,"cancelled":false,"code":"CONSENT_REVIEW_REQUIRED","error":"Review cookie consent before publishing this site.","blockingProblems":[{"code":"PRIVACY_LINK_REQUIRED","field":"privacyPolicyUrl","message":"Link a published privacy page or a creden
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts` — tier 2, 1/20 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently`: not ok 18 - SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/assistant/__tests__/newsletter-delivery-search-discoverability.test.ts` — tier 2, 1/2 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `adding newsletter delivery does not worsen supported operator requests`: not ok 1 - adding newsletter delivery does not worsen supported operator requests | error: |- | Expected values to be strictly deep-equal: | + actual - expected | + [
- `apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts` — tier 2, 1/18 failed, exit 1 — **pre-existing (listed as KNOWN, brief (e)2)**
  - first failing: `installFirstPartyToolContributors installs exactly the converted domains — no more, no fewer`: not ok 5 - installFirstPartyToolContributors installs exactly the converted domains — no more, no fewer | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts` — tier 2, 2/4 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `projected search, approval and callback metadata exactly matches the reviewed baseline`: not ok 1 - projected search, approval and callback metadata exactly matches the reviewed baseline | error: |- | Expected values to be strictly deep-equal: | + actual - expected | {
- `apps/website/src/assistant/__tests__/tool-search-keywords.operator-requests.test.ts` — tier 2, 1/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `every operator request with a tool finds it in the top 3 of search_tools`: not ok 2 - every operator request with a tool finds it in the top 3 of search_tools | error: |- | Expected values to be strictly deep-equal: | + actual - expected | + [
- `apps/website/src/assistant/mcp-federation/__tests__/confirmation-policy.unit.test.ts` — tier 1, 21/33 failed, exit 1 — **expected-by-fed-security** (failing tests whose error contains *_WRITE_NOT_ALLOWED: 21/21)
  - first failing: `n06: create_project ordinary call needs no card`: not ok 1 - n06: create_project ordinary call needs no card | error: `EXTERNAL_MCP_WRITE_NOT_ALLOWED: mcp__service__create_project: the server says this tool makes changes, and it is not in this connection's "Allowed to make changes" list. Fix: in Settings → External MCP, add it to BOTH "Allowed tools" and "Allowed to make changes", then restart the assistant. Nothing was sent.` | assertAdmittedGrants (/home/user/Jini
- `apps/website/src/assistant/mcp-federation/__tests__/registrations.read-only.test.ts` — tier 1, 2/4 failed, exit 1 — **expected-by-fed-security** (failing tests whose error contains *_WRITE_NOT_ALLOWED: 2/2)
  - first failing: `a fresh roster admission drops readOnly when the remote contradicts the read list, and ordinary writes run without confirmation`: not ok 2 - a fresh roster admission drops readOnly when the remote contradicts the read list, and ordinary writes run without confirmation | error: `EXTERNAL_MCP_WRITE_NOT_ALLOWED: mcp__higgsfield__models_explore: the server says this tool makes changes, and it is not in this connection's "Allowed to make changes" list. Fix: in Settings → External MCP, add it to BOTH "Allowed tools" and "Allowed to make changes", the
- `apps/website/src/cli/__tests__/integration/export-command.integration.test.ts` — tier 2, 1/5 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `tovu export --base-path <path>: rewrites root-relative links and prints the disclosed-limit warning`: not ok 3 - tovu export --base-path <path>: rewrites root-relative links and prints the disclosed-limit warning | error: 'all root-relative href/src values must carry the requested base path' | expected: | actual: |- | <!doctype html>
- `apps/website/src/cli/__tests__/integration/init-storage.postgres.test.ts` — tier 2, 3/3 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `--storage-env: the site names the variable, keeps no secret, and its database is at head with the template`: not ok 1 - --storage-env: the site names the variable, keeps no secret, and its database is at head with the template | error: |- | failed to drop fixture database "tovu_r1f2_init_env": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixtur
- `apps/website/src/cli/__tests__/integration/introspect-command.integration.test.ts` — tier 2, 2/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI, not a hand-maintained doc`: not ok 1 - tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI, not a hand-maintained doc | error: |- | introspect must list the real registered commands (nested subcommands flattened to their full invocation path), and exclude itself/help | + actual - expected | [
- `apps/website/src/cli/__tests__/integration/storage-move.postgres.test.ts` — tier 1, 4/4 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `refuses a target other than postgres, and a --storage-env that is not set`: not ok 1 - refuses a target other than postgres, and a --storage-env that is not set | error: |- | failed to drop fixture database "tovu_storage_move_cli_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts:92:25)
- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-composio-package.unit.test.ts` — tier 2, 1/6 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the package packs through the real installer's packer, and carries no credential material`: not ok 3 - the package packs through the real installer's packer, and carries no credential material | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/features/deployments/deploy-ops/__tests__/run-ops-contract.test.ts` — tier 1, 2/8 failed, exit 1 — **pre-existing (listed as KNOWN, brief (e)5)**
  - first failing: `transport failures are named per method; a credential removed after binding is reported as changed`: not ok 3 - transport failures are named per method; a credential removed after binding is reported as changed | error: |- | The validation function is expected to return "true". Received false | Caught error: | ToolInputError: No saved custom credential labeled 'ops'. Choose another credentialLabel.
- `apps/website/src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts` — tier 1, 3/16 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `awaited unexpected publish failure settles the run with its error and permits the next run`: not ok 10 - awaited unexpected publish failure settles the run with its error and permits the next run | error: |- | Expected values to be strictly equal: | + actual - expected | + 'completed'
- `apps/website/src/features/forms/__tests__/repo.postgres.test.ts` — tier 2, 1/1 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError`: not ok 1 - postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError | error: |- | failed to drop fixture database "tovu_forms_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.
- `apps/website/src/features/post/__tests__/post.delete.test.ts` — tier 2, 1/41 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `deleting a PUBLISHED row emits entry.unpublished (SEO's sitemap-cache invalidation signal)`: not ok 7 - deleting a PUBLISHED row emits entry.unpublished (SEO's sitemap-cache invalidation signal) | error: |- | Expected values to be strictly deep-equal: | + actual - expected | {
- `apps/website/src/features/post/__tests__/post.schedule-events.test.ts` — tier 2, 10/18 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `createPost scheduled for later emits nothing; the sweep announces it exactly once at go-live`: not ok 1 - createPost scheduled for later emits nothing; the sweep announces it exactly once at go-live | error: |- | nothing before go-live | + actual - expected | + [
- `apps/website/src/features/post/__tests__/post.transition-events.test.ts` — tier 2, 5/5 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `updatePost transition table: not-published -> published emits exactly one entry.published event`: not ok 1 - updatePost transition table: not-published -> published emits exactly one entry.published event | error: |- | Expected values to be strictly equal: | 2 !== 1 | expected: 1
- `apps/website/src/features/post/__tests__/repo.postgres.test.ts` — tier 2, 1/1 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `two connections: a concurrent appendRevision waits for the open one and chains after it`: not ok 1 - two connections: a concurrent appendRevision waits for the open one and chains after it | error: |- | failed to drop fixture database "tovu_post_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts:92:25)
- `apps/website/src/features/post/__tests__/retire-post.test.ts` — tier 2, 1/8 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `retiring a published holder records revisions and emits only its public transition`: not ok 6 - retiring a published holder records revisions and emits only its public transition | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/features/site-backup/__tests__/import-private-rows.integration.test.ts` — tier 2, 1/2 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `B successfully strips hostile schema-valid accounts, sessions and secrets before and after owner setup`: not ok 1 - B successfully strips hostile schema-valid accounts, sessions and secrets before and after owner setup | error: |- | Expected values to be strictly equal: | false !== true | expected: true
- `apps/website/src/features/site-backup/__tests__/import-restore.unit.test.ts` — tier 1, 1/31 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `custom code that lands switched off gets one warning per unit; trusted, live and edited code do not`: not ok 4 - custom code that lands switched off gets one warning per unit; trusted, live and edited code do not | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/features/site-backup/__tests__/share-backend.unit.test.ts` — tier 1, 1/1 failed, exit 124 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `a create without a wait budget waits for a quick export and returns the ZIP-only share`: not ok 1 - a create without a wait budget waits for a quick export and returns the ZIP-only share | error: 'Invalid v2 share manifest, inventory or schema identity.' | invalid (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:31:35) | validateFiles (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:74:81) | validateManifest (/home/user/Tovu/apps/website/src/features/si
- `apps/website/src/features/site-backup/__tests__/share-delivery.integration.test.ts` — tier 1, 1/6 failed, exit 1 — **pre-existing (listed as KNOWN, brief (e)1)**
  - first failing: `no delivery returns a private ZIP download and a clear link-setup message`: not ok 5 - no delivery returns a private ZIP download and a clear link-setup message | error: 'Invalid v2 share manifest, inventory or schema identity.' | invalid (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:31:35) | validateFiles (/home/user/Tovu/apps/website/src/features/site-backup/archive-manifest.ts:74:81) | validateManifest (/home/user/Tovu/apps/website/src/features/site-backup/arc
- `apps/website/src/features/site-backup/__tests__/share-file-policy.unit.test.ts` — tier 1, 2/146 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `'plugins/a/data' is ordinary content and is kept`: not ok 16 - 'plugins/a/data' is ordinary content and is kept | error: |- | Expected values to be strictly equal: | true !== false | expected: false
- `apps/website/src/features/site-backup/__tests__/share-refusals.integration.test.ts` — tier 1, 1/38 failed, exit 124 — **pre-existing (listed as KNOWN, brief (e)1)**
  - first failing: `export leaves the source's publish history destinations untouched and never carries them`: not ok 8 - export leaves the source's publish history destinations untouched and never carries them | error: |- | Expected values to be strictly equal: | false !== true | expected: true
- `apps/website/src/features/site-backup/__tests__/share-round-trip.integration.test.ts` — tier 1, 3/7 failed, exit 1 — **pre-existing (listed as KNOWN, brief (e)1)**
  - first failing: `A production preparation → public download → B import preserves content: inSite`: not ok 3 - A production preparation → public download → B import preserves content: inSite | error: |- | A exports every required package byte | + actual - expected | + Map(0) {}
- `apps/website/src/features/site-backup/__tests__/share-service.unit.test.ts` — tier 1, 1/34 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `an artifact the registry cannot write is removed and the write error is rethrown`: not ok 6 - an artifact the registry cannot write is removed and the write error is rethrown | error: |- | Expected values to be strictly deep-equal: | + actual - expected | Comparison {
- `apps/website/src/features/site-backup/__tests__/sources.unit.test.ts` — tier 1, 1/60 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `share collection omits only private runtime files and includes overrides and plugin source`: not ok 52 - share collection omits only private runtime files and includes overrides and plugin source | error: |- | Expected values to be strictly equal: | true !== false | expected: false
- `apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.postgres.test.ts` — tier 1, 6/6 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db`: not ok 1 - bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db | error: |- | failed to drop fixture database "tovu_r1f_boot_site_dir": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts
- `apps/website/src/platform/site-dir/__tests__/integration/init-site.postgres.test.ts` — tier 2, 2/2 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `a Postgres database holding one foreign table is refused by name, before any folder is made`: not ok 1 - a Postgres database holding one foreign table is refused by name, before any folder is made | error: |- | failed to drop fixture database "tovu_init_site_occupied": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts:92:25
- `apps/website/src/platform/site-dir/__tests__/unit/resolve-workspace.postgres.test.ts` — tier 2, 1/1 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `resolves the one workspace row and rejects an unknown explicit id`: not ok 1 - resolves the one workspace row and rejects an unknown explicit id | error: |- | failed to drop fixture database "tovu_resolve_workspace_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts:92:25)
- `apps/website/src/platform/site-dir/__tests__/unit/site-key-dependent-data.postgres.test.ts` — tier 2, 2/3 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `findSiteKeyDependentData: Postgres (env) site — a clean database is no data; a sealed row is data`: not ok 1 - findSiteKeyDependentData: Postgres (env) site — a clean database is no data; a sealed row is data | error: |- | failed to drop fixture database "tovu_site_key_dependent_data_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-
- `apps/website/src/server/__tests__/routes/export-site-route.test.ts` — tier 2, 1/10 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `export-site: trigger starts a real run (202), honors a real 'basePath', a concurrent second trigger gets 409, and the poll settles to an hon`: not ok 9 - export-site: trigger starts a real run (202), honors a real 'basePath', a concurrent second trigger gets 409, and the poll settles to an honest completed report | error: |- | The input was expected to not match the regular expression /href="\/(?!preview\/)/. Input: | '<!doctype html>\n' + | '<html lang="en" data-theme="dark">\n' +
- `apps/website/src/server/__tests__/routes/members-public-complete-sign-in.test.ts` — tier 1, 2/12 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `req.params.workspaceId ?? "": an unpopulated param (impossible via real Express routing) still 404s rather than throwing`: not ok 10 - req.params.workspaceId ?? "": an unpopulated param (impossible via real Express routing) still 404s rather than throwing | error: 'response.once is not a function' | observeMemberSignInFailure (/home/user/Tovu/apps/website/src/server/inbound/public-http/routes/members/analytics.ts:26:12) | <anonymous> (/home/user/Tovu/apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts:79:5) | T
- `apps/website/src/server/__tests__/routes/members-public-sign-in.test.ts` — tier 1, 2/18 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `req.params.workspaceId ?? "": an unpopulated param (impossible via real Express routing) still 404s rather than throwing`: not ok 11 - req.params.workspaceId ?? "": an unpopulated param (impossible via real Express routing) still 404s rather than throwing | error: 'response.once is not a function' | observeMemberSignInFailure (/home/user/Tovu/apps/website/src/server/inbound/public-http/routes/members/analytics.ts:26:12) | <anonymous> (/home/user/Tovu/apps/website/src/server/inbound/public-http/routes/members/sign-in.ts:33:5) | TestContex
- `apps/website/src/server/__tests__/routes/publish-site-route.test.ts` — tier 1, 7/33 failed, exit 1 — **pre-existing (listed as KNOWN, brief (e)3)**
  - first failing: `publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CRED`: not ok 6 - publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CREDENTIALS_CONFIGURED result, never touching a real GitHub/Vercel API | error: |- | Expected values to be strictly equal: | 409 !== 202 | expected: 202
- `apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts` — tier 2, 1/6 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the address to confirm comes from the deploy config the repo already carries`: not ok 1 - the address to confirm comes from the deploy config the repo already carries | error: |- | Expected values to be strictly equal: | + actual - expected | + null
- `apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts` — tier 2, 2/6 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `index.ts main(): a refusing schema guard stops a disk boot before site-key preparation or store opening`: not ok 2 - index.ts main(): a refusing schema guard stops a disk boot before site-key preparation or store opening | error: |- | The validation function is expected to return "true". Received false | Caught error: | ReferenceError: processBuildRelease is not defined
- `apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site.tw4.pins.test.ts` — tier 2, 1/1 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `publish trigger preserves shape errors, validation order, and domain confirmation before consent`: not ok 1 - publish trigger preserves shape errors, validation order, and domain confirmation before consent | error: |- | Expected values to be strictly equal: | 500 !== 400 | expected: 400
- `apps/website/src/server/inbound/admin-http/routes/system/site-shares.integration.test.ts` — tier 1, 1/1 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `all six share routes require authentication, site-backup.push and the correct workspace`: not ok 1 - all six share routes require authentication, site-backup.push and the correct workspace | error: |- | Expected values to be strictly equal: | 400 !== 201 | expected: 201
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-kind-filter.unit.test.ts` — tier 2, 2/5 failed, exit 1 — **unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE**
  - first failing: `the production resolver delivers a real PDF and image to the daemon executor`: not ok 1 - the production resolver delivers a real PDF and image to the daemon executor | error: 'runLifecycle.stream is not a function' | eval (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:2845), <anonymous>:64:27) | captureDaemonRun (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.event-log-bound-wiring.unit.test.ts` — tier 2, 1/2 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `agent-daemon-server.ts creates its run lifecycle with dropEventsOnEviction`: not ok 1 - agent-daemon-server.ts creates its run lifecycle with dropEventsOnEviction | error: "the daemon's lifecycle must drop a run's events when it evicts the run" | expected: true | actual: false | operator: '=='
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.federation-runtime-wiring.unit.test.ts` — tier 2, 1/11 failed, exit 1 — **unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE**
  - first failing: `onStarted reads the federation refusal prefix afresh for each run`: not ok 2 - onStarted reads the federation refusal prefix afresh for each run | error: 'runLifecycle.stream is not a function' | eval (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:2845), <anonymous>:64:27) | captureDaemonRun (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:127:5) | Te
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.page-context-wiring.unit.test.ts` — tier 2, 1/2 failed, exit 1 — **unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE**
  - first failing: `onStarted forwards page context and the operator's words to the executor`: not ok 2 - onStarted forwards page context and the operator's words to the executor | error: 'runLifecycle.stream is not a function' | eval (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:2845), <anonymous>:64:27) | captureDaemonRun (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:127:
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.run-start-branches.unit.test.ts` — tier 2, 6/35 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `a run outside any conversation never reads or writes a session`: not ok 7 - a run outside any conversation never reads or writes a session | error: 'runLifecycle.stream is not a function' | eval (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:2845), <anonymous>:64:27) | captureDaemonRun (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:127:5) | TestC
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts` — tier 2, 6/16 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `runtime: cold and resumed CLI cwd defaults to the site directory`: not ok 1 - runtime: cold and resumed CLI cwd defaults to the site directory | error: "Cannot read properties of undefined (reading 'capture')" | onStarted (evalmachine.<anonymous>:61:27) | Object.start (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.session-binding-wiring.unit.test.ts:103:14) | TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/inbound/assistant/
- `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts` — tier 2, 7/13 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `agentExecutor.run() receives hook settings when the guard exists`: not ok 2 - agentExecutor.run() receives hook settings when the guard exists | error: 'runLifecycle.stream is not a function' | eval (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:2845), <anonymous>:64:27) | captureDaemonRun (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:127:5) | Tes
- `apps/website/src/server/inbound/assistant/__tests__/message-attachment-delivery.unit.test.ts` — tier 2, 2/2 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `the daemon exchanges both current-message refs for exact pixels and native CLI image paths`: not ok 1 - the daemon exchanges both current-message refs for exact pixels and native CLI image paths | error: 'the attachments should be accepted' | operator: 'fail' | failRunBeforeStart (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/message-attachment-delivery.unit.test.ts:26:40) | resolveAttachmentRunFields (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbo
- `apps/website/src/server/inbound/assistant/__tests__/native-fallback-wiring.unit.test.ts` — tier 2, 1/7 failed, exit 1 — **unsure — not rechecked at BASE (cap 15); same error text as agent-daemon-server.tool-restriction-wiring.unit.test.ts, which fails at BASE**
  - first failing: `non-owner and hosted owner launches explicitly lock native tools`: not ok 3 - non-owner and hosted owner launches explicitly lock native tools | error: 'runLifecycle.stream is not a function' | eval (eval at evaluateDaemonExpression (file:///home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:1:2845), <anonymous>:64:27) | captureDaemonRun (/home/user/Tovu/apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts:127:5) | Tes
- `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-page-preview.test.ts` — tier 2, 4/9 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `static page route: a real page renders with Cache-Control: no-store, no session needed`: not ok 1 - static page route: a real page renders with Cache-Control: no-store, no session needed | error: |- | Expected values to be strictly equal: | + actual - expected | + 'private, no-store'
- `apps/website/src/server/runtime/composition/__tests__/commerce-data-retention.integration.test.ts` — tier 1, 1/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `commerce off: plugin storage survives; populated core refuses boot without changes`: not ok 3 - commerce off: plugin storage survives; populated core refuses boot without changes | error: 'table members has no column named password_hash' | Database.prepare (/home/user/Tovu/node_modules/better-sqlite3/lib/methods/wrappers.js:5:21) | BetterSQLiteSession.prepareQuery (/home/user/Tovu/node_modules/src/better-sqlite3/session.ts:60:28) | BetterSQLiteSession.prepareOneTimeQuery (/home/user/Tovu/node_modules
- `apps/website/src/server/runtime/composition/__tests__/create-site-route-deps.postgres.test.ts` — tier 1, 2/2 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `Postgres composition boot sequence preserves data across env, sealed-secret and wrong-key boots`: not ok 1 - Postgres composition boot sequence preserves data across env, sealed-secret and wrong-key boots | error: |- | failed to drop fixture database "tovu_r1f_create_site_route_deps": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixt
- `apps/website/src/server/runtime/composition/__tests__/form-delivery-purge.integration.test.ts` — tier 2, 3/3 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `purging a submission blanks its frozen answers and fails its unfinished job, which never delivers`: not ok 1 - purging a submission blanks its frozen answers and fails its unfinished job, which never delivers | error: |- | the pulled submission was planned exactly once | 0 !== 1 | expected: 1
- `apps/website/src/server/runtime/composition/__tests__/form-delivery-vertical-slice.integration.test.ts` — tier 2, 9/11 failed, exit 124 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `a submission pulled from the receiver is planned once, with one frozen job per matching binding`: not ok 1 - a submission pulled from the receiver is planned once, with one frozen job per matching binding | error: |- | Expected values to be strictly deep-equal: | + actual - expected | + []
- `apps/website/src/server/runtime/composition/__tests__/move-site-storage.postgres.test.ts` — tier 2, 6/6 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `a running site is refused; nothing changes`: not ok 1 - a running site is refused; nothing changes | error: |- | failed to drop fixture database "tovu_move_site_test": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts:92:25)
- `apps/website/src/server/runtime/composition/__tests__/open-site-store.postgres.test.ts` — tier 2, 2/2 failed, exit 1 — **ENV (no Postgres server)**
  - first failing: `a failed preparation closes the pool: no session on the site's database survives the rejection`: not ok 1 - a failed preparation closes the pool: no session on the site's database survives the rejection | error: |- | failed to drop fixture database "tovu_open_site_store_failure": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory | Is the server running locally and accepting connections on that socket? | recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.
- `apps/website/src/server/runtime/composition/__tests__/plugin-host.integration.test.ts` — tier 2, 1/20 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `plugin list/toggle/uninstall dispatch to injected host capabilities and retain authorization`: not ok 7 - plugin list/toggle/uninstall dispatch to injected host capabilities and retain authorization | error: |- | Expected values to be strictly deep-equal: | + actual - expected | [
- `apps/website/src/server/runtime/composition/__tests__/site-key-recovery.unit.test.ts` — tier 2, 2/12 failed, exit 1 — **pre-existing (fails at BASE: ALL apply)**
  - first failing: `plugin-state recovery validates annotations before rotation: "invalid-meta"`: not ok 1 - plugin-state recovery validates annotations before rotation: "invalid-meta" | error: |- | Expected values to be strictly deep-equal: | + actual - expected | {
- `apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts` — tier 1, 1/6 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers`: not ok 3 - createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers | error: |- | sanity: forms notify and webhook fan-out each subscribe once | 3 !== 2 | expected: 2
- `apps/website/src/server/runtime/lifecycle/__tests__/daemon-supervisor.test.ts` — tier 2, 1/23 failed, exit 1 — **unsure — not rechecked at BASE (cap 15 files)**
  - first failing: `production daemon wiring redacts stdout and native fatal stderr before forwarding`: not ok 22 - production daemon wiring redacts stdout and native fatal stderr before forwarding | error: |- | Expected values to be strictly equal: | 0 !== 2 | expected: 2

## 7. Minor findings (listed, not acted on)

- Brief setup said clone Jini to `/root/Jini`; this environment already had `/home/user/Jini` on `cloud/green-1027`, so `/root/Jini` is a symlink to it (needed for `file:/root/Jini/...` links, `mutate.mjs` JINI_ROOT, and `link:jini`). The symlinked dir is named `Jini`.
- `npm ci`/`npm install` at the Tovu root needed the cookie-consent `file:` workaround (404 for `@jini-ai/cookie-consent@^0.6.12`); `package.json`/lock restored via `git checkout --`. `npm warn install-scripts` for better-sqlite3 / esbuild (scripts unapproved) — better-sqlite3 and argon2 still loaded fine, no rebuild was needed.
- `@tovu/sdk` first build FAILED before `link:jini` (`src/index.ts(164,76) TS2694: '@jini-ai/plugins/dist/host' has no exported member 'PluginProviderContribution'`), succeeded after `link:jini` (path taken: link → build → link). Desktop `build:preload` runs tsc with errors (13, `preload.mts` vs `contracts/owner-store.ts`) but emits `dist/preload`; the 13 `@jini-ai/*` packages under `apps/desktop/node_modules` were real dirs and were replaced by symlinks to `/root/Jini/packages/<pkg>` (env fix only).
- `pnpm -r build`: `@jini-ai/memory` still fails tsc (`note-store.test.ts(134,42) TS2345`) even though lot jini-small claims to fix it (last night's code was TS2352 — a different error at the same test file); `@jini-ai/mcp` fails tsc on `fed-presets.unit.test.ts(45,50)` (`presetRegistry` not in `AttachFederatedMcpToolsRequiredArgs`) so `chmod +x dist/bin/serve.js` did not run (dist was still emitted); `fed-security.cross` rebuilds of mcp therefore exit 2 both under mutation and after restore. `@jini-ai/cookie-consent` now builds (4599 B gz).
- Tests leave untracked files in the Tovu root: `chat.db` and `sites/tovu-dev/consent-receipts/` (not committed; not removed).
- Slowest sweep items: share-backend.unit.test.ts (300 s timeout, `Invalid v2 share manifest, inventory or schema identity`), share-refusals.integration (300 s timeout in sweep; 71 s alone with one 60 s test-timeout), form-delivery-vertical-slice.integration (300 s timeout, 9 of 11 tests fail before), cli serve-command.integration (300 s timeout), adopt-command.integration (289 s), `@jini-ai/db` full suite 137 s, export-command.integration 103 s, daemon full 91 s, serve-command-boot-lifecycle 87 s.
- The sweep's exit-124 (timeout) files are `share-backend.unit`, `share-refusals.integration`, `form-delivery-vertical-slice.integration`, `serve-command.integration`; their parsed tests undercount (killed mid-run).
- Pre-existing-failing files that surfaced only in the sweep and look like one drift each: `runLifecycle.stream is not a function` (6 agent-daemon-server/native-fallback wiring tests), `response.once is not a function` (members-public-sign-in / complete-sign-in), `ResourceSiteFigure is not defined` (desktop site-card-menu-wiring, site-port.rules), `Invalid v2 share manifest, inventory or schema identity` (share-backend, share-delivery, library-share).
- Jini full suites: server `create-local-node-daemon.test.ts` (2 tests: `JINI_BIND_HOST` env reflection `expected undefined to be '127.0.0.1'`, and L039a `expected { JINI_BIND_HOST: '127.0.0.1' } to be {}`), db `import-isolation.test.ts` (1), daemon `usage-cost-basis.test.ts` (6, extra field in usage event) and `runtime-policy.test.ts` "still runs codex with personal MCP OFF" (`AgentExecutor: disabling personal Codex configuration requires run-scoped home staging.` at `launch.ts:1029`) — all four files also fail with the six Jini lot mutations reverted (runtime-policy fails 4 tests at BASE vs 1 now: lot gemini-chat improves it but does not fully fix it). mcp, memory, cookie-consent, agent-runtime full suites pass (1414 / 332 / 142 / 4231 tests).
- `mutate.mjs ALL apply` only reverts Tovu lot sources, so Jini sweep failures were rechecked with the six Jini lot mutations instead.
- Sonnet driver note: brief says exact `--test-timeout`/`--test-reporter=spec` only for step (e)1; elsewhere the TAP reporter was used so per-test names could be parsed; each lot/sweep file ran in its own process with `timeout 300` (brief default 600; lowered to bound hanging files), Jini package suites `timeout 900`.

## 8. Not tested

- **Mac/Chrome later:** lot `ui-two` (CSS-only layout fixes, no tests; proof is the Opus+Chrome look); the UI parts of gem-ch.D T3 and shared-keys `SharedKeys.tsx` (no browser/display here; only their jsdom/node tests ran).
- **Not done / cut:** the `--extra` check of `export-leftovers` was run only on its own two files — the "export-followups' share-registry adoption tests also RED" half of its expect was NOT run (time). The sweep was run in full (nothing cut) but 4 files hit the 300 s timeout (partial counts). 44 sweep failures were not rechecked at BASE (cap of 15 files + 4 Jini files) and are `unsure`.
- **ENV-blocked:** 11 Postgres-dependent files (`*.postgres.test.ts`, `psql` socket errors; no Postgres server), no browser/display/IPv6.
- `mutate.mjs` rebuild step for `fed-security.cross` exited 2 (mcp tsc errors, see section 7); mcp dist is still emitted, so the cross-repo mutation did take effect for Tovu tests that read dist, but this is unverified beyond the observed RED results.
