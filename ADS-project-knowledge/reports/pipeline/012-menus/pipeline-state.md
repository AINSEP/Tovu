# Pipeline State: FEAT-012 Menus

| Field | Value |
|---|---|
| feat_id | FEAT-012-menus |
| spec_id | SPEC-012 |
| stage | implementation DONE 2026-07-13 (T003-T012, T014-T044, T046, T048 complete; T002 `/audit-work` gate and its gated task T013 deliberately left open — `permission-migrations.ts` fully built+tested, ready for Members/Analytics/Integrations to import via `src/identity/index.ts`, but NOT wired into live seed boot pending a real audit; T045 manual `/verify` and T047/T049 polish also left open) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-project-knowledge/specs/012-menus |
| spec_path | ADS-project-knowledge/specs/012-menus |
| spec_entrypoint_path | ADS-project-knowledge/specs/012-menus/feature.spec.md |
| spec_readiness_artifact | ADS-project-knowledge/specs/012-menus/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield |
| spec_hash | sha256:f1d9a8aa4c8434a7b7dbafd78f696c04f75edcc06bde4250f8aae91a55b4bf9d |
| spec_hash_verified_at | 2026-07-13 (provider-local validator, `--phase spec --update-hash`, exit 0; stable across a second `--update-hash` re-run after cosmetic fixes) |
| planning_preflight_status | NOT STARTED — `--phase preflight` run by the Spec Agent for a sanity check only, correctly reports the one expected VIOLATION (`spec-dod.md` Coordinator sign-off row is blank), since Spec Agent stops at its own sign-off and reserves the Coordinator row per instruction |
| planning_preflight_checked_at | |
| validator_result | PASS (`--phase spec`, exit 0, 2 iterations: first run caught 4 real issues — two literal `<action>` substrings inside the `admin.<section>.<action>` convention name being misread as unfilled template placeholders, the `status` field carrying extra prose after `APPROVED`, and a thin NA justification on spec-dod.md F-05 — all four fixed and the validator re-run clean) |
| red_team_status | NOT STARTED |
| red_team_spec_hash | |
| governing_adr | ADR-029 (Menus/Navigation — entry-native menu trees, entry_refs link integrity, derived location-binding index), ACCEPTED 2026-07-10 (autonomous sweep + 3-round audit, TM-admin-sweep-001) |
| pipeline_adr | ADR-PIPE-012 (Menus Remediation — Permission Catalog Rename/Split, SQLite Persistence, Outbox Events, Binding-Index Reconciliation), PROPOSED 2026-07-13 — `ADS-project-knowledge/reports/pipeline/012-menus/adr.md` |
| governance_adr_promotion | Not yet evaluated — `registerPermissionMigration()`/`migrateDeprecatedPermissionGrants()` (`src/identity/permission-migrations.ts`, new in ADR-PIPE-012) is explicitly designed for reuse by the sibling Members/Analytics/Integrations remediation ADRs; worth a governance-ADR promotion pass once at least one sibling ADR actually adopts it, per `AI-Dev-Shop/skills/adr-governance/SKILL.md` |
| research_artifact | N/A — no new library/technology/persistence choice is open for the remediation either (Drizzle/SQLite and the existing outbox are reused unchanged); see ADR-PIPE-012 Research Summary |
| implementation_outline_path | `ADS-project-knowledge/reports/pipeline/012-menus/implementation-outline.md` — PRODUCED (triggers: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity) |
| tasks_path | Not generated — out of scope for this dispatch (Software Architect stops at ADR + outline per dispatch instruction); also blocked on ADR-PIPE-012's own Article II exception (spec-amendment-vs-waiver) being resolved first |
| implementation_progress | The as-built feature (`src/navigation/`, `src/server/routes/admin/menus/`, `apps/admin/src/sections/{Menus,MenuEditor}.tsx`) is already shipped, per SPEC-012. The 5 remediation items ADR-PIPE-012 scopes (permission split/rename, SQLite adapters, outbox events, binding-index reconciliation) are **not yet implemented** — this pass produced architecture only, no code changes |

## Notes

- **Scope of this dispatch:** Spec Agent, lightweight as-built backfill only (not the full
  5-pass reverse-spec extraction pipeline — explicitly waived by the dispatch instruction since
  Menus is a familiar, recently-shipped system with passing tests, not unfamiliar legacy code).
  Wrote the full Speckit-compatible spec package (`feature.spec.md`, `api.spec.md`,
  `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`,
  `spec-manifest.md`, `spec-dod.md`) at `ADS-project-knowledge/specs/012-menus/`.
  `orchestrator.spec.md` is OMITTED (see `spec-manifest.md`) — no async orchestration layer
  distinct from the direct route→service function calls, mirroring SPEC-009 (Redirects)'s
  identical reasoning for the same omission.
