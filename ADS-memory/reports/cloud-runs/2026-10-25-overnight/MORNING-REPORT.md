# MORNING REPORT — overnight 2026-10-25 (Stage C re-verify, report only)

## 1. Verdict
Stage B's 12 fixes hold: every file it touched re-passes and tsc is clean. Not green overall: about 26 Stage A failures remain, mostly product decisions, plus ENV (no Postgres/Chromium), 1 real desktop bug and an unpushed desktop test fix.

## 2. Status by area
| area | status |
|---|---|
| Admin vitest (AssistantDock, hooks, email: 102 files, 1288 tests) | green, 1288/1288 |
| Admin `tsc --noEmit` | green (0 errors) |
| Website prod `tsc -p tsconfig.json` | green (0 errors) |
| Website files Stage B touched, plus neighbours (52 files, 519 tests) | 517 pass / 2 fail. The 2 are listed in section 4 |
| Stage A NEW-failure files re-run (34 files, 285 tests) | 244 pass / 26 fail. Not fixed, see section 4 |
| member-login, seal-aad, no-raw-sqlite ratchet, mail boundary, trash, credential-guidance, members tool, 0028 step, titles, admin-screens manifest, DNS tab, init-storage | fixed tonight |
| Postgres tests, psql/recreateDatabase, desktop renderer (Chromium) | ENV |
| Desktop gate | still failing (section 4) |
| Not re-run here (scope): full website shards, site-chat, desktop, tsconfig.tests.json | unknown after Stage B |

## 3. Fixed by Stage B (all on cloud/overnight-1024-tovu)
02859f7b seal aad visible; f07e9e58 owner-store spawn env; 1247b928 mail no longer imports server; e4a5280e trash enum; 431b1af3 async transaction callbacks; 445019ab credential-guidance wording; 69199ef3 members magic link test; 7a1088c5 0028 step; 5e6e103a conversation titles (admin + website); a1256de8 admin-screens manifest; 8bf1f8ed DNS tab line; 52ac82e5 CLI init-storage Blog page.
Details are in REPORT-B.md.

## 4. Still failing, and why
- **Website, touched-file run (2):**
  - `fetch_published_page: renders a real route…`: pre-existing, the page body lacks "This is your home page."
  - `no-vendor-in-core: reviewed pattern exceptions`: anthropic count 20→23 (owner decision).
- **Stage A re-run (26 failing tests, none changed by Stage B):**
  - mcp-ui allowlist and surfaceExchanges scan.
  - cross-site-read-catalog.
  - database-transfer secret column.
  - identity wiring: owner policy vs visitor-tools.manage, and `pages.edit_html` grants.
  - worker-import-graph budgets.
  - content_read schemas and tool-input gate order.
  - site-consent, theme-page-preview and pages route tests.
  - agent-daemon outbox and `*.unrun` integration files.
  - external-mcp-oauth.
  - commerce-strip-parity.
  - assistant-chat-recovery-bounds, which timed out at about 28 min.
  - `tovu introspect` ×2 and package-pack credential check.
  - search_tools top-3.
  - Some of these are ENV (psql ×4).
- **Desktop (real bug):** `apps/website/src/platform/site-dir/local-site-supervisor.ts:13` uses a TS parameter property, which Node strip-only mode rejects, so `nested-sites-migration.test.ts` crashes. Fix: make it an explicit field. This blocks the desktop pre-push gate.
- **Desktop test fix unpushed:** `site-dir-store.test.ts:563` (patch in REPORT-B.md).
- **Not attempted:** tsconfig.tests.json (344 errors) and the complexity refactors.

## 5. Owner decisions needed
1. database-transfer: exclude `members.password_hash` or allow it.
2. Owner policy: `*` only (identity wiring test) or also visitor-tools.manage.
3. mcp-ui allowlist and exemption map (security gate config).
4. Classify the visitor_tools_* tools for cross-site reads.
5. no-vendor-in-core: accept the anthropic count of 23.
6. worker-import-graph: raise the budget or slim the Jini plugin-export import.
7. Schema baseline gaps (schema.postgres.ts vs migrations).
8. Jini peer-range pins.
9. Whether the `*.unrun` tests should be rewritten or deleted.
10. Coverage-gap policy (not addressed).
11. Approve a small fix for the desktop parameter-property bug and push the desktop test patch.

## 6. Cost
| stage | wall | tokens (rough) |
|---|---|---|
| A | ~2h12m | ~0.15M |
| B | ~27 min | ~0.25M |
| C | ~45 min, mostly test wait | ~0.1M |

Limits: Stage C re-ran only touched or failing files, so untouched tests may have regressed. Setup: `npm rebuild` failed on workspace: links, so the native modules were built per package instead (they load fine). Failing-test names above come from the spec reporter; a few hit by multiple files are counted once.

STAGE C DONE 2026-10-25T12:42Z
