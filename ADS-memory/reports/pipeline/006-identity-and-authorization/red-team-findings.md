# Red-Team Findings: identity-and-authorization

- Feature: FEAT-006-identity-and-authorization
- Spec version: 0.4.1
- Spec hash: sha256:cf1a7376b198c66f98a49b89591469706fa8b023dff351bfc658fbc277850c3f
- Red-Team completed: 2026-07-08T17:36:56Z
- Red-Team agent: Claude Opus 4.8 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this session)
- Package read: feature.spec · api.spec · behavior.spec · state.spec · errors.spec · traceability.spec · spec-manifest + constitution.md
- Sequencing note: run on the **DRAFT** v0.4.1 per this project's pipeline (Red-Team → human DRAFT→APPROVED checkpoint), i.e. ahead of the human approval the persona's default assumes.
- Finding count: 1 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG

**Frame.** The security *core* — the `authorize()` matcher, fail-closed precedence, the INV-07
unconstrained-hold issuance clamp, composite `(workspace_id, id)` FKs, hash-only secrets — has been
through four design-audit rounds (TM-AUTHZ-01) and two package-audit rounds (TM-SPEC006-PKG-01) and
is clean. I did not re-litigate it. Every finding below is at an **operational / lifecycle / scope
edge** the design audits under-weighted: how non-HTTP callers authenticate, which lifecycle
transitions exist, and which controls the downstream contracts invented without a requirement anchor.

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. 1 BLOCKING (< 3 — a targeted Spec-Agent fix clears it; no systemic route-back).

### RT-001
- Severity: BLOCKING
- Category: contradiction / missing-failure-mode
- Location: REQ-05 + INV-04 ("every gateway mutation") vs state.spec §3 Surface note (user/role/policy creation, `DISABLE_PRINCIPAL`, `WRITE_POLICY_PERMISSION` are "core/CLI operations in v1") vs api.spec §1 (CLI surface) vs Overview ("replace the Article VI dev-only exception")
- Description: This spec **removes** the standing Article VI local-dev no-auth exception for mutations — REQ-05 gates *every* gateway mutation through `authorize(principalId, …)` and INV-04 makes it exactly-one-per-mutation. But `authorize()` requires a resolved `principalId`, and the **only** credential mechanisms the package specifies are HTTP-bound: the session cookie (`AUTH_LOGIN` → browser) and the `Authorization: ApiKey` header. The `tovu` CLI and any in-process core caller have **no specified way to obtain a principal**. Yet v1 explicitly runs privileged mutations through the CLI/core surface: state.spec §3 lists user/role/policy creation, `DISABLE_PRINCIPAL`, and `WRITE_POLICY_PERMISSION` as core/CLI, and says only that "*where* they run through the gateway they are subject to the same `authorize()` gate" — leaving the acting principal undefined. Because the SPEC-001 gateway is the change-set chokepoint, these CLI mutations **must** flow through it (or they produce no audit trail, breaking the SPEC-001 model), so they **must** hit `authorize()`, so they **must** carry a principal. The spec closes the exception the CLI relied on without issuing the CLI its replacement credential. This is Architect-blocking: `authorize()` cannot be wired into CLI/core mutations without a defined principal-resolution rule, and the choice is security-load-bearing (if the answer is "local CLI runs as `owner`/`system`," that grants full or wildcard authority — including INV-07-unclamped key minting — to anyone with local shell/filesystem access, which must be a stated, deliberate decision, not an implementation accident).
- Suggested resolution: Add a REQ (and one AC) pinning how non-HTTP callers authenticate to the gateway in v1. Options for the Spec Agent to choose and state explicitly: (a) a defined **local-operator principal** the CLI runs as (e.g. the seeded `owner`, or a dedicated `system`-kind CLI principal) with the trust assumption written down ("local shell ⇒ this principal's authority") and its interaction with INV-07 noted; or (b) a CLI-presented API key / token, reusing the existing credential path; or (c) a narrow, **explicit** carry-over of the Article VI exception for local CLI mutations only, recorded the way SPEC-001…005 record theirs — but note the Overview currently claims this spec *retires* that exception, so (c) needs the Overview reconciled. Whichever is chosen, `GATEWAY_STAMP_ACTOR` (state.spec §3) then has a defined `actorId` for CLI writes, and EC-01's `system`-attribution rule extends coherently.

---

## ADVISORY Findings

Spec Agent and human are informed. Human decides whether to revise or accept risk. Pipeline can advance if no BLOCKING findings remain.

