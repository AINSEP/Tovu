# Pipeline State: FEAT-015 Integrations

| Field | Value |
|---|---|
| feat_id | FEAT-015-integrations |
| spec_id | SPEC-015 |
| stage | architecture (ADR-PIPE-015 drafted 2026-07-13 — remediation pass for GAP-01..GAP-06/GAP-12; PROPOSED, awaiting human approval + Red-Team pass before implementation) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/015-integrations |
| spec_path | ADS-memory/specs/015-integrations |
| spec_entrypoint_path | ADS-memory/specs/015-integrations/feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/015-integrations/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, behavior.spec.md, errors.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield (lightweight as-built backfill — full 5-pass reverse-spec pipeline explicitly skipped per Coordinator dispatch instruction) |
| spec_hash | sha256:f2820497e57ec41382f19b735a4c2f6746f7f78a10f41a3315da79d789aae190 |
| spec_hash_verified_at | 2026-07-13 (provider-local validator, `--phase spec --update-hash`, exit 0, zero warnings on final run) |
| planning_preflight_status | PASS (validator `--phase preflight`, run 2026-07-13 by this Software Architect pass, exit 0) |
| planning_preflight_checked_at | 2026-07-13 |
| validator_result | PASS (`--phase spec`/`--phase preflight`, exit 0, no warnings after normalizing spec-dod.md status cells to PASS/NA-only and clearing the not-yet-applicable Coordinator sign-off cell) |
| red_team_status | NOT STARTED — recommended before implementation begins (see adr.md Planning Preflight Evidence); not treated as a hard blocker for this architecture pass since GAP-01..GAP-12 were already evidence-sourced in SPEC-015 |
| red_team_spec_hash | |
| governing_adr | ADR-036 (Integrations / API — Outbound Webhooks on the Outbox, Derived-Not-Stored Signing, API Keys Reused from Identity), ACCEPTED 2026-07-10 (admin-section sweep, `TM-admin-sweep-001`, unanimous PASS); imports `HttpClientPort`/`EgressPolicy` from ADR-038, allowlists from ADR-040, `KeyringPort` per its own Round-3/4 fold |
| pipeline_adr | `ADS-memory/reports/pipeline/015-integrations/adr.md` (ADR-PIPE-015, PROPOSED 2026-07-13) — a remediation implementation ADR closing GAP-01..GAP-06 and GAP-12 against the already-ACCEPTED ADR-036; does not re-litigate ADR-036/038/040's own decisions |
| governance_adr_promotion | Not promoted — no new cross-cutting rule established beyond what ADR-036/038/040/the sweep-crosscutting permission convention already govern; the import-boundary canary pattern (`src/http/__tests__/import-boundary.test.ts`) reuses ADR-022/038's existing governance shape rather than minting a new one |
| research_artifact | N/A — reuses ADR-038's already-decided `HttpClientPort`/`EgressPolicy` design and ADR-040's already-decided `OriginRegistryPort`; the two implementation-level choices (scheduler mechanism, root-key storage mechanism) are reuse-vs-build calls evaluated in adr.md's Pattern Evaluation, not technology research |
| implementation_outline_path | `ADS-memory/reports/pipeline/015-integrations/implementation-outline.md` — Status: PRODUCED (triggers: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity) |
| tasks_path | Not generated this run — Software Architect pass stops after ADR + implementation outline per dispatch instruction; a `/tasks` dispatch is the recommended next step |
| implementation_progress | Real and shipped for: subscription CRUD (library + admin routes + admin UI), Stage A/B delivery-worker library code (unit-tested, not runtime-wired), HMAC signing/verification. NOT implemented: any runtime invocation of the delivery worker, a real `KeyringPort`/`WebhookSigner`, a real `HttpClientPort` transport, SQLite/Drizzle repo adapters, the real `core/origin` egress allowlist wiring, any `webhooks.beforeDispatch` hook registration, `integration_secrets`/`SecretSealerPort` runtime, secret rotation, manual redelivery, and the API-key admin presentation. See `feature.spec.md`'s Scope section, GAP-01 through GAP-12. Architecture for closing GAP-01..GAP-06/GAP-12 is now designed (ADR-PIPE-015) but not yet built. |

## Notes

