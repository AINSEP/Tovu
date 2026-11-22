# P9 — finish the Tovu → Jini extraction (plan)

**Author:** Opus cloud planning run, 2026-11-22 (overnight, unattended). **Reviewer:** Codex 6.2 (read-only verify). **Implementers:** Opus, one step each.
**Scope:** planning only. No code edits, tests, builds or installs ran.

**Bases measured**
- Tovu `origin/integ/merge-12-2026-11-22` at **`748c032db`**. It is `integ/merge-11-2026-11-21` (`311d26dfa`) plus the five branches the brief names. I checked each with `git merge-base --is-ancestor`, and `codex/tv-seed-upgrade`, `tv-err1`, `tv-bugs3a`, `tv-bugs3b` and `tv-howto2` are all contained. merge-12 may still move while its cloud run finishes. Re-run the measure first (see *Refresh* below).
- Jini `origin/integ/merge-12-2026-11-22` at **`6b8e0d48a`**.

**How the numbers were produced.** `plans/P9-data/tools/scan.mjs` builds an import graph of every `.ts/.tsx/.mjs/.css` file under `apps/`, `packages/`, `scripts/` and `development/scripts/` in Tovu (8,603 files). It resolves relative specifiers, `#src/*`, the admin `@/*` alias and the three `@tovu/*` tsconfig aliases. 123 of 34,005 local specifiers stayed unresolved: JSON, `?raw` and similar. `plan.mjs` classifies each file, computes what blocks it, and writes the step sheets. `appx.mjs` writes the appendices.
- **Every importer `file:line` in `plans/P9-steps/` was checked against the tree.** A script confirmed that the old specifier appears on the cited line: 3,206 of 3,206 lines in the move sheets and 246 of 246 in the SH sheet. Every source path exists.
- Every Jini destination was checked for an existing file. One collision is flagged in its sheet.

**Refresh.** Run this before any batch if merge-12 has moved:
```
node -I plans/P9-data/tools/scan.mjs <Tovu> tv.json
ROOT=<Tovu> JROOT=<Jini> node -I plans/P9-data/tools/plan.mjs tv.json out
node -I plans/P9-data/tools/appx.mjs out <plan-repo>
```
A step whose file list changes must be re-read before it is dispatched.

---

## 0. Measure first: Jini-bound files still in Tovu

**Rule.**
- **Goes to Jini:** generic, host-neutral, vendor-neutral code with no Tovu product policy.
- **Stays in Tovu:**
  - product words and policy (product copy in `@tovu/contracts`, assistant guidance text, owner defaults)
  - composition: `server/runtime/**` (composition, boot, lifecycle, configuration), `cli/`, admin `App*`/`nav.ts`/`panels*`
  - Tovu's admin look (`admin-themes/`, `styles/`)
  - product screens: assistant dock, dashboard, sites switcher, playground, voice input
  - site management and the owner's site specifics: `features/sites`, `site-guide`, `site-evidence`, `platform/site-dir`
  - desktop packaging and site management
  - files named `tovu-*`
- **Per-feature tool metadata:** `contracts/core/tool-metadata/<x>.ts` is counted with its feature, which is why newsletter shows 25 here and 24 in the triage.
- **Shells:** pure re-export shells of Jini still in Tovu are counted as Jini-bound. They are deleted, not moved (lane SH).
- **Not Jini-bound by this rule** (Tovu keeps): `server/runtime/**` (286 non-test files), `assistant/**`, `platform/db/**` (except the S-lane repos), `platform/site-dir`, desktop packaging.

The table counts non-test source files. Test files are listed per step. Column meanings:
- **Verbatim-movable now**: every import of the file resolves to Jini, npm, or another Jini-bound file that also moves verbatim.
- **Imports Tovu-kept code**: the file directly imports a Tovu file that stays.
- **Would add a Jini cross-package edge**: Jini's `check:cross-package` XP3 forbids any new `@jini-ai/<other>` import except `@jini-ai/core`.

The same table is in `INDEX-EXTRACTION.md`. Per-file reasons are in `plans/P9-data/blocked-files.md`, and the files that stay and why are in `plans/P9-data/stays-in-tovu.md`.

| area | Jini-bound files left in Tovu | LOC | re-export shells | verbatim-movable now | blocked: imports Tovu-kept code | blocked: new Jini cross-package edge | blocked: only via blocked deps | files with Tovu words | stays in Tovu (files) |
|---|---|---|---|---|---|---|---|---|---|
| themes (website `theme` + admin `themes`) | **111** | 23,623 | 0 | 27 | 5 | 15 | 64 | 35 | 0 |
| publish-content (+ `publish-content/ui`, `publish-trust`, admin screen) | **83** | 17,335 | 0 | 19 | 14 | 9 | 41 | 33 | 1 |
| post (website `post` + admin `posts`) | **110** | 19,183 | 0 | 24 | 14 | 12 | 60 | 11 | 0 |
| newsletter | **25** | 5,557 | 0 | 2 | 5 | 6 | 12 | 2 | 0 |
| site-backup | **44** | 6,979 | 0 | 2 | 16 | 18 | 8 | 26 | 0 |
| deployments (website + admin `deployment`) | **70** | 15,019 | 0 | 11 | 12 | 21 | 26 | 30 | 0 |
| security (admin → Jini `admin/security`) | **39** | 8,514 | 0 | 4 | 11 | 8 | 16 | 10 | 0 |
| rendering/routes (`public-http` 134, `admin-http` 336) | **470** | 47,832 | 0 | 30 | 348 | 41 | 51 | 114 | 0 |
| admin screens (other features) | **485** | 88,539 | 0 | 98 | 72 | 127 | 188 | 80 | 122 |
| admin shell / transport / roles | **267** | 33,425 | 1 | 80 | 43 | 89 | 54 | 68 | 2 |
| desktop (generic Electron shell pieces) | **17** | 1,085 | 0 | 12 | 3 | 2 | 0 | 11 | 235 |
| users U (members, member-login) | **32** | 5,043 | 1 | 4 | 4 | 9 | 14 | 3 | 0 |
| devops other (source-control, site-export, domain-dns) | **40** | 5,564 | 0 | 9 | 8 | 15 | 8 | 13 | 0 |
| shared contracts + platform helpers | **150** | 7,756 | 4 | 92 | 7 | 39 | 8 | 47 | 0 |
| other generic features (53 dirs: media, widgets, settings, identity, webhooks, credentials, agent-plugins, …) | **566** | 58,565 | 15 | 136 | 128 | 168 | 119 | 263 | 12 |
| **TOTAL** | **2,509** | 344,019 | **21** | **550** | 690 | 579 | 669 | 746 | 372 |

