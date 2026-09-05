# Gemini Adversarial Audit (RAW, UNVERIFIED) — features/ + platform/, chunks 13-20

Generation-only pass. This file contains RAW Gemini 3.8 Flash claims, **none verified**.
A separate Claude Opus 5 verifier agent is responsible for confirming/discarding every
entry below against actual source. Nothing in this file should be treated as a confirmed
finding until that verification pass records it as such (in the companion verified report,
`2026-09-05-gemini-audit-features-platform.md`).

Auditor model: `gemini-3.8-flash-high` via `agy --print --model gemini-3.8-flash-high
--effort high --print-timeout 15m`, print mode, diff (and where noted, full file content)
pasted as text on stdin — no repo tool access given to Gemini.

## Scope enumeration (done fresh from source, not trusted from the dispatch brief)

The dispatch brief's premise — "cover whatever chunks 1-12 of the primary verified report
did not reach" — is **stale**. Read `2026-09-05-gemini-audit-features-platform.md` directly
(not a summary of it) and cross-referenced every one of its per-chunk commit lists against
the actual `git log --since="2026-09-03 00:00" --until="2026-09-05 00:00" -- apps/website/src/features
apps/website/src/platform` output (99 commits, confirmed matching the primary report's own
stated count).

Result: **chunks 1 through 16a of the primary report already account for 92 of the 99
commits** (every commit list from chunk 1 through chunk 16a was checked row-by-row against
the full git log and each one matches exactly, no gaps, no overlaps). Only **chunk 16b**
(7 commits, all 2026-09-04 17:11-17:35, all coverage-padding `test(...)` commits, marked
"(running)" / no findings yet recorded in the primary report) remains uncovered by anyone.

So the real remaining scope for this dispatch is exactly those 7 commits. This RAW file
covers them as **chunks 13-19** (one commit per chunk, per the "chunk by coherent unit"
rule — each of these 7 commits is a single self-contained test-file addition, so one commit
IS one coherent unit here). There is no chunk 20; scope is exhausted at 19.

Remaining-scope commits (all test-only, no production-code diff, in
`apps/website/src/features/**` / `apps/website/src/platform/**`):

- [x] 13. `1378c7e4` — test(theme): direct-invoke coverage for structure.ts fs-bounds/containment branches
- [x] 14. `239a90a5` — test(deployments): S3-compatible publish target coverage
- [x] 15. `54c65bc6` — test(source-control): store.ts branch-coverage fill
- [x] 16. `383befbc` — test(deployments): credential-verification (static-publish/verify.ts) coverage
- [x] 17. `4b35a008` — test(source-control): github-git-provider.ts branch-coverage fill
- [ ] 18. `991217ab` — test(theme): handlebars-allowlist.test.ts fixture fix + 2 branches
- [ ] 19. `438ada6a` — test(export): direct unit proof for redirectOutcomeFor's >=400 arm

## Findings

### Chunk 13 — `1378c7e4` test(theme): direct-invoke coverage for structure.ts fs-bounds/containment branches

**Context given to Gemini:** diff (`structure.test.ts` new hunk) + FULL current production file
`apps/website/src/features/theme/validation/structure.ts` (282 lines) + FULL current test file
`apps/website/src/features/theme/validation/__tests__/structure.test.ts` (256 lines, post-commit).
Full-file context, not diff-only.

Note before the raw claims: the commit message for `1378c7e4` itself already discloses two of
these as known pinning tests recording "surprising current behavior... without endorsing it"
(the broken-symlink-escapes-forbidden-check case, and a FIFO/non-regular-entry being silently
dropped) — the verifier should weigh Gemini's findings 2/3 below against that self-disclosure
before treating them as new discoveries rather than restating an already-flagged trade-off.