### RT-002
- Severity: ADVISORY
- Category: scope-creep / untestable
- Location: feature.spec Requirements + Acceptance Criteria (no rate-limit REQ/AC) vs api.spec §3 (`LOGIN_STRICT`/`WRITE_STANDARD`/`READ_STANDARD`) + behavior.spec §4 + §7 + errors.spec `RATE_LIMIT_EXCEEDED` + traceability §4/§5
- Description: Rate limiting is a **security control with concrete thresholds** (10/60s login brute-force guard, 30/60s write, 300/60s read, specific burst/keying) specified across four downstream files and given an error code and a "Test Required? Yes" behavior row — yet it traces to **no REQ and no AC** in feature.spec. traceability §7 ("Untraced Requirements") is asserted empty and the completeness checklist claims all controls trace to a requirement, but rate limiting is anchored only to a behavior-rule/error-code row, never to a requirement or acceptance criterion. Consequences: (a) Article III (every endpoint/control traces to a present requirement) is technically violated; (b) Article II (Test-First, NON-NEGOTIABLE) has a security threshold with no AC for the TDD Agent to certify — the login brute-force guard, arguably the most security-relevant limit in the feature, has no Given/When/Then contract; (c) the thresholds are un-owned and can drift silently. Sub-risk worth capturing in the same fix: `LOGIN_STRICT` is keyed by `ip`, but Tovu-Runner is a desktop host and any proxied deployment collapses all clients to one source IP → either a global login lockout after 10 attempts or trivial bypass via a spoofed forwarding header; the client-IP resolution / trusted-proxy rule is unspecified.
- Suggested resolution: Add `REQ-13` (rate limiting: the three profiles, their purpose, `RATE_LIMIT_EXCEEDED` mapping, and the client-IP resolution rule for `LOGIN_STRICT`) and at least one P1 AC (e.g. "11th login in 60s from one source → 429 `RATE_LIMIT_EXCEEDED` with `retryAfterSeconds`"), then add the row to traceability §1. Alternatively, if rate limiting is meant to be deferred, move it to an OQ and out of api/behavior/errors — but given it's a live brute-force guard on the auth surface, anchoring it in v1 is the safer call. Low design risk (the contracts already exist); this is a traceability/testability closure.

### RT-003
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: state.spec §3 Action Catalog vs api.spec §4 (`APIKEY_ISSUE` body `principalId` required) + behavior.spec §5.2 (references "user-creation")
- Description: Several v1-in-scope **creation transitions are unmodeled**. (1) `APIKEY_ISSUE` requires an existing `kind='api_key'` `principalId` in its body, but **no action creates a `kind='api_key'` principal** — the Action Catalog has SEED, LOGIN/LOGOUT, DISABLE, ISSUE/REVOKE key, WRITE_POLICY_PERMISSION, ATTACH_TO_BUILTIN, and GATEWAY_STAMP, but nothing that mints the principal a key binds to, so the issuance endpoint's precondition can never be satisfied by any specified operation. (2) behavior.spec §5.2 defines `RESOURCE_CONFLICT` handling for a duplicate `username` on "user-creation," and state.spec §3's surface note calls user/role/policy creation a v1 core/CLI operation — but **no `CREATE_USER` (or create-role/create-policy) transition exists** with a precondition, authorizing permission, and before/after state. So the operations that produce the very rows the rest of the spec authorizes over are undefined. This is the seam where `member.manage` / `user.manage` (catalog permissions with no AC — see RT-005) would actually be exercised.
- Suggested resolution: Add the missing transitions to state.spec §3 — at minimum `CREATE_PRINCIPAL` (parameterized by `kind`, covering the api_key-principal case), `CREATE_USER` (precondition: caller holds `user.manage`/`member.manage`; failure: duplicate `username` → `RESOURCE_CONFLICT`), and create-role/create-policy — each with its authorizing permission. This also gives RT-005's disable gate a symmetric create gate and lets traceability tie `member.manage`/`user.manage` to a transition.

### RT-004
- Severity: ADVISORY
- Category: ambiguity / untestable
- Location: REQ-06 ("expired … → 401") vs behavior.spec §4 ("Session lifetime: `expires_at` set at creation (default 30 days sliding not required in v1; absolute)") vs state.spec §2 (`Session.expiresAt` non-nullable) — and the AC/EC set
- Description: The **absolute session lifetime is not pinned**. The behavior §4 parenthetical is self-tangling ("default 30 days sliding not required in v1; absolute") and no REQ or AC states the concrete v1 lifetime; meanwhile `Session.expiresAt` is a required (non-null) field, so *some* value must be chosen at creation, yet the spec never says what. Separately, the **expired-session → 401 path has no AC and no EC**: REQ-06 asserts it, but AC-05/EC-02 test only the *disabled*-principal path, and EC-05 tests concurrent/ revoked sessions — nothing exercises a session that is valid-but-past-`expires_at`. So a first-class REQ-06 behavior is both under-specified (duration) and uncertified (no test hook).
- Suggested resolution: State the v1 absolute session lifetime as a concrete value in behavior §4 (and/or a REQ) — e.g. "absolute expiry N days from creation; sliding renewal deferred (OQ-04)" — and rewrite the parenthetical to be unambiguous. Add an EC (and ideally a P2 AC) for "session past `expires_at` → 401 on next request; row treated as revoked," mirroring EC-02.

