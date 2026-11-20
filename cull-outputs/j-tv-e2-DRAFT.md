BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20). Do not dispatch until the Jini halves (E-O-J, K-04b-J from codex/e2-jini; J1 from codex/tq-jini2) are released into the Tovu lock by the OPUS-CLOUD run.
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Tovu clone, branch codex/tv-e2, HEAD = Tovu integ/merge-6-2026-11-19 (776ce6d0f) combined with origin/codex/tv-b1, tv-ext-rs-c, tv-xd5-render, tv-xd5-publish, tv-tq, tv-bl (coordinator combine).
TASK (TOVU ONLY; in this order; no sidekicks/subagents): E-O-T, T1, K-04b-T, L15.8 EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them (all four are KEEP: the design text below is the sheet); the CULL wins. NOT done: E-V-T, RD-T2 (pending), every PARTIAL/CLOUD row. Import exactly the Jini exports/paths; no version pins or lock edits. Repoint callers, delete the Tovu copies (no shells). Unlisted TEST importers needing only the same repoint: include them, record in REFRESH.md. Tests first.
BASES per sheet: E-O-T needs E-O-J release; T1 needs tv-xd5-publish + tv-tq + tq-jini2 release; K-04b-T needs K-04b-J release + tv-b1 + tv-ext-rs-c + tv-xd5-render; L15.8 needs K-04b-T + tv-bl.
STOP rules: per sheet as in its design text (E-O-T: paired signature differs or another production caller; T1: missing Jini export or new production importer; K-04b-T: worker-import-graph or worker budget concern noted for combine; L15.8: new cycle). K-04b-T keeps the three cover-image test suites (they use the Tovu post-record fixture), repointed only.
COMMIT-PLAN.md: one entry per sheet with its base. Commit per sheet; message `tv-e2: <sheet id> …`.

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


### Tovu

Paths below start at `apps/website/src` unless specified.

**E-O-T · Dev launcher binding · after E-O-J and its cloud release/lock bump · 2k tokens**

In root `development/scripts/dev.mjs:861`, add `env: process.env` to the first object passed to `selectNodeRuntime`. Keep `import { selectNodeRuntime } from "@jini-ai/devops/local-dev";` at `:55`. This is the sole scoped Tovu call. Existing Jini probe-map test supplies the mutation proof. Cloud owes one dev launch through selected Electron-as-Node and one Node fallback. No host test edits, debt edits or new manifest entries. STOP if the paired public signature differs or another production caller surfaces.

**K-04b-T · SEO callers · after K-04b-J is consumable, `tv-b1`, `tv-ext-rs-c` and `tv-xd5-render` · 5k tokens**

Tests first. Change the following import lines to `import { <names> } from "@jini-ai/cms/seo/cover-image";`, preserving the listed symbol order.

| Importer | Names |
|---|---|
| `features/seo/__tests__/cover-image-defaults.test.ts:6` | `withCoverSeoDefaults` |
| `features/seo/__tests__/cover-image-resolve.test.ts:10` | `resolveSeoCoverImage, withCoverReadDeps` |
| `features/seo/__tests__/cover-image-source.test.ts:11` | `withContentImageSource, withCoverSeoDefaults` |
| `features/seo/page-head-contributor.ts:2` | `withCoverReadDeps` |
| `server/inbound/admin-http/routes/seo/get-entry-analyze.ts:4` | `withCoverReadDeps` |
| `server/inbound/admin-http/routes/seo/get-entry.ts:4`, `put-entry.ts:14` | `withContentImageSource, withCoverReadDeps` |

Delete `features/seo/cover-image.ts` and its forwarding export at `features/seo/index.ts:26`. Cloud mutations admit trashed media, drop stored-override precedence and admit an external image into JSON-LD. The existing resolve, source and `cover-image-head.test.ts:84` pins cover them. No debt changes. Chrome owes body cover, explicit override and no-cover. STOP the deletion at combine if `worker-import-graph.test.ts` or either worker budget fails.

**T1 · Theme manifest validator · after `tv-xd5-publish` and `tv-tq`, against `tq-jini2` · 7k tokens**

`tv-xd5-publish` `23c00b5bc9` supplies `features/theme/template-applicability-errors.ts:3` and its `theme-manifest.ts:9` importer. Jini `themes/manifest-v2.ts:9,243` and `themes/template-applicability.ts:54` supply the replacements.

Tests first. In `features/theme/__tests__/template-applicability.unit.test.ts`, delete the three cases at `:53–61,63–68,70–75` ported to Jini. Repoint the imports to:

```ts
import { applicableThemeTemplates, parseTemplateFor, rejectTemplateFor } from "@jini-ai/cms/themes/template-applicability";
import { validateManifestV2 } from "@jini-ai/cms/themes/manifest-v2";
import { validateScripts } from "@jini-ai/cookie-consent/policy";
import { isSourceDirGeneratedConflict } from "../theme-file-policy.js";
```

Pass `validateScripts` and `isSourceDirGeneratedConflict` to the invocations at `:28,48`. In `__tests__/declared-scripts.unit.test.ts:8,37–38`, use the same last three imports and dependencies. Keep the invalid `templateFor` and unknown consent-category assertions. Mutations skip the `templateFor` check and return no script problems, respectively. Delete the ported `validation/__tests__/manifest-v2.test.ts`.

In `validation/validate-theme-package.ts:8,11,16,177` import `validateManifestV2, type ThemeValidationIssue` from `@jini-ai/cms/themes/manifest-v2`, `validateScripts` from `@jini-ai/cookie-consent/policy` and `isSourceDirGeneratedConflict` from `../theme-file-policy.js`. Supply both dependencies. Remove only `ThemeValidationIssue` from the profiles import and export. In `validation/{markup.ts:2,references.ts:4,structure.ts:7,webmcp-markup.ts:2}` use `import type { ThemeValidationIssue } from "@jini-ai/cms/themes/manifest-v2";`. Delete the declaration at `validation/profiles.ts:33–37` and its forwarding member in `features/theme/index.ts:29` on `tv-xd5-publish`. Repoint `theme-manifest.ts:9` to `import { rejectTemplateFor } from "@jini-ai/cms/themes/template-applicability";`.

Delete `validation/manifest-v2.ts` and `template-applicability-errors.ts`. Delete only the validator-path entry in root `development/scripts/coverage-integrity-baseline.json:56` on `tv-xd5-publish`. Record the error-gate row for combine. STOP on a missing Jini dependency export or a newly surfaced production importer. Run the existing worker and bundled-theme pins in combine.

**L15.8 · SEO public entry · after K-04b-T, `tv-bl`, `tv-xd5-render` and `tv-ext-rs-c` · 2k tokens**

Add `export { createSeoPageHeadHook } from "./page-head-contributor.js";` to `features/seo/index.ts`. Change `server/inbound/public-http/routes/site/pages/extra-head.ts:1` to `import { createSeoPageHeadHook } from "#src/features/seo/index";`. The existing `features/seo/__tests__/cover-image-head.test.ts:9` direct import remains the unit pin. No test edits. The combine mutations restore the deep import for the boundary gate and drop the cover in the existing OG/JSON-LD pin. No debt-row edit. STOP on a new cycle or any failure in the worker graph or budget. Share K-04b-T’s Chrome look.

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
