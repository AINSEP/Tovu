# Salvage of the leftover cloud/* branches — REPORT (2026-10-25)

Brief: `BRIEF.md` (same folder). Compared against `origin/cloud/overnight-1024-tovu` (Tovu) and
`origin/cloud/overnight-1024-jini` (Jini). Host: `vm`, 4 cores, Node 24.22.0.

## Result in one paragraph

Of the 20 CODE branches, **one carried work that never landed**: the Jini email-sender contract
(`cloud/jini-release-2026-10-22b` / `cloud/jini-release-b-results`). It is re-applied and verified
on `cloud/salvage-1025-jini` @ **`c2c5f04c`**. Everything else is **SUPERSEDED**: already in the
current code (often byte-identical, otherwise evolved further), or redone differently with the
current files already at CCN ≤ 10 and the leftover tests adding zero coverage. All
`.cloud-coord/**` reports are archived on `cloud/salvage-1025-tovu` (`83a43722e` Tovu, `059ce531e`
Jini). **No branch was deleted.**

## How "already landed" was measured (main's history was rewritten)

Tovu `origin/main` has only 219 commits and **no merge-base** with the 10-19..10-22 branches, so
`git log main..branch` shows 7,000+ "unique" commits for every one of them. So I used:

1. **Unique commits**: `git log <branch> ^<every other cloud/* ref> ^main`, which isolates
   what only that branch has.
2. **File identity**: for each file those commits touched, I compared the blob at the branch tip
   with the blob on the integration branch (same / evolved / missing).
3. **Identifier survival**: for evolved files, I listed the functions/consts/types (and test
   titles) the branch added and checked each one still exists on the integration branch. Each
   missing one was then grepped repo-wide and explained.
4. **CCN**: `eslint` with `complexity: 10` and `sonarjs/cognitive-complexity: 10` on the current
   files.
5. **Coverage delta** for leftover test files: v8 coverage of the target file, running the
   directory suite with and without the test.

What this does NOT catch: a fix whose identifiers survive while its *behaviour* was later changed
(e.g. a different condition). For the security-relevant ones (jsec2, C-1, mcp) I read the diffs
by hand.

## Tovu CODE branches (13): all SUPERSEDED, no commit needed

| branch | verdict | evidence |
|---|---|---|
| `cloud/tw1-features` (merge of all lots) | SUPERSEDED | 115 non-coord files touched: 78 byte-identical, 37 evolved, 0 missing. Every added identifier is present except the 8 listed in the lot rows below, each accounted for. |
| `cloud/tw1-features-L003` (site-backup A) | SUPERSEDED | 14/18 files identical, including all 5 new helper files (`import-backend-steps.ts`, `import-verifier-inventory.ts`, …). 4 evolved, 0 identifiers lost. |
| `cloud/tw1-features-L011` (theme coverage) | SUPERSEDED | 3/3 test files identical. |
| `cloud/tw1-features-L033` (media) | SUPERSEDED | 7/14 identical. `isStillRegistered` no longer exists (`read-chat-attachment.ts` was rewritten, +84/−29). One test was renamed from "crashes with a TypeError" to "returns a typed block", meaning that bug got fixed. |
| `cloud/tw1-features-L064` (plugin-runtime) | SUPERSEDED | new consent-path helpers all present; file evolved (+82/−9). |
| `cloud/tw1-features-L068` (post) | SUPERSEDED | 3/4 identical; `tool-registrations.ts` evolved. |
| `cloud/tw1-features-L086` (webhooks) | SUPERSEDED | 5/6 identical; `keyring.env.ts` differs by 2 lines. |
| `cloud/tw1-features-L095` (site-backup B) | SUPERSEDED | 10/16 identical. The `tool-registrations.ts` helpers (`findHostConnection`, `readIncludeSwitches`, `requireIncludeRecord`, `savePlan`, …) moved to `site-backup/backup-service.ts`. `resolveS3Delivery` and its S3 tests are gone because S3 delivery was removed from core on purpose. |
| `cloud/tw1-features-L112` (publish-trust) | SUPERSEDED | 7/10 identical; the "(reported, not fixed)" test is now "an unparsable expiry is refused…", so that bug is fixed. |
| `cloud/tw1-features-L115` (navigation) | SUPERSEDED | 5/10 identical; both "(reported, not fixed)" tests are now passing-behaviour tests (fixed). |
| `cloud/tw1-features-FIX1` (ghp_ fixture) | SUPERSEDED | the file evolved further (+59/−28); the runtime-built fixture is kept. |
| `cloud/build-email-dns-2026-10-21-wip-snapshot` | SUPERSEDED | 110 files, 0 missing, 27 identical. The mail work evolved past the WIP: limiter, test mode, provider detection and status moved into `@jini-ai/platform/mail` (`createMailPolicyWrapper`, `createMailLaneLimiter`, `computeStatusReport`, `NON_DELIVERING_MAIL_DRIVERS`). `refusingMailer` is now banned by `no-vendor-in-core.boundary.test.ts`. Re-applying it would reintroduce reverted vendor shapes. |