- **2026-07-13 Software Architect remediation pass (this entry).** Produced `adr.md` (ADR-PIPE-015,
  PROPOSED) and `implementation-outline.md` (Status: PRODUCED) scoping how to close GAP-01
  (delivery-worker wiring), GAP-02/03 (real `KeyringPort`), GAP-04/06 (real `HttpClientPort` +
  real `core/origin` egress wiring — found `src/origin/origin.ts` is actually a complete, real
  `OriginRegistryPort` implementation already, just unwired here), GAP-05/12 (SQLite persistence,
  folded together with envelope durability), and the `admin.integrations.manage` permission
  rename (mirrors the `settings.write` dual-grant migration precedent). Key finding not previously
  recorded in SPEC-015: **this codebase has no scheduler primitive anywhere** — the only outbox
  precedent (`processOutbox`) runs inline inside one route handler, not on an interval — so Stage
  B needed a new (deliberately minimal, non-port) `setInterval` wrapper, and Stage A needed one
  additive `EventBusPort.subscribeAll` method rather than enumerating event names (no
  webhook-relevant domain event like `post.published` is even emitted yet in this server). The
  ADR's central decision is sequencing: adapters (signer/transport/storage) must merge and be
  reviewed *before* the fan-out subscriber/interval worker are ever registered in
  `server/deps.ts` — that registration is the named Point of No Return, gated explicitly so a
  half-finished cutover can never expose the SSRF/meaningless-signature risk the dispatch warned
  about. Recommended next command: `/tasks` once this ADR is human-approved (and ideally after a
  Red-Team pass, which was not run for the parent as-built spec).

- **Scope of this run:** Spec Agent dispatch only, as a **lightweight as-built backfill** — not
  a pre-implementation spec. Read `src/integrations/` in full (including its four
  `__tests__/*.test.ts` files), `src/http/` (ADR-038, types/ports only — no adapter exists),
  `src/server/routes/admin/integrations/*.ts` in full, `src/server/http/admin/integrations.ts`,
  `apps/admin/src/sections/{Integrations,IntegrationDeliveries}.tsx`,
  `apps/admin/src/lib/api.ts` (integrations section), `src/identity/permissions.ts`,
  `src/server/routes/types.ts`, and grepped `src/server/{app,deps}.ts` for wiring, before
  writing anything. Wrote the full Speckit-compatible spec package (`feature.spec.md`,
  `api.spec.md`, `state.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`,
  `traceability.spec.md`, `spec-manifest.md`, `spec-dod.md`) at
  `ADS-memory/specs/015-integrations/`. `orchestrator.spec.md` is OMITTED (see
  `spec-manifest.md`) — no client-side orchestration abstraction exists; both admin screens
  call the API directly via a thin fetch wrapper, mirroring the SPEC-007/SPEC-009 precedent.
- **Validator run and passed clean.** `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/015-integrations --phase spec --update-hash`
  first flagged that four `spec-dod.md` status cells used non-canonical strings
  (`PENDING VALIDATOR RUN`, `PASS (AS-BUILT)`, `PASS (PARTIAL, DISCLOSED)`) where only exact
  `PASS`/`NA`/`FAIL` are accepted — normalized all four to `PASS` with the nuance moved into
  the Notes column, and cleared a not-yet-applicable Coordinator sign-off placeholder that
  triggered an informational warning. Second run: **PASS, zero warnings**,
  `sha256:f2820497e57ec41382f19b735a4c2f6746f7f78a10f41a3315da79d789aae190`.
- **Two real ADR-036-vs-code deviations found and disclosed, not silently resolved either
  way** (see `feature.spec.md`'s Problem Statement/OQ-01 and `spec-manifest.md`'s Validation
  Notes):
  1. **Permission string.** ADR-036's Round-2 fold and `ADR-INDEX.md` line 44 both state
     `admin.integrations.manage`. The real, registered, tested permission is
     `integration.manage` (singular, unprefixed) — `src/identity/permissions.ts`'s own comment
     explains the `admin.<section>.manage` convention "has no implementation behind it
     anywhere in this codebase" at the time this landed. The sibling `009-redirects` spec later
     found and recorded that `admin.<section>.manage` IS the frozen, owner-decided convention
     (`sweep-crosscutting-decisions-20260710.md` line 71) — so, like Menus (ADR-029,
     `navigation.manage`) and Members (ADR-030, `member.manage`) before it, Integrations is a
     retroactive-migration candidate, not a drafting slip to fix silently in this backfill.
     Recorded as OQ-01, owner Coordinator/human, since renaming a live permission string is a
     breaking grant-storage migration per ADR-021.
  2. **Delivery-worker wiring claim.** `webhookSigner`'s field doc in
     `src/server/routes/types.ts` frames the delivery worker as "the first real consumer" of
     the dev-placeholder signer, phrased as though the worker runs today. A repo-wide,
     non-test-file search found **zero** callers of `enqueueDelivery`/`processDueDeliveries`
     outside their own unit tests — no outbox subscriber, no scheduler, nothing invokes either
     stage in the running server. Recorded as GAP-01 (the central missing wiring the rest of
     the subsystem depends on to do anything in production).
