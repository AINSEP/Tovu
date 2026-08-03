# Handoff: `@jini-ai/cms` extraction — identity canary landed, slice 2 in flight, new scope decisions

Generated: 2026-08-03T07:05:00-07:00
Source agent/session: Coordinator (Review Mode), Claude Code / Claude Opus 5 (1M), repo `Tovu`
Target: claude (Claude Code, same machine)

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then
> `ADS-memory/.local-artifacts/handoff/20260803-070500-handoff.md`.
> Three subagents were porting modules into `@jini-ai/cms`; verify their work landed green before
> anything else (gates are in the handoff). **Do not spawn more subagents — the user asked to stop.**
> Then pick up at "Next Steps".

---

## Current State

**Goal (unchanged):** Tovu's backend domain modules become importable by **Zana** (a separate
vibecoding product) via `@jini-ai/cms`. Sibling of the `@jini-ai/admin` UI extraction.

**Both repos are now COMMITTED AND PUSHED** (2026-08-03), branch `refactor/jini-admin-extraction`
in both:

- Tovu `leonaburime-ucla/Tovu-AI-CMS` → `7107118` (the extraction) + `4e70da8` (pre-existing work
  and this session's reports).
- Jini `AINSEP/Jini` → `7e86dc8b9` (the cms port) + `383bd51d5` (pre-existing work).

**Nothing here has had a bug / security / architecture sweep — the user explicitly wants one.**
The manifest of exactly what went in unaudited, classified by origin, plus the five areas an audit
should hit first: `ADS-memory/reports/refactors/2026-08-03-commit-manifest-unaudited.md`.

**Why committing became urgent:** a capability probe (see "Cloud dispatch" below) proved that
worktree/cloud agents branch from a *commit* and cannot see an uncommitted working tree. All of this
session's work was invisible to them until now.

**Branch:** `refactor/jini-admin-extraction` (Tovu). Jini is on its own default branch.

### The metric that governs this work

Cycles are the wrong metric. So is *direct* host-import counting. **The only metric that decides
extractability is the FILE-level transitive closure** — what a package would actually have to
contain. Module-level closure over-counts catastrophically (identity: 35 modules at module level,
**2** at file level).

Measurement scripts live in the session scratchpad and are worth recreating if lost — they are
~60 lines of dependency-cruiser post-processing:
`scratchpad/portability.ts` (per-module host/AI blame), `scratchpad/closure.ts`,
`scratchpad/mincut.ts` (greedy min-cut), `scratchpad/slice2.ts` (file-level closure + blame).

### Measured module inventory (do not re-derive)

| module(s) | root files | closure | blockers | verdict |
|---|---|---|---|---|
| `identity` | 17 | **21 files / 2 modules** | 0 | **PORTED** |
| `navigation` | 12 | 18 files / 3 modules | 3 (`db/*` via `repo.sqlite.ts`) | in flight |
| `media`+`settings`+`workspace` | 43 | 66 files / 8 modules | 3 (`db/*` via `workspace/repo.sqlite.ts`) | in flight |
| `features/taxonomy`+`navigation` | 21 | 47 files / 8 modules | 4 (3 `db/*` + 1 host) | next |
| `features/theme` | 7 | **10 files / 2 modules** | **0** | **DO NOT PORT** — see below |
| `widgets` | 23 | **185 files / 31 modules** | 4 host files | **DO NOT PORT** — see below |

---

## Completed Work

### 1. Identity canary — DONE, green, verified live

Full detail: `ADS-memory/reports/refactors/2026-08-02-cms-identity-canary.md`.
Measurement: `ADS-memory/reports/refactors/2026-08-02-zana-portability-measurement.md`.

`@jini-ai/cms` subpaths now: `.` `./core` `./server` `./identity` `./identity/hasher`
`./navigation` `./media` `./settings` `./workspace`.

- `/core` = kernel (`ports.ts`, `commands/{command,change-set}.ts`, `tools/registration-kit.ts`).
- Tovu's copies of those four are **re-export shims** — `core/ports` alone has 164 importers, so
  rewriting them is a separate mechanical commit, not part of a boundary change.
- `src/identity/` in Tovu is down to `index.ts` (barrel shim), `tool-registrations.ts` (shim),
  `repo.sqlite.ts` + `wiring.ts` (genuinely host-owned).
- **Verified live**, not just by tests: `identity_user_list` through a real daemon run (returned 4
  users), and the user's own `identity_role_create` through the admin UI (created `dummy-role`,
  confirmed in the DB). Login/session/`authorize` all run through the package.