CCN check: all **53** current non-test `.ts/.tsx` files the tw1 family touched report **0**
`complexity>10` and **0** `cognitive-complexity>10`. Every lot test file already exists in the
current tree, so there was nothing to add.

## Jini CODE branches (7)

| branch | verdict | what / commit | tests |
|---|---|---|---|
| `cloud/jini-release-2026-10-22b` | **MERGE** (with b-results) | email-sender contract `adb92367` re-applied → **`c2c5f04c`** on `cloud/salvage-1025-jini` | see below |
| `cloud/jini-release-b-results` (⊃ 22b) | **MERGE** (email sender) / SUPERSEDED (rest) | commerce C-1 (`54d1cf47`) and mcp federated confirmation (`efd9a99f`): all 9 files are **byte-identical** on overnight-1024-jini already. The email-sender contract (7 new files + changeset) was missing and never reverted, so it was salvaged in `c2c5f04c`. | — |
| `cloud/jsec2-wip` | SUPERSEDED | The unverified Codex fix `f0ee6ea9` scopes the comment-queue cache per `commentsApi` instance (stops a cross-principal cached-rows leak). I reviewed it: current `use-comment-queue.hooks.ts` already has the same WeakMap API scope **plus** explicit workspace/principal keys (`CommentQueueScopeProvider`), so current code is stricter. The other 21 commits: 17 files identical, the rest evolved; the only lost identifier (`channels` in consent/css.ts) was renamed to `colorChannels`. | — |
| `cloud/refactor-C2` (ui execution) | SUPERSEDED | current files have 0 CCN>10 and 0 cognitive>10 (2 sonarjs `expression-complexity` hits, not CCN). The C2 tests pass on current code (8+14), but coverage is **already 247/247 lines, 70/70 branches without them**, so they add nothing. | measured |
| `cloud/refactor-C3` (daemon launch.ts) | SUPERSEDED | `run()` (cyc 60) has since been decomposed. The current file still has `settingsBuildOptions` (CCN 11) and `wireRunInput` (CCN 11, cognitive 13), but C3 never touched those (left for owner, below). The C3 test passes (9) but adds no line coverage (761/762 either way). | measured |
| `cloud/refactor-C4` (html-editor) | SUPERSEDED | all 5 current files have 0 violations. `css.test.ts` passes (20) but css.ts is already 110/110 lines, 50/50 branches. | measured |
| `cloud/refactor-C5` (agent-runtime providers) | SUPERSEDED | all 10 current files have 0 violations. `provider-http.ts` is no longer needed. `tool-turn-adapters.test.ts` fails 8/23 on current code: the adapter result shapes changed, so it tests behaviour that no longer exists. | measured |

### Verification of `c2c5f04c` (Jini)

- Conflicts in `mail/index.ts` and `CAPABILITIES.md`: resolved by keeping every current export
  and row and adding the senders ones.
- Guard: my first resolution made `pnpm guard` worse (104 → 106: one HW3 module-state hit, one
  SI-dependency hit). I fixed it within the brief's rules: `RESERVED` is typed `ReadonlySet`, and
  `@jini-ai/platform` is now an **optional peer + workspace devDependency** of cms, not a hard
  dependency. Result: **104 → 104, violation list identical to baseline**.
- `tsc -p` platform (build) ✅. `tsc --noEmit -p` cms ✅.
- vitest `platform src/mail`: 19 files, **238 passed**. vitest `cms src/forms`: 54 files,
  **699 passed**. These include the new `email-sender.unit.test.ts` suites (9 + 15).
