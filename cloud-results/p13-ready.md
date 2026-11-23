DONE

# P13 ready steps — C1, C2, S1, S2, S4, S5 (2026-11-23)

Branches: Jini `codex/p13-ready-jini` (base `origin/integ/merge-14-2026-11-22` `4902a6a1a`), Tovu `codex/p13-ready-tovu` (base `origin/integ/merge-13-2026-11-22` `f7185f153`). Tovu was linked to the local Jini (`link-jini.mjs`, `JINI_PACKAGES_DIR=/home/user/Jini/packages`; link state is gitignored and was not committed).
Programmer skills read before any work: `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.5), confirmed. All steps were tests-first, and each behaviour change has a named mutation that went red and then green after revert.
Builders: the coordinator did C1 and C2. Two opus-high subagents did S1/S4/S2 and S5. Jini has 8 commits and Tovu has 7, plus this report.

Scope comes from Tovu `origin/plan/whats-left-1122:reviews/plans1123.md` §P13-gaps:
- **Built:** C1, C2, S1, S2, S4 and S5, the steps marked READY WITH FIXES, with every listed fix applied.
- **Skipped:** C3, S3 and D1–D2 (NEEDS), and A1 (waits for R3.T and the kit merge).

## Gates (final, on the full tree)

**Jini:**
- `pnpm --filter` build passed for cli, chat, ui and devops.
- `pnpm typecheck` (whole repo) exit 0.
- `pnpm guard` exit 0: "zero violations found in packages/".
- `pnpm api:check` exit 0. It reports additions only.
- Changed vitest suites:

| Suite | Result |
|---|---|
| cli: outcome, program-run, introspection-print and barrel | 27/27 |
| cli: full suite, run earlier | 630/630 |
| chat: `src/embed-widget` | 21 files, 214/214 |
| ui: i18n and integration-exports | 71/71 |
| devops: `src/checks` | 392/392 |

**Tovu:**
- Root `tsc --noEmit` exit 0. The baseline was also 0, after building `packages/{contracts,sdk}` locally.
- `apps/site-chat` `tsc --noEmit` exit 0.
- CLI tests (10 files: errors, help, introspect, export, plugin, serve-export teardown): 82/82.
- site-chat tests (Header, Widget, Activation, i18n, vanilla-host×3, check-bundle-mounts): 51/51.
- The full site-chat suite, run by the S5 builder, was 164/165. The one failure is `site-assistant-transport.test.ts` ("Incompatible React versions: react vs react-dom"). That file imports nothing these steps touched, and it is a forbidden in-flight file. I did not check it on the base, so treat it as a linked-environment issue that is not yet attributed.

## Per step

### C1 · CLI outcome mapper and bin run loop

**Commits:**
- Jini `09ffe9624`.
- Tovu `75212eb86`. The `help.ts` deletion was swept into `dc583b928` by a shared-index race; the content is correct.

**Jini changes (`packages/cli`):**
- New `src/cli-outcome.ts`: `createCliOutcomeMapper`, `createParserClassifier`, `mapParserError`, `mapCodedError`, `formatStderrLine`, `PARSER_VALIDATION_CODES` and `PARSER_SUCCESS_CODES`.
- New `src/program-run.ts`: `runCliProgram`, `printBareUsage` and `printUsage`.
- Both are added to the barrel.
- README gains a "What you get" entry and a `## Wiring` section.
- Changeset `p13-c1-cli-outcome.md`.

**Review fixes applied:**
- **Classifier order is now host data.** The parser classifier is one entry in the host's ordered `classifiers`. Tovu orders them plugin-install → parser → site-dir, matching the old `errors.ts:178–190`.
- **Process effects are bound in `main.ts`.** Tovu passes stdout, stderr and exit. `runCliProgram` has no `process` defaults.
- **Exact `^error:\s*` stripping is kept.**