- **Read `AI-Dev-Shop/agents/spec/skills.md` in full before any other work**, per the AGENTS.md
  "Delegated Agent Bootstrap" requirement — confirmed at the start of this dispatch.
- **Read order followed exactly as directed:** provider-contract.md → speckit/provider.md →
  speckit/compatibility.md → constitution.md → ADR-029 (in full) → `src/navigation/` (every
  file) → `src/server/routes/admin/menus/*.ts` (every file) →
  `apps/admin/src/sections/{Menus,MenuEditor}.tsx` → the existing test files
  (`src/navigation/__tests__/{menu-service,resolver}.test.ts`,
  `src/server/__tests__/admin-menus-routes.test.ts`) → `src/identity/permissions.ts`.
- **Eleven code-vs-ADR-029 deviations found and disclosed, not silently resolved** — full
  Deviation Log (D-1 through D-11) lives in `spec-manifest.md`. Highlights:
  1. **D-1/D-9 (permission):** ADR-029 §8 defines a 7-entry split permission catalog
     (`navigation.read/create/update/delete/delete.force/assign/manage`); the shipped code
     registers and uses **only** `navigation.manage`, gating all six routes uniformly, including
     force-purge (no separate `.delete.force` permission is wired).
  2. **D-2 (namespace convention):** the actual registered string is `navigation.manage`, **not**
     `admin.menus.manage` — it predates and does not follow the `admin.<section>.<action>`
     convention frozen the same day in
     `reports/architecture/sweep-crosscutting-decisions-20260710.md` §E. Per the dispatch
     instruction, this spec does **not** change the documented permission to
     `admin.menus.manage` — it records the mismatch as Deviation D-2 / Open Question OQ-02
     instead. (Independently corroborated: `reports/pipeline/009-redirects/pipeline-state.md`,
     written by a prior, unrelated Spec Agent dispatch for a different feature, already flags
     this exact same Menus/Members naming gap as a "retroactive-migration item… not a blocker.")
  3. **D-3 (no command gateway):** every mutation is a direct function call from the route
     handler into `menu-service.ts` — not routed through the ADR-008 command gateway ADR-029 §6
     describes, because the gateway's revert registry does not yet cover menus (documented in
     `update-tree.ts`'s own doc comment as a policy question for the Coordinator).
  4. **D-4 (termRef):** ADR-029 §3's `termRef` "integrity-tracked" claim is not implemented —
     already a named Wave-1 blocker per ADR-029's own Round-3 audit fold, not a fresh finding.
  5. **D-5 (storage):** menus are **not** ADR-022 entries — they live in a self-contained,
     in-memory-only `InMemoryMenuRepo`; no SQLite adapter exists for either repo port.
  6. **D-10 (dead status value):** `MenuStatus` declares `"published"` but no code path in the
     shipped feature ever sets it — grep-confirmed absence across `menu-service.ts` and every
     route file.
  - D-6 through D-8, D-11 (no real cross-write transaction, id-stability not diffed, binding
    index never rebuilt, no outbox events published) are further, smaller documented gaps —
    see `spec-manifest.md` for the complete table.
- **Actual registered permission string, exactly as it appears in code:**
  `navigation.manage` (`src/identity/permissions.ts:149-153`, `owner: "navigation"`).
- **Validator not yet run in this message.** `content_hash` fields in every `.spec.md` file are
  placeholder (`sha256:PENDING`) until
  `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-project-knowledge/specs/012-menus --phase spec --update-hash`
  completes and rewrites them.
- **Coverage gaps disclosed, not hidden:** `traceability.spec.md` Sections 6.2/6.3 name six
  real-but-untested edge cases and one untested error code (`INTERNAL_ERROR`), each with an
  owner and an 2026-08-15 target date, plus two behavior-rule boundary cases (exact
  `maxItemCount`) that no existing test exercises.
- **Next steps:** run the provider-local validator to compute the real content hash; bring this
  package to Coordinator Planning Preflight; the human should separately decide OQ-01 (split
  permission catalog?), OQ-02 (rename to `admin.menus.manage`?), and OQ-03 (is `"published"`
  a missed requirement or an intentional future reservation?) — none of the three block this
  spec's own readiness gate, since they are forward decisions about the *code*, not defects in
  this *spec's* fidelity to the code as it stands today.

## Software Architect Remediation Pass (2026-07-13)

