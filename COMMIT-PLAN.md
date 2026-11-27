# BUGD sec — Tovu working-tree handoff

Scope: sheets 3a and 3c only, based on bc262146be9e2ca472b0759821f8e30e74f20c05.
Jini production fixes and both changesets are already on origin/codex/bugd-secj,
as confirmed by bugd-secj.md and reads of that branch. No Jini edits or package bumps.
No installs, builds, tests, typechecks, linters, commits or pushes are permitted here.
Tests are authored before the AAD cutover. RED/GREEN and mutation execution are deferred to Opus.

## Completed units — coordinator commit order

1. Sheet 3a — implemented: OAuth callback regression witnesses and v2 AAD pins.
   - apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.test.ts
   - apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.lost-update.test.ts
   - apps/website/src/features/external-mcp/__tests__/access-grants.contract.test.ts
   - apps/website/src/features/external-mcp/__tests__/h2c/sign-in-ports.test.ts
   - Preserve external-mcp-dcr.test.ts positive registration cleanup control unchanged.
2. Sheet 3c — implemented: origin-only approval card and full-URL admission witnesses.
   - apps/website/src/features/external-mcp/__tests__/access-save.integration.test.ts

## Named mutations and required signals

- drop-callback-state-basis: omit saved version/creation identity from redirect state;
  replacement and same-version recreation callbacks must refuse before exchange, with no notice.
- drop-callback-write-basis: omit configuration guard after exchange;
  held successful exchange must not write tokens to a replacement, including null/null envelopes.
- cleanup-uses-current-row: use a post-exchange row for invalid-client cleanup;
  typed and self-registered replacements must remain byte-for-byte unchanged.
- host-runtime-drops-config-basis: drop expectedConfig through the host SQL repository;
  independent version/creation mismatches must return false without a row change.
- return-pre-commit-version-from-self-configuration: preserved DCR control must still
  reach the token endpoint and report its provider refusal, not OAUTH_INVALID_STATE.
- show-mcp-endpoint-path: restore the full URL as the card redactor input;
  the actual Source target must equal only the HTTPS origin and omit all URL markers.
- bind-access-approval-to-display-origin: compare only display origin for admission;
  changing only the stored path must invalidate approval and perform no grant write.

Jini-only mutations memory-ignores-callback-basis, sql-runtime-ignores-config-basis
and show-raw-endpoint-on-parse-failure are covered by its existing handoff.

## Completion / review

- 3a witnesses: activated B272 replacement-client refusal and added same-version recreation;
  added held-exchange success cases with both absent/present OAuth envelopes and late
  invalid-client cases for typed/self-registered rows. Each checks the unchanged replacement
  and no connection notice. SQL version/creation mismatches and matching-basis control use
  the existing SQLite/PGlite fixture and a sibling registrar.
- 3a cutover: both intentional AAD pins use v2 and the actual saved creation time/version.
  The real decrypt/exchange checks, existing refresh tests and positive DCR control remain.
- 3c witnesses: exact emitted Source target origin including port, no userinfo/path/query/
  fragment markers, saved URL unchanged and approved grants applied. A path-only change
  refuses the stale card and leaves the row/grants unchanged.
- Skipped duplicate work: Jini production changes, Jini-only tests and both Jini changesets
  already implemented on origin/codex/bugd-secj. Package/version/release work is a no-op
  under the coordinator override. No blocked steps or other sheets attempted.
- Final scope review: five named test files changed; no production bindings, dependencies,
  themes or other source files changed. This untracked plan is the only created file.
- Deletions: four duplicate import declarations; B272's TODO wrapper and swallowed-error /
  partial-row assertions replaced with exact refusal/row assertions; two v1 AAD pin values
  replaced with v2 saved-basis pins; full-path display assertion replaced with exact origin.
  No extra helpers, comments, cases or production logic required removal after diff review.
- Static review corrected the recreation fixture's required stdio tokenEnvName and supplied
  every required runtime patch field to the SQL witnesses. Named functions added/changed:
  callbackBasisContract (registration only, 26 lines) and harness (injected gate/notice,
  42 lines); tests reuse existing seams and real memory/SQL repositories.
- Architecture/scope review: PASS for the written diff; reusable behavior remains in Jini,
  Tovu adapters remain thin, all new scenario behavior is asserted at existing public seams.
- Verification: git diff --check passed. No tests, mutations, typechecks, installs, builds,
  linters or runtime checks ran, as explicitly prohibited. RED/GREEN and mutation outcomes
  are unverified; Opus owns their execution. No commits/pushes; .git remains unmodified.

This file must remain uncommitted.
