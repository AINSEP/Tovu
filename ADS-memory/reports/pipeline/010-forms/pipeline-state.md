# Pipeline State: FEAT-010 Forms (Contact Form — Tier-1 sample plugin, AW-7)

| Field | Value |
|---|---|
| feat_id | FEAT-010-forms |
| spec_id | SPEC-010 |
| stage | architect (ADR + implementation outline produced 2026-07-13; awaiting human approval before `/tasks`) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-memory/specs/010-forms |
| spec_path | ADS-memory/specs/010-forms |
| spec_entrypoint_path | ADS-memory/specs/010-forms/feature.spec.md |
| spec_readiness_artifact | ADS-memory/specs/010-forms/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, behavior.spec.md, errors.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | greenfield (Forms itself has no prior stub/shipped code; it consumes two real brownfield libraries — `src/mail`, `src/integrations` — whose gaps are recorded in Dependencies, not treated as this spec's own brownfield surface) |
| spec_hash | sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e |
| spec_hash_verified_at | 2026-07-13 (provider-local validator, `--phase spec --update-hash`, PASS) |
| planning_preflight_status | PASS (`validate_spec_package.py --phase preflight`, exit 0, zero violations) — run directly by Software Architect at dispatch per its own read-set instructions; note the prior "NOT YET RUN" value here was stale relative to `spec-dod.md`'s Sign-Off Block, which already carried a filled Coordinator row authorizing this dispatch |
| planning_preflight_checked_at | 2026-07-13 |
| validator_result | PASS (`--phase spec`, exit 0, zero violations, one informational warning: Coordinator sign-off row reserved for Planning Preflight, as expected); PASS again at `--phase preflight` (Software Architect stage, 2026-07-13) |
| red_team_status | NOT YET RUN |
| red_team_spec_hash | |
| governing_adr | Composite governing set (no dedicated Forms ADR exists): **ADR-024** (Plugin Execution & Trust Model — Tier-1 declarative/zero-code contract, enable/disable-only lifecycle) + **ADR-037** (`core/mail` — `MailerPort`, consumed for on-submit notification) + **ADR-036** (Integrations/API — webhook subsystem, consumed via a new `form.submission.received` topic with zero Forms-specific dispatch code) |
| pipeline_adr | **PRODUCED** — `ADS-memory/reports/pipeline/010-forms/adr.md` (ADR-PIPE-010, PROPOSED, awaiting human approval). The composite governing ADRs still needed no amendment, but the OQ-01 Tier-1 plugin-loader gap DID require a real implementation-architecture decision per the Coordinator's dispatch directive — ADR-PIPE-010 resolves it as a `manifest.ts` data/activation-split seam inside a bundled, always-on `src/forms/` core module (not a Tier-1 loader itself). Also resolves OQ-02 (Drizzle table/column naming) and OQ-03 (`source_ip` stored raw for v1, flagged for Security Agent review) concretely. |
| implementation_outline | **PRODUCED** — `ADS-memory/reports/pipeline/010-forms/implementation-outline.md`. Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Critical Cross-Boundary Invariant, Parallelization Ambiguity. |
| governance_adr_promotion | Evaluated, not executed this pass (scope was capped at ADR + outline, no tasks.md/code, per Coordinator directive). Two candidate cross-cutting rules were identified as promotion-worthy once ADR-PIPE-010 is human-approved: (1) a bundled, hand-wired "Tier-1-shaped" core module must isolate its declarative surface (field/capability/permission/topic data) in a manifest-only file with zero runtime imports, so a future real plugin-loader retrofit stays a wiring change; (2) any public/unauthenticated write path that enqueues a domain event must drain the outbox fire-and-forget (never `await`ed in the HTTP response path), not the synchronous `await processOutbox(...)` pattern the one pre-existing caller (`POST /workspaces`) uses. Recommend Coordinator route these to `adr-governance/SKILL.md`'s promotion workflow after sign-off, not silently generalized from a single feature's ADR without that review. |
| research_artifact | N/A — no new library/technology choice is open; every dependency (`src/mail`, `src/integrations`, core outbox, `src/identity`) is an already-implemented in-repo lib per `feature.spec.md` Dependencies |
| tasks_path | Not yet produced |
| implementation_progress | Not started — spec package only |

## Notes

- **Software Architect stage result (2026-07-13):** ADR-PIPE-010 + implementation-outline.md
  produced. OQ-01 resolved as: Forms activates exactly like `settings`/`members`/`menus` (an
  ordinary always-on core module, registered unconditionally — NOT the Tier-3 `bootstrapStore`
  SPIKE-hook pattern in `src/index.ts`, which is for plugin-*owned* tables Forms doesn't have),
  with its declarative surface (field vocabulary, permission strings, admin nav entry, webhook
  topic name) isolated as plain data in `src/forms/manifest.ts` so a future real Tier-1 loader
  retrofit is a data-transcription + registration-swap, not a rewrite of any domain code. Two other
  concrete decisions worth flagging: (1) the public submission write path deliberately does NOT
  route through the existing `executeCommand` admin-mutation gateway (no actor/permission fits an
  anonymous visitor) — it's a dedicated `submit-service.ts`, mirroring the existing
  `routes/site/analytics-ingest.ts` precedent; (2) that same path must call `void processOutbox(...)`
  (fire-and-forget), not `await` it like the one pre-existing caller does, or REQ-16/INV-05
  (never block the response on mail/webhook) silently breaks.
- **Real wiring gap found and closed in the design (not previously known):** `src/integrations`'s
  webhook fan-out subscriber (`enqueueDelivery`) is real, tested code but is never registered
  against the event bus anywhere in `server/app.ts` today — only a `workspace.created` demo
  subscriber exists. ADR-PIPE-010 closes this for Forms' own topic with one forwarding line
  (`bus.subscribe('form.submission.received', event => enqueueDelivery(...))`), containing zero
  Forms-owned dispatch logic. **Coordination flag:** the parallel Integrations sibling spec in
  this same dispatch round may need the same kind of `server/app.ts`/`routes/types.ts` edit —
  both task lists should be sequenced or merged by the Coordinator, not marked `[P]` against each
  other.
- **Scope:** the Contact Form, AW-7's Tier-1 sample plugin — form-definition CRUD (declarative
  field vocabulary, zero operator code), public submission handling, on-submit email
  notification (`MailerPort`) and webhook fan-out (existing `integrations` subsystem via a new
  domain-event topic), an admin submissions log with permanent delete, and a fixed
  honeypot/rate-limit spam control. Explicitly **not** a drag-drop form builder, not a CAPTCHA
  integration, not a dynamically-installable plugin package. See `feature.spec.md` Scope for the
  exact in/out lists.

- **The single most load-bearing finding of this spec run (read this first):** there is **no
  Tier-1 declarative-plugin manifest loader or registry anywhere in this codebase.**
  `src/features/plugins/` contains only the Tier-3 `dataModule` spike (`data-module.ts`,
  ADR-023-shaped, ADR-023 itself still PROPOSED not ACCEPTED) and the hand-wired Tier-3 Store
  sample plugin (`store-plugin.ts`), both activated by a single direct function call
  (`bootstrapStore`) in `src/index.ts` — there is no install/enable/disable-as-a-package
  mechanism, no manifest parser, no plugin registry of any kind. This means Forms **cannot
  literally be "installed from a manifest by anyone"** the way ADR-024 §1 describes Tier-1. This
  spec resolves the tension the same way SEO (ADR-032) and Redirects (ADR-033) already did in
  this codebase: Forms ships as a **bundled, hand-wired core module** — its field-config surface
  is genuinely declarative/zero-code from the *operator's* perspective (JSON-shaped, closed
  vocabulary, no code), but its *activation mechanism* is ordinary hand-wired route/module code,
  not a dynamically-loaded third-party package. Recorded as Open Question OQ-01 in
  `feature.spec.md`, not silently invented into a new ADR. **This means AW-7's stated goal — three
  sample plugins that "prove the plugin design" as installable artifacts — is only partially
  achievable today: the Tier-3 Store slice and this Tier-1 Contact Form both prove their
  respective *data/execution* models (owned tables + snapshot-before-DDL; declarative
  field-config + core-mediated notify/webhook), but neither proves an actual install/enable/
  disable-as-a-package loop, because that loop doesn't exist yet as infrastructure.** Software
  Architect and the Coordinator should treat OQ-01 as a real, load-bearing architecture question —
  possibly deserving its own ADR — before or alongside implementing this spec, not as a minor
  footnote.

