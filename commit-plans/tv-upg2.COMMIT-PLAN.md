# Tovu upgrade compatibility handoff

Branch: `codex/tv-upg2`. Base: `1e7790996575b1495abd228fa00570cccd11ca7c`.
Sheets: `r62t-rsy-7.md`, restricted by the rerun dispatch to CRED-T1, GH-T1, FED-T1, in that order. CRED-T2 and CRED-T3 remain untouched. No git writes or executable verification were performed; coordinator stages and combine runs checks and mutations. No dependency, manifest, lockfile, debt or baseline files changed.

`W` = `apps/website/src`.

## CRED-T1 — done, execution owed to combine

- Base: `1e7790996575b1495abd228fa00570cccd11ca7c` (sheet base `0973a5fdc8`).
- Files:
  - `W/server/runtime/composition/modules/site-search.ts`
  - `W/server/runtime/composition/modules/__tests__/site-search.unit.test.ts`
  - `W/server/runtime/composition/site-deps/after-assembly-forms-search.ts`
  - `W/server/runtime/composition/__tests__/plugin-credential-cards.unit.test.ts`
  - `W/features/agent-plugins/__tests__/unit/portable-host-guidance.unit.test.ts`
  - `content/agent-plugin-overlays/meilisearch/GUIDANCE.md`
- **CRED-T1-PREP split:** moved the existing bound-port structure assertions verbatim into local `assertBoundSearchPortStructure`. Passed the existing ports and HTTP client explicitly and awaited the helper, preserving assertion order. Helper: 13 lines; remaining callback: 44 lines. Existing assertions, casts and messages were preserved during the split; no assertion was removed or weakened. The test file is now 565 lines; continue per owner correction.
- Tests written before production edits: made the existing fake vault label-aware; retained the missing-credential and declared-key cases; exercised Tovu-only, Jini-only and canonical plus both historical rows with distinct tokens and exact lookup-order assertions. Updated fixed-prefix, decrypt-error and canonical direct-port expectations. Pinned both real Meilisearch card label fields and the host-guidance token to `Search — Meilisearch`.
- Expected RED, not executed: the old resolver requests only the Jini label, so missing-key order, Tovu-only selection, canonical selection and prefix expectations fail. The Jini-only case verifies that compatibility remains supported. The real card and direct-port assertions pin existing upstream/wiring contracts; the stale-manifest mutation, rather than the resolver change, makes the writer proof red. The guidance token fails against the old overlay.
- Implementation: canonical prefix, then exact Jini and Tovu lookups only on null within the existing try; existing decrypt/repository failures, workspace scope and key projection remain intact. Reused the existing vault port; no new production helper or scope.
- Mutations owed to combine: remove each historical candidate independently; put each historical candidate before canonical independently; restore both stale Meilisearch label fields in the disposable Jini manifest.
- API-baseline delta: none; existing exports and `searchCredentialLabel` pad unchanged. Existing `site-search.ts` error-debt row retained.
- Look owed: Chrome query on an upgraded site with an original saved key, followed by inspection of the fresh Connect Meilisearch save card.
- REFRESH: no additional production importers; no import repoints.
- Diff reread deletions: none outside the named replacements and PREP relocations; no extra code retained.

## GH-T1 — done against sheet, upstream and execution owed

DEPENDS: jx-gh GH-J1

- Base: `1e7790996575b1495abd228fa00570cccd11ca7c`; requires the GH-J1 candidate from the parallel job as explicitly directed by this rerun. Candidate packing/installation was not attempted or verified here. Release/install remains OPUS-CLOUD; do not alter either lockfile to combine.
- Files:
  - `W/features/source-control/provider-module.ts`
  - `W/features/source-control/commit-site.ts`
  - `W/features/source-control/__tests__/commit-site.unit.test.ts`
  - `W/features/agent-plugins/__tests__/unit/bundled-github-commit-site.unit.test.ts`
  - `content/agent-plugin-overlays/github/GUIDANCE.md`
