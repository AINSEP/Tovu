# Handoff: repo migrated to native ESM (root flip), CI partially fixed, main still untouched

Generated: 2026-08-19 (end of session 19)
Source: Claude Code (Sonnet 5), same repo as sessions 12-18
Target: Claude Code, next session, same repo

**Note on the shared checkout:** a second Claude Code session was live in this same repo all
night again (theme schema v2, AG-UI transport). Its work is entangled with this session's
commits — see "The git mistake" below, it matters. Run `git log --oneline -15` before
assuming you know current HEAD.

---

## Next-Agent Prompt

> Read this handoff, then `ADS-memory/reports/2026-08-19-overnight-ci-fix.md` (the cloud
> agent's own report — it is accurate and well-evidenced). **First action: re-run CI and read
> the actual failure, do not assume.** Jini's 14 unpushed commits were pushed at the end of
> this session, which may have changed the picture. The ESM migration itself is DONE and
> typecheck is clean; what remains is walking the rest of the CI gates.

---

## What happened (session 19)

The session opened intending to push `general-work` to `main` (session 18's unfinished goal).
That did not happen — see "Still open". Instead the whole night went into the ESM migration,
which is now **complete**.

### The ESM migration is done

Root `package.json` is `"type": "module"`. Every relative import specifier under `src/` and
`development/` carries an explicit `.js` extension (TypeScript `nodenext` convention — the
specifier names the compiled output; tsx/tsc resolve `.js` back to `.ts`). `npm run typecheck`
passes clean.

**`#src/*` aliases are preserved.** This was the pivotal constraint, see below.

### The one thing that must not be forgotten: nested package.json breaks `#src/*`

The migration was originally executed as SPEC-049 designed it — bottom-up waves, each module
getting its own `{"type":"module"}` package.json. **That approach is fundamentally impossible
in this repo** and ~5 hours went into discovering it:

Node resolves a package's `imports` field from the **nearest** package.json only, and a nested
package.json **may not declare a target outside its own directory** (`ERR_INVALID_PACKAGE_TARGET`
— verified directly with a probe, not inferred). This repo declares `"#src/*": "./src/*.ts"` in
the root package.json and uses it ~990 times. So every nested marker silently broke alias
resolution for every file beneath it. All 108 that were created are deleted.

The resolution was a root-level flip, which keeps `#src/*` working unchanged. Confirmed the
build path already anticipated this: `development/scripts/emit-dist-package-json.mjs` carries
`type` through to `dist/` and rewrites the mapping `.ts` → `.js` for compiled output.

**Do not reintroduce per-directory package.json files to control module type.**

### Findings that contradict the original scoping — worth knowing

Two premises SPEC-049 was built on turned out to be softer than assumed. Both were proven by
direct experiment, not reasoning:

1. **CJS re-export barrels are NOT the blocker they were believed to be.** Built the exact
   failure case (an ESM file named-importing through a pure CommonJS re-export barrel, as tsc
   emits it) — it works, at 1 hop and 2 hops. `cjs-module-lexer` handles TypeScript's
   `Object.defineProperty(exports, ...)` re-export pattern fine. The `delete.ts` failure that
   motivated the whole wave design must have had a different root cause. The bottom-up order
   was still the right call (safer, incremental), but the constraint was less severe than
   documented.
2. **Type-only imports never mattered.** `import type` is erased by TypeScript — no runtime
   `require()`, so `cjs-module-lexer` is never invoked. Two modules were reported as hard
   blockers purely on type-only imports. This became REQ-01b.

Spec amended to **v1.3.0** during the work: REQ-01a (direct-define exception) and REQ-01b
(type-only exemption). `content_hash` is stale — reads `PENDING-RECOMPUTE-1.3.0`, the validator
was not re-run after the amendments.

### Real bugs found and fixed along the way

- `__dirname`/`__filename` in 24 src files + 52 development files → `import.meta.dirname`/`filename`
- `require.main === module` in 5 development scripts → `import.meta.url === pathToFileURL(process.argv[1]).href`
- **Directory-form `#src/` aliases**: `#src/features/post` resolved to `src/features/post.ts`,
  which doesn't exist (it's a directory). CommonJS auto-resolved directories; ESM does not.
  Repointed at `/index`.
- `check:inventory` was outright broken by the migration (ReferenceError at import time) — fixed.
- A boundary rule broke when an agent relocated `assistant/tool-registrations.ts` into
  `tool-registrations/index.ts`: `.dependency-cruiser.cjs`'s seam allow-list is keyed on the
  literal old path, producing 7 new `no-deep-imports` ERRORS against a 0-error baseline. File
  moved back. **Same class as the GUARDED_MODULES trap already in memory** — a boundary rule
  keyed on a hardcoded path string silently stops applying when the file moves.
- `npm ci` broke on CI: `package.json` had `@ag-ui/*` deps with no matching lock file entries.
  Caused by this session's own sloppy staging (below). Fixed by committing the lock file.

### Genuine CJS usage that was deliberately KEPT

Do not "fix" these into `await import()` — that makes their signatures async, a real behavior change:
- `server/app.ts`, `server/deps.ts` — lazy `require()` circular-import breakers (documented in
  their own comments; the daemon crashed on boot once when made eager)
- `server/http/site/{liquid,handlebars}-sandbox.ts` — `require.resolve("tsx/cjs/api")` needs a
  filesystem path, not the `file://` URL `import.meta.resolve` returns
- `server/middleware/admin-static.ts` — `seaApi()`'s conditional `require("node:sea")` must stay synchronous

All now use `createRequire(import.meta.url)`.

---

## The git mistake — read this before touching history

**This session's commits contain the other session's work.** Staging used a broad
`git add -A src development package.json` instead of explicit paths. That swept in:
- their edits to `src/cli/program.ts`, `src/server/app.ts`, `src/server/modules/assistant*.ts`,
  `src/features/theme/{index,theme-files,code-tier-asset-normalizer,validation/structure}.ts`
- entire untracked theme dirs: `mui-marketing/`, `tailark-*/`, and two
  `.tovu-migrate-staging-basic-*` folders that look like temp scratch and probably should not
  be tracked at all
- earlier, commit `3762169c` caught their `demo-choices-tool.ts` changes the same way

**Nothing is lost** — it is all on the shared branch and recoverable. It is misattributed, not
destroyed. Owner's call was "leave it, tell them": untangling after the fact risks destroying
their work, which is worse. Disclosed in `39096e15`'s commit message.

It was found only because a line count looked wrong (9,383 insertions for what should have been
import edits) — luck, not process. Written to memory as
`feedback_never_broad_git_add_shared_tree`.

---

## The cloud agent (overnight, killed early)

Dispatched via RemoteTrigger, Sonnet 5. **First attempt halted immediately doing nothing** —
it was told to read `AI-Dev-Shop/AGENTS.md`, which is **gitignored and therefore absent from
any fresh GitHub clone**, and the repo's `CLAUDE.md` makes that a hard stop. The agent behaved
correctly. Fix: prefix cloud dispatch prompts with `<<SUBAGENT_DISPATCH>>` (the designed escape
hatch, documented in `CLAUDE.md`'s own first bullet). Written to memory as
`reference_cloud_dispatch_needs_subagent_marker`.

Second attempt did real work before being killed, and it was good work — reproduced CI's exact
environment (fresh Jini clone + `pnpm -r build`), root-caused the typecheck failure, fixed it,
documented it thoroughly. Its report is at `ADS-memory/reports/2026-08-19-overnight-ci-fix.md`
and is worth reading in full.

**Its finding — the CI typecheck failure was NOT from the ESM migration:**
`src/assistant/mcp-ui-sandbox-proxy-route.ts` imported `SANDBOX_PROXY_HTML` from
`@jini-ai/ui/mcp-ui/surfaces`. That export **never existed in Jini, on any branch**
(`git log --all -S SANDBOX_PROXY_HTML` → zero commits). The file was dead code from `1c49c082`,
written against a speculative design Jini never shipped — Jini's real MCP-UI hosting renders a
self-contained HTML string via iframe `srcdoc`, no proxy route, no `@mcp-ui/client` dependency.
Deleted the route and its one registration call.

It also flagged, without touching (restricted path): `apps/admin/.../AssistantDock.tsx` passes
`sandboxProxyUrl` into `registerMcpUiSurfaceRenderer(...)`, and that options type in Jini has
never had such a field. Same never-real contract, other side. Will likely surface in the
`Typecheck (admin)` CI step.

---

## Jini

Jini had **14 unpushed commits** and a locally-built `dist/` reflecting them, while CI clones
Jini from GitHub and builds fresh — a strong candidate for "passes locally, fails on CI".
Those 14 commits (sandbox package scaffolding, MCP-UI client swap; all authored by the owner)
were pushed to `AINSEP/Jini` `general-work` @ `a6113362`.

**113 files remain uncommitted in Jini** and CI still cannot see them. If a future typecheck
failure names a `@jini-ai/*` symbol, check Jini's *pushed* state before assuming a Tovu bug.
Those 113 were left alone — very likely the concurrent session's live work.

---

## Current state

- `general-work` @ `2e1ec657`, fully pushed, **1,101 commits ahead of `main`**
- 46 uncommitted files in the tree (the other session's)
- `npm run typecheck` — clean
- Last CI run (`32223181233`) — still **failing**, gate unknown, was not read before the
  session ended

## Still open

1. **Push to `main` — session 18's goal, still not done, now two sessions old.** `main` has not
   moved in days. This is a fast-forward, not a real merge.
2. **CI is not green.** Typecheck is fixed; `npm test`, boundaries, architecture, inventory,
   complexity-drift, lint, admin build, and route-coverage were never walked. The cloud agent's
   report has the checklist.
3. **Test suite last measured 4252/4465 passing, 91 failing** — but that predates several fixes
   (the `__dirname`, `require.main`, and directory-alias fixes each accounted for a chunk).
   Re-measure before drawing conclusions.
4. **Lint reports 284 errors** — never separated into migration-caused vs pre-existing. One is
   known pre-existing (`useAccessTokens` complexity).
5. **SPEC-049's `content_hash` is stale** (`PENDING-RECOMPUTE-1.3.0`) — validator not re-run
   after the v1.2.0/v1.3.0 amendments.
6. `src/db/sqlite` never migrated as its own wave; an `origin` test reaches into it with two
   unconverted relative imports (works today, flagged in `acb151fd`).
7. `features/theme`, `themes/static`, `apps/admin` remain CommonJS by design (REQ-09) — their
   own future pass.

## Known pre-existing failures (do not chase as migration bugs)

- `lint`: `useAccessTokens` complexity 10 > 9 (apps/admin)
- `check:architecture`: module API surface 201 → 202, predates this work. Propagation cost and
  core size both *improved* during this session.
- `src/core/embeds/__tests__/marker.canary.test.ts` — missing fixture
  `src/themes/static/basic/pages/blog-sidebar-template.html`, absent from HEAD too; fallout from
  the concurrent session's theme reorganization.

## Handoff Contract

Written at end of session 19 against real command output (commit list, ahead/behind counts, CI
run IDs, and the cloud agent's own committed report all re-verified in this sitting). Two
unknowns stated rather than guessed: the current CI failure's actual gate, and the real test
pass rate after the late fixes. Both need a fresh run, not inference.
