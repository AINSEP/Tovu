# Pipeline State: FEAT-009 Redirects

| Field | Value |
|---|---|
| feat_id | FEAT-009-redirects |
| spec_id | SPEC-009 |
| stage | architect (ADR-PIPE-009 + implementation-outline.md PRODUCED — awaiting human approval before `/tasks`) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-project-knowledge/specs/009-redirects |
| spec_path | ADS-project-knowledge/specs/009-redirects |
| spec_entrypoint_path | ADS-project-knowledge/specs/009-redirects/feature.spec.md |
| spec_readiness_artifact | ADS-project-knowledge/specs/009-redirects/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, behavior.spec.md, errors.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield |
| spec_hash | sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef |
| spec_hash_verified_at | 2026-07-12 (provider-local validator, `--phase spec --update-hash`, exit 0) |
| planning_preflight_status | PASS |
| planning_preflight_checked_at | 2026-07-13T00:00:00Z |
| validator_result | PASS (`--phase spec`, exit 0). Coordinator re-ran `--phase preflight` after filling the Coordinator Sign-Off row in `spec-dod.md` — **PASS (exit 0)**. |
| red_team_status | NOT STARTED |
| red_team_spec_hash | |
| governing_adr | ADR-033 (Redirects — Tier-2 rules over routing, core-owned tables, bounded matching seam, in-tx auto-redirect on slug change), ACCEPTED 2026-07-10; gated on and consumes ADR-039 (routing contract v0, ACCEPTED) and ADR-040 (core/origin registry v0, ACCEPTED) |
| pipeline_adr | `ADS-project-knowledge/reports/pipeline/009-redirects/adr.md` — ADR-PIPE-009 (Redirects — Implementation Architecture), status PROPOSED, produced by this Software Architect dispatch (2026-07-13). Translates ADR-033/039/040 into concrete module/file/contract/wiring boundaries; does not re-litigate any of their decisions. |
| implementation_outline | `ADS-project-knowledge/reports/pipeline/009-redirects/implementation-outline.md` — PRODUCED (Trigger Decision Matrix: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity all apply) |
| governance_adr_promotion | Not evaluated this run — this dispatch's scope stops at ADR + implementation outline per Coordinator instruction; evaluate at the next Software Architect / `/tasks` touchpoint whether the two `src/routing/routing.ts` additive exports or the ambient-transaction-sharing pattern (ADR-PIPE-009 Decision A) should be promoted to a governance ADR (both are reusable cross-feature patterns, not just this feature's local concern) |
| research_artifact | N/A — no new library/technology/persistence choice open; reuses ADR-006/007/015/021/022 patterns and the already-implemented `src/routing`/`src/origin` libraries (confirmed explicitly in ADR-PIPE-009's Research Summary) |
| tasks_path | Not yet generated — out of scope for this dispatch; recommended next command is `/tasks` |
| implementation_progress | Not started — `src/redirects/ports.ts`/`types.ts` remain interface/type stubs only; ADR-PIPE-009 + implementation-outline.md now give TDD/Programmer an unambiguous module/contract/wiring map to build against |

## Notes

- **Scope of this run:** Spec Agent dispatch only. Wrote the full Speckit-compatible spec
  package (`feature.spec.md`, `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`,
  `behavior.spec.md`, `traceability.spec.md`, `spec-manifest.md`, `spec-dod.md`) at
  `ADS-project-knowledge/specs/009-redirects/`. `orchestrator.spec.md` is OMITTED (see
  `spec-manifest.md`) — no async orchestration layer distinct from the synchronous write
  chokepoint and routing-chain phase handler, mirroring SPEC-007 (settings)'s identical
  reasoning.
- **Validator not yet run.** This pipeline-state.md was written by the Spec Agent alongside
  the package; the provider-local validator
  (`python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-project-knowledge/specs/009-redirects --phase spec --update-hash`)
  must be run before this spec is considered handoff-ready per the Speckit compatibility
  gate. `content_hash` fields in every `.spec.md` file are placeholder
  (`sha256:PENDING`) until that run completes and rewrites them.
- **Two real deviations found and flagged, not silently resolved** (see
  `spec-manifest.md`'s Brownfield References and `feature.spec.md`'s Agent Directives):
  1. `src/redirects/types.ts`'s `SlugChangeCapture` type (pre-ADR-039, a flat payload with
     no method, fields `fromPath`/`toPath`/`actorId`/`pluginId`) collides by name with
     `src/routing/types.ts`'s `SlugChangeCapture` (ADR-039, already implemented — a
     method-bearing `onSlugChange(input: SlugChangeCaptureInput)` interface with fields
     `oldPath`/`newPath`/`actor`/`changeSetId`). This spec adopts the routing-owned shape as
     authoritative (ADR-039 is later and is the ADR that specifically answers ADR-033's own
     Q-1/Q-2) and directs the Software Architect to rename/remove the stale local stub
     during implementation planning.
  2. ADR-033's Round-2 fold text ("Permission namespace: `admin.redirects.manage`") and this
     task's fixed identifier both specify `admin.redirects.manage`, but every permission
     currently registered in `src/identity/permissions.ts` — including the most recent
     (`settings.definitions.manage`, ADR-028/SPEC-007) — is an unprefixed flat string
     (`content.write`, `navigation.manage`, `member.manage`). `admin.redirects.manage` would
     be the first `admin.`-prefixed permission in the catalog. This spec uses
     `admin.redirects.manage` exactly as directed, but records the inconsistency for the
     Coordinator/Software Architect to confirm is intentional (e.g. a forward
     namespace-disambiguation convention) rather than a drafting slip in ADR-033's fold.
