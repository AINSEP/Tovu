# Pipeline State: FEAT-013 Members (Front-End Membership — As-Built)

| Field | Value |
|---|---|
| feat_id | FEAT-013-members |
| spec_id | SPEC-013 |
| stage | tasks (ADR-PIPE-013 ACCEPTED 2026-07-13 via blanket human approval across ADR-PIPE-008..015, Red-Team/`/audit-work` NOT yet run — accepted with that gap explicitly acknowledged; `tasks.md` generated same day, gated on implementation-outline.md readiness per the Speckit Task Generation Read Set) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-project-knowledge/specs/013-members |
| spec_path | ADS-project-knowledge/specs/013-members |
| spec_entrypoint_path | ADS-project-knowledge/specs/013-members/feature.spec.md |
| spec_readiness_artifact | ADS-project-knowledge/specs/013-members/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, errors.spec.md, behavior.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | reverse_spec |
| spec_hash | sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1 |
| spec_hash_verified_at | 2026-07-13T00:00:00Z (provider-local validator, `--phase spec --update-hash`, exit 0 PASS) |
| planning_preflight_status | NOT YET RUN — Coordinator row in spec-dod.md Sign-Off Block is blank |
| planning_preflight_checked_at | N/A |
| validator_result | PASS (`--phase spec`) |
| red_team_status | NOT YET RUN — accepted as a disclosed gap per the ADR-PIPE-008..015 blanket human approval; owed before/alongside implementation per ADR Related Decisions |
| red_team_spec_hash | N/A |
| governing_adr | ADR-030 (Members — distinct `member` principal, dedicated core tables, entitlement-gated content, origin-isolated passwordless sign-in), ACCEPTED 2026-07-10 (autonomous Opus 4.8 sweep agent, 3-round `/audit-work` PASS) |
| pipeline_adr | ADR-PIPE-013 (`reports/pipeline/013-members/adr.md`) — **ACCEPTED 2026-07-13** (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Red-Team/`/audit-work` not yet run, accepted with that gap acknowledged). Remediation ADR closing 7 triaged as-built gaps (authz gap — highest priority, magic-link rate limiter + coupled missing public sign-in routes, D1c consent, SQLite adapter (not boot-wired), permission-naming resolution — no rename, UI wiring). |
| implementation_outline | PRODUCED (`reports/pipeline/013-members/implementation-outline.md`) — triggers: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity |
| governance_adr_promotion | Not yet evaluated by this pass — ADR-PIPE-013 flags (but does not itself perform) a governance-ADR text correction owed on ADR-030/ADR-INDEX's stale `admin.members.*` mentions vs. the actual landed flat `domain.verb` convention; Coordinator should route this to `adr-governance` skill evaluation before/alongside Red-Team |
| research_artifact | N/A — no library/technology choice open; every dependency this remediation needs (mail/ADR-037, origin/ADR-040, rate-limit primitive, Drizzle/ADR-015) already exists and is reused unchanged; see ADR-PIPE-013 Research Summary |
| tasks_path | `reports/pipeline/013-members/tasks.md` — generated 2026-07-13, 42 tasks across Phase 0–5 + Polish. Phase 1 (authz-gap fix) is the highest-priority slice with no dependency on anything else in the file; the sign-in slice (Phase 2) is one coupled story phase per ADR Decision §2+3; Phase 4 (SQLite adapter) explicitly does not flip `app.ts`'s boot switch. Permission-naming resolved as no-rename — this feature does not consume Menus' `permission-migrations.ts` mechanism. |
| implementation_progress | Pre-existing, out of this pass's scope: `src/members/` (9 source files + 6 test files, ~1000 test lines), `src/server/routes/admin/members/*.ts` (4 registered routes), `apps/admin/src/sections/Members.tsx` (51-line read-only table). All wired and running today; this pass only produced the spec package documenting it. |

## Notes

- **This is a reverse-spec/as-built backfill, not a pre-implementation spec.** Members shipped
  directly from ADR-030 without a SPEC-NNN package (per the 2026-07-10 autonomous sweep). This
  dispatch reads the real code and writes the spec package it should have had. No new code was
  written or planned in this pass.
- Confirmed `AI-Dev-Shop/agents/spec/skills.md` was read in full before any other work, per the
  Delegated Agent Bootstrap instruction in `AGENTS.md`.
- **ADR-030-vs-code deviations found (see `feature.spec.md` REQ-15/16/17/18, `spec-manifest.md`
  Brownfield References):**
  - **D1c consent (`member_consents`) — NOT IMPLEMENTED.** Zero code references a consent record,
    purpose, or `members.consent.*` call anywhere in `src/members/`; confirmed by
    `subscriber-directory.ts`'s own header comment and a repo-wide grep.
  - **Magic-link rate limiter (OQ-8, a HARD pre-launch precondition per ADR-030) — NOT
    IMPLEMENTED.** Only the constant-`{delivered:true}}`-response anti-enumeration mitigation exists;
    no throttle/counter of any kind.
  - **SQLite/Drizzle repo adapter — NOT IMPLEMENTED.** All 5 repo ports have only an in-memory
    adapter; `src/infra/db/schema.ts` defines no member table.
  - **`completeSignIn` has no HTTP route anywhere** — found during this pass, not named by ADR-030
    itself. A visitor cannot complete a magic-link sign-in through any endpoint that exists today;
    `requestSignInLink` is reachable only as an operator-triggered admin action.
  - **Only `disable` is permission-gated** — found during this pass. `list`, `get-by-id`, and
    `request-magic-link` sit behind `requireAdminSession` (session auth) but perform no
    `authorize()` check; only `disable` calls `authorize({permission:'member.manage', ...})`.