- **Mail/integrations dependency risk (documented, not silently absorbed):** `src/mail` ships
  `MailerPort` as **interfaces only** — the one concrete adapter that exists
  (`ConsoleMailerAdapter`) lives under `src/members/mailer.console.ts`, not in `src/mail` itself.
  `src/integrations` has real webhook business logic (fan-out enqueue, delivery worker,
  subscription CRUD) but only **in-memory** repo adapters — no SQLite persistence for
  `webhook_subscriptions`/`webhook_deliveries` is wired into `src/infra/db/schema.ts` yet. Neither
  gap blocks writing this spec (Forms consumes both by interface/port, as intended), but Software
  Architect must name the concrete adapters Forms' implementation is wired against rather than
  assume `src/mail`/`src/integrations` are production-complete end to end.

- **No generic `entries` model exists** (confirmed directly against `src/infra/db/schema.ts` —
  only `posts`, `presentation_settings`, and the settings-ledger tables exist). AW-7's own text
  ("submissions as core entries") is read as describing the desired conceptual shape, not a
  literal attachment point — same caveat SEO/Redirects already recorded. This spec creates two new
  bespoke, core-owned tables (`form_definitions`, `form_submissions`), following the exact
  precedent ADR-027/028/036 already set for core-owned tables outside the generic entries model.

- **Zero `[NEEDS CLARIFICATION]` markers** were left open. Three non-blocking Open Questions
  remain: OQ-01 (the plugin-loader gap, owned by Coordinator/Software Architect, resolve before a
  second Tier-1 sample or with a named follow-up ADR), OQ-02 (migration/table naming, Software
  Architect, 2026-07-20), OQ-03 (raw/hash/omit `source_ip`, Software Architect/Security,
  2026-07-20).

- Runs independently of the other in-progress spec folders (`012-menus`, `013-members`,
  `014-analytics`, `015-integrations`) observed in `ADS-memory/specs/` during this
  run — those appear to be separate, unrelated reverse-spec backfills for already-shipped
  features (e.g. `012-menus/feature.spec.md` is explicitly marked "as-built documentation, not a
  pre-implementation gate"), not part of this dispatch and not touched by this run.
