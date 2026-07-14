# ADR-PIPE-010: Forms (Contact Form, Tier-1 Sample) — Implementation Architecture

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Red-Team has NOT run for SPEC-010 — accepted with that acknowledged gap; the shared-file convergence risk with Integrations' `server/app.ts`/`routes/types.ts` edits must be sequenced, not parallelized, at task-generation time)
- Date: 2026-07-13
- Spec: SPEC-010 v1.0.0 (hash: sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e)
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. The `FORMS_SUBMIT` rate limit reuses the existing generic `createRateLimiter`/`resolveClientIp` primitive already built for `LOGIN_STRICT` (`src/server/middleware/rate-limit.ts`) instead of a new hand-rolled limiter — a reuse this spec's own Article I note didn't anticipate finding (see Pattern Evaluation). Field-vocabulary validation and honeypot checking are closed-enum/single-key checks with no library gap. |
| II — Test-First | COMPLIES | No implementation exists yet; TDD Agent certifies failing tests from SPEC-010's ACs/INVs/ECs before the Programmer writes code. |
| III — Simplicity Gate | COMPLIES | Every new module traces to a REQ (see Module/Service Boundaries). No form-builder UI, no CAPTCHA, no multi-step logic, no generic `entries` migration — all explicitly out of scope per `feature.spec.md`. |
| IV — Anti-Abstraction Gate | COMPLIES | Forms introduces exactly one new rule-of-two port pair (`FormDefinitionRepoPort`, `FormSubmissionRepoPort` — memory + SQLite, matching every other core-owned-table feature in this repo). It adds zero new webhook-dispatch or mail-transport ports — it consumes `MailerPort` (ADR-037) and the outbox/webhook-fanout mechanism (ADR-036/ADR-009) by handle. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is verified at a real HTTP boundary: the public `POST /forms/:slug/submit` route or the `/api/admin/v1/workspaces/:workspaceId/forms/**` admin routes. |
| VI — Security-by-Default | EXCEPTION (standing v1, per Constitution Art. VI) | Same standing dev-server no-auth-layer exception every prior spec carries. All seven admin routes are `authorize()`-gated per `api.spec.md` §2; the public submission route is intentionally unauthenticated by design (REQ-05), not an instance of the standing gap. `source_ip` is stored raw (OQ-03 resolved below) — admin-only visibility, never exposed on a public route, permanently deletable per REQ-14. |
| VII — Spec Integrity | COMPLIES | This ADR and all downstream artifacts cite SPEC-010 v1.0.0, hash `sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e`. |
| VIII — Observability | COMPLIES | Every write path emits a structured error (`errors.spec.md` §2) on failure; `form.submission.received` carries `workspaceId`/`formDefinitionId`/`submissionId` as its correlation identifiers, matching the deferred-`correlationId` pattern already used elsewhere. |

No unjustified EXCEPTION rows beyond the pre-existing standing Article VI exception. Complexity Justification table is empty.

## Research Summary

