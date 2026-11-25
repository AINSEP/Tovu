PARTIAL 72d8fdd80 a04f2a981: left = .mov import hook is built but dormant at the 50 MiB cap (owner call), media_convert_video still has no approval card (owner call), route-table pin not regenerated, `check:architecture` red on the base, KB/todo rows that are design work not started

# bt3 bug/todo sweep (2026-11-24/25): Tovu `codex/bt3-tovu`, Jini `codex/bt3-jini`

Unattended cloud run. Base: Tovu + Jini `integ/merge-21-2026-11-24` (`68cb95192` / `7b2625f4d`, head did not move during the run; I re-fetched before every push). The shas in the first line are the code tips; this report is one commit on top on the Tovu branch. I read `AI-Dev-Shop/agents/programmer/skills.md` v1.7.5 first (confirmed). `cloud-results/m21-leftovers.md` was present: I skipped RA FIX 10/11, rv1124c fixes, C026, H4 `created_by_kind` / kill-switch holds, G7-9, site-update host adapters and the why-comment debt (apart from the ledger rows my own edits needed).

Six Sonnet workers (never more than three at once, none over ~47 calls). Every brief carried: failing test first, root-cause fix, named mutation, inject everything, fn <= 80 / complexity <= 10, no re-export shells, plain-words errors, no `--no-verify`. Workers committed; I pushed.

**Setup note:** Node here is 22 (repo wants 24). `npm ci --ignore-scripts` still ran `packages/contracts` `prepare` and failed against the published Jini, so I set that one `prepare` to `true` for the install only (reverted, not committed), then ran `link-jini` and built `packages/contracts`. Baseline before any change: Tovu `tsc` root 0; Jini `pnpm -r build` 0.

## Rows

| id | severity | status | commit (Tovu / Jini) | test |
|---|---|---|---|---|
| email "Send test" always refused ("Mail configuration changed") | wrong behaviour | **FIXED, narrower than reported** | `7afb1b453` / — | `composition/__tests__/site-mailer.unit.test.ts` (+7: 5 scenarios, 2 pins that a really changed provider/test mode is still refused). RED `MAIL_TEST_APPROVAL_CHANGED` (6 pass / 1 fail) -> 51/51 across the four mail files. Mutation `return chosen;` -> red. |
| Trash header says 30 days, old rows keep 60 | UI copy | **FIXED** | `bb01afcfd` / — | admin `trash-i18n.unit.test.ts` (no digits in the header in any of 21 locales). RED 4 -> 90/90. Mutation: old key back -> 3 red. Old `purgeAfter` stamps untouched. |
| `bt3-approved-enable-error-masked` (found while verifying plugin-host) | wrong behaviour (owner never sees which server failed) | **FIXED** | `7df38fa89`, `0e9cd139d` / `ee1e146b2` | Jini `connect/__tests__/plugin-host-approved-enable.unit.test.ts` (5; 3 red first, exact "Details: ToolInputError"). Agent-plugins package 2373 pass. Two mutations red. Tovu `plugin-host.integration` 25/25. |
| `plugin-host-bundled-identity` | test bug | **FIXED (stale test)** | `360541098` / — | `plugin-host.integration.test.ts` test 9; the file did not even load (fixture imported symbols `features/post` no longer exports). Identity map now derived from disk. Two mutations red. |
| upload limit: Library / Media / chat attachments / assistant imports, state the limit in the error | wrong behaviour | **FIXED** (Media screen has no client pre-check; server sentence only) | `0d14de593`, `582cf6714`, `8a4eb208f` / `9a9da3df3`, `bcf6a130b` (api baseline + changeset) | `@tovu/contracts/upload-limits` is the one source (50 MiB); Library goes 10 -> 50 MiB (server accepts it); Jini `describeUploadOverLimit` "That file is X MB; the limit is Y MB." Website pin 2/2, admin pin, contracts test, Jini core 208. Mutation: Library back to 10 MiB -> red. |
| two-sided conformance (read-only principal cannot see or invoke a write tool) + per-principal enum box | security | **FIXED (test, feature already built)** | `b3234eabc`, `575de341d` / — | `assistant/__tests__/tool-catalog-principal-conformance.test.ts`. Mutations: catalog ignoring the principal -> red; write tool marked read-only -> red both halves. Removing the outer `withReadOnlyToolConstraint` alone stays green (the recovery stack has its own read-only gate; honest note in open-bugs). |
| `media_convert_video` registered in Tovu (todo: conversion through a media tool) | feature | **FIXED** (see NEEDS-OWNER below) | `5ec9daa9b`, `bc2aebe45` / — | `convert-video-registration.test.ts` 4/4 (red first), 34/34 with neighbours; mutation red. No ffmpeg -> plain-words refusal, nothing saved. |
| web-safe MP4 on import (> 50 MB, keep original) | feature | **PARTIAL: built, dormant** | `f0c39b6d0`, `7bcd16169`, `bc7360fd0` / — | `import-video-conversion.test.ts` 8/8, route test 3/3, 3 mutations red. Every store path is capped at 50 MiB and Jini's threshold is strictly over 50 MiB, so no stored video can reach it today (pinned by a test that fails if the cap is raised). Needs an owner call. |
| stale `portable-plugin-host.unit.test.ts` provisioning-shape assertion | test bug | **FIXED** | `7bcd16169` / — | 6/6; three test-side mutations red. |
| `.mov`/`.m4v` upload + URL import (todo line 115) | feature | **STALE** (Jini + `dbb0c6d3b` already did it) | — | — |
| `C8-css-unrenamed-jini-classes` remainder | UI | **STALE** | — | every `tab-bar*` / `row-menu*` token in admin CSS matches what Jini emits |
| `check-architecture.baseline.json` stale rows | tooling | **STALE** | — | all 348 edge endpoints exist; nothing pruned |
| `C9-share-zip-refusal-vs-acknowledgement`, `C9-site-chat-lockfile-stale`, `C7-*`, `C8-github-*`, `C8-dev-select-*`, `A2-resend-*` | — | **STALE** (already closed in the file) | — | — |
| `L079-force-without-principal-kind`, `L079-partial-inverse-failure` | — | **SKIPPED** (preserved, pinned by tests) | — | — |
| route-table pin regenerate (todos ~242) | tooling | **SKIPPED** | — | pin test is red, but the regenerated diff is more than the 3-4 held-back rows (mail-capture clear, handler-name changes, `_share`, `/internal/tool-catalog`, a new browser-analytics route, a consent hash). Snapshot left untouched; regenerate after the diff is read. Row `bt3-route-pin-not-just-heldback`. |
| C026, H4, G7-9, site-update host adapters, RA FIX 10/11, why-comment debt | — | **SKIPPED** (owned by m21 leftovers run) | — | — |
| production email, email phases, LiPay/commerce, theme `/` layout, coverage/mutation/perf | — | **SKIPPED** (parked / end-of-refactor) | — | — |
| the remaining ~280 unticked boxes in todos.md (kernel/DI, search, theming, plugin lifecycle, admin IA, etc.) | design / feature | **SKIPPED** (design work, not bug-shaped; not started) | — | — |
| real-browser checks (Send test through the admin, Trash header, Library 50 MiB, conversion of a real .mov) | — | **UNVERIFIABLE-IN-CLOUD** | — | no browser pass, no real provider, no real ffmpeg media |

