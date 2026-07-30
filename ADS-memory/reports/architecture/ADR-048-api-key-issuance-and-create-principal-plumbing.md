# ADR-048: API-Key Issuance & CREATE_PRINCIPAL Plumbing — Closing the SPEC-006 REQ-08 Gap

- Status: PROPOSED — **requires human architecture sign-off before implementation** (see Constraints below; not self-certifying)
- Date: 2026-07-28
- Spec: SPEC-006 v0.6.0 (hash: sha256:2f74289036a419715d2210352d3de271500e0f8dcd5679207bf4d6ae4d3d65dc), status DRAFT
- Author: Software Architect Agent (Claude Sonnet 5) / Leon Aburime (pending sign-off)
- Extends: **ADR-021** (identity & authorization — this ADR fills a gap ADR-021 §9/§7 explicitly anticipated ["API keys are in v1"] but a prior implementation pass deferred)
- Relates: ADR-006 (rule-of-two), ADR-007 (workspace scoping), ADR-046 (typed server modules, `createApiKeysModule` follows its Phase 3 convention)
- Pipeline record: `reports/pipeline/006-identity-and-authorization/adr.md` (identical content, filed under this repo's pipeline-artifact path convention per the Software Architect skill), plus `implementation-outline.md` and `critical-internal-constraints.md` in the same directory
- Triggered by: a Programmer escalation during an existing-spec drift-fix sweep attempting to implement `APIKEY_ISSUE`/`APIKEY_REVOKE` — found zero supporting plumbing anywhere in the codebase

## Constitution Check

*Complete before any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new library. `node:crypto`'s `createHash("sha256")`/`randomBytes` is already the accepted primitive for opaque-token hashing in this codebase (`auth-service.ts`'s `hashToken`/`newRawToken`); this ADR extends that existing choice rather than introducing bcrypt/argon2/a KMS. |
| II — Test-First | COMPLIES (forward-looking) | No production code is written by this ADR. Every contract in the Implementation Outline must go through TDD certification before Programmer touches it — no exception requested. |
| III — Simplicity Gate | COMPLIES | Every new module/type traces to a named REQ (REQ-08, state.spec §3 `CREATE_PRINCIPAL`/`ISSUE_API_KEY`/`REVOKE_API_KEY`). No speculative generality: no key-rotation, no scopes-beyond-policies, no multi-key-per-principal support, since none is specified. |
| IV — Anti-Abstraction Gate | COMPLIES | `ApiKeyRepoPort` gets a real second adapter (`InMemoryApiKeyRepo` + `SqliteApiKeyRepo`) in the same pass, matching every one of the 9 existing identity ports. Key hashing is deliberately **not** made a port (Decision 2) — mirrors the existing, accepted precedent that session-token hashing (`auth-service.ts`) is ordinary code, not a `PasswordHasherPort`-shaped seam. |
| V — Integration-First Testing | COMPLIES (forward-looking) | `APIKEY_ISSUE`/`APIKEY_REVOKE` are both P1 ACs (AC-15, AC-06) with a real HTTP surface — TDD must cover them at that boundary, matching every other identity admin route's existing convention. |
| VI — Security-by-Default | COMPLIES, with one disclosed, pre-existing gap not introduced by this ADR | Every new endpoint requires `apikey.manage` and runs the INV-07 clamp. The pre-existing `AUTH_APIKEY_MANAGE`/`AUTH_SESSION_OR_KEY` profiles already required "session cookie or API key" resolution before this ADR (api.spec §2, written in v0.5.2) — that resolver simply never got built. This ADR closes it (Decision area, C-008) as a necessary side effect of making `APIKEY_ISSUE`/`APIKEY_REVOKE` implementable at all, not as scope creep. |
| VII — Spec Integrity | EXCEPTION (disclosed, escalated as Decision 3) | `CREATE_PRINCIPAL` is fully specified at the state layer (state.spec.md §3) but has **no** HTTP or CLI surface anywhere in the approved api.spec.md — an unreachable transition. Closing this requires an api.spec.md contract change, which this ADR does **not** make unilaterally (see Decision 3 / `[NEEDS CLARIFICATION]`). This is the one Constitution exception in this ADR, and it is the reason implementation cannot fully proceed until Spec Agent resolves it. |
| VIII — Observability | EXCEPTION (carried, pre-existing) | This surface inherits the same unstructured-error-envelope / no-`correlationId` gap every other identity admin route already has (disclosed, not new — matches the accepted framing in ADR-PIPE-013's Article VIII row). |

No unjustified exceptions. Article VII's exception is the one genuinely new item this ADR surfaces, and it blocks full implementation by design (see Decision 3).

## Research Summary

- Research artifact: N/A — no library, framework, or infrastructure technology choice is in scope. The one genuinely open technical question (key-hashing primitive) is answered by direct analogy to an already-accepted, already-implemented pattern in this same codebase (`auth-service.ts`'s session-token hashing), not by external library research.
- Key decision: SHA-256 over a high-entropy random secret (ordinary code, not a port) for API-key hashing; a small, concrete `api_keys` schema transcribed from SPEC-006's already-approved entity contract; `CREATE_PRINCIPAL`'s HTTP surface routed back to Spec Agent as `[NEEDS CLARIFICATION]` with a recommended shape.

## Planning Preflight Evidence

- Coordinator Planning Preflight: Not run as a formal gate in this dispatch — this is a targeted architecture-remediation dispatch responding directly to a Programmer escalation during an existing-spec drift-fix sweep, per the Coordinator's dispatch context. Treated as equivalent evidence: the escalation itself, SPEC-006 v0.6.0 (DRAFT, hash above), and ADR-021 (ACCEPTED 2026-07-07) were read in full before this ADR was written.
- Spec hash verified at: `ADS-memory/specs/006-identity-and-authorization/feature.spec.md` header metadata, `content_hash: sha256:2f74289036a419715d2210352d3de271500e0f8dcd5679207bf4d6ae4d3d65dc`.
- Red-Team status and artifact: `reports/pipeline/006-identity-and-authorization/red-team-findings.md` exists (from the v0.5.0 pass, RT-001..006, all closed or carried per feature.spec.md's revision history). **No fresh Red-Team pass has run over v0.6.0's new material or over this ADR's proposed plumbing** — feature.spec.md's own 0.6.0 revision note states status reverted to DRAFT "pending a fresh human checkpoint + Red-Team pass over the new material only." This ADR's designated `ESCALATE_SECURITY`/`ESCALATE_IRREVERSIBLE` constraints (see Critical Internal Constraints artifact) are exactly the material a fresh Red-Team pass should target first.
- System Blueprint status and artifact: none produced for SPEC-006 (predates the Blueprint stage's introduction into this pipeline, per ADR-021's own dating).
- CodeBase Analyzer reports consumed: none — direct source reading was used instead (`src/identity/*`, `src/server/*`, `src/infra/db/schema.ts`), confirmed sufficient for a slice this size.
- Reverse-spec artifacts consumed: N/A.
- Validator result or waiver: N/A (no automated Planning Preflight validator wired into this dispatch path).

## Context

The Programmer, attempting to implement SPEC-006's `APIKEY_ISSUE`/`APIKEY_REVOKE` endpoints as part of an existing-spec drift-fix sweep, correctly stopped and escalated: no `ApiKeyRecord` type, no `ApiKeysRepoPort`, no memory/SQLite adapter, and no `api_keys` table exist anywhere in this codebase, despite `api.spec.md` documenting both endpoints since v0.5.0 and `state.spec.md` fully specifying `ISSUE_API_KEY`/`REVOKE_API_KEY`/`CREATE_PRINCIPAL` since v0.5.1-v0.5.5. `src/identity/grant-service.ts`'s own file header explicitly lists `ISSUE_API_KEY`/`CREATE_PRINCIPAL` as "out of scope, deferred" from the session that built the rest of identity's CRUD surface (`CREATE_USER`/`ASSIGN_ROLE`/`ATTACH_POLICY`/etc., later joined by the 0.6.0 admin-CRUD-completion amendment in `admin-crud-service.ts`). This ADR is that deferred work's design.

Three forces make this a genuine architecture task, not a mechanical fill-in:

1. **The security design is already fully worked out and is not open for re-litigation.** SPEC-006's revision history (F-052 through F-054, five audit rounds) already closed a chain of two-actor and issuer-demotion privilege-escalation classes specifically around `ISSUE_API_KEY`. The bound principal must be `kind='api_key'` (AC-23) and grantless/freshly-minted (AC-25a); the issued key's permissions must be a frozen snapshot via a fresh `is_frozen=true` policy, never a live reference (F-054-01); `WRITE_POLICY_PERMISSION` already refuses frozen/builtin policies. This ADR's job is the missing plumbing that *implements* this design, not a redesign.
2. **A real technical choice is open: the hashing primitive.** Password hashing (argon2id) is already implemented but is the wrong tool for a credential verified on every request — its deliberate slowness exists specifically to resist offline brute-force of a *low-entropy, user-chosen* secret, a threat model that does not apply to a *high-entropy, randomly generated* API key.
3. **A genuine spec gap exists, not an implementation gap.** `CREATE_PRINCIPAL` is fully specified as a state transition (state.spec.md §3) but has zero HTTP or CLI surface in the approved `api.spec.md` — without one, `apikey.manage` holders have no way to ever produce a valid `kind='api_key'` principal id for `ISSUE_API_KEY` to bind to. This is a contract-level decision, not an architecture-level one.

## Decision

Build the missing `identity` plumbing (types, port, two adapters, core service functions, HTTP routes, and the API-key credential-resolution middleware branch) needed to make `APIKEY_ISSUE`/`APIKEY_REVOKE` real, using SHA-256-over-random-secret as the key-hashing primitive (ordinary code, not a port), and route `CREATE_PRINCIPAL`'s HTTP-surface shape back to Spec Agent as an explicit `[NEEDS CLARIFICATION]` item rather than deciding it unilaterally, since it changes `api.spec.md`'s own contract.

**Pattern(s) selected:** Repository-port-and-adapter (rule-of-two, matching all 9 existing identity ports) for `api_keys` persistence; ordinary core functions (matching `grant-service.ts`/`admin-crud-service.ts`) for the three transitions; ordinary code (no port) for key hashing.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, hexagonal boundaries where external I/O or business-critical logic justify them.
- Alignment: FOLLOWS
- Notes: This is pure conformance to an already-established pattern (ADR-021 already selected principal-centric hybrid RBAC + repository-pattern ports for identity; this ADR is the tenth near-identical repo port in the same family, not a new macro decision). No departure is proposed or needed.

## Rationale

Map to system drivers:

- **Security-critical correctness** (dominant driver — this is a credential-issuance surface) → addressed by treating the existing SPEC-006 issuance-snapshot design as ground truth and adding Critical Internal Constraints for the two units where a plausible-but-wrong implementation would silently violate it (see `critical-internal-constraints.md`).
- **Consistency with an established, audited pattern** → the repo-port/adapter shape, the "ordinary core function, not a port" shape for grant-writing transitions, and the "hash opaque secrets with SHA-256, hash human passwords with argon2id" split are all direct extensions of patterns this codebase already uses and has already accepted (ADR-006, ADR-021, `auth-service.ts`'s session-token hashing) — no new pattern is introduced.
- **Spec integrity over convenience** → `CREATE_PRINCIPAL`'s HTTP shape is a genuine open contract decision (two structurally different options exist, each with different security-surface implications for AC-25a's "grantless" check — see Decision 3). Deciding it unilaterally here would be architecture overreaching into spec ownership; it is escalated instead.

## Pattern Evaluation

### A. `api_keys` persistence pattern

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|-----------------|------|------|---------------|---------|
| Repository port + two adapters (mirrors the 9 existing identity ports) | Strong fit | High | prior_art (9 sibling ports in this exact codebase, same file, same shape) | Zero new architectural vocabulary; `identity/__tests__/repo.contract.test.ts`'s existing contract-test convention extends for free; Article IV trivially satisfied | One more port in an already-large `IdentityRepos` bag (10 fields) | Marginal bag-size growth vs. zero new concepts | **SELECTED** |
| Fold `api_keys` access directly into `api-key-service.ts` via raw SQL, no port | Weak fit | Low | analogical | Fewer files | Breaks Article IV (would need a documented rule-of-two exception with no real justification — an in-memory adapter is trivial to write and every other identity table has one); no contract test coverage story | Saves ~2 small files at the cost of an inconsistent pattern and a real Constitution exception | Not selected — no driver justifies the exception |
| A unified `CredentialRepoPort` merging `sessions` + `api_keys` (shared "revocable bearer credential" abstraction) | Weak fit | Medium | assumed | Could look elegant on paper (both are hash+revoke+expire shapes) | `SessionRecord` and `ApiKeyRecord` diverge in real fields (`ip`/`userAgent` vs `label`/`prefix`) and in owner semantics (session is 1:many per principal, key relationship is constrained by the grantless-issuance rule); premature unification would need a lowest-common-denominator type that satisfies neither cleanly | Would need to be unwound the first time a session-only or key-only field is added — already true today | Not selected — speculative generality Article III would flag |

### B. Key-hashing primitive

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|-----------------|------|------|---------------|---------|
| SHA-256 over a high-entropy random secret, ordinary code (mirrors `auth-service.ts`'s session-token hashing) | Strong fit | High | prior_art (already implemented and accepted in this exact codebase for the structurally identical session-token case) | Fast (sub-millisecond) — matches REQ-08's "authenticates identically to a session" performance expectation; no new dependency; security lives in the secret's entropy (256 bits from `crypto.randomBytes(32)`), not the hash function's slowness, which is the textbook-correct model for machine credentials (GitHub/Stripe-style: store only a hash, compare on each request) | A raw key that leaks (e.g. via a compromised client) is not helped by the hash at all — but neither would any hash be, including argon2id; the mitigation for leaked-secret risk is revocation + expiry, both already in REQ-08's schema | Trades "resistance to offline brute-force of the hash itself" (irrelevant here — the secret is never guessed, it's generated) for verification speed | **SELECTED** |
| argon2id via the existing `PasswordHasherPort` (reuse, no new code) | Rejected | Medium | measured (already implemented) | Reuses an existing port with zero new code | Wrong threat model: argon2id's ~19 MiB memory + 2 iterations per call exist to slow down an *attacker* guessing a *low-entropy, human-chosen* password from its hash — a high-entropy random API key is never brute-forced from its hash, so the slowness only taxes every legitimate request; directly contradicts REQ-08's own "authenticates identically to a session" performance expectation | Would make every API-authenticated request meaningfully slower than every session-authenticated request for no security benefit | Not selected — mismatched threat model, would be adopted "because the pattern exists" not because it fits (exactly the anti-pattern the dispatch context warned against) |
| HMAC-SHA256 with a server-side secret pepper | Viable fit | Medium | analogical | Marginally hardens against an attacker who has read `key_hash` values from a DB dump but not the pepper (defense in depth) | Introduces a new secret-management concern (where does the pepper live, how does it rotate, what breaks all existing keys if it's lost) that this local-first, single-`content.db`-per-site topology (ADR-021 context) has no existing primitive for (no KMS, no secrets manager) | Marginal defense-in-depth gain vs. a new, unmanaged secret-custody problem | Not selected — the marginal gain doesn't justify inventing secret-custody machinery this codebase has no existing pattern for; revisit if a KMS/secrets-manager primitive is ever added for another reason |
| bcrypt | Rejected | Low | analogical | Widely known | Same threat-model mismatch as argon2id (designed to slow down guessing a low-entropy secret); also weaker than argon2id if that mismatch were ever going to be accepted anyway | N/A | Not selected — strictly dominated by argon2id even under the (rejected) argument for using a slow hash here |

### C. `CREATE_PRINCIPAL` HTTP surface shape (informational — decision routed to Spec Agent, not decided here)

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|-----------------|------|------|---------------|---------|
| Separate endpoint (`POST .../api-keys/principals` or similar), mirroring state.spec's existing two-transition model | Strong fit | High | prior_art (state.spec.md §3 already models CREATE_PRINCIPAL and ISSUE_API_KEY as two independent transitions with independent failure handling) | Matches the spec's own mental model exactly; keeps AC-25a's "grantless" check meaningfully independent-testable (a principal can exist, unissued, and be inspected); REST-natural (principals is a resource, minting one is a POST) | One more endpoint; two round trips for the common "just give me a key" case | Slightly more ceremony for the common case, in exchange for fidelity to the already-audited two-step model | **Recommended**, pending Spec Agent ratification |
| Fold into `APIKEY_ISSUE`'s body as an implicit mint-then-issue (remove/repurpose the `principalId` field) | Viable fit | Medium | assumed | One round trip for the common case | Changes `APIKEY_ISSUE`'s already-approved request contract (a live endpoint's shape, not a new one); makes AC-25a's "grantless" check trivially-always-true within one atomic call, quietly removing an independently-testable precondition that 3 audit rounds (F-053-01 in particular) were built around; forecloses ever pre-provisioning an unissued api_key principal | Ergonomic convenience vs. re-opening an already-audited contract and weakening an independently-verifiable security precondition | Not recommended, but not foreclosed — Spec Agent's call |
| CLI-only (`tovu api-keys create-principal`), no HTTP route | Weak fit | Low | analogical | Matches REQ-13's existing "local shell == owner" trust boundary framing | `apikey.manage` is explicitly grantable to `admin`, not just `owner` (REQ-09) — a CLI-only path would mean a non-owner admin holding `apikey.manage` over HTTP has no way to exercise it, silently narrowing an already-granted permission | Contradicts REQ-09's own admin-can-issue-keys design point | Not recommended |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | ease of changing/extending behavior safely | 4 | prior_art | New port slots into the existing 9-port `IdentityRepos` bag with zero shape changes elsewhere; `api-key-service.ts` is additive, touches no existing transition | Adding a future field to `ApiKeyRecord` (e.g. a `frozenPolicyId` FK, see CIC U-002's Design Context) means touching type+port+two adapters+schema, the same fan-out every existing identity record already has | This is the accepted, already-paid-for fan-out cost of the repo-port pattern this whole library uses; not a new liability | Assumes no near-term need for a second `ApiKeyRepoPort` adapter beyond memory/SQLite | `always-on` | — | If a third persistence backend is ever needed | vs. raw-SQL-in-service (runner-up A2): +2, since that pattern has zero contract-test seam |
| modularity | clean partition into stable, isolated boundaries | 5 | prior_art | New file (`api-key-service.ts`) is a clean addition beside `grant-service.ts`/`admin-crud-service.ts`, reusing their exported helpers rather than duplicating logic | None significant | Matches the file-per-concern split this library already uses (auth vs. grants vs. admin-CRUD vs. api-keys) | — | `always-on` | — | If a future feature needs to import from `api-key-service.ts` internals rather than `index.ts` | N/A — no credible runner-up scored lower here |
| scalability | handles growth in load/data/org scale | 4 | analogical | Indexed exact-hash lookup (mirrors `sessions.findByTokenHash`) is O(1) regardless of key count; no N+1 risk in the issuance path (bounded by requested `policyIds.length`, same bound `identity/INFO.md` already documents for the whole library) | `revokeApiKey`'s `principalPolicies.listByPrincipalId` scan (CIC U-002) is O(1) only because the grantless-issuance invariant caps it at exactly one row — if that invariant is ever weakened this becomes a hidden assumption | Same operator-managed-roster scale assumption every other identity function in this codebase already makes (see `identity/INFO.md`) | Assumes the workspace-scoped roster stays small (tens to low hundreds of principals/keys), consistent with the local-first, single-site topology (ADR-021 context) | `always-on` | — | If Tovu ever serves a workspace with thousands of live API keys | vs. HMAC-pepper runner-up: even; scalability wasn't the differentiator there |
| reliability | fault tolerance, safe degradation, recovery | 3 | analogical | Revocation is immediate and idempotent (mirrors `LOGOUT`'s accepted precedent) | U-002's derived-not-stored frozen-policy relationship (CIC) is a real fragility: a bug elsewhere that ever violates the grantless-issuance invariant turns `revokeApiKey` into an ambiguous operation | Mitigated by CIC U-002-B2's mandatory exactly-one assertion (fail loud, never guess), not by preventing the underlying fragility | Assumes single-connection, single-event-loop execution (this codebase's stated "atomic by construction" convention) stays true; a future multi-connection deployment would need to revisit U-002-B3 | `always-on` | Add an explicit `frozenPolicyId` column to `api_keys` (spec amendment) — Owner: Leon Aburime / Spec Agent — Enforcement: code review flags any `revokeApiKey` change that doesn't re-verify the assertion — Deadline/trigger: before any multi-connection-write deployment | If SQLite is ever replaced by a server engine with real concurrent writers | vs. a design with a stored `frozenPolicyId` (not built, scope discipline — see Complexity Justification): would score 4, but the field isn't state.spec-authorized |
| security | secure boundaries, access control, secrets, attack surface | 4 | prior_art + analogical | Directly extends an already-5-round-audited design (F-052..F-054); hashing choice matches threat model precisely; two `ESCALATE_SECURITY`/`ESCALATE_IRREVERSIBLE`-marked CIC units capture the two places a competent-but-rushed implementer could silently break an audited invariant | No fresh Red-Team/audit pass has run over this specific plumbing yet (only over the security *design* it implements) | This ADR is architecture for already-approved security semantics, not new security design — but "implements correctly" is exactly the gap a fresh audit pass should verify | Assumes TDD encodes CIC U-001/U-002's binding constraints as real tests before Programmer starts (Article II) | `always-on` | Weak axis mitigation: require a Red-Team/`/audit-work` pass over the built plumbing before it ships to any non-local environment — Owner: Coordinator — Enforcement: gate in `tasks.md`/pipeline-state — Deadline/trigger: before ADR status moves PROPOSED → ACCEPTED-and-implemented | Any future change to `issueApiKey`/`revokeApiKey` | vs. argon2id-reuse runner-up: +2 (that option actively degrades the "authenticates identically to a session" security-adjacent performance expectation) |
| operability | ease of deploy/monitor/debug/rollback | 3 | assumed | New table is additive-only (no destructive migration); no new operational surface (no queue, no external service) | No structured logging/`correlationId` on this surface yet (pre-existing gap, Article VIII exception carried, not newly introduced) | Matches this codebase's current, disclosed observability baseline for the whole identity admin surface | Assumes no near-term requirement to add per-endpoint metrics beyond what already exists (none) | `always-on` | — | If Article VIII's identity-wide observability gap is ever remediated | vs. runner-ups: even; none scored differently here |
| cost | total ownership cost, infra + operational | 5 | prior_art | Zero new infrastructure, zero new dependency, one small additive table | None | SQLite + Drizzle already selected (ADR-015); no cost driver changes | — | `always-on` | — | N/A | vs. HMAC-pepper (would need secret-custody infra): +1 |
| testability | supports unit/integration/contract/system verification | 4 | prior_art | Mirrors an already-tested pattern (`repo.contract.test.ts`, HTTP integration tests for the other 17 identity admin routes); CIC artifact gives TDD explicit, observable verification surfaces for the two riskiest units | `CREATE_PRINCIPAL`'s route is contingent/blocked, so its integration test cannot be written until Spec Agent ratifies the shape | Deliberate — better to block one contingent test than guess a contract and have to rewrite it | — | `always-on` | — | N/A | vs. fold-into-APIKEY_ISSUE runner-up: even on testability, but that option scored worse on security (weakens an independently-testable precondition) |

## Overall Strengths

- This design adds almost no new architectural vocabulary — every seam (repo port, ordinary core function, HTTP route registrar, typed server module) is a direct, mechanical extension of a pattern this exact codebase already uses nine-to-seventeen times over.
- The one place a genuinely new decision was needed (key-hashing primitive) is answered by an already-implemented, already-accepted analogy in the same codebase, not a fresh library evaluation.

## Overall Weaknesses

- `revokeApiKey`'s frozen-policy retirement (CIC U-002) is inherently fragile because `ApiKeyRecord`'s spec-defined shape carries no explicit pointer to its frozen policy — this ADR does not fix that (out of architecture's scope to unilaterally add a field to an approved entity contract) and instead compensates with a mandatory runtime assertion (U-002-B2).
- This ADR cannot be fully implemented as-is: `CREATE_PRINCIPAL`'s HTTP surface is genuinely blocked on a Spec Agent decision, so the Programmer will hit a real wall on that one file even after this ADR is approved.

## Tradeoff Tension

We are trading "ship everything in one pass" for spec integrity: `CREATE_PRINCIPAL`'s contract shape is left for Spec Agent to ratify rather than guessed, even though that means this ADR does not fully unblock the Programmer's original escalation in one step.

## Why This Won

Every other viable alternative considered (raw-SQL persistence, a unified credential port, argon2id reuse, an HMAC pepper, or unilaterally picking `CREATE_PRINCIPAL`'s HTTP shape) either reintroduces a Constitution exception this codebase has no reason to accept, mismatches a threat model this codebase has already correctly modeled once (session tokens), or oversteps architecture's boundary into spec ownership on a decision that materially affects an already-audited security precondition (AC-25a). The selected design is the one that changes nothing about SPEC-006's already-accepted security semantics while giving the Programmer everything needed except the one piece that is genuinely not architecture's call to make.

## Runner-Up Comparison

- Runner-up: argon2id reuse for key hashing (zero new code) combined with unilaterally picking the fold-into-`APIKEY_ISSUE` shape for `CREATE_PRINCIPAL` (fewer files, one round trip).
- Why it lost: the hashing runner-up directly contradicts REQ-08's stated performance parity between key and session auth; the API-shape runner-up would quietly collapse AC-25a's independently-testable "grantless" precondition into a same-request tautology, removing test surface that three audit rounds were specifically built around (F-053-01). Both runner-ups optimize for less work now at the cost of a real, if narrow, design regression.

## Consequences

**Positive:**
- `APIKEY_ISSUE`/`APIKEY_REVOKE` become implementable against a concrete, contract-tested port instead of a Programmer having to invent schema/port shape mid-implementation.
- The hashing-primitive question is resolved with a clear, written justification that will prevent a future feature from reaching for argon2id "because that's the pattern" for a different machine credential (see Governance ADR promotion below).
- The two riskiest units in this slice (issuance ordering, revocation derivation) have explicit, testable Binding constraints before any code exists, per Article II.

**Negative / Tradeoffs:**
- `CREATE_PRINCIPAL` remains unbuildable until Spec Agent resolves Decision 3 — the Programmer's original escalation is only partially unblocked by this ADR.
- `api_keys` carries a design fragility (U-002) that a future spec amendment (adding `frozenPolicyId`) would remove; this ADR documents rather than fixes it, since fixing it means changing an approved entity contract.

**Risks:**
- Risk: implementation proceeds on `issueApiKey`/`revokeApiKey` without TDD encoding CIC U-001/U-002 as real tests → plan: Coordinator's combined Design Readiness gate blocks `tasks.md` generation without this artifact's path recorded, and Programmer's pre-code checklist must confirm both units before writing code (see critical-internal-constraints.md workflow).
- Risk: a future feature adds a different machine credential (webhook signing secret, personal access token) and defaults to argon2id "because that's this codebase's hashing pattern" → plan: promote the hashing-primitive rule to a Governance ADR (see below) so it's discoverable independent of this feature.
- Risk: no fresh Red-Team/`/audit-work` pass runs over this specific plumbing before it ships → plan: recorded explicitly in Planning Preflight Evidence and Security scorecare mitigation above; Coordinator should not treat this ADR's approval as a substitute for that pass.

## Mitigations Required

- Weak axis: reliability (score 3)
  - Mitigation: `revokeApiKey` must implement CIC U-002-B2's exactly-one-row assertion; consider a future spec amendment adding `api_keys.frozenPolicyId` to remove the fragility structurally.
  - Owner: Programmer (assertion) / Leon Aburime + Spec Agent (schema amendment, optional/future)
  - Enforcement: Code Review checks the assertion exists; CIC deviation protocol governs any attempt to skip it.
  - Deadline or trigger: assertion is required at initial implementation; schema amendment is opportunistic, no fixed deadline.
- Weak axis: operability (score 3)
  - Mitigation: none new required beyond the pre-existing, disclosed Article VIII gap this whole identity surface already carries.
  - Owner: N/A (carried exception)
  - Enforcement: N/A
  - Deadline or trigger: whenever Article VIII is remediated identity-wide, not scoped to this ADR.

## Re-evaluation Triggers

- Calendar trigger: none fixed; re-evaluate if SPEC-006 amends `ApiKeyRecord`'s shape.
- Scale trigger: if a single workspace's live API-key count grows beyond the "operator-managed roster" scale this whole library assumes (`identity/INFO.md`), re-evaluate `revokeApiKey`'s O(1)-assuming derivation.
- Topology trigger: if this codebase ever moves off single-connection/single-event-loop SQLite writes (e.g. a Postgres adapter with real concurrent writers), re-evaluate CIC U-002-B3's ordering constraint and its audit-only verification surface.
- Dependency trigger: if a KMS/secrets-manager primitive is ever added to this codebase for an unrelated reason, re-evaluate the rejected HMAC-pepper option for API-key hashing (Pattern Evaluation B).

## Module / Service Boundaries

```
src/identity/
  types.ts              # + ApiKeyRecord
  ports.ts               # + ApiKeyRepoPort, IdentityRepos.apiKeys
  token-crypto.ts         # NEW — shared hashOpaqueToken/newOpaqueSecret (SHA-256/randomBytes)
  api-key-service.ts      # NEW — createPrincipal / issueApiKey / revokeApiKey / validateApiKey
  repo.memory.ts          # + InMemoryApiKeyRepo
  repo.sqlite.ts          # + SqliteApiKeyRepo
  wiring.ts               # + apiKeyRepo threaded through both composition helpers
  index.ts                # + barrel re-exports

src/infra/db/schema.ts     # + apiKeys sqliteTable (Database Agent reviews)

src/server/
  routes/types.ts          # + RouteDeps.apiKeyRepo
  middleware/dev-auth.ts   # currentPrincipal gains an API-key branch
  routes/admin/api-keys/   # NEW — deps.ts, issue.ts, revoke.ts, (create-principal.ts contingent)
  modules/api-keys.ts      # NEW — createApiKeysModule (ADR-046 Phase 3 convention)
  app.ts, deps.ts          # both composition roots wire apiKeyRepo + createApiKeysModule
```

Full contract-level detail (inputs/outputs/errors/test seams) lives in `implementation-outline.md`; this section states the boundary shape only.

## API / Event Contract Summary

- `ApiKeyRepoPort` — `findById`, `findByKeyHash`, `listByPrincipalId`, `save`, `revoke` — defined in `identity/ports.ts`, implemented by `InMemoryApiKeyRepo`/`SqliteApiKeyRepo`.
- `createPrincipal` / `issueApiKey` / `revokeApiKey` / `validateApiKey` — exported core functions from `identity/api-key-service.ts`, consumed by the new HTTP routes and by `dev-auth.ts`.
- HTTP: `POST /api/admin/v1/api-keys` (`APIKEY_ISSUE`), `POST /api/admin/v1/api-keys/:id/revoke` (`APIKEY_REVOKE`) — both per api.spec.md §1/§4/§5/§6, using the *real* `/api/admin/v1/...` path prefix this codebase's other auth routes actually use (see Risks: api.spec.md §1's literal `/admin/api/...` string is stale relative to the working code, matching the same drift class §1a's own 0.6.0 note already disclosed and repaired for the users/roles/policies rows — recommended for the same Spec Agent follow-up pass as Decision 3, not re-litigated here).
- `CREATE_PRINCIPAL` HTTP contract: **not defined by this ADR** — see Decision 3.

## Enforcement

- Code Review Agent must flag any new `PasswordHasherPort`-shaped abstraction introduced for key hashing (Article IV — this ADR's Decision 2 is binding: ordinary code, no port).
- Code Review Agent must confirm `api-key-service.ts` calls `grant-service.ts`'s exported `assertCallerHasAnyPermission`/`assertGrantClamp`/`authorizeDepsFrom` rather than re-implementing the caller-permission gate or the INV-07 clamp.
- Architecture Audit (Programmer, pre-handoff) must confirm every Binding constraint in `critical-internal-constraints.md` (U-001, U-002) against the actual implementation before marking this slice complete.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| VII — Spec Integrity | `CREATE_PRINCIPAL` genuinely has no ratified HTTP contract; inventing one here would be architecture silently amending an approved spec's own endpoint registry | Unilaterally pick the "separate endpoint" shape and proceed | Would foreclose Spec Agent's ability to choose the fold-in shape instead, and would mean Programmer builds against a contract that was never actually approved through the spec-integrity gate this codebase's Shared Rules require (`[NEEDS CLARIFICATION]` blocks Software Architect dispatch — the honest move is to surface it, not route around it because a human dispatched this ADR anyway) |
| VIII — Observability | Carried, pre-existing exception across the entire identity admin surface (no `correlationId`, unstructured error envelope) | Add structured observability to just this slice | Would create an inconsistent observability posture within the same feature (17 existing identity admin routes have the old envelope, 2-3 new ones would have a different one) — a whole-feature remediation is the right unit of work, not a per-endpoint patch |

## Related Decisions

- Extends: ADR-021 (identity & authorization — this ADR fills the "API keys are in v1" gap ADR-021 §7/§9 named but deferred)
- Relates to: ADR-006 (rule-of-two), ADR-046 (typed server modules — `createApiKeysModule` follows its Phase 3 convention)
- Supersedes: N/A

---

## Required Decisions (per the Coordinator dispatch)

### 1. `api_keys` schema/migration ownership

**Decision: produce the schema design here (Software Architect), recommend a lightweight Database Agent verification-and-migration-generation pass as the next step — not a from-scratch Database Agent design dispatch.**

Justification for doing the design here: SPEC-006's `state.spec.md` §2 already fully specifies the `ApiKey` entity's field list, types, and nullability (`id`, `workspaceId`, `principalId`, `label`, `keyHash`, `prefix`, `lastUsedAt?`, `expiresAt?`, `revokedAt?`) — there is no open normalization, cardinality, or ERD question left for a Database Agent to resolve from scratch. The physical schema is a direct, mechanical transcription into this codebase's single established Drizzle convention (`src/infra/db/schema.ts`, one file, no per-table SQL FK constraints — composite `(workspace_id, id)` scoping is enforced at the application layer for every one of the 9 sibling identity tables today, confirmed by reading `schema.ts` lines 629-738: none of `principals`/`sessions`/`roles`/`policies`/etc. carry a `.references()` call). Producing this design as part of the ADR is the "small enough to justify doing both here" case the dispatch context named.

Proposed table (transcribed from state.spec §2, matching the exact Drizzle idiom of the 9 sibling tables):

```ts
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    principalId: text("principal_id").notNull(),
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    lastUsedAt: text("last_used_at"),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("idx_api_keys_workspace_key_hash").on(table.workspaceId, table.keyHash),
    index("idx_api_keys_workspace_principal").on(table.workspaceId, table.principalId),
  ]
);
```

- The `(workspaceId, keyHash)` unique index mirrors `sessions`' existing `idx_sessions_workspace_token_hash` exactly — `validateApiKey` (C-007) looks up by exact hash equality, the same pattern `SessionRepoPort.findByTokenHash` already uses and this codebase's audits have already accepted.
- The `(workspaceId, principalId)` index mirrors `principal_policies`'/`principal_roles`' existing indexes — supports `revokeApiKey`'s derivation (CIC U-002) and any future "list this principal's keys" admin surface.
- No SQL-level FK to `principals`/`policies` — matches every sibling table's existing, accepted convention (composite-key referential integrity is enforced at the application layer, not the DB layer, throughout this library).

**Recommended next step: dispatch Database Agent for a narrow, bounded task** — (a) ratify or refine the index choices above against the two concrete query patterns this ADR names (`findByKeyHash`, `listByPrincipalId`), (b) run `npm run db:generate` to produce the actual migration file under `src/infra/drizzle/`, (c) confirm no lock-duration concern exists (trivial — this is a brand-new, empty table; additive migration, zero rows to migrate). This is explicitly **not** a request to redesign the logical model, which SPEC-006 already owns.

### 2. Key-hashing primitive

**Decision: SHA-256 (`node:crypto` `createHash("sha256")`) over a high-entropy random secret (`crypto.randomBytes(32)`), as ordinary code — not a new port, not argon2id.**

Justification (full comparison in Pattern Evaluation §B above): argon2id's deliberate memory/time cost exists to slow down an attacker guessing a *low-entropy, human-chosen* secret from its hash — the correct model for `users.passwordHash`. An API key is a *machine-generated, high-entropy* secret (256 bits of randomness); nobody brute-forces it from its hash, because guessing it is already computationally infeasible before hashing enters the picture at all. Applying argon2id here would tax every legitimate request (tens of milliseconds of deliberate memory-hard computation) for zero security benefit, directly contradicting REQ-08's own stated expectation that a key "authenticates identically to a session" — and session tokens in this exact codebase already use plain SHA-256 (`auth-service.ts`'s `hashToken`), which has already passed this feature's own multi-round security audits. This is not a novel choice; it is applying an already-accepted pattern to a structurally identical new case (comparable to how GitHub/Stripe-style API keys are implemented: store only a hash of a high-entropy random value, compare on each request, show the raw value exactly once at issuance).

Concretely: `newOpaqueSecret()` generates the raw key; `prefix` (state.spec §2's own field) is a non-secret, human-displayable slice of the raw key (e.g. first ~12 characters) shown forever in an admin UI so an operator can recognize which key is which without ever re-displaying the secret; `keyHash` is the SHA-256 hex digest of the *entire* raw key, looked up via exact equality (mirrors `sessions.findByTokenHash`, already-accepted). Both `hashOpaqueToken`/`newOpaqueSecret` are extracted from `auth-service.ts`'s existing private `hashToken`/`newRawToken` into a small shared `token-crypto.ts` module so session tokens and API keys share one reviewed implementation rather than two independently-maintained copies of the same two-line crypto pattern (Article III/IV).

This is recommended for **Governance ADR promotion** (see below) since it is a durable rule that should bind any future machine credential this codebase ever adds, not just SPEC-006.

### 3. `CREATE_PRINCIPAL` route/shape

**Decision: route back as `[NEEDS CLARIFICATION]` to Spec Agent — not decided unilaterally here — with an explicit recommendation.**

This is genuinely spec-level, not architecture-level: `api.spec.md`'s Endpoint Registry (§1: 5 rows; §1a: 17 rows) contains zero rows for `CREATE_PRINCIPAL`, despite `state.spec.md` §3 fully specifying it as an independent transition (payload, precondition, state changes, failure handling) since v0.5.1. Whichever shape is chosen is a visible, external API-contract decision — exactly the kind of decision this codebase's Shared Rules reserve for the Spec provider ("`[NEEDS CLARIFICATION]` blocks Software Architect dispatch"; the `api-design` skill's Blocking Gates require the resource model to be explicit before finalizing). Deciding it here would mean Programmer implements against a contract this ADR invented, not one that went through the same approval gate every other SPEC-006 endpoint did.

**Recommendation for Spec Agent's ratification** (Pattern Evaluation §C above has the full comparison): a **separate endpoint**, e.g. `POST /api/admin/v1/api-keys/principals` (or a workspace-scoped path matching §1a's convention — Spec Agent's call), gated by `apikey.manage`, body `{ displayName: string }` (kind is implicitly `'api_key'` — the only value state.spec §3 allows in v1 — reject any other value defensively if the field is ever accepted at all), returning `{ data: { principal: Principal } }` on `201`. This mirrors state.spec's own two-independent-transitions model and keeps AC-25a's "grantless" precondition meaningfully, independently testable (an api_key principal can exist, unissued, and be inspected) — which the alternative (folding minting into `APIKEY_ISSUE`'s body) would quietly collapse into a same-request tautology, removing test surface that the F-053-01 audit finding was specifically built around.

This recommendation is advisory. The `create-principal.ts` route file and its module registration in the Implementation Outline are marked contingent and must not be built until Spec Agent ratifies (or amends) this shape and updates `api.spec.md` + `traceability.spec.md` accordingly — most likely as part of the same amendment wave (a v0.7.0 pass) that gives SPEC-006 its next fresh human checkpoint + Red-Team pass, since v0.6.0 is already DRAFT pending exactly that.

## Database Agent Dispatch Recommendation

**Yes, recommended** — narrow scope only: verify/refine the two named indexes against the two named query patterns, and run `npm run db:generate` to produce the real migration file. Not a from-scratch schema design dispatch (see Decision 1's justification).

## Constraints Acknowledgment

- No production code was written as part of this ADR. All artifacts produced (`adr.md`, `implementation-outline.md`, `critical-internal-constraints.md`, the `reports/architecture/ADR-048-...md` mirror, and the proposed Governance ADR) are architecture/decision records only.
- This ADR designates at least one `ESCALATE_SECURITY` unit (U-001, the `issueApiKey` validation/snapshot ordering) and one unit carrying both `ESCALATE_SECURITY` and `ESCALATE_IRREVERSIBLE` markers (U-002, the `revokeApiKey` frozen-policy retirement) — see `critical-internal-constraints.md`. Per the Critical Internal Constraints skill, any deviation from these Binding constraints requires a recorded `[CIC_DEVIATION_APPROVED]` entry before implementation.
- **This ADR requires human architecture sign-off before implementation proceeds.** Status is `PROPOSED`, not `ACCEPTED`. In addition, `CREATE_PRINCIPAL`'s contract must clear Spec Agent ratification (Decision 3) before its route file can be built at all, and this whole slice should get a Red-Team/`/audit-work` pass over the *implementation* (not just this design) before it reaches any non-local environment, per the Security scorecard mitigation above.
