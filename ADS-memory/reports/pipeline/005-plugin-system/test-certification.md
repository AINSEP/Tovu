# Test Certification Record

- Test Suite: plugin-system (backend `plugin-runtime` core + `@tovu/sdk` + HTTP routes + `post.ts`/revert integration seams + admin `Plugins` UI screen)
- Spec ID: SPEC-005
- Spec Version: 1.1.2
- Spec Hash: `sha256:1e496a69afc3df0992ed5dc69989dc1e86fd9910551501c78c3120425e2305b8`
- Spec Hash Verification: recomputed with the provider-local validator (deterministic tooling, not visual comparison):
  `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/005-plugin-system --phase spec --print-hash`
  → `Feature hash computed: sha256:1e496a69afc3df0992ed5dc69989dc1e86fd9910551501c78c3120425e2305b8` / `PASS: strict Speckit package passed mechanical validation.` — matches `feature.spec.md`'s `content_hash` exactly. No `--update-hash` was run (read-only verification).
- ADR: `reports/pipeline/005-plugin-system/adr.md` (ADR-005-ARCH, human-approved 2026-07-28)
- Implementation Outline: `reports/pipeline/005-plugin-system/implementation-outline.md` (Status: PRODUCED)
- Critical Internal Constraints: `reports/pipeline/005-plugin-system/critical-internal-constraints.md` (Status: PRODUCED — U-001…U-005)
- Tasks: `reports/pipeline/005-plugin-system/tasks.md` (generated this pass, Coordinator-delegated per dispatch)
- Certified At: 2026-07-28T21:03:41Z (session timestamp, main 1.1.1 pass)
- **Addendum Certified At: 2026-07-28 (same-day addendum) — spec bumped 1.1.1 → 1.1.2, adds REQ-18/AC-26 (trust-tier badge, resolves RT-010). See §11 for the addendum record; this header and the inventory/matrices below are updated in place per the addendum instruction (not a parallel document).**
- Certified By: TDD Agent (persona `AI-Dev-Shop/agents/tdd/skills.md` v1.1.0 loaded)

---

## Coverage Profile Decision

Kept project defaults, **not loosened**, per dispatch instruction (security-sensitive: in-process code loading, capability model):

