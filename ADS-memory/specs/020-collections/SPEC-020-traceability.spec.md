# Traceability Matrix: collections

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-020 |
| feature_name | FEAT-020-collections |
| version | 1.4.0 |
| content_hash | sha256:5d6a931b381091ca04fddf55e9918227aed20fe895bb1f5a64cc50f33f44f4b6 |
| last_edited | 2026-07-15T03:30:00Z |
| traceability_status | PENDING IMPLEMENTATION |

**Purpose:** Traces every requirement, acceptance criterion, invariant, and edge case in
`SPEC-020-feature.spec.md` forward to implementation and test coverage. No implementation exists
yet — this spec has not been dispatched to Software Architect or TDD. Every row below is
intentionally `PENDING`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | `content_types` registry row shape | — | pending | pending | pending | pending | PENDING |
| AC-01 (REQ-01) | Well-formed submission creates the row correctly | P1 | pending | pending | pending | pending | PENDING |
| REQ-02 | Reserved-key rejection | — | pending | pending | pending | pending | PENDING |
| AC-02 (REQ-02) | key='post' rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-03 (REQ-02) | key='page' rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-03 | key/field-name grammar | — | pending | pending | pending | pending | PENDING |
| AC-04 (REQ-03) | Invalid key grammar rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-05 (REQ-03) | Invalid field-name grammar rejected before DDL | P1 | pending | pending | pending | pending | PENDING |
| REQ-04 | Closed field-kind enum, core-owned cast mapping | — | pending | pending | pending | pending | PENDING |
| AC-06 (REQ-04) | Invalid kind rejected, never interpolated | P1 | pending | pending | pending | pending | PENDING |
| AC-07 (REQ-04) | Valid kind's CAST literal comes only from fixed lookup | P1 | pending | pending | pending | pending | PENDING |
| REQ-05 | Per-type queryable-field cap | — | pending | pending | pending | pending | PENDING |
| AC-08 (REQ-05) | 21st queryable field rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-09 (REQ-05) | Exactly 20 queryable fields accepted | P2 | pending | pending | pending | pending | PENDING |
| REQ-06 | Workspace-scoped index identity | — | pending | pending | pending | pending | PENDING |
| AC-10 (REQ-06) | Two workspaces, same key/field, no index-name collision | P1 | pending | pending | pending | pending | PENDING |
| REQ-07 | Content-type chokepoint watermark stamp | — | pending | pending | pending | pending | PENDING |
| AC-11 (REQ-07) | Watermark advances by 1 on content-type commit | P1 | pending | pending | pending | pending | PENDING |
| REQ-08 | Content-type chokepoint revision append | — | pending | pending | pending | pending | PENDING |
| AC-12 (REQ-08) | content_type_revisions row created same transaction | P1 | pending | pending | pending | pending | PENDING |
| REQ-09 | Content-type lifecycle state machine | — | pending | pending | pending | pending | PENDING |
| AC-13 (REQ-09) | active<->deprecated reversible | P1 | pending | pending | pending | pending | PENDING |
| AC-14 (REQ-09) | tombstone is terminal | P1 | pending | pending | pending | pending | PENDING |
| REQ-10 | Deprecated type refuses new entries, reads still work | — | pending | pending | pending | pending | PENDING |
| AC-15 (REQ-10) | Entry create against deprecated type rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-16 (REQ-10) | Existing entries of deprecated type still listable | P1 | pending | pending | pending | pending | PENDING |
| REQ-11 | Tombstone tears down indexes, excludes public serving | — | pending | pending | pending | pending | PENDING |
| AC-17 (REQ-11) | Indexes torn down on tombstone | P1 | pending | pending | pending | pending | PENDING |
| AC-18 (REQ-11) | Tombstoned type's entries excluded from public serving | P1 | pending | pending | pending | pending | PENDING |
| REQ-12 | Lifecycle transitions enqueue outbox events | — | pending | pending | pending | pending | PENDING |
| AC-19 (REQ-12) | content_type.deprecated outbox event same transaction | P1 | pending | pending | pending | pending | PENDING |
| AC-20 (REQ-12) | content_type.tombstoned outbox event same transaction | P1 | pending | pending | pending | pending | PENDING |
| REQ-13 | entries table shape + uniqueness | — | pending | pending | pending | pending | PENDING |
| AC-21 (REQ-13) | Duplicate (workspaceId,type,slug) rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-14 | Entry field-bag strict-on-write validation | — | pending | pending | pending | pending | PENDING |
| AC-22 (REQ-14) | Unrecognized field key rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-23 (REQ-14) | Missing required field rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-15 | Orphaned field tolerant-on-read | — | pending | pending | pending | pending | PENDING |
| AC-24 (REQ-15) | Orphaned key silently omitted on read | P1 | pending | pending | pending | pending | PENDING |
| REQ-16 | Entry chokepoint revision append | — | pending | pending | pending | pending | PENDING |
| AC-25 (REQ-16) | entry_revisions row created same transaction | P1 | pending | pending | pending | pending | PENDING |
| REQ-17 | Entry chokepoint watermark stamp | — | pending | pending | pending | pending | PENDING |
| AC-26 (REQ-17) | Watermark advances by 1 on entry commit | P1 | pending | pending | pending | pending | PENDING |
| REQ-18 | Entry transitions enqueue outbox events | — | pending | pending | pending | pending | PENDING |
| AC-27 (REQ-18) | entry.created outbox event same transaction | P1 | pending | pending | pending | pending | PENDING |
| AC-28 (REQ-18) | entry.published outbox event same transaction | P1 | pending | pending | pending | pending | PENDING |
| REQ-19 | entries.type soft-reference validation | — | pending | pending | pending | pending | PENDING |
| AC-29 (REQ-19) | Nonexistent type rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-30 (REQ-19) | Cross-workspace type rejected | P1 | pending | pending | pending | pending | PENDING |
| REQ-20 | Cleanup gateway eligibility | — | pending | pending | pending | pending | PENDING |
| AC-31 (REQ-20) | plan() refused when not tombstoned | P1 | pending | pending | pending | pending | PENDING |
| AC-32 (REQ-20) | plan() refused before retention window elapses | P1 | pending | pending | pending | pending | PENDING |
| AC-33 (REQ-20) | plan() succeeds once all conditions hold | P1 | pending | pending | pending | pending | PENDING |
| REQ-21 | Cleanup execute() atomic removal | — | pending | pending | pending | pending | PENDING |
| AC-34 (REQ-21) | execute() removes content type + all scoped rows atomically | P1 | pending | pending | pending | pending | PENDING |
| REQ-22 | Agent-tool catalog naming, no confirm tool | — | pending | pending | pending | pending | PENDING |
| AC-35 (REQ-22) | plan/execute cleanup tools present, no confirm tool | P1 | pending | pending | pending | pending | PENDING |
| REQ-23 | Permission gating on every route/tool | — | pending | pending | pending | pending | PENDING |
| AC-36 (REQ-23) | read-only principal denied mutation | P1 | pending | pending | pending | pending | PENDING |
| AC-37 (REQ-23) | read-only principal allowed read | P1 | pending | pending | pending | pending | PENDING |
| REQ-24 | Fixed definition-time guard ordering | — | pending | pending | pending | pending | PENDING |
| AC-38 (REQ-24) | Reserved-key + bad field name -> reserved-key reported first | P1 | pending | pending | pending | pending | PENDING |
| REQ-25 | Read-only field-bag validate-only capability | — | pending | pending | pending | pending | PENDING |
| AC-39 (REQ-25) | Invalid bag returns VALIDATION_ERROR, no row written | P2 | pending | pending | pending | pending | PENDING |
| AC-40 (REQ-25) | Valid bag returns success, no row written | P2 | pending | pending | pending | pending | PENDING |
| REQ-26 | `fields` array is full-replace, not merge-by-name; present array must be non-empty | — | pending | pending | pending | pending | PENDING |
| AC-41 (REQ-26) | Omitted existing field is removed from schema | P1 | pending | pending | pending | pending | PENDING |
| AC-42 (REQ-26) | Queryable cap checked against submitted array alone | P1 | pending | pending | pending | pending | PENDING |
| REQ-27 | Kind change on a still-queryable field forces reindex | — | pending | pending | pending | pending | PENDING |
| AC-43 (REQ-27) | Kind change while queryable tears down + re-provisions index | P1 | pending | pending | pending | pending | PENDING |
| REQ-28 | update/publish/unpublish vs. non-active content type | — | pending | pending | pending | pending | PENDING |
| AC-44 (REQ-28) | UPDATE_ENTRY rejected for tombstoned owning type | P1 | pending | pending | pending | pending | PENDING |
| AC-45 (REQ-28) | PUBLISH/UNPUBLISH rejected for tombstoned owning type, no outbox event | P1 | pending | pending | pending | pending | PENDING |
| AC-46 (REQ-28) | update/publish/unpublish succeed for deprecated owning type | P1 | pending | pending | pending | pending | PENDING |
| AC-47 (REQ-08) | content_type_revisions carries delegatedBy* for agent-delegated write | P1 | pending | pending | pending | pending | PENDING |
| AC-48 (REQ-16) | entry_revisions carries delegatedBy* for api_key-delegated write | P1 | pending | pending | pending | pending | PENDING |
| AC-49 (REQ-14) | Field value kind-conformance violation rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-50 (REQ-14) | Malformed (unwrapped) fieldsJson envelope rejected | P1 | pending | pending | pending | pending | PENDING |
| AC-51 (REQ-26) | Empty `fields: []` submission rejected, schema unchanged | P1 | pending | pending | pending | pending | PENDING |
| REQ-29 | Ordinary `queryable` flag flip (kind unchanged) forces index provision/teardown | — | pending | pending | pending | pending | PENDING |
| AC-52 (REQ-29) | queryable false->true resubmission provisions new index | P1 | pending | pending | pending | pending | PENDING |
| AC-53 (REQ-29) | queryable true->false resubmission tears down index | P1 | pending | pending | pending | pending | PENDING |
| REQ-30 | Newly-added queryable field and combined kind+queryable change on update are governed (REQ-27/REQ-29 residual gap closure) | — | pending | pending | pending | pending | PENDING |
| AC-54 (REQ-30) | Brand-new field added with queryable=true provisions index, registration-parity | P1 | pending | pending | pending | pending | PENDING |
| AC-55 (REQ-30) | Combined kind+queryable change in one call resolves index from post-call state | P1 | pending | pending | pending | pending | PENDING |
| AC-56 (REQ-26) | Stale expectedVersion + empty fields:[] rejected as version-conflict, not fields_empty | P1 | pending | pending | pending | pending | PENDING |