- **Open Questions (non-blocking, per ADR-033's own framing of Q-4/Q-5 as tuning
  questions):** OQ-01 (dynamic-rule cap value, assumed 500), OQ-02 (over-cap policy, assumed
  reject-on-create), OQ-03 (307/308 UI exposure, assumed exposed) — all owned by Software
  Architect, resolve-by `/plan` dispatch.
- **Coordinator Planning Preflight completed 2026-07-13.** Reviewed the full `spec-dod.md`
  (88 PASS / 8 NA / 0 FAIL) and both flagged deviations. Concur with the SlugChangeCapture
  resolution (routing-owned shape is correct — later, authoritative, already implemented).
- **`admin.redirects.manage` permission-prefix question — RESOLVED, not just flagged.**
  Found the authoritative source: `reports/architecture/sweep-crosscutting-decisions-20260710.md`
  line 71 records the owner's explicit 2026-07-10 ruling that `admin.<section>.<action>` is the
  **frozen, decided convention** for admin-panel permissions (frozen specifically because
  renaming a stored permission string after Wave-1 ships is a breaking data migration —
  ADR-021 stores grants as flat strings, not capability handles). So `admin.redirects.manage`
  is correct as spec'd, no change needed here. The real inconsistency runs the other way:
  Menus (ADR-029) and Members (ADR-030) — both Wave-1 sweep ADRs, same convention freeze —
  already shipped with `navigation.manage`/`member.manage` instead of `admin.menus.manage`/
  `admin.members.manage`. That's a retroactive-migration item on those two features, not a
  blocker on this spec. Flagged to the human for a separate decision (fix now vs. later),
  not held against this spec's readiness.
- Next steps (superseded by the Software Architect run below): bring this spec package to the
  human for the approval checkpoint, then Software Architect dispatch.

## Software Architect Dispatch (2026-07-13)

- **Scope of this run:** ADR + implementation outline only, per Coordinator instruction. Read
  `AI-Dev-Shop/agents/software-architect/skills.md` first (confirmed). Did not generate
  `tasks.md` and did not write implementation code.
- **Zero unresolved `[NEEDS CLARIFICATION]` blockers confirmed** — verified directly against
  `feature.spec.md`'s Implementation Readiness Gate (all boxes checked, gate result PASS) before
  starting ADR work.