**Owner's counts (11-21), compared with this measure.** Themes 85, post 52, publish 58, backup 43 and deployments 40 were website-only counts. This table adds the admin screen and the per-feature tool-metadata file. The website-only numbers today are:

| area | owner (11-21) | today | change |
|---|---|---|---|
| theme | 85 | 85 | +1 tool-metadata file in this table |
| post | 52 | 50 | |
| publish-content | 58 | 58 | |
| site-backup | 43 | 43 | |
| deployments | 40 | 40 | +2 tool-metadata files |
| newsletter | 24 | 24 | |
| admin security | 39 | 39 | |

**The finding the owner needs.**
- Only **550 of 2,509** files (22%) can move verbatim today, plus **21 shells** that can simply be deleted.
- The other **1,938** are blocked by three things that no verbatim move can fix:
  1. **690 files import Tovu-kept code.** One cluster stands out. Three host route files block 266 route handlers directly:

     | Tovu file | route files it blocks |
     |---|---|
     | `server/inbound/shared/admin-failure.ts` | 235 |
     | `route-guards.ts` | 196 |
     | `server/routes/types.ts` (`RouteDeps`, 1,490 lines) | 133 |

     The owner dropped re-wiring `RouteDeps` on 11-20 (~8:25 PM). The other blockers are spread thin:

     | Tovu file | files it blocks |
     |---|---|
     | `apps/admin/src/lib/i18n-common.ts` | 47 |
     | `features/media/index.ts` | 28 |
     | `@tovu/contracts/secret-redaction` | 23 |
     | `platform/express/async-route.ts` | 21 |
     | `platform/db/content-kernel.ts` | 20 |
     | `platform/site-dir/index.ts` | 17 |
     | `assistant/index.ts` | 17 |
  2. **579 files would add a Jini package-to-package import**, which the XP3 gate refuses. The largest edges:

     | Jini edge | files |
     |---|---|
     | `admin → ui` | 218 |
     | `cms → user-management` | 87 |
     | `admin → chat` | 59 |
     | `devops → cms` | 28 |
     | `admin → user-management` | 18 |
     | `devops → platform` | 17 |
  3. **669 files are blocked only because a dependency is blocked.**

  I simulated the fixes with `VIRTUAL`/`IGNORE_XP` in `plan.mjs`:

  | fix simulated | movable files |
  |---|---|
  | none (today) | 561 |
  | route keystones resolved | 587 |
  | admin UI kit resolved | 657 |
  | both, plus `@tovu/contracts`, `platform/db`, `site-dir`, `assistant` | 736 |
  | all cross-package edges allowed as well | 1,231 |

  These counts were taken before 21 of the files were recognised as shells. Reaching zero needs owner decisions (§K) **and** injection work per blocked file, not more verbatim moves.
- **Effort.** The verbatim-movable part alone is 93 steps (186 J+T items), about **150 implementer-hours**, or about 50 h wall-clock at 6-wide. Tonight's capacity at 4–6 implementers over ~8 h is **batches N1–N5** below, about **120–140 files**. Getting every area to zero is a multi-night program, and the blocked 1,938 need the §K decisions first.

---

## 1. Standard step contract (every step obeys this; sheets only add specifics)