**Tovu changes:**
- `errors.ts` keeps its registry, the site-dir, plugin and coded classes, and the exported `mapErrorToCliOutcome` name and signature.
- New `createTovuCliOutcomeMapper({}, { siteDirClassifier })` exists so the classifier order can be tested.
- New `cli/INFO.md` with a `## Wiring` section.

**Tests:**
- Jini `cli-outcome.test.ts` (12) and `program-run.test.ts` (7).
- Tovu `errors-classifier-order.unit.test.ts`, which contains «Parser classification wins over a matching later classifier».
- `help-streams.unit.test.ts` now points at the Jini printers with Tovu's process binding. Its assertions are unchanged.

**Mutations:**

| Mutation | Red | Reverted |
|---|---|---|
| Jini: `printUsage: true` | `× only unknownCommand sets printUsage` | 12/12 |
| Jini: reversed classifier order | `× Parser classification wins over a matching later classifier` | 12/12 |
| Tovu: swapped parser and site-dir | `not ok 1 - Parser classification wins over a matching later classifier` | 2/2 |

**Removed from Tovu:** `apps/website/src/cli/help.ts`.

### C2 · Introspect printer

**Commits:** Jini `269a3adfd`, Tovu `f5217041a`.

**Jini:** `printIntrospection` and `INTROSPECTION_FORMATS` in `@jini-ai/cli/introspection`. That entry is universal, so `output` and `invalid` are required ports. README and Wiring are updated, plus changeset `p13-c2-cli-introspection-print.md`.

**Tovu, review fix applied:** `TOVU_TOOL_PREFIX` is in the surviving `cli/introspect.ts`, and `commands/introspect.ts` is deleted. `program.ts` binds stdout and the `ValidationError` factory. The repointed `introspect-command.unit.test.ts` asserts:
- the exact MCP names (`["tovu_init"]`, and `tovu_storage_move` through the real `createProgram()` action);
- the exact validation text through the real action.

Two stale comment references were updated: `commands/theme/validate.ts` and `development/docs/ai-first-docs-checklist.md`.

**Tests:**
- Jini `introspection-print.test.ts`: 6/6.
- Tovu introspect unit, unit and integration: 13/13.

**Mutation:** dropping `'mcp'` from `INTROSPECTION_FORMATS` turned `× mcp format prints toMcpTools(manifest, prefix)` red (3 red in total). Reverted: 6/6.

**ST-16:** no ST-16 report branch exists on origin (`git ls-remote` shows no st-16 or storage head), so there was nothing to rebase onto. The `program.ts` edit is limited to the introspect action and imports. It is still listed as serialize-with-ST-16.

**Removed from Tovu:** `apps/website/src/cli/commands/introspect.ts`.

### S1 · Escape-key port

**Commits:** Jini `08c443c1e`, Tovu `dc583b928`.

**Jini:** `packages/chat/src/embed-widget/react/escape-key-port.ts` provides `createViewEscapeKeyPort({ view }, _optional = {})`, exported from `react/embed`. New `embed-widget/README.md` with `## Wiring`, used instead of `chat/README.md`, which is a conflict file. Changeset `p13-s1-s2-chat.md`.

**Review fix (real host dialog):**
- The dialog is closed by Jini `dialog.hooks.ts` `useEmbedChatDialog`. It listens in the bubble phase and honors `defaultPrevented`, so there is no bug.
- The Jini test mounts the real dialog with the header and asserts that Escape during the discard step leaves the dialog open, and that a second Escape closes it.
- The Tovu test does the same inside the real `useSiteAssistantSurface`.

**Tests:**
- Jini `escape-key-port.test.tsx`: 6/6.
- Tovu `SiteAssistantHeader.test.ts`: 14/14.

**Mutations:**
- Removing `preventDefault`: 2 red in Jini, and in Tovu `not ok 12 - Escape during the discard step cancels it and the visitor dialog stays open`.
- Using the bubble phase: 3 red.
- Making the dialog ignore `defaultPrevented`: the stays-open test went red.
- All reverted to green.

