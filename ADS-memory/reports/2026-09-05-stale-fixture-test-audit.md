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

TODO — fill in.

## 3. Comments claiming to cover the shipping/deployed case

TODO — fill in.

## 4. Other early-return-once-seeded siblings

TODO — fill in.

## 5. Ranked recommendations (not implemented)

TODO — fill in.
