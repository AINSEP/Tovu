# S0 — branch, base outputs, gate proofs, characterization pins (no product source change)

Responsibility: make every risk in DESIGN §4 able to fail **before** any code moves, and prove every gate fails closed. Budget ≤220k tokens. Commits: 8-10. Rules: COMMON (revision 2).

## Prerequisites (fail closed)
```bash
set -euo pipefail
git fetch -q origin refactor/terra refactor/import-cycle-b refactor/error-e0-e2 plan/design-deps-split-2026-11-17 wave2/daemon-r8
git merge-base --is-ancestor origin/refactor/import-cycle-b origin/refactor/terra || { echo "STOP-BASE terra lacks import-cycle-b: branch from origin/refactor/import-cycle-b and say so in the report"; exit 1; }
mb=$(git merge-base origin/wave2/daemon-r8 origin/refactor/terra)
git diff --quiet "$mb" origin/wave2/daemon-r8 -- apps/website/src/server/runtime/composition/deps.ts || { echo "STOP-H1-STEP3 a daemon lane edits deps.ts"; exit 1; }
if git merge-base --is-ancestor origin/refactor/error-e0-e2 origin/refactor/terra; then echo "E2 in base"; else echo "NOTE: E2 not in base (blocks E3 only, not S0-S13)"; fi
```

