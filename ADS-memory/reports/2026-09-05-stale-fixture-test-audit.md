# Stale-Fixture Test Audit — 2026-09-05

Status: COMPLETE

Scope: find tests that seed a pristine identity/DB fixture and therefore never exercise the
state that actually ships (the `sites/tovu-com/content.db` vintage), read-only audit, no fixes.

Files examined directly (read in full or in the relevant section): 15. Files ruled out by a
targeted grep against their exact assertions (not read in full): ~9. Files counted only by
grep, not individually reviewed: the ~185/72 generic `createRouteDeps()`/`createApp()` callers
in §1 — see that section's caveat.

## 0. Ground truth used to calibrate (MEASURED)

- `sites/tovu-com/content.db`'s `admin-builtin-policy` (queried read-only against a scratch
  copy, `sqlite3 -readonly`, never against the live file) holds 40 permissions and is
  confirmed missing exactly `theme.edit`, `workspace.manage`, `admin.assistant.manage` — the
  dispatch prompt's claim was independently reproduced, not just trusted. `pages.edit_html` IS
  present, confirming the `db83fdaf` fix already reconciled onto the live DB (the dev server
  another session owns must have booted since that fix landed).
- `BUILTIN_ADMIN_PERMISSIONS` in `Jini/packages/cms/src/identity/seed.ts` confirms `theme.edit`,
  `workspace.manage`, `admin.assistant.manage` carry NO migration-fan-out comment (unlike
  `admin.menus.*`/`admin.integrations.manage`/`settings.user.read`, which each have an explicit
  `migrateDeprecatedPermissionGrants` clause noted inline) — so these three are genuinely
  orphaned for any workspace `seedIdentity` seeded before they were added, and nothing in the
  current codebase reconciles `workspace.manage` or `admin.assistant.manage` onto such a
  workspace (only `pages.edit_html` has a registered `applyBuiltinRoleGrants` backfill, via
  `features/pages/permissions.ts`). This is a live, undecided gap — not something I touched.

## The anchor case, confirmed already fixed

`apps/website/src/features/pages/__tests__/edit-html-permission.test.ts` — read in full
(MEASURED). It is **no longer broken**: `git log` shows the fix landed at `db83fdaf`
(`fix(identity): materialize pages.edit_html for admin in already-seeded workspaces`), preceded
by two RED commits (`2875a272`, `501af6c1`) that are visible right above it on this branch. The
file now runs `buildChain("fresh" | "pre-theme-edit")` and asserts `admin` holds
`pages.edit_html` in BOTH vintages, with an explicit `dropAdminThemeEdit()` helper that rewinds
a freshly-seeded workspace to the exact shape `content.db` is in. Its "this test cover[s] the
case that actually ships" comment (line 129) is TRUE as of this fix. I used this file's shape —
seed, then deliberately rewind to the pre-fix vintage, then assert — as the template for probing
its two untouched siblings below (§2).

## 1. Seeding helpers and call-site counts (MEASURED via grep)

Real seeding helpers, in order of directness:

1. `seedIdentity` (`@jini-ai/cms/identity`, impl in `Jini/packages/cms/src/identity/seed.ts`) —
   the root. Idempotent via `findByUsername`: a no-op once the owner username exists in that
   workspace (line 233-236 of that file). This is the "early-return-once-seeded" primitive
   everything else in this report traces back to.
2. `migrateDeprecatedPermissionGrants` (`permission-migrations.ts`) — additive fan-out, anchored
   on an already-registered `{from, to}` pair; matches nothing if the `from` permission is absent
   from a policy.
3. `applyBuiltinRoleGrants` (`apps/website/src/features/identity/builtin-role-grants.ts`) —
   additive backfill keyed on a registered `{role, permission}` pair (module-singleton registry);
   currently has exactly ONE registration in this repo (`pages.edit_html` → `admin`, in
   `features/pages/permissions.ts`).
4. `createInMemoryIdentityRouteDeps` / `createSqliteIdentityRouteDeps`
   (`features/identity/wiring.ts`) — the composition-root wrapper that runs all three of the
   above in sequence and is what `createRouteDeps()`/`createApp()` use under the hood.

Call-site counts (`grep -rl`, test files only, `apps/website/src`):

| Helper | Test files |
|---|---|
| `seedIdentity(` direct call | 6 |
| `createInMemoryIdentityRouteDeps(` / `createSqliteIdentityRouteDeps(` direct call | 2 |
| `createRouteDeps(` (wraps the above) | 185 |
| `createApp(` (wraps `createRouteDeps()`) | 72 |