**Removed from Tovu:** none.

### S4 · Visitor i18n onto core and the Jini locale

**Commits:** Jini `817de491b` and `e5bc19a34`, Tovu `16c562809`.

**Jini:**
- New React-free subpath `@jini-ai/ui/i18n/locale` (universal).
- `locale.ts` is declared `jini.isolation.shared`, which fixed 6 `SI-domain` guard findings.
- New `features/i18n/README.md` with `## Wiring`, and changeset `p13-s4-ui-locale.md`.

**Tovu:** `site-chat-i18n.ts` uses `createDictionaryTranslator` and `interpolate` from `@jini-ai/core/text`, and `resolveSystemLocale`. The `{ locale, t }` shape and the dictionary are unchanged. A vanilla build through the no-React guard passed.

**Tests:** `site-chat-i18n.test.ts`, 7/7:
- `pt resolves to pt-BR` and `zh-Hant resolves to zh-TW` were red first.
- The unknown-key and `constructor` tests are characterization tests; they passed before the change.

**Mutations, including the review's script-specific fix:**

| Mutation | `pt` test | `zh-Hant` test |
|---|---|---|
| Remove the base-language fallback | `not ok 5 - pt resolves to pt-BR` | `ok 6 - zh-Hant resolves to zh-TW` |
| Remove only the Hant→TW script mapping | `ok 5` | `not ok 6 - zh-Hant resolves to zh-TW` |

The Jini test for the script mapping also went red under that second mutation. All reverted.

**Removed from Tovu:** none.

### S2 · Safe visitor markdown renderer

**Commits:** Jini `3432f49f0`, Tovu `0b8515a7c`.

**Jini:** `packages/chat/src/embed-widget/vanilla/safe-markdown.ts` provides `createSafeMarkdownRenderer({ toHtml, document }, { origin } = {})`, exported from `./vanilla`.

**Review fixes applied:**
- **Trusted-renderer contract.** The `toHtml` doc spells out the contract: escape raw HTML, reject unsafe protocols, never enable `allowDangerous*`. The renderer only removes images and hardens links.
- **Origin check.** Image URLs are resolved against `document.baseURI` and compared against `document.location.origin`, or an injected origin.

**Tovu:** keeps micromark, the GFM options and the footnote-disable list as the injected `toHtml`. The `createSiteVanillaArgs` signature is unchanged.

**Real bug fixed:** the new Tovu test `an external base element cannot authorize an external visitor image` was red on the old Tovu code, which compared against the base URL's origin.

**Tests:**
- Jini `safe-markdown.test.ts`: 9/9, including «An external base element cannot authorize an external image».
- Tovu vanilla-host×3: 13/13.

**Mutations:**
- Keeping cross-origin images: 4 red.
- Comparing against `new URL(baseURI).origin`: 2 red, including the base-element test.
- Filtering after insertion: 1 red.
- All reverted.

**Removed from Tovu:** none.

### S5 · Built-bundle mount smoke harness

**Commits:** Jini `f39342f86` and `d23c95271`, Tovu `1f647f320` and `8bfeaf3ba` (the INFO line).

**Deviation from the plan:** `packages/devops/package.json` is changed on `codex/ex7-deploy-desktop-jini`, so there is no new `./build/bundle-mount-smoke` subpath. Instead the module is `packages/devops/src/checks/bundle-mount-smoke.ts`, exported from the existing `@jini-ai/devops/checks/node` entry. This is recorded in `devops/source-map.md`. README, API.md, `checks/README.md` (`## Wiring`) and changeset `p13-s5-devops-bundle-smoke.md` are updated.