- **No brownfield `ANALYSIS-*`/`MIGRATION-*`/`TESTABILITY-*` reports exist or were produced**
  for this feature — the direct source-and-test read-through documented in `spec-manifest.md`'s
  Brownfield References section is the evidence base instead, per the lightweight-backfill
  dispatch instruction (full 5-pass reverse-spec pipeline explicitly skipped).
- **Twelve real implementation gaps named (GAP-01–GAP-12)** in `feature.spec.md`'s Scope
  section — each traced to a specific missing file, wiring point, or ADR-036 §8 deferral, so a
  future Software Architect pass on the remaining work starts from an accurate map rather than
  rediscovering these from ADR-036's now partially-drifted prose.
- **Next steps:** bring this spec package to the human/Coordinator for Planning Preflight review
  (including a decision on OQ-01's permission-naming question and OQ-02's GAP prioritization
  question), then — if a follow-up implementation pass is wanted — a dedicated `/plan` dispatch
  scoping which of GAP-01–GAP-12 to build next. Per task instruction, this run stops at the
  spec-dod gate; no Software Architect or task-generation dispatch was performed.

## Implementation status (2026-07-14 continuation session)

Phases 0-3 of `tasks.md` implemented and committed directly by the Coordinator (984-baseline
suite grew to 1033/1033 passing, 0 tsc errors, verified after each phase):

- **Phase 0** (T001-T004): `EventBusPort.subscribeAll` — additive, all-events subscription.
- **Phase 1** (T005-T018): real `EnvOrFileKeyring` (env var + generated-file fallback outside
  the portable site folder) + `createKeyringBackedSigner`; the guarded `HttpClientPort`
  (`src/http/client.ts` + `transport.fetch.ts`, import-boundary canary enforced) — DNS
  resolution, address classification (private/loopback/link-local/metadata/public, IPv4-mapped
  IPv6 normalized first), peer pinning, redirect re-verification with auth-header stripping on
  cross-origin hops, response-size caps; `create.ts` now calls the real
  `OriginRegistry.isAllowedEgressTarget` (GAP-06), replacing `permitAllHttpsTargets`; an
  `example.com` dev-capability egress allowlist entry was seeded so existing fixtures don't
  fail-closed. `webhookSigner` wired with the real signer construction path in both
  compositions (`EnvOrFileKeyring` in `deps.ts`, `InMemoryKeyring` test double in `app.ts`) —
  inert either way, no route calls it yet.
- **Phase 2** (T019-T024): `webhook_subscriptions`/`webhook_deliveries` Drizzle tables + SQLite
  adapters. `SqliteWebhookDeliveryRepo` implements both `WebhookDeliveryRepoPort` and
  `DeliveryEnvelopeStore` against the same row (`payload_json` column) — GAP-05/GAP-12 folded
  as one fix. Unique index on `(workspace_id, subscription_id, event_id)`; `enqueue()` treats a
  constraint violation as an idempotent no-op. Built but deliberately not flipped live in
  `deps.ts` — matches every other feature in this sweep.
- **Phase 3** (T025-T030): `integration.manage` renamed to `admin.integrations.manage`, mirroring
  ADR-PIPE-012's `navigation.manage` precedent exactly (old string deprecated not deleted; fresh
  seeds grant the new string directly; migration pair registered for pre-existing grants; all
  five routes cut over in the same commit).

**Phase 4 (Stage A fan-out + Stage B scheduler activation) deliberately NOT started.** Its own
hard gate requires Phase 1 and Phase 2 "merged and code-reviewed" — Phase 1/2 are committed but
have had zero Code Review pass this session (no `/code-review` has run against this branch), and
ADR-PIPE-015 itself records Red-Team never ran against this ADR and recommends a pass before
Phase 4 begins. Do not dispatch T031 or later until both a Code Review and (per the ADR's own
recommendation) a Red-Team pass have actually happened — this is the real, intentional
point-of-no-return gate, not a soft suggestion.