- **GH-T1-PREP split:** extracted the existing fixture initialization, read responses, blob decoding, tree simulation, write responses and first-publish assertions verbatim into six local helpers. Only extraction inputs, calls and return values were added. Mutable ownership snapshots and fetch restoration stay in the original callback; both publishes execute in their original order. Existing why-comments and existing casts moved with their statements. Original assertion text remains verbatim except the sheet's canonical-path assertion, which now has a plain-words message.
- PREP helper lengths: fixture 16, reads 13, blob 5, tree 9, writes 4, assertions 21 lines. Remaining callback: 42 lines. Manual complexity review includes optional access and logical operators; the fetch stub is at the hard limit of 10, all other extracted units below it. No new test API or optional pads were introduced.
- File sizes: bundled GitHub test 1,755 lines; host commit test 899 lines. These are recorded rather than treated as STOP reasons.
- Tests written before production edits: added the requested typed GitHub adapter case with the real exporter/packager and injected fake saved API key, asserting predecessor path, nested folder, selected branch and successful adapter completion. Added the absence assertion in the existing Example Git case. Refreshed only existing manifest URL regexes, reserved-path fixture and expected tree paths to `.jini`; direct provider inputs, branch refs and request order stay unchanged.
- Expected RED, not executed: without the source change, the GitHub adapter receives no predecessor field. The Example Git absence control already passes the base and becomes red when the field is unconditional. Canonical provider fixtures target the packed canonical provider; migration behavior belongs to GH-J1.
- Implementation: one optional field on the existing provider input and one GitHub-only property in the existing adapter call. Existing credential, confirmation, branch, folder and optional-argument contracts remain unchanged. Reused the existing adapter seam; no new production abstraction.
- Mutations owed to combine: omit the predecessor field for GitHub; supply it for all providers. Execute GH-J1's predecessor/canonical/error mutations against the exact packed Jini candidate as part of combined proof.
- API-baseline delta: no baseline or export row; additive `CommitSiteInput.previousManagedManifestPath?: string` only. BREAKS: none.
- Cutover witness / look owed: with the exact GH-J1 candidate packed, publish through the confirmed Tovu flow to a sandbox branch containing a nested legacy manifest. Prove deletion of a stale unchanged managed file, survival of edited and unmanaged files, and canonical ownership on the second publish. Local export preview does not establish remote deletion safety.
- REFRESH: additional test consumers are listed in REFRESH.md; none needs repointing. No unlisted production importer found.
- Diff reread deletions: none outside the named replacements and PREP relocations; no extra code retained.

## FED-T1 — done in base, no edits

- Base: `1e7790996575b1495abd228fa00570cccd11ca7c` (sheet base `0973a5fdc8`).
- Files touched: none. `W/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts` is absent from both HEAD and the working tree. The dispatch explicitly says FED-T1 was already completed, so the deletion was not repeated.
- Tests added: none, as directed. Preserved `new admissions appear in daemon-call catalogs` and standalone-route/run-scoped authorization tests.
- Targeted route/path/registration lookups found no production importer or mount; the standalone route declaration and its tests remain. The normal roster listener still awaits `reload({}, {})`.
- Mutation owed to combine: skip the normal listener's awaited reload; the second-admission catalog assertion must fail. Witness: `W/server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts:174`.
- API-baseline delta: none. Look owed: none.
- REFRESH: already-applied retirement and preserved standalone route recorded.
- Diff reread deletions: none in this checkout; retirement is inherited from base.

Source-review architecture audit: PASS within the named sheets. Production changes stay in existing Tovu host policy/bindings, use existing ports and do not alter scopes or imports. Existing pads remain unchanged. New code has no dependencies, re-export shells, suppressions or casts; original casts only moved during authorized PREP. Variable names were checked against their values. Documentation consists of the named canonical examples and guidance; no new code comments were added. Runtime/self-validation status: unverified by explicit machine rule, with all named checks, mutations and browser/publish witnesses owed to combine. This handoff claims edits and source review, not passing tests or a verified publish.
