BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Jini clone, branch codex/e2-jini, HEAD = Jini integ/merge-6-2026-11-19 (d3e78b387) with origin/codex/bl-jini and origin/codex/tq-jini2 merged in by the coordinator (K-04b-J needs both; E-C-J and E-O-J are merge-6).
TASK (JINI ONLY; in this order; no sidekicks/subagents): E-C-J, E-O-J, K-04b-J EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins over the design. NOT done: E-V-J (BLOCKED), E-NLWeb and E-Notes (DROPPED). Donor ref `aa3926fdb` is READ-ONLY reference only; do not replay hunks the cull removed. No package.json / manifest / API-baseline / changeset edits (cloud). Every renamed or changed public signature gets a `BREAKS:` line in COMMIT-PLAN.md. No Tovu name in any Jini line you write.
STOP rules: E-C-J — STOP if a production caller of `resolveDaemonUrl` lacks an env map or the precedence order would change. E-O-J — STOP if another production caller or probe of `selectNodeRuntime` appears. K-04b-J — STOP if the copied leaf needs another package import, a new cast, or a test file.
COMMIT-PLAN.md: one entry each — E-C-J (base merge-6; BREAKS: @jini-ai/cli resolveDaemonUrl signature), E-O-J (base merge-6; BREAKS: @jini-ai/devops/local-dev selectNodeRuntime signature), K-04b-J (base merge-6 + bl-jini + tq-jini2; cloud adds ./seo/cover-image entry). Commit per sheet; message `e2: <sheet id> …`.

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the moved code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize the code you move.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: move existing why-comments verbatim; add NO new comments except a one-line neutral note where the sheet asks for one.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical except the bug fix a sheet names (failing test first); errors never generic (plain words + redacted details; follow the error disclosure contract quoted in the sheet); never raise a debt number; API args (required, optional = {}) for NEW functions only, framework-dictated signatures (Express handlers, React events, comparators, type guards) exempt; every custom hook injected as a prop defaulted to the real hook; no re-export shells (delete + repoint); no new deps; no vendor code in Jini core; no specific server framework in Jini domain code; no product names (Tovu, tovu.dev) anywhere in Jini; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines, complexity <= 10 (HARD). A file over 500 lines is NOT a stop reason: note it in COMMIT-PLAN.md and continue. STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a hard limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters (Codex 6.1 Sol executors run none; cloud runs them); no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root, one entry per sheet (sheet ID, base, files touched, tests written, the mutation to run in cloud, STOP/skip reason if any, deletions made in the final diff re-read).

## REPORT (<= 300 words)
Per sheet: DONE / STOPPED (why, file:line) / SKIPPED. List every file touched, every REFRESH.md entry, and anything the cull text did not cover.

## DESIGN (Codex 6.2, r62t-ext2) — sheets for this job only
## Codex source briefs

**Copy this block into each job brief.** Preserve behavior. New public functions use `(required, optional = {})` where applicable, with framework-dictated signatures exempt. Inject hooks as props. No forwarding shells, new deps, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions are capped at 50 lines and complexity 10. Record files above 500 lines in `COMMIT-PLAN.md` and continue. STOP the affected sheet on a missing declaration, uncensused production importer, required cast or exceeded function cap. Same-edit test importers go in `REFRESH.md`. Use only the brief’s scoped symbol checks. Keep `.git` read-only. Run no tests, builds, installs, type checks, linters or codebase-memory tools. Keep vendor code in provider packages and framework wiring at the host. Send package/lock/new-package work to OPUS-CLOUD.

Read the cull before edits. Move bodies and rationale verbatim except for edits named in the sheet. Add only the named declarations, bindings and test cases. Preserve existing failure and retry behavior. Re-read the diff and list sheet-required deletions in root `COMMIT-PLAN.md`.


**E-C-J · CLI URL selection · merge-6 · 5k tokens**