## Steps
1. `git switch -c refactor/deps-split origin/refactor/terra`; `git checkout origin/plan/design-deps-split-2026-11-17 -- designs/deps-split`; commit "chore(plan): vendor deps-split design rev2 + gates". (Not through `gates.sh commit`: nothing is captured yet.)
2. `export DS_SHEET=S0`; COMMON §1 `setup`; `gates.sh refs-record`; `gates.sh selftest` (must print `selftest: every planted case fired…`); `gates.sh freeze` with the index clean (expect the three listed lanes as `allowed`, NOTE lines for lanes already conflicting with the base, exit 0). Save the three transcripts to `work/base-outputs/{refs.env,selftest.txt,freeze.txt}`.
3. **Real plants**, each on the unmodified tree, each restored before the next (`git restore --staged --worktree <path>` for edits; `rm` for new files; `git status --porcelain` must be empty after each). Each must exit non-zero with a `STOP-` line; save all output to `work/base-outputs/planted-real.txt`:
   - tsc: new file `composition/zz-plant.ts` with `export const x: number = "a";` → `gates.sh newlines tsc` (needs step 4's base first: run step 4, then the plants).
   - boundaries: new file `features/zz-plant/index.ts` importing a deep path of another feature that `check:boundaries` forbids today (copy one of the 15 base `no-deep-imports` sources) → `gates.sh newlines check:boundaries`.
   - tests: new `composition/__tests__/zz-plant.test.ts` with `test("plant", () => { throw new Error("planted"); })` → `gates.sh tests sr`.
   - limits: new staged file with a 51-code-line function → `git add` it, `gates.sh limits`.
   - shape + imports: new `composition/site-deps/zz-plant.ts` with `let x = 1;` and `import { createApp } from "../app.js";` → `gates.sh shape`, `gates.sh imports`.
   - imports order: move `import { createApp } from "./app.js";` above the `exportSite` import in `deps.ts` → `gates.sh imports`.
   - loggers: add `createConsoleLogger({ prefix: "" });` to a production file under `composition/` → `gates.sh loggers`.
   - why-comments: delete one `//` why-comment line from `deps.ts`, commit it on a throwaway branch, run `gates.sh why`, drop the branch.
4. `gates.sh base-capture` on the unmodified tree; commit `work/base-outputs/` ("chore(deps-split): base outputs at <TOVU_BASE>"). Then step 3's plants; commit `planted-real.txt`.
5. Characterization pins under `apps/website/src/server/runtime/composition/__tests__/` — one commit each, through `gates.sh commit`. Each pin is shown **red once** by the named mutation of product code (applied, test run, output saved, mutation reverted, never committed); record mutation + red output in the report. Boot recipe for every integration pin: the one `deps-project-credentials.integration.test.ts:27-49` uses (temp `sitesHome`/`home`, real `openProjectStore`, `createSiteRouteDeps({}, { dbPath: <siteDir>/content.db, overrides })`, `close()` in `t.after`). No `vi.mock`, no `mock.module` of a package's internals: fakes enter only through `overrides` and the fixtures named here.

| pin file | asserts (characterized on the base, never invented) | mutation that must turn it red |
|---|---|---|
| 1 `site-root-route-deps-shape.pin.test.ts` + `__fixtures__/site-root-route-deps-shape.snapshot.json` | observed `Object.keys(routeDeps)` in order + `typeof` per key after `createSiteRouteDeps` resolves. The snapshot is **written from the running base** (`DS_WRITE_SNAPSHOT=1` path in the test, used once, then committed); its length is whatever the base produces (253 literal keys + spread keys + post-assembly keys; 15 writes hit 14 keys) | swap two adjacent named keys of the literal (`posts-chat` run) |
| 2 `site-root.overridden-capabilities.pin.test.ts` | a principal removed via `routeDeps.removeUser` is reported by `routeDeps.isInTrash`; `removePlugin`, `removeTheme`, `removeMember` each create a row visible through `routeDeps.trash` | move `...identity` below `isInTrash` in the literal |
| 3a `site-root.shared-oauth-binding.pin.test.ts` | with the `acme-provider` fixture's shared OAuth app (`fixtures/acme-provider.ts`: `startAcmeProvider`, env from `agent-plugin-connections.vertical-slice.test.ts:70`) and a shared-OAuth key seeded through the opened project store's own vault port (the object `deps.ts` passes as `projectStore.vault.repo`), `routeDeps.projectKeys.use({ keyId, use: true })` reaches `apiConnections.host.sharedOAuth.bind`: assert the base outcome verbatim (resolved effect or the bind's own error text). If seeding a shared-OAuth row needs a port the project store does not expose, STOP-SEAM with the exact missing method (do not add one) | delete the `bindSharedApiOAuth = …sharedOAuth?.bind` line → `use` rejects with "Shared connections are not available yet. Reopen this saved connection and try again." |
| 3b `plugin-runtime.host-lookup.pin.test.ts` | `composePluginRuntime({ …same inputs as plugin-host.integration.test.ts:82…, getPluginHost: () => cell })`: while `cell` is `undefined` the SDK `lookup` (`plugin-runtime.ts:87`) yields no host; after `cell = host` the same runtime sees it (read at call time) | in `plugin-runtime.ts`, read `getPluginHost()` once at construction (revert after) |
| 3c `composition-boot-order.unit.test.ts` (extend) + `site-root.lifecycle-buffer.pin.test.ts` | source order in `composeSiteRouteDeps`: `formCollectionProviders = ` < `setServerLogTraceReader(` < `lifecycleTracker = tracker` < `flushLifecycleEvents(`; behaviour: `bufferingTracker` + `flushLifecycleEvents` with a recording fake flush buffered events once, in order, and later events go straight to the tracker | swap the `lifecycleTracker =` and flush lines |
| 3d `site-root.form-resolver-fallback.pin.test.ts` | with a fake `overrides.bootProviderPlugins` whose ports return `formCollectionProviders: () => <registry with one fake collection>`, the core form-collection resolver registered by `wireCoreResolvers` answers with that collection after boot (call-time read through `formCollectionProviders()`); before provider boot the root's arrow returns the empty registry (unit: the moved-up arrow) | make `wireCoreResolvers`' input read `formCollectionProviders()` once at wiring time |
| 3e `composition-boot-order.unit.test.ts` (extend) | source order: `provideMediaCredentials` is called after `pluginRuntime.attachEnabledPluginsAtBoot()` and after the boot drain starts (2822-2831) | move the credential call above the attach |
| 4 `site-root.boot-chains.pin.test.ts` | recording wrapper over `overrides.store`'s settings definition writes: the 12 `ensure*` definitions in order (`siteSettingsReady` chain, 1153-1171); `installCommentsDataModule` starts after `newsletterReady` settles (1216-1237) | swap two `.then` links |
| 5 `site-root.teardown.pin.test.ts` | recording `overrides.store`, fake `bootProviderPlugins` with recording `dispose`, real `openProjectStore` wrapped to record `close`: after `close()`: boot drain finished before any registration ran; every registration (incl. a promised one) ran before the store's `close`; owner sweeps stopped before `close`. No order **among** registrations (`Promise.all`, 705) | call the store close before the registrations in `openCompositionStore` |
| 6 `composition-boot-order.unit.test.ts` (widen) | the top-level-await regex becomes `/^  (?:if \([^\n]*\) )?(?:const [^=]+= )?await[^\n]*/gm` and the expected list gains the owner line `  if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles(…)` (5 awaits after the first boot promise); the prelude asserts `await warnCompositionChatOrphans(` as the root's await **and** `await warnOnOrphanedChatRows(` inside the wrapper; the description says five | delete the `await` before `protectExistingFormFiles` |

6. Report per COMMON §8. Refresh nothing in `work/*.tsv`.

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"
$G forbid S0-NO-PACKAGE-MOCKS 'vi\.mock|mock\.module\(' apps/website/src/server/runtime/composition/__tests__/site-root.*.test.ts apps/website/src/server/runtime/composition/__tests__/plugin-runtime.host-lookup.pin.test.ts
base=$(sed -n 's/^TOVU_BASE=//p' designs/deps-split/work/base-outputs/refs.env)
changed=$(git diff --name-only "$base" HEAD -- apps/website/src development)
bad=$(printf '%s\n' "$changed" | awk 'NF && !/(__tests__|__fixtures__)\//')
[ -z "$bad" ] || { echo "STOP-S0-PRODUCT-CHANGE $bad"; exit 1; }
```
Done when: every pin is green on the unmodified source and was shown red by its mutation; `base-outputs/` holds refs, selftest, freeze, base captures, real plants.
