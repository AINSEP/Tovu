# jy-pay — merge-6 delivery plan

Base: `d3e78b387` (merge-6). All 12 sheets DONE in dispatch order; no sheet or anchor STOP. `.git` remained read-only. No tests, builds, installs, type-checks, linters, catalog generation or API-baseline generation ran. No classes renamed, pads removed or functions converted. Only the existing private column helper was renamed.

Per-sheet file inventories and the 27 rename pairs are in `REFRESH.md`. Counts of references are occurrences, not executed test cases.

## K1 — DONE

25 ids + 25 authors; 35 test-id literal occurrences in 25 test files; README compatibility prose aligned with the assigned namespace removal.

BREAKS (copied from sheet): installed plugins/settings keyed `tovu/<name>`; saved page embeds `"plugin":"tovu/calendly"`/`tovu/google-login`; Tovu callers (j-tv-rjk T1).

Changeset: `.changeset/jy-pay-k1.md` (`@jini-ai/agent-plugins`, minor).

## K4 — DONE

3 production files + 8 tests; 80 test/fixture references updated.

BREAKS (copied from sheet): deployed workers keep old bindings until republished; republish makes a NEW `jini-forms-*` D1, so unpulled submissions in old `tovu-forms-*` DBs are stranded; published pages with old success markup until republished; Tovu renderer (j-tv-rjk T4).

Changeset: None requested.

## K5 — DONE

2 adapters + 3 tests; 3 test-path references updated (including the escaped GitHub assertion).

BREAKS (copied from sheet): existing repos/buckets: earlier-written files become unmanaged (not cleaned up); old `.tovu/` manifest left behind.

Changeset: None requested.

## K6 — DONE

3 source files, form-destination README + 4 test/fixture files; 3 persisted names, 1 private helper and its sole call renamed; 26 test/fixture references updated.

BREAKS (copied from sheet): existing sheets get new id/time columns; dedupe misses old rows (duplicates on retry); field columns re-created.

Changeset: None requested.

## K7 — DONE

15 files; Picker/OAuth/S3/Supabase config names updated; retired-env array and Fly advice removed; 15 test env references updated; 2 obsolete retired-env assertions removed.

BREAKS (copied from sheet): user env values under old names ignored until renamed; no Supabase retired-env notice; Fly card loses its advice; Tovu docs/env (j-tv-rjk T5).

Changeset: None requested.

## K8 — DONE

2 payload files + 3 tests; 3 credential-label fields and 3 test-label occurrences updated.

BREAKS (copied from sheet): saved Resend/Meilisearch credentials found by old label are orphaned; users re-enter keys.

Changeset: None requested.

## K9 — DONE

27 plain-mv renames; 36 reference files + 4 complete source maps updated; 69 test/fixture filename references updated, including 4 filters; 7 expected file lists reordered to retain their existing sorted-file assertions.

BREAKS (copied from sheet): Tovu reads `tovu-<kind>.json` (j-tv-rjk T6); digests change (OPUS-CLOUD regen).

Changeset: None requested.

## P1 — DONE

28 tool-description anchors + 7 prose anchors across 6 files; private helper rename already completed by K6.

Effect: Payload digests change; catalog regeneration is deferred to OPUS-CLOUD.

Changeset: None requested.

## P2 — DONE

90 descriptor/help rows (6 English + 84 localized in 21 locales), 11 runtime copy strings, 21 comment lines, 1 verification-note line and 3 expected strings; 10 files.

Effect: Payload digests change; catalog regeneration is deferred to OPUS-CLOUD.

Changeset: None requested.

## P3 — DONE

25 manifests confirmed author Jini; 0 further edits.

Effect: None beyond K1.

Changeset: None requested.

## D3 — DONE

2 files deleted (415 production + 581 test lines; 32 test declarations); 1 shipped-file entry removed.

Effect: Removed the dormant GitHub deployment provider; no host used it.

Changeset: `.changeset/jy-pay-d3.md` (`@jini-ai/agent-plugins`, minor; exact owner-approved wording).

## J13 — DONE

11 prose anchors edited in 6 files; 0 stopped anchors; 9 design-ID citations removed.

Effect: None; prose only.

Changeset: None requested.

## Public surface / cloud handoff

No new public signatures. D3 removes the module exports `GITHUB_DEPLOYMENT_PROVIDER_ID`, `sendPinned`, `mapGitHubDeploymentStatus`, and `createGitHubDeploymentProvider`. Published ids, config values, wire names and contribution filenames change exactly as K1/K4–K9 require. OPUS-CLOUD owns catalog/digest and API-baseline regeneration, combined validation, host repairs and package pins.

## Diff re-read

Deleted from the working diff: two unintended test regex substitutions were reverted, preserving the existing negative product-name checks. Transient non-id substitutions from the initial id edit were reverted before applying their proper K4/K5 sheets. No other out-of-scope edits retained. The only source/test file deletions are the two D3 files; the 27 old contribution paths are renames. No new helpers, abstractions, dependencies, suppressions, assertions or test scaffolding.

No file crossed 500 lines; already oversized touched files are listed in `REFRESH.md`. Function bodies, statement order and complexity are unchanged apart from the explicitly deleted D3 adapter and named K string/private-symbol changes. J13 TypeScript changes affect comments only; AG-UI anchors are untouched. No review mutations performed (culled).