<!-- All REQ-* and AC-* rows above are copied from SPEC-020-feature.spec.md. -->

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | entries.type must always reference an existing content_types.key in the same workspace at write time | pending | pending | PENDING |
| INV-02 | content_types.key must never equal 'post' or 'page' | pending | pending | PENDING |
| INV-03 | content_types.key and every field name must always match the grammar | pending | pending | PENDING |
| INV-04 | A field's kind must always be one of the closed enum; never interpolated raw | pending | pending | PENDING |
| INV-05 | (workspaceId, type, slug) uniqueness on entries must never be violated | pending | pending | PENDING |
| INV-06 | content_types.status must never transition from tombstone back to active/deprecated | pending | pending | PENDING |
| INV-07 | Cleanup execute() must never run against a non-tombstone content type | pending | pending | PENDING |
| INV-08 | Every write-chokepoint commit stamps the watermark exactly once, same transaction | pending | pending | PENDING |
| INV-09 | A queryable field's live index must never reference a stale kind's CAST mapping | pending | pending | PENDING |
| INV-10 | A field's live queryable index must exist iff that field currently exists with queryable=true | pending | pending | PENDING |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Register content type with key='post' | pending | pending | PENDING |
| EC-02 | Field name with quote/path metacharacter | pending | pending | PENDING |
| EC-03 | Field kind not in closed enum, attempted SQL fragment | pending | pending | PENDING |
| EC-04 | Two workspaces, same key/field, different kind | pending | pending | PENDING |
| EC-05 | Entry create against deprecated type | pending | pending | PENDING |
| EC-06 | Entry create against tombstoned type | pending | pending | PENDING |
| EC-07 | Entry field-bag key not in current schema | pending | pending | PENDING |
| EC-08 | Read of entry with orphaned (removed) field key | pending | pending | PENDING |
| EC-09 | Cleanup plan() for a deprecated (not tombstoned) type | pending | pending | PENDING |
| EC-10 | Second execute() attempt after prior successful cleanup | pending | pending | PENDING |
| EC-11 | UPDATE_CONTENT_TYPE_FIELDS omits an existing field from fields array | pending | pending | PENDING |
| EC-12 | UPDATE_CONTENT_TYPE_FIELDS changes kind while field stays queryable | pending | pending | PENDING |
| EC-13 | update/publish/unpublish targets an entry of a tombstoned type | pending | pending | PENDING |
| EC-14 | update/publish/unpublish targets an entry of a deprecated type | pending | pending | PENDING |
| EC-15 | Entry write's fieldsJson omits the ext.site wrapper | pending | pending | PENDING |
| EC-16 | UPDATE_CONTENT_TYPE_FIELDS submits fields: [] (present but empty) | pending | pending | PENDING |
| EC-17 | UPDATE_CONTENT_TYPE_FIELDS resubmits a field with only queryable changed | pending | pending | PENDING |
| EC-18 | UPDATE_CONTENT_TYPE_FIELDS introduces a brand-new field with queryable=true | pending | pending | PENDING |
| EC-19 | UPDATE_CONTENT_TYPE_FIELDS changes a single field's kind and queryable together | pending | pending | PENDING |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| RESERVED_CONTENT_TYPE_KEY | pending | pending | pending | PENDING |
| INVALID_KEY_GRAMMAR | pending | pending | pending | PENDING |
| INVALID_FIELD_NAME_GRAMMAR | pending | pending | pending | PENDING |
| INVALID_FIELD_KIND | pending | pending | pending | PENDING |
| QUERYABLE_FIELD_CAP_EXCEEDED | pending | pending | pending | PENDING |
| CONTENT_TYPE_KEY_CONFLICT | pending | pending | pending | PENDING |
| CONTENT_TYPE_NOT_FOUND | pending | pending | pending | PENDING |
| CONTENT_TYPE_NOT_ACTIVE | pending | pending | pending | PENDING |
| ENTRY_NOT_FOUND | pending | pending | pending | PENDING |
| ENTRY_SLUG_CONFLICT | pending | pending | pending | PENDING |
| CLEANUP_NOT_ELIGIBLE | pending | pending | pending | PENDING |
| PLAN_STALE | pending | pending | pending | PENDING |
| TOKEN_EXPIRED | pending | pending | pending | PENDING |
| TOKEN_ALREADY_REDEEMED | pending | pending | pending | PENDING |
| FORBIDDEN | pending | pending | pending | PENDING |
| UNAUTHENTICATED | pending | pending | pending | PENDING |
| VALIDATION_ERROR | pending | pending | pending | PENDING |
| RATE_LIMIT_EXCEEDED | pending | pending | pending | PENDING |
| INTERNAL_ERROR | pending | pending | pending | PENDING |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Field-bag validation precedence: current schema vs. entry's own history | § 1.1 | pending | pending | PENDING |
| Definition-time validation check ordering | § 2.1 | pending | pending | PENDING |
| Content-type lifecycle transition ordering | § 2.2 | pending | pending | PENDING |
| Cleanup eligibility check ordering | § 2.3 | pending | pending | PENDING |
| Default: field.required = false | § 3 | pending | pending | PENDING |
| Default: field.queryable = false | § 3 | pending | pending | PENDING |
| Default: contentType.status = 'active' | § 3 | pending | pending | PENDING |
| Default: entry.status = 'draft' | § 3 | pending | pending | PENDING |
| Default: queryable-field cap = 20 | § 3 | pending | pending | PENDING |
| Default: cleanup retention window = 30 days | § 3 | pending | pending | PENDING |
| Limit: key/field-name grammar max 64 chars | § 4 | pending | pending | PENDING |
| Limit: queryable fields per type = 20 | § 4 | pending | pending | PENDING |
| Limit: cleanup retention window = 30 days minimum | § 4 | pending | pending | PENDING |
| Dedup: content_types (workspaceId, key) uniqueness | § 5.1 | pending | pending | PENDING |
| Dedup: entries (workspaceId, type, slug) uniqueness | § 5.1 | pending | pending | PENDING |
| Edge case: key exactly 64 chars accepted, 65 rejected | § 7 | pending | pending | PENDING |
| Edge case: exactly 20 vs 21 queryable fields | § 7 | pending | pending | PENDING |
| Edge case: retention window exactly 30 days | § 7 | pending | pending | PENDING |
| Edge case: concurrent duplicate slug creation | § 7 | pending | pending | PENDING |
| Edge case: field kind-conformance violation | § 7 | pending | pending | PENDING |
| Edge case: fieldsJson missing ext.site wrapper | § 7 | pending | pending | PENDING |
| Edge case: fields array omission removes field (full-replace) | § 7 | pending | pending | PENDING |
| Edge case: kind change while field stays queryable forces reindex | § 7 | pending | pending | PENDING |
| Edge case: update/publish/unpublish vs tombstoned owning type | § 7 | pending | pending | PENDING |
| Edge case: update/publish/unpublish vs deprecated owning type | § 7 | pending | pending | PENDING |
| Edge case: fields: [] (present but empty) rejected on update | § 7 | pending | pending | PENDING |
| Edge case: ordinary queryable flag flip (kind unchanged) forces index provision/teardown | § 7 | pending | pending | PENDING |
| Edge case: newly-added field with queryable=true on update provisions index at registration parity | § 7 | pending | pending | PENDING |
| Edge case: combined kind+queryable change in one call resolves index from post-call state | § 7 | pending | pending | PENDING |
| Edge case: stale expectedVersion + empty fields:[] rejected as version-conflict, not fields_empty | § 7 | pending | pending | PENDING |
| Limit: minimum fields per content type (fields.minItems = 1) | § 4 | pending | pending | PENDING |
| Ordering: entry-write tombstone-check precedence for update/publish/unpublish | § 2.4 | pending | pending | PENDING |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| All REQ/AC rows above | This is a spec-stage artifact; Software Architect and TDD have not yet been dispatched for SPEC-020 | Upon SPEC-020 implementation | Coordinator |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| All REQ/AC rows above | No implementation exists yet to test | Upon SPEC-020 TDD dispatch | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| All error codes above | No implementation exists yet to test | Upon SPEC-020 TDD dispatch | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| — | — | No requirement in this spec is deferred — every REQ/AC here is in-scope for Collections itself | — |

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
- [x] Section 6.1 (unimplemented) is empty or all entries are DEFERRED with approval — all entries
      here are explicitly "pending implementation," not deferred/skipped