Tests first. In `packages/cli/src/__tests__/daemon-url{,.pins}.test.ts`, replay the exact test hunks from `aa3926fdb` for flag/configured URL/discovery/default precedence, supplied map identity, empty values and skipped discovery. Mutate by moving discovery ahead of the configured URL and by sending a different env object. In `local-daemon-discovery.test.ts:118,123,132` pass the existing discovery fixture env in the first arg. In `integration-surface.test.ts:48` pass `{ env: {} }`. Existing import lines stay, including `import { resolveDaemonUrl } from '../daemon-url.js';` in `local-daemon-discovery.test.ts:9`.

Replay `aa3926fdb:packages/cli/src/daemon-url.ts:15–72` onto base `:15–81`. Replace `envVarName` with `configuredUrl?: string | undefined`, require `{ env }`, and delete `envCandidate`. In `main.ts:82,183`, retain `import { resolveDaemonUrl, type ResolveDaemonUrlOptions } from './daemon-url.js';` and call `resolveDaemonUrl({ env }, { flagUrl, configuredUrl: env[DAEMON_URL_ENV_VAR], … })` with the existing flag expression and other options. Update the two usage examples in `local-daemon-discovery.ts:11,43` to `{ env }`. Preserve the existing failure text in this sheet. The CLI public entry stays in place. Record E12 and the changed public signature in the commit plan. Cloud owes the API baseline and public examples. No visual look. STOP if a production caller lacks a host map or the precedence diff extends beyond this chain.

**E-O-J · Dev Node selector · merge-6 · 3k tokens**

Tests first. Reuse the `aa3926fdb` test hunks in `packages/devops/src/local-dev/__tests__/node-runtime.test.ts` at base `:5,9,16,24,47`, including identity of the env passed to both candidate probes. Mutation passes `{}` to `usable`. Keep `import { selectNodeRuntime } from '../node-runtime.js';` and the existing `local-dev/index.ts:2` export.

Replay `aa3926fdb:packages/devops/src/local-dev/node-runtime.ts:5–34` against base `:5–35`. Require `env` on `RuntimeInput`, remove it from `RuntimeOptions`, and take it from the first arg in `selectNodeRuntime:32`. Preserve candidate ordering and the Electron probe override. Record E29 and the `./local-dev` API signature delta. No manifest or new entry. Cloud pairs the release with E-O-T. STOP if another production probe or caller is found.


**K-04b-J · SEO cover projection · after `bl-jini` and `tq-jini2` · 10k tokens**

Tests first. In `packages/cms/src/seo/__tests__/cover-image.test.ts`, use `import { withCoverSeoDefaults } from "../cover-image.js";`. Port the featured/absent identity, library projection and explicit OG precedence cases from `tv-ext-rs-c:apps/website/src/features/seo/__tests__/cover-image-defaults.test.ts:10,18,38`. Mutations bypass the featured guard, drop the projected media ID and prefer the external URL over explicit OG. Use the existing SEO test record shape.

Set `packages/cms/src/media/cover-image.ts:10` to `featuredMediaId?: string | null | undefined;`. `SeoPostRecord` already permits explicit `undefined` at `seo/ports.ts:60`. Preserve all consumers of the widened input: the selector’s functions at `media/cover-image.ts:136,178,192,205,260` and `media/__tests__/cover-image.test.ts:5` with its existing import. This type change adds no runtime branch.

Copy `tv-ext-rs-c:apps/website/src/features/seo/cover-image.ts:1–94` to `packages/cms/src/seo/cover-image.ts`. Keep `resolveSeoCoverImage:10`, `readCoverSeoOverrides:28`, `withCoverSeoDefaults:45`, `withCoverReadDeps:65`, and `withContentImageSource:86`, including the existing narrowing assertion and argument shapes. Use these exact imports:

```ts
import type { GetEntryMetaDeps } from "./seo.js";
import type { SeoMeta } from "./types.js";
import type { SeoPostRecord } from "./ports.js";
import { collectCoverMediaRefs, resolveCoverImage, type CoverImage, type CoverMedia } from "../media/cover-image.js";
```

Direct Node entry `@jini-ai/cms/seo/cover-image` targets `./dist/seo/cover-image.{d.ts,js}`. Cloud adds or combines the manifest entry, API row and `.changeset/cms-seo-cover-image.md` after `bl-jini`, `rsh-jini` and `tq-jini2` CMS manifest changes. Injection debt delta zero. STOP if the leaf needs another package import, a new cast or an export from the universal SEO entry.

