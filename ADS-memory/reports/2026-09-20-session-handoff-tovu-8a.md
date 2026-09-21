# Session handoff — tovu-8a, 2026-09-20 (session ending)

Everything below is handed to the peer session. **tovu-8a owns nothing.** No reserved directories, no running agents.

---

## 1. WHAT SHIPPED TODAY

### Trash / delete feature — COMPLETE
Owner directive: *"there should be deletes that put stuff in a trash bin and that trash bin gets deleted in 60 days."*
Owner ruling: **delete ALWAYS goes to the Trash; permanent deletion only from the Trash screen via checkbox + confirm modal; agents can NEVER hard delete; 60-day auto-purge is a backstop, not the only exit.**

- Design: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`
- `trashed_items` table, migration `0070_trashed_items` (committed AND applied — do not regenerate)
- Four domains wired (posts, comments, media, redirects) through an **injected `remove`**; domains import nothing from `features/trash`
- Marker flip + index insert in ONE reentrant transaction
- Backfill script; `purge_after` = backfill time + 60 days, never retroactive
- 60-day sweeper (`features/trash/sweeper.ts`), modelled on the outbox drainer, row-level lease, CAS purge so a concurrent restore wins
- Agent tools `trash_list_items` / `trash_restore_item`, plus `trash_item` (generic, delegates to the four per-domain delete tools so their side effects still run)
- **Purge ban with three independent proofs** in `features/trash/__tests__/tool-registrations.purge-ban.test.ts` — DO NOT WEAKEN. It enforces the owner's rule.
- Admin Trash screen, translated into all 21 locales
- Rollback compensation: a live post can no longer sit in the Trash after an undo (found a second path: the ordinary admin undo button)

### Peer reviews (Codex gpt-5.6-sol / terra, xhigh) — 11 read-only runs
- `ADS-memory/.local-artifacts/sol-review-2026-09-20/` — server-side, 4 High / 4 Medium / 1 Low
- `ADS-memory/.local-artifacts/terra-admin-review-2026-09-20/` — ALL 588 apps/admin files + desktop main process
- Totals across admin: **3 Critical, ~20 High**. Most are now fixed.

### Coverage + mutation
- `ADS-memory/.local-artifacts/terra-admin-coverage-2026-09-20/` — first real apps/admin number: 588 files, 379 at 100%, 135 below, 74 no record
- `ADS-memory/reports/2026-09-20-mutation-sweep-changed-files.md` — 68 files, ~52 confirmed survivors, 3 untested security guards found (all now tested)
- **`api.ts` lesson:** its recorded "100%" was VALID on 2026-09-05 at 3,438 lines. It is now 4,161 lines and 92.58%. Every feature added since ships uncovered in the API client, and nothing detects the decay.

### Desktop security (all fixed except the multi-instance question)
- `startsWith` was used as an origin check → popup to `http://127.0.0.1:4567@evil.example/admin` was ALLOWED and inherited the privileged preload. A second bypass: `http://127.0.0.1:45670/`. `javascript:`, `file:`, `data:`, `smb:`, `vscode:`, `ms-msdt:` all reached `shell.openExternal`.
- Webview guests had no source allowlist; speech IPC took unbounded input (a few bytes → 8 GB allocation)
- Site-process registry: atomic writes, per-instance files, torn file never reads as empty
- Projects list + recent-sites list: same fix via new shared `apps/desktop/src/durable-json-file.ts`; **a sibling instance's write used to erase this instance's project outright**

---

## 2. STILL OPEN — all of it is the peer's now

Full list with file:line detail: `ADS-memory/.local-artifacts/terra-admin-review-2026-09-20/HANDOFF-unclaimed-fixes.md` sections A–G.

### Unverified, needs a pre-existing-or-regression check FIRST
12 failures found at HEAD, judged unrelated but NOT A/B-verified:
- `forms.dispatch.test.ts` (7) — never calls `installFirstPartyToolContributors`
- `tool-registrations.members.test.ts` (3) — expects `ForbiddenError`/`MemberNotFoundError`, gets `ToolInputError`
- `server/__tests__/content-type-write-provenance.test.ts` (2) — registration undefined
Two of the three look like one root cause. **If any came from today's commits they are regressions, not stale tests.** Check `git log -S` before editing any assertion.

### Known stale tests (code is right, test is wrong)
- `admin-widgets-routes.test.ts` expects `FORBIDDEN`; production throws `WIDGETS_FORBIDDEN`
- `Security.unit.test.tsx:127` expects "site token"; code says "Site Token" since `76e39b746`
- `domain-no-direct-tool-registration.boundary.test.ts` on `federate-mcp.ts` + `supabase-connect/tool-registrations.ts`

### Tooling gaps
- `development/scripts/mutation-sweep.mjs` never passes `--experimental-test-module-mocks`, so it cannot run any `mock.module()` test
- `package.json`'s `check:test-baseline` points at `development/scripts/repo-test-failure-baseline.json` — **which does not exist**. Only `route-test-failure-baseline.json` does. That gate fails on invocation.
- `check:architecture` fails against a known-red baseline (API surface 231→327, SCC 0→40, 1 back-edge). Nothing trash-specific in it.

### Server-side leftovers
- sol Medium: media optimistic concurrency is check-then-write
- sol Medium: destination selection editable after planning, not bound to the plan
- sol Low: invalid base64 accepted as upload
- Untested guards, mutants still surviving: `publish-trust/keys.ts:74`, `publish-content/run-repo.ts:92`
- Mutation sweep §6b: 15 files of LOWER-confidence survivors (call-site check only). Re-confirm with explicit test paths before writing tests.