- Unit: `98/98/98/98`
- Integration: `90/90/90/90`
- E2E: `80/80/80/80` where an E2E/Playwright suite actually applies — **not applicable to the `Plugins` admin screen specifically** (no prior admin list/toggle screen in this codebase has a dedicated Playwright suite; RTL component/interaction tests substitute, matching `test-design/SKILL.md`'s View/UI module-class allowance of `70%+ line OR documented E2E coverage`).

Recorded in `tasks.md`'s Constraints section.

---

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---|---:|---|
| `packages/sdk/src/__tests__/unit/sdk-public-api.unit.test.ts` | unit | REQ-08/AC-10, REQ-04, REQ-05, ADR-024 §3 | `sha256:fb6fc0d242e74c3258a18585d61108d7f32ace482d24b4efc70c3d1276bb067a` | 9 | 4 fail (`definePlugin` identity/no-throw assertions) against the stub's unconditional throw; 5 pass (frozen export shape/literals/source-text checks, expected per TDD-stub convention) |
| `src/features/plugin-runtime/__tests__/unit/manifest.unit.test.ts` | unit | REQ-01, BR-02/BR-03, AC-07/AC-08/AC-12, EC-01/EC-04/EC-05, DUP-01 (SHADOWS_BUILT_IN half) | `sha256:7d11ac20bc05aa603767f11c8c2e18ce30a8ddd73cc235ecb377d5b0f44c76a0` | 16 | all 16 fail: `validateManifest` throws "not implemented" |
| `src/features/plugin-runtime/__tests__/integration/discovery.integration.test.ts` | integration | REQ-02/03, AC-09/AC-11/AC-16, EC-08/EC-09, TB-01, DUP-01 (ID_DUPLICATE + SHADOWS_BUILT_IN) | `sha256:a7747869fca8681e83890eb8b2bb4a18136ad9f971118cdfaf21b7c7578aca6d` | 6 | all 6 fail: `discoverPlugins` throws "not implemented" |
| `src/features/plugin-runtime/__tests__/integration/loader.integration.test.ts` | integration | REQ-03, AC-03/AC-04/AC-12, INV-04; **CIC U-001** | `sha256:51572916af9f636ee9ee6a6a0e43e1883fcff5fb15bd80b88c487a621b0a4d23` | 5 | all 5 fail: `loadPlugin` throws "not implemented" |
| `src/features/plugin-runtime/__tests__/unit/capability-sdk.unit.test.ts` | unit | REQ-04, AC-05, EC-06, INV-02, BR-04-cap; **CIC U-003** | `sha256:4cf9f1fd5887daec26baaff77c72daa432e2186bb2bf66c3474c357799338328` | 36 | all 36 fail: `buildCapabilityScopedSdk` throws "not implemented" (includes the 2³=8-combination exhaustive sweep) |
| `src/features/plugin-runtime/__tests__/integration/hook-registry.integration.test.ts` | integration | REQ-05/06, BR-04/BR-06/BR-07, TB-01, AC-01/AC-05/AC-06/AC-07, EC-06/EC-10, RT-001; **CIC U-004** | `sha256:d90fb2e5165e4bc8bfa4a3b409d166ee53f65484e9b802222d45553d8ba097fd` | 11 | all 11 fail: `createHookRegistry` throws "not implemented" |
| `src/features/plugin-runtime/__tests__/integration/activation.integration.test.ts` | integration | REQ-07, BR-05, AC-02, AC-13 (state-symmetry half) | `sha256:378d509bf1a0d27827ce0733be7d014fe08097edb5e3855f5cfb8d46038884d6` | 8 | all 8 fail: `setPluginEnabled`/`getActivation` throw "not implemented" |
| `src/features/plugin-runtime/__tests__/integration/repo.contract.test.ts` | integration (contract) | REQ-07, state.spec.md §7; C-013 | `sha256:af67c26a6ccd6fb9d57e98dbe15dd434964d0061856d10c5f0b3500372862fa8` | 10 | all 10 fail: both `InMemoryPluginActivationRepo`/`SqlitePluginActivationRepo` methods throw "not implemented" |
| `src/features/plugin-runtime/built-ins/word-count/__tests__/unit/word-count.unit.test.ts` | unit | REQ-09, AC-01, RT-005 | `sha256:b3d0c522c446f2e293ffbcccca0bcbe8b211f7aced0c96da732fea1848702a80` | 8 | 7 fail (`countWords` throws); 1 passes (static `WORD_COUNT_MANIFEST` shape assertion, no function call) |
| `src/server/boot/__tests__/integration/plugin-sdk-resolver.integration.test.ts` | integration | ADR SDK Resolution Mechanism; **CIC U-002** | `sha256:eccedcf91c759381c2c3bffa1e382f2f064aaefb1ef13f5ea0bec4180443be90` | 2 | both fail: `registerPluginSdkResolver` throws "not implemented" (the second test asserts the SPECIFIC `PluginSdkResolverAlreadyRegisteredError`, not just "throws", so it stays red rather than vacuously passing against the stub's generic throw) |
| `src/server/routes/admin/plugins/__tests__/integration/plugins-http.integration.test.ts` | integration | REQ-10, AC-11, errors.spec.md §2/§6; RT-009 fixture; **1.1.2 addendum: REQ-18/AC-26 wire-level `tier`** | `sha256:64b6299a6fc2453b28792d1f384dc7eab1c3461216b02c923e0ab06efcb1266f` | 7 (was 6; +1 addendum) | **7/7 PASS as of this addendum's final re-run** — `list.ts`/`set-enabled.ts` were implemented for real by concurrent Programmer work that completed mid-session (outside this addendum's own edits, which never touch these route handler files); all 6 pre-existing tests plus the new REQ-10(1.1.2)/AC-26 wire-level `tier` test pass genuinely — the new test supplies 3 different `tier` values across the fixture and would fail against a hardcoded-`tier-3` implementation. RED at the moment this addendum wrote it; see §11 for the full timeline |
| `src/server/http/admin/__tests__/unit/plugins-dto.unit.test.ts` | unit | REQ-10/REQ-11, api.spec.md §5; C-017; **1.1.2 addendum: REQ-18/AC-26 `tier` pass-through** | `sha256:9340a8eb41f7a67489331227fb6856ac5e49f7ae8839ddd3b5a27305da3d0e9a` | 6 (was 4; +2 addendum) | **6/6 PASS as of this addendum** — `toAdminPluginResponse` was implemented for real by concurrent Programmer work that landed on this exact file mid-session (outside this addendum's own edits); genuinely (not vacuously) green — the distinctness test would fail against a hardcoded `"tier-3"` implementation, and the real body (`tier: discovery.tier ?? "tier-3"`) passes only because it correctly threads a defined `tier` through. All 4 tests were RED at the moment this addendum wrote them; see §11 for the re-run evidence and timing note |
| `src/features/post/__tests__/integration/post-plugin-hook.integration.test.ts` | integration | REQ-05/06/11, AC-01/AC-14, EC-10; **CIC U-004 (post.ts side)** | `sha256:2138690d5526d3a54b7b994c550479d71111be5a3dab004d9786ab991bea6fa5` | 4 | 2 fail (hook-merge/fail-closed behavior does not exist in `post.ts` yet); 2 pass (the no-op regression baseline and the "no ext without a plugin" invariant — both correct TODAY and required to STAY correct after Programmer's change) |
| `src/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts` | integration | BR-08, AC-17; **CIC U-005** | `sha256:a3f643b0828026fb6caba2af63484a228af2ebc1e75b227e8934c6e32c3cebc6` | 2 | 1 fails (the load-bearing U-005 finding — the CURRENT, unmodified `postUpdateReverter.applyInverse` calls `updatePost`, provable today via a `findBySlug`-spy); 1 passes (the pre-existing, correct AC-17 version-increment/restore baseline — a regression guard) |
| `apps/admin/src/sections/__tests__/Plugins.unit.test.tsx` | unit (RTL component) | REQ-12..16, AC-18..24, EC-11; **1.1.2 addendum: REQ-18/AC-26 tier badge** | `sha256:8a7054febf94b10e0a02c1c069cc05cbbc0362f9f8996c76cc7bd9d912f2bd73` | 13 (was 12; +1 addendum) | all 13 fail: `Plugins` component throws "not implemented" on every render |
| `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts` | unit | REQ-17/AC-25, RT-008 | `sha256:7a9f5917390d33e4748c6e5f6b83d8fde85fa1fa3b6431f099d6d389feaf128b` | 2 | both fail: `nav.ts`'s `plugins` entry still has `soon:true`/no `href`, and still carries the stale RT-008 comment |
| `apps/admin/src/__tests__/unit/app-plugins-route.unit.test.tsx` | unit (RTL, App-level) | REQ-17/AC-25 | `sha256:eecc55f329c293bf3813fa71c8ead91591565fe431de40768f00a55a58e41082` | 1 | fails: `App.tsx`'s `case "section":` dispatch has no `"plugins"` branch yet, falls through to `<Placeholder>` |

**Totals (post-1.1.2-addendum):** 17 certified test files, **146 tests** (130 backend `node:test` + 16 `apps/admin` Vitest — was 142 = 127 + 15 at the 1.1.1 pass; the 1.1.2 addendum adds 3 backend tests across 2 files + 1 `apps/admin` test, see §11). **This suite's RED/GREEN split moved during this same session**, ahead of and independent of this addendum: concurrent Programmer work landed real implementations for several certified stubs (`manifest.ts`, `capability-sdk.ts`, `hook-registry.ts`, and — mid-addendum — `toAdminPluginResponse` in `src/server/http/admin/plugins.ts`) while this addendum was being written, so a single fixed pass/fail count for "the full suite" would already be stale by the time it's read. **This document no longer asserts one aggregate pass/fail number for the whole 146-test suite** — see §9 for the 1.1.1-pass-time baseline (verified true at that time) and §11 for this addendum's own re-verification, scoped and timestamped to the exact files it touched (the only scope this addendum can respond for). The original 1.1.1 pass verified by running the full certified suite (`node --import tsx --test` across all 14 backend files + `npx vitest run` across all 3 `apps/admin` files) immediately before that handoff: backend `tests 127 / pass 10 / fail 117`, `apps/admin` `Tests 15 failed (15)` — that snapshot remains an accurate historical record of the 1.1.1 handoff, not a claim about current-moment status.

Non-test fixture helper (not itself a certified test file, no independent assertions, shared by two test files above): `src/features/plugin-runtime/__tests__/fixtures/ac11-fixture.ts` — `sha256:43a1c6daab55ff711c36f7038c02cfa9a5bd3e9a87608f85af44bb4265efd3cb`.

**TDD-owned "certified stub" source files** (frozen signatures, throw "not implemented" — this repo's established pre-implementation convention, confirmed by direct precedent in `src/widgets/embed-validation.ts`/`src/core/entry-refs/extractor.ts`): `packages/sdk/src/index.ts`, `src/features/plugin-runtime/{manifest,discovery,loader,capability-sdk,hook-registry,activation,repo.memory,repo.sqlite}.ts`, `src/features/plugin-runtime/built-ins/word-count/index.ts`, `src/server/boot/plugin-sdk-resolver.ts`, `src/server/routes/admin/plugins/{deps,list,set-enabled}.ts`, `src/server/http/admin/plugins.ts`, `apps/admin/src/sections/Plugins.tsx`. **Not implementation** in the sense the TDD guardrail forbids — no logic beyond type declarations and a thrown "not implemented" marker; this is the mechanism by which the certified test suite compiles and runs (rather than failing at module resolution) before Programmer writes real bodies. **1.1.2 addendum:** two of these frozen-stub files gained one additive, type-only field each from this addendum's own edits (no logic added by this addendum) — `src/features/plugin-runtime/discovery.ts`'s `PluginDiscoveryRecord.tier?: "tier-1"|"tier-2"|"tier-3"` (optional — see §11 for why optional rather than required) and `src/server/http/admin/plugins.ts`'s `AdminPluginEnvelope.tier: "tier-1"|"tier-2"|"tier-3"` (required — this is the actual wire contract, api.spec.md §5). Both re-verified with `npx tsc -p tsconfig.json --noEmit`: zero new errors (one pre-existing, unrelated error in `capability-sdk.ts` predates this addendum and is untouched by it). **Note:** concurrent Programmer work independently implemented real bodies for both `discoverPlugins()` and `toAdminPluginResponse()` during this same session (see §11) — by the time this addendum closed, both files' bodies no longer throw; that implementation work is not part of this addendum, which contributed only the two type fields above.

**Additive, non-throwing changes to already-working existing files** (infrastructure only, no new product behavior): `package.json` (`test`/`test:cov` script globs widened to include `packages/*/src/**/*.test.ts`); `apps/admin/package.json` (added `vitest`/`@vitest/coverage-v8`/`jsdom`/`@testing-library/*` devDependencies + `test`/`test:watch`/`test:cov` scripts — this app had **zero** test infrastructure before this pass, a pre-existing gap, not introduced by this feature); `apps/admin/vitest.config.ts` + `apps/admin/src/__tests__/setup.ts` (new files, first-ever harness); `apps/admin/src/lib/api.ts` (purely additive: one new `AdminPlugin` interface + two new `api.listPlugins()`/`api.setPluginEnabled()` methods appended to the existing `api` object literal — verified with `npx tsc --noEmit` clean). **1.1.2 addendum:** `apps/admin/src/lib/api.ts`'s `AdminPlugin` interface gains one additive, required `tier: "tier-1"|"tier-2"|"tier-3"` field (mirrors `AdminPluginEnvelope.tier` above) — safe because `AdminPlugin` is never literal-constructed anywhere in `apps/admin`, only used as a generic type parameter (`request<{ plugins: AdminPlugin[] }>(...)`), confirmed by `grep -rn "AdminPlugin\b"`; re-verified with `npx tsc --noEmit` inside `apps/admin` — the only error present (`Plugins.tsx(20,28): Cannot find namespace 'JSX'`) is pre-existing in that untouched stub file, unrelated to this field.

---

## 1. Requirement-to-Test Matrix (Backend)

| Spec Ref | Priority | Test File(s) | Status |
|---|---|---|---|
| REQ-01 (incl. 1.1.1 `tier`) | — | `manifest.unit.test.ts` | Certified |
| AC-12 | P1 | `manifest.unit.test.ts` (MANIFEST_MALFORMED), `loader.integration.test.ts` (CODE_ENTRY_MISSING) | Certified |
| REQ-02 | — | `discovery.integration.test.ts` | Certified |
| AC-09 | P2 | `discovery.integration.test.ts` | Certified |
| REQ-03 | — | `loader.integration.test.ts` | Certified |
| AC-03 | P1 | `loader.integration.test.ts` | Certified |
| AC-04 | P1 | `loader.integration.test.ts` | Certified |
| REQ-04 | — | `capability-sdk.unit.test.ts`, `manifest.unit.test.ts` (CAPABILITY_UNKNOWN) | Certified |
| AC-05 | P1 | `capability-sdk.unit.test.ts`, `hook-registry.integration.test.ts` (end-to-end denial) | Certified |
| REQ-05 | — | `hook-registry.integration.test.ts`, `manifest.unit.test.ts` (HOOK_UNKNOWN) | Certified |
| AC-06 | P1 | `hook-registry.integration.test.ts` (merge + FIELD_PATH_INVALID for core-field key), `manifest.unit.test.ts` (HOOK_UNKNOWN) | Certified |
| AC-15 | P2 | **Gap** — see Known Gaps below |
| REQ-06 | — | `manifest.unit.test.ts` (declaration validation), `hook-registry.integration.test.ts` (BR-06 write validation) | Certified |
| AC-07 | P1 | `manifest.unit.test.ts`, `hook-registry.integration.test.ts` | Certified |
| AC-08 | P2 | `manifest.unit.test.ts` | Certified |
| REQ-07 | — | `activation.integration.test.ts`, `plugins-http.integration.test.ts` | Certified |
| AC-02 | P1 | `activation.integration.test.ts` | Certified |
| AC-13 | P1 | `activation.integration.test.ts` (state-symmetry half) + `plugins-http.integration.test.ts` (change-set shape/inverse-payload half) — see Known Gaps for the explicitly-scoped remainder | Certified (scoped) |
| AC-17 | P1 | `revert-plugin-ext.integration.test.ts` | Certified |
| REQ-08 | — | `sdk-public-api.unit.test.ts` | Certified |
| AC-10 | P1 | `sdk-public-api.unit.test.ts` | Certified |
| REQ-09 | — | `word-count.unit.test.ts` | Certified |
| AC-01 | P1 | `word-count.unit.test.ts` (algorithm) + `post-plugin-hook.integration.test.ts` (end-to-end merge) | Certified |
| AC-16 | P1 | `discovery.integration.test.ts` | Certified |
| REQ-10 | — | `plugins-http.integration.test.ts`, `plugins-dto.unit.test.ts` | Certified |
| AC-11 | P1 | `discovery.integration.test.ts`, `plugins-http.integration.test.ts` (RT-009 fixture, both) | Certified |
| REQ-11 | — | `plugins-dto.unit.test.ts`, `post-plugin-hook.integration.test.ts` | Certified |
| AC-14 | P2 | `post-plugin-hook.integration.test.ts` | Certified |
| REQ-12 | — | `Plugins.unit.test.tsx` | Certified |
| AC-18 | P1 | `Plugins.unit.test.tsx` | Certified |
| REQ-13 | — | `Plugins.unit.test.tsx` | Certified |
| AC-19 | P1 | `Plugins.unit.test.tsx` | Certified |
| AC-20 | P1 | `Plugins.unit.test.tsx` | Certified |
| AC-21 | P1 | `Plugins.unit.test.tsx` | Certified |
| REQ-14 | — | `Plugins.unit.test.tsx` | Certified |
| AC-22 | P2 | `Plugins.unit.test.tsx` | Certified |
| REQ-15 | — | `Plugins.unit.test.tsx` | Certified |
| AC-23 | P1 | `Plugins.unit.test.tsx` | Certified |
| REQ-16 | — | `Plugins.unit.test.tsx` | Certified |
| AC-24 | P2 | `Plugins.unit.test.tsx` | Certified |
| REQ-17 | — | `nav-wiring.unit.test.ts`, `app-plugins-route.unit.test.tsx` | Certified |
| AC-25 | P1 | `nav-wiring.unit.test.ts`, `app-plugins-route.unit.test.tsx` | Certified |
| REQ-18 **(1.1.2 addendum)** | — | `Plugins.unit.test.tsx` (badge render), `plugins-dto.unit.test.ts` + `plugins-http.integration.test.ts` (wire-level `tier` pass-through, REQ-10's carrier) | Certified |
| AC-26 **(1.1.2 addendum)** | P2 | `Plugins.unit.test.tsx` — 3-value fixture (`tier-1`/`tier-2`/`tier-3`) proves per-row verbatim rendering, not a hardcoded `tier-3` | Certified |

### Invariants

| INV | Test File(s) | Status |
|---|---|---|
| INV-01 (no plugin DDL) | **Gap** — see Known Gaps (enforced by capability-vocabulary omission, not a runtime check; `DDL_ATTEMPTED` has no BR/AC trigger anywhere in the spec package) | Low-risk gap, disclosed |
| INV-02 | `capability-sdk.unit.test.ts` | Certified |
| INV-03 | `activation.integration.test.ts` (no ext dependency exists in that module at all — structural proof), `hook-registry.integration.test.ts` (EC-07: detach stops new writes, doesn't erase existing data) | Certified |
| INV-04 | `loader.integration.test.ts` (CIC U-001) | Certified |
| INV-05 | `activation.integration.test.ts`, `plugins-http.integration.test.ts` (change-set recorded per transition) | Certified |
| INV-06 | `manifest.unit.test.ts` (HOOK_UNKNOWN) | Certified |
| INV-07 | `sdk-public-api.unit.test.ts` (deep-import/exports-map checks) | Certified |

### Edge Cases

| EC | Test File(s) | Status |
|---|---|---|
| EC-01 | `manifest.unit.test.ts` | Certified |
| EC-02 | `loader.integration.test.ts` | Certified |
| EC-03 | `loader.integration.test.ts` | Certified |
| EC-04 | `manifest.unit.test.ts` | Certified |
| EC-05 | `manifest.unit.test.ts` | Certified |
| EC-06 | `capability-sdk.unit.test.ts`, `hook-registry.integration.test.ts` | Certified |
| EC-07 | `hook-registry.integration.test.ts` | Certified |
| EC-08 | `discovery.integration.test.ts` | Certified |
| EC-09 | `discovery.integration.test.ts` | Certified |
| EC-10 | `hook-registry.integration.test.ts`, `post-plugin-hook.integration.test.ts` | Certified |
| EC-11 | `Plugins.unit.test.tsx` (scoped to single render instance per RT-007 — see below) | Certified |

### Behavior Rules / DUP-01 / TB-01

| Rule | Test File(s) | Status |
|---|---|---|
| BR-01 | `loader.integration.test.ts` | Certified |
| BR-02/BR-03 | `manifest.unit.test.ts` (collect-all + property-style mutation sweep) | Certified |
| BR-04-cap | `capability-sdk.unit.test.ts` | Certified |
| BR-04 | `hook-registry.integration.test.ts` | Certified |
| BR-05 | `activation.integration.test.ts` | Certified |
| BR-06 | `hook-registry.integration.test.ts` | Certified |
| BR-07 | `hook-registry.integration.test.ts`, `post-plugin-hook.integration.test.ts` | Certified |
| BR-08 | `revert-plugin-ext.integration.test.ts` | Certified |
| DUP-01 | `manifest.unit.test.ts` (SHADOWS_BUILT_IN), `discovery.integration.test.ts` (ID_DUPLICATE + SHADOWS_BUILT_IN) | Certified |
| TB-01 | `discovery.integration.test.ts`, `hook-registry.integration.test.ts`, `plugins-http.integration.test.ts`, `Plugins.unit.test.tsx` | Certified |

### Error Codes

| Code | Test File(s) | Status |
|---|---|---|
| `PLUGIN_NOT_FOUND` | `activation.integration.test.ts`, `plugins-http.integration.test.ts` | Certified |
| `PLUGIN_INVALID` | `activation.integration.test.ts`, `plugins-http.integration.test.ts` | Certified |
| `PLUGIN_INCOMPATIBLE` | `activation.integration.test.ts` | Certified |
| `PLUGIN_HOOK_FAILED` | `hook-registry.integration.test.ts`, `post-plugin-hook.integration.test.ts` | Certified |
| Validation vocabulary (18 codes, errors.spec.md §3) | `manifest.unit.test.ts` (13 of the static codes), `loader.integration.test.ts` (`INTEGRITY_FAILED`/`SDK_RANGE_UNSATISFIED`), `discovery.integration.test.ts` (`ID_DUPLICATE`) | Certified except `DDL_ATTEMPTED` (see Known Gaps) |
| `VALIDATION_ERROR`/`DUPLICATE_COMMAND`/`INTERNAL_ERROR` | Pre-existing SPEC-001 gateway coverage, unchanged by this feature | N/A — out of scope, already certified elsewhere |

---

## 2. Outcome Matrix (per module, State × Input → Outcome)

| Module | State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|---|
| `manifest.ts` `validateManifest` | any parsed manifest | well-formed, `tier: "tier-3"`, all fields valid | `{errors: []}` | REQ-01/BR-03 |
| `manifest.ts` `validateManifest` | any parsed manifest | `tier` absent or not in `tier-1\|tier-2\|tier-3` | `errors` includes `MANIFEST_MALFORMED` | REQ-01 (1.1.1), behavior.spec.md §10 |
| `manifest.ts` `validateManifest` | any parsed manifest | every rule violated simultaneously | `errors` includes ALL applicable codes (collect-all, not first-failure) | BR-02 |
| `discovery.ts` `discoverPlugins` | install dir present, 1 built-in + 2 site (1 valid tier-3, 1 invalid) | — | 3 records, TB-01 ordered, valid/invalid statuses correct | AC-11, TB-01 |
| `discovery.ts` `discoverPlugins` | `installDir` absent (legacy mode) | built-ins only | 1 record (built-in), no site records | EC-09/AC-16 |
| `discovery.ts` `discoverPlugins` | 2 installed versions of one site id | — | 1 record at the latest semver version; the older version never surfaces as a second row | AC-09/EC-08 |
| `discovery.ts` `discoverPlugins` | 2 site plugins, case-insensitively colliding ids | — | BOTH records carry `ID_DUPLICATE` | DUP-01 |
| `discovery.ts` `discoverPlugins` | 1 site plugin id equals a built-in id | — | site record carries `SHADOWS_BUILT_IN`; built-in record unaffected | DUP-01 |
| `loader.ts` `loadPlugin` | integrity mismatch | any manifest/entry | `{loaded:false, reason:"INTEGRITY_FAILED"}`, `import()` never called | AC-03, CIC U-001 |
| `loader.ts` `loadPlugin` | integrity OK, sdkRange unsatisfied | any manifest/entry | `{loaded:false, reason:"SDK_RANGE_UNSATISFIED"}`, `import()` never called | AC-04, CIC U-001 |
| `loader.ts` `loadPlugin` | integrity OK, sdkRange OK | any manifest/entry | `{loaded:true}`, `import()` called exactly once with the exact entry path | AC-03 |
| `loader.ts` `loadPlugin` | entry file missing on disk | — | `{loaded:false, reason:"CODE_ENTRY_MISSING"}` | REQ-03/AC-12 |
| `capability-sdk.ts` `buildCapabilityScopedSdk` | any of 2³ capability subsets | invoke a granted surface | resolves/delegates to `coreDeps`, never throws | REQ-04 |
| `capability-sdk.ts` `buildCapabilityScopedSdk` | any of 2³ capability subsets | invoke an ungranted surface | throws `CapabilityDeniedError` naming the exact capability + pluginId | AC-05, CIC U-003 |
| `hook-registry.ts` `runBeforeSave` | N attached plugins (mixed built-in/site) | entry snapshot | resolves `{[pluginId]: patch}` merged in TB-01 order; each later filter observes earlier plugins' already-merged `ext` | BR-04, AC-01 |
| `hook-registry.ts` `runBeforeSave` | 1 attached plugin whose filter throws / is denied / returns an undeclared or mistyped field | entry snapshot | rejects with `PluginHookFailedError`; NO partial patch is ever returned | BR-06/BR-07/EC-06/EC-10, CIC U-004 |
| `hook-registry.ts` `runBeforeSave` | 0 attached plugins | entry snapshot | resolves `{}` (identity no-op) | behavior.spec.md §10 |
| `hook-registry.ts` `runBeforeSave` | a plugin detached (disabled) | entry snapshot | that plugin's filter does not run; contributes nothing | BR-04/EC-07 |
| `activation.ts` `setPluginEnabled` | plugin id absent from discovery snapshot | `{enabled: true\|false}` | throws `PluginNotFoundError` | BR-05 step 1 |
| `activation.ts` `setPluginEnabled` | plugin discovered, `status !== "valid"` | `{enabled: true}` | throws `PluginInvalidError`/`PluginIncompatibleError` | BR-05 step 2, AC-04 |
| `activation.ts` `setPluginEnabled` | plugin discovered, any status | `{enabled: false}` | succeeds regardless of status (no validity precondition on disable) | BR-05 |
| `activation.ts` `setPluginEnabled` | plugin discovered, `status === "valid"` | `{enabled: true}` | upserts activation row `enabled:true`, invokes `onEnabled` | REQ-07/AC-02 |
| `post.ts` `updatePost`/`createPost` (once T020 lands) | `beforeSaveHook` present, resolves | valid update input | returned/saved `PostRecord.ext` reflects the merged patch | AC-01, C-014 |
| `post.ts` `updatePost`/`createPost` (once T020 lands) | `beforeSaveHook` present, throws | valid update input | rejects; `repo.save()` is NEVER called (spy count 0) | CIC U-004 (post.ts side) |
| `post.ts` `updatePost`/`createPost` | `beforeSaveHook` absent | valid update input | behaves exactly as today (regression baseline) | behavior.spec.md §10 |
| `core/commands` revert (`postUpdateReverter`, once T023 lands) | an applied post-update change set | revert request | restores via a raw `PostRepoPort.save()` — `findBySlug` is NEVER called; version increments by exactly 1 | BR-08/AC-17, CIC U-005 |
| `Plugins` screen | initial fetch in flight | — | loading notice, no table | REQ-15/AC-23 |
| `Plugins` screen | initial fetch rejects | — | error notice, no table, no stale data | REQ-15/AC-23 |
| `Plugins` screen | fetch resolves, 0 records | — | empty-state notice, no `<table>` | REQ-14/AC-22 |
| `Plugins` screen | fetch resolves, N records | — | exactly N rows, TB-01 order preserved, per-row `errors[]` shown only for non-empty | REQ-12/AC-18, REQ-16/AC-24 |
| `Plugins` screen | row `status !== "valid"`, `enabled:false` | — | no control capable of requesting `enabled:true` | AC-21 |
| `Plugins` screen | row `enabled:true`, any status | — | a working "Disable" control is always offered | AC-21 |
| `Plugins` screen | toggle clicked | 200 response | in-flight state shown, then full list re-fetched, row reflects server truth | AC-19 |
| `Plugins` screen | toggle clicked | non-2xx response | error shown, row's `enabled` unchanged, control returns to normal | AC-20 |
| `Plugins` screen | toggle clicked twice before first resolves | — | exactly one PATCH sent (client-side single-flight) | EC-11 |
| `Plugins` screen (**1.1.2 addendum**) | fetch resolves, records with differing `tier` values (`tier-1`/`tier-2`/`tier-3`) | — | each row's tier badge shows THAT record's own `tier` verbatim; no row ever shows a different record's tier value | REQ-18/AC-26 |
| `toAdminPluginResponse` (**1.1.2 addendum**) | discovery record carries `tier: "tier-1"` (or any of the 3 values) | — | returned envelope's `tier` equals the input record's `tier`, unchanged | REQ-10 (1.1.2), REQ-18 |
| `PLUGINS_LIST` HTTP route (**1.1.2 addendum**) | 3 discovered records with 3 different `tier` values | — | each element of the JSON response's `plugins[]` carries that same record's `tier` | REQ-10 (1.1.2), AC-26 |

---

## 3. Property-Based Tests

No `fast-check` (or equivalent) dependency exists in this project (verified: absent from `package.json`/`apps/admin/package.json`). Per this project's own precedent (no prior hand-rolled-property pattern found either), property-style coverage is provided via deterministic, hand-rolled generators/exhaustive enumeration rather than adding a new library dependency mid-certification (a Coordinator-level tooling decision, not TDD's to make unilaterally):

| Spec Ref | Property / Invariant | Generator Domain | Test Name | Status |
|---|---|---|---|---|
| BR-02 (collect-all) | For any manifest violating N ≥ 1 rules simultaneously, ALL N corresponding codes appear in `errors[]`, never a subset | A hand-constructed "kitchen sink" manifest violating 7 rules at once, asserted against all 7 expected codes | `manifest.unit.test.ts` → "collect-all, adversarial aggregate case" | Certified |
| BR-02 (isolation) | For each of 6 independent single-field mutations of an otherwise-valid manifest, exactly that field's own rule fires, and the mutation is independently verified (a "property table" sweep, not one hardcoded example) | 6 named mutations (tier, engine, capability, hook, field-namespace, queryable) | `manifest.unit.test.ts` → "property-style" | Certified |
| CIC U-003 (stub-vs-absent) | For all 2³ = 8 capability-subset combinations, every ungranted surface throws `CapabilityDeniedError` and every granted surface does not | Exhaustive enumeration (`allCapabilitySubsets()`, not sampled — stronger than a typical property test since the domain is small and fully enumerable) | `capability-sdk.unit.test.ts` (33 of its 36 tests are the 8×4 sweep + 1 sanity check) | Certified |
| TB-01 (ordering) | Composition/discovery order is invariant to attach/registration order — always built-ins-then-site, id-ascending within each group | Deliberately scrambled attach order (`zeta-site`, `z-built-in`, `alpha-site`, `a-built-in`) asserted against the one correct fixed order | `hook-registry.integration.test.ts` → "TB-01" | Certified |
| RT-005 (tokenization) | For representative TipTap document shapes (nested, whitespace-irregular, non-text nodes, empty), word count always equals non-empty `/\s+/`-split token count of concatenated text | 7 representative shapes spanning the algorithm's stated edge behavior | `word-count.unit.test.ts` | Certified (example-based sweep, not generator-based — the algorithm is a fixed string-processing pipeline, not a numeric/range invariant, so full generator-based property testing was judged lower-value than representative-shape coverage) |

---

## 4. Contract Tests

| Contract Source | Testing Approach | Test Name/File | Status | Gap / Waiver |
|---|---|---|---|---|
| Implementation Outline C-013 `PluginActivationRepoPort` (both adapters) | Shared-suite integration (mirrors `PresentationSettingsRepoPort`/`WidgetRegionBindingRepoPort` precedent — same suite run against both `InMemoryPluginActivationRepo` and `SqlitePluginActivationRepo`) | `repo.contract.test.ts` | Certified | N/A |
| ADR-005 rule 4 / REQ-08/AC-10 `@tovu/sdk` public-API snapshot | Explicit-inventory snapshot (this project's `node:test` runner has no built-in snapshot facility; an explicit, reviewable export list stands in) | `sdk-public-api.unit.test.ts` | Certified | N/A |
| api.spec.md §5/§6 `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP contract | Integration (real Express app, real `createRouteDeps()` auth/gateway stack, real HTTP requests via `fetch`) | `plugins-http.integration.test.ts` | Certified | AC-13's full revert-via-HTTP path is scoped to the change-set-shape assertion, not a literal `/change-sets/:id/revert` call — see Known Gaps |
| ui.spec.md §3.1/§5 `Plugins` input contract (`PLUGINS_LIST` response shape, incl. **1.1.2**'s additive `tier` field, consumed as a black box) | Integration (RTL + mocked `fetch`) | `Plugins.unit.test.tsx` | Certified | N/A |

---

## 5. Critical Internal Constraints — Dedicated Coverage

All 5 designated units (3 `ESCALATE_SECURITY`) received direct, dedicated test coverage through their declared Verification Surfaces — no CIC assertion targets private helper names, branch layout, or call-graph shape.

| Unit | Escalation | Test File | How Covered |
|---|---|---|---|
| **U-001** — Load pipeline verify-before-import ordering | `ESCALATE_SECURITY` | `loader.integration.test.ts` | A real fixture file on disk with a deliberately-mismatched recorded integrity hash, and separately an unsatisfiable `sdkRange`, each asserted via an injected `importModule` spy that must be called **zero times**. A third test proves integrity is checked strictly before `sdkRange` (both-fail case reports `INTEGRITY_FAILED`, not `SDK_RANGE_UNSATISFIED`) — the exact ordering BR-01 fixes. |
| **U-002** — SDK-resolution hook registration-before-reachability | `ESCALATE_SECURITY` | `plugin-sdk-resolver.integration.test.ts` | A genuine process-level test: real fixture files on disk including a **planted, conflicting local `node_modules/@tovu/sdk`** sitting next to a plugin entry file; after calling `registerPluginSdkResolver()`, a real dynamic `import()` of that plugin proves resolution redirects to the runtime's real SDK build, never the planted one. A second test asserts a specific `PluginSdkResolverAlreadyRegisteredError` (not just "throws something") on a second registration call — this specificity was deliberately added after an initial draft was caught being vacuously green against the pre-implementation stub (see Drift/Quality Notes below). |
| **U-003** — Capability-scoped SDK stub-vs-absent | `ESCALATE_SECURITY` | `capability-sdk.unit.test.ts` | Exhaustive enumeration of all 2³ = 8 capability-subset combinations; for each, asserts every surface (`content.read`, `content.extend`, `addFilter`) is always a present callable, and that invoking an ungranted one throws `CapabilityDeniedError` specifically (never an absent-property `TypeError`). |
| **U-004** — Hook-then-single-write fail-closed atomicity | none (Failure/Recovery default) | `hook-registry.integration.test.ts` (composition-layer half) + `post-plugin-hook.integration.test.ts` (`post.ts`-integration half) | The hook-registry half proves a throwing/denied/invalid-write filter rejects `runBeforeSave()` entirely (no partial patch). The `post.ts` half uses a `repo.save()` call-counter spy to prove `repo.save()` is invoked **zero times** when the injected hook throws — this is the literal U-004-B1/F1 assertion, exercised at the exact seam the constraint names. |
| **U-005** — Revert must never re-fire the hook | `ESCALATE_SECURITY` **on the SM2 transition specifically** | `revert-plugin-ext.integration.test.ts` | **Load-bearing TDD finding, not merely a designed-in test:** the CURRENT, already-shipped `postUpdateReverter.applyInverse` (`src/core/commands/appliers.ts`, unmodified by this dispatch) calls `updatePost(...)` directly — exactly the illegal transition U-005 forbids. Proven today via a `findBySlug`-spy (a `updatePost`-only side effect a raw `PostRepoPort.save()` would never trigger) against the REAL, production `revertChangeSet`/`defaultRevertRegistry()` — genuinely red today, independent of whether `post.ts`'s hook is wired yet (decouples "is revert calling the wrong function" from "is the hook wired"). A second test establishes the AC-17 version-increment/restore baseline as a non-regression guard. |

---

## 6. RT-009 Fixture Confirmation

Confirmed present in the certified fixtures, exactly as Red-Team's finding requires:

- `src/features/plugin-runtime/__tests__/fixtures/ac11-fixture.ts` — the shared AC-11/AC-18 fixture builder. Its "valid" site plugin manifest (`VALID_SITE_PLUGIN_MANIFEST`) explicitly declares `tier: "tier-3"`. Its "invalid" site plugin manifest ALSO declares a valid `tier: "tier-3"`, so its invalidity is isolated to exactly one unrelated, intended defect (`HOOK_UNKNOWN`) rather than being conflated with the tier concern. Consumed by both `discovery.integration.test.ts` (AC-11) and referenced identically (same 3-row shape) by `plugins-http.integration.test.ts` (AC-11 at the HTTP layer).
- `apps/admin/src/sections/__tests__/Plugins.unit.test.tsx`'s `AC11_PLUGINS_RESPONSE` mirrors the same 3-row shape as a literal JSON mock (duplicated deliberately, not cross-imported, since `apps/admin` is a separate package with no path alias into `src/features/plugin-runtime` — documented in that file's header comment).
- `src/features/plugin-runtime/built-ins/word-count/__tests__/unit/word-count.unit.test.ts` and every other manifest fixture built across the certified suite (`manifest.unit.test.ts`'s `validManifest()` baseline, `loader.integration.test.ts`'s fixtures, `activation.integration.test.ts`'s discovery snapshots) also declare `tier: "tier-3"` where a "should validate as valid" manifest is needed — the RT-009 fix was applied project-wide across every fixture in this certification, not only the one AC-11/AC-18 shared fixture Red-Team named.

## RT-007 Disposition

EC-11's certified test (`Plugins.unit.test.tsx`) asserts ONLY the single-render-instance client-side single-flight guard (a second click before the first PATCH resolves sends no second request) — it does **not** assert anything about cross-session/multi-operator concurrent enable/disable of the same plugin id, per RT-007's explicit finding that v1 declines an `Idempotency-Key` mechanism for this case. No test in this certification claims coverage of the cross-session case; it is recorded here as a disclosed, known v1 boundary, not silently ignored.

---

## 7. Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| AC-15 (`tovu hooks list` enumerates the declared hook point) | No CLI/`listHookPoints()` contract exists yet in the Implementation Outline's Contract Map (C-001…C-017) — this selector is named in state.spec.md §5 but was not assigned a File Map entry or Contract ID by the Software Architect, so TDD has no frozen signature to certify a test against without inventing one | Low — P2, a read-only introspection helper with no security/data-integrity surface | Route to Software Architect for a Contract Map addendum (a one-line C-xxx entry), OR accept as Programmer-designed with a follow-up TDD gap-fill pass once the signature exists |
| INV-01 (`DDL_ATTEMPTED`) | No BR, AC, or EC anywhere in the spec package assigns a trigger/test scenario for `DDL_ATTEMPTED` — it is enforced structurally by omission (the v1 capability vocabulary grants no DDL-capable surface at all, confirmed by `capability-sdk.unit.test.ts`'s "every surface is always present as a callable" sweep covering exactly the 3 v1 surfaces and no others) rather than by a runtime guard with its own failure path | Low — the property is provable by the CLOSED capability vocabulary (no 4th surface exists to misuse), not by a missing test | Disclosed; no action needed unless a future capability grants filesystem/DB-adjacent access, at which point this becomes a real trigger |
| AC-13 (full HTTP-level gateway-revert round trip) | A real `/change-sets/:id/revert` HTTP call requires a plugin-activation `EntityReverter` registered in `core/commands/appliers.ts`'s `defaultRevertRegistry()` — Programmer implementation work (tasks.md notes it under Phase 1 Track D) that is not itself a CIC-designated unit (unlike the post-entity revert path, U-005). `plugins-http.integration.test.ts` instead certifies the change-set SHAPE (entityType/operation/inversePayload) a future reverter must resolve against; `activation.integration.test.ts` certifies the underlying enable/disable state-symmetry property directly | Medium — AC-13 is P1; the state-symmetry and shape halves are certified, but no test yet exercises a literal HTTP revert round-trip for a plugin activation | Accept for this pass (scoped, disclosed); add a dedicated HTTP-level revert test once Programmer registers the plugin-activation reverter, as a natural TestRunner-cycle gap-fill, not a blocker to Programmer dispatch |
| Explicit Performance Budget (hook-composition latency) | No REQ/BR/NFR anywhere in SPEC-005 specifies a numeric latency/throughput budget (ADR `scalability` axis, score 3, explicitly names this as an open, disclosed gap — CIC's own trigger table records "no explicit budget ⇒ no trigger") | Low — disclosed, tracked at the ADR level with its own re-evaluation trigger (OQ-03 kickoff or a latency complaint) | No test certified; not a TDD gap since no requirement exists to test against |

No gap above is High-risk; none blocks Programmer dispatch.

---

## 8. Drift Status

- [x] Current spec hash matches certified hash above (`sha256:1e496a69...25e2305b8`, spec version 1.1.2 — updated by the addendum, §11)
- [x] Current spec hash was verified mechanically (provider-local validator `--print-hash`), not by visual comparison
- [x] Current test file hashes match the Test File Inventory (computed via `shasum -a 256` immediately after each file's final edit in this session; re-computed again for the 3 files touched by the 1.1.2 addendum, §11)
- [x] Expected test count is greater than zero and matches the runnable suite inventory for every file (verified by running each file individually via `node --import tsx --test <file>` / `npx vitest run <file>`, then the full aggregate suite; the 3 addendum-touched files re-verified individually post-addendum, §11)
- [x] All High-risk gaps have been reviewed by Coordinator — **N/A, no High-risk gap exists** (see §7)
- [x] No test asserts implementation internals — every CIC test uses an approved observable seam (injected `importModule`/`computeFileHash` on `loadPlugin`, a real planted-fixture dynamic import for the resolver, a `repo.save()`/`findBySlug` call-counter spy, exhaustive black-box capability enumeration) per the Verification Surface Rule; no test asserts private helper names, branch layout, or call-graph shape. The addendum's new tests are equally black-box: they assert on rendered text (`getByText`) and parsed JSON response fields, never on `Plugins.tsx`/`discovery.ts`/`plugins.ts` internals.
- [x] All P1 acceptance criteria have semantic assertion coverage, not only structural test-name mapping (verified individually in §1's matrix and demonstrated by the actual failing-assertion output captured during certification, e.g. `expected 200, actual 501`, `expected {word-count:{count:5}}, actual undefined`). AC-26 is P2 (per feature.spec.md), and its addendum test likewise has semantic (not merely structural) coverage — it fails specifically because the stub throws, not because of a naming mismatch.

---

## 9. Full Existing Suite — Regression Check

*(Historical snapshot from the 1.1.1 pass — verified true at that time. The 1.1.2 addendum's own, narrower regression scope is §11's "Regression scope note"; see the Totals line above for why no single current-moment aggregate number is asserted for the whole suite.)*

Ran the complete pre-existing suite (`npm test`, the project's own `node --import tsx --test "src/**/*.test.ts" "packages/*/src/**/*.test.ts"` — glob widened this pass to include the new `packages/sdk` tests) plus the new `apps/admin` Vitest suite in full:

- **Backend**: 2126 tests, 2007 pass, 119 fail. Of the 119 failures: **117 are this dispatch's own certified pre-implementation RED tests** (see the per-file breakdown in the Test File Inventory above); **2 are pre-existing, unrelated failures from other agents' concurrently-landing, untracked work this session** — confirmed by (a) `git status --porcelain` showing `src/site-dir/` and `src/cli/` as entirely untracked directories this dispatch never touched, and (b) re-running each in isolation: `src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts`'s `EC-05` case fails identically in isolation (a genuine pre-existing gap in that concurrent work, not induced by anything here); `src/cli/__tests__/integration/serve-command.integration.test.ts`'s boundary-value case **passes** in isolation (its full-suite failure was a `SIGTERM`-timeout, consistent with resource contention under the full 2126-test run, not a real regression). **Per this dispatch's own constraint ("if you hit merge-adjacent friction in shared files, note it rather than silently resolving"), these two are flagged for the Coordinator, not fixed here** — they belong to concurrent, unrelated dispatches.
- **`apps/admin`**: 15 tests (all new, first-ever harness for this package), all 15 fail for the intended reason (component/nav/routing stubs and not-yet-wired dispatch branch) — 0 pre-existing tests existed to regress.

No existing, previously-passing test in either suite was broken by this dispatch.

---

## 10. Handoff

Ready for Programmer dispatch. See `tasks.md` for the phased Parallel Delivery Plan (Tracks A–F, then Phase 2 `word-count`, then the gated Phase 3 `post.ts`/revert-path fix, then Phase 4 nav/routing wiring), and this document's §5/§7 for the CIC and gap context Programmer/Code-Review should carry forward. **§11 below folds in as a small addendum to this same handoff — REQ-18/AC-26 (tier badge) is additional scope for the same `Plugins.tsx`/`discovery.ts`/`plugins.ts` work items already in `tasks.md`, not a new track.**

---

## 11. Addendum (1.1.2): REQ-18/AC-26 Trust-Tier Badge

**Trigger:** Spec amendment 1.1.1 → 1.1.2 (same day, 2026-07-28), resolving Red-Team finding RT-010 (`red-team-findings-v1.1.1-amendment.md`) — REQ-10's `PLUGINS_LIST` response gains one additive `tier` field, and new REQ-18/AC-26 render it as a per-row badge on the `Plugins` screen, mirroring the existing `status` badge convention verbatim. Per the spec's own Implementation Readiness Gate note, RT-010 already reviewed and pre-cleared this exact change as ADVISORY without requiring a fresh Red-Team round, so TDD certifies AC-26 directly as an addendum — not a full re-certification.

**Hash verification (re-run, this addendum):**
```
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/005-plugin-system --phase spec --print-hash
→ Feature hash computed: sha256:1e496a69afc3df0992ed5dc69989dc1e86fd9910551501c78c3120425e2305b8
→ PASS: strict Speckit package passed mechanical validation.
```
Matches `feature.spec.md`'s `content_hash` exactly (recomputed via the validator, not visually compared) and matches the version-1.1.2 hash this dispatch was given to verify.

### Files changed (this addendum only)

| File | Kind | Change |
|---|---|---|
| `apps/admin/src/sections/__tests__/Plugins.unit.test.tsx` | certified test file | +1 test (`describe("REQ-18/AC-26 (1.1.2): per-row trust-tier badge")`); corrected one stale doc-comment line that predated 1.1.2 (no assertion changes) |
| `src/server/http/admin/__tests__/unit/plugins-dto.unit.test.ts` | certified test file | +2 tests (single-value pass-through + 3-value distinctness) |
| `src/server/routes/admin/plugins/__tests__/integration/plugins-http.integration.test.ts` | certified test file | `AC11_DISCOVERY` fixture gains a `tier` value per record (`tier-3`/`tier-1`/`tier-2` — deliberately NOT uniform, see below); +1 test |
| `src/features/plugin-runtime/discovery.ts` | TDD-owned certified stub (type-only edit) | `PluginDiscoveryRecord` gains `tier?: "tier-1"\|"tier-2"\|"tier-3"` (optional — see design note below); this addendum's edit was type-only — the function body was independently implemented for real by concurrent Programmer work during this session (not by this addendum, see below) |
| `src/server/http/admin/plugins.ts` | TDD-owned certified stub (type-only edit) | `AdminPluginEnvelope` gains `tier: "tier-1"\|"tier-2"\|"tier-3"` (required); this addendum's edit was type-only — `toAdminPluginResponse`'s body was independently implemented for real by concurrent Programmer work during this session (not by this addendum, see below) |
| `apps/admin/src/lib/api.ts` | additive infra (non-throwing, pre-existing precedent) | `AdminPlugin` gains `tier: "tier-1"\|"tier-2"\|"tier-3"` (required) |

No other file was read-write touched by this addendum. No production/implementation logic was added by this addendum to any file — every edit this addendum made to a non-test file was a type-only interface field addition (`discovery.ts`, `plugins.ts`) or the same category of thin, non-throwing infra the main 1.1.1 pass already established as TDD-authorable (`api.ts`). That two of those files' function bodies were separately, genuinely implemented by concurrent Programmer work over the course of this session (see "New tests and RED confirmation" and "Regression scope note" below) is disclosed there in full — it is not this addendum's own work.

### New tests and RED confirmation

All new/changed tests were confirmed RED immediately after being written, against the stub bodies that existed at that moment — the same bar the rest of this certified suite meets:

```
$ node --import tsx --test src/server/http/admin/__tests__/unit/plugins-dto.unit.test.ts src/server/routes/admin/plugins/__tests__/integration/plugins-http.integration.test.ts
ℹ tests 13
ℹ pass 0
ℹ fail 13

$ npx vitest run src/sections/__tests__/Plugins.unit.test.tsx   (inside apps/admin)
Test Files  1 failed (1)
     Tests  13 failed (13)
```

**Mid-session update (disclosed, not hidden):** concurrent Programmer work continued landing real implementations for the plugin-system backend — including this exact feature's own `discovery.ts`, `plugins.ts` (`toAdminPluginResponse`), `list.ts`, and `set-enabled.ts` — while this addendum was in progress (a genuine race between this TDD addendum and implementation work proceeding in the same working tree this session — see the Regression scope note below). The backend flipped fully green over the course of two re-runs; the final, stable re-run immediately before closing this record:

```
$ node --import tsx --test src/server/http/admin/__tests__/unit/plugins-dto.unit.test.ts src/server/routes/admin/plugins/__tests__/integration/plugins-http.integration.test.ts
ℹ tests 13
ℹ pass 13
ℹ fail 0
(confirmed stable across 2 consecutive runs)

$ npx vitest run src/sections/__tests__/Plugins.unit.test.tsx   (inside apps/admin)
Test Files  1 failed (1)
     Tests  13 failed (13)
```

Final breakdown:
- `plugins-dto.unit.test.ts`: **6/6 PASS** (was 4/4 RED at the moment this addendum wrote its 2 new tests). Confirmed genuine, not vacuous: the real body is `tier: (discovery.tier ?? "tier-3") as AdminPluginEnvelope["tier"]` — the addendum's "distinct records project their OWN tier" test supplies `tier-1`/`tier-2`/`tier-3` inputs and would fail immediately against any implementation that ignored `discovery.tier` and always emitted `"tier-3"`; it passes only because the real body genuinely threads the input through.
- `plugins-http.integration.test.ts`: **7/7 PASS** (was 6/6 RED at the moment this addendum wrote its 1 new test). Same genuineness argument applies: the new test's fixture gives `word-count`/`invalid-site-plugin`/`valid-site-plugin` three *different* tier values (`tier-3`/`tier-1`/`tier-2`) and asserts each survives to the wire distinctly — this would fail against a hardcoded response.
- `Plugins.unit.test.tsx`: **13/13 fail** (was 12/12; +1 addendum test), unchanged. `apps/admin/src/sections/Plugins.tsx` still throws `"not implemented"` on every render (confirmed by direct grep immediately before closing this record) — the AC-26 badge-rendering test, and all 12 pre-existing tests in this file, remain genuinely RED for that reason. **This is the one addendum test still awaiting Programmer implementation** — the backend/wire half of REQ-18/AC-26 (the `tier` field itself) is already implemented and passing; only the UI badge render is outstanding.

This backend flip is a favorable, not a concerning, outcome: it demonstrates the new `plugins-dto`/`plugins-http` tests are correctly specified against the real contract (each would have caught a hardcoded-`tier-3` bug had one been introduced) rather than a certification defect. Nothing in this addendum's own edits caused any of the flips — this addendum added only type-only fields (to already-frozen-stub or already-non-throwing infra files) and new test assertions; every behavioral implementation change was authored by the concurrent Programmer work, independently of this addendum.

### Design note: why `PluginDiscoveryRecord.tier` is optional but `AdminPluginEnvelope.tier`/`AdminPlugin.tier` are required

REQ-10's revision note frames `tier` as mirroring how `enabled` is already projected — always present in the real system. A strictly "correct" type would make it required everywhere. However, `PluginDiscoveryRecord` literals are also constructed, for concerns entirely unrelated to REQ-10/`PLUGINS_LIST`, by two files outside this addendum's scope: `src/features/plugin-runtime/__tests__/integration/activation.integration.test.ts`'s `discoveryOf()` and `.../loader.integration.test.ts`'s `record()`. Widening `tier` to required there would force edits to those two certified test files just to keep them compiling under strict `tsc` — edits with no test-behavior purpose, and explicitly out of bounds per this addendum's constraint not to touch existing certified tests outside REQ-18/AC-26. Marking it optional on the discovery-layer type avoids that blast radius entirely (verified: `activation.integration.test.ts`/`loader.integration.test.ts` needed zero changes) while the two files that actually carry the wire contract forward — `AdminPluginEnvelope` (the real api.spec.md §5 shape) and `AdminPlugin` (its `apps/admin` mirror) — keep `tier` required, since nothing outside this addendum's own edits constructs either of those types as a literal. The Programmer-facing contract is unambiguous regardless: the dedicated pass-through tests in `plugins-dto.unit.test.ts`/`plugins-http.integration.test.ts` require `tier` to always survive to the wire, so a real `discoverPlugins()` implementation that leaves `tier` undefined on some records will fail those tests even though the TS type would technically allow it.

### Wire-level `tier` field: did REQ-10's backend tests already cover it?

**No — confirmed by direct inspection, not assumed.** Before this addendum:
- `PluginDiscoveryRecord` (discovery.ts) had no `tier` field at all.
- `AdminPluginEnvelope` (`src/server/http/admin/plugins.ts`) had no `tier` field at all.
- `plugins-http.integration.test.ts`'s `AC11_DISCOVERY` fixture — the shared fixture for the AC-11/REQ-10 HTTP test — carried no `tier` value on any of its 3 records, and no assertion in that file ever read `.tier`.
- `plugins-dto.unit.test.ts`'s `discovery()` helper and all 4 of its pre-existing tests were likewise silent on `tier`.

RT-009's fixture requirement (referenced by the dispatch as a possible reason this might already be incidentally covered) concerns a **different layer**: it requires `PluginManifest.tier` (the manifest-validation-time field, required since 1.1.1) to be present in manifest fixtures like `ac11-fixture.ts`, so those manifests validate as `"valid"` rather than spuriously failing `MANIFEST_MALFORMED`. It has no bearing on `PluginDiscoveryRecord`/`AdminPluginEnvelope`, which are injected directly in the HTTP/DTO test layer and never pass through `validateManifest()` — so RT-009's fix could not have incidentally covered this. **A small addition was genuinely needed**, and this addendum makes it: 2 new DTO-layer tests + 1 new HTTP-layer test, plus a fixture update giving the 3 `AC11_DISCOVERY` records 3 *different* tier values (`tier-3`/`tier-1`/`tier-2`) specifically so the new HTTP test cannot pass against an implementation that hardcodes `"tier-3"` for every row — mirroring AC-26's own explicit concern at the UI layer.

### Regression scope note

This addendum's own before/after verification is scoped to the 3 test files + 3 type-only files above (confirmed compile-clean via `npx tsc --noEmit` for every touched file — see the two "TDD-owned"/"Additive" paragraphs above for the exact commands and results). A full monorepo suite re-run was deliberately **not** attempted for this addendum: unrelated concurrent implementation work was landing real (non-throwing) bodies for several certified 1.1.1 stubs throughout this same session, both before and *during* this addendum (`manifest.ts`, `capability-sdk.ts`, `hook-registry.ts`, and — as documented above — `toAdminPluginResponse` in `src/server/http/admin/plugins.ts` itself). That drift is pre-existing/concurrent repo activity neither caused by nor blocked by this addendum's own scope — mirroring the original 1.1.1 pass's own §9 precedent of explicitly disclosing concurrent-work drift rather than silently re-baselining or silently ignoring it. As of this record's final re-run (confirmed by direct grep immediately before finalizing this document): `discovery.ts`'s `discoverPlugins()`, `plugins.ts`'s `toAdminPluginResponse()`, `list.ts`, and `set-enabled.ts` **no longer throw** — all four were implemented for real by concurrent Programmer work over the course of this session, which is why the backend suite (§ "New tests and RED confirmation" above) is now 13/13 GREEN. Only `apps/admin/src/sections/Plugins.tsx` remains a throwing stub. This addendum's own edits to `discovery.ts`/`plugins.ts` were type-only in both cases and remain compile-clean and behaviorally inert regardless of which side of the stub/implemented line each file's body currently sits on — this addendum did not implement, and takes no credit for, the real bodies now in place.

### Known Gaps — unchanged

No new gap. AC-26 (P2) is fully certified; no High-risk gap is introduced or discovered by this addendum.

### Ready to fold into Programmer dispatch

Yes. REQ-18/AC-26 requires no new component (`ui.spec.md` §5: "one added `<span>` inside the existing `PluginRow`") and no new backend module — it is additional, in-scope work for the same `discovery.ts`/`plugins.ts`/`Plugins.tsx` implementation items `tasks.md` already schedules. No `tasks.md` change is required for this addendum. As it happens, by the time this addendum closed, concurrent Programmer work had already implemented the backend/wire half of this addendum's own scope (`discovery.ts`, `toAdminPluginResponse`, `list.ts`, `set-enabled.ts` all pass their `tier`-related tests, §11 above) — the only remaining implementation surface for REQ-18/AC-26 is `apps/admin/src/sections/Plugins.tsx`'s per-row tier badge, which Programmer implements alongside the rest of REQ-12..17/AC-18..25/EC-11 in the same file.
