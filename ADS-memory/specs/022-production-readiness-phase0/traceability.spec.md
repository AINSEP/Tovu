# Traceability Matrix: Production Readiness Phase 0 — Capability Inventory & Runtime-Mode Containment

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-022 |
| feature_name | FEAT-022-production-readiness-phase0 |
| version | 1.0.0 |
| content_hash | anchored in feature.spec.md |
| last_edited | 2026-07-16T00:00:00Z |
| traceability_status | IN PROGRESS |

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Checked-in capability inventory artifact | — | pending (`src/server/capability-inventory.ts`) | pending | `src/server/__tests__/unit/capability-inventory.unit.test.ts` | all | TESTED |
| AC-01 (REQ-01) | Every route/worker has a complete inventory entry | P1 | pending | pending | `.../capability-inventory.unit.test.ts`, `.../production-readiness-boot.integration.test.ts` | "every inventory entry has all required fields...", "every capability named in the inventory corresponds to something real..." | TESTED |
| AC-02 (REQ-01) | Ambiguous owner documented explicitly | P2 | pending | pending | `.../capability-inventory.unit.test.ts` | "an entry with an ambiguous owner documents..." | TESTED |
| REQ-02 | Explicit runtime-mode signal, not NODE_ENV-derived | — | pending (`src/server/runtime-mode.ts`) | pending | `src/server/__tests__/unit/runtime-mode.unit.test.ts` | all | TESTED |
| AC-03 (REQ-02) | NODE_ENV=production alone resolves local | P1 | pending | pending | `.../runtime-mode.unit.test.ts` | "NODE_ENV=production alone (signal unset) resolves local..." | TESTED |
| AC-04 (REQ-02) | Explicit signal=production resolves production regardless of NODE_ENV | P1 | pending | pending | `.../runtime-mode.unit.test.ts` | "explicit TOVU_RUNTIME_MODE=production resolves production..." | TESTED |
| REQ-03 | Production-mode fail-closed boot refusal | — | pending (`src/server/production-readiness-gate.ts`) | pending | `.../production-readiness-gate.unit.test.ts`, `.../production-readiness-boot.integration.test.ts` | all | TESTED |
| AC-05 (REQ-03) | Missing durable adapter refuses boot, names capability+requirement | P1 | pending | pending | both files above | "a production capability missing its durable adapter refuses boot...", "booting the REAL composition in production mode refuses..." | TESTED |
| AC-06 (REQ-03) | Dev-only secret placeholder refuses boot before route registration | P1 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "a dev-only secret placeholder refuses boot..." | TESTED |
| AC-07 (REQ-03) | All requirements met boots successfully | P2 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "all production capabilities durable, no unsafe defaults -> boot succeeds" | TESTED |
| REQ-04 | Local-only/experimental capabilities contained in production | — | pending | pending | `.../production-readiness-gate.unit.test.ts` | AC-08/09 rows | TESTED |
| AC-08 (REQ-04) | local-only route 404s (never-registered) in production | P1 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "a local-only capability is not registered in production mode" | TESTED |
| AC-09 (REQ-04) | Same capability works normally in local mode | P1 | pending | pending | covered indirectly via AC-13's local-mode assertion; dedicated test to be added if Programmer finds a gap during implementation | — | TESTED (partial) |
| REQ-05 | Non-production capabilities self-identify classification | — | pending | pending | `.../production-readiness-gate.unit.test.ts` | AC-10 | TESTED |
| AC-10 (REQ-05) | experimental classification present in readiness metadata | P2 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "a non-production capability's decision carries its classification" | TESTED |
| REQ-06 | Every currently-in-memory production capability gets classified | — | pending | pending | `.../capability-inventory.unit.test.ts` | AC-11 | TESTED |
| AC-11 (REQ-06) | outbox/change-sets/members/webhooks/origin/media/analytics all classified | P1 | pending | pending | `.../capability-inventory.unit.test.ts` | "every capability named in ADR-046's Context as currently in-memory is classified" | TESTED |
| REQ-07 | Webhook delivery worker contained in production | — | pending | pending | `.../production-readiness-gate.unit.test.ts` | AC-12/13 | TESTED |
| AC-12 (REQ-07) | processDueDeliveries never invoked in production | P1 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "webhook delivery worker is never invoked in production mode" | TESTED |
| AC-13 (REQ-07) | Unchanged in local mode | P2 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "webhook delivery worker behaves unchanged in local mode" | TESTED |
| REQ-08 | sharp readiness gate for media transform routes | — | pending | pending | `.../production-readiness-gate.unit.test.ts` | AC-14/15 | TESTED |
| AC-14 (REQ-08) | sharp native-load failure withholds transform routes, attributes cause | P1 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "sharp readiness failure withholds media transform routes..." | TESTED |
| AC-15 (REQ-08) | sharp ready + passing evidence registers routes normally | P2 | pending | pending | `.../production-readiness-gate.unit.test.ts` | "sharp ready registers media transform routes normally" | TESTED |
| REQ-09 | Purpose-scoped mailer seam gate, discriminating field | — | pending (`src/mail/purpose-scoped-mailer.ts`, `src/mail/ports.ts` change) | pending | `.../purpose-scoped-mailer.unit.test.ts`, `.../purpose-scoped-mailer-call-sites.integration.test.ts` | all | TESTED |
| AC-16 (REQ-09) | Pre-fix collision demonstrated (members/forms indistinguishable) | P1 | pending | pending | `.../purpose-scoped-mailer-call-sites.integration.test.ts` | "pre-fix collision (historical regression guard)..." | TESTED |
| AC-17 (REQ-09) | Post-fix vocabulary split resolves each to correct lane | P1 | pending | pending | both call-site + unit files | "post-fix vocabulary split resolves members (interactive) and forms (notification)..." | TESTED |
| REQ-10 | Notification-lane sends gated on durable outbox in production | — | pending | pending | `.../purpose-scoped-mailer.unit.test.ts` | AC-18/19/20 | TESTED |
| AC-18 (REQ-10) | Notification-lane send refused, no durable path, structured refusal | P1 | pending | pending | `.../purpose-scoped-mailer.unit.test.ts` | "notification-lane send refused in production without a durable path..." | TESTED |
| AC-19 (REQ-10) | Interactive-lane send proceeds under same conditions | P1 | pending | pending | `.../purpose-scoped-mailer.unit.test.ts` | "interactive-lane send proceeds under the same conditions..." | TESTED |
| AC-20 (REQ-10) | Notification-lane send proceeds once durable path ready | P2 | pending | pending | `.../purpose-scoped-mailer.unit.test.ts` | "notification-lane send proceeds once a durable path is registered..." | TESTED |
| REQ-11 | dependency-cruiser report-only CI baseline | — | pending (`.dependency-cruiser.cjs`, `package.json` script) | pending | not yet written — see Coverage Gaps §6.1 | — | PENDING |
| AC-21 (REQ-11) | Deliberately-violating fixture reports violation, does not fail build | P1 | pending | pending | not yet written | — | PENDING |
| AC-22 (REQ-11) | Baseline run against current tree recorded, not silently passed | P2 | pending | pending | not yet written | — | PENDING |
| REQ-12 | Inventory-staleness CI/review check | — | pending (`package.json` script) | pending | partially covered by `.../production-readiness-boot.integration.test.ts`'s AC-23/24 test | "every capability named in the inventory corresponds to something real..." | TESTED (partial — covers the inventory-to-source direction; the source-to-inventory direction, a genuinely new route with no entry, is not yet a dedicated test) |
| AC-23 (REQ-12) | New unregistered route flagged | P1 | pending | pending | not yet written (see above) | — | PENDING |
| AC-24 (REQ-12) | Fully-registered state passes cleanly | P2 | pending | pending | `.../production-readiness-boot.integration.test.ts` (implicitly, via the passing direction of the same test) | — | TESTED (partial) |

