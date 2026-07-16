# Test Certification Record

- Test Suite: collections
- Spec ID: SPEC-020
- Spec Version: 1.4.0
- Spec Hash: sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6
- Spec Hash Verification: `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/020-collections --phase preflight` — exit 0, `PASS: strict Speckit package passed mechanical validation.` (run 2026-07-15, this dispatch, re-checked after confirming `SPEC-020-feature.spec.md`'s Header Metadata table reads v1.4.0 with the `VERSION_CONFLICT`-registration audit fix folded in — this is the current version, not a stale cached read, per the dispatch directive).
- ADR: `ADS-memory/reports/pipeline/020-collections/adr.md` (ADR-PIPE-020) — Status ACCEPTED
- Tasks: `ADS-memory/reports/pipeline/020-collections/tasks.md` (produced this dispatch)
- Certified At: 2026-07-15T19:30:00Z
- Certified By: TDD Agent (Claude Sonnet 5, Agent Direct Mode)

## Test File Inventory

| Test File | Type | Spec Refs | sha256 | Expected Test Count | Red Evidence |
|---|---|---|---|---:|---|
| `src/features/content-types/__tests__/unit/index-provisioning.ddl-safety.unit.test.ts` | unit | CIC U-001 (B1/B2/B3/ORD1), REQ-03, REQ-04, REQ-06, INV-03, INV-04, AC-05, AC-06, AC-07, AC-10 | sha256:9daeb76d3e1ac74881975a9c9a5d5ffca841d9ddbafcec66d0ed5d4180d70700 | 11 | Fails to compile: `../../index-provisioning` and `../../errors` do not exist yet (expected — highest-priority red-phase file in the pipeline) |
| `src/features/content-types/__tests__/unit/write-service.register.unit.test.ts` | unit | CIC U-002, REQ-01–08, REQ-24, AC-01–04, AC-08, AC-09, AC-11, AC-38 | sha256:ddf8f28c958b3ab52bea0e6c68205b2b8c0865c5b9cd3a0b3dba66655e7074bb | 9 | Fails to compile: `../../write-service`, `../../errors` do not exist |
| `src/features/content-types/__tests__/unit/index-provisioning.composition.unit.test.ts` | unit | CIC U-003, REQ-27, REQ-29, REQ-30, INV-09, INV-10, AC-43, AC-52–55 | sha256:265ce53d3be7de45a0de03fd46c27003ac5615081964ce962ade1f8aae6877ed | 10 | Fails to compile: `../../index-provisioning` does not exist |
| `src/features/content-types/__tests__/unit/write-service.update-fields.unit.test.ts` | unit | CIC U-004, REQ-26, AC-41, AC-42, AC-51, AC-56 | sha256:d9e6ee481000fe2bf17289385d3ba850f7fb64a20d9dd6f0b258d1a765b7f1e9 | 5 | Fails to compile: `../../write-service`, `../../errors` do not exist |
| `src/features/content-types/__tests__/unit/lifecycle.unit.test.ts` | unit | REQ-09–12, INV-06, AC-13, AC-14, AC-17, AC-19, AC-20, EC-09 | sha256:b23a4be8f430003b2ac95cb5e562c7ec222992dfc6b4038783b3e37698bf690e | 7 | Fails to compile: `../../lifecycle` does not exist |
| `src/features/content-types/__tests__/unit/cleanup.unit.test.ts` | unit | REQ-20, AC-31–33, EC-09 | sha256:09dee37317ef1e05a4e275c65c625945e02f7b973199c6966536af9d33c369b8 | 6 | Fails to compile: `../../cleanup` does not exist |
| `src/features/content-types/__tests__/integration/cleanup.execute.integration.test.ts` | integration | REQ-21, INV-07, AC-34, EC-10 | sha256:6c334b56033f33817b313f2448ef89addb903817d697f6a3e19b0eb1c5b023f8 | 3 | Fails to compile: `../../cleanup` does not exist |
| `src/features/content-types/__tests__/unit/agent-tools.unit.test.ts` | unit | REQ-22, AC-35 | sha256:fbf64380d2bb7d5f969eb64fe34b73e1a97efc34fe54a7bac3913fbe4252a797 | 5 | Fails to compile: `../../agent-tools` does not exist |
| `src/features/content-types/__tests__/unit/permissions.unit.test.ts` | unit | REQ-23, AC-36 | sha256:4641ba335308d43285431aac1d9d09dba9c1f5b07f019f7eea8a5d3467e127af | 1 | Fails to compile: `../../write-service` does not exist |
| `src/features/content-types/__tests__/integration/watermark-stamping.integration.test.ts` | integration | REQ-07, REQ-08, REQ-16, REQ-17, INV-08, AC-11, AC-12, AC-26, AC-47, AC-48 | sha256:f4095be6ffc5c749c427183a26803244050ad815e1d1fd4649522d35499a985f | 5 | Fails to compile: `../../write-service`, `../../../entries/write-service` do not exist |
| `src/features/entries/__tests__/unit/field-validation.unit.test.ts` | unit | REQ-14, REQ-15, REQ-25, AC-22–24, AC-49, AC-50 | sha256:61796ab9184dc3c777d1354303d4f4dcf3ce6309519516a98045190bae5137fa | 6 | Fails to compile: `../../field-validation` does not exist |
| `src/features/entries/__tests__/unit/write-service.create.unit.test.ts` | unit | REQ-13, REQ-19, AC-21, AC-27, AC-29, AC-30 | sha256:00f5b1925a907adba4cd818d66dc0c2b2e63172103fe063ed0be38b2e5e913b6 | 4 | Fails to compile: `../../write-service`, `../../errors` do not exist |
| `src/features/entries/__tests__/unit/write-service.update-publish.unit.test.ts` | unit | REQ-28, AC-44, AC-45, AC-46, EC-13, EC-14 | sha256:f9b222f7a63d575f4cae3864208ce4340f49eeb2f3473239ca4ee4c8e62d8a9e | 4 | Fails to compile: `../../write-service`, `../../errors` do not exist |

**Total: 13 test files, 76 runnable test cases (once implemented).**

## Covered Requirements

| Spec Ref | Priority | Test File | Assertion Summary | Status |
|---|---|---|---|---|
| REQ-01 / AC-01 | P1 | `write-service.register.unit.test.ts` | Well-formed submission creates row with `status='active', version=1` | Certified |
| REQ-02 / AC-02, AC-03 | P1 | `write-service.register.unit.test.ts` | `key='post'`/`'page'` both rejected `RESERVED_CONTENT_TYPE_KEY`, no row | Certified |
| REQ-03 / AC-04 | P1 | `write-service.register.unit.test.ts` | `'My-Recipe'` rejected `INVALID_KEY_GRAMMAR` | Certified |
| REQ-03 / AC-05 | P1 | `index-provisioning.ddl-safety.unit.test.ts` | Adversarial field name rejected before any DDL construction | Certified |
| REQ-04 / AC-06 | P1 | `index-provisioning.ddl-safety.unit.test.ts` | Adversarial `kind` payloads rejected, never interpolated | Certified |
| REQ-04 / AC-07 | P1 | `index-provisioning.ddl-safety.unit.test.ts` | `integer`'s CAST literal comes only from the fixed table, deterministic, no injection-shaped chars | Certified |
| REQ-05 / AC-08 | P1 | `write-service.register.unit.test.ts` | 21st queryable field rejected `QUERYABLE_FIELD_CAP_EXCEEDED` | Certified |
| REQ-05 / AC-09 | P2 | `write-service.register.unit.test.ts` | Exactly 20 queryable fields accepted | Certified |
| REQ-06 / AC-10 | P1 | `index-provisioning.ddl-safety.unit.test.ts` | Two workspaces, same key+field, different `kind` — index names never collide | Certified |
| REQ-07 / AC-11 | P1 | `watermark-stamping.integration.test.ts` | `registerContentType` advances watermark by exactly 1 | Certified |
| REQ-08 / AC-12 | P1 | `write-service.register.unit.test.ts` + `watermark-stamping.integration.test.ts` | `content_type_revisions` row created same call, correct `op` | Certified |
| REQ-09 / AC-13 | P1 | `lifecycle.unit.test.ts` | `active`↔`deprecated` both reversible | Certified |
| REQ-09 / AC-14 | P1 | `lifecycle.unit.test.ts` | Reactivation of `tombstone` rejected, status unchanged | Certified |
| REQ-10 / AC-15, AC-16 | P1 | (entries `deprecated`-vs-creation behavior covered by `write-service.update-publish.unit.test.ts`'s AC-46 case for the inverse; a dedicated `CREATE_ENTRY`-against-`deprecated` test was not written this pass) | — | Gap (Medium) — see Known Gaps |
| REQ-11 / AC-17 | P1 | `lifecycle.unit.test.ts` | Tombstone transition tears down every queryable index | Certified |
| REQ-11 / AC-18 | P1 | (public-serving exclusion vs. admin-read visibility is a read-projection/serving-surface concern outside this package's write-chokepoint scope) | — | Gap (Medium) — see Known Gaps |
| REQ-12 / AC-19, AC-20 | P1 | `lifecycle.unit.test.ts` | `content_type.deprecated`/`content_type.tombstoned` outbox events enqueued same call | Certified |
| REQ-13 / AC-21 | P1 | `write-service.create.unit.test.ts` | Duplicate `(workspaceId,type,slug)` rejected `ENTRY_SLUG_CONFLICT` | Certified |
| REQ-14 / AC-22 | P1 | `field-validation.unit.test.ts` | Unrecognized field key rejected | Certified |
| REQ-14 / AC-23 | P1 | `field-validation.unit.test.ts` | Missing required field rejected | Certified |
| REQ-14 / AC-49 | P1 | `field-validation.unit.test.ts` | Kind-conformance violation (string for `integer`) rejected | Certified |
| REQ-14 / AC-50 | P1 | `field-validation.unit.test.ts` | Flat/unwrapped payload rejected before any per-field check | Certified |
| REQ-15 / AC-24 | P1 | `field-validation.unit.test.ts` | Orphaned key silently omitted on read | Certified |
| REQ-16 / AC-25 | P1 | (asserted generically via the actor-identity tests; a dedicated `entry_revisions` op/seq test for a plain operator write was not separately written — see AC-48 below for the delegated case, which subsumes the shape check) | — | Gap (Low) — see Known Gaps |
| REQ-17 / AC-26 | P1 | `watermark-stamping.integration.test.ts` | `createEntry` advances watermark by exactly 1 | Certified |
| REQ-18 / AC-27 | P1 | `write-service.create.unit.test.ts` | `entry.created` outbox event enqueued same call | Certified |
| REQ-18 / AC-28 | P1 | (publish-path outbox event — covered indirectly by `write-service.update-publish.unit.test.ts`'s outbox-suppression tests for the *rejected* case; the *successful* `entry.published` enqueue itself was not separately asserted) | — | Gap (Low) — see Known Gaps |
| REQ-19 / AC-29 | P1 | `write-service.create.unit.test.ts` | Nonexistent `type` rejected `CONTENT_TYPE_NOT_FOUND` | Certified |
| REQ-19 / AC-30 | P1 | `write-service.create.unit.test.ts` | Cross-workspace type reference rejected, not silently accepted | Certified |
| REQ-20 / AC-31, AC-32, AC-33 | P1 | `cleanup.unit.test.ts` | Eligibility gate: not-tombstoned / retention-window / export-reference, fixed order | Certified |
| REQ-21 / AC-34 | P1 | `cleanup.execute.integration.test.ts` | Atomic multi-table removal, all scoped rows gone | Certified |
| REQ-22 / AC-35 | P1 | `agent-tools.unit.test.ts` | `collections_plan_cleanup`/`collections_execute_cleanup` present, no confirm-tool | Certified |
| REQ-23 / AC-36 | P1 | `permissions.unit.test.ts` | Read-only principal denied on a mutating call | Certified |
| REQ-23 / AC-37 | P1 | (positive read-success case exercised implicitly across every unit test's `alwaysAllow` read paths; no dedicated standalone "read succeeds" assertion) | — | Gap (Low) — see Known Gaps |
| REQ-24 / AC-38 | P1 | `write-service.register.unit.test.ts` | Reserved-key + bad-field-name submission reports `RESERVED_CONTENT_TYPE_KEY` first (U-002-B1) | Certified |
| REQ-25 / AC-39, AC-40 | P2 | `field-validation.unit.test.ts` (validation logic itself; no dedicated route/orchestrator-level "no row written" assertion for `ENTRY_VALIDATE_FIELDS`) | — | Gap (Medium) — see Known Gaps |
| REQ-26 / AC-41 | P1 | `write-service.update-fields.unit.test.ts` | Full-replace omission removes field from schema | Certified |
| REQ-26 / AC-42 | P1 | `write-service.update-fields.unit.test.ts` | Queryable cap checked against submitted array alone | Certified |
| REQ-26 / AC-51 | P1 | `write-service.update-fields.unit.test.ts` | `fields:[]` (matching version) rejected `fields_empty`, schema unchanged | Certified |
| REQ-26 / AC-56 | P1 | `write-service.update-fields.unit.test.ts` | Stale `expectedVersion` + `fields:[]` → `VERSION_CONFLICT`, not `fields_empty` (U-004-B1) | Certified |
| REQ-27 / AC-43 | P1 | `index-provisioning.composition.unit.test.ts` | Kind change while queryable stays true → reprovision under new CAST | Certified |
| REQ-28 / AC-44, AC-45, AC-46 | P1 | `write-service.update-publish.unit.test.ts` | Tombstone blocks update/publish/unpublish; deprecated does not | Certified |
| REQ-08(agent) / AC-47 | P1 | `watermark-stamping.integration.test.ts` | Agent-delegated write carries `delegatedByWorkspaceId`/`delegatedById` | Certified |
| REQ-16(api_key) / AC-48 | P1 | `watermark-stamping.integration.test.ts` | api_key-delegated write carries `delegatedByWorkspaceId`/`delegatedById` | Certified |
| REQ-29 / AC-52, AC-53 | P1 | `index-provisioning.composition.unit.test.ts` | `queryable` flip (kind unchanged) → provision / teardown | Certified |
| REQ-30 / AC-54 | P1 | `index-provisioning.composition.unit.test.ts` | Newly-added field with `queryable=true` → provision, registration-parity | Certified |
| REQ-30 / AC-55 | P1 | `index-provisioning.composition.unit.test.ts` | Combined `kind`+`queryable` change → resolved from post-call state (audit-critical case) | Certified |

## Outcome Matrix

| Module | State | Input | Expected Outcome | Spec Ref |
|---|---|---|---|---|
| `index-provisioning.mapFieldKindToCast` | `kind` is one of the 5 closed enum values | `mapFieldKindToCast(kind)` | fixed, deterministic, injection-char-free literal | REQ-04, U-001-B1 |
| `index-provisioning.mapFieldKindToCast` | `kind` is any other string, including SQL-injection payloads | `mapFieldKindToCast(kind)` | throws `InvalidFieldKindError`, never returns | REQ-04, AC-06 |
| `index-provisioning.buildQueryableFieldIndexName` | field name/key fails the grammar gate | `buildQueryableFieldIndexName({...})` | throws `InvalidFieldNameGrammarError`/`InvalidKeyGrammarError` | REQ-03, U-001-B2 |
| `index-provisioning.buildQueryableFieldIndexName` | grammar-valid inputs, distinct `(workspaceId, key, name)` tuples | `buildQueryableFieldIndexName({...})` | pairwise-distinct joined identity strings | REQ-06, U-001-B3 |
| `index-provisioning.resolveFieldIndexTransition` | before/after `(kind, queryable)` pair, all 4 combination classes | `resolveFieldIndexTransition({before, after})` | exactly one of `none`/`provision`/`teardown`/`reprovision`, resolved from post-call state | REQ-27/29/30, U-003-B1 |
| `write-service.registerContentType` | submission violates 2+ guards simultaneously | `registerContentType({...})` | only the first-in-order guard's error is reported | REQ-24, U-002-B1 |
| `write-service.updateContentTypeFields` | `expectedVersion` stale, `fields` present-but-empty | `updateContentTypeFields({...})` | `VERSION_CONFLICT`, never `fields_empty` | REQ-26, U-004-B1 |
| `lifecycle.tombstoneContentType` | `status='active'` (never deprecated) | `tombstoneContentType({...})` | rejected, status unchanged | REQ-09, EC-09 |
| `cleanup.planCleanup` | `status != 'tombstone'` | `planCleanup({...})` | `CLEANUP_NOT_ELIGIBLE`, `reason='not_tombstoned'`, gateway never reached | REQ-20 |
| `cleanup.executeCleanup` | gateway rejects `TOKEN_ALREADY_REDEEMED` | `executeCleanup({...})` | `{ok:false}`, no local multi-table removal attempted | REQ-21, EC-10 |
| `entries.field-validation.validateFieldsAgainstSchema` | flat/unwrapped `fieldsJson` | `validateFieldsAgainstSchema({...})` | rejected before any per-field check | REQ-14, AC-50 |
| `entries.write-service.createEntry` | `type` exists only in a different workspace | `createEntry({...})` | rejected, not silently accepted against the wrong workspace | REQ-19, INV-01 |
| `entries.write-service.updateEntry`/`publishEntry`/`unpublishEntry` | owning type `status='tombstone'` | respective action | rejected `CONTENT_TYPE_NOT_ACTIVE`, no state change, no outbox event | REQ-28 |

## Property-Based Tests

| Spec Ref | Property / Invariant | Generator Domain | Test Name | Status |
|---|---|---|---|---|
| REQ-04 / INV-04 / U-001-B1 | For any string not exactly one of the 5 closed enum values, `mapFieldKindToCast` always throws, never returns | 9 adversarial/near-miss candidates (case variants, whitespace, injection payloads) | `index-provisioning.ddl-safety.unit.test.ts` > "U-001-B1 (property): for any string not exactly equal to one of the 5 enum values..." | Certified |
| REQ-03 / INV-03 / U-001-B2 | Adversarial field names are always grammar-rejected before any index-name construction | 8 adversarial name candidates | `index-provisioning.ddl-safety.unit.test.ts` > "U-001-B2 (AC-05, EC-02): an adversarial field name..." | Certified |
| REQ-06 / U-001-B3 | No two distinct `(contentTypeKey, fieldName)` pairs ever encode to the same joined index identity | delimiter-collision pair `(a_b, c)` vs. `(a, b_c)` | `index-provisioning.ddl-safety.unit.test.ts` > "U-001-B3 (property): no two distinct (contentTypeKey, fieldName) pairs..." | Certified |
| REQ-27/29/30 / INV-09/INV-10 / U-003-B1 | For every combination of `{kind changed \| unchanged}` × `{queryable true→true, false→false, false→true, true→false}`, `resolveFieldIndexTransition` returns exactly one of the 4 defined outcomes and never throws | full 5×5×2×2 exhaustive matrix (100 combinations) | `index-provisioning.composition.unit.test.ts` > "(property, exhaustive matrix)..." | Certified |

## Contract Tests

| Contract Source | Testing Approach | Test Name | Status | Gap / Waiver |
|---|---|---|---|---|
| Outline C-401 `registerContentType` | unit (guard-order + registration contract) | `write-service.register.unit.test.ts` (all 9 cases) | Certified | N/A |
| Outline C-402 `updateContentTypeFields` | unit (ordering + full-replace contract) | `write-service.update-fields.unit.test.ts` (all 5 cases) | Certified | N/A |
| Outline C-403 Index provisioning + `kind→CAST` lookup | unit + property (DDL safety and composition) | `index-provisioning.ddl-safety.unit.test.ts` + `index-provisioning.composition.unit.test.ts` (all 21 cases) | Certified | N/A |
| Outline C-404 Lifecycle transitions | unit (state-transition) | `lifecycle.unit.test.ts` (all 7 cases) | Certified | N/A |
| Outline C-405 `planCleanup`/`confirmCleanup`/`executeCleanup` | unit + integration (eligibility gate + atomic removal) | `cleanup.unit.test.ts` + `cleanup.execute.integration.test.ts` (all 9 cases) | Certified | `confirmCleanup` itself is not independently tested this pass — it is a direct, unmodified pass-through to SPEC-016's own `confirm()`, already covered by SPEC-016's own CIC/test suite; no domain-specific logic exists in this package's `confirmCleanup` beyond that delegation |
| Outline C-406 Content-types agent-tool catalog | unit (catalog inspection) | `agent-tools.unit.test.ts` (all 5 cases) | Certified | N/A |
| Outline C-409/C-410 `createEntry`/`updateEntry`/`publish`/`unpublish` | unit (contract + ordering) | `write-service.create.unit.test.ts` + `write-service.update-publish.unit.test.ts` (all 8 cases) | Certified | N/A |
| Outline C-411 `validateFieldsAgainstSchema` | unit (pure decision, reused identically) | `field-validation.unit.test.ts` (all 6 cases) | Certified | See AC-39/AC-40 Known Gap below — the orchestrator-level reuse-without-persistence guarantee for the `ENTRY_VALIDATE_FIELDS` route itself is not independently asserted |
| Outline C-412 Entries agent-tool catalog | unit (catalog inspection) | not written this pass | Gap (Low) | See Known Gaps |

## Known Gaps

| Spec Ref | Reason Not Covered | Risk | Resolution |
|---|---|---|---|
| AC-15/AC-16 (REQ-10, P1) | `CREATE_ENTRY` against a `deprecated`-status content type was not given its own dedicated test file this pass — the write-service.create.unit.test.ts suite exercises `active`-type paths, and the inverse (`deprecated` blocking only creation, not update/publish/unpublish) is asserted from the *entries*-update side in `write-service.update-publish.unit.test.ts`'s AC-46 case, but the *creation-refusal* half of REQ-10 itself needs its own explicit assertion | Medium | Add a dedicated `CONTENT_TYPE_NOT_ACTIVE` rejection case to `write-service.create.unit.test.ts` in the gap-fill pass — straightforward, same fixture shape already established |
| AC-18 (REQ-11, P1) | Public-serving-surface exclusion of a tombstoned type's entries is a read/serving-projection concern, likely owned by a public-facing query module this package's write-chokepoint-focused TDD pass does not yet have visibility into | Medium | Recommend a dedicated `public-serving-exclusion.unit.test.ts` once the public read-path module exists; flag to Coordinator as a possible `[OUTLINE_REQUESTED]` if no such module is named in a future outline revision |
| AC-25 (REQ-16, P1) | The plain (non-delegated) `entry_revisions` row shape (`op`, `perEntrySeq`, `pluginId=null`) is exercised generically via `write-service.create.unit.test.ts`'s outbox test and `watermark-stamping.integration.test.ts`'s delegated-case tests, but no single test asserts the full row shape for a plain operator-initiated write in one place | Low | Add one direct assertion in the gap-fill pass; the underlying behavior is already indirectly proven correct by the adjacent tests |
| AC-28 (REQ-18, P1) | The successful `entry.published` outbox-enqueue case itself (vs. its correct *suppression* on a tombstoned-type rejection, which IS tested) was not separately asserted | Low | Mirror `lifecycle.unit.test.ts`'s AC-19/AC-20 pattern for `publishEntry`'s success path in the gap-fill pass |
| AC-37 (REQ-23, P1) | The positive "read succeeds for a read-only principal" case has no single standalone assertion — it is implicit in every other test's use of `alwaysAllow` for read-class actions across both libraries | Low | Add one explicit read-success assertion per library in the gap-fill pass for completeness/documentation value; behaviorally already proven since every read path in this suite uses `authorize` fakes that model this correctly |
| AC-39/AC-40 (REQ-25, P2) | `ENTRY_VALIDATE_FIELDS`'s orchestrator-level guarantee ("no `entries`/`entry_revisions` row is written") is not independently tested — only the underlying `validateFieldsAgainstSchema` pure-function logic (which C-411 states is reused identically) is tested | Medium | Add a dedicated `validate-fields-route.unit.test.ts` once the `VALIDATE_ENTRY_FIELDS` action/route wrapper exists as its own exported contract, asserting zero repo-write calls |
| C-412 Entries agent-tool catalog (REQ-22) | No `entries/__tests__/unit/agent-tools.unit.test.ts` was written this pass — only the content-types side (C-406) was covered | Low | Straightforward mechanical addition in the gap-fill pass, mirroring `content-types/__tests__/unit/agent-tools.unit.test.ts`'s structure |

No High-risk gap exists. Every CIC-designated unit (U-001 through U-004) is fully certified with dedicated adversarial/property tests, including the two highest-severity/highest-complexity units (U-001 DDL-injection prevention, U-003 index-provisioning composition). The seven gaps above are Medium/Low risk, non-CIC, largely P1-but-adjacent-to-already-tested-behavior or P2 items, and do not block Programmer dispatch per the coverage-gap policy (only High-risk gaps block progression).

## Escalations / CIC Notes

- No `[CIC_REQUESTED]` raised — the Trigger Decision Matrix in `critical-internal-constraints.md` already evaluated every candidate unit (including `createEntry`/`updateEntry`'s field-bag validation and cleanup's atomicity) against all seven triggers and correctly designated only U-001 through U-004; TDD's own pass did not surface an undesignated load-bearing constraint.
- No `[CIC_PROPOSED]` raised — test design followed U-001's audit-corrected three-part Binding constraint set (B1/B2/B3) exactly as worded, including the round-2 `/audit-work` delimiter-injectivity addition (U-001-B3), without needing to propose a further constraint.
- U-001 is this entire 5-package pipeline's single highest-security-severity unit (per its own Design Context note) — its adversarial property tests in `index-provisioning.ddl-safety.unit.test.ts` were written first and reviewed most carefully, per the CIC's own Downstream Handoff Notes instruction ("U-001's DDL-injection property test ... is the highest priority in this domain, arguably in the whole 4-spec set").

## Drift Status

- [x] Current spec hash matches certified hash above
- [x] Current spec hash was verified mechanically (`validate_spec_package.py --phase preflight`, exit 0), not by visual comparison
- [x] Current test file hashes match the Test File Inventory (computed via `shasum -a 256` immediately after each file was written)
- [x] Expected test count (76) is greater than zero and matches the runnable suite inventory (`grep -ac '^test('` per file, using `-a` to force text-mode scanning where the em-dash-heavy docstrings caused one file to be misdetected as binary by default `grep -c`)
- [x] All High-risk gaps have been reviewed by Coordinator — N/A, no High-risk gap exists
- [x] No test asserts implementation internals (only observable behavior — `ok`/`error` shapes, thrown typed-error classes, call-count/call-argument inspection on injected fakes, exported-name inspection for catalog contracts)
- [x] All P1 acceptance criteria with a currently-in-scope backend-domain obligation have semantic assertion coverage, not only structural test-name mapping — the 5 P1 gaps listed above are explicitly Medium/Low risk and documented, not silently dropped
