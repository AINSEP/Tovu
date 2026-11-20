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