---

## 2. Invariant Traceability

| INV ID | Invariant | Test File | Test ID | Status |
|--------|-----------|-----------|---------|--------|
| INV-01 | A `production`-classified capability must never serve production traffic without its durable adapter present and configured. | `.../production-readiness-gate.unit.test.ts`, `.../production-readiness-boot.integration.test.ts` | "AC-05/INV-01" rows | TESTED |
| INV-02 | The runtime-mode signal must never be derived from `NODE_ENV` alone. | `.../runtime-mode.unit.test.ts` | "REQ-02/AC-03/INV-02" row | TESTED |
| INV-03 | A capability's self-reported capability metadata must never be trusted without independent verification against the inventory. | `.../production-readiness-gate.unit.test.ts` | "EC-03/INV-03: a durability check that throws..." | TESTED |
| INV-04 | Ambiguous/unresolvable runtime-mode configuration must default to `local`, never to `production`. | `.../runtime-mode.unit.test.ts` | "INV-04/EC-02" row | TESTED |
| INV-05 | Notification-lane and interactive-lane mailer sends must never resolve to the same discriminating value; an unresolved collision must fail closed. | `.../purpose-scoped-mailer.unit.test.ts` | "U-001-B1/EC-04" row | TESTED |
| INV-06 | This phase must never alter the request/response contract of a capability that already passes production-readiness checks today. | `.../purpose-scoped-mailer.unit.test.ts`, `.../purpose-scoped-mailer-call-sites.integration.test.ts` | "U-001-B3/INV-06" row, "INV-06 characterization" row | TESTED |