### RT-005
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: state.spec §3 `DISABLE_PRINCIPAL` precondition ("exact gate to be pinned at Architect stage") + REQ-11 + INV-02
- Description: Principal disabling is the model's kill-switch (AC-05: it immediately invalidates every session and key), yet its **authorization is doubly under-specified**. (1) The gating permission is explicitly left open — state.spec defers `user.manage` (owner-only) vs `member.manage` "to the Architect stage" — so *who can disable whom* is undefined, and there is **no AC** covering disable authorization at all. (2) More seriously, **no invariant guards against lockout or privilege inversion**: nothing prevents disabling the **last active `owner`** (which bricks the site — built-ins are immutable per INV-06 and only `owner` holds `*`/`user.manage`, so no one could ever re-enable anyone or grant new authority), nothing prevents **self-disable** lockout, and if `member.manage` ends up gating disable, a lower-authority principal could disable a **higher-authority** one (there is no role hierarchy in `authorize()` — it is flat set-membership). Because disabling is irreversible-without-a-still-privileged-actor, a single wrong disable can be unrecoverable.
- Suggested resolution: Pin the disable gate in the Requirements (not just "at Architect stage"), and add an invariant + AC: "the last `active` principal holding the owner `*` grant cannot be disabled" (and consider forbidding self-disable), so the site cannot be locked out. If `member.manage` is allowed to disable, state the authority-ordering rule that prevents disabling a principal that holds permissions the caller lacks. This pairs with RT-003's create gate for a coherent principal-lifecycle authorization story.

---

## CONSTITUTION_FLAG Findings

Likely to require a constitution exception. Flagged for Architect awareness so Complexity Justification entries can be prepared proactively. Does not block Software Architect dispatch on its own.

### RT-006
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article I — Library-First
- Location: feature.spec Constitution Compliance (Article I row cites only `argon2`) vs REQ-06 (server-side session store + secure-cookie lifecycle) + api.spec §3 / behavior §4 (rate limiter)
- Description: The Article I row justifies only the hashing library (`argon2` behind `HasherPort`) and persistence (ADR-015 Drizzle). But this feature also hand-rolls **two subsystems a maintained library typically solves**: (a) a server-side **session store + secure-cookie lifecycle** (creation, `token_hash`, expiry/revoke, `HttpOnly`/`SameSite=Strict`/`Secure`, multi-session invalidation) — the space of Lucia/oslo-style session libraries; and (b) a **rate limiter** (fixed-window w/ burst + keying) — the space of `express-rate-limit`/`rate-limiter-flexible` and friends. Neither has a build-vs-adopt entry. Given the security-boundary nature of session handling, "own it deliberately" may well be the right call — but under Article I that must be a *recorded, conscious* choice, not the current silent default.
- Architect note: Prepare Complexity Justification rows for the session store and the rate limiter — either name and adopt a library, or record the specific reason for owning each (e.g. security-boundary ownership, dependency-surface minimization, the ADR-020 admin-origin cookie coupling). This dovetails with RT-002: if a rate-limit library is adopted, its config *is* the REQ-13 threshold contract.

---

## Routing Decision

`1` BLOCKING finding (RT-001). **Route back to the Spec Agent for one targeted revision** — pin how non-HTTP (CLI/core) callers authenticate to the gateway so REQ-05's "every mutation is authorized" is actually realizable for the v1 CLI/core operations state.spec already puts in scope. This is a single, well-bounded addition (one REQ + one AC + a `GATEWAY_STAMP_ACTOR`/EC-01 tie-in), not a systemic quality problem, so no full route-back.

Recommended to fold into the same revision pass (cheap, same files, closes the traceability/testability holes before the human checkpoint):
- **RT-002** — add `REQ-13` + AC for rate limiting (and the `LOGIN_STRICT` client-IP rule).
- **RT-003** — model the missing creation transitions in state.spec §3.
- **RT-004** — pin the session lifetime + add the expired-session EC/AC.
- **RT-005** — pin the disable gate + add the last-owner lockout invariant/AC.

ADVISORY and CONSTITUTION_FLAG findings carry into Software Architect context regardless. **RT-006** (Article I session-store + rate-limiter build-vs-adopt) should anchor the ADR-021 Complexity Justification and is coupled to RT-002's resolution.

**Human checkpoint:** these findings are surfaced *before* the DRAFT→APPROVED flip (per this project's Red-Team→checkpoint sequencing). Recommendation: resolve RT-001 (BLOCKING) before approval; RT-002…005 are strongly recommended and low-risk (downstream/contract edits, the four-round-audited design core is untouched by any of them); RT-006 is Architect-facing and needs no spec edit. None of the six touches the `authorize()`/INV-07/composite-FK security core.