### Type error nobody fixed
`apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts:114` uses `routeDeps.commentRepo.save`, which is not on `CommentRepoPort`. Harmless at runtime; `tsc` skips tests.

### Recorded limitation, do not paper over
A sweep row reporting `version-changed` while its index row survives can never be purged, and the lazy read filter also hides it. Only reachable if an entity is edited while trashed. Recorded in the design report §9b.

---

## 3. OWNER DECISIONS — surface, do NOT implement

1. **Same site in two desktop instances?** The last open desktop question. Two instances can both start the same site: two agent daemons, racing boot migrations, and a delete guard that can erase a directory under a booting sibling (rows are written only after the child boots, up to 60s). If the owner never runs the SAME site twice, a per-site lock closes it. **An app-wide single-instance lock is FORBIDDEN** — see `desktop_multi_instance_required`.
2. **Two-tab conflict checks** for the credential row and the active site — needs server work in `apps/website`; nothing in admin can catch another tab's later write.
3. **Sites screen translation** — keep the documented "no dictionary" decision, or author 21 locales?
4. **Dashboard stat lines** (`5 published` / `2 drafts`) — translating reverses a documented decision and changes `rules.ts` helper signatures.
5. **`newsletter_remove_subscription`** is agent-callable and does a raw `DELETE FROM` (`features/newsletter/repo.sqlite.ts:398`, registered at `tool-registrations.ts:219`) — the ONE live exception to "agents can never hard delete". Intentional privacy erasure, or route through Trash?
6. **Remote tool "may write" grant** — currently one click by design. Confirm first?
7. **Jini `ConnectorDetailDrawer` "Disconnect"** (revokes the account at Composio) and **`settings/ComposioKeyField` "Clear"** both act on one click. Disconnect needs a Jini change.
8. **Security page is English-only** (`SECURITY_DICT = {}`); `settings/rules.ts` `buildExternalMcpRemoveConfirmCopy` returns untranslated English.
9. **Persist-before-dispatch:** if a user's turn can't be saved before a run starts, refuse / warn / keep sending silently? Currently sends anyway, deliberately, and the failure is invisible.
10. **Local CLI picker** after a failed save: the ledger rolls back but the picker shows the new pick until reload. Snap back?
11. **`restorePostForward`** reads a post's whole revision ledger to resolve `restoredFrom` — unbounded, failure path only. Keep or bound it?

---

## 4. HARD-WON GOTCHAS FROM TODAY

- **The dominant defect class is a correct primitive with an unwired call site.** It was the real shape of FIVE separate bugs today. One fix needed 8 call sites where a review cited 4. Media had 2 call sites, not 1. Three admin routes shipped registered nowhere. Desktop had the correct origin check 550 lines from the broken one. **Audit the sinks, not the definitions.**
- **The three recurring shapes:** a discarded promise; an unversioned read resolving after a newer write and overwriting it; two writes with nothing binding them. A shared serialize-writes hook is being built in `hooks/` to replace 4 hand-written copies + `updateChain`.
- **Make a compensation dependency REQUIRED, not optional** — "an optional compensation port is precisely how you get three of four wired."
- **Comments are claims, not evidence.** A false comment ("guaranteed consistent") was the stated reason a High-severity check did not exist.
- **A test can lock in a bug.** `byok.unit.test.ts:220` asserted `finish()` is NOT called. Existing green tests passed over a data-loss bug because their fixtures had no baseUrl/model.
- **100% line coverage proves nothing about assertions.** All three untested security guards were in files reporting 100%.
- **Mutation-sweep discovery is filename token-overlap with NO stemming** — it missed `publish-content-blobs.test.ts` for `blob-put.ts` (singular vs plural) and flagged a tested sha256 guard as untested.
- **`tsc` excludes tests**, so a broken test-only call site type-checks clean. That is how the redirects fixture went red unnoticed.
- **Peer-review calibration:** sol was 4-for-4 accurate, terra's admin reviews were largely accurate but got line numbers wrong twice and over/under-stated severity several times. An older diff-only audit was ~24% fabricated. **Always triage before fixing.**
- **Test slots are mandatory** (`ADS-memory/.local-artifacts/test-slots`, slots 1-3, guarded `while` loop). tovu-8a omitted this from ~20 dispatches today; ai-site's entire run was ungated.
- **Playwright's browser is shared machine-wide.** tovu-8a's Trash screenshot held it for 2h and blocked the peer's visual checks all session. **Close the browser at the end of every visual-check brief.**
- **A path-limited `git commit -- <file>` takes the WORKING-TREE file, not your staged hunk** — it sweeps in other agents' uncommitted changes. Use `git apply --cached` then commit with no pathspec.
- **`ADS-memory/.local-artifacts/` is gitignored by design.** Triage files written there are on disk only; do not force-add. Durable records go in `ADS-memory/reports/`.

---

## 5. ENVIRONMENT

- Dev server on `https://localhost:3000` (sqlite at `sites/tovu-com/content.db`). Its boot log shows a `no root key` unhandledRejection — known, logged, not fatal, but `deriveInstallationId` fails so publish-trust identity does not work this session.
- `env -u TOVU_ADMIN_PASSWORD` — must be UNSET; empty does not work.
- Three test runners: apps/admin = vitest from `apps/admin`; apps/website = `node --import tsx --test --experimental-test-module-mocks` from the **repo ROOT**; apps/desktop = two-phase `node --test`.
- macOS has no `timeout(1)`. Never read an exit code through a pipe. Never suppress stderr. Never run any `serve` command — it hangs forever.
- Machine was at load 267 (1-min spike) around 17:28; a large share was the owner's Firefox, not agents. The box has crashed at 721 before.