- **Validator re-run:** `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-project-knowledge/specs/009-redirects --phase preflight`
  was not re-invoked mechanically in this run (python3 availability not re-checked); relying on
  the Coordinator Planning Preflight PASS already recorded above (validated 2026-07-13, exit 0).
  If a fresh run is required before `/tasks`, re-run the validator and update this row.
- **OQ-01/02/03 ratified** (Software Architect owns resolve-by-`/plan` per the spec): dynamic
  wildcard-rule cap = 500 (OQ-01); over-cap policy = reject-on-create, not evict (OQ-02); all
  four status codes (301/302/307/308) exposed in the v1 admin UI (OQ-03). Recorded in
  `adr.md`/`implementation-outline.md`; no further owner action needed on these three.
- **Three real code-verified gaps found and resolved architecturally, not just flagged** (see
  `adr.md`'s Context/Pattern Evaluation/Migration Safety for full detail):
  1. **`SlugChangeCaptureInput` carries no `tx` handle** despite ADR-039 §4's decision pseudocode
     showing one — the real, already-implemented `src/routing/types.ts` interface has no `tx`
     field. Resolved via Decision A: a package-private, non-transaction-opening insert helper
     (`src/redirects/ports.internal.ts`) shared between the chokepoint (which opens its own tx)
     and the capture implementation (which assumes an already-open ambient tx on the single
     shared `better-sqlite3` connection) — the same shape `settings/purge-service.ts` already
     uses for its own internals-sharing.
  2. **`routing.resolve()`'s real v0 shape cannot express the documented pipeline order.** It
     runs `pre_content` then `post_content` back-to-back with no pause for the caller's own
     content lookup — but REQ-18/AC-21/AC-22 require `post_content` to run ONLY after live
     content has already failed to resolve. Resolved via Decision B: two new additive, purely
     backward-compatible exports on `src/routing/routing.ts` (`runPreContentPhase`/
     `runPostContentPhase`), wired into the REAL site route (`src/server/routes/site/pages.ts`'s
     `GET /:slug`, confirmed by direct read to not consult `routing` at all today).
  3. **Neither `src/origin` nor `src/routing` is wired into the composition root yet** — grep
     confirmed zero references to either library in `src/server/app.ts`/`routes/types.ts`. This
     feature performs that first-time wiring as in-scope work, not an assumed pre-existing
     integration.
- **Known accepted gap, named explicitly (not silently assumed away):** the content write
  chokepoint (`src/features/post/post.ts`'s `updatePost`) does not call the `SlugChangeCapture`
  slot today and has no transaction bracket of its own — confirmed by direct source read. Per
  `feature.spec.md`'s own Dependencies table, wiring content's chokepoint to call the slot is
  explicitly out of this feature's scope, owed to the content-lib owner as a follow-up. This
  means REQ-15/16/17 are fully buildable/testable against the `SlugChangeCapture` interface
  directly, but the feature's own "Success signal" (rename a real page, immediately get a 301)
  is NOT fully achievable end-to-end until that follow-up lands. Flagged in `adr.md`'s Overall
  Weaknesses, Quality Attribute Scorecard (reliability axis), and Migration Safety.
- **Highest-risk contract named explicitly** (same treatment SPEC-007 gave its write chokepoint):
  the phase-handler's read-path open-redirect oracle call (C-006/C-013 in
  `implementation-outline.md`, INV-03) — a bug here is a live, request-reachable open-redirect
  vector. TDD must certify this before any other phase-handler behavior; Code Review must verify
  no code path can emit a 30x without it having run.
- Artifacts produced: `ADS-project-knowledge/reports/pipeline/009-redirects/adr.md` (ADR-PIPE-009,
  status PROPOSED — awaiting human approval, mirrors ADR-PIPE-007's checkpoint) and
  `.../implementation-outline.md` (13 domain contracts + 2 new `routing` exports + 7 admin route
  registrars, full Trigger Decision Matrix applies).
- Next steps: human approval of ADR-PIPE-009 (the PROPOSED status mirrors ADR-PIPE-007's own
  checkpoint pattern), then `/tasks` to generate the task breakdown from this outline.
