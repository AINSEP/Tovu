# Tovu upgrade compatibility handoff

Base: `0973a5fdc8` (`integ/merge-10-2026-11-21`); dispatched branch `codex/tv-upg`.
No tests, mutations, builds, installs, type-checks, linters or git writes were run.
Tests were edited before production for each attempted implementation. Red expectations below are source-based, not executed results. Coordinator stages the surviving changes.

## CRED-T1 — STOPPED

- Base: `0973a5fdc8`.
- Stop: `apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts:494` has a 54-line `bindSiteSearchPorts` callback, ending at line 547. The sheet requires changing assertions inside it. This exceeds the hard 50-line function limit; splitting it is not a named edit. Its 547-line file size is separately noted and is not the stop reason.
- Files: no surviving edits. Removed this sheet's drafts from `site-search.ts`, its unit test, `plugin-credential-cards.unit.test.ts`, `after-assembly-forms-search.ts`, Meilisearch guidance and the Meilisearch required-guidance token.
- Tests: drafted then removed the historical lookup/precedence assertions and canonical writer expectations. Exact-only lookup would miss the Tovu row; the base prefix and card expectations are stale. No retained tests or executed red evidence.
- Mutation owed to combine after resumption: remove each historical candidate independently; move either before canonical; restore the stale packed Meilisearch label.
- API-baseline delta: none.
- Look owed after resumption: Chrome upgraded-site query with an old saved key, and fresh Meilisearch save card.
- Diff re-read deletions: all CRED-T1 draft edits removed to leave this stopped sheet at base.

## CRED-T2 — DONE, execution owed to combine

- Base: `0973a5fdc8`.
- Files: `apps/website/src/server/runtime/boot/{resolve-mailer.ts,mail-provider-catalog.ts,__tests__/resolve-mailer-lifecycle.unit.test.ts}`.
- Tests: two historical-label lifecycle cases, written first, cover original-token delivery, original credential ID with canonical status label, in-place rotation, and canonical-row precedence. With the canonical fake descriptor, the base exact-only resolver cannot send either historical key; exact-only metadata cannot fingerprint its rotation; the original describe callback reports it missing.
- Source: only the named label helper and status projection, ordered existing vault lookups, fingerprint selection and callback bindings. Existing scopes, optional pad, error propagation, SMTP username requirement and Jini contracts remain intact. Fingerprinting still makes one metadata list read and zero opens; canonical resolution still stops at its first saved row.
- Mutation owed to combine: remove each historical candidate; restore exact-only `readCredentialFact`; bind `describeMailProviders` directly. Run the unchanged cost-counter baseline as well.
- API-baseline delta: no baseline row. Named helpers are private; no exports or imports added.
- BREAKS: internal `resolveMailCredential` required input replaces `catalog` with `labels`; its sole production importer/caller is updated.
- Look owed: Chrome upgraded mail status preserves the original saved credential identity and sending uses it, including rotation.
- Diff re-read deletions: none outside the named replacement logic.

## CRED-T3 — DONE, execution owed to combine

- Base: `0973a5fdc8`, following CRED-T2.
- Files: `apps/website/src/features/agent-plugins/mail-adapter-registry.ts`; its `__tests__/unit/{mail-provider-contribution.unit.test.ts,mail-provider-setup.unit.test.ts,portable-host-guidance.unit.test.ts}`; `apps/website/src/server/runtime/boot/__tests__/mail-credential-cards.unit.test.ts`; `content/agent-plugin-overlays/resend/{GUIDANCE.md,__tests__/bundled-mail.test.mjs}`.
- Tests: updated Postal/Resend defaults and Acme setup expectation before source; retained explicit `Postal key` control and canonicalized the existing card-submit fixture and bundled descriptor expectation. Default assertions contradict the base Tovu return value. The card-submit and packed-descriptor cases are contract proofs, not claimed base-red: pinned Jini already declares `Mail — Resend API`.
- Mutation owed to combine: restore the old default return; restore the old descriptor label on the disposable packed candidate.
- API-baseline delta: none; signature and pad preserved. The persisted-name canonical value/comparison, SMTP and webhook-secret labels remain unchanged.
- Look owed: Chrome Connect Resend card and saved row.
- Diff re-read deletions: none.

## GH-T1 — STOPPED

- Base: `0973a5fdc8`.
- DEPENDS: `jx-gh GH-J1`.
- Stop: `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-commit-site.unit.test.ts:911` has an 87-line callback ending at line 997 (75 nonempty non-comment lines). Required canonical manifest replacements fall inside it. The hard function limit blocks this sheet; the brief does not authorize splitting it. The file is 1,726 lines; exceeding 500 is not the stop reason.
- Files: no surviving edits. Removed the drafted GitHub adapter case and Example Git absence assertion from `features/source-control/__tests__/commit-site.unit.test.ts`; provider/source/guidance edits were not made.
- Tests: draft GitHub field assertion is red against the base field-free input/adapter; Example Git absence is the unconditional-field mutation control. Neither is retained after STOP.
- Mutation owed to combine after resumption: omit the GitHub field; supply it unconditionally; combine GH-J1's provider mutations against its exact packed candidate.
- API-baseline delta: none; proposed optional provider field not added.
- Cutover witness owed: confirmed sandbox publish into a nested legacy destination; unchanged stale file deleted, edited and unmanaged files preserved, one fast-forward branch update, second publish reading canonical ownership. Package release/install remains OPUS-CLOUD; no lockfile edits.
- Look owed: confirmed Tovu sandbox publish with the packed GH-J1 candidate; local preview cannot establish remote deletions.
- Diff re-read deletions: all GH-T1 draft test edits removed.

## FED-T1 — DONE, execution owed to combine

- Base: `0973a5fdc8`.
- Files: deleted only `apps/website/src/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts` (60 lines).
- Tests: no new case. Retired the sheet-designated base-red HTTP POST assertion. Preserved `new admissions appear in daemon-call catalogs` and standalone route/run-scoped authorization tests.
- Mutation owed to combine: skip `await reload({}, {})` in `assistant-server-federation.ts:50`; the second-admission assertion must fail.
- API-baseline delta: none.
- Look owed: none. Targeted literal and route-symbol searches found no production mount or caller.
- Diff re-read deletions: exactly the named obsolete test file; no additional production deletion.

Static review: surviving edits stay in the named files, retain existing pads, add no dependencies/casts/suppressions, and add only the two named private mail helpers. Those helpers and changed mail functions are below 50 lines and complexity 10 by source inspection. Status projection uses the existing Jini metadata contract; no stored row is relabeled. Remaining runtime, mutation, coverage and browser evidence belongs to combine. STOPs are recorded in `REFRESH.md`.
