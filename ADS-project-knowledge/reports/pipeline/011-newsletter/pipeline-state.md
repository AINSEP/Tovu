# Pipeline State: FEAT-011 Newsletter

| Field | Value |
|---|---|
| feat_id | FEAT-011-newsletter |
| spec_id | SPEC-011 |
| stage | architecture (ADR-PIPE-011 + implementation-outline.md PRODUCED 2026-07-13, Software Architect Agent — status PROPOSED, awaiting human approval; see Notes for the Planning Preflight field reconciliation) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-project-knowledge/specs/011-newsletter |
| spec_path | ADS-project-knowledge/specs/011-newsletter |
| spec_entrypoint_path | ADS-project-knowledge/specs/011-newsletter/feature.spec.md |
| spec_readiness_artifact | ADS-project-knowledge/specs/011-newsletter/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, orchestrator.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield |
| spec_hash | sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583 |
| spec_hash_verified_at | 2026-07-13 (provider-local validator, `--phase spec --update-hash`, exit 0) |
| planning_preflight_status | PASS (re-verified by Software Architect Agent 2026-07-13 — see Notes for the field-inconsistency this reconciles) |
| planning_preflight_checked_at | 2026-07-13 (validator `--phase preflight`, exit 0) |
| validator_result | PASS (`--phase preflight`, exit 0, re-run 2026-07-13 by Software Architect Agent against spec hash `sha256:dc29d67a0df612ed7ba71a36b40279eb3dfb934c3d91e8538fa429cb4eb5a583`). Prior `--phase spec` PASS (after one fix) recorded 2026-07-13 — see Notes. |
| red_team_status | NOT STARTED (unchanged — this dispatch proceeded per explicit Coordinator-equivalent directive to translate the already-ACCEPTED ADR-034, not to re-debate; see Notes) |
| red_team_spec_hash | |
| governing_adr | ADR-034 (Newsletter — email campaigns as a Tier-3 bundled plugin over a Tier-2 MailerPort, outbox-driven async sending), ACCEPTED 2026-07-10 (cleared a 3-round `/audit-work` gate under `TM-admin-sweep-001`, zero blockers) — folds `sweep-crosscutting-decisions-20260710.md` §B (D1c)/§C-034/§E (permission convention) and the Round-3 audit fold (SubscriberDirectoryPort demotion, feedback ownership correction, dataModule gate correction). Relates: ADR-037 (core/mail, ACCEPTED), ADR-038 (core/http, ACCEPTED), ADR-040 (core/origin, ACCEPTED), ADR-030 (Members, ACCEPTED), ADR-023 (dataModule, ACCEPTED, engine v-next), ADR-026 (atomic multi-write, ACCEPTED, no implementation yet). |
| pipeline_adr | ADR-PIPE-011 — `ADS-project-knowledge/reports/pipeline/011-newsletter/adr.md`, PRODUCED 2026-07-13 (Software Architect Agent, status PROPOSED). Translates ADR-034 into concrete module boundaries; does not re-litigate ADR-034's Tier-3 placement or design decisions. |
| governance_adr_promotion | Not evaluated this run — no new cross-cutting governance rule was introduced (the `MembersConsentCapability` single-evaluator-dependency treatment and the `declareDataModule()` first-party-bundled reuse both apply existing governance precedent, per ADR-PIPE-011's Article IV note and Pattern Evaluation); deferred to Coordinator review if it disagrees |
| research_artifact | N/A — no new library/technology/persistence choice is opened by this spec; reuses ADR-006/007/009/021/022/023/024/026/037/038/040 patterns and the already-implemented `src/origin`, `src/core/events/outbox-worker.ts`, `src/members`, `src/features/plugins/data-module.ts` libraries |
| implementation_outline_path | `ADS-project-knowledge/reports/pipeline/011-newsletter/implementation-outline.md`, PRODUCED 2026-07-13 (triggers: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity) |
| tasks_path | Not yet generated — out of scope for this dispatch (Software Architect Agent stops after ADR + implementation outline per instruction) |
| implementation_progress | Not started — `src/newsletter/ports.ts`/`types.ts` remain interface/type stubs only; no adapters, routes, UI, or own-tables exist |

## Notes

- **Scope of this run:** Spec Agent dispatch only, per the "Delegated Agent Bootstrap"
  protocol in `AI-Dev-Shop/AGENTS.md` — confirmed reading `AI-Dev-Shop/agents/spec/skills.md`
  in full before any other work, as directed. Wrote the full Speckit-compatible spec package
  (`feature.spec.md`, `api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`,
  `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-manifest.md`,
  `spec-dod.md`) at `ADS-project-knowledge/specs/011-newsletter/`. All 10 logical files are
  `PRESENT` — no omissions this run. `orchestrator.spec.md` is deliberately included (unlike
  SPEC-007/SPEC-009, which correctly omitted it) because Newsletter has a genuine async
  orchestration layer (audience freeze → outbox-driven fan-out → completion detection)
  distinct from a synchronous write chokepoint.
- **Validator run and one fix applied.** First `--phase spec --update-hash` run failed on two
  `Template placeholder <action> still present` violations — both were literal uses of the
  notation `` `admin.<section>.<action>` `` (describing the permission-naming convention in
  prose) in `feature.spec.md` and `spec-manifest.md`, which the validator's placeholder
  scanner flags as an unfilled template token regardless of context. Reworded both to
  `` `admin` + section + action `` and reran; exit 0, hash recorded above.
- **Real brownfield findings, flagged rather than silently assumed away** (full detail in
  `spec-manifest.md`'s Brownfield / Reverse-Spec References and `feature.spec.md`'s
  Dependencies table):
  1. **`core/mail` (ADR-037) has zero adapter classes in this repo.** `src/mail/` is
     interfaces-only — no `ConsoleMailerAdapter`/`SmtpMailerAdapter`/`HttpApiMailerAdapter`/
     `InMemoryMailerAdapter` class exists anywhere, and no `MailSuppressionRepoPort`/
     `MailSendDedupRepoPort` implementation exists either. This alone blocks any real send
     today, independent of Members.
  2. **`KeyringPort` (home: `src/integrations/`) is interfaces-only** — no concrete adapter,
     not even an in-memory one, exists yet. REQ-14's unsubscribe-token derivation depends on
     it.
  3. **Members' `member_consents`/`members.consent.request/confirm/revoke` do not exist
     anywhere in this codebase** — confirmed by `src/members/INFO.md`'s own explicit
     disclosure ("that ledger does not exist anywhere in this codebase"). This is the
     specific fact the user-directed sequencing constraint ("must NOT ship to real
     recipients before Members live") refers to, and it is real, not hypothetical.
  4. **No generalized `entries`/content-type-registry substrate exists** — only a concrete
     `src/features/post` feature. ADR-034 §2 designs the campaign as a seeded content-type
     entry; this spec specifies `CampaignRecord`'s row shape/transition rules independent of
     the storage mechanism and flags the mechanism choice as a Software Architect decision
     (extend `post`'s pattern vs. a dedicated `dataModule` table).
  5. **The ADR-023 `dataModule` reconciliation engine does not exist**, and per ADR-034's own
     Round-3 audit fold text (quoted in `feature.spec.md`), "neither [the engine nor a fully
     specified first-party interim table-creation path] exists today" for Newsletter's five
     `p_newsletter__*` tables (four from ADR-034 + one this spec adds, `p_newsletter__
     confirmation_tokens`, OQ-03).
  6. **The ADR-026 atomic multi-write primitive (REQ-24/INV-02's counter-update mechanism)
     has no implementation anywhere in `src/`** (repo-wide search for `atomicMultiWrite`/
     `AtomicWrite` returned nothing) — inherited precondition, not this spec's to build.
  7. **Permission-catalog naming mismatch**, same class SPEC-009 flagged for
     `admin.redirects.manage`: `src/newsletter/types.ts`'s `NEWSLETTER_PERMISSIONS` constant
     uses unprefixed `newsletter.*` strings, predating the 2026-07-10 sweep's frozen
     `admin`-plus-section-plus-action permission convention
     (`sweep-crosscutting-decisions-20260710.md` line 71 — the source this task directed be
     checked, already independently confirmed by SPEC-008 and SPEC-009 against the same
     line). This spec uses `admin.newsletter.*` throughout, per that settled convention, and
     directs Software Architect to update the stale constant.
  8. **Naming reconciliation, not a functional gap:** ADR-030's decided "publish
     `AudienceDirectoryPort`" outcome is satisfied today by the real, working
     `MembersSubscriberDirectory` class (`src/members/subscriber-directory.ts`), which
     implements Newsletter's own pre-existing `SubscriberDirectoryPort` interface name
     (`src/newsletter/ports.ts`) — the seam works; only the literal type name differs from
     ADR-030's prose. Flagged, not treated as missing.
- **How the Members-readiness launch gate was spec'd (the task's central ask):** REQ-21
  (`feature.spec.md`) defines a **Launch Readiness Gate** as a structural, code-enforced
  precondition on `admin.newsletter.campaign.send` (never on `send_test`, with two of its
  four preconditions), evaluated fresh at every send-authorization attempt, never cached or
  client-overridable:
  (a) an explicit, default-`false` workspace setting `newsletter.launch_gate.sending_enabled`
  — the literal human/ops decision the task asked for;
  (b) the Members consent capability is registered and live (not an unbound stub) — the
  direct technical translation of "Members must be live";
  (c) `OriginRegistryPort.canonicalOrigin` resolves a verified origin (already real and
  enforceable today via `src/origin`);
  (d) the bound `MailerPort` adapter is not `console`/`memory` (a production-capable adapter
  is actually configured).
  All four are always evaluated and all unmet ones are named together in one
  `NEWSLETTER_LAUNCH_GATE_BLOCKED` response (`behavior.spec.md` § 1.2), so an operator sees
  the whole picture, not a fix-one-discover-the-next loop. This makes the ADR's
  prose-only sequencing constraint into 5 P1 acceptance criteria (AC-27–AC-31), 1 invariant
  (INV-05), and 3 edge cases (EC-05, EC-10, plus the§7 behavior-rule row) — testable now, even
  though none of (b)/(d)'s underlying primitives are built yet.
- **Open Questions (non-blocking):** OQ-01 (confirm-resend anti-enumeration posture),
  OQ-02 (launch-gate flag storage mechanism), OQ-03 (confirmation-token storage shape —
  dedicated table vs. ext-field), OQ-04 (send-log retention policy, inherited unresolved from
  ADR-034 OPEN-4) — all owned by Software Architect or a later primitive owner, none gate
  `/plan` dispatch.
- Next steps: bring this spec package to the human for the approval checkpoint, then
  Coordinator Planning Preflight (`--phase preflight` re-run + Coordinator sign-off row),
  then Software Architect dispatch. Per instruction, this run stops at the spec-dod
  readiness gate — no ADR, tasks, or implementation were produced.

## Software Architect Agent dispatch (2026-07-13)

- **Scope of this run:** Software Architect Agent dispatch, per the "Delegated Agent
  Bootstrap" protocol in `AI-Dev-Shop/AGENTS.md` — confirmed reading
  `AI-Dev-Shop/agents/software-architect/skills.md` in full before any other work. Dispatched
  in parallel with 5 sibling agents (Forms, Menus, Members, Analytics, Integrations) on
  disjoint files. Task directive: translate the human-approved SPEC-011 spec package,
  governed by already-ACCEPTED ADR-034, into an implementation ADR + implementation outline —
  explicitly not a re-debate of ADR-034.
- **Field-inconsistency found and reconciled.** Prior to this run, this file's own `stage`
  field read "Planning Preflight PASSED... awaiting human approval" while
  `planning_preflight_status` read `NOT STARTED` and the prior run's own "Next steps" said
  human approval and Planning Preflight were both still pending — an internal contradiction.
  This agent independently re-verified readiness rather than trusting either stale field:
  re-ran the provider-local validator (`--phase preflight`, exit 0), confirmed
  `feature.spec.md`'s `status: APPROVED`, confirmed zero `[NEEDS CLARIFICATION]` markers, and
  confirmed `spec-dod.md`'s Sign-Off Block has both the Spec Agent and Coordinator rows
  filled (the Coordinator row explicitly concurs with the Launch Readiness Gate as the
  correct translation of "Members must be live"). On that independently-verified basis, this
  run proceeded per the explicit dispatch directive. `planning_preflight_status` is updated
  to `PASS` above on that evidence; `red_team_status` is left `NOT STARTED` since no Red-Team
  artifact was produced or reviewed this run — flagged as a real gap for Coordinator
  attention, not silently closed.
- **Produced this run:** `adr.md` (ADR-PIPE-011, PROPOSED — awaiting human approval, mirrors
  ADR-PIPE-007's checkpoint) and `implementation-outline.md`, both at
  `ADS-project-knowledge/reports/pipeline/011-newsletter/`.
- **Three real architecture decisions this ADR resolves that ADR-034/SPEC-011 left open:**
  (1) campaign storage — a bespoke Drizzle table pair (`newsletter_campaigns` +
  `newsletter_campaign_revisions`), not a generalized `entries` substrate (doesn't exist) nor
  the `dataModule` path (wrong shape for a singular editorial row); (2) the five
  `p_newsletter__*` tables — created via the existing `declareDataModule()` snapshot-before-
  DDL spike (`src/features/plugins/data-module.ts`), invoked at boot, scoped first-party-
  bundled-only, per ADR-034's own Round-3 fold citing sweep §A.2's sanction — flagged as this
  ADR's highest-risk *infrastructure* dependency (the code's own header calls itself an
  "exploratory spike," pre-dating ADR-023's ACCEPTED status) with a required dedicated
  failure-path integration test as a mitigation; (3) the Launch Readiness Gate (REQ-21)
  ships as one exported, always-evaluated function (`evaluateLaunchGate`), never scattered
  if-checks — this ADR's single highest-risk *contract*, given the same explicit treatment
  SPEC-007 gave its write chokepoint.
- **Members boundary respected:** `MembersConsentCapability` (the typed seam Newsletter needs
  into Members' not-yet-built consent capability) is declared entirely inside
  `src/newsletter/ports.ts` — zero files under `src/members/` are touched or referenced for
  editing, keeping this run disjoint from the parallel Members dispatch.
- Next steps: human approval of ADR-PIPE-011 (status PROPOSED, same checkpoint shape as
  ADR-PIPE-007); Coordinator should reconcile whether a Red-Team pass is owed before or after
  that approval, given none has run yet for this spec; then `/tasks` generation reading both
  `traceability.spec.md` and this implementation outline's Module/Contract/Wiring maps for
  `[P]` parallelization guidance.
