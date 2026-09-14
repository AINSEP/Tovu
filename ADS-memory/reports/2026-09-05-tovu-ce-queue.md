# tovu-ce work queue — live

**Owner:** session `tovu-ce`. Inherited from `tovu-26` 2026-09-05.
Authoritative history: `2026-09-05-tovu-26-worklist.md`. This file tracks only what `tovu-ce` holds.

## Standing constraint — Leona, 2026-09-05, verbatim

> "We should be getting a massive amount of work. We don't wanna be running a bunch of tests all at
> once. We want one sub agent or maybe two max to be doing tests for the coverage because we need to
> find out coverage gaps."

**Hard cap: 1-2 test/coverage-running agents at a time, across all sessions.** A large backlog is the
argument FOR the cap, not against it. Everything else queues. Non-test dispatches (static tracing,
reads, triage) do not consume a slot but must not launch a test run while both slots are held — say
so in every spawn prompt, because mid-flight messages do not reliably arrive.

## Slots

| Slot | Agent | Work | Status |
|---|---|---|---|
| TEST 1 | `verify-f3` | Astra F3 — adversarial trace of the widget `header` collision; CONFIRMED requires a working RED test, else refute | WIP |
| TEST 2 | `fix-f4-complexity` | Astra F4 — `routes/system/sites.ts` cyclomatic 11 / cognitive 10 → ≤9, behaviour-preserving | WIP |
| no slot | `db-split-scout` | DB split scoping, READ-ONLY, no test runs | WIP |

`tovu-26` holds `cover-pages-deployment`, standing down. Global count is 3 until it does — over cap.

## DONE

| Item | Commit | Verified by me |
|---|---|---|
| Astra F1 — `writeFileAtomic` wrote `.env` at 0644, exposing secrets | `852265ae` | Yes — diff read. Preserves an existing file's mode, defaults new files to 0600. Docker runs `USER node` with `sites/` chowned to node, so the new-file default locks nobody out. Only 4 callers, all in `site-dir`. |
| Astra F2 — unconditional `catch` silently replaced an unreadable `.env`, **plus the sibling at `active-site.ts:161`** | `f36bd199` | Yes — diff read. Only `ENOENT` takes the absent branch now; comments corrected. |

## Priority — Leona's, via `tovu-26`

Hers explicitly: **the DB split** (new), **coverage to 100%** ("nothing should be less than one
hundred percent"), **the hook sweep**. That A7/C11 outranks them on severity is agent judgment, NOT
her ruling.

| # | Item | Slot? | Notes |
|---|---|---|---|
| Q1 | **DB split** — chat data out of `content.db`, not published by default, with an opt-in | scoping now | See below. Thin slice BEFORE the ADR. |
| Q2 | **Hook sweep batch C** | yes | `AssistantDock.hooks.tsx` (1466), `use-post-editor.hooks.ts` (831), `App.hooks.tsx` (639), `Select.hooks.tsx` (630), `use-page-editor.hooks.ts` (486), `use-static-publish.hooks.ts` (363), plus `components/**` and `lib/**`. Fix shapes + the two new root causes in worklist A21/A26. |
| Q3 | **A7/C11** — dev-path schema guard | yes | **BLOCKED on Leona**; `tovu-26` is asking her now. Only data-safety item: `openContentDb` migrates unconditionally, so `npm run dev` can silently migrate a `content.db` that `tovu serve` would refuse. Do NOT dispatch on an agent's recommendation. |
| Q4 | **Coverage phase 2** — ~25+ unmeasured dirs | yes, heavy | `2026-09-05-coverage-inventory.md` has the surface map + exact per-row commands. Resume when 1-min load is genuinely under ~8. Expect to REMOVE rows: `website/features/theme` measured 99.7%. **Never delete production code to reach 100%** — test it or report it as a structural finding. A precise "97%, these three branches remain, here is why" beats a rounded-up 100%. |
| Q5 | **28 remaining Gemini findings** | mixed | `2026-09-05-gemini-admin-tooling-triage.md` (`993688d5`). All 37 re-verified; 9 already fixed, top 5 done, rest never actioned. |
| Q6 | `packages/sdk/dist` build gap (C15) | no | Only `Dockerfile:57` builds it. Fresh clone has no SDK, plugins fail. Blocks tightening `status !== "planted"`. **Do NOT run `unlink:jini` or `npm run build`.** |
| Q7 | Dev-server crash (B1) | no | App crash and OOM ruled out. External signal, no handler. Now logging to `development/.dev-server.log` — wait for the next death. |
| Q8 | Desktop multi-site port | yes | Multi-site IS the product; crash-safety in scope (~400-550 lines); do NOT port Runner's UI, in-process Jini daemon, keychain vault, or second MCP surface. Blockers: stale Aug-28 `dist/` CLI (v50 vs v57 — spawn from source via `tsx`, do NOT rebuild) and identical daemon argv making kill-identity unprovable. |
| Q9 | 3 parked scripts | yes, tests first | `theme-tool.ts`, `install-agent-plugin.ts`, `agent-plugin-activation.ts`. Parked deliberately — fixing means writing tests FIRST. Low priority. |

## Q1 — the DB split, Leona verbatim

> "we need to basically have two databases, one for chat, the AI, one for actual site content. Um, so
> I don't think that should be too big. And then we just don't push the AI chat or maybe we have the
> option to, but we don't push it by default."

Acceptance criteria: **duplicating a site must not clone chat history**; **a content restore point
must not erase conversations**; chats are unbounded/high-write vs content durable/low-write;
migrations auto-apply, so chat schema churn currently migrates the database holding real content;
static export needs none of it. Watch: restore-point machinery, `duplicateSite` (**does not exist
anywhere yet** — verify), the static export path, the seed/`content.seed.db` flow, and the **three
raw-SQL tables invisible to the copy-order logic**.

## Directory ownership — verified by `tovu-26` against ListAgents

- **FREE**: `apps/admin/src/components/**`, `apps/admin/src/lib/**`, `features/posts/**`, `features/themes/**`
- **FREE SHORTLY**: `features/pages/**`, `features/deployment/**`
- **NEVER TOUCH**: `features/menus/**` — Leona's own uncommitted work (`MenuEditor.tsx` modified,
  `MenuEditor.hooks.tsx` untracked). Off-limits until she commits it.

## Decisions closed — do not re-litigate

C1 moot (`cdba286b`) · C3 superseded by "100% everywhere" · **C4 LIVE, hers alone — don't touch** ·
C5 `coverage-lib-audit` deleted · C6 **KEEP** the governance drift check, fix is one `.gitignore`
line `!ADS-memory/governance/` · C7 LIVE but minor (three `boundT` hooks, stale translations on a
mid-session language change) · C8 LIVE, partly overtaken by the DB split · C9 system appearance
dropped · C10 marker files **STILL HELD**, both verified absent · C12 keep local Jini, spawn the CLI
from source via `tsx` · C13 crash-safety IN SCOPE · C14 SDK resolver path fixed (`d64814cd`) ·
**C15 still LIVE**.

## Open for Leona

- **A7/C11** — should `index.ts` adopt `readSiteDir` + the schema guard? Changes boot for every
  developer. `tovu-26` is asking.
- Where coverage sits against the DB split and batch C.