### 2. Tovu `moduleResolution` upgraded — `Node` → `nodenext`

Two lines in `tsconfig.json` (`module` and `moduleResolution`). Verified: 0 type errors, tests pass,
`tsc` emits, `tovu --help` boots from the emitted CommonJS. **This deleted four node10 compat stub
directories** at the cms package root that the user correctly flagged as junk.

`module` stays **CommonJS** deliberately: `bin`/`start` run `dist/` under plain `node`; 3,845
relative imports lack `.js`; 24 files use `__dirname`/`__filename`; and Node 24's `require(esm)`
already lets CJS consume every ESM-only Jini package. Full ESM is the eventual destination but buys
nothing today. `moduleResolution: "bundler"` is **wrong** here — it emits extensionless ESM that
`node dist/src/index.js` cannot resolve.

### 3. `core/commands` barrel narrowing — 40 files

The barrel re-exports `appliers.ts`, which names `features/post` and `features/settings`. Every
domain's `tool-registrations.ts` reaches the barrel, so that one hop put a dependency on two content
features into every domain. 40 files narrowed to `core/commands/command`.
**Effect: navigation's closure went 32 files/5 modules → 18 files/3 modules.** Do the same for any
new slice. 15 files legitimately still need the barrel (they use `InMemoryChangeSetRepo`,
`ChangeSetRepoPort`, or the revert registry).

### 4. In-flight subagent work (verify before trusting)

`src/server/gated-mutations-composition.ts` is **deleted**; the split landed as:
`src/core/gated-mutations/composition.ts` (115), `src/features/taxonomy/gated-hooks.ts` (100),
`src/features/database/gated-hooks.ts` (120), `src/features/recovery/gated-hooks.ts` (166).
`packages/cms/src/navigation/` and `packages/cms/src/media/` exist.
**None of this has been independently verified by the coordinator.**

---

## Decisions And Constraints

**Do not re-litigate these.**

1. **`@jini-ai/cms` is the right home** for identity/media/settings/workspace. The user overrode an
   objection that they are "not content-model": users, media library, settings and site config are
   standard CMS surface (WordPress/Directus/Payload all ship them). That objection was wrong.
2. **Package shape: subpaths, not one entry.** User: "it must be independently exportable and
   modular." Follows `@jini-ai/admin`'s precedent.
3. **The coordinator owns `packages/cms/package.json`.** Agents report needed changes rather than
   editing it, so parallel agents cannot race on the exports map.
4. **Adapters stay in the host.** Any `repo.sqlite.ts` names Tovu's shared 1,246-line
   `db/schema.ts`. `@jini-ai/cms/server` is a later slice that requires untangling that schema.
5. **The package never reads `process.env`.** This made `SeedIdentityInput.ownerPassword` **required
   with no default** — a library fallback would ship the same owner credential to every host.
   `src/identity/wiring.ts` supplies `process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev"`, preserving
   first-boot behavior exactly.
6. **Product neutrality is enforced** by `npm run guard` (rule R5) in Jini. Zero "Tovu" in ported
   code including comments. Never name a consuming product in Jini source — Jini "shouldn't know
   anything about Zana."