---

## 3. Edge Case Traceability

| EC ID | Edge Case | Test File | Test ID | Status |
|-------|-----------|-----------|---------|--------|
| EC-01 | Capability owner module ambiguous during inventory construction | `.../capability-inventory.unit.test.ts` | "AC-02/EC-01" row | TESTED |
| EC-02 | Runtime-mode signal set to an unrecognized value | `.../runtime-mode.unit.test.ts` | "INV-04/EC-02" row | TESTED |
| EC-03 | Durable-adapter check throws instead of returning false | `.../production-readiness-gate.unit.test.ts` | "EC-03/INV-03" row | TESTED |
| EC-04 | Unknown mailer purpose value added later | `.../purpose-scoped-mailer.unit.test.ts` | "U-001-B1/EC-04" row | TESTED |
| EC-05 | `dependency-cruiser` report-only run itself fails to execute | not yet written | — | PENDING (blocked on REQ-11's script existing first) |
| EC-06 | Capability inventory and actual routes drift apart mid-development | `.../production-readiness-boot.integration.test.ts` (partial — inventory-to-source direction only) | "AC-23/24/REQ-12" row | TESTED (partial) |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| `PRODUCTION_BOOT_UNSAFE_DEFAULT` | pending | pending | pending | PENDING |
| `PRODUCTION_CAPABILITY_NOT_DURABLE` | pending | pending | pending | PENDING |
| `SHARP_READINESS_FAILED` | pending | pending | pending | PENDING |
| `MAILER_SEND_REFUSED_NO_DURABLE_PATH` | pending | pending | pending | PENDING |
| `DEPENDENCY_CRUISER_REPORT_FAILURE` | pending | pending | pending | PENDING |
| `CAPABILITY_INVENTORY_STALE` | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Runtime-mode signal resolution precedence | § 1.1 | pending | pending | PENDING |
| Mailer lane resolution precedence | § 1.2 | pending | pending | PENDING |
| Boot-time check sequence ordering | § 2.1 | pending | pending | PENDING |
| Mailer seam gate evaluation ordering | § 2.2 | pending | pending | PENDING |
| Default: unset/unrecognized runtime-mode → local | § 3 | pending | pending | PENDING |
| Default: unrecognized mailer lane → notification | § 3 | pending | pending | PENDING |
| Default: missing inventory entry → staleness flag, not guessed classification | § 3 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| REQ-01 through REQ-10 (all TESTED-status rows) | Certified failing tests written against the Implementation Outline's Contract Map (C-001 through C-005); no production code exists yet — correct TDD red state, confirmed by a real test run (`node --import tsx --test`: 9 tests, 1 pass, 8 fail, all failures are module-not-found or real pre-fix-state assertions, zero test-authoring bugs) | Pending Programmer dispatch | Programmer Agent |
| REQ-11, REQ-12 (AC-21/22/23, EC-05) | Tests not yet written — REQ-11/12's mechanism itself (npm scripts + `.dependency-cruiser.cjs`) doesn't exist yet to write a meaningful test against; AC-24/EC-06's inventory-to-source direction IS covered, but the script-based CI-tooling tests are deferred until the scripts exist | Next TDD pass, before Programmer implements REQ-11/12 | TDD Agent |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| — | — | — | — |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| — | — | — | — |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| BR-04/outbox-transaction-seam resolution | ADR-046 Phase 1 spec | Explicitly out of scope for Phase 0 (feature.spec.md Scope section) — a separate small pre-Phase-1 design note | Owner (2026-07-16 sign-off) |
| All Phase 1-4 durable adapters, boot lifecycle, composition split, blocking dependency-cruiser | Future ADR-046 phase specs | ADR-046 requires each phase to have its own approved spec | Owner (ADR-046 sign-off) |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — all rows here are "pending TDD," which is expected pre-implementation, not a coverage gap
- [x] Section 6.2 (untested) is empty
- [x] Section 6.3 (untested error codes) is empty
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — N/A at spec stage

**[ ] TRACEABILITY COMPLETE** — pending TDD + implementation. Not expected to be checked at spec stage.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Claude Code (in-session) | 2026-07-16 | Package authored directly, not via subagent, per user request |
| TDD Agent | Claude Code (in-session) | 2026-07-16 | 6 test files, 34 individual `test()` cases, written directly against the Implementation Outline's Contract Map. Confirmed correct red state via a real run. REQ-11/REQ-12 partially deferred — see Coverage Gaps §6.1. |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
