id: DL-admin-analytics-1   (template T-DELETE, moved-bodies form; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton by make-sheet.py)
feature: admin/features/analytics   (W1 #29, level 3)
status: BLOCKED (owner question Q-WH below). Execute ONLY after the owner answers "inline". If the answer is "keep the convention", this feature leaves the move plan as STAY (nothing goes to Jini) and this sheet is not run.
kind: DELETE as labelled, but NOT a Jini move: KIND-SUSPECT fired (real bodies: defaultAnalyticsPort, createFakeAnalyticsPort). Nothing is generic and nothing goes to Jini (the port is one Tovu `lib/api` call). The survey note ("inline", "move fake to tests") is a Tovu-internal fold; re-kinded: DELETE with moved_bodies (Tovu-only), no Jini commit.

Q-WH (owner, shared with W1 #34 database, and partly #30 members / #32 users): `development/docs/architecture/wired-hooks-convention.md:24-28` mandates the three-file split `<feature>-port.hooks.ts` + `<feature>-dependencies.hooks.ts` ("every port gets a fake, ship both in the same commit, always") and lines 162-175 propose a lint rule whose `ignores` is exactly `*-dependencies.hooks.{ts,tsx}`. The survey's "inline" contradicts that convention. Which wins for features where nothing moves to Jini? Recommendation: keep the convention (mark analytics + database port files STAY, drop them from the move plan); inlining buys no Jini code and breaks the documented lint seam.

tovu_file: apps/admin/src/features/analytics/hooks/analytics-port.hooks.ts | blob d8ad15f03f2f4af62e3ef84d789df6aa4cb6cb42
non_reexport_statements: 1 (interface AnalyticsPort) -> moved_bodies row M1
why_dead: pass-through: a port declaration with one consumer file; folded into use-analytics.hooks.ts (survey "inline")
tovu_file_after: delete
tovu_file: apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts | blob 1e5b167286dd11e148411518d9fe23d0ae5b3aee
non_reexport_statements: 3 (defaultAnalyticsPort, FakeAnalyticsPortOptions, createFakeAnalyticsPort) -> moved_bodies M2, M3
why_dead: pass-through: the binding has one consumer (use-analytics.hooks.ts:7); the fake has one consumer (the unit test)
tovu_file_after: delete
file_after: -

other guarded files (blob at b28d38c6; mismatch = SKIP):
  - apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts | blob 12b53dbb98be1d42546ec3d8d957d4c62f1df0bd
  - apps/admin/src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts | blob a42987703cc79cb3552c08d3b4f0ebeba6345d30

moved_bodies:
  - M1 AnalyticsPort -> apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts | before: "export interface AnalyticsController {" | exported? yes | text: verbatim analytics-port.hooks.ts lines 3-14 (the `/** @file … */` block becomes a plain `/** … */` doc on the interface: change only its first line " * @file What `useAnalytics` needs" -> " * What `useAnalytics` needs", and in its last sentence replace "this file declares, `analytics-dependencies.hooks.ts` binds the real `api`\n * client, and nothing else under `features/analytics/hooks` imports `lib/api`." by "this interface declares, `defaultAnalyticsPort` below binds the real `api`\n * client.") followed by one blank line
  - M2 defaultAnalyticsPort -> same destination | before: "/**\n * @complexity Time/space: O(1) — one fetch on mount" (occurs once) | exported? no (only consumer is useWiredAnalytics in the same file; drop the `export` keyword) | text: verbatim analytics-dependencies.hooks.ts lines 9-13, then one blank line
  - M3 FakeAnalyticsPortOptions + createFakeAnalyticsPort -> apps/admin/src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts | before: "function jsonResponse(body: unknown, status = 200): Response {" | exported? no (drop both `export` keywords) | text: verbatim analytics-dependencies.hooks.ts lines 15-34, then one blank line
  - destination import edits:
      use-analytics.hooks.ts: "import type { AdminAnalyticsHit } from \"@/lib/api\";" -> "import { api, type AdminAnalyticsHit } from \"@/lib/api\";"
      use-analytics.hooks.ts: delete line "import { defaultAnalyticsPort } from \"./analytics-dependencies.hooks\";"
      use-analytics.hooks.ts: delete line "import type { AnalyticsPort } from \"./analytics-port.hooks\";"
      use-analytics.hooks.unit.test.ts: "import { createFakeAnalyticsPort } from \"../hooks/analytics-dependencies.hooks\";" -> "import type { AdminAnalyticsHit } from \"@/lib/api\";\nimport type { AnalyticsPort } from \"../hooks/use-analytics.hooks\";"
census:   (python3 scripts/census.py <TOVU> <file>; must equal)
  - analytics-port.hooks.ts: apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts:2 | static | "./analytics-port.hooks" (file deleted) ; apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts:8 | static | "./analytics-port.hooks"
  - analytics-dependencies.hooks.ts: apps/admin/src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts:6 | static ; apps/admin/src/features/analytics/hooks/use-analytics.hooks.ts:7 | static
reach_check:
  - rg -n --no-heading -F "analytics-dependencies.hooks" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/admin/src/features/analytics/hooks/analytics-dependencies.hooks.ts'
  - rg -n --no-heading -F "analytics-port.hooks" apps content development .github package.json --glob '!**/node_modules/**' --glob '!apps/admin/src/features/analytics/hooks/analytics-port.hooks.ts'
importers: covered by the destination import edits above (no other importer).
folds: -
comment_refs (live paths to the deleted files; exact old -> new, each once):
  - use-analytics.hooks.ts:17 | "`port` is injected — see `analytics-port.hooks.ts` — rather" -> "`port` is injected — see `AnalyticsPort` below — rather"
  - use-analytics.hooks.ts:58 | "`analytics-dependencies.hooks.ts`." -> "`defaultAnalyticsPort` above."   (line reads " * locale (`useAdminLocale()`, called here and ONLY here — see this file's header) — see" / " * `analytics-dependencies.hooks.ts`."; if the text differs, SKIP)
  - use-analytics.hooks.unit.test.ts:17 | "see `analytics-port.hooks.ts`" -> "see `AnalyticsPort` in `use-analytics.hooks.ts`"
  - any further reach_check hit under development/ or ADS-memory/ is history: leave it.
path_literals: -
tests:
  - apps/admin/src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts | blob a42987703cc79cb3552c08d3b4f0ebeba6345d30 | keep every test; only the import and the inlined fake (M3) change. No assertion edited.
relocations: -
why_moves: the analytics-dependencies.hooks.ts header ("The only place under features/analytics/hooks that reaches lib/api") is dropped: after the fold it is false. Record that in the commit body.
baselines: -   (filler: no json/mjs/yml names either path)
jini_commit: -
untangle_overlap: none (no *.repoint.tsv row names these files)
tovu_msg: "refactor(admin-analytics): fold the analytics port and fake into their only consumers" | body: "Owner answer Q-WH: inline. No Jini change."
Order: blob/text guards; census; reach_check; M1-M3; import edits; comment_refs; git rm -q both files; eslint the two edited files; one Tovu commit (4 paths).
Cloud run owes: use-analytics.hooks.unit.test.ts, Analytics.unit.test.tsx, Tovu typecheck. No behaviour change.
est. executor tokens: ~35k Sonnet.