- Research artifact: N/A — no library or technology choice is open. Persistence is Drizzle/SQLite (ADR-015, already decided); mail is `MailerPort` (ADR-037, already decided); webhook fan-out is the existing `integrations` subsystem (ADR-036, already decided). The one genuinely open implementation question — how Forms activates as a Tier-1-shaped module when no Tier-1 loader exists (OQ-01) — is a reuse-vs-build/structural-seam decision resolved in Module/Service Boundaries below, not a technology choice.
- Key decision: N/A (see above).

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (`validate_spec_package.py --phase preflight`, exit 0, zero violations, run 2026-07-13 against spec hash `sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e`)
- Spec hash verified at: 2026-07-13 (provider-local validator, `--phase spec --update-hash`)
- Red-Team status and artifact: NOT YET RUN per `pipeline-state.md` (`red_team_status`); `spec-dod.md`'s Coordinator sign-off row is filled and explicitly authorizes Software Architect dispatch, concurring with the OQ-01 plugin-loader-gap finding. No BLOCKING/ADVISORY/CONSTITUTION_FLAG findings exist to consume because no Red-Team pass has run yet — flagged as a process-order observation, not treated as a blocker, since the Coordinator's own sign-off block explicitly authorizes this dispatch.
- System Blueprint status and artifact: Not produced for this feature (no macro-topology change — Forms is a new feature module inside the existing modular-monolith admin server + one new public route, not a new service/deployment boundary).
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/mail/{index,ports,types}.ts`, `src/members/mailer.console.ts`, `src/integrations/{index,ports,delivery,types}.ts`, `src/core/ports.ts`, `src/core/commands/command.ts`, `src/core/events/{outbox-worker,memory-bus}.ts`, `src/server/app.ts`, `src/server/routes/types.ts`, `src/server/middleware/rate-limit.ts`, `src/infra/db/schema.ts`, `src/features/plugins/{data-module.ts,store/store-plugin.ts}`, `src/index.ts`, `src/identity/permissions.ts`, and one representative admin route (`src/server/routes/admin/posts/create.ts`) to ground module boundaries, wiring points, and reuse opportunities in actual repo precedent rather than inventing structure.
- Reverse-spec artifacts consumed: None (SPEC-010 is greenfield for its own surface per spec-manifest.md).
- Validator result or waiver: PASS, no waiver needed (python3 available).

## Context

SPEC-010 needs to become buildable tasks. Three governing ADRs (ADR-024, ADR-037, ADR-036) already carry the load-bearing decisions Forms consumes — this ADR does not re-litigate any of them. What it must do is the work none of the three composite governing ADRs (nor the feature spec itself) fully resolves at the implementation level:

1. **The plugin-loader gap (OQ-01) must become a concrete module design, not a deferred question.** `feature.spec.md`/`spec-manifest.md` correctly identify that no Tier-1 declarative-plugin manifest loader/registry exists anywhere in `src/` — only the Tier-3 `dataModule` spike and the hand-wired Store sample plugin, both activated by a direct call in `src/index.ts`. The Coordinator has already concurred (spec-dod.md sign-off) that Forms ships as a bundled, hand-wired core module for now. This ADR's job is to make that concrete: which files exist, how they're wired, and — critically — which single seam in that design makes a future real Tier-1 loader retrofit a wiring change instead of a rewrite.
2. **Two real wiring gaps exist in the brownfield libraries Forms depends on, and this ADR must name the concrete path through them, not assume they are more finished than they are:**
   - `src/mail` ships `MailerPort` as **interfaces only**; the one concrete adapter (`ConsoleMailerAdapter`) lives under `src/members/mailer.console.ts`, member-scoped, not re-exported from `src/mail`'s own barrel.
   - The webhook fan-out subscriber (`enqueueDelivery` in `src/integrations/delivery.ts`, Stage A of ADR-036 §4) is real, tested business logic — but it is **never registered against the event bus anywhere in the composition root**. `src/server/app.ts` only wires one demonstration subscriber (`workspace.created` → `console.log`). Nothing calls `bus.subscribe(topic, enqueueDelivery)` for any topic today, and nothing invokes Stage B (`processDueDeliveries`) on a schedule either. AC-16's own wording ("the delivery worker enqueues... verified by inspecting the delivery worker's queued row, not a Forms-owned code path") already scopes verification to Stage-A enqueue, which sidesteps the Stage-B gap — but Stage-A itself first requires a `bus.subscribe` registration that does not exist for any topic yet.
3. **The existing outbox-drain call pattern in this codebase is synchronous-and-blocking**, and naively copying it would violate REQ-16/INV-05. The only extant caller of `processOutbox` (`POST /workspaces` in `server/app.ts`) does `await processOutbox(...)` **before** sending its HTTP response — acceptable there because its one subscriber is a `console.log`, but directly unacceptable for Forms, where a subscriber calls `MailerPort.send()` (AC-24 explicitly tests that the response must not wait on this).
4. **Forms' public submission write has no principal/actor and needs no undo/change-set semantics** — the existing admin mutation gateway (`executeCommand`, ADR-008) requires exactly those things and always emits the generic `change-set.applied` event, not a feature-named one. Forms' admin-side definition CRUD *does* fit that gateway (it has a real principal, permission, and benefits from the existing audit trail); the public submission path does not and must be architected as a distinct write path, matching the existing precedent set by the public, unauthenticated `routes/site/analytics-ingest.ts` route (which also writes without going through `executeCommand`).
5. **A reusable, already-built rate-limiting primitive exists** (`src/server/middleware/rate-limit.ts`'s `createRateLimiter`/`resolveClientIp`, built for `LOGIN_STRICT`) that the spec's own Article I note did not know about when it said "rate limiting reuses whatever fixed-window mechanism the codebase already has none of yet." This ADR corrects that: one exists, and Forms should use it rather than hand-rolling a second one.

## Decision

Ship Forms as a new, always-on core feature module `src/forms/` — architecturally identical in activation shape to `settings`/`members`/`menus` (an ordinary feature module with ordinary routes registered unconditionally in `server/app.ts`, **not** the Tier-3 `bootstrapStore`-style SPIKE activation hook in `src/index.ts`, which exists only for genuinely plugin-owned tables under the ADR-023 `dataModule`/snapshot-before-DDL discipline that Forms' core-owned tables do not need). Forms' two tables (`form_definitions`, `form_submissions`) are ordinary Drizzle-migrated core tables, following the exact ADR-027/028/036 core-owned-table precedent.

The OQ-01 plugin-loader gap is resolved structurally, not just by assertion: Forms' declarative surface (field vocabulary, capability/permission strings, admin menu entry, webhook topic) is isolated as **plain, side-effect-free, JSON-serializable data** in one file, `src/forms/manifest.ts`, that today is *read* by ordinary hand-wired registration code (`app.ts` route registration, `permissions.ts` catalog entries) but contains no activation logic itself. When a real Tier-1 manifest loader eventually exists, the retrofit is: (a) serialize `manifest.ts`'s exported object to whatever manifest format the loader defines — mechanical, since it is already plain data with no closures or imports of runtime code — and (b) replace the hand-wired registration call sites with the loader's generic registration calls driven by that manifest. **No change to `forms.ts`, `write-service.ts`, `submit-service.ts`, `notify-subscriber.ts`, or the repo ports/adapters is required** — none of that domain code has any awareness of how it was activated.

Admin definition CRUD (REQ-01..04) routes through the existing `executeCommand` gateway (matching every other admin mutation in this codebase). The public submission path (REQ-05..09) is a distinct, gateway-bypassing write function (matching the `analytics-ingest` precedent) that enqueues directly onto the outbox and returns its HTTP response **without awaiting** outbox drainage (`void processOutbox(...)`, not `await` — a deliberate, disclosed departure from the one existing `processOutbox` call site, required by REQ-16/INV-05). The FORMS_SUBMIT rate limit reuses the existing `createRateLimiter` primitive, keyed on a composite `${clientIp}:${formDefinitionId}` string. The webhook fan-out gap (Context §2) is closed by one line the Forms task adds to `server/app.ts` — `bus.subscribe('form.submission.received', event => enqueueDelivery(...))` — which forwards to `integrations`' own, already-audited `enqueueDelivery` function and contains zero Forms-owned dispatch logic (satisfying REQ-11's "zero Forms-specific webhook-dispatch code" at the level AC-16 actually tests: the delivery worker's queued row).

**Pattern(s) selected:** Hexagonal ports-and-adapters at the persistence boundary (rule-of-two: in-memory + SQLite, per ADR-006), inside a modular-monolith feature module — inherited unchanged from every prior core-owned-table feature (settings/media/integrations) — plus a data/activation split (`manifest.ts` vs. everything else) purpose-built to answer OQ-01.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: `src/forms/` is an ordinary vertical feature slice, matching `settings`/`members`/`menus`/`integrations`. The one seam this ADR adds beyond the minimum (`manifest.ts`) is not extra ceremony for its own sake — it is the specific, narrowly-scoped answer to a Coordinator-flagged open architecture question (OQ-01) that the Coordinator explicitly asked Software Architect to make concrete. The admin UI stays flat files (`FormsList.tsx`/`FormEditor.tsx`) per the existing `apps/admin/src/sections/*.tsx` convention (confirmed against `IntegrationDeliveries.tsx`, `Menus.tsx`).

## Rationale

Map the decision to the system drivers:
- **Driver: OQ-01 must be answered concretely, not left as prose** → addressed by the `manifest.ts` data/activation split, which is the smallest structural change that makes a future loader retrofit mechanical rather than a rewrite.
- **Driver: REQ-16/INV-05 (never block the public response on mail/webhook outcome)** → addressed by the `submit-service.ts` fire-and-forget outbox drain (`void processOutbox(...)`), a deliberate, disclosed departure from the one existing synchronous call site.
- **Driver: zero Forms-specific webhook-dispatch code (REQ-11)** → addressed by forwarding the new topic to `integrations`' existing `enqueueDelivery`, adding one wiring line and zero business logic.
- **Driver: Article I reuse over reinvention for the rate limit** → addressed by reusing `createRateLimiter`/`resolveClientIp` with a composite key, rather than hand-rolling a second limiter.
- **Driver: admin CRUD must stay consistent with the rest of the admin surface's audit trail** → addressed by routing REQ-01..04 through the existing `executeCommand` gateway, exactly like posts/menus/members.

## Pattern Evaluation

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Data/activation split (`manifest.ts` isolates the declarative surface as data; ordinary hand-wired route/permission registration reads it) | Strong fit | High | measured (read `src/features/plugins/store/store-plugin.ts` + `src/index.ts` to confirm no loader exists; read ADR-024 §1/§6 for the manifest-shape freeze precedent) | Directly answers OQ-01 with a named, inspectable seam; retrofit cost is "transcribe data + swap registration call," not "rewrite domain logic"; costs almost nothing today (one small file) | The manifest object could drift from what a real loader eventually requires if the loader's shape differs materially | Front-loads a small discipline (keep `manifest.ts` free of imports/closures) for a real future-proofing win | **SELECTED** |
| Mirror the Tier-3 Store spike's `bootstrapStore`-in-`index.ts` activation pattern | Weak fit | Low | measured (read `src/index.ts`/`store-plugin.ts` directly) | Some surface-level precedent already exists in this repo | That pattern exists specifically for plugin-*owned* tables under the ADR-023 `dataModule`/snapshot-before-DDL ceremony (a different problem: isolating a plugin's own schema from core migrations); Forms' tables are core-owned, not plugin-owned, so adopting this ceremony would import machinery Forms doesn't need and would misrepresent Forms' actual trust tier | Would conflate "Tier-1 declarative, core-mediated" with "Tier-3 trusted, plugin-owned-schema" | Not selected — wrong precedent for a core-owned-table feature |
| No manifest seam at all — plain hand-wired module like every other feature, OQ-01 left as prose only | Viable fit | Low | analogical | Zero extra file; matches the literal minimum the Coordinator's sign-off required | Leaves OQ-01 unresolved at the concrete level the Coordinator explicitly asked for ("make it concrete... structuring the code so a future plugin-loader retrofit is a wiring change, not a rewrite"); a future loader retrofit would require reverse-engineering the declarative surface out of scattered registration call sites | Saves one small file today at the cost of a harder future retrofit and an unanswered dispatch directive | Not selected — does not satisfy the explicit dispatch requirement |
| Hand-roll a new Forms-scoped rate limiter | Weak fit | Low | measured (read `src/server/middleware/rate-limit.ts` in full — a generic, already-tested, injectable-clock fixed-window limiter already exists) | None found | Duplicates a tested primitive; violates Article I; the spec's own Article I note ("no fixed-window mechanism exists yet") is simply factually outdated once the file is read | Would cost a second implementation of the same algorithm for no benefit | Not selected — Article I violation once the existing primitive is known |
| Reuse `createRateLimiter`/`resolveClientIp` with a composite `(ip, formId)` key | Strong fit | High | measured | Zero new algorithm; already unit-tested via `LOGIN_STRICT`; injectable clock keeps Forms' rate-limit tests deterministic, same as auth's | The existing limiter's key type is a plain `string` — Forms must compose `${ip}:${formId}` itself (trivial) | None significant | **SELECTED** |
| Route the public submission write through `executeCommand` (the admin command gateway) | Weak fit | Low | measured (read `command.ts` in full) | Would give Forms submissions the same change-set/audit ceremony as admin mutations | `executeCommand` requires a `CommandActor` (`{id, kind}`) and a `permission` string — a public, unauthenticated visitor has neither; forcing one would mean inventing a fake system actor for every visitor submission, polluting the change-set audit trail (meant for operator/agent actions) with anonymous public writes, and emits the generic `change-set.applied` event instead of the feature-named `form.submission.received` REQ-11 requires | Would need either a synthetic actor (semantically wrong) or a gateway change (out of scope, affects every other gateway consumer) | Not selected — wrong shape for an anonymous public write, and REQ-11 needs a specifically-named event the gateway doesn't emit |
| A dedicated `submit-service.ts` write path bypassing the gateway, enqueuing directly onto `OutboxPort` (mirrors `routes/site/analytics-ingest.ts`'s precedent of writing without the gateway) | Strong fit | High | measured (read `analytics-ingest.ts` + `ingest.ts` in full) | Matches the one other public/unauthenticated write path already in this codebase; emits exactly the REQ-11-required event name/payload; no synthetic actor invented | Forms owns slightly more of its own write-path plumbing than a gateway-routed feature would | Small, contained duplication of "validate → insert → enqueue" shape vs. reusing the gateway — justified because the gateway's actor/permission contract genuinely doesn't fit an anonymous caller | **SELECTED** |

## Quality Attribute Scorecard

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing Forms' behavior/activation later | 5 | measured | `manifest.ts` isolates the one thing most likely to change (how Forms is activated/declared) from the domain logic (least likely to change) | The manifest object's shape is a guess at what a real future loader will want — cannot be validated until that loader exists | Directly answers OQ-01's "cheap retrofit" requirement | A future Tier-1 loader's manifest schema will resemble ADR-024's frozen capability-string shape closely enough that `manifest.ts`'s fields transcribe with minor renaming, not restructuring | always-on | If the eventual loader's manifest shape differs materially, `manifest.ts` is the only file that needs to change, plus the registration call sites — domain code is unaffected either way | Owner: Software Architect (next OQ-01-resolving ADR, if/when a real loader is designed); trigger: a dedicated Tier-1 loader ADR is drafted | +2 vs. "no manifest seam" runner-up |
| modularity | Cross-module coupling | 4 | measured | `forms` depends only on `identity` (`authorize()`), `mail` (`MailerPort` by handle), `integrations` (topic string + `enqueueDelivery` forwarding), and `core` (ports/outbox) — same dependency shape as every other feature | New wiring line in `server/app.ts` couples Forms' boot sequence to `integrations`' `enqueueDelivery` function directly (a forwarding call, not a new abstraction) | Matches the existing dependency graph; the one new edge (`forms`→`integrations`'s function) is a plain function call, not a new port | — | always-on | — | — | — |
| scalability | Read/write volume headroom | 4 | analogical | Submissions list is cursor-paginated (`api.spec.md` §4, `limit`/`cursor`); indices support the `(workspaceId, formDefinitionId)` and `(formDefinitionId, submittedAt)` access patterns | No load-tested submission-volume benchmark exists (out of scope for a v1 contact form) | Matches the existing list-endpoint pagination convention (`FORMS_LIST_SUBMISSIONS`) | Submission volume for a v1 sample plugin stays in the hundreds-to-low-thousands range, not requiring a queue-backed ingest path | always-on | — | Revisit if a single form definition accumulates >100k submissions (index scan cost) | — |
| reliability | Never-brick / correctness under failure | 5 | measured | Honeypot (INV-04), rate limit (REQ-09), and immutability rules (slug, field-id removal, INV-03/08) are all enforced at the write chokepoints, not by convention; a mail-send failure never rolls back a persisted submission (EC-06) | The webhook fan-out subscriber registration (Context §2) is new wiring this task adds — if mis-wired, AC-16 silently fails without bricking anything else (the submission itself is durably persisted regardless, INV-05) | Matches the existing never-brick discipline (a plugin/subscriber failure degrades gracefully, never blocks the core write) | — | always-on | — | — | — |
| security | Authorization + PII handling correctness | 4 | measured | All 3 admin permissions gate their respective routes (INV-06); public route is deliberately unauthenticated by design, not a gap; `source_ip` stays admin-only, never on a public response | `source_ip` stored raw (OQ-03) is a residual PII-exposure surface if the admin submissions view or an export path is ever widened without review | OQ-03 resolved as raw-for-v1 (see Consequences) because rate-limiting/spam-investigation utility depends on comparing actual addresses, not just hash equality, and REQ-14 already gives operators a deletion path | Admin-only visibility holds as designed; no export/API surface exposes `source_ip` beyond the already-gated `FORMS_SUBMISSIONS_READ` routes | always-on | Security Agent review flagged specifically for `source_ip` handling at the code-review stage | Owner: Security Agent (design-time threat-surface review); trigger: before this feature ships to any non-local environment | — |
| operability | Ops/debugging surface | 4 | analogical | Structured errors + the future `correlationId` slot (errors.spec.md §1); `form.submission.received`'s payload is self-describing for anyone debugging the webhook/mail fan-out | The new `bus.subscribe` wiring line in `server/app.ts` is easy to overlook when reading only `src/forms/` (it lives in a shared composition-root file) | Matches the existing operability level of every other admin section | — | always-on | Doc comment at the `bus.subscribe` call site cross-references `src/forms/notify-subscriber.ts` and ADR-036 so a future reader isn't surprised by a Forms-shaped line inside `app.ts` | Owner: Programmer; trigger: at implementation time | — |
| cost | Build/run cost | 5 | measured | No new infrastructure; two SQLite tables, in-process subscribers, no new service | None | Pure feature-module addition to an existing modular monolith | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 5 | measured | Every REQ/AC/INV/EC is Given/When/Then against pure functions (`forms.ts`) + a repo port with an in-memory adapter; the fire-and-forget outbox drain is directly testable via AC-24's "response completes before mail-send outcome" assertion | — | Matches this repo's established test-first pattern (`identity`, `settings`, `presentation` all test the pure core against `repo.memory.ts`) | — | always-on | — | — | — |

No axis scored ≤2; Mitigations Required section captures the two forward-looking notes (loader-shape drift; `bus.subscribe` wiring visibility) inline above.

## Overall Strengths

- OQ-01 gets a named, inspectable, cheap-to-retrofit answer instead of remaining an open architectural question carried forward indefinitely.
- Every new module traces directly to a REQ; nothing is speculative.
- Two real reuse wins are captured (the existing rate limiter, the existing `enqueueDelivery` fan-out function) instead of quietly duplicating either.

## Overall Weaknesses

- Forms' public submission path (`submit-service.ts`) deliberately does not go through the same audit-trail gateway (`executeCommand`) every admin mutation does — a reader expecting uniform write-path plumbing across the whole codebase needs to understand why this one path is different (documented at the file header and in this ADR).
- The webhook fan-out wiring gap (Context §2) is a pre-existing `integrations` gap that this task closes as a side effect of building Forms, rather than `integrations` closing it on its own schedule — a coordination risk if the Integrations sibling spec closes the same gap independently (see Consequences/Risks).

## Tradeoff Tension

We are trading perfectly uniform write-path plumbing (every mutation through one gateway) for a public submission path that is honestly shaped for what it actually is: an anonymous, ungoverned write with no actor and no undo semantics.

## Why This Won

Forcing the public submission write through `executeCommand` would either invent a fictitious system actor for anonymous visitors (semantically wrong and a precedent that would leak into every future public write path) or require changing the gateway's actor/permission contract for every existing consumer — both costs are larger than the modest plumbing duplication of a small, well-tested `submit-service.ts`. The `manifest.ts` seam costs one small file today and is the only concrete way to satisfy the Coordinator's explicit directive that a future loader retrofit be "a wiring change, not a rewrite."

## Runner-Up Comparison

- Runner-up: No manifest seam (Forms as a plain hand-wired module, OQ-01 left as prose) — the literal minimum the Coordinator's spec-dod sign-off required.
- Why it lost: It satisfies the letter of "ships as a bundled core module" but not the explicit follow-on directive to make the future retrofit path concrete and cheap — the dispatch brief specifically asked for the manifest-as-data seam by name.

## Consequences

**Positive:**
- OQ-01 is closed at the implementation-architecture level for this feature; the next Tier-1 sample plugin (or a future dedicated loader ADR) has a working, inspectable precedent to compare against instead of starting from zero.
- REQ-16's hardest invariant (never block on mail/webhook) gets a concrete, disclosed mechanism (`void processOutbox(...)`) instead of silently inheriting the blocking precedent from `POST /workspaces`.
- Two reuse wins reduce net-new code: the rate limiter and the webhook fan-out subscriber function are both borrowed, not rebuilt.

**Negative / Tradeoffs:**
- `submit-service.ts` duplicates a small amount of "validate → persist → enqueue" shape that `executeCommand` would otherwise centralize — an accepted, scoped duplication (see Why This Won).
- Fire-and-forget outbox draining (`void processOutbox(...)`) means a process crash between "response sent" and "outbox drained" delays (not loses — the row is already durably enqueued) delivery of the mail/webhook side effects until the next drain call. Acceptable per REQ-16/INV-05's own framing ("asynchronously... a slow/broken mail provider can never block") and per ADR-009's own eventual-delivery contract.

**Risks:**
- Risk: The Integrations sibling spec (running in parallel this same dispatch) may also need to add a `bus.subscribe(topic, enqueueDelivery)`-shaped wiring line to `server/app.ts` for its own topics → plan: name this exact line in the Wiring Map below and flag it to the Coordinator as a shared-file convergence point across Forms and Integrations, so whichever lands second merges rather than duplicates the registration pattern.
- Risk: `manifest.ts`'s shape doesn't match whatever a real future Tier-1 loader ends up requiring → plan: no mitigation needed now (this is an accepted, named assumption, not a defect) — the modifiability axis above already scopes the blast radius to one file plus registration call sites.
- Risk: `source_ip` stored raw is a PII surface if a future export/API path widens visibility → plan: Security Agent design-time review flagged explicitly (security axis above).

## Mitigations Required

None — no axis scored ≤2. The two forward-looking notes (loader-shape drift; `bus.subscribe` wiring visibility; the Integrations-sibling convergence risk) are Owner/Enforcement-tagged above, not separate open items.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

N/A — Forms is greenfield for its own surface (spec_mode: greenfield; no prior `src/forms` stub or shipped code exists). The two dependency-shaped risks this ADR names (the `src/mail` adapter-location gap, the `integrations` webhook-fanout wiring gap) are pre-existing gaps in *other* already-shipped libraries that Forms surfaces and works around by naming concrete adapters/wiring — they are not migrations of Forms' own state and carry no expand/contract/backfill/rollback shape of their own.

## Re-evaluation Triggers

- Calendar trigger: None forced — this is a straightforward feature-module addition following established precedent.
- Scale trigger: If a single form definition accumulates beyond roughly 100k submissions, revisit whether `FORMS_LIST_SUBMISSIONS`'s cursor pagination and its supporting index still perform acceptably.
- Topology trigger: If a real Tier-1 plugin-manifest loader is designed (OQ-01's eventual resolution), revisit `src/forms/manifest.ts` as the first migration candidate — it is deliberately built to be the cheapest possible retrofit target.
- Dependency trigger: If `src/integrations`'s `enqueueDelivery`/`WebhookSourceEvent` signature changes, or if `src/mail`'s `MailerPort`/`MailerSendOptions` shape changes (ADR-037 §6 says the shape is frozen, but `capabilities()` contents iterate), Code Review should flag those files' changes as needing a `src/forms` consumer check.

## Module / Service Boundaries

```
src/forms/                                  # NEW feature module (REQ-01..16)
  INFO.md                                   # module purpose, mirrors settings/members/integrations INFO.md convention
  manifest.ts                               # NEW — THE OQ-01 seam. Plain, JSON-serializable data only:
                                             #   pluginId, tier:1, displayName, the closed field-type
                                             #   vocabulary (text/email/textarea/checkbox), the 3
                                             #   admin.forms.* capability/permission strings, the admin
                                             #   nav entry descriptor, and the 'form.submission.received'
                                             #   topic name. Zero functions/closures/imports of runtime
                                             #   code — Code Review enforces this (see Enforcement).
                                             #   Read by app.ts/permissions.ts registration call sites;
                                             #   never imported by forms.ts/write-service.ts/
                                             #   submit-service.ts (activation-agnostic domain code).
  forms.ts                                  # pure domain core: field-vocabulary validation, submission
                                             #   payload validation against a definition (required/
                                             #   maxLength/unregistered-key/honeypot), slug-immutability
                                             #   and field-id-removal-restriction checks (behavior.spec
                                             #   §1) — the "one evaluator" for validation, no I/O
  write-service.ts                          # Admin definition mutations (REQ-01..04), routed through
                                             #   the existing core/commands executeCommand gateway
                                             #   (mirrors posts/menus/members) — create/update/
                                             #   setStatus; never exposes a delete
  submit-service.ts                         # NEW write path, deliberately NOT routed through
                                             #   executeCommand (no actor/permission fits an anonymous
                                             #   visitor — see Pattern Evaluation): validates, checks
                                             #   honeypot (REQ-08) and rate limit (REQ-09), inserts the
                                             #   form_submissions row, and enqueues
                                             #   'form.submission.received' directly onto OutboxPort —
                                             #   mirrors routes/site/analytics-ingest.ts's ingestHit shape
  notify-subscriber.ts                      # Forms-owned outbox subscriber (REQ-12): subscribes
                                             #   'form.submission.received', loads the definition +
                                             #   submission, and calls MailerPort.send() when
                                             #   notify.enabled — the one piece of Forms-specific
                                             #   business logic riding the outbox (webhook fan-out is
                                             #   NOT here — see server/app.ts wiring)
  rate-limit-profile.ts                     # FORMS_SUBMIT profile constant (5/60s) + the
                                             #   `${clientIp}:${formDefinitionId}` composite key
                                             #   builder — wraps the EXISTING
                                             #   server/middleware/rate-limit.ts createRateLimiter,
                                             #   does not reimplement it
  ports.ts                                  # FormDefinitionRepoPort, FormSubmissionRepoPort
                                             #   (rule-of-two: memory + sqlite adapters)
  repo.memory.ts                            # in-memory adapters for tests
  repo.sqlite.ts                            # Drizzle/SQLite adapters (production)
  errors.ts                                 # FormFieldValidationError, FormSlugConflictError,
                                             #   FormDefinitionNotFoundError,
                                             #   FormSubmissionValidationError,
                                             #   FormSubmissionNotFoundError, FormRateLimitError
  __specs__/                                # spec-linked test fixtures, mirrors settings/identity
  __tests__/                                # unit + integration tests

src/infra/db/schema.ts                      # MODIFIED: add formDefinitions/formSubmissions Drizzle
                                             #   table defs (see Implementation Outline Data boundaries)

src/identity/permissions.ts                 # MODIFIED: BASE_CATALOG gains admin.forms.manage,
                                             #   admin.forms.submissions.read,
                                             #   admin.forms.submissions.delete (verbatim strings from
                                             #   api.spec.md §2 — spec is ground truth, Article VII)

src/server/routes/admin/forms/              # NEW route module, mirrors routes/admin/menus/ shape
  list.ts, create.ts, get-by-id.ts, update.ts, list-submissions.ts, get-submission.ts,
  delete-submission.ts                      # 7 admin route registrars per api.spec.md §1

src/server/routes/site/forms-submit.ts      # NEW public route, mirrors routes/site/analytics-ingest.ts
                                             #   shape — registered BEFORE the /:slug catch-all, same as
                                             #   analytics-ingest/media-rendition

src/server/app.ts                           # MODIFIED: import + register the 7 admin route registrars
                                             #   and the public forms-submit route; ALSO adds the
                                             #   webhook-fanout forwarding line:
                                             #     bus.subscribe('form.submission.received',
                                             #       event => enqueueDelivery({ deps: {...}, input: { event } }))
                                             #   (imports enqueueDelivery from ../integrations/delivery —
                                             #   zero Forms-owned dispatch logic); registers
                                             #   notify-subscriber.ts's subscriber similarly

src/server/routes/types.ts                  # MODIFIED: RouteDeps gains formDefinitionRepo,
                                             #   formSubmissionRepo, formsRateLimiter (mirrors the
                                             #   existing webhookSubscriptionRepo/webhookDeliveryRepo
                                             #   field-addition precedent)

apps/admin/src/sections/FormsList.tsx       # NEW, flat file (matches Members.tsx/Menus.tsx convention)
apps/admin/src/sections/FormEditor.tsx      # NEW — includes the FormFieldsEditor + FormSubmissions +
                                             #   FormSubmissionDetail components per ui.spec.md §1
                                             #   (composed within this file/a small local component
                                             #   split, not a nested FSD folder, matching this admin
                                             #   app's actual flat-file convention)
apps/admin/src/App.tsx                      # MODIFIED: import + mount the Forms routes (matches the
                                             #   existing per-section import/route block)
```

**Out of this feature's scope (explicitly deferred, not silently dropped):** any real Tier-1 plugin-manifest loader/registry (OQ-01's full resolution — `manifest.ts` is the seam, not the loader itself); the `webhookSigner`/`KeyringPort` production wiring (pre-existing `integrations` gap, unaffected by Forms); a SQLite adapter for `webhook_subscriptions`/`webhook_deliveries` (same pre-existing `integrations` gap).

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `FormDefinitionRepoPort` / `FormSubmissionRepoPort` (`src/forms/ports.ts`) — interfaces, two adapters each (`repo.memory.ts`, `repo.sqlite.ts`); Programmer must not add a third write path.
- `form.submission.received` domain event (topic name defined in `src/forms/manifest.ts`, payload `{workspaceId, formDefinitionId, submissionId}`) — published by `submit-service.ts` onto `OutboxPort`; consumed by both `notify-subscriber.ts` (Forms-owned) and `integrations`' `enqueueDelivery` (via the one forwarding line in `server/app.ts`). Any other future subscriber (e.g. an audit/analytics consumer) may also subscribe to this exact topic string without Forms' involvement.
- Admin HTTP endpoints per `api.spec.md` §1: `FORMS_LIST_DEFINITIONS`, `FORMS_CREATE_DEFINITION`, `FORMS_GET_DEFINITION`, `FORMS_UPDATE_DEFINITION`, `FORMS_LIST_SUBMISSIONS`, `FORMS_GET_SUBMISSION`, `FORMS_DELETE_SUBMISSION`, plus the public `FORMS_POST_SUBMIT` — each gated per `api.spec.md` §2's auth profiles.
- `src/forms/manifest.ts`'s exported shape (`pluginId`, `tier`, `displayName`, `fieldTypeVocabulary`, `capabilities[]`, `adminMenuEntry`, `webhookTopics[]`) is the OQ-01 contract other agents (and any future loader-design work) must read as "what Forms declares," not reverse-engineer from scattered registration call sites.

## Enforcement

How do we prevent violations?
- Code Review Agent verifies `src/forms/manifest.ts` contains only plain data literals — no imports of `forms.ts`/`write-service.ts`/`submit-service.ts`/any runtime function, no closures — since this is what keeps the OQ-01 retrofit mechanical.
- Code Review Agent verifies `submit-service.ts` never `await`s `processOutbox(...)` (or any mail/webhook-adjacent call) inline in the request path — the fire-and-forget call is a required, testable property (AC-24), not a style preference.
- Code Review Agent verifies the new `bus.subscribe('form.submission.received', ...)` line in `server/app.ts` forwards to `integrations`' existing `enqueueDelivery` verbatim rather than reimplementing any part of webhook matching/enqueueing (REQ-11's zero-Forms-dispatch-code requirement).
- Code Review Agent verifies no import of `repo.memory.ts`/`repo.sqlite.ts` from outside `write-service.ts`/`submit-service.ts` — the chokepoint boundary is a review-time architecture check, mirroring ADR-022's existing CI-canary pattern.
- Code Review Agent flags any new port added under `src/forms/` beyond `FormDefinitionRepoPort`/`FormSubmissionRepoPort` without a documented rule-of-two justification (Article IV).

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| — | — | — | — |

## Related Decisions

- Extends: ADR-024 (Plugin Execution & Trust Model — Tier-1 declarative contract this feature satisfies); ADR-037 (`core/mail` `MailerPort`, consumed for REQ-12); ADR-036 (Integrations webhook fan-out, consumed for REQ-11); ADR-009 (outbox, the async spine both notify and webhook fan-out ride); ADR-008 (`executeCommand` gateway, used for REQ-01..04); ADR-021 (`authorize()` + permission catalog); ADR-006 (rule-of-two); ADR-015 (Drizzle)
- Relates to: ADR-028/ADR-PIPE-007 (Settings — the closest prior "core-owned ledger + write chokepoint" precedent this ADR's module shape mirrors); ADR-032/ADR-033 (SEO/Redirects — the "bundled hand-wired core module, not an installable Tier-1 package" precedent this ADR extends and makes concrete via `manifest.ts`)
- Coordination note for parallel dispatch: the Integrations sibling spec running in this same dispatch round may also need to add `bus.subscribe`-shaped wiring to `server/app.ts`; both this ADR's Wiring Map and the Integrations ADR should name the exact line(s) added so the Coordinator can sequence/merge rather than let two agents silently duplicate the same registration.