7. **`sideEffects` must list side-effectful modules.** `identity/permissions.ts` makes ~60 top-level
   `registerPermission()` calls; under a blanket `sideEffects: false` a bundler could legally drop
   it, emptying the catalog and failing authorization closed **only in a production bundle**. Now
   `"sideEffects": ["./dist/identity/permissions.js"]`. Check every new module for this.
8. **Move tests, do not re-author them.** `node:test` → `import { test } from "vitest"`, add `.js`
   extensions, nothing else.

### New scope decisions from this session

9. **DO NOT port `features/theme`** — even though it is the most portable module measured (10-file
   closure, zero blockers). It hard-binds `handlebars` + `liquidjs` + `node:fs`/`node:path`, and
   `src/themes/` ships a `tovu-official` branded theme. Porting it would lock the package to two
   template engines. *Technically trivial, strategically wrong.*
10. **`widgets` IS portable — it is blocked by exactly ONE stray import.** This verdict was wrong
    twice before landing; do not revert to either earlier reading.
    - Reading 1 (wrong): "don't port, it's the integration hub" — 185 files / 31 modules.
    - Reading 2 (wrong): "port last, its closure is the CMS by construction."
    - **Measured truth:** `src/widgets/tool-registrations.ts:42` imports `toWhereUsedResponse` from
      `../server/http/admin/widgets`. That single edge reaches the composition root, and `server/`
      transitively pulls in the entire repo. **Cut it and the closure is 44 files / 7 modules:**
      `widgets 22 · features/content-types 7 · features/entries 5 · core 4 · db 3 · forms 2 ·
      navigation 1`. Remaining blockers are only the usual `db/*` via `widgets/repo.sqlite.ts`.

    `toWhereUsedResponse` is a response *shaper* living in an HTTP route file that the tool layer
    reuses — the same misplacement species as `server/middleware/rate-limit.ts` and
    `server/http/site/page-head.ts`. **Move it into `src/widgets/`.** It is not transport.

    The architecture this exposes is exactly the user's framing ("a contact form to be reused, and
    that then needs the db"): widget core needs `entries` + `content-types`, and each resolver in
    `widgets/resolvers/` drags its own domain — `contact-form.ts` → forms, `menu.ts` → navigation,
    `recent-entries.ts` → entries. Three domains, not thirty-one. Hosts register resolvers via
    `wireCoreResolvers` (`server/deps.ts`), which is already the right pluggable seam and the best
    existing model in this codebase for the composability wanted from a `./react` layer.

    **Corollary — `features/entries` + `features/content-types` measure 29 files / 4 modules with
    only the usual 3 `db/*` blockers.** They are a clean, small slice and are the natural
    prerequisite for widgets.

    **Method lesson worth keeping:** a single import into `server/` inflates any closure to
    repo-scale, because the composition root reaches everything. Always identify the *specific edge*
    before judging a module untouchable — three separate modules (widgets, taxonomy, database)
    looked hopeless for exactly this reason and each needed one file moved.

---

## Risks And Open Questions

- **Everything is uncommitted in two repos.** Highest risk. Two sessions running.
- **`npm run typecheck` is blind to tests.** `tsconfig.json` excludes `**/__tests__/**` and
  `**/*.test.ts`. Making `ownerPassword` required passed typecheck cleanly and **broke 84 tests at
  runtime**. Never trust typecheck for a signature change; run the suite. Worth fixing on its own.
- **Full-suite baseline: 3304 tests / 3300 pass / 4 fail.** The 4 are pre-existing and proven so:
  3 in `src/server/__tests__/identity-crud-routes.test.ts` (fixtures build `${username}-pw`;
  `enableme-pw`=11, `updateme-pw`=11, `resetme-pw`=10 chars vs the 12-char minimum added in commit
  `4b459f1` — that commit broke its own sibling tests) and 1 in
  `src/features/plugins/store/__tests__/store-plugin.test.ts` (verified failing under the ORIGINAL
  tsconfig too). **Any failure beyond these 4 is regression.**