**UNVERIFIED — HIGH.** `structure.ts:145,158-161` / `structure.test.ts:90-109`. Claim: once
`truncated` is set true inside one subdirectory's `walk()`, every sibling/ancestor directory
entry still re-enters the `files.length >= MAX_PACKAGE_FILES` branch (line 158) and pushes
*another* `structure-max-files` issue — the line-145 `if (truncated) return;` guard the test's
own comment says "must fire" is claimed to be unreachable dead code, since line 158's own early
`return` fires first for every sibling. The test only asserts `result.issues.find(...)` (existence),
not `result.issues.length === 1`, so it's claimed to pass regardless of duplicate-issue emission.

**UNVERIFIED — HIGH.** `structure.ts:108`. Claim: `visitPackageEntry` calls
`statSync(full, { throwIfNoEntry: false })`, which follows symlinks and only suppresses `ENOENT`
— a circular symlink (`ELOOP`) is claimed to throw uncaught out of `walkThemePackage`, violating
the function's own documented contract ("Never throws on a bad theme... reported as an issue,
not an exception"). Claimed fix: `lstatSync` instead of `statSync`.

**UNVERIFIED — HIGH.** `structure.ts:108-116` / `structure.test.ts:47-61`. Claim: because
`statSync` (not `lstatSync`) is used, a symlink whose target does not exist returns `undefined`
at line 109 before the `isLink`/forbidden-symlink check at line 111 ever runs — so a *broken*
symlink is silently dropped rather than flagged by `structure-symlink-forbidden`. Gemini
disputes the pinning test's own "blast radius: low" rationale, on the theory that theme
validation runs against a temp/sandbox extraction where a symlink's target genuinely may not
exist yet, but the same symlink could resolve to a real, sensitive path once the package is
later extracted into the real deployment environment — i.e. claims the "broken" state is an
artifact of validation-time environment, not a property of the symlink itself.

**UNVERIFIED — MEDIUM.** `structure.ts:227-230,264` / `structure.test.ts:216-234`. Claim: the
non-global regex `sourceDir.replace(/^\.\/+/, "")` only strips one leading `./`, so an input like
`"././."` normalizes to `"./."` (not `""`/`"."`), bypassing the `structure-sourcedir-root`
root-conflict check. Also claims a bare empty-string `sourceDir: ""` short-circuits via
`!build.sourceDir` at line 264 before `normalizeSourceDirOrIssue` ever runs.

**UNVERIFIED — MEDIUM.** `structure.test.ts:243-256` (new in this commit) / `structure.ts:260-262,277`.
Claim: the new test passes `schemaVersion: 1` against a parameter typed as the literal `2`,
which fails to compile without a cast; claims the actual current test file uses
`schemaVersion: 1 as unknown as 2` to force it through, to exercise a branch Gemini calls
tautologically unreachable for any real (type-checked) caller — i.e. a coverage-padding test
that required defeating the type system to write.

**UNVERIFIED — LOW.** `structure.ts:222,237`. Claim: root-containment checks assume POSIX
separators (`sourceDir.startsWith("/")`, `normalized.split("/")[0]`) with no handling for a
Windows-style backslash-separated or drive-qualified path, so a value like `"css\\sub"` would
not be recognized as conflicting with a reserved root named `"css"`.

Gemini raised 6 findings total in this chunk (all captured above), 0 dropped as pure-style
(all included a stated failure scenario).

### Chunk 14 — `239a90a5` test(deployments): S3-compatible publish target coverage

**Context given to Gemini:** diff (`s3-compatible-target.unit.test.ts` new hunk, 464 new lines) +
FULL current production file `apps/website/src/features/deployments/static-publish/s3-compatible-target.ts`
(848 lines) + FULL current test file (1138 lines, post-commit). Full-file context.

Note: Gemini was given the CURRENT (HEAD) production file, not the file as it stood at commit
time — its finding 3.1 below claims the author's own "not exported" statement is presently false;
the verifier needs `git show 239a90a5:...s3-compatible-target.ts` (the version at commit time) to
know whether that export was added by this commit, a later one, or Gemini is simply reading the
present state and comparing it to a commit-message claim about the past — this is exactly the
"diff-only reasons about code it never saw" trap in reverse (reasoning about now vs. then), so
treat 3.1 with extra skepticism.