The 185/72 figures are grep counts only, not individually reviewed — reviewing every caller was
out of scope for the time available and, per the audit's own framing, seeding fresh is only a
PROBLEM when a specific assertion diverges fresh-vs-aged. All 185+72 seed a fresh, ephemeral,
in-memory identity graph every test run (never touching `content.db`), so all of them are
candidates in principle; §2 below is the targeted subset I actually checked for a real
divergence, selected by grepping every test file for the three permission strings confirmed
orphaned in §0, plus every direct `seedIdentity(`/`createInMemoryIdentityRouteDeps(` caller (the
8 files not wrapped in the generic 185/72).

## 2. Tests whose assertions provably diverge fresh vs. aged (the money question)

### FINDING A — `pages-update-html-auth.test.ts`'s admin-allow case never exercises the vintage that ships (MEASURED)

`apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts`'s `realIdentityHarness()`
(lines 220-249) calls `seedIdentity` + `migrateDeprecatedPermissionGrants` only — it does **not**
call `applyBuiltinRoleGrants`. The one test that exercises the admin-allow path through it
(`"a real, seeded 'admin' principal still authors page HTML through this route"`, line 337) only
ever runs against a freshly-seeded workspace, which still has `theme.edit` on `admin-builtin-policy`
so the fan-out alone grants `pages.edit_html`. It never constructs the pre-`theme.edit` vintage
`content.db` actually is.

Verified empirically (scratch script, not a committed test, deleted after running — see
`apps/website/verify-pages-update-html-vintage-gap.scratch.mjs`, run via
`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx`, then removed): replicating
`realIdentityHarness()`'s exact two steps (`seedIdentity` + `migrateDeprecatedPermissionGrants`,
no `applyBuiltinRoleGrants`) and then rewinding to the pre-`theme.edit` vintage (`dropAdminThemeEdit`'s
exact technique) yields:
```
RESULT: {"allowed":false,"reason":"no_grant"}
```
So if `applyBuiltinRoleGrants` were ever reverted or its registration in `features/pages/permissions.ts`
dropped, this file's admin-allow assertion for the HTTP-route sink would keep passing GREEN against
its own fresh fixture while `admin` silently lost `pages.edit_html` on every already-deployed
workspace at that exact sink — the same class of regression `edit-html-permission.test.ts`
(§Anchor) was fixed to catch at the OTHER sink. The file's own docstring (lines 210-216) names
`seedIdentity`'s early-return and the fan-out's anchor requirement as the reasons a stubbed
`authorize` isn't enough, but never mentions `applyBuiltinRoleGrants` — it doesn't know the third
mechanism its sibling relies on exists.