- **Subagent output is unverified.** Three ran; two earlier ones died on a weekly limit.
- **Known UI defect, unfixed:** the "Close assistant" FAB (`.chat-fab-dock-open`) overlaps the
  composer's Send button at 1600px viewport, swallowing the click. Found via Playwright.
- **`npm run dev` has no signal trap** — `npm → npm → tsx → node → agent-daemon` orphans on Ctrl-C.
  Also, `tsx watch` restart-thrashes while agents rewrite `src/`. Don't run it during a port.
- **`npm run guard`** reports one PRE-EXISTING violation in
  `packages/ui/src/__tests__/utils/endpoint-policy.parity.test.ts` (committed in `4082999e9`).
  Ignore only that one.

### Open questions the user has NOT resolved

- **Does `@jini-ai/cms` get a `./react` subpath?** The user thinks yes and wants a canary,
  "composable so whoever inherits can learn from it, edit, and extend it."
  **This collides with a recorded decision**: `packages/cms/vitest.config.ts:9` says *"There is no
  `./react` or `./browser` layer here on purpose — admin panels for CMS content belong to
  `@jini-ai/admin`."* But `@jini-ai/admin/src/react/components/` currently holds only
  `ConfirmButton`, `ConfirmDialog`, `DataTable`, `RowMenu`, `Sidebar` — **generic chrome, zero
  CMS-specific components.** Nothing owns a `MediaPicker`/`TaxonomySelect`/`MenuBuilder`.
  **Proposed resolution to put to the user:** the recorded decision covers *panels*; it does not
  cover *domain-bound React primitives*, which are reusable outside any admin (e.g. in Zana's
  builder). If accepted, the decision comment must be amended in the same commit, not silently
  contradicted.
- **Settings-dialog tabs — requested as a CLOUD task, not yet dispatched.** From the user's
  screenshot the tabs are: Execution mode, Instructions, Notifications, Privacy, Dialog appearance,
  Language, MCP server, Media providers, Connectors, Memory, External MCP, Skills, About.
  User's instruction: most need porting **separately**, **except Skills, Dialog appearance, and
  About** ("nothing there"). **Execution mode must be split into two subpackages: `local-cli` and
  `bring-your-own-key`.** This is `@jini-ai/admin`/UI + agent-runtime territory, NOT `@jini-ai/cms`.
  Related prior work: `ADS-memory/reports/recon/R-settings-dialog-od-to-tovu-trace.md`.
  **If dispatched to cloud, the brief MUST include commit + push + branch-fallback instructions** —
  a prior cloud dispatch lost real work because it was told not to commit.

---

## Cloud dispatch — measured, not assumed

A throwaway probe (`isolation: "remote"`) answered this empirically on 2026-08-03:

- **Cloud/worktree agents DO have the `Agent` tool and CAN spawn subagents.** Verified with a live
  PONG round-trip. The `model` parameter accepts `sonnet | opus | haiku | fable`, so **an Opus 5
  cloud task can spawn Sonnet 5 subagents** — the user's intended shape works.
- `Workflow` is NOT available to them. `Task` resolves to the same tool as `Agent`.
- **They branch from a COMMIT and are git-isolated from the shared checkout.** The probe landed in
  `/Users/la/Programming/Tovu/.claude/worktrees/agent-…` on its own branch, pinned to an older
  commit, working tree clean. `src/core/gated-mutations/composition.ts` was ABSENT. Git operations
  against the shared checkout are actively refused; plain filesystem reads are not.
- Environment: node v24.2.0, npm 11.3.0, pnpm 10.33.2, network reachable.

**Consequence: always commit + push before dispatching cloud work, and tell the cloud agent which
branch/commit to start from.** Also give every cloud brief explicit commit + push + branch-fallback
instructions — a prior cloud dispatch lost real work because it was told not to commit.