**UNVERIFIED — HIGH (production bug, not test quality).** `s3-compatible-target.ts:798-819`.
Claim: on `attempted.outcome === "unsupported"`, the code sets `concurrencyGuardActive = false`
and `continue`s — and the `attempt >= MAX_MANIFEST_WRITE_ATTEMPTS` ceiling check sits *after* that
`continue`, so it's claimed to never run for repeated `"unsupported"` outcomes. Claimed scenario:
a provider/gateway that returns `501`/`400 UnsupportedOperation` on the UNconditional retry too
(not just the initial conditional write) would loop `publish()` forever, since each iteration
re-hits the same unsupported-outcome branch before ever reaching the ceiling check.

**UNVERIFIED — MEDIUM (production bug).** `s3-compatible-target.ts:509`. Claim:
`classifyManifestWrite400`'s regex `/notimplemented|not implemented|unsupportedoperation/i` covers
a spaced and unspaced form of "not implemented" but only the unspaced `unsupportedoperation` for
the other phrase — a response body saying "Unsupported operation" (with a space, e.g. inside an
XML `<Message>`) would fail the match and throw a hard `DeployError` instead of degrading to an
unconditional write the way a `501` does.

**UNVERIFIED — MEDIUM (test quality).** `s3-compatible-target.unit.test.ts:934-953`, test
`"...only the FIRST recorded failure propagates (never overwritten by a second)"`. Claim: the
assertion `assert.match(err.message, /a\.html|b\.html/)` matches either file, so a "last error
wins" implementation (the opposite of the claimed property) would also satisfy it — the test is
claimed not to actually pin first-vs-last-error-wins.

**UNVERIFIED — HIGH (test quality).** `s3-compatible-target.unit.test.ts:822-840`, test
`"a v2 manifest entry with a blank etag is normalized to 'no recorded provenance'..."`. Claim: the
test never inspects `result`/`result.statusMessage`, and the mock's fallback `HEAD` response
returns 200 with no ETag header regardless — so if blank-etag normalization were completely
broken (never converting `""` to `undefined`), the code would fall into a different branch
(`fetchLiveETag` → `undefined` → `"skip"`) that happens to produce the SAME externally observable
result the test checks (`bucket.has(...) === true`), letting a broken normalization pass.

**UNVERIFIED — LOW (test quality).** `s3-compatible-target.unit.test.ts:742-769`, test
`"...skipped, not deleted (unverifiable, not diverged)"`. Claim: only asserts `status === "ready"`
and the key still existing in the bucket, never asserting `statusMessage` does NOT mention the
key — so the "not diverged" half of the test's own title is claimed to be unasserted; a bug that
misclassified this case as `"diverged"` instead of `"skip"` would still pass.

