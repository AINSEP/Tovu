# lo-sc report (wave2/lo-sc, both repos) — INTERIM, final update at the end of the run

Run 2026-11-17, unattended. Base: origin/refactor/terra (Tovu 232764af5 / Jini 65d73b0d5). Node 24.22.3, vitest `--maxWorkers=2` equivalent (see "Differed"). Rulebook files read: refactor skills, programmer skills, refactor-patterns, implementation-guardrails, testable-design-patterns, architecture-migration (skimmed; the owner rules in the dispatch were applied).

## Done
**SC-H1 (security, class/location only): DONE.** The source-control account-label probe made a credentialed outbound request through the kit's native `fetch` (plugin `github/source-control/github.mjs`, host store `features/source-control/store.ts`), outside the guarded egress client and with no per-call redirect refusal. Now: the plugin sends it through `kit.httpClient` with `redirect: "error"`; the host store's write deps carry the guarded client (`httpClient`, wired from `RouteDeps.customCredentialsHttpClient` in the admin credential route and the assistant credential-setup path) and the global `fetch` is never used for it.
- Jini `b89543f3` (agent-plugins patch changeset).
- Tovu `e7da7795`.
Other credentialed outbound of the same class noticed, NOT changed (not in this sheet): the site-commit path (`commit-site.mjs`) sends through the kit's native `fetch` and relies on the plugin's own redirect guard, so it is outside the host egress guard (plan table "Outbound A"). Recommend a follow-up sheet.

**SC-1 (HARDEN, Jini devops): DONE**, one commit per gap, each green alone, changeset + devops api-baseline delta in the same commit:
- G1+G1b `ba17cddd` redact provider failure text and host-described thrown-error text with the resolved token (patch).
- G2 `588df0ff` own-property failure-code map (patch).
- G3 `779ff163` optional `stage` on `describeError` (minor).
- G4 `9393d080` optional `CommitLayoutPort.arrangeFiles({ report })`, validation still applies, cleanup after arrange (minor).
- G5 `95b9654d` optional `describeMissingCredential({ providerId })` (minor).
Wording decision (differs from nothing in the sheet, noted for SC-2b): a failure at stage `arrange` is worded ONLY by `describeError` (no Jini prefix), so SC-2b can keep the Tovu texts byte for byte; the `export` stage keeps its existing prefix.

## Branch / SHAs
- Jini `wave2/lo-sc`: b89543f3, ba17cddd, 588df0ff, 779ff163, 9393d080, 95b9654d (pushed).
- Tovu `wave2/lo-sc`: e7da7795 (pushed), def696d2 = cherry-pick of wave1 `53ff98c3` (SC-2a characterization test, needed by SC-2b's precondition; wave1/lo-SC-2a is not merged into terra). SC-0 (`wave1/lo-SC-0`) NOT cherry-picked (SC-2b does not need it).