**Review fixes applied:**
- **Fresh DOM and disposal.** Each scenario gets a fresh DOM, and `dispose()` runs in a `finally`. A test covers 6 exit paths, each disposed exactly once.
- **Injected effects.** The `wait` timer port is injected, and so are the CLI effects (`readText`, `check`, `error`, `exit`). There is no `process` in Jini.
- **Tovu scenarios run against the released entry.** The scenarios, mount id, storage keys and the jsdom `createDom` stay in Tovu.
- **Neutrality rename.** `__tovuScrollIntoView*` → `__jiniScrollIntoView*`.

**Tests:**
- Jini `bundle-mount-smoke.test.ts`: 14/14.
- Tovu `check-bundle-mounts.test.ts`: 11/11. Six harness-only tests moved to Jini and one jsdom-binding test was added.
- A real `vite build` followed by `node scripts/check-bundle-mounts.mjs` printed 5 OK scenarios and exited 0. The built `dist` was deleted afterwards.

**Mutations:**
- Skipping the post-settle `failOnErrors`: `× an error after evaluation is a post-mount failure`.
- Moving `dispose` out of the `finally`: `× each scenario gets a fresh DOM that is disposed exactly once on every exit path`.
- In Tovu, making `createJsdom`'s dispose a no-op: `not ok 2`.
- All reverted.

**Removed from Tovu:** none. The script went from 353 to 225 lines and the `.d.mts` shrank.

## Skipped (not built)

| Step | Verdict | Why |
|---|---|---|
| C3 | NEEDS | Inject `isAbsolute` and byte measurement, and settle the POSIX policy. Also `commands/owner-store.ts` is changed on `ex6-fnd-shared-b-tovu`. |
| S3 | NEEDS | Bridge identity, dispose and parent-origin fixes are still open. |
| D1–D2 | NEEDS | Waiting on the owner decision about the unused pane (Q10). |
| A1 | READY WITH FIXES, but waits | Waits for R3.T and the kit merge (`ex5-fnd-kit-tovu`). |

## Conflicts avoided, and follow-ups for the owner

**Files I did not edit because in-flight heads change them:**
- Jini `packages/chat/README.md`. Wiring went into `embed-widget/README.md` instead.
- Jini `api-baseline/jini-ai__{chat,ui,devops}.json`. Additions never fail `api:check`. `jini-ai__cli.json` was also left un-regenerated, to avoid an `api:update` touching every baseline.
- Jini `packages/devops/package.json`. S5 uses the existing entry instead.
- Tovu `development/scripts/error-gate-debt.json`. Its `catch-reads-error` entry for `apps/site-chat/src/vanilla-host.ts` (value 1) should be ratcheted down now that the catch lives in Jini; `check-error-gate` reports it as improved.

**Serialization still owed:**
- S2's `vanilla-host.ts` edit with BX-3.T, BX-13.T, BX-15.T, P6-T2 and P13-S3.T.
- S1.T and S3.T before BX-8.T.
- The S5 devops manifest and API with `ex4-desktop-jini`, `ex4-deploy-jini` and BX-17.J. BX-18 should reuse `isEntryPoint` from `@jini-ai/devops/checks/node`.
- C2 `program.ts` with P11 ST-16.

**Other follow-ups:**
- **Undeclared dependency.** `apps/site-chat/package.json` does not declare `@jini-ai/devops`. `check-bundle-mounts.mjs` resolves it through the root `node_modules`. Declaring it means a lockfile change, which was not done.
- **Possible Jini core bug.** Core `interpolate` uses `key in vars`, so a `{constructor}` placeholder with empty vars resolves to an inherited property. The old Tovu code had the same flaw. A suggested fix is `Object.hasOwn`. Not done here.
- **Stale debt in an off-limits file.** `pnpm guard` prints "[hardwiring] 2 stale debt occurrences; remove them from scripts/env-access-debt.json". This is pre-existing and was not touched.
- **Untested signature changes.** `@jini-ai/cli` and `@jini-ai/ui` changed signatures from the plan text to follow the args rule: `toHtml({ content })`, `createDom({ html, url })`, and parser/required ports in the first object. Consumers outside Tovu were not tested.