**UNVERIFIED — MEDIUM (test-infra, not correctness).** `s3-compatible-target.unit.test.ts` lines
675-691, 934-953, 998-1021, 1047-1066. Claim: tests returning 5xx/503 responses (which `aws4fetch`
retries with real exponential-backoff `setTimeout` per the file's own documented behavior) omitted
the `globalThis.setTimeout` stub that a sibling 400-response test (line ~998) DOES use — claimed to
cause real multi-second delays / potential runner timeouts on those specific tests.

**UNVERIFIED — LOW (test quality).** `s3-compatible-target.unit.test.ts:998-1021`, test
`"...degrades to an unconditional write, just like a 501"`. Claim: unlike the sibling 501 test
(which asserts the retried PUT's `if-none-match` header is cleared and checks `statusMessage`),
this test only asserts `status === "ready"` and `manifestPuts.length >= 2` — claimed insufficient
to catch a broken implementation that still retried conditionally or never flipped
`concurrencyGuardActive`.

**UNVERIFIED — disputes an author claim.** `s3-compatible-target.ts:598` (current HEAD). The
commit message for a *later* commit in this batch (239a90a5's own message) claims
`toDeployLinkStatus` "is not exported, so there is no seam to direct-invoke-test it" — Gemini
claims this is presently false: the function IS exported at the current HEAD, and a direct-invoke
test for exactly the `"protected"` arm already exists in the current test file (cites
`s3-compatible-target.unit.test.ts` around line 227-230, asserting `toDeployLinkStatus({reachable:
false, status: "protected"}) === "protected"`). Flagged above as needing the verifier to check
commit-time state vs. current HEAD, since some later commit in this window may have added the
export/test independently of this one.

**Confirmed-by-Gemini-as-valid (not a finding, a check on the author's own claim).** Gemini
independently agreed the author's second "unreachable branch" claim (the inline `"Not yet
reachable."` string literal in `publish()`) holds, given `reachability.ts`'s documented contract
that a `reachable: false` result always carries a non-empty `statusMessage`.

Gemini raised 7 findings + 1 claim-audit item in this chunk; none discarded, all recorded above
as UNVERIFIED per this pass's role.

### Chunk 15 — `54c65bc6` test(source-control): store.ts branch-coverage fill

**Context given to Gemini:** diff (`store.unit.test.ts` new hunk, 228 new lines) + FULL current
production file `apps/website/src/features/source-control/store.ts` (472 lines) + FULL current
test file (562 lines, post-commit). Full-file context.

**UNVERIFIED — HIGH.** `store.ts:244-248` (`isUniqueLabelViolation`) /
`store.unit.test.ts:461-475`. Claim: the commit message says it added a direct pure-function test
for all 4 combinations of `isUniqueLabelViolation` including "message-based match," but claims
only 3 were actually added (non-Error, code-based match, neither) — the message-based-match case
(`err.message.includes("UNIQUE constraint failed")` being true with no `.code` set) is claimed to
be untested anywhere in the repo, including integration tests, since
`InMemorySourceControlCredentialSetRepo` always sets `.code`. Claims the commit's own "1 branch
of 88 remains unhit, consistent with tsx BRDA instability" explanation is wrong — the unhit branch
is claimed to be exactly this missing message-based-match test case, not an instrumentation
artifact.

**UNVERIFIED — HIGH (production bug).** `store.ts:106-119` (`probeAccountLabel`) /
`store.unit.test.ts:80-85`. Claim: the GitHub REST call omits a `User-Agent` header, which GitHub's
API is claimed to require (403 without it) — so in production (real `fetch`, no `User-Agent`
default) this probe would always fail closed (`!resp.ok` → `null`), meaning `accountLabel` is
claimed to never populate for any real GitHub token; the test's own fetch mock doesn't inspect
headers, so this is claimed to be masked entirely in the suite.

**UNVERIFIED — HIGH (production bug, invariant violation).** `store.ts:367-380`
(`updateSourceControlCredential`). Claim: when an update changes `connection` to a NEW provider
(explicitly documented as supported) while omitting `isDefault`, the line
`isDefault: requestedDefault === true ? true : existing.isDefault` is claimed to produce two bad
outcomes depending on prior state: (1) the OLD provider group can be left with zero
`isDefault: true` credentials (no promotion of a remaining sibling, unlike the delete path which
is claimed to promote), and (2) the NEW provider group, if this was its first credential, can end
up with `isDefault: false`, violating a "first credential in a provider group auto-defaults"
invariant the file itself documents elsewhere (cites `store.ts:33`) — with `resolveDefaultForSourceControl`
then returning `null` for that provider despite a credential existing.

**UNVERIFIED — MEDIUM (test quality).** `store.unit.test.ts:442-459`. Claim: the test named
"...fails closed... never a plaintext write" only asserts the rejection type
(`SourceControlCredentialSecretStoreUnconfiguredError`) and never checks `deps.repo` was left
untouched (no `listByWorkspace`/`findById` check) — claimed insufficient to actually prove "never
a plaintext write" if a regression wrote to the repo before throwing. Same gap claimed for the
update counterpart at lines 450-459.

**UNVERIFIED — LOW (comment/doc accuracy).** `store.ts:17-23` / `store.unit.test.ts:45-46`. Claim:
both the production file's header comment and the test file's own comment assert "there is no
decrypt path here... none exists" — but `decryptRecord` (store.ts:429) and
`resolveDefaultForSourceControl` (store.ts:464-472) are claimed to already exist in the same file,
contradicting both comments.

Gemini raised 5 findings in this chunk, all recorded above as UNVERIFIED.

### Chunk 16 — `383befbc` test(deployments): credential-verification (static-publish/verify.ts) coverage

**Context given to Gemini:** diff (`verify.unit.test.ts` new hunk, 265 new lines) + FULL current
production file `apps/website/src/features/deployments/static-publish/verify.ts` (693 lines) +
FULL current test file (734 lines, post-commit). Full-file context.

**UNVERIFIED — HIGH (production bug).** `verify.ts:95-99` (`classifyProviderResponse`), also
referenced at 256/308-312/386. Claim: a S3 `HEAD` bucket-check that comes back `404` (bucket
genuinely does not exist / typo'd name) is classified as `reason: "unreachable"` (only 401/403 map
to `"rejected"`/invalid-credential), producing a user-facing message that says "this does not
necessarily mean the credential is bad" and implies retry-later — when the real fix needed is to
correct the bucket name. Claim: `classifyProviderResponse` was written for token-only endpoints
where 404 can't occur and was reused for the S3 bucket-path case without adjustment.

**UNVERIFIED — MEDIUM (production bug).** `verify.ts:237`. Claim: `(credential.endpoint?.trim() ?
credential.endpoint : deriveS3Endpoint(...)).replace(/\/+$/, "")` truthiness-checks the TRIMMED
value but then uses the RAW (untrimmed) `credential.endpoint` in the ternary's true branch — so an
endpoint with trailing whitespace after the final slash (e.g. `"https://r2.example.com/ "`) is
claimed to pass the truthy check, keep its trailing space untouched by the trailing-slash regex
(which only strips `/`, not whitespace), and produce a malformed URL (`".../  /bucket"`) once the
bucket path is appended — claimed to break `aws4fetch`'s URL signing. Claims the new test at
line ~295 explicitly pins the buggy "verbatim, trailing slash stripped" behavior rather than
catching it.

**UNVERIFIED — MEDIUM (test quality).** `verify.unit.test.ts:724-734`, test 16 ("a wrong-typed
private/default_branch field must drop the whole entry, never coerce or default it"). Claim: the
fixture builds `default_branch: undefined as unknown as string`, but `JSON.stringify` drops
`undefined`-valued keys entirely before the mock `Response` body is constructed — so the parsed
JSON never actually contains a wrong-TYPED `default_branch`, only a MISSING one; claims an
implementation that coerced non-string types (e.g. `String(raw.default_branch)` for a number)
would still pass this test, since it never exercises that path.

**UNVERIFIED — MEDIUM (test quality).** `verify.unit.test.ts:693-706`, test 14 ("...reports
truncated:false even on an under-full page — proves the regex is checked, not merely header
presence"). Claim: the fixture uses 1 repo (`fetchedCount=1`, under `GITHUB_REPOS_PER_PAGE`), so
the count-based fallback in `hasMoreGitHubRepoPages` would ALSO independently return `false` —
claimed a completely broken implementation that skips the Link-header regex entirely and only
checks count would still pass this specific test; argues the test needed a FULL page (>=100 repos)
with a Link header lacking `rel="next"` to actually prove the header check takes precedence over
the count fallback.

**UNVERIFIED — MEDIUM (production inconsistency, possible bug).** `verify.ts:631-642` vs. `probe`
at lines ~176-181. Claim: an authenticated HTTP 200 whose body is valid JSON but not an array
(e.g. a GitHub rate-limit error object) is treated as `status: "valid"` with `repos: []` — while a
200 whose body fails to parse as JSON at all is treated as `status: "unreachable"` — and the code's
own comment at line ~635 claims both cases follow "the same posture as `probe`," but `probe` itself
is claimed to treat an unparseable-body 200 as `status: "valid"` (`{ok: true}`), the opposite of
what line 637 does — i.e. the comment's cross-reference claim is claimed to be internally
inconsistent with the behavior it's citing.

**UNVERIFIED — LOW (test/commit-message mismatch).** `verify.unit.test.ts:316-340`, test 7. Claim:
named/described as exercising "a malformed DERIVED url," but the fixture supplies an explicit
(if malformed) `endpoint` string, so the code path claimed to actually run is the explicit-endpoint
branch, never `deriveS3Endpoint` — the test's own name/commit-message description is claimed to
misrepresent which branch it exercises.

**UNVERIFIED — LOW (test quality).** `verify.unit.test.ts:676`, test 12 (500 failure in
`listGitHubReposByCredentialId`). Claim: asserts only `/GitHub/` against the message, unlike a
sibling test (line ~261) that pins the exact `(HTTP 503)` status-code suffix — claimed insufficient
to catch a regression that dropped the status code from the message.

**UNVERIFIED — LOW (test quality).** `verify.unit.test.ts:708-734`, tests 15/16. Claim: both feed
an all-malformed repo-entry list and assert the result is `[]` — claimed not to prove that a VALID
sibling entry survives alongside dropped malformed ones (e.g. a bug that aborts the whole loop on
the first malformed entry would also produce `[]` here and pass).

Gemini raised 8 findings in this chunk, all recorded above as UNVERIFIED (2 production-bug claims,
1 production-inconsistency claim, 5 test-quality claims).

### Chunk 17 — `4b35a008` test(source-control): github-git-provider.ts branch-coverage fill

**Context given to Gemini:** diff (`github-git-provider.unit.test.ts` new hunk, 652 new lines) +
FULL current production file `apps/website/src/features/source-control/github-git-provider.ts`
(829 lines) + FULL current test file (1516 lines, post-commit). Full-file context. This is the
densest chunk (production file itself described in its own commit message as "the highest-density
file in scope").

**UNVERIFIED — HIGH (production bug + test masking it).** `github-git-provider.ts:309-311`
(`fetchBranchTip`) + downstream `commit()` at ~765/799/605/660/686; `github-git-provider.unit.test.ts:1361-1380`
(Test 24). Claim: an HTTP 200 response missing `object.sha` is treated identically to a fresh/
nonexistent branch (`tipSha: undefined`), rather than as a provider error the way every sibling
step function (`fetchParentTree`/`createBlob`/`createTreeObject`/`createCommitObject`) handles a
200-but-missing-field response. Claimed downstream consequence: `commit()` reads `parentSha ===
undefined` as "branch is new," omits `base_tree`, builds an orphan tree stripped of the branch's
existing files, and issues a CREATE ref write — which claims would actually 422 on real GitHub
since the ref already exists (or, worse, succeed and wipe history, if GitHub behaved differently).
Claims Test 24 masks this by mocking `POST /git/refs` to return `201 Created` for a branch the
same test's own prior step already showed exists via a 200 GET — called "impossible on real
GitHub" and inconsistent with a sibling test (cited as Test 12, line ~1108) that verifies the same
endpoint returns 422 for an existing ref.

**UNVERIFIED — HIGH (production bug + test masking it).** `github-git-provider.ts:467-471,574-578,638`
(`fetchLiveBlobSha`/`resolveDeletionCandidates`/`buildTree`); `github-git-provider.unit.test.ts:1128-1159`
(Test 13). Claim: when a deletion candidate's live-verification read fails with a non-404 outcome
(410/500/network error), the code `continue`s without adding the path to either `deletions` or
`divergedPaths` — so the file is silently dropped from the new manifest while still physically
present on the branch (retained only via `base_tree`), permanently losing provenance and never
being reconsidered for cleanup in any future run. Claims the file's OWN header comment (cited
lines 127-142) already names this exact pattern as a critical bug in a sibling function
(`fetchManagedManifest`), making its recurrence here inconsistent with the codebase's own stated
standard. Claims Test 13's JSDoc asserts the outcome IS "reported as diverged," but the test never
asserts `divergedPaths` at all (only `filesDeleted === 0`), and claims asserting the JSDoc's own
claimed value would fail.

**UNVERIFIED — MEDIUM (production bug).** `github-git-provider.ts:252-257,265` (`readJsonBody`/
`providerErrorMessage`), also cited at `fetchRepo:292`, `fetchBranchTip:309`, `createBlob:488`.
Claim: `readJsonBody` casts `await response.json()` straight to `Record<string, unknown>` with no
`isPlainObject`-style guard (a guard that DOES exist elsewhere in the file per the author's own
`isPlainObject` at line ~365, claimed unused here) — so a valid top-level JSON primitive (`null`,
a number, a bare string) parses successfully and is treated as an object, and a subsequent
`body.json.message`/`.default_branch`/`.object`/`.sha` property read on it is claimed to throw an
uncaught `TypeError` rather than degrading to a handled provider-error. Claims the existing test
suite only covers invalid JSON syntax, never a valid-JSON-non-object body.

**UNVERIFIED — MEDIUM (production bug).** `github-git-provider.ts:302,687`. Claim: `encPath` was
introduced elsewhere in this same file specifically to avoid `encodeURIComponent` turning `/` into
`%2F` (which breaks GitHub's ref-path routing) — but the two ref-lookup/ref-write call sites
(`fetchBranchTip`'s GET and the ref-write's PATCH/POST target) use plain `enc(branch)` instead,
claimed to still %2F-encode a slash. Claimed consequence: committing to a hierarchical branch name
(e.g. `feature/update-copy`) 404s on the ref lookup (misread as "branch doesn't exist"), then fails
the subsequent write with a 422 ref-already-exists (create path) or a 404 (update/PATCH path).
Claims the test suite only ever uses single-segment branch names.

**UNVERIFIED — LOW (comment/doc + characterization accuracy).** `github-git-provider.unit.test.ts:1338-1348`
and the commit message itself. Claim: two unrelated JSDoc comment blocks (one describing a
`default_branch` fallback actually tested ~120 lines later) are stacked above an unrelated test,
claimed to be an orphaned/misplaced comment from editing. Separately disputes the commit message's
own "12 unhit branches are the file's most redundant/defensive fallback arms" characterization,
naming two specific still-unhit branches claimed to be PRIMARY error-return paths, not defensive
fallbacks (`!manifestBlob.ok` early-return at ~line 640; an update-mode `writeRef` non-422-status
branch at ~line 709) — and arguing some branches this very commit DID newly cover (Test 24's
missing-`object.sha` case) were latent bugs, not defensive redundancy, undercutting the
characterization further.

Gemini raised 5 findings in this chunk (2 HIGH production-bug-plus-masking-test pairs, 2 MEDIUM
production bugs, 1 LOW doc/characterization item), all recorded above as UNVERIFIED. This chunk's
claims are more load-bearing than most in this RAW batch (two HIGH findings describe concrete
GitHub-API-response scenarios with specific downstream consequences) — the verifier should
prioritize checking these two first, including whether the commit-time state of `commit()`/
`resolveDeletionCandidates` differs from current HEAD before treating them as pre-existing vs.
newly introduced.

### Chunk 18 — pending
### Chunk 19 — pending
