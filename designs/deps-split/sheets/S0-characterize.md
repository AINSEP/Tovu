# S0 — base, branch, base gate status, characterization pins (no product source change)

Responsibility: pin the base, prove the base is green where the sheets need it, and make every risk in DESIGN §4 able to fail **before** any code moves. Budget ≤200k tokens. Commits: 9-11. Rules: COMMON (revision 3).

## Prerequisites (fail closed; run before anything else)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
git fetch -q origin refactor/terra refactor/error-e0-e2 wave2/daemon-r8
IC=${IC_B2:-origin/wave3/import-cycle-b-2}       # the coordinator passes IC_B2=<sha> only if the branch was deleted after merging
[ -n "${IC_B2:-}" ] || git fetch -q origin wave3/import-cycle-b-2
git merge-base --is-ancestor "$IC" origin/refactor/terra || { echo "STOP-PREREQ $IC (wave3/import-cycle-b-2) is not merged into origin/refactor/terra"; exit 1; }
mb=$(git merge-base origin/wave2/daemon-r8 origin/refactor/terra)
git diff --quiet "$mb" origin/wave2/daemon-r8 -- "$D/deps.ts" || { echo "STOP-H1-STEP3 wave2/daemon-r8 edits deps.ts (or git diff failed)"; exit 1; }
rc=0; git ls-remote --exit-code --heads origin refactor/deps-split > /dev/null || rc=$?
[ "$rc" -eq 2 ] || { echo "STOP-BRANCH-EXISTS refactor/deps-split exists or ls-remote failed (status $rc)"; exit 1; }
if git merge-base --is-ancestor origin/refactor/error-e0-e2 origin/refactor/terra; then echo "E2 in base"; else echo "NOTE E2 not in base (blocks E3 only)"; fi
```
Why `wave3/import-cycle-b-2`: `origin/refactor/terra` (`b5fbf2a5` on 2026-11-18) does **not** contain the Tovu half of `refactor/import-cycle-b` (`git merge-base --is-ancestor origin/refactor/import-cycle-b origin/refactor/terra` → 1); a separate run re-applies it as `wave3/import-cycle-b-2`, and it edits `deps.ts` (import-cycle-b did: imports at 25-48 and the literal tail). It must be in the base, not land during the freeze.

## Steps
1. **Branch and pin.** `git switch -c refactor/deps-split origin/refactor/terra`; write `designs/deps-split/work/BASE` (`TOVU_BASE=$(git rev-parse HEAD)`, `JINI=$(git -C ../Jini rev-parse origin/refactor/terra)` after a fetch, `NODE=$(node -v)`); `git checkout origin/plan/design-deps-split-2026-11-17 -- designs/deps-split`; commit "chore(plan): vendor deps-split design rev3 + base pin"; `git push -u origin HEAD:refactor/deps-split` (documents only; the §5 block starts with the next commit).
2. **Setup** (COMMON §1), then the freeze check (COMMON §2) — it must print nothing.
3. **Base gate status.** On the unmodified base run every command of COMMON §5 (without the commit/push lines) and §6, each on its own, and record its exit status in the report. Expected = INDEX "Base gate status" (measured on `b5fbf2a5`). Any command that exits non-zero on the base and is not listed there as base-red = `STOP-BASE-RED <command>`: the coordinator decides; S0 does not tolerate it. Record `arch.base` (COMMON §4) and check its sentinel.
4. **Base tests.** Run `SR_TESTS` (COMMON §5) and the `SHEET_TESTS` array of **every** sheet S1-S13 on the base, as one runner call. Non-zero = `STOP-BASE-RED-TEST` with the failing names: a carry pin that is red before the move cannot prove the move.
5. **Facts on the real base.** The design's facts are at `b5fbf2a5`; the base now also holds `wave3/import-cycle-b-2`. Regenerate the four censuses into `$W` (DESIGN "commands"), run `diff` against the committed `work/*.tsv` (`|| [ $? -eq 1 ]`) and put the diff's line count and a summary in the report. Then check the anchors the sheets use still exist (COMMON §9 rule 8 form; each must match **once** in `$D/deps.ts`):
   ```bash
   set -euo pipefail
   D=apps/website/src/server/runtime/composition
   for a in 'const pendingLifecycleEvents' 'let lifecycleTracker' 'const kernel = store.content;' 'const workspaceId = await ' 'const publishTrustRevocations = await ' 'await warnCompositionChatOrphans(' 'const mediaProviders = await ' 'await normalizeSiteVaultAtBoot(' '= await composeProviderConfig(' 'const providerPlugins = await providerPluginBoot(' 'await protectExistingFormFiles(' 'lifecycleTracker = tracker;' 'bindSharedApiOAuth = ' 'routeDepsBuiltForPluginHost = routeDeps' 'const routeDeps: ' 'resolveRouteDeps(routeDeps);' 'await registerContentAnalytics('; do
     grep -nF "$a" "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
     test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-ANCHOR $a"; exit 1; }
   done
   ```
   (If import-cycle-b-2 re-adds `...bindCredentialsHostPorts(…)` / `staticSitePackager` to the literal — `refactor/import-cycle-b` had them — the literal grows by those keys; pin 1 observes whatever the base holds.)
6. **Characterization pins** under `$D/__tests__/` — one commit each, through COMMON §5. Each is shown **red once** by the named mutation of product code (applied, run, output saved for the report, reverted, never committed). Boot recipe for integration pins: the one `deps-project-credentials.integration.test.ts:27-49` uses (temp `sitesHome`/`home`, real `openProjectStore`, `createSiteRouteDeps({}, { dbPath: <siteDir>/content.db, overrides })`, `close()` in `t.after`). No `vi.mock`, no `mock.module`: fakes enter only through `overrides` (`bootProviderPlugins`, `openProjectStore`, `store`, `onStoreOpened`, … — `CreateSiteRouteDepsOverrides`, `deps.ts:421`) and the fixtures named here. Characterize: assert what the base does, never what it "should" do.

| pin file | asserts | mutation that must turn it red |
|---|---|---|
| 1 `site-root-route-deps-shape.pin.test.ts` + `__fixtures__/site-root-route-deps-shape.snapshot.json` | observed `Object.keys(routeDeps)` in order + `typeof` per key after `createSiteRouteDeps({}, { dbPath: ":memory:" })` resolves. The snapshot is written once from the running base (`DS_WRITE_SNAPSHOT=1` path in the test) and committed; its length is whatever the base produces (on `b5fbf2a5`: 258 literal entries = 252 named keys + 6 spreads, plus post-assembly writes: 15 writes to 14 keys, `pluginRuntimeReady` also a literal key) | swap two adjacent named keys of the literal |
| 2 `site-root.overridden-capabilities.pin.test.ts` | a principal removed via `routeDeps.removeUser` is reported by `routeDeps.isInTrash`; `removePlugin`, `removeTheme`, `removeMember` each create a row visible through `routeDeps.trash` | move `...identity` below `isInTrash` in the literal |
| 3a `site-root.shared-oauth-binding.pin.test.ts` | with the `acme-provider` fixture's shared OAuth app (`fixtures/acme-provider.ts`, env as `agent-plugin-connections.vertical-slice.test.ts:70`) and a shared-OAuth key seeded through the opened project store's own vault port, `routeDeps.projectKeys.use({ keyId, use: true })` reaches `apiConnections.host.sharedOAuth.bind`: assert the base outcome verbatim. `bindOAuth` is a construction callback of `createProjectKeys` (`features/project-keys/service.ts:55-68`), not on `ProjectKeysPort`; this is its only reachable seam. If seeding needs a port the store lacks: `STOP-SEAM <method>` (add nothing) | delete the `bindSharedApiOAuth = …sharedOAuth?.bind` line → `use` rejects with "Shared connections are not available yet. Reopen this saved connection and try again." |
| 3b `plugin-runtime.host-lookup.pin.test.ts` | Jini decides per SDK build whether to install `sdk.plugins` (`@jini-ai/plugins` `runtime-core` `buildSdk`: `const host = optional.lookup?.(); … ...(host ? { plugins: … } : {})`), so the pin probes **fresh activations on one runtime**: `composePluginRuntime({ …same inputs as plugin-host.integration.test.ts:79-93…, getPluginHost: () => cell })` with two probe plugins (`lookup-probe-a`, `lookup-probe-b`, the fixture's manifest shape). With `cell` undefined, enabling `-a` gives an SDK without `plugins`; then `cell = ctx.host`; enabling `-b` on the **same** runtime gives an SDK whose `plugins` keys are `['findProviders', 'getPlugin']` | in `plugin-runtime.ts`, capture the host once at construction (`const host = getPluginHost?.(); … lookup: () => host`) → `-b` has no `plugins` |
| 3c `site-root.lifecycle-routing.pin.test.ts` + `composition-boot-order.unit.test.ts` (extend) | **behaviour**: boot with `overrides.bootProviderPlugins` wrapping the real boot so its `tracker.capture` also records; after `createSiteRouteDeps` resolves, emit one product event through the agent-plugin lifecycle (`productTracker: () => lifecycleTracker`, `deps.ts:977`) — use the first lifecycle method that captures offline (find it with `grep -rn 'productTracker()' apps/website/src/features/agent-plugins`; none reachable offline = `STOP-SEAM`) — and assert the recording tracker received it, after any events buffered during boot, in order. **Source order** (kept): `formCollectionProviders = ` < `setServerLogTraceReader(` < `lifecycleTracker = tracker` < `flushLifecycleEvents(` in `composeSiteRouteDeps` | behaviour: delete `lifecycleTracker = tracker;` → the post-boot event stays in the buffer, the recorder never sees it. Source order: swap the swap and flush lines (the behaviour test alone cannot see that swap: the flush passes `tracker` explicitly, `deps.ts:1885`) |
| 3d `site-root.form-resolver-fallback.pin.test.ts` | with `overrides.bootProviderPlugins` whose ports return `formCollectionProviders: () => <registry with one fake collection>`, the core form-collection resolver registered by `wireCoreResolvers` answers with that collection after boot (call-time read through `formCollectionProviders()`); before provider boot the root's arrow returns the empty registry | make `wireCoreResolvers`' input read `formCollectionProviders()` once at wiring time |
| 3e `composition-boot-order.unit.test.ts` (extend) | source order: `provideMediaCredentials` is called after `pluginRuntime.attachEnabledPluginsAtBoot()` and after the boot drain starts | move the credential call above the attach |
| 4 `site-root.boot-chains.pin.test.ts` | recording wrapper over `overrides.store`'s settings definition writes: the 12 `ensure*` definitions in order (the `siteSettingsReady` chain, `deps.ts:1150-1168`); `installCommentsDataModule` starts after `newsletterReady` settles (1213-1234) | swap two `.then` links |
| 5 `site-root.teardown.pin.test.ts` | recording `overrides.store`, `overrides.bootProviderPlugins` with a recording `dispose`, `overrides.openProjectStore` wrapping the real store to record `close`; after `close()`: the boot drain finished before any registration ran; every registration (incl. a promised one) settled before the owner sweeps stop, and the sweeps stopped before the store's `close` (`stopStoreUsers`, `deps.ts:698-703`: drains → registrations → sweeps → close). **No order among registrations** — they run concurrently (`Promise.all`, `deps.ts:701`) | call the store close before the registrations in `openCompositionStore` |
| 6 `composition-boot-order.unit.test.ts` (widen) | top-level-await regex becomes `/^  (?:if \([^\n]*\) )?(?:const [^=]+= )?await[^\n]*/gm`; the expected list gains the owner line `  if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles(…)` (five awaits after the first boot promise); the prelude asserts `await warnCompositionChatOrphans(` as the root's await **and** `await warnOnOrphanedChatRows(` inside the wrapper; the description says five | delete the `await` before `protectExistingFormFiles` |

7. Report (COMMON §8): prerequisites output, `BASE`, base gate status vs INDEX, base test run, facts diff summary, pins with mutation outputs.

`SHEET_TESTS` for S0 = the pin files above + `composition-boot-order.unit.test.ts`.

## STOP (last block before the report commit)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
BASE=$(sed -n 's/^TOVU_BASE=//p' designs/deps-split/work/BASE)
git diff --name-only "$BASE" HEAD -- apps development > "$W/s0-changed"
grep -vE '/(__tests__|__fixtures__)/' "$W/s0-changed" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S0-PRODUCT-CHANGE"; exit 1; }
grep -nE 'vi\.mock|mock\.module\(' $D/__tests__/site-root*.test.ts $D/__tests__/plugin-runtime.host-lookup.pin.test.ts > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S0-PACKAGE-MOCKS"; exit 1; }
```
Done when: `BASE` is pushed, the base gate status matches INDEX (or the run stopped), every pin is green on the unmodified source and was shown red by its mutation.