## OVER-ENGINEERING CULL (Opus) - WINS
The CULL wins over the design text above wherever they differ. Sheets the cull marks DROP / BLOCKED / NEEDS-DECISION / OWNED-ELSEWHERE are NOT done.

# Cull of r62t-ext2 (env remainder, GitHub/Lipay providers, chat redaction, arch-120 refresh, redos) — over-engineering judge

Input: `cull-inputs-2/designs/r62t-ext2.md`. Bases: Jini `d3e78b387`, Tovu `776ce6d0f` (merge-6); branches read: Jini `aa3926fdb` (donor, exists), Tovu `origin/codex/tv-ext-rs-c`, `origin/codex/tv-tq` (`f54179c73`). Read-only; no tests or builds.

Counts (10 source sheets): **KEEP 4** (E-O-T, K-04b-T, T1, L15.8) / **CUT-TO 3** (E-C-J, E-O-J, K-04b-J) / **DROP 2** (E-NLWeb, E-Notes) / **BLOCKED 1** (E-V-J). Table rows (env ledger, providers, arch, run-finalizer, a09, B09, a16, L4/L5): agree with the design's BLOCKED / PARTIAL / OPUS-CLOUD / RETIRE.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| E-C-J CLI URL | CUT-TO | merge-6 | The only ambient read is `daemon-url.ts:54` `options.env ?? process.env`; `main.ts:176,185` already passes `env`. Requiring `{ env }` clears E12. Replacing `envVarName` with a new `configuredUrl` option and replaying donor `.pins` hunks is an API redesign E12 does not need. |
| E-O-J Node selector | CUT-TO | merge-6 | Right change (`node-runtime.ts:32–33` `env = process.env` default). Cut the donor test replay to the existing cases repointed + one identity case. |
| E-V-J FFmpeg inputs | BLOCKED (E-V-T) | — | Makes three args required on a public `./media/node` API whose Tovu binding (E-V-T) is still PARTIAL; design itself holds publication. Dispatch both halves together once E-V-T's caller list (`media-video-ports.ts:16`, `tool-catalog-manifest.ts:367`) is pinned. |
| E-NLWeb | DROP | — | `examples/nlweb-demo/src/server.ts:15` is an entry script nobody imports. A private `startFromEnvironment()` + direct-entry guard + new test only moves the read out of module scope to satisfy the AST gate; the sibling row E66 in the same file stays KEEP anyway. Mark E67 KEEP (entry script). |
| E-Notes | DROP | — | Same: `examples/notes-app/src/main.ts:13–15` is the entry (`node src/main.ts`), with a 43-line subprocess test proposed. Mark E69/E71 KEEP (entry script); E68/E70 already KEEP. |
| K-04b-J SEO cover | CUT-TO | needs `bl-jini`, `tq-jini2` | Real generic leaf (`tv-ext-rs-c:apps/website/src/features/seo/cover-image.ts`, 94 lines, no product names). Cut the Jini tests: all three Tovu suites import the Tovu fixture `../../post/__tests__/post-record.fixture.js`, so they stay in Tovu (repointed by K-04b-T); porting 3 cases duplicates them. New `./seo/cover-image` node entry is justified (`./media/cover-image` is `node`, `./seo` is `universal`; `cms/package.json:63,84`) → cloud. |
| E-O-T | KEEP | needs E-O-J release | One argument at `development/scripts/dev.mjs:861` (verified). |
| K-04b-T | KEEP | needs K-04b-J release, `tv-b1`, `tv-ext-rs-c`, `tv-xd5-render` | Importer list verified on `tv-ext-rs-c` (3 tests direct, `page-head-contributor.ts:2` direct, routes via `#src/features/seo/index`, export at `index.ts:26`). |
| T1 theme validator | KEEP | needs `tv-xd5-publish`, `tv-tq`, `tq-jini2` release | Still open: on `tv-tq` (`f54179c73`) `validate-theme-package.ts:8` still imports `./manifest-v2.js`. |
| L15.8 | KEEP | needs K-04b-T, `tv-bl`, `tv-xd5-render`, `tv-ext-rs-c` | One barrel line + one import (feature public entry, not a shell). |