This is NOT a comment making a false claim (the file doesn't claim vintage coverage it lacks) —
it's a silent gap: the file mirrors the "why this needs the real identity chain" reasoning from
`edit-html-permission.test.ts` but only ports two of the three steps.

### FINDING B — `wiring.test.ts`'s own "fails if the backfill is dropped" claim is FALSE (MEASURED)

`apps/website/src/features/identity/__tests__/wiring.test.ts`, test at line 259
(`"createInMemoryIdentityRouteDeps: identityReady grants pages.edit_html to the built-in admin
policy and to no other built-in policy (SPEC-047 REQ-9)"`). Its own comment directly above (lines
256-257) states: *"This test runs `identityReady` over a workspace seeded by that same
`seedIdentity` and asserts the built-in policies directly, so it fails if the backfill
[`applyBuiltinRoleGrants`] is ever dropped from the boot chain."*

That claim is false. `createInMemoryIdentityRouteDeps` always seeds a FRESH workspace (there is
no vintage parameter), and a fresh workspace's `admin-builtin-policy` already holds `theme.edit`,
so the `migrateDeprecatedPermissionGrants` fan-out — already exercised by the sibling test
immediately above it (line 186) — grants `pages.edit_html` to `admin-builtin-policy` on its own,
with no help from `applyBuiltinRoleGrants` at all.

Verified empirically (scratch script, same run/delete discipline as Finding A — see
`apps/website/verify-wiring-test-confound2.scratch.mjs`): importing the same registration
side-effect (`#src/features/pages/index`) the real test file imports, then running `seedIdentity`
+ `migrateDeprecatedPermissionGrants` ONLY (skipping `applyBuiltinRoleGrants` entirely, simulating
it being dropped from `wiring.ts`'s `identityReady` chain) against a fresh, undropped workspace:
```
admin-builtin-policy includes pages.edit_html (fan-out only, registered pair, no applyBuiltinRoleGrants): true
```
So the test at line 259 would still pass GREEN with `applyBuiltinRoleGrants` deleted from
`wiring.ts` entirely — the exact regression its own comment says it exists to catch. The test
that WOULD catch that regression is the one at `edit-html-permission.test.ts`'s "pre-theme-edit"
vintage (§Anchor), which `wiring.test.ts` does not replicate.

This is the same shape as the anchor case's original bug (a false "this is what makes the test
mean something" comment, caused by fresh-only seeding) recurring in a file written to explain
and guard exactly that bug — and it is worse than a pre-existing miss: `git show --stat db83fdaf`
(MEASURED) shows the `db83fdaf` fix commit itself ADDED these 80 lines to `wiring.test.ts`,
alongside `builtin-role-grants.ts`/`.test.ts`, `features/pages/permissions.ts`, and the
`edit-html-permission.test.ts` edits. The confounded test at line 259 is not a stale leftover —
it is new code from the same commit that fixed the anchor bug, asserting a guarantee it does not
actually provide. `pages-update-html-auth.test.ts` (Finding A) was NOT touched by that commit at
all — confirmed absent from its file list — which is consistent with Finding A being a true gap
the fix commit never looked at, rather than a regression it introduced.

### Files checked and ruled out (grep-targeted, not full stale-fixture risk)

Every test file referencing `theme.edit`, `workspace.manage`, or `admin.assistant.manage` was
checked for whether it asserts BUILT-IN role possession (the vintage-sensitive claim) or just a
route/tool's declared permission requirement (vintage-independent):

- `tool-registrations.themes.test.ts`, `tool-registrations.workspace.test.ts` — assert only that
  a tool's catalog entry / `authorize()` call names the right permission string, against a
  hand-written fake `authorize`. No role, no seeding. Not a stale-fixture risk.
- `assistant-byok-routes.test.ts`, `admin-assistant-settings-routes.test.ts`,
  `admin-assistant-execution-routes.test.ts`, `workspace-routes.test.ts` — all use a
  `loginWithPermissions(deps, baseUrl, [...])` helper that mints a synthetic principal with a
  **direct, custom, non-built-in policy** holding exactly the permission under test — never via
  the `admin` role. These certify "the route gates on permission X", not "the admin role holds
  permission X in a real workspace", so fresh-vs-aged does not apply to them. Confirmed by
  reading `loginWithPermissions`'s body in full.
- `tool-registrations.identity-authorization.test.ts`,
  `tool-registrations.identity-contracts.test.ts` — real `seedIdentity()`, but every permission
  set under test is granted directly via a `grant(repos, principalId, permissions)` helper
  (bypassing role membership), and the one built-in-role-sensitive assertion (INV-07: a
  non-owner cannot assign the built-in `owner` role) is vintage-independent — the `owner` policy
  is the `*` wildcard in every vintage, seed-list evolution never touches it.
- `api-key-routes.test.ts` — resolves `admin-builtin-policy`'s id by name but only to attach an
  API key to it; does not assert on `theme.edit`/`workspace.manage`/`admin.assistant.manage`.
- `database-migration-reconciliation-boot.integration.test.ts`,
  `serve-command.integration.test.ts` — matched the `seedIdentity(` grep only via a code COMMENT
  containing the literal text `seedIdentity()`, not an actual call; both test unrelated concerns
  (concurrent-boot races, a missing-owner restart path). Not stale-fixture candidates.
- `reset-admin-password-self-verified.test.ts` — uses `createInMemoryIdentityRouteDeps` but
  asserts nothing about `theme.edit`/`workspace.manage`/`admin.assistant.manage`/`pages.edit_html`.

## 3. Comments claiming to cover the shipping/deployed case

Grepped the full `apps/website/src` tree (case-insensitive) for the claim shape ("covers the
case that actually ships", "actually ships", "what actually ships", "shipping case"). Two real
hits outside unrelated theme-tool-description strings:

- `features/pages/__tests__/edit-html-permission.test.ts:129` — "Running it here is what makes
  this test cover the case that actually ships." **TRUE** (§Anchor; verified both vintages are
  asserted and both pass).
- `features/pages/permissions.ts:62` — descriptive prose about the bug history ("the only
  installation that actually ships, `pages.edit_html` reached NOBODY..."), not a test-coverage
  claim about a specific test file. Not evaluated as a claim to verify.

Neither `pages-update-html-auth.test.ts` nor `wiring.test.ts` (Findings A and B) makes this
literal claim — their comments describe the mechanism correctly (early-return, fan-out anchor
requirement) but then either omit `applyBuiltinRoleGrants` from the list of mechanisms in play
(Finding A) or overstate what their own assertion structurally proves (Finding B, "fails if the
backfill is ever dropped"). Grepping for the *exact* claim phrase alone would have missed both —
the money question required reading each candidate's seeding steps against the three orphaned
permission strings from §0, not just grepping for confident-sounding prose.

## 4. Other early-return-once-seeded siblings

Same shape as `seedIdentity`'s owner-username check — MEASURED (read each file's own header
comment) but not empirically tested against an aged fixture, so lower confidence than §2:

- `features/theme/seed-site-themes.ts` — `seedSiteThemes()` copies the stock themes tree into
  `<site>/themes/` exactly once; "Presence of `<site>/themes/` — not its contents — is the
  'already seeded' signal" (its own words). A theme added to the stock bundle after a site's
  `themes/` directory already exists will never reach that site.
- `platform/db/sqlite/hydrate-content-db-from-seed.ts` — `existsSync(dbPath)` is "the ONLY
  check" (its own words) before copying the seed DB once. Same shape.
- `features/media/hydrate-blob-store-from-seed.ts` — explicitly modeled on the same two files
  ("shape `seedSiteThemes()` and `hydrateContentDbFromSeed()` already use"); per-file existence
  check, so a blob added to the seed bundle after a site's `uploads/` already has that path never
  arrives either.
- `features/agent-plugins/seed-bundled.ts` — "idempotent twice over": a digest check plus a
  decision-record-if-absent check. Same generational-drift shape, one more layer removed.

None of these were traced to a specific failing/misleading TEST the way `seedIdentity`'s was —
that would require a second full audit pass scoped to each one (theme/content/media/plugin
seeding, not identity). I did not find a test with a false "covers what ships" claim for any of
these four. Flagging them here because the audit asked specifically for siblings of
`seedIdentity`'s shape, and all four are structurally identical: a presence/existence check that
can never re-fire once true, guarding a bundle that keeps growing after the check first passes.
This is INFERRED risk (the mechanism is proven; a concrete divergence in a live fixture was not
demonstrated for these four the way it was for identity permissions in §0).

## 5. Ranked recommendations (not implemented)

Ranked by (a) how cheap the fix is and (b) how much real risk it closes, cheapest/highest-value
first. All are test-only changes mirroring `edit-html-permission.test.ts`'s already-proven
pattern (seed, rewind to the pre-fix vintage with a `dropAdminThemeEdit`-style helper, assert).
None of these were implemented — this is a report.

1. **Fix `wiring.test.ts` line 259's test** (cheapest — the fix pattern already exists 60 lines
   above it in the same file's sibling module, `edit-html-permission.test.ts`). Add a
   pre-`theme.edit` rewind before the `identityReady` await, so the assertion can no longer be
   satisfied by the fan-out alone. This is the highest-value item: it is a false safety net for
   the exact regression class the `db83fdaf` commit was written to prevent, in a test the same
   commit added.
2. **Add a pre-`theme.edit`-vintage case to `pages-update-html-auth.test.ts`'s
   `realIdentityHarness`** — call `applyBuiltinRoleGrants` (or add the same
   `dropAdminThemeEdit`-then-assert shape used in `edit-html-permission.test.ts`) so the HTTP
   route sink is proven for the vintage that ships, not just the tool-call sink. Slightly more
   work than #1 (needs the `applyBuiltinRoleGrants` import and a role parameter analogous to
   `Vintage`), same payoff class.
3. **Decide whether to backfill `theme.edit`, `workspace.manage`, `admin.assistant.manage`
   for already-seeded workspaces** — this is the underlying, still-open product decision (not a
   test gap); explicitly Leona's call per the dispatch brief, not something I attempted or
   recommend a specific answer to. Noting it here only because §0 reconfirmed it's real and
   unaddressed as of this audit.
4. **Lowest priority / speculative**: consider whether `seed-site-themes.ts`,
   `hydrate-content-db-from-seed.ts`, `hydrate-blob-store-from-seed.ts`, and
   `seed-bundled.ts` need an analogous "aged fixture" test at all — I found no evidence of an
   actual divergence for any of them (§4), only a structurally identical mechanism. Recommend
   this only if a real symptom (like the `content.db` permission gap) turns up for one of them;
   speculative test-writing against a theoretical gap is exactly what this audit's evidence rules
   ask not to do.

## What in the dispatch prompt turned out to be inaccurate

Nothing in the prompt's factual claims was wrong. One implicit framing was worth correcting for
the record: the prompt describes `wiring.test.ts` only as background/not a target; in fact its
newest test (added by the SAME commit that fixed the anchor case) reproduces the anchor case's
exact defect shape (Finding B) and was the report's second-most important finding.