- **Read `AI-Dev-Shop/agents/software-architect/skills.md` in full before any other work** —
  confirmed at the start of this dispatch.
- **Scope:** remediation ADR + implementation outline only (per dispatch instruction) — no
  code changes, no tasks.md, no debate/audit run yet. Read order followed: provider-contract →
  speckit/provider.md → speckit/compatibility.md → this file → every file in
  `ADS-project-knowledge/specs/012-menus/` (`spec-manifest.md` first) → `constitution.md` →
  `ADR-029-menus-navigation.md` → `sweep-crosscutting-decisions-20260710.md` → `adr-template.md`
  → SPEC-007's `adr.md`/`implementation-outline.md` (shape reference) → `src/navigation/` in
  full → `src/server/routes/admin/menus/*.ts` (all 6) → `src/server/http/admin/menus.ts` →
  `apps/admin/src/sections/{Menus,MenuEditor}.tsx` → `src/identity/{permissions.ts,authorize.ts,
  types.ts,seed.ts}` → `src/features/post/repo.sqlite.ts` (SQLite-adapter precedent) →
  `src/infra/db/schema.ts` → `src/server/{app.ts,deps.ts,routes/types.ts}` →
  `src/core/events/outbox-worker.ts` / `src/core/ports.ts` (outbox precedent).
- **Triage decision (of the 11 disclosed deviations, 5 closed in this pass):**
  1. **D-1/D-2/D-9 (permission split + namespace rename) — highest priority, done as ONE
     reusable mechanism.** New `src/identity/permission-migrations.ts`
     (`registerPermissionMigration`/`migrateDeprecatedPermissionGrants`), generalized from the
     already-shipped `settings.write` → `settings.definitions.manage` precedent (ADR-028 §7),
     so the sibling Members/Analytics/Integrations remediation ADRs reuse it instead of each
     inventing a divergent rename. Menus' own split+rename: `navigation.manage` →
     `admin.menus.{read,create,update,delete,delete.force,assign,manage}` (7-entry catalog
     `contracts.ts` already declared but never registered).
  2. **D-5 (SQLite adapters) + D-8 (binding-index rebuild caller) — real production gaps, done
     together.** New `src/navigation/repo.sqlite.ts` (mirrors `SqlitePostRepo`) + new
     `src/navigation/reconcile.ts` (first caller of the already-implemented
     `rebuildForWorkspace`), wired into `src/server/deps.ts`'s SQLite composition root.
  3. **D-11 (outbox events) — cheap, done via direct `outbox.enqueue()` calls inside
     `menu-service.ts`'s 4 mutating functions**, bypassing the still-blocked D-3 (command
     gateway routing) rather than waiting on it.
  4. **D-4 (termRef) explicitly NOT re-solved here** — already a named Wave-1 blocker in
     ADR-029's own Round-3 audit fold, gated on a content-lib `term_refs` schema decision this
     ADR has no standing to make.
  5. **D-3, D-6, D-7, D-10 deferred** with named reasons (see `adr.md`'s Module/Service
     Boundaries "Out of this remediation's scope" list) — D-3/D-6 blocked upstream on gateway
     transaction machinery; D-7 low-urgency (caller-discipline gap, no data loss); D-10 is a
     product question (OQ-03) for the feature owner, not an architecture call.
- **Constitution Check result:** 6 COMPLIES, 2 EXCEPTION (Article II — this ADR proposes new
  implementation without a matching SPEC-012 revision, since the dispatch went straight to
  Software Architect; Article VIII — `authorize()` decision-reason logging, needed before the
  legacy permission string can be deleted, is named as a follow-up not fixed in this pass).
  **The Article II exception is a real, unresolved process gap** — this ADR names two remediation
  paths (SPEC-012 v1.1 amendment, or an explicit Coordinator waiver) and does not silently treat
  itself as spec-approved. Full Complexity Justification table in `adr.md`.
- **Artifacts produced:** `adr.md` (ADR-PIPE-012, PROPOSED), `implementation-outline.md`
  (PRODUCED — 6 File Map entries changed + 4 created across `identity`/`navigation`/`infra/db`/
  `server`, 6 route-file edits, 14 Contract Map rows, 4 Critical Invariants incl. 2 new).
- **Not done in this pass (by instruction, "Stop after ADR + outline"):** no `/audit-work`, no
  Red-Team, no tasks.md, no code changes, no SPEC-012 amendment. Recommended next command:
  `/audit-work` against this ADR (the permission-migration mechanism is security-relevant and
  shared across up to four features — worth an external pass before ACCEPTED), in parallel with
  the Coordinator resolving the Article II exception before any TDD/Programmer dispatch.