Caveat: `isolation: "remote"` produced a *local* worktree. Whether true remote was unavailable and
fell back, or remote is implemented this way here, is unresolved. The persistence conclusion holds
either way.

## Queued workstream — `@jini-ai/chat-core` → `@jini-ai/ai-chat`

User request, 2026-08-03. Not started, no measurement done yet.

- Collapse `@jini-ai/chat-core` into a single `chat/` package rather than a `-core` split.
- **Merge the `chat/react/` submodule into it** so the chat surface lives in one place instead of
  being spread across a framework-free core and a separate React layer.
- **Rename the result to `@jini-ai/ai-chat`.**

Rationale is the same one driving the `admin` reduction below: a `-core` / `-react` split that
nothing external consumes separately is indirection without benefit. Before executing, measure it
the way every other module in this workstream was measured — file-level closure and consumer count
— rather than assuming the split is safe to collapse. Check who imports `@jini-ai/chat-core`
today (Tovu's assistant pane at minimum) and whether any consumer takes the framework-free half
alone; that is the one fact that would argue for keeping them separate.

Related decision in flight: **`@jini-ai/admin` is to be reduced, not kept.** Its
`src/react/components/` (`ConfirmButton`, `ConfirmDialog`, `DataTable`, `RowMenu`, `Sidebar`) are
domain-blind generic chrome and belong in `@jini-ai/ui`, whose charter is exactly that. What would
remain of `admin` is its `/core`: panel registry, route model, permissions. The user's framing:
"we are changing that to cms/, but the react components there are generic ui stuff that should go
to ui/ package. we can leave the admin/ for now." Those components are now committed
(`383bd51d5`), so the move is a reviewable diff rather than a rescue.

## Suggested Skills

- `/handoff` — regenerate this at the next break.
- `/code-review` — before any commit of this size.
- `codebase-memory` — structural queries; prefer over grep, but check index freshness.

## Next Steps

1. **Verify the three subagents' work.** Gates: Tovu `npm run typecheck`, `npm test` (expect
   3304/3300/4), `npm run check:architecture` (must not regress; `back-edges into composition root`
   should improve from the gated-mutations split). Jini `packages/cms`: `tsc --noEmit`,
   `npm run build`, `npm test`. Jini root: `npm run guard`.
2. **Offer to commit both repos.** This is overdue.
3. **Resolve the `./react` question with the user** before building anything — it contradicts a
   written decision and needs an explicit amendment.
4. **Port `features/taxonomy`** (categories) — now unblocked by the gated-mutations split. Apply the
   `core/commands` barrel narrowing first.
5. **Move `toWhereUsedResponse` out of `server/http/admin/widgets.ts` into `src/widgets/`**, then
   port `features/entries` + `features/content-types` (29 files, clean), then `widgets` (44 files
   once that edge is gone). See decision 10 — this is a one-file move that unblocks a whole slice.
5. **Dispatch the settings-dialog tab work as a cloud task**, with persistence instructions.
6. Optional cleanups: the 3 password fixtures; `tsconfig` test-exclusion; the Send-button FAB
   overlap; a `trap 'kill 0' INT TERM` in the `dev` script.

## Handoff Contract

- **Inputs used:** this session's conversation; `git status --short` in both repos; the four
  measurement scripts; `npm test` / `npm run typecheck` / `npm run check:architecture` /
  `npm run guard` output; live HTTP + Playwright verification against a running Tovu;
  `ADS-memory/reports/refactors/2026-08-02-{cms-identity-canary,zana-portability-measurement}.md`.
- **Output summary:** enables a fresh agent to verify in-flight work, continue the port at
  `features/taxonomy`, and resolve two pending user decisions without replaying the session.
- **Risks:** everything uncommitted in two repos; subagent output unverified; typecheck blind to
  tests.
- **Suggested next assignee:** Coordinator (Claude Code), with TestRunner for gate verification.