- [x] Section 6.2 (untested) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 6.3 (untested error codes) is empty or all entries are DEFERRED with approval — same basis
- [x] Section 7 (untraced) is empty
- [ ] All VERIFIED rows have been reviewed and signed off by the Code Review Agent — not applicable
      yet; no row has reached VERIFIED status

**[ ] TRACEABILITY COMPLETE** — not yet; this is a spec-stage package, pending implementation.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-14 | Seeded matrix from feature.spec.md v1.0.0; all rows PENDING |
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-14 | v1.1.0 revision: added rows for REQ-26/27/28, AC-41–AC-50, INV-09, EC-11–EC-15, and the §2.4 ordering rule, per Red-Team findings RT-001 through RT-005; all new rows PENDING |
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-15 | v1.2.0 revision: added rows for REQ-29, AC-51/AC-52/AC-53, INV-10, EC-16/EC-17, the new minItems=1 limit row, and two new § 7 edge-case behavior rows, per Red-Team round-2 findings RT-012 (BLOCKING) and RT-013 (ADVISORY); all new rows PENDING |
| Spec Agent | Spec Agent (Claude Sonnet 5) | 2026-07-15 | v1.3.0 revision: added rows for REQ-30, AC-54/AC-55/AC-56, EC-18/EC-19, and three new § 7 edge-case behavior rows, per Red-Team round-3 finding RT-015 (BLOCKING) and RT-016 (ADVISORY); no new INV was added (REQ-30 cites existing INV-09/INV-10). All new rows PENDING |
| TDD Agent | | | |
| Programmer Agent | | | |
| Code Review Agent | | | |
| Coordinator | | | |