- **Permission string:** the registered catalog entry is `member.manage` (`src/identity/permissions.ts`
  line 39) — singular, not a `members.*` bundle, and not the `admin.{section}.{action}` shape frozen
  in `sweep-crosscutting-decisions-20260710.md` line 71. This predates that convention freeze; renaming
  it is a breaking grant-data migration, tracked as OQ-03 rather than silently renamed.
- **Thin-UI-vs-backend gap** (`ui.spec.md` §4): `Members.tsx` is exactly a 4-column read-only table
  (email/name/status/created) with zero interactive controls — no disable, no resend-magic-link, no
  tier/subscription management, no session management, no pagination (despite the list API
  supporting keyset pagination), even though `apps/admin/src/lib/api.ts` already has client methods
  (`getMember`, `disableMember`, `requestMemberMagicLink`) the component never calls.
- Validator run twice: first pass caught 2 template-placeholder false positives (the literal string
  `admin.<section>.<action>` in prose, misread as an unfilled template slot — reworded to
  `admin.{section}.{action}`) and 6 non-canonical status strings in `spec-dod.md` (fixed to strict
  `PASS`/`FAIL`/`NA` with the nuance moved into Notes columns). Second run: clean PASS, hash
  `sha256:4223c9dd7808b2a49977075b897ed237e979ce83b611ac6b4a963dd6b82eb5b1`.
- Stopped at the spec-dod gate per the dispatch directive — only the Spec Agent sign-off row in
  `spec-dod.md` is filled; the Coordinator row is reserved for Coordinator Planning Preflight.
  Red-Team has not been dispatched.

## Architect pass (2026-07-13) — ADR-PIPE-013 + implementation-outline

- Confirmed `AI-Dev-Shop/agents/software-architect/skills.md` was read in full before any other work,
  per the Delegated Agent Bootstrap instruction in `AGENTS.md`.
- Ran `validate_spec_package.py ADS-project-knowledge/specs/013-members --phase preflight` → PASS
  before starting ADR work.
- Priority order used (validated, one reordering made with reasoning recorded in the ADR): (1) authz
  gap on list/get-by-id/request-magic-link — closed by gating all four routes behind
  `member.manage`, matching `disable.ts`'s existing shape; (2)+(3) treated as **one coupled slice**
  rather than sequential priorities — investigation found the magic-link rate limiter's real target
  is a **second, previously-unnamed gap**: there is no public (visitor-initiated) `requestSignInLink`
  route today, only the operator-triggered admin one, so shipping `completeSignIn`'s route alone would
  still leave the feature unreachable by a real visitor; both public routes + the rate limiter ship
  together; (4) D1c consent — new `MemberConsentRepoPort` + `consent-service.ts`, Members-owned per
  the locked 4-0 crosscutting ruling, Newsletter's calling side explicitly out of scope; (5) SQLite
  adapter for all 6 ports — built and contract-tested, but **not** wired into `app.ts`'s boot path,
  because no feature in this repo (confirmed: `SqlitePostRepo` exists but `app.ts` still boots
  `InMemoryPostRepo`) has flipped that switch yet — treated as a repo-wide gap, not a Members-specific
  one to solve unilaterally; (6) permission naming — **resolved as no rename**: `src/identity/permissions.ts`
  already shows the Menus/Integrations sibling remediations rejected the frozen `admin.<section>.<action>`
  convention in favor of the flat `domain.verb` shape `member.manage` already uses (their own code
  comments say so explicitly) — this ADR aligns with that landed precedent instead of re-deciding
  independently, and flags the resulting ADR-030/ADR-INDEX prose-vs-code inconsistency as a governance
  text-correction item, not something this feature ADR fixes itself; (7) UI wiring — `Members.tsx`
  gets disable/resend-link/detail-expand actions calling the 3 already-existing, already-unused
  `api.ts` client methods; pagination is a related but separately-scoped gap (the client method
  doesn't accept query params today, unlike the other 3), deferred rather than folded in.
- Also discovered (bonus finding, not previously flagged anywhere): `src/origin`'s `OriginRegistryPort`
  (ADR-040) is now fully implemented in this repo, contradicting `behavior.spec.md` §3's note that "no
  `core/origin` port exists yet" — that note was accurate when SPEC-013 was written but is now stale.
  ADR-PIPE-013 upgrades `requestSignInLink` to use it for absolute magic-link URLs, with a fallback to
  today's relative-path behavior on `OriginNotVerifiedError` to preserve INV-06.
- Constitution Check: Article VI (security) narrows from EXCEPTION to COMPLIES for the two gaps this
  ADR targets (authz, rate limiter); remains EXCEPTION for full physical member/admin origin
  separation, which no feature in this repo has infrastructure for yet (explicitly not a new gap this
  ADR introduces). Articles II/V/VIII carry forward their existing EXCEPTIONs for already-shipped code
  (cannot be retroactively fixed by an architecture pass) with the explicit requirement that every new
  remediation slice goes through TDD first.
- Red-Team has still not been dispatched — this ADR proceeds on the dispatch directive's explicit
  instruction; Red-Team + human/Coordinator approval are recorded as owed before ACCEPTED (see ADR
  Related Decisions).