- New files: CCN ≤ 10, cognitive ≤ 10. One sonarjs `no-inverted-boolean-check` on
  `!(occurredAt >= activatedAt)` is deliberate (NaN fails closed), so I left it.
- Changeset `.changeset/email-sender-contract-forms.md` (platform minor, cms minor).
- Not run: the full Jini suite, and Tovu against the new export. Tovu doesn't consume
  `mail/senders` yet.

## REPORT-ONLY branches: archived in `ADS-memory/reports/cloud-archive/`

Each folder holds the `.cloud-coord/**` files that the branch's unique commits touched, at the
branch tip. I re-checked all 24 Tovu ones: 23 have 0 non-coord unique files.
`cloud/provider-designs-2026-10-21` has 18 code files from 4 commits (Git-backup route via
`backup-service.ts`, the "Available here" pill, `site-trash/` gitignore, the Import & Export
panel). All of it is already in current code, so it is SUPERSEDED and treated as report-only.

Tovu (24): `audit-results-2026-10-21`, `audit-results-2026-10-21-b`, `bug-analysis-2026-10-22`,
`build-briefs-2026-10-21`, `commerce-design-2026-10-21`, `cov-038-results`,
`coverage-canary-results`, `coverage-full-results`, `coverage-lots-2026-10-21`,
`desktop-gates-fix-report`, `feature-briefs`, `fix-briefs-2026-10-21`, `folder-limit-results`,
`forms-codex-wip`, `main-verify-2026-10-22`, `provider-audit-2026-10-21`,
`provider-designs-2026-10-21`, `tovu-jini-0610-recheck`, `tovu-jini-0610-results`,
`verify-codex-fixes-2026-10-22`, `verify-coverage-lots-2026-10-21`, `verify-results-2026-10-21`,
`verify-v3-results-2026-10-21`, `wave-2026-10-24-results`. The coord notes of
`build-email-dns-…-wip-snapshot`, `tw1-features` and `tw1-features-L095` are archived too.

Jini (3 + 1): `jini-jini-release-2026-10-22-results`, `jini-jini-release-c-results`,
`jini-jini-release-rerun-results`, plus `jini-jini-release-b-results` (its results report).

**Excluded (size):** 10 raw dumps over 1 MB (sonar raw JSON, `coverage-all-files.json/.md`,
about 55 MB total) from `audit-results-2026-10-21{,-b}` and `verify{,-v3}-results-2026-10-21`.
They are listed with byte sizes in `cloud-archive/EXCLUDED.md`. Their summaries were archived.

Commits: `83a43722e` (Tovu archive), `059ce531e` (Jini archive), both on `cloud/salvage-1025-tovu`.

## Branches now safe to delete (owner's call; nothing deleted)

- **Now:** all 13 Tovu code branches; `cloud/jsec2-wip`, `cloud/refactor-C2`..`C5`; the 3 Jini
  report-only branches; and 20 of the 24 Tovu report-only branches.
- **After deciding on the raw dumps** (deleting the branch loses them, see EXCLUDED.md):
  `cloud/audit-results-2026-10-21`, `cloud/audit-results-2026-10-21-b`,
  `cloud/verify-results-2026-10-21`, `cloud/verify-v3-results-2026-10-21`.
- **After `cloud/salvage-1025-jini` merges:** `cloud/jini-release-2026-10-22b`,
  `cloud/jini-release-b-results`.

## Not done / for the owner

- `packages/daemon/src/agent-executor/launch.ts`: `settingsBuildOptions` CCN 11 and
  `wireRunInput` CCN 11 / cognitive 13 still exceed 10. Not C3's code, so it is out of salvage
  scope.
- `npm rebuild argon2 better-sqlite3 esbuild` in Tovu failed (`EUNSUPPORTEDPROTOCOL workspace:*`
  after `link:jini`). It didn't matter here because no Tovu code changed and no Tovu tests were
  needed.
- Neither salvage branch has a PR yet. Merging `cloud/salvage-1025-jini` → main publishes the
  email-sender contract on the next release.

SALVAGE DONE 2026-10-25 20:00 UTC. Wall about 28 min (19:32 → 20:00). Tokens: rough ~0.4M.
