# Terra job dedupe-11: Tovu adopts the new Jini exports (after the Jini release)

READY ONLY AFTER GATE R1 (2026-11-13; revised after review d3r: T16 hooks, T18, T23 and T11 moved to the Opus UI backlog `opus-ui-backlog.md`; the precondition now proves a real consumer import). Self-contained. Background and the reason for every decision: `development/refactor-patterns/dedupe/PLAN.md` ("Coordinator gates"). Repo: the Tovu clone you are given (Tovu only; paths are relative to the Tovu repo root).

## Precondition (check first, stop if it fails)
Gate R1 means: Jini jobs 05 and 08 (the two whose exports this job uses), with 06, 07 and 09 in the same release, are reviewed, merged, released to npm with a version bump, and this Tovu clone's `@jini-ai/*` minimum versions and lockfile are updated to that release. Before editing anything, prove both names resolve the way this job will import them:
1. Runtime export (from the repo root, where `node_modules/@jini-ai` lives): `node --input-type=module -e "const c=await import('@jini-ai/core/primitives'); if (typeof c.toMsClock !== 'function') { console.error('R1 not done, missing: toMsClock'); process.exit(1); }"`
2. Type export, through a real consumer import (`FormSubmissionRedirectResult` is a type, so it cannot be checked at runtime). Write `apps/website/.r1-probe/probe.ts`:
```ts
import type { FormSubmissionRedirectResult } from "@jini-ai/cms/forms";
import type { IsoClock } from "@jini-ai/core/primitives";
export type R1Probe = [FormSubmissionRedirectResult, IsoClock];
```
   and, at the repo root, `.r1-probe.tsconfig.json`: `{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "include": [], "files": ["apps/website/.r1-probe/probe.ts"] }`. The root `tsconfig.json` is the one that compiles `apps/website` (`rootDir: apps/website`, `moduleResolution: nodenext`). Run `npx tsc -p .r1-probe.tsconfig.json` from the repo root. That checks this one file and the two packages' declaration files, with the module resolution the server uses, so it is not a full `tsc`. It must exit 0. Then delete `apps/website/.r1-probe/` and `.r1-probe.tsconfig.json` (never commit them).
If either step fails, report `BLOCKED R1: <names / tsc error>` and stop.