**Setup (rule 1 of both repos' cloud rules).**
- Jini: `pnpm install --frozen-lockfile && pnpm -r build`.
- Tovu: `npm ci`, then `JINI_PACKAGES_DIR=<Jini>/packages node development/scripts/link-jini.mjs` (links root and every `apps/*`, desktop included). Build `packages/contracts` and `packages/sdk`.
- Record the baseline on the unmodified trees:
  - Jini: `pnpm guard`, `pnpm typecheck`, `pnpm check:size`, `pnpm check:complexity`, `pnpm check:hooks`, `pnpm check:cross-package`, `pnpm api:check`
  - Tovu: `npm run typecheck`, `npm run typecheck:tests`, `npm run check:boundaries`, `npm run check:size`, `npm run check:complexity`, `npm run check:hooks`, admin `tsc`
- **Linked combines only, so no publish is needed mid-night.** Every T step runs against linked Jini. The steps that need a Jini lockfile change are S6b (the `kysely` peer in `integrations`) and any T step that adds an `@jini-ai/*` dependency a Tovu app lacks. Today root lacks `admin`; `apps/admin` lacks `mcp, db, diagnostics, analytics, search, desktop-host`; `apps/desktop` lacks `cms, plugins, cookie-consent, analytics, search, admin`. Those are marked **LOCK** and stay on linked trees. No step needs a publish before the release run.

**J step (Jini).**
1. Copy each listed file **verbatim** to its destination.
2. Change only these four things:
   - import specifiers: relative between moved files, a same-package `@jini-ai/<pkg>/x` becomes relative, `.js` suffix kept
   - Tovu product words: comments say "the host" and keep the why; literals take the jini form and are logged in `plans/P9-BREAKS.md`
   - neutrality N2: no `apps/website|admin|desktop` or `#src/` text in comments
   - class names: `jini-*`
3. Move the tests the sheet lists into `__tests__/` beside the destination. Tovu's website tests use `node:test`; Jini runs vitest. The only allowed test edit is the import line (`node:test` → `vitest`; `node:assert/strict` stays). A test that uses `t.mock`/`mock.method`/`t.after` needs the vitest equivalent. If that is more than a one-line swap, STOP and leave it as a Tovu test.
4. Add the listed `package.json` export entries in the dist triple shape of the neighbours, and the `typesVersions` entry if the package has one.
5. Run `pnpm api:update` and commit the `api-baseline/jini-ai__<pkg>.json` delta. The delta is only the added entries, and the report lists them.
6. Add a changeset `.changeset/p9-<step>.md` (patch, "move host-neutral <area> code from the host").
7. Run the gates; none may get worse than baseline.

**T step (Tovu).** Run it after its J step is committed and Jini is rebuilt.
1. Delete the moved sources.
2. Apply every importer rewrite in the sheet exactly.
   - `[BARREL re-export: DELETE …]` lines: delete the barrel line, then repoint each barrel user of those names to the Jini subpath. Find them with `rg -n '<Name>' apps scripts development`. **No re-export shells, ever.**
   - An identifier renamed in J (for example `TovuRequestFacts` → `RequestFacts`) is renamed at every Tovu use in the same commit.
3. Tests listed under "must stay green" keep their assertions; only import lines change.
4. Delete stale entries in `development/scripts/size-exceptions.json`, `complexity-debt.json` and hook-injection debt that named the moved files.
5. Gates:
   - `npm run typecheck`, `npm run typecheck:tests`, and the step's test list with `node --import tsx --test <files>` (admin: `cd apps/admin && npx vitest run <files>`)
   - `check:boundaries` / `check:size` / `check:complexity` / `check:hooks`: no new lines
   - `check:architecture`: no new regressed metric

**Owner rules, checked in every diff.**
- Verbatim moves only.
- No re-export shells.
- No new layer or port unless unavoidable; if one is needed, STOP.
- Keep every `_optional = {}` pad and the args rule exactly. Never remove a pad, and never re-propose it.
- Custom hooks reach components as props (CI gate).
- Functions: warn at 50 lines, error at 80. Complexity ≤ 10.
- **Never delete a why-comment.** It moves with its code.
- Jini stays vendor-neutral and server-framework-neutral. Express exists only behind the existing `*/express` subpaths.
- No package above the domains.
- Jini class names are `jini-*`.
- Tests come first wherever behaviour changes. A pure move changes none; any step that must change behaviour writes the failing test first.

**Named mutation (every step).** The sheet names one. Apply it to the Jini copy, show that the named test goes red, revert, and paste both outputs.

**STOP conditions (report, push what is done, do not improvise).**
1. A listed file's imports differ from the sheet: merge-12 moved. Re-run the refresh and re-read the sheet.
2. A move would add an `@jini-ai/<other>` import (XP3), a `#src`/`apps/` text (N2) or a `/tovu/i` match that the sheet did not foresee.
3. A file encodes Tovu product policy: product copy, assistant guidance wording, owner defaults. Leave it in Tovu, record it as STAYS with the reason, and continue with the rest of the step.
4. A COLLISION file differs in behaviour from the Jini file already at the destination.
5. A test needs more than an import-line edit.
6. A Tovu importer needs more than a specifier, name split or barrel-line removal.
7. A function would pass 80 lines or complexity 10 after the move.
8. A hook-injection finding needs more than one prop at one call site.

**Commit cadence (both repos' cloud rule 2–5).**
- Commit and push every 5–10 minutes or per logical unit. `wip:` is fine.
- Never gate a commit on green.
- Run `git pull --rebase` before every push. Never force-push.
- Report every SHA.

**Branches.** `p9/<step-id>` in the step's repo, from Jini `integ/merge-12-2026-11-22` and Tovu `integ/merge-12-2026-11-22`. A T step bases on the Tovu tip of its lane chain and records the Jini SHA it was linked against.

---

## 2. Lanes and order

```
SH ─┐                         (Tovu only, now)
C ──┼─> T, P, D, U, X ──> A, DT ──> R (blocked, §K1)
S6b, S7b (after X-media-1)    RT (Jini only, now)    XC (Jini only, now)
SEC (swap; S0 now, S1+ after A-shell)      RN (after merge-12 lands; last in each night)
K (owner decisions; unblocks the 1,938)
```

### Lane SH — delete the 21 re-export shells and compat adapters (Tovu only, no Jini step)

Sheet: `plans/P9-steps/SH-shells-1.md`. It lists every shell, the Jini specifiers it re-exports, and all 246 importer lines (verified).

| step | content | importer lines | est |
|---|---|---|---|
| **SH-1** | `features/entries/index.ts` (59 lines), `features/taxonomy/index.ts` (29), `features/form-destinations/types.ts` (20), `features/member-login/types.ts` (15) | 123 | 110 min |
| **SH-2** | the other 17, including `agent-plugins/mcp-metadata.ts` (33 lines), the `contracts/core/{external-mcp-access,external-mcp-auth,path-containment,upload-limits}.ts` shells, and the three `database-transfer` **adapters** (`copy-engine.ts`, `plan-store.ts`, `postgres-target.ts`). An adapter moves only its re-export lines out; its host constants stay in Tovu (for example `DEFAULT_TRANSFER_SCHEMA = "tovu"`, `TRANSFER_MARKER_TABLE = "_tovu_transfer"`) until RN. | 123 | 110 min |

- `apps/admin/src/lib/standing-draft-recovery-message.ts` has **no importers**. Delete it in SH-2.
- Mutation: none (no behaviour). The gate is `typecheck` + `typecheck:tests` + the tests named in the sheet.
- Files left after SH-1 + SH-2: 2,509 → **2,488**.

### Lane C — shared contracts and platform helpers (C-*)

Generated: `C-contracts-core-1…7`, `C-contracts-headless-1`, `C-platform-html-1`, `C-platform-routing-1`, `C-presentation-1`.
- **Destinations.** `contracts/core/*` goes to `@jini-ai/core/contracts/site/*`. `contracts/headless/*` goes to `@jini-ai/core/contracts/headless/*`. `platform/html`, `platform/routing` and `features/presentation` go to `@jini-ai/cms/{html,routing,presentation}/site/*`. Unmapped `tool-metadata/<x>.ts` files ride with C into `core/contracts/site/tool-metadata/`.
- These come first because the T/P/D/U/X steps depend on them (`deps` column).
- **Catalog delta.** C-contracts-core-3…7 move tool-metadata declarations. `apps/website/src/assistant/__tests__/moved-tools*.golden.test.ts` must keep the same catalog bytes; tool ids and text are unchanged. If the bytes move, STOP: a path leaked into the catalog.
- **Product-policy risk.** These files carry product text: `approval-i18n.ts`, `assistant-content-guidance.ts`, `settings-vocabulary.ts`, `consent-refusal.ts` (C-1) and `request-facts.ts` (C-2). Apply STOP 3 file by file. Text that is product wording stays in Tovu and is passed in where the moved code already takes it as an argument. Do not add a new port.

### Lanes T (themes, posts, newsletter), P (publishing), D (devops), U (users), X (other features)

Generated ready steps:

| lane | steps |
|---|---|
| T | `T-theme-1,2`, `T-post-1`, `T-newsletter-1` |
| P | `P-publish-content-1`, `P-publish-content-ui-1`, `P-publish-trust-1` |
| D | `D-site-backup-1`, `D-deployments-1`, `D-source-control-1`, `D-site-export-1`, `D-domain-dns-1` |
| U | `U-members-1`, `U-member-login-1` |
| X | 40 steps (136 files) |

- Each sheet has the full file table, export entries, the test move list, the importer rewrites, the tests that must stay green, Tovu-word rows, i18n and hook/class flags, the mutation, dependencies and estimates.
- Destinations: newsletter goes to `@jini-ai/user-management/newsletter/*`, beside members, because `members` imports newsletter and putting it in cms would add a cms → user-management edge. Devops areas go under `@jini-ai/devops/{backup,deploy,source-control,static-export,dns}/site/*`.
- After the ready steps, each lane's remainder is the per-area "blocked" rows in `plans/P9-data/blocked-files.md`. Those wait for §K.

**Lane U remainder.** `members` and `member-login`: 32 files, 4 movable now plus 1 shell (in SH). The rest are blocked:

| blocker | files |
|---|---|
| `platform/db` content kernel and Tovu table types | 5 |
| `platform/mail` | 3 |
| new `user-management → cms` / `→ platform` edges | 9 |

The admin `members` and `users` screens are in lane A.

### Lane S — database code: S6b, S7a, S7b

- **S7a — DONE, retire.** Jini merge-12 has `packages/cms/src/media/versioned-repo.ts` and `guard-rendition-repo.ts`. Tovu merge-12 has no `InMemoryVersionedMediaRepo` class (`rg 'class .*VersionedMediaRepo' apps/website/src` finds nothing). This matches the ext2 cull ("Jini's S7a is on merge-6; `tv-bl` finished the Tovu half").

- **S6b — webhook SQL repo → `@jini-ai/integrations/webhooks/sql`.**
  - The `kysely` optional peer is the one `cloud-results/su-s6a.md:24,38` names. Its prerequisites, R11a/R11b-3 and the lockfile window after 11-19, are past.
  - **S6b.J (Jini, ~110 min).**
    - Move `apps/website/src/platform/db/repos/webhook-repo.ts` (395 lines) **verbatim** to `packages/integrations/src/webhooks/sql/webhook-repo.ts`. Use the S6a constructor shape: `({ kernel, tables: { webhookSubscriptions, webhookDeliveries } }, {})`.
    - Jini-local table interfaces go in `sql/repo.rows.ts`, in the generated key order of `content-database.generated.ts`. Precedent: `su-s6a.md` "Done".
    - The type imports from `#src/features/webhooks/index` (`DeliveryEnvelopeStore`, `WebhookDeliveryRepoPort`, `WebhookSubscriptionRepoPort` …) are repointed to `../ports.js` (`DeliveryEnvelopeStorePort` etc. in `packages/integrations/src/webhooks/ports.ts:36`). **STOP if any member differs.**
    - Add `kysely` as an optional peer plus devDependency in `packages/integrations/package.json`, run `pnpm install`, and commit `pnpm-lock.yaml` (**LOCK**).
    - Add the export `./webhooks/sql`.
    - Tests first: write SQLite and PGlite characterization tests in Jini for lost-update and claim behaviour. Pattern: the Tovu tests `features/webhooks/__tests__/subscription-repo.lost-update.test.ts` and `platform/db/sqlite/__tests__/webhook-{delivery,subscription}-repo.sqlite.test.ts`. Those stay in Tovu as binding tests.
    - Mutation: drop the version predicate in the subscription update; the lost-update test must go red.
  - **S6b.T (Tovu, ~60 min).**
    - `platform/db/sqlite/webhook-repo.sqlite.ts` becomes the binding: subclasses that pass `WEBHOOK_TABLES`, the S6a pattern.
    - Repoint `apps/website/src/__tests__/lane-su-pins/p1-lock-keys.test.ts:12`, `features/webhooks/__tests__/subscription-repo.lost-update.test.ts:5`, `platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts:13`, `…/webhook-subscription-repo.sqlite.test.ts:10` and `platform/db/sqlite/webhook-repo.sqlite.ts:2` from `#src/platform/db/repos/webhook-repo` to `@jini-ai/integrations/webhooks/sql`.
    - Delete `repos/webhook-repo.ts`.
    - Green: those five, plus `server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts`.
  - Files left: the S lane is outside the area table (`platform/db`), so the table count does not change.

- **S7b — media SQL repos → `@jini-ai/cms/media/sql`** (precedent `./forms/sql`, `./comments/sql`). Depends on **X-media-1**, which moves `features/media/content-type-store.ts` and its `MediaContentTypeStorePort` into cms.
  - **S7b.J (Jini, ~120 min; split S7b.J1 / J2 at the class boundary if it runs long).**
    - Move `apps/website/src/platform/db/repos/media-repo.ts` (725 lines: `SqlMediaRepo` :166, `SqlAssetBlobRepo` :478, `SqlMediaContentTypeStore` :551, `SqlAssetRenditionRepo` :602, `SqlTransformDefinitionRepo` :670) verbatim to `packages/cms/src/media/sql/media-repo.ts`, with injected `tables`.
    - Retarget the type imports to `../versioned-repo.js`, `../ports.js` and the moved content-type store.
    - Three-dialect proof (SQLite, PGlite, Postgres when a server is present) per the ext2 cull.
    - Tests first, from `platform/db/repos/__tests__/media-repo.transform-conflict.test.ts` and `media-content-type-store.test.ts`: these two move to Jini.
    - Mutation: in `saveIfVersion` compare `!==` → `===`; the transform-conflict test must go red.
  - **S7b.T (Tovu, ~90 min).**
    - `platform/db/sqlite/media-repo.sqlite.ts` stays as the binding. Its 22 importers are unchanged.
    - Repoint these importers of `repos/media-repo.ts` to `@jini-ai/cms/media/sql`, then delete the file:
      - `__tests__/lane-su-pins/p1b-lock-keys-media-trash-members.test.ts:4`
      - `features/forms/__tests__/form-file-maintenance.test.ts:5`, `form-file-purge.test.ts:30`, `form-file-renditions.test.ts:11`
      - `features/media/__tests__/created-by.test.ts:5`, `library-persistence.test.ts:8`, `provenance.integration.test.ts:4`, `replacement.dialects.test.ts:4`, `repo.contract.test.ts:15`
      - `platform/db/sqlite/media-repo.sqlite.ts:9`
      - `server/inbound/admin-http/routes/media/__tests__/upload-concurrent.test.ts:9`
      - `scripts/forms-maintenance.ts:8`
    - (The two repo tests moved in J.)

### Lane XC — cross-package imports, option C (Jini only)

**Measured on Jini merge-12.** 36 non-core `@jini-ai/*` package pairs remain in source:

| kind | pairs |
|---|---|
| contract-package edges (`* → protocol`) | 9 |
| the `server` preset's 8 edges and the `sqlite`/`infra` shims' 5 | 13 |
| **the remaining "~16" (14 pairs)** | 14 |

The gate (Jini `scripts/check-no-cross-package.ts:74-84`, base pinned at `35c4961af` in the root `check:cross-package` script) only blocks **new** edges. These existing ones are debt, not failures. **Option C, as I read the reports** (Tovu `cloud-results/xpkg-r13b-r3b.md:42` keeps "23 allowed-optionC imports" under `user-management/src/admin/react/**`): kit imports into the admin React layer stay. Everything else gets one of three fixes:
- (a) move the pure contract into `@jini-ai/core`;
- (b) take the collaborator through the existing `required`/`_optional` args;
- (c) move the importing file into the target package.

**Codex: confirm this reading** against the 11-10 decision before dispatch.

| step | pair (sites) | recommended fix | est |
|---|---|---|---|
| XC-1 | `chat → agent-runtime`: `chat/src/server/durable-runs/recover.ts:3`; `react/features/chat-pane/{components/RuntimePickerSections.tsx:5-6, rules.ts:1, model-options.ts:1}` | (a) `model-selection`/`native-tool-policy` types → core contracts; `recover.ts` → (b) `RecoveryPorts.agents` (already named by the run-finalizer plan) | 100 |
| XC-2 | `chat → diagnostics` `core/user-text-redaction.ts:2`; `chat → db` `store/sqlite/index.ts:33` | (b) redactor injected; `store/sqlite` → (c) moves to `@jini-ai/db` beside `kernel/sqlite` | 80 |
| XC-3 | `agent-runtime → platform` `executables.ts:27`, `env.ts:10`, `claude-filesystem-policy.ts:4`; `agent-runtime → oauth` `providers/pkce.ts:33`; `agent-runtime → integrations` `model-discovery-adapters.ts:318,321,334` | (b) for toolchain/proxy-env/guarded-reader and pkce; (a) media-provider catalog type → core | 110 |
| XC-4 | `daemon → agent-runtime` `http/model-proxy.ts:121`, `http/xai.ts:141`, `http/research-tavily.adapter.ts:2`; `daemon → platform` `http/attachment-persistence.ts:3`, `http/host-tools.ts:22` | (b); `xai.ts` is due to move to a provider plugin (todos K per-CLI row), so do not touch it here beyond the import | 100 |
| XC-5 | `integrations → platform` `saved-requests/execute.ts:1`, `media-providers/dispatch/{outbound.ts:2,node.ts:4}`; `cli → sidecar` `local-daemon-discovery.ts:20` | (b) guarded fetch injected; `cli` → (a) discovery contract → core | 80 |
| XC-6 | `node-adapters → platform` `process.ts:17`, `fs.ts:11`, `agent-plugins.ts:7-8`; `node-adapters → agent-plugins` `agent-plugins.ts:9` | `node-adapters` is a node preset: ask in §K5 whether presets join `server` as allowed composers; until then no step | 0 |
| — | `user-management → ui-kit` (24 sites) | option C keep (no step) | — |

Each XC step must leave `pnpm check:cross-package` with fewer pairs and no new ones, and record before/after pair lists. XC steps are independent of all Tovu work, so they fill Jini slots in any batch.

### Lane RT — retire `@jini-ai/sqlite`, the `infra/src/db` shims and `agent-plugins/core/commerce-server.mjs` (Jini only)

- **RT-1, `@jini-ai/sqlite` (60 min).**
  - `packages/sqlite/src/index.ts` (20 lines) only re-exports `@jini-ai/{daemon,db,core,chat,registry}`. No package and no Tovu file imports `@jini-ai/sqlite`; every hit in both repos is a comment. Examples: `server/src/create-local-node-daemon.ts:7`; `daemon/src/http/{db-ops.ts:11-93, tool-catalog.ts:10-61}`; `daemon/src/routines/routine-store.ts:7-138`; `protocol/src/event-log.ts:6-93`; `chat/src/{core/index.ts:29, react/index.ts:310, react/components/ConversationList.tsx:9}`; in Tovu, `apps/website/src/server/__tests__/assistant-chats-routes.test.ts:16,213`.
  - Delete `packages/sqlite/` and `api-baseline/jini-ai__sqlite.json`.
  - Reword those comments to name the real owner, keeping the why: `@jini-ai/db/sqlite` for inspect/integrity, `@jini-ai/chat/store/sqlite` for chat history, `@jini-ai/daemon/store/event-log/sqlite` for the event log.
  - Update `CAPABILITIES.md`, run `pnpm install` (the lockfile drops the workspace entry; **LOCK**) and add a changeset (major for the removed package, per release policy).
  - Mutation: none. Gates: `pnpm guard`, `typecheck`, `api:check`.
- **RT-2, `@jini-ai/infra/db/{core,driver,sqlite}` (45 min).**
  - The three `index.ts` shims ("Deprecated … Removed after one release") are imported by nothing outside `packages/infra`.
  - `packages/db/src/__tests__/core/index.test.ts:10` and `sqlite/index.test.ts:20` describe the barrels by their old names; rename the describe strings only.
  - Delete `packages/infra/src/db/` and the exports `./db/core` and `./db/sqlite`; `./events/outbox` stays, because Tovu `server/runtime/composition/__tests__/form-delivery-vertical-slice.integration.test.ts:9` imports it.
  - Update `CAPABILITIES.md:180-181`, the api-baseline and the changeset. This removes the `infra → db` pair from XC.
- **RT-3, `commerce-server.mjs` (45 min).**
  - Delete `packages/agent-plugins/core/commerce-server.{mjs,d.ts}`, the export `./commerce/server` (`package.json:266-268`), the assertions in `commerce/__tests__/bundled-package.test.mjs:13,20`, the three `scripts/injection-debt.json:4-6` rows and the `api-baseline/jini-ai__agent-plugins.json:193` entry. Reword `scripts/check-package-layers.ts:131`.
  - Tovu imports commerce straight from `@jini-ai/commerce` (`server/runtime/composition/commerce.ts:13`), so nothing breaks.
  - Drop the `@jini-ai/commerce` optional peer if nothing else uses it. That was the STOP in Jini `cloud-results/wave1-xpkg-G-STALE-DEPS.md:24`; the owner's retire order resolves it.

### Lane SEC — Tovu security → Jini `admin/security` (swap, not move)

- Tovu `apps/admin/src/features/security` has 39 files (8,514 LOC); 4 are movable today. Jini `packages/admin/src/security` already has 22 files with `./security`, `/react`, `/adapters/http`, `/adapters/memory` and `/conformance`. Tovu imports none of them; `rg '@jini-ai/admin/security' apps` finds nothing.
- The triage instruction applies: port the Tovu-only behaviour into Jini, then swap.

| step | repo | content | est | depends |
|---|---|---|---|---|
| SEC-0 | Tovu (read-only report) | parity table: each Tovu screen behaviour (owner MFA, passkeys, recovery codes, sessions, API keys, audit, secret warnings …) → present / missing / different in Jini `admin/security`, with file:line on both sides | 90 | none (tonight) |
| SEC-1…n | Jini | one step per missing behaviour group, tests first (Jini conformance suite) | ≤120 each | SEC-0 |
| SEC-T1 | Tovu | mount Jini `SecurityScreen` through `@jini-ai/admin/security/react` with the HTTP adapter at the single `panels.tsx` mount; delete the 39 files; repoint 7 importers in `features/deployment` (8 tests) and `features/settings` | 120 | SEC-1…n, A-shell-lib-3 |

### Lane A — admin screens, shell, transport, roles

- Generated ready steps (`A-*`): 24 steps, 207 files.
- **All A steps depend on §K2** for anything beyond those files. 218 admin files import `@jini-ai/ui` directly. In Jini that is an `admin → ui` edge, which XP3 refuses. Under the 11-10 inject-kit decision these screens must take the kit as props or context, which is a per-screen conversion, not a verbatim move.
- The ready steps are the screen files that already use only `@jini-ai/admin` and `@jini-ai/core`.
- Admin roles: 19 files, 1 ready (`A-adm-roles-1`). The rest wait on `lib/admin-http` (transport) and §K2.

### Lane DT — desktop

- `DT-desktop-1`: 12 generic Electron files → `@jini-ai/desktop-host/shell/*`.
- 3 remaining files are blocked by product IPC types and 2 by new edges.
- The other 235 desktop files are packaging, site management and the owner store. They stay.

### Lane R — rendering and routes (470 files): BLOCKED on an owner decision (§K1)

Only 30 route-side files are movable now (in `R-public-http-1,2` and `R-admin-http-1`). The other 440 import `RouteDeps` and the shared admin failure/guard helpers. No R steps beyond the three generated ones until §K1 is answered.

### Lane RN — remove Tovu from Jini totally (owner 11-20 ~12:50)

**Sequencing.** `codex/tv-seed-upgrade` (`2ddce9e82`, bundled `tovu/<id>` → `jini/<id>` upgrade) and its follow-up `748c032db` are in merge-12. RN runs **after merge-12 lands on both integ lines**, as the last slot of a night, so in-flight P9 sheets are not rebased onto renamed names mid-batch.

**Inventory, Jini merge-12** (`git grep -iI tovu -- packages scripts examples`):
- 547 lines in 197 files: 176 test files, 5 md, 6 json, 6 non-src `.mjs`/`.ts`, and only **4 source files**.
- The source files are `packages/agent-plugins/src/core/identity-namespace.ts:5-95` (the `extensions.tovu` legacy reader and the `tovuAuthMode/tovuDefaultTools/tovuTokenAuth/tovuRenamedTools` keys), `packages/plugins/src/host/plugin-format.ts:3,6` (`tovu.plugin.json`, `@tovu/sdk` aliases), `scripts/lib/source-neutrality.ts:22` (the N1 rule itself; keep it) and `scripts/lib/publish-hygiene-self-test.ts:59`.
- Bundles: `packages/agent-plugins/{vercel/object-stores/vercel-blob.mjs, s3-compatible/targets/s3-compatible.mjs, s3-compatible/jini-deploy-targets.json, calendly/mcp.json}`.
- The `plugins/src/host/plugin-format.ts` and `identity-namespace.ts` entries in `scripts/source-neutrality-allowlist.json` go away.

| step | repo | content | breaks (to P9-BREAKS "RN" rows) | est |
|---|---|---|---|---|
| RN-J1 | Jini | drop the `extensions.tovu` read path and legacy `tovu*` keys in `identity-namespace.ts`, the `tovu.plugin.json` and `@tovu/sdk` aliases in `plugin-format.ts`, and both allowlist rows; tests first: a manifest with only `extensions.tovu` is now read as having no extension | installed plugins whose manifest has only `extensions.tovu`; plugins shipped as `tovu.plugin.json`; plugin code importing `@tovu/sdk` through the alias | 100 |
| RN-J2 | Jini | rename the 4 bundle files' Tovu literals; test hits in `packages/agent-plugins/**` (64 lines in `src`, 22 in `s3-compatible`, 15 in `google-workspace`, 8 in `render`) | deployed workers or Cloudflare proof paths named `tovu` | 110 |
| RN-J3 | Jini | test/fixture literals (hit lines) in `cms` (56), `db` (44: `_tovu_migrations`, `_tovu_transfer`, `tovu_*` schemas), `plugins` (39), `provider-plugins` (30) | persisted DB names: existing SQLite sites' `tovu_migrations` table and PG `tovu` schema are read by Tovu, not Jini; Jini test names only | 110 |
| RN-J4 | Jini | the rest (hit lines): `chat` (28), `admin` (24), `daemon` (12), `ui` (10), `integrations`, `http-kit`, `agent-runtime`, `desktop-host`, `commerce`, … and `examples/*` comments (`examples/reference-web/src/McpUiOfficialSwapLab.tsx:10-47`, `examples/nlweb-demo/src/items.ts:4`) | none at runtime | 100 |
| RN-T1 | Tovu | rename what Tovu still produces that Jini stops reading: `apps/website/src/features/plugin-runtime/samples/testimonials-faq/tovu.plugin.json`, `development/e2e/fixtures/journeys/plugins/faq-clash/tovu.plugin.json`, `development/e2e/fixtures/plugins/qa-fake-hello/{1.0.0,1.0.1}/tovu.plugin.json` → `jini.plugin.json`; Tovu manifests with `extensions.tovu` → `extensions.jini`; `apps/website/src/cli/commands/serve.ts:54` comment | the sample and e2e fixtures stop loading until renamed (this step) | 90 |

`@tovu/sdk` **stays** in Tovu (owner 11-20, rjk T3 dropped). Only Jini's alias for it goes.

**Moved code is renamed at move time.** Every P9 move step does its own RN work (the W rows), so RN never chases moved code. `plans/P9-BREAKS.md` has the 156 literal rows the move steps will create, for example `data-tovu-slot`, `data-tovu-entry-list`, `TOVU_REQUEST_FACTS`, `tovu-theme-preview-*`. The `data-tovu-*` theme markers are the largest user-visible break: existing site themes that use them stop matching until a later theme migration rewrites them. Each move step records its rows; the fix is a later job, per the owner.

### Lane K — decisions that unblock the 1,938 (owner; not for implementers)

**K1. Routes (440 files).**
- `server/routes/types.ts` (`RouteDeps`, 1,490 lines) types every admin/public route. The shared helpers `server/inbound/shared/{admin-failure.ts (131 lines, imports @tovu/contracts copy + @jini-ai/diagnostics + @jini-ai/db), route-guards.ts (36), body-size-limit.ts (55)}` are imported by 235, 196 and 10 route files.
- Moving routes verbatim into a Jini package needs a per-route deps type there instead of `RouteDeps`. That is the re-wiring the owner dropped on 11-20 ~8:25 PM. The helpers also need a home that is not a new cross-package edge.
- **Recommendation:** keep `RouteDeps` in Tovu. Each moved route declares the `Pick<…>` it uses in Jini, a type-only change at its signature. `route-guards` and `body-size-limit` go to the package that owns the routes (cms) under `*/express`. `admin-failure` takes its product copy and tracker through the existing `AdminFailurePorts` argument (`admin-failure.ts:32`).
- **Question:** "May route handlers move to Jini with their own narrowed deps type instead of `RouteDeps`? (yes = R lane can start; no = the 470 route files stay in Tovu as composition.)"

**K2. Admin UI kit (218 files import `@jini-ai/ui`; 59 import `@jini-ai/chat`).**
- **Recommendation:** convert screen by screen onto `@jini-ai/admin/react/kit`, with the kit injected by the host, in the shape the J4 report set (`cloud-results/admin-j4-inject.md`). This is not a verbatim move. Each step converts one screen and is tests-first.
- **Question:** "Confirm admin screens may change their UI imports to the injected kit while moving (a non-verbatim edit limited to import and kit lookup)."

**K3. Product copy (`@tovu/contracts/secret-redaction` 23 files, `credential-copy` 11, `assistant-subagents-policy` 4; `apps/admin/src/lib/i18n-common.ts` 47).**
- **Recommendation:** moved code receives the copy through arguments it already takes, or through existing `_optional` slots. Where none exists, the file stays in Tovu.
- **Question:** none if the "no new port" rule allows a new *field* on an existing args object. Please confirm that.

**K4. Domain placement edges** (`cms → user-management` 87, `devops → cms` 28, `devops → platform` 17, `cms → plugins` 14, `core → cms` 13 …).
- **Question:** "For a host feature that spans two Jini domains, may it import the other domain (an allowed edge), or must it split at the seam?"
- **Recommendation:** split at the seam. The lower domain gets the contract in `core`.

**K5.** Are `node-adapters` and `server` (node presets) allowed composers like `server`? This settles XC-6 and 8 `server` pairs.

---

## 3. Parallel batches for tonight (4–6 implementers)

**How batches are built.**
- Rows come from `plans/P9-data/tools/plan.mjs`: a J step runs after the J of its deps, and a T step after its own J.
- At most 2 J steps share a Jini package in one batch, and the `package.json` export hunks are merged by union.
- T steps in one batch touch disjoint Tovu files.
- Hand lanes (SH, RT, XC, S, SEC-0) are slotted where they share no files.
- The machine batch numbers in `INDEX-EXTRACTION.md` go up to 37. Tonight takes N1–N5, about 9 h at 6-wide. Stop at N4 if fewer implementers run.

| night batch | steps (≤6) | max est |
|---|---|---|
| **N1** | SH-1 (Tovu), SH-2 (Tovu), C-contracts-core-1.J, C-contracts-core-2.J, C-platform-html-1.J, D-site-export-1.J (+ C-presentation-1.J, 1 file) | 110 min |
| **N2** | C-contracts-core-1.T, C-contracts-core-3.J, C-contracts-headless-1.J, D-site-export-1.T (+ C-presentation-1.T, P-publish-content-ui-1.T after its J), P-publish-content-ui-1.J, RT-1 (Jini) | 111 min |
| **N3** | C-contracts-core-2.T, C-contracts-core-4.J, C-contracts-core-5.J, C-contracts-headless-1.T, T-theme-1.J, RT-2 + RT-3 (Jini, one implementer) | 117 min |
| **N4** | C-contracts-core-3.T, C-contracts-core-6.J, C-contracts-core-7.J, T-post-1.J, T-theme-1.T, XC-1 (Jini) | 102 min |
| **N5** | C-contracts-core-4.T, C-contracts-core-7.T, C-platform-routing-1.J, P-publish-trust-1.J, T-newsletter-1.J, SEC-0 (read-only) | 90 min |
| N6 (if time) | C-contracts-core-5.T, T-theme-2.J, P-publish-content-1.J, D-site-backup-1.J, P-publish-trust-1.T, XC-2 | 117 min |

**Batch notes.**
- **SH-1 and SH-2 overlap with each other on one file only**, `apps/website/src/server/routes/types.ts`, at different import lines. Run SH-2 after SH-1 is pushed (`git pull --rebase` merges them). SH-2 overlaps C-contracts-core-1/3/4/7 T files (`database/tool-registrations.ts`, `recovery/…`, `routes/types.ts`), so it must land in N1, before any C T step. I checked overlaps with a script over the sheets.
- **RN** runs only after merge-12 has landed on both integ lines and N-batches are committed: RN-J1 → RN-T1 → RN-J2…J4, one slot each.
- **S6b.J** may replace RT-2/RT-3 in N2 if the lockfile step is cleared. **S7b** waits for X-media-1, about N6–N8 per the machine batches.

**Files left after tonight (if N1–N5 finish).**

| | files |
|---|---|
| start | 2,509 |
| N1: SH-1 + SH-2 | −21 → 2,488 |
| N2: C-contracts-core-1.T, D-site-export-1.T, P-publish-content-ui-1.T, C-presentation-1.T | −19 → 2,469 |
| N3: C-contracts-core-2.T, C-contracts-headless-1.T | −14 → 2,455 |
| N4: C-contracts-core-3.T, T-theme-1.T | −21 → 2,434 |
| N5: C-contracts-core-4.T, C-contracts-core-7.T | −15 → **2,419** |
| N6 | about −28 more |

The point of the night is the dependency base: C unlocks T, P, D, U and X. Per-area counts move from N6 on:
- themes: 111 → 101 after T-theme-1.T (N4), → 93 after T-theme-2.T
- post: 110 → 102 after T-post-1.T
- newsletter: 25 → 23 after T-newsletter-1.T

---

## 4. What stays in Tovu (summary; full list in `plans/P9-data/stays-in-tovu.md`, 372 files)

| what | files | why |
|---|---|---|
| `apps/desktop/src` | 235 | packaging, site management, owner store, `tovu-server` |
| admin product screens | 122 | `ai-assistant`, `dashboard`, `playground`, `admin-ui`, `workspace`, `sites`, `voice-input` |
| admin composition and look | — | `App*`, `nav.ts`, `panels*`, `admin-themes/`, `styles/` |
| website product features | 12 | `sites`, `site-guide`, `site-evidence`, `site-glue`, `admin-parity` |
| product-named files | — | `features/publish-content/tovu-publish-ports.ts`, `cli/` and others |
| composition and assistant (not counted above) | — | `server/runtime/**`, `assistant/**`, `platform/db` schema and migrations, `platform/site-dir` |

---

## 5. Codex verification checklist

1. Re-run the three tools on the bases and diff `areas-and-steps.json`. Numbers must match, or the drift must be explained.
2. Sample 20 importer lines from `plans/P9-steps/` and 10 from `SH-shells-1.md` with `sed -n '<line>p'`.
3. Confirm the §0 rule and the KEEP list match the owner's intent: product screens, desktop and site management stay.
4. Confirm the option C reading in lane XC, and that the S6b ports in `packages/integrations/src/webhooks/ports.ts` match Tovu's.
5. Confirm the RN inventory with `git grep -iI tovu -- packages scripts examples` on Jini merge-12.
6. Check for any area missing from AREAS in `plan.mjs` (e.g. `apps/site-chat`, which is visitor chat, a product item under the AG-UI plan; not measured here).

## 6. PARTIAL / not done in this run

- **Blocked files.** Their per-file injection steps are not written; they wait for §K answers. Each file's blocker is listed in `plans/P9-data/blocked-files.md`.
- **SEC-1…n.** Defined only by the SEC-0 parity report they depend on.
- **`apps/site-chat`** (26 files). Not measured; the visitor chat is planned under the AG-UI lane (todos group 2).
- **i18n moves.** Flagged per step where a moved file imports a locale module. Key-level lists are left to each step: copy the keys the file reads, same text.
