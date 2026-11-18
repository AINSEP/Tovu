# S0 — characterization pins, base outputs, planted STOPs (no product source change)

Responsibility: make every risk in DESIGN §4 able to fail **before** any code moves. Budget ≤200k tokens. Commits: 4-6.

## Prerequisites
```bash
git fetch -q origin refactor/terra refactor/import-cycle-b plan/design-deps-split-2026-11-17
git merge-base --is-ancestor origin/refactor/import-cycle-b origin/refactor/terra || echo "STOP: terra does not contain import-cycle-b yet — branch from origin/refactor/import-cycle-b instead and say so in the report"
git diff --name-only $(git merge-base origin/wave2/daemon-r8 HEAD) origin/wave2/daemon-r8 -- apps/website/src/server/runtime/composition/deps.ts | grep . && echo "STOP: a daemon lane edits deps.ts (H1 step 3 not satisfied)"
git merge-base --is-ancestor origin/refactor/error-e0-e2 HEAD || echo "NOTE: E2 not in base (does not block S0-S13; blocks E3)"
```
Then COMMON §1 setup, §3 freeze check, §2 facts re-check against the TSVs on the plan branch.

## Steps
1. Create `refactor/deps-split` from the chosen base; `git checkout origin/plan/design-deps-split-2026-11-17 -- designs/deps-split`; commit ("chore(plan): vendor deps-split design + census scripts").
2. COMMON §4 base outputs + the two failing-test lists (`fail.txt` per COMMON §5 test command; `fail-wide.txt` with the server unit+integration globs) on the **unmodified** tree; copy `/tmp/ds-base/*` to `designs/deps-split/work/base-outputs/`; commit.
3. COMMON §6 planted STOPs; save the transcript to `designs/deps-split/work/base-outputs/planted-stops.txt`; commit.
4. New pins in `apps/website/src/server/runtime/composition/__tests__/` (one commit each; each test is shown red once by a planted mutation in `deps.ts`, then the mutation is reverted — record mutation + red output in the report; the mutation is never committed):
   - `site-root-route-deps-shape.pin.test.ts` + `__fixtures__/site-root-route-deps-shape.snapshot.json`: `createSiteRouteDeps({}, { dbPath: ":memory:", overrides: { bootProviderPlugins: <fake> } })` (temp site dir via `overrides.siteBinding`); assert `Object.keys(routeDeps)` (260 literal keys + the 15 post-assembly keys, `work/literal-keys.tsv`) in order and `typeof` per key equal the snapshot. Mutation: swap two adjacent keys in the literal (2183/2184).
   - `site-root.overridden-capabilities.pin.test.ts`: a principal removed through `routeDeps.removeUser` is reported by `routeDeps.isInTrash`; `routeDeps.removePlugin`, `removeTheme`, `removeMember` create a trash row visible through `routeDeps.trash`. Mutation: move `...identity` (2376) below `isInTrash` (2381).
   - `site-root.late-contracts.pin.test.ts` — five contracts, one test each (DESIGN §1.4): (a) with a fake `overrides.openProjectStore` that yields a project store, call `routeDeps.projectKeys.bindOAuth` **from inside the fake `bootProviderPlugins`** (before H2) → rejects with exactly `Shared connections are not available yet. Reopen this saved connection and try again.`; (b) inside the fake `bootProviderPlugins`, `required.runtime`'s plugin-host getter returns `undefined` (use the `getPluginHost` path the runtime exposes; if none is reachable, STOP and report the missing seam — do not add one in S0); (c) lifecycle events captured before provider boot reach the fake tracker after it, in order; (d) the form-collection resolver answers from the empty registry before provider boot; (e) `mediaStorePorts().resolveSharedCredential` resolves only after `createSiteRouteDeps` returns (await ordering recorded). Mutation per test: make the read eager / swap the write.
   - `site-root.boot-chains.pin.test.ts`: a recording wrapper over `overrides.store`'s settings writes (or `overrides.onStoreOpened`) records the 12 `ensure*` definitions in order (`deps.ts:1153-1171`) and that `installCommentsDataModule` starts after the newsletter install settles (1216-1237). Mutation: swap two `.then` links.
   - `site-root.teardown.pin.test.ts` (design 01 §4 "teardown lifetime"): recording `overrides.store`, fake `bootProviderPlugins` with recording `dispose`, fake `openProjectStore` with recording `close`; after `close()`: boot drain finished before any registration ran; every registration (incl. a promised one) ran before the supplied store's `close`; owner sweeps stopped before `close`. No order **among** registrations is asserted (they run under `Promise.all`, `deps.ts:705`).
5. Refresh nothing in `work/*.tsv` (no source changed). Report per COMMON §8.

## STOP
```bash
grep -rn "vi.mock\|mock.module(.*@jini-ai" apps/website/src/server/runtime/composition/__tests__/site-root.*.test.ts && echo "STOP: no mocks of package internals"
git diff --name-only origin/refactor/terra...HEAD -- apps/website/src | grep -v '__tests__' | grep . && echo "STOP: S0 changes no product source"
```
Done when: all new pins green on the unmodified source, each shown red once by its mutation, base outputs committed.