## Exact cut text

### E-C-J (Jini `packages/cli/src/`)
1. `daemon-url.ts`: signature becomes `resolveDaemonUrl(required: { env: NodeJS.ProcessEnv }, options: ResolveDaemonUrlOptions = {})`; delete the `env?` member (and its doc line) from `ResolveDaemonUrlOptions`; `:54` becomes `const { env } = required;`. Keep `envVarName`, `envCandidate`, the precedence chain and the error text unchanged.
2. `main.ts:183`: `resolveDaemonUrl({ env }, { flagUrl: daemonUrl ?? null, envVarName: DAEMON_URL_ENV_VAR, ...(discover !== undefined ? { discover } : {}), warn })` (drop `env` from the options object).
3. Tests (edit before source): every `resolveDaemonUrl({}, …)` in `__tests__/daemon-url.test.ts`, `daemon-url.pins.test.ts`, `local-daemon-discovery.test.ts`, `integration-surface.test.ts` passes the env it previously put in options as `{ env }` (or `{ env: {} }` where none). Add one case: the supplied `env` object is the one handed to `discover` (identity). Mutation (cloud): pass `{}` to `discover`.
4. Docs: `README.md:53`, `docs/spec/api.spec.md:38,107`, `local-daemon-discovery.ts:11,43`, `packages/sidecar/src/daemon-registry.ts:167` read `resolveDaemonUrl({ env }, …)`.
5. BREAKS: `@jini-ai/cli` public `resolveDaemonUrl` signature (callers must pass `{ env }`). Cloud: API baseline + changeset.

### E-O-J (Jini `packages/devops/src/local-dev/node-runtime.ts`)
As design (env into `RuntimeInput`, out of `RuntimeOptions`, read from the first arg at `:32`). Tests: repoint existing `__tests__/node-runtime.test.ts` calls to pass `env` in the first arg; one added case asserts the supplied env object reaches both `usable` probes. No donor replay beyond that. BREAKS: `./local-dev` `selectNodeRuntime` signature (only caller: Tovu `dev.mjs:861`, fixed by E-O-T).

### K-04b-J (Jini `packages/cms/src/`)
As design (copy to `seo/cover-image.ts` verbatim with the four named imports; widen `media/cover-image.ts:10` to `featuredMediaId?: string | null | undefined;`). **Delete the "Tests first" paragraph: no Jini test file.** The three Tovu suites (`cover-image-{defaults,resolve,source}.test.ts`) remain the pins via K-04b-T; cloud runs the mutations there. Cloud adds the `./seo/cover-image` (node) entry, API row and changeset.

### E-NLWeb, E-Notes
Not done. Ledger: E67, E69, E71 → KEEP with reason "example entry script; reads its own start-up env".

## BUGS
None confirmed in these sheets.

## NEEDS-DECISION
- **RD-T2** — flip the two public-DKIM assertions (`credential-chat-intake.unit.test.ts:51`, `credential-noise.unit.test.ts:38`) to "DKIM survives", and prefix the opaque positive at `:59` with `sk-`, after `jb1`+`jb2` release? **Recommend: yes** (owner 11-20: SIMPLE redaction only; public DKIM is not a secret). Test-only, Tovu, after the cloud lock bump.
- **Run-finalizer F3** — add a persisted terminal marker? **Recommend: not yet.** First land C16/C17 (and C9/C10) as failing tests on the combined tree; add a marker only if a test proves a finished run and a dead unfinished run are indistinguishable from existing rows. No new persisted field on a hypothesis.
- **E-NLWeb/E-Notes ledger** — accept example entry scripts as KEEP rows instead of guards? **Recommend: yes** (never raises debt; no new code).
- **GitHub / Lipay → provider plugins** — owner approved; stays **CLOUD** (cross-package runtime edges: `registry/src/index.ts:21–22,30–31`, `commerce/.../lipay-gateway.ts:23` used by `testkit/lipay-fake.ts:113,162`; held `agentic/.../install-service.ts`). Plugin ids land as `jini/<id>` per owner 11-20.