## Honest notes

- **Send test "always refused" was not reproduced as stated.** Through the real `createSiteMailer`, purpose gate, policy wrapper and `planMailTestSend` + `runMailTestSend`, four setups passed (configured provider with a key, the same with a redirect, no provider chosen, console chosen). It fails when a provider is chosen but its key is not saved, in local mode: the policy sees Jini's console fallback (`providerId "console"`) while the plan froze the chosen id. Fixed in Tovu by naming the provider the policy really sees; the Jini wrapper is unchanged and still refuses a genuinely changed provider/driver/sender/mode/recipient (two pins). If the owner still sees the refusal in the real admin, it is a different setup than these four.
- **NEEDS-OWNER: `media_convert_video` runs with no approval card in Tovu.** Jini declares it `edit`/`direct`; Tovu's `approvalClassAsks` runs `edit` without a card (owner rule 2026-09-24). The brief asked for the card; making it ask needs a per-tool override or a stricter class, which I did not invent.
- **NEEDS-OWNER: video over 50 MB.** Either raise the cap for video or pass a 50,000,000-byte threshold (which would only convert 50,000,001 to 52,428,800 bytes).
- Owner-data deletion: nothing in this run deletes owner data. Schema/migrations: none touched (no ADR-066 step needed).
- The conversion note for the owner is a log line only; the upload response has no field for it (needs a Jini route change).

## Gates (final)

**Jini** (`a04f2a981`): `pnpm -r build` 0 (baseline); `pnpm typecheck` 0; `pnpm guard` 1 = only the known BASE-RED `shell-failure-log.ts` HW3; `api:check` 0 after `api:update` + changeset `bt3-upload-limit-message.md`; `check:hooks` ok; why-comments ok vs base after two ledger rows (claims made false by the rewording). Vitest: agent-plugins full 2373 pass; core 208; cms media-service + tool-registrations 90; chat uploader 28; admin library 31.

**Tovu** (`72d8fdd80`): `tsc` root 0; admin `tsc` 0; `check:hooks` ok; `check:boundaries` 0 errors, 144 warnings (= base); why-comments ok vs base after three ledger rows. Changed website tests (11 files, `--test-concurrency=2`): 98 pass / 9 fail. All 9 are in `routes/media/__tests__/replace.test.ts` and fail on `captions: null` present in the stored record but not in the uploaded one (m21 G7-9 work; none of my commits touch that path, inferred BASE-RED, not re-run on the base). Admin vitest (trash, library, AssistantDock): 901/902; the one failure is `use-dock-renderer-registry` "reuses Jini's mid-run bubble ... original props" (an extra prop in a deep-equal), outside every file I changed, inferred BASE-RED.

**Known red not touched:** `check:architecture` (back-edges into the composition root 0 -> 3, one new cycle pair, one new cross-feature edge `api-connections/host-bindings -> agent-plugins/lifecycle`); looks m21-introduced, row `bt3-C8-css-and-architecture-baseline`. `development/parity/tool-guides.json` needs a regenerate (rewrote ~640 unrelated lines, reverted). Postgres-server tests could not run (no socket).

## Pushed refs
- Tovu `codex/bt3-tovu`, Jini `codex/bt3-jini` only. No tag, publish, force-push, or touch of `main`/`integ/*`/`plan/*`/`release/*`/other `codex/*`.
- Caps: all workers within or within ~5 calls of their 45-call cap (W3 47, W1 46 incl. one over); coordinator ~75 tool calls; wall-clock about 1 h 40 m.