## Rules for every group in this job (read before editing)
- HARD: stop before ~250k tokens of context. If you get close: commit what is done (by explicit paths), list the groups you did not finish under "REMAINING" in your report, and stop.
- Do exactly the recipe. If a recipe's "before" text is not in the file (code moved or changed), search the same file for the same code by content; if it is gone or differs in behavior, SKIP that group and report it as `STALE <id>: <what you saw>`. Never improvise a different design.
- No `eslint-disable`, no `as any`, no non-null `!`, no `@ts-ignore`.
- Signatures: every function this job creates or gives a new shared home takes `(required: {...}, optional: {...} = {})`; with nothing optional write `_optional: Record<string, never> = {}`, with nothing required `_required: Record<string, never> = {}`. A defaulted trailing object never breaks an existing caller. Where an existing exported name has a different shape and callers exist, keep that name as a one-line adapter over the new function. Only three shapes are exempt: React components (one props object), callbacks whose shape a library fixes (e.g. DataTable compare `(a, b)`), and the positional type guards owner decision O2 covers. Each recipe that uses an exemption names it.
- Size: every function you create, move or merge is at most 50 lines, with cyclomatic AND cognitive complexity at most 10 (at most 9/9 under Tovu `apps/admin`). A recipe that moves code says how to split it when needed. If a body you move is still over a limit, split it only by pure extract-function: the same statements in the same order, locals passed in one object, and each comment moving with its lines. If that cannot be done without changing behavior, SKIP the group and report `OVER-LIMIT <id>: <function> <lines>/<complexity>`.
- "Why" comments are never deleted: when code moves, its comment moves with it to the survivor; when two copies carry different why-comments, the survivor keeps both.
- Do not change response text, status codes, error messages, defaults or ordering unless the recipe says so. Where a recipe says "behavior differs", write the failing test first (run it, see it RED), then make the change, then see it GREEN.
- Tests: run ONLY the single files the recipe lists (and any test file you edit), one at a time. No suites, no full `tsc`, no watch modes; vitest always `--maxWorkers=2`; Tovu node tests always `--test-concurrency=1`. Leave no process running.
- Tovu single-file test command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <file>`.
- Commit once per group, by explicit paths: `git add -- <paths> && git commit -F msg -- <paths>`. Never `git add -A`, never stash/checkout/reset, never push.
- Report: per group `DONE | STALE | SKIPPED` + lines removed (from `git diff --stat`), tests run with pass/fail counts, anything that looked like a bug (do not fix bugs that are not in the recipe; list them).

## Groups in this job
| id | what | gate | owner decision |
|---|---|---|---|
| TR04 phase 1 | 4 Tovu files use `toMsClock` from `@jini-ai/core/primitives` | R1 | — |
| TR04 phase 2 | 16 always-wrap sites | R1 | O5 (skip unless the dispatch says "O5 approved") |
| X15 | form redirect result type from `@jini-ai/cms/forms` | R1 | — |

## TR04 phase 1 (same semantics)
- `apps/website/src/features/comments/settings.ts` and `apps/website/src/features/seo/settings.ts`: delete `jiniClock` and its comment ("Tovu's ISO-clock adapter; the shared clock contract/rationale lives in Jini core/primitives" now lives on core's doc), replace `jiniClock(x)` with `toMsClock({ clock: x })`, and type the clock in the two deps types as `ClockPort | IsoClock`.
- `apps/website/src/features/comments/provider-selection.ts` (2 inline sites), `apps/website/src/features/identity/wiring.ts:186`, `apps/website/src/features/identity/tool-registrations.ts:209`: `'nowMs' in c ? c : { nowMs: () => Date.parse(c.nowIso()) }` -> `toMsClock({ clock: c })`.
- Import `toMsClock` and `type IsoClock` from `@jini-ai/core/primitives`.
- Tests: `apps/website/src/features/comments/__tests__/settings.test.ts`, `apps/website/src/features/comments/__tests__/provider-selection.test.ts`, `apps/website/src/features/seo/__tests__/settings.test.ts`, `apps/website/src/features/identity/__tests__/wiring.test.ts` (one at a time, Tovu command above).

## TR04 phase 2 (ONLY if "O5 approved")
Behavior differs for a clock carrying BOTH `nowMs` and `nowIso` (only test fakes do): `toMsClock` uses `nowMs` instead of parsing `nowIso`. Sites: the `{ nowMs: () => Date.parse(X.nowIso()) }` wraps in webhooks, newsletter, publish-trust, dev-auth, api-keys/users/settings deps, serving-app, agent-plugin-service-ports, smtp.nodemailer and import-media-entity (16 total; list them with `grep -rn "Date.parse(" apps/website/src | grep "nowIso()"` and report the list). Each becomes `toMsClock({ clock: X })`. Run each touched file's beside-test.

## X15 form redirect result type
`apps/website/src/server/inbound/public-http/http/site/form-render.ts` (the `export type FormSubmissionRedirectResult = … | { kind: "error"; slug: string };` block, ~line 280): replace the union with `export type { FormSubmissionRedirectResult } from "@jini-ai/cms/forms";` and, because the file uses the type itself, add `import type { FormSubmissionRedirectResult } from "@jini-ai/cms/forms";`. Diff the union against Jini's first (5 members); if they differ, STALE X15. Importers stay unchanged (`routes/site/pages.ts`, `http/site/render.ts`, `http/site/__tests__/render.test.ts`). Type-only import, so nothing loads at runtime. Test: `apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts` and the `form-render` test beside it.

## Moved to the Opus UI backlog (do NOT do these here)
T16 hooks, T18, T23 and T11 are UI lifecycle consolidations. Opus designs and builds each one, one feature at a time (`opus-ui-backlog.md`).
