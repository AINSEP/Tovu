DONE

# bugs-high — HIGH / security rows of P8 (2026-11-23)

Source: `origin/plan/whats-left-1122:plans/P8-triaged-backlog.md` Tier 1 + `inputs/bugs-triage.md` (OPEN — HIGH and
security rows). Bases: Tovu `origin/integ/merge-13-2026-11-22` (`f7185f153`), Jini `origin/integ/merge-14-2026-11-22`.
Branches: Tovu `codex/bugs-high-tovu`, Jini `codex/bugs-high-jini`. Method per bug: failing test first (seen red on
the base), smallest fix, green, named mutation red, restore. Tests ran against Jini merge-14 built and linked with
`link-jini.mjs` (published `@jini-ai/*` are behind the Tovu base).

| bug | status | test (mutation) |
|---|---|---|
| B151 non-owner re-enables owner-disabled admin (security) | fixed `466b42912` (route + `identity_user_enable` tool) | `routes/users/__tests__/account-protections.test.ts` "HTTP enable: a non-owner admin cannot re-enable an owner-disabled admin" (guard action → `reset-password`) |
| B152 reset-password reveals Trash before permission (security) | fixed `7efc58b90` | same file, "HTTP reset-password: a caller without user.manage gets 403 …" (permission check moved after Trash check) |
| B140 renamed chat title not redacted (security) | fixed `57ba31c52` | `server/__tests__/assistant-chats-routes.test.ts` "renamed title with a token is stored redacted" (skip redactor) |
| B211 disabled search plugin still active | fixed `5e0ce8b78` | `site-deps/__tests__/search-plugin-activity.unit.test.ts` (read `layout.root` again) |
| B190 widgetEmbed schema lacks widgetEntryId | fixed `36cda1f6d` | `features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts` "widgetEmbed carrying widgetEntryId …" (drop property) |
| C058 member save `version <=` overwrite | fixed `8aad3550b` | `features/members/__tests__/credentials-revocation.dialects.test.ts` "two saves from the same version …" sqlite+pglite (restore `<=`) |
| B218 plugin note rename wipes text | fixed `daf75d5f5` | admin `features/plugins/__tests__/agent-plugin-memory.hooks.unit.test.ts` "renaming a new note keeps its text …" (always load saved text) |
| B216 BYOK key sent to half-typed Base URL (security, Jini) | fixed Jini `e5f263d5` (+ `@jini-ai/ui` patch changeset) | Jini `packages/ui/.../ExecutionTab.hooks.base-url.test.tsx` (key effect on typed URL, drop guard) |
| B236 webhook owner `user-local` | skipped-overlap: `routes/integrations/create.ts` in `codex/ex4-integrations-tovu` | — |
| B217 menu edits lost on sidebar nav | skipped-overlap: `MenuEditor.tsx` in `codex/ex5-small-tovu` | — |
| B233 stale sort after collection change | skipped-overlap: `WidgetConfigFields.hooks.tsx` in `codex/ex5-collections-tovu` | — |
| C043 tier-2 plugin import allowlist (security) | skipped-overlap: `plugin-tier2/worker.ts` in `codex/ex2-holds-tovu`, which already adds a C043 import policy + test | — |
| B213 desktop default owner password | not a bug (owner 11-21, P8) | — |
| A450 separate origin for themes (security) | not in scope: owner question 5 in P8, planned after P6 (L) | — |

Every fixed row was re-checked on the base first and was still red. MEDIUM/LOW rows were not touched.

## Notes
- B151: `assertUserAccountAction` gains an `enable` action (owner rule only; no self or owner-floor checks — enabling
  removes nothing). An owner target keeps the existing "only an owner can modify an owner principal" wording; an
  admin target says "only an owner can turn an admin account back on".
- B140 does not scrub titles already stored (P8 owner question 3).
- C058: no other `version <=` upsert in `apps/website/src`.

## Verification
- Tovu website (node test): identity + users routes 697 tests, 695 pass; the 2 failures are a real-Postgres passkey
  test (no Postgres here) and B152's test before its fix. Chat routes 24/24. Post schema 71/71. Members: only the C058
  tests changed (red → green); 16 other failures are identical on the base (no Postgres, google-login preset,
  owner-MFA storage). `site-deps`: 32 characterization tests ("slice call missing") fail identically on the base.
- Tovu admin (vitest `--maxWorkers=2`): `features/plugins` 48 files / 592 tests pass.
- Jini ui (vitest `--maxWorkers=2`): `features/execution` 34 files / 388 tests pass; `tsc --noEmit` clean; eslint clean.
- Typecheck: Tovu root `tsc -p tsconfig.json` exit 0. Admin `tsc`: 4 errors, all in untouched files
  (`jini-kits.ts`, `main.tsx`, `render-with-jini-kits.tsx`: `AdminKit` shape skew vs the linked Jini merge-14) —
  pre-existing, not from this run.
