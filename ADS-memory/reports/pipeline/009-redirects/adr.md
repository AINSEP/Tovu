# ADR-PIPE-009: Redirects — Implementation Architecture

- Status: ACCEPTED 2026-07-13 (human approval: Leona Burime, blanket approval across ADR-PIPE-008..015; Red-Team has NOT run for SPEC-009 — accepted with that acknowledged gap; the open-redirect write+read dual-check is the named highest-risk contract, verify it first in TDD)
- Date: 2026-07-13
- Spec: SPEC-009 v1.0.0 (hash: sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef)
- Author: Software Architect Agent

## Constitution Check

*Complete this before writing any other section. An unjustified violation is a blocking escalation.*

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new third-party library. Persistence is Drizzle/SQLite (ADR-015, already decided); ULID-style ids reuse the existing `IdGeneratorPort` (`deps.idGen.newId()`, same abstraction every other feature uses — `RedirectRecord.id`'s "ULID" language in ADR-033/types.ts is a convention name, not a new library dependency); the open-redirect oracle reuses `core/origin`'s WHATWG-parser-based `isAllowedRedirectTarget` (ADR-040) rather than a new URL-parsing library; `wildcard` matching is bounded string/glob operations, no regex engine (`regex` stays off, per REQ-22/INV-05, so no RE2-class dependency is introduced this pass). |
| II — Test-First | COMPLIES | No implementation exists beyond the `src/redirects/{ports,types}.ts` stubs. TDD Agent certifies failing tests against SPEC-009's ACs/INVs/ECs/behavior.spec.md rules before Programmer writes adapter/route/UI/routing-wiring code. |
| III — Simplicity Gate | COMPLIES | Every module below traces to a REQ (see Module/Service Boundaries). `RedirectMatcher`/`RedirectHitSink` stay ordinary internal seams, not new ports (ADR-033's own ADR-006 accounting, unchanged). `regex`/edge-compiler/per-hit-timeseries/conditional-redirects stay out of scope, not built speculatively (feature.spec.md Out of Scope). Error classes are added to the existing `src/redirects/types.ts` file rather than a new `errors.ts`, matching this module's own established convention (not copying `settings`' separate-file convention where it isn't already the local pattern). |
| IV — Anti-Abstraction Gate | COMPLIES | `RedirectRepoPort` is the only new port, with two adapters built now (`repo.memory.ts`, `repo.sqlite.ts`), matching every other `src/features/*`/`src/redirects` port in this codebase. `RedirectMatcher`/`RedirectHitSink` are typed interfaces (testability) but not ports — no second real adapter is being built for either in this pass (ADR-033 §"ADR-006 accounting"). The two new exported functions this ADR adds to `src/routing/routing.ts` (`runPreContentPhase`/`runPostContentPhase`) are not a new abstraction layer — they expose the *same* module-private phase registry `resolve()` already reads, split into two callable steps so a caller can interleave its own content lookup (see Rationale). |
| V — Integration-First Testing | COMPLIES | Every P1 AC in traceability.spec.md names an HTTP-route, DB-adapter, or site-route boundary and is tested there per `traceability.spec.md` — including the real `GET /:slug` site route (REQ-18/REQ-19/AC-21–24), not only the admin API. |
| VI — Security-by-Default | COMPLIES | Write- and read-path open-redirect validation (REQ-08/09/10) and `admin.redirects.manage` gating (REQ-11/12) are P1, load-bearing, and built in this pass, not deferred. The constitution's standing Art. VI local-dev-only exception (no auth layer yet) is unchanged and already covers this server generally. |
| VII — Spec Integrity | COMPLIES | This ADR and all downstream artifacts cite SPEC-009 v1.0.0, hash `sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef`. |
| VIII — Observability | COMPLIES | Every chokepoint write emits `redirect.created`/`.updated`/`.tombstoned` (ADR-009 lane 2 outbox); `redirect.hit` is the async lane-2 event the hit-count handler folds into `redirect_hits`; every error code in `errors.spec.md` carries the base envelope (`code`, `message`, `occurredAt`, `correlationId`, `details`). |

No EXCEPTION rows. Complexity Justification table is empty.

## Research Summary

- Research artifact: N/A — no library, framework, or persistence-mechanism choice is open (confirmed in `pipeline-state.md`'s `research_artifact` field before this dispatch). Persistence is Drizzle/SQLite per ADR-015; the write-chokepoint/revision pattern is ADR-022 (via ADR-033 §2); the open-redirect oracle is ADR-040 (already built, `src/origin/`); the forward-chain/slug-capture contract is ADR-039 (already built, `src/routing/`). The two genuinely open implementation questions this ADR resolves — (1) how the `SlugChangeCapture` implementation gets same-transaction atomicity given the routing-owned `SlugChangeCaptureInput` carries no `tx` handle, and (2) how the redirects phase-handler integrates with the real site route given `routing.resolve()`'s accepted v0 shape does not interleave with a caller's own content lookup — are architecture/reuse-vs-extend calls, evaluated in Pattern Evaluation below, not technology choices.
- Key decision: N/A (see above).

## Planning Preflight Evidence

- Coordinator Planning Preflight: PASS (validator `--phase preflight`, 2026-07-13T00:00:00Z, against spec hash `sha256:666f3726f38eda3cc6274ebb3bfd1ee5642bcfeffb2eb80bc3f48e89fc3986ef`; `pipeline-state.md` records `planning_preflight_status: PASS`)
- Spec hash verified at: 2026-07-12 (provider-local validator, `--phase spec --update-hash`)
- Red-Team status and artifact: NOT STARTED (`pipeline-state.md`'s `red_team_status`) — no Red-Team pass has run for FEAT-009 yet. This ADR proceeds on the Coordinator's explicit dispatch instruction (governing ADR-033/039/040 are already ACCEPTED and audited; this run translates them, does not re-litigate them) but the absence of a feature-level Red-Team pass is recorded here as a known gap, not silently treated as equivalent to a PASS.
- System Blueprint status and artifact: Not produced for this feature — no macro-topology change (Redirects is a new Tier-2 library alongside the existing `src/routing`/`src/origin` siblings inside the same modular monolith, not a new service/deployment boundary).
- CodeBase Analyzer reports consumed: None formal; this ADR performed direct source inspection of `src/redirects/{ports.ts,types.ts}`, `src/routing/{types.ts,ports.ts,routing.ts,index.ts,INFO.md}`, `src/origin/{ports.ts,origin.ts,types.ts,INFO.md}`, `src/identity/permissions.ts`, `src/infra/db/schema.ts`, `src/features/settings/*` (transaction-pattern precedent), `src/features/post/post.ts` + `repo.sqlite.ts`, `src/server/{app.ts,routes/types.ts,routes/site/pages.ts,routes/content/posts/get-by-slug.ts,http/admin/menus.ts}`, `apps/admin/src/{sections/Menus.tsx,lib/api.ts}` to ground module boundaries, transaction mechanics, and wiring gaps in actual repo code rather than inventing structure.
- Reverse-spec artifacts consumed: None (SPEC-009 is brownfield via `spec-manifest.md`'s Brownfield References section, not a reverse-spec extraction).
- Validator result or waiver: PASS, no waiver needed (python3 available; validator run recorded in `pipeline-state.md`/`spec-manifest.md`).

## Context

SPEC-009 needs to become buildable tasks. The **design is already decided** — ADR-033 (ACCEPTED 2026-07-10, 3-round audited), gated on ADR-039 (routing contract v0, ACCEPTED) and ADR-040 (core/origin registry v0, ACCEPTED), specifies the full data model, resolver phase model, single write chokepoint, permission, hit-count, and open-redirect posture. This ADR does not re-litigate any of that. It does the work those ADRs deliberately left to the Software Architect stage, and it surfaces three real gaps found by reading the actual (already-implemented) `src/routing/` and `src/origin/` code rather than only their ADR prose:

1. **Concrete module/file boundaries** inside this specific codebase. `src/redirects/{ports.ts,types.ts}` already exist as real stubs (ADR-033-governed) — this feature extends that exact location, following the sibling-library shape `src/routing/` and `src/origin/` already established (flat `src/<name>/{types.ts,ports.ts,<name>.ts,repo.memory.ts,repo.sqlite.ts,index.ts,INFO.md}`), not a `src/features/redirects/` layout.
2. **The `SlugChangeCapture` name collision** the spec already flagged and resolved in favor of `src/routing/types.ts`'s method-bearing, ADR-039-governed shape. This ADR specifies exactly what must be deleted, added, and wired, and in what order (Migration Safety).
3. **Two real implementation gaps this ADR must resolve, found by reading the actual code, not assumed from ADR prose:**
   - **(a) No `tx` handle exists on the real `SlugChangeCaptureInput`.** ADR-039 §4's decision pseudocode shows `onSlugChange(u: {…; tx: CoreTx})`, but the *actual implemented* `src/routing/types.ts` interface (`SlugChangeCaptureInput`) has no `tx` field at all — `workspaceId, entryId, oldPath, newPath, actor, changeSetId` only. Round-2 amendment 1 already explains *why* (no plugin holds a tx handle; the slot is core-resident), but it does not explain *how* the capture implementation's DB writes land in the same transaction as the content rename without one. This ADR answers that (see Rationale/Pattern Evaluation, Decision A).
   - **(b) `routing.resolve()`'s accepted v0 shape cannot be called by the real site route as a single function.** `src/routing/routing.ts`'s exported `resolve()` runs `pre_content` then immediately `post_content` back-to-back with **no pause for the caller's own content lookup in between** (its own comment: "`content-resolve`: fixed core content lookup... intentionally a no-op here"). But REQ-18/AC-21/AC-22 require that a `post_content` (404-fill) rule is consulted **only after** live content has already failed to resolve — calling `resolve()` once cannot express that. Neither ADR-033 §4 nor ADR-039 §1 pin how the caller is supposed to interleave; this is a real, previously-unaddressed integration gap this ADR resolves (Decision B).
4. **Two libraries this feature depends on are not wired into the composition root at all yet.** Neither `src/origin/`'s `OriginRegistry` nor any of `src/routing/`'s exports (`registerResolvePhase`, `registerSlugChangeCapture`, `resolve`/the new phase-runners) appear anywhere in `src/server/app.ts` or `src/server/routes/types.ts`'s `RouteDeps` today. Wiring both into the composition root for the first time is in-scope work for this feature, not a pre-existing integration this ADR can assume.
5. **A parallel delivery plan** so `/tasks` can safely mark slices `[P]`.

## Decision

Adopt ADR-033/039/040's designs unchanged as the persistence, resolution, and security architecture for SPEC-009, implemented by extending the existing `src/redirects/` Tier-2 library (mirrors the already-built `src/routing/`/`src/origin/` sibling shape) with a chokepoint (`redirects.ts`), rule-of-two persistence adapters (`repo.memory.ts` + `repo.sqlite.ts`), a bounded matcher seam (`matcher.ts`), an off-hot-path hit sink (`hit-sink.ts`), a `SlugChangeCapture` implementation (`capture.ts`), and a routing-chain phase-handler adapter (`phase-handler.ts`). The stale, pre-ADR-039 `SlugChangeCapture` type in `src/redirects/types.ts` is deleted (not kept alongside), replaced by importing the authoritative `SlugChangeCapture`/`SlugChangeCaptureInput` from `src/routing`. Two small, additive, backward-compatible exports are added to `src/routing/routing.ts` (`runPreContentPhase`, `runPostContentPhase`) so the real `GET /:slug` site route can interleave live-content lookup between phases, exactly as ADR-039 §1's pipeline diagram describes but its current single `resolve()` export cannot express. `src/origin/`'s `OriginRegistry` and `src/routing/`'s registration functions are wired into the composition root (`src/server/deps.ts`/`app.ts`) for the first time as part of this feature. The admin UI ships as two flat files (`Redirects.tsx` list + `RedirectEditor.tsx` create/edit form), mirroring the existing `Menus.tsx`/`MenuEditor.tsx` two-file convention.

**Pattern(s) selected:** Hexagonal ports-and-adapters at the persistence boundary (rule-of-two: in-memory + SQLite adapters, per ADR-006/ADR-033) inside a modular-monolith Tier-2 library — inherited unchanged from ADR-033/022/021/015/006, not a new pattern choice. The two real implementation-level decisions this ADR makes (ambient-transaction sharing for the capture slot; additive phase-runner exports for site-route interleaving) are reuse/extension calls scoped narrowly to close gaps the accepted ADRs left open, not new architectural patterns.

## Default Heuristic Alignment

- Default heuristic: modular monolith at the macro level, vertical slices for feature ownership, and hexagonal boundaries only where external I/O or business-critical logic justify them. Frontend applications use Feature-Sliced Design. Small or simple features should avoid unnecessary architecture ceremony.
- Alignment: FOLLOWS
- Notes: `src/redirects/` is a vertical Tier-2 library slice, consistent with `src/routing/` and `src/origin/`. The hexagonal seam at persistence (`RedirectRepoPort`) is justified by ADR-033's own rule-of-two mandate — the same justification every other repo port in this codebase carries. The admin UI stays two flat files per the repo's actual convention (`Menus.tsx`/`MenuEditor.tsx`), not a heavier nested-component structure. The two new `routing.ts` exports are the minimal-ceremony fix for the interleaving gap — additive functions, not a new abstraction layer, new port, or a breaking signature change to the existing (already-accepted, already-tested) `resolve()`.

## Rationale

Map the decision to the system drivers:
- **Driver: never-break-links must be atomic with the rename, but the routing-owned capture slot carries no transaction handle** (Round-2 amendment 1's own tension) → addressed by Decision A: a package-private, non-transaction-opening insert function shared between the chokepoint (which opens its own `BEGIN IMMEDIATE`/`COMMIT`) and the capture implementation (which performs no transaction control of its own, relying on the caller — content's chokepoint — already holding an open transaction on the single shared `better-sqlite3` connection). This is not a new invention: it is the same shape `purge-service.ts` already uses ("loops over `write-service.ts`'s internals in a single transaction — not via repeated public `clear()` calls").
- **Driver: `post_content` rules must never win over live content, but `resolve()`'s v0 shape can't express "run post_content only after content lookup fails"** → addressed by Decision B: two additive phase-runner exports, so `src/server/routes/site/pages.ts`'s real `GET /:slug` handler can call `pre_content` before its own `getPublishedPostBySlug` call and `post_content` only inside its existing `PostNotFoundError` catch branch — the exact ADR-039 §1 pipeline order (`pre_content → content-resolve → post_content`), which the current single `resolve()` export cannot reproduce when a real content lookup needs to happen in the middle.
- **Driver: the open-redirect oracle must be the single source of truth on both write and read paths, and it isn't wired into the server yet** → addressed by wiring `src/origin/`'s `OriginRegistry` into the composition root for the first time in this feature (a real gap, not an existing integration this ADR could assume), with an `InMemoryOriginSettingRepo`-backed dev-capability verified origin seeded alongside the existing dev workspace seed.
- **Driver: brownfield retirement of the stale `SlugChangeCapture` stub must not leave two competing definitions coexisting** → addressed by an explicit, ordered, same-PR deletion + replacement (Migration Safety).
- **Driver: `/tasks` needs safe `[P]` parallelization** → addressed by the parallel delivery plan (implementation-outline.md's Downstream Handoff Notes), sequencing schema/chokepoint/routing-wiring work ahead of the API/UI slices that depend on it.

## Pattern Evaluation

The core persistence/domain pattern (hexagonal ports-and-adapters, single write chokepoint, rule-of-two, bounded matcher as a trust-boundary primitive) is **inherited from ADR-033/022/021/015/006/039/040** and is not re-evaluated here. The two genuinely open implementation-level choices this ADR makes:

### Decision A — How does `SlugChangeCapture.onSlugChange` get same-transaction atomicity with no `tx` handle?

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Package-private, non-tx-opening insert function shared by the chokepoint and the capture impl, relying on `better-sqlite3`'s single-connection, no-real-async-I/O ambient-transaction sharing (the same pattern `src/features/settings/repo.sqlite.ts`'s manual `BEGIN IMMEDIATE`/`COMMIT` and `purge-service.ts`'s internals-sharing already establish) | Strong fit | High | measured (read the actual `settings` transaction-mechanics comment and `purge-service.ts`'s doc) | Zero new abstraction; reuses an already-established, already-reasoned-about repo convention; does not require touching `SlugChangeCaptureInput`'s already-accepted shape | Correctness depends on a documented discipline (the capture impl must never open its own `BEGIN`/`COMMIT`) rather than a type-enforced guarantee — must be enforced by Code Review + a same-connection integration test, not the compiler | The atomicity guarantee is process-and-single-connection-scoped (true for this repo's current single-`better-sqlite3`-handle-per-content.db model); a future multi-connection or Postgres adapter would need to revisit this (named as a Re-evaluation Trigger) | **SELECTED** |
| Thread an explicit `tx` handle through `SlugChangeCaptureInput`, matching ADR-039 §4's original decision pseudocode literally | Weak fit | Low | analogical | Matches the ADR's literal pseudocode | Requires modifying `src/routing/types.ts`'s already-ACCEPTED, already-implemented `SlugChangeCaptureInput` shape — a breaking change to a frozen contract another already-shipped sibling library (and its own tests) depend on; reintroduces exactly the plugin-tx-handle shape Round-2 amendment 1 closed by making the slot core-resident instead (the whole point of that amendment was to avoid handing out a raw tx handle) | None that justify re-opening an accepted, implemented contract | Not selected — would re-litigate an ACCEPTED sibling ADR's frozen type for no correctness gain over Option 1 |
| Async, outbox-only capture (no in-tx write at all) | Rejected | Low | analogical | Simplest to implement | This is exactly the 404-window failure mode ADR-033 §5 was written to reject — an after-commit event cannot guarantee no request observes the rename before its redirect exists | None — violates INV-02 by construction | Not selected — directly contradicts the feature's core guarantee |

### Decision B — How does the redirects phase-handler integrate with the real site route, given `resolve()`'s v0 shape doesn't interleave with content lookup?

| Pattern | Fit Band | Adaptability | Evidence Basis | Pros | Cons | Key Tradeoffs | Verdict |
|---------|----------|--------------|----------------|------|------|---------------|---------|
| Add two new exported functions to `routing.ts` (`runPreContentPhase`, `runPostContentPhase`), thin wrappers around the already-module-private `runPhase()`; wire `src/server/routes/site/pages.ts`'s `GET /:slug` to call them around its existing `getPublishedPostBySlug`/`PostNotFoundError` flow | Strong fit | High | measured (read `routing.ts`'s actual `resolve()` body and the real site route's actual try/catch structure) | Additive only — `resolve()`'s existing signature, behavior, and test suite are untouched; the fix is exactly as small as the gap; matches ADR-039 §1's documented pipeline order precisely | `routing.ts` (an already-ACCEPTED sibling library) gets a small brownfield touch from this feature rather than from its own author | Two more named exports on an already-small, already-tested library; no behavior change to any existing export | **SELECTED** |
| Reimplement the phase-registry read logic inside `src/redirects/phase-handler.ts` or the site route itself | Rejected | Low | analogical | Avoids touching `routing.ts` at all | `phaseRegistry` is module-private to `routing.ts` (not exported) — this would require either exporting internal state (worse encapsulation break) or maintaining a second, duplicate phase registry, splitting the single source of truth ADR-039 §1 establishes | Duplication of an already-owned contract for the sake of not touching one file | Not selected — worse encapsulation and a real duplication risk for zero benefit |
| Change `resolve()`'s signature to accept an injected content-resolve callback (e.g. `resolve({ input, contentResolve })`) | Weak fit | Medium | analogical | Keeps a single call-site API | A larger, riskier signature change to an already-accepted, already-tested export with other potential future callers; two new additive exports are the same fix with strictly less blast radius | Larger surface change than the problem requires | Not selected — Option 1 achieves the same outcome with a strictly smaller, purely-additive change |

## Quality Attribute Scorecard

Most axes are governed by ADR-033/039/040's own scorecards (security posture, reliability of the chokepoint discipline, cost) and are unchanged by this ADR. Scored here for the concrete surface this ADR adds: the module wiring, Decision A/B, and the UI screens.

| Axis | Definition | Score (1-5) | Confidence | Strengths | Weaknesses | Rationale | Assumptions | Activation Source | Mitigation / Owner / Enforcement / Deadline | Review Trigger | Delta vs Runner-up |
|---|---|---|---|---|---|---|---|---|---|---|---|
| modifiability | Ease of changing redirect behavior later | 4 | measured | Chokepoint isolated in `redirects.ts`; phase-handler adapter isolated in `phase-handler.ts`; the two-file UI matches every other section | The site-route wiring couples `pages.ts` to `routing`'s two new exports — any future third phase (a real generalized registry, per ADR-039's own promotion trigger) would need a matching site-route update | Matches every other feature module's isolation shape; the site-route coupling is small (two function calls) and named | The current single-content-type (`post`) site route is the only forward-resolution entry point needed for v1 | always-on | If a second content type's site route needs the same pre/post wiring later, extract a small shared `resolvePageRequest()` helper rather than duplicating the two-call pattern a third time | Owner: Programmer; trigger: a second site route needs the same wiring | — |
| modularity | Cross-module coupling | 4 | measured | `redirects` depends only on `routing` (phase registration + capture slot), `origin` (the oracle), `identity` (`authorize()`), and `core` (ports/types) — the same dependency shape ADR-033 always specified | Two new read/write dependencies (`routing`, `origin`) are wired into the composition root for the first time by this feature, not pre-existing | Both dependencies were always intended (ADR-033 §4/§7); this ADR is the first feature to actually complete their composition-root wiring, which is expected given `redirects` was always their first real consumer | — | always-on | — | — | — |
| scalability | Read/write volume headroom | 4 | prior_art | Exact/prefix lookups are index-backed O(1); the dynamic (wildcard) set is capped at 500 (OQ-01, ratified below) and evaluated only on exact/prefix miss | The 500 cap is a tuning value that could need revisiting under real usage | Matches the existing bounded-collection precedent (`menu-service.ts`'s item cap) | 500 is a safe default absent production usage data | always-on | Revisit the cap if a workspace's legitimate wildcard-rule count regularly approaches it (operability signal: `selectDynamicRuleCount` surfaced in the admin UI per `state.spec.md` §4) | Owner: Software Architect; trigger: a workspace regularly nears the cap | — |
| reliability | Never-brick / correctness under failure | 4 | measured | Chokepoint + same-tx revisions (INV-01), one-hop collapse + loop rejection (INV-04), fail-closed `LINK_PRESERVATION_UNAVAILABLE` posture (INV-02) — all ADR-033, unchanged | The atomicity guarantee for the *end-to-end* "rename → redirect exists" user journey depends on a follow-up feature wiring `post.ts`'s `updatePost` to call the capture slot inside an actual transaction bracket — neither exists in this repo today (see Migration Safety, "Known accepted gap") | This feature can and must build + test the `SlugChangeCapture` implementation and the slot registration correctly (REQ-15–17, AC-18–20 are fully testable against a direct call to `onSlugChange()` inside a manufactured transaction); it cannot make the *content* chokepoint call it, per the spec's own Dependencies table | The content-lib owner completes this wiring in a follow-up feature | always-on | See Migration Safety "Known accepted gap, not silently assumed" row — this is the single largest deviation between the spec's own "Success signal" language and what this feature alone can deliver | Owner: Coordinator (schedule the content-chokepoint follow-up); trigger: before the feature is considered fully delivering its own stated success signal | Scored one point below Settings' reliability axis specifically because of this named cross-feature gap, which Settings' equivalent axis did not have |
| security | Authorization + open-redirect correctness | 4 | measured | Write- and read-path open-redirect checks are P1 and both route through the single `isAllowedRedirectTarget` oracle (no second allowlist); `admin.redirects.manage` gates every admin operation | The read-path check (REQ-09/AC-12) is the highest-risk contract in this feature — a bug there is a live open-redirect vector reachable by anyone who can author a wildcard rule, exactly the class of bug ADR-033's own Round-3 audit already found and fixed once at the ADR-prose level | This is the same treatment SPEC-007 gave its write chokepoint as the single highest-aggregate-risk contract; here the analogous highest-risk contract is the phase-handler's read-path oracle call (C-013 in the implementation outline) | — | always-on | The phase-handler's read-path oracle call must be certified with a dedicated integration test before any other phase-handler behavior (see Test Expectations); Code Review must verify no code path can emit an HTTP redirect without that call having run first | Owner: TDD Agent (certify first), Code Review (verify no bypass path) | — |
| operability | Ops/debugging surface | 4 | prior_art | Structured errors + `correlationId`; `redirect_revisions` ledger gives full audit trail; `redirect.hit` outbox event is the seam a future analytics store subscribes to | No new production alerting surface beyond existing admin-route conventions (matches every other feature) | Inherited from ADR-022/009 | — | always-on | — | — | — |
| cost | Build/run cost | 5 | measured | No new infrastructure; SQLite, existing server process, no new service | None | Pure feature-module addition plus two small additive touches to already-running sibling libraries | — | always-on | — | — | — |
| testability | Ease of certifying behavior | 5 | measured | Every REQ/AC/INV/EC/behavior rule in SPEC-009 is Given/When/Then against pure functions (`matcher.ts`, precedence/tie-break logic) + a repo port with an in-memory adapter; the phase-handler and capture implementation are directly unit-testable against `RouteResolvePhaseHandler`/`SlugChangeCapture` interfaces without any HTTP layer | None | Matches this repo's established test-first pattern | — | always-on | — | — | — |

One axis (reliability) is scored 4 with a named, owner-assigned mitigation trigger; no axis scored ≤2, so the formal Mitigations Required table stays empty (the reliability note above is a forward-looking, Owner/Trigger-tagged callout, matching ADR-PIPE-007's own convention for sub-5 scores that don't require the separate table).

## Overall Strengths

- Every new module traces directly to a REQ; nothing is speculative.
- The two hardest open questions this ADR had to answer (tx-sharing with no handle; site-route phase interleaving) are both resolved with small, additive, precedent-grounded fixes rather than reopening accepted sibling ADRs.
- The open-redirect posture is a single oracle on both write and read paths, with the read-path call named as the feature's single highest-risk contract and given dedicated test-first treatment.

## Overall Weaknesses

- The feature's own stated "Success signal" (rename a page, immediately get a 301 on the old URL) cannot be fully true end-to-end from this feature alone — `src/features/post/post.ts`'s `updatePost` has no transaction bracket today and does not call the `SlugChangeCapture` slot; that wiring is explicitly owed to the content-lib owner (feature.spec.md Dependencies table), not this feature. This ADR can only guarantee the capture mechanism is correct and atomic *once called*.
- `src/routing/routing.ts` and `src/origin/` are both touched/wired by a feature that isn't their own author's — a normal but real "who owns the follow-up if something regresses" question worth naming for Code Review's architecture audit.

## Tradeoff Tension

We are trading a small brownfield touch to two already-ACCEPTED sibling libraries (`routing.ts`'s two new exports; the composition root's first-time wiring of both `routing` and `origin`) for closing two real integration gaps now, rather than deferring them to a future "routing v0.1" or "origin wiring" pass that would leave Redirects unable to fully satisfy its own P1 ACs.

## Why This Won

Both Decision A and Decision B are the smallest fix that closes a real, code-verified gap without reopening or weakening an already-accepted contract. The alternative in each case (thread a tx handle through an accepted type; duplicate a private phase registry; widen `resolve()`'s signature) would either re-litigate ACCEPTED ADR-039 decisions or introduce a second source of truth for phase registration — both worse than two small, additive, precedent-matching functions.

## Runner-Up Comparison

- Runner-up (Decision A): Threading an explicit `tx: CoreTx` handle through `SlugChangeCaptureInput`, matching ADR-039 §4's original pseudocode literally.
- Why it lost: It would require breaking an already-ACCEPTED, already-implemented sibling type, and reintroduces exactly the "plugin holds a tx handle" shape Round-2 amendment 1 was folded specifically to avoid.
- Runner-up (Decision B): Widening `resolve()`'s signature to accept an injected content-resolve callback.
- Why it lost: A larger, riskier change to an already-tested export for the same outcome two small additive exports achieve with less blast radius.

## Consequences

**Positive:**
- Redirects ships with a fully specified, testable atomicity mechanism for the auto-capture slot, and a fully specified site-route wiring plan — no ambiguity handed to TDD/Programmer about "how does this actually run."
- The open-redirect read-path oracle call is named explicitly as the single highest-risk contract, with a dedicated test-first requirement, mirroring how SPEC-007 treated its write chokepoint.
- `routing`/`origin` get their first real composition-root wiring, unblocking not just Redirects but any future consumer (SEO, Menus) that also needs them.

**Negative / Tradeoffs:**
- This feature's actual code footprint is slightly larger than "just `src/redirects/`" — it also touches `src/routing/routing.ts`, `src/routing/index.ts`, `src/server/routes/site/pages.ts`, and the composition root, all outside its own directory.
- The end-to-end "rename → redirect" success signal is only partially deliverable by this feature (see Overall Weaknesses); this must be communicated clearly at handoff so it isn't mistaken for a missed requirement.

**Risks:**
- Risk: A future contributor adds a second in-tx participant alongside `SlugChangeCapture` (as ADR-039's Round-3 fold already names Menus' binding-index write as) without realizing the ambient-connection-sharing discipline Decision A relies on, and opens a nested/competing transaction bracket → plan: Code Review must verify no file under `src/redirects/` other than `redirects.ts`'s own chokepoint entry points calls `BEGIN`/`COMMIT` (see Enforcement).
- Risk: The read-path oracle call (C-013) is skipped or bypassed by a future refactor of the phase-handler → plan: TDD certifies a dedicated integration test asserting no redirect response can be emitted without it (Test Expectations); Code Review treats any phase-handler change touching this call as a required-review item.
- Risk: The content-chokepoint follow-up (post.ts wiring) never lands, silently leaving REQ-15/16 correct-but-unreachable in production → plan: Coordinator schedules the follow-up explicitly as a named next feature, not an implicit assumption (Migration Safety).

## Mitigations Required

None — no axis scored ≤2. The reliability axis's named mitigation (Coordinator schedules the content-chokepoint follow-up) is already Owner/Trigger-tagged inline in the Quality Attribute Scorecard, not a separate open item.

## Migration Safety (required for brownfield, reverse-spec, or migration work)

| Safety Item | Decision / Evidence | Owner |
|---|---|---|
| Expand/contract shape | **Expand:** `src/redirects/types.ts` gains `RedirectTargetNotAllowedError`; `src/routing/routing.ts`/`index.ts` gain two new exports (`runPreContentPhase`, `runPostContentPhase`); the composition root gains `origin`/`routing` wiring that didn't exist before. **Contract (same PR, no partial cutover):** (1) delete the stale, pre-ADR-039 `SlugChangeCapture` interface from `src/redirects/types.ts` entirely; (2) create `src/redirects/capture.ts` implementing the routing-owned `SlugChangeCapture` (imported from `src/routing`); (3) register it via `registerSlugChangeCapture()` at composition-root boot. All three land together — deleting the stale type without shipping (2)+(3) in the same PR would leave the slot unbound while link-preservation defaults could be enabled; shipping (2)+(3) without (1) would leave two `SlugChangeCapture` names resolvable from `src/redirects/` (the exact ambiguity `spec-manifest.md` flagged and refused to leave unresolved). | Programmer (deletion + new file), Software Architect (this contract), Code Review (verifies all three land in one PR, and that no remaining import in the repo references the deleted stub) |
| Dual-write or read-routing plan | N/A — no existing data to migrate for the stale-type deletion (it is a design-only interface with zero runtime state; `grep` across the repo confirms nothing outside `src/redirects/types.ts` itself imports the stale `SlugChangeCapture`). The `origin`/`routing` composition-root wiring is a first-time wire, not a cutover from an existing wire — no dual-write window applies. | Software Architect |
| Backfill plan | N/A — no existing `redirects`/`redirect_revisions`/`redirect_hits` rows exist anywhere (net-new tables); no existing origin/routing runtime state to backfill (both libraries have never been wired into a running server). | Programmer |
| Reconciliation checks | An integration test asserts: after deleting the stale stub and wiring the real capture implementation, `getSlugChangeCapture()` returns a bound implementation whose `onSlugChange` inserts a `redirects` row + `redirect_revisions` row in the transaction it's called within (AC-18), and that no TypeScript error or duplicate-symbol collision remains anywhere importing from `src/redirects/types.ts` (`tsc --noEmit`, whole project — mirrors ADR-033's own "compiles clean" acceptance bar). | TDD Agent / Code Review |
| Observability proving phase health | The `redirect.created` outbox event (fired post-commit for the auto-capture case too, per ADR-039's transactional-outbox clarification) is the audit signal proving the capture ran; `redirect_revisions` rows are the durable record. No separate migration-specific telemetry is needed since nothing is being migrated (net-new state). | Programmer |
| Rollback test | Because the stale stub, the new capture file, and the registration call all land in one PR (see Expand/contract shape), rollback before merge is simply: don't merge. There is no partial, already-shipped state to roll back from — this is not a live-data migration. | Software Architect (this decision) |
| Cutover approval and timing | Cutover = the single PR described above. No separate approval gate beyond normal Code Review, since no production data or live consumer of the stale stub exists to protect. | Coordinator / Code Review |
| Point of no return | Deleting the stale `SlugChangeCapture` interface from `src/redirects/types.ts`. Safe to do immediately (in the same PR) precisely because nothing else in the repo imports it — confirmed by direct `grep` during this ADR's research pass, not assumed. | Programmer |
| Post-cutover verification | AC-18/AC-19/AC-20's integration tests (capture idempotency, atomicity, no duplicate on retry) plus a manual `/verify`-style pass confirming `tsc -p tsconfig.json --noEmit` is clean for the whole project after the deletion+replacement lands. | TDD Agent, then human/`/verify` |
| **Known accepted gap, not silently assumed** | The content write chokepoint (`src/features/post/post.ts`'s `updatePost`) does **not** call `getSlugChangeCapture()` today, and has no transaction bracket of its own to call it inside — confirmed by direct source read, not inferred. Per `feature.spec.md`'s own Dependencies table, wiring content's chokepoint to call the slot is **explicitly out of this feature's scope**, owed to the content-lib owner. This means: REQ-15/16/17 and AC-18/19/20 are fully buildable and testable **against the `SlugChangeCapture` interface directly** (a test can call `onSlugChange()` inside a manufactured transaction and assert the redirect exists), but the full user-facing journey described in `feature.spec.md`'s "Success signal" (rename a real page through the real admin UI and immediately get a 301) will **not** work end-to-end until that follow-up lands. This is named here explicitly so it is not mistaken for a missed requirement of this feature. | Coordinator (must schedule the `post.ts` follow-up as a named next feature) |

## Re-evaluation Triggers

- Calendar trigger: None — this is a core-only, already-audited design; no forced revisit date.
- Scale trigger: If a single workspace's active `wildcard` rule count regularly approaches the 500 cap (OQ-01, ratified below), revisit the cap value or the reject-vs-evict policy (OQ-02).
- Topology trigger: If the content.db adapter ever moves off a single-connection `better-sqlite3` model (e.g. a future Postgres adapter, or connection pooling), Decision A's ambient-transaction-sharing mechanism must be re-evaluated — it depends on the current single-connection, no-real-concurrency model holding.
- Dependency trigger: If `src/routing/routing.ts`'s `phaseRegistry`/`resolve()` internals change shape (e.g. the promised generalization of `SlugChangeCapture` into an ordered multi-participant registry, per ADR-039's own promotion trigger, now that Menus' binding-index write is acknowledged as a second in-tx participant), `src/redirects/phase-handler.ts` and `capture.ts` must be updated in lockstep — Code Review should flag any `src/routing/` change touching `phaseRegistry`, `SlugChangeCapture`, or the phase-runner exports as needing a `src/redirects/` check.
- Cross-feature trigger: The `post.ts`/content-chokepoint follow-up (Migration Safety's "Known accepted gap") landing is itself a trigger to re-verify AC-18 against the real end-to-end journey, not just the direct `onSlugChange()` call.

## Module / Service Boundaries

```
src/redirects/                            # EXTENDED (stubs already exist) — Tier-2 core library
  INFO.md                                 # NEW: module purpose, mirrors routing/origin INFO.md convention
  types.ts                                # MODIFIED: delete stale SlugChangeCapture interface (lines
                                           #   ~169-185 of the current file); add
                                           #   RedirectTargetNotAllowedError. Everything else
                                           #   (RedirectRecord, RedirectRevision, RedirectHitStats,
                                           #   RedirectRequest, RedirectResolution, CreateRedirectInput,
                                           #   UpdateRedirectInput, ListRedirectsFilter, existing error
                                           #   classes) is unchanged.
  ports.ts                                # UNCHANGED — RedirectRepoPort/RedirectMatcher/RedirectHitSink/
                                           #   RedirectResolver/hook types already fully specified
  redirects.ts                            # NEW: THE write chokepoint — createRedirect/updateRedirect/
                                           #   tombstoneRedirect/importRedirects (REQ-01,04,05,06,07,08,
                                           #   13,14,22,26); loop-collapse + validation; emits
                                           #   redirect.created/.updated/.tombstoned outbox events
  capture.ts                              # NEW: SlugChangeCapture implementation (REQ-15,16,17) — see
                                           #   Decision A; performs NO transaction control of its own
  phase-handler.ts                        # NEW: RedirectResolver + the RouteResolvePhaseHandler adapter
                                           #   registered into routing's pre_content/post_content phases
                                           #   (REQ-09,10,18,19,20); owns the read-path open-redirect
                                           #   oracle call (highest-risk contract, C-013)
  matcher.ts                              # NEW: RedirectMatcher impl — exact/prefix/wildcard matching +
                                           #   validatePattern (REQ-07,19,20,22); pure, no I/O
  hit-sink.ts                             # NEW: RedirectHitSink impl (REQ-21) + the redirect.hit outbox
                                           #   subscriber
  ports.internal.ts                       # NEW: package-private shared insert helper used by BOTH
                                           #   redirects.ts (which opens its own tx) and capture.ts
                                           #   (which assumes an already-open ambient tx) — Decision A
  repo.memory.ts                          # NEW: in-memory RedirectRepoPort adapter (tests)
  repo.sqlite.ts                          # NEW: Drizzle/SQLite RedirectRepoPort adapter (production);
                                           #   manual BEGIN IMMEDIATE/COMMIT for its own writes (matches
                                           #   settings/repo.sqlite.ts precedent); does NOT wrap
                                           #   ports.internal.ts's shared helper in its own transaction
  index.ts                                # NEW: public barrel (mirrors routing/origin index.ts)
  __specs__/                              # NEW: spec-linked test fixtures, mirrors routing/origin/settings
  __tests__/                              # NEW: unit + integration tests

src/routing/routing.ts                    # MODIFIED (brownfield, additive only): exports
                                           #   runPreContentPhase(path, ctx) and
                                           #   runPostContentPhase(path, ctx), thin wrappers around the
                                           #   existing module-private runPhase(); resolve() UNCHANGED
src/routing/index.ts                      # MODIFIED: barrel-export the two new functions

src/infra/db/schema.ts                    # MODIFIED: add 3 Drizzle table defs — redirects,
                                           #   redirect_revisions, redirect_hits (ADR-033 §2)

src/identity/permissions.ts               # MODIFIED: register admin.redirects.manage (REQ-12; frozen
                                           #   admin.<section>.<action> convention per
                                           #   sweep-crosscutting-decisions-20260710.md line 71 — no
                                           #   change from what the spec already directs)

src/server/deps.ts / app.ts               # MODIFIED: FIRST-TIME wiring of src/origin's OriginRegistry
                                           #   (InMemoryOriginSettingRepo + a seeded dev-capability
                                           #   verified origin) and src/routing's registration functions
                                           #   into the composition root; wire redirects repo/matcher/
                                           #   hitSink; register the phase-handler + capture at boot
src/server/routes/types.ts                # MODIFIED: RouteDeps gains redirectRepo, originRegistry (via
                                           #   the redirects-specific RouteDeps extension, mirrors
                                           #   MenuRouteDeps's pattern of not touching the shared file
                                           #   directly where a local extension suffices)
src/server/http/admin/redirects.ts        # NEW: RedirectRouteDeps/Registrar + DTOs (mirrors
                                           #   server/http/admin/menus.ts)
src/server/routes/admin/redirects/        # NEW: one file per endpoint (REQ-01-05,12,23,26)
  list.ts / get-by-id.ts / create.ts / update.ts / tombstone.ts / import.ts / hits.ts
src/server/routes/site/pages.ts           # MODIFIED: GET /:slug wired to call runPreContentPhase()
                                           #   before its content lookup and runPostContentPhase() inside
                                           #   its existing PostNotFoundError catch branch (Decision B)

apps/admin/src/lib/api.ts                 # MODIFIED: add Redirect types + client methods (mirrors the
                                           #   existing Menu block)
apps/admin/src/sections/Redirects.tsx     # NEW: list screen (mirrors Menus.tsx)
apps/admin/src/sections/RedirectEditor.tsx # NEW: create/edit form (mirrors MenuEditor.tsx)
apps/admin/src/App.tsx                    # MODIFIED: import + mount <Redirects />/<RedirectEditor />
```

**Out of this feature's scope (explicitly deferred, not silently dropped):** wiring `src/features/post/post.ts`'s `updatePost` to call the `SlugChangeCapture` slot inside a real transaction bracket (Migration Safety's "Known accepted gap" — owed to the content-lib owner as a follow-up feature); `regex` matchType authoring and `redirects.use_regex` (ADR-033 §8 DEFERRED); edge/CDN redirect compilation; per-hit analytics timeseries; conditional redirects; query-string/matrix-param matching; a CSV import/export UI wizard.

## API / Event Contract Summary

What interfaces does this decision define that other agents must respect?

- `RedirectRepoPort` (`src/redirects/ports.ts`, unchanged) — two adapters (`repo.memory.ts`, `repo.sqlite.ts`); TDD/Programmer must not add a third write path to `redirects`/`redirect_revisions` (INV-07).
- `SlugChangeCapture`/`SlugChangeCaptureInput` (`src/routing`, unchanged, imported not redefined) — `capture.ts` is the only implementer; `registerSlugChangeCapture()` is called exactly once, at composition-root boot.
- `runPreContentPhase`/`runPostContentPhase` (`src/routing/routing.ts`, NEW) — the only sanctioned way a caller interleaves its own content lookup between the two phases; `resolve()` remains available for callers with no interleaving need but is not used by the real site route after this change.
- Admin HTTP endpoints per `api.spec.md` §1: `LIST_REDIRECTS`, `GET_REDIRECT`, `CREATE_REDIRECT`, `UPDATE_REDIRECT`, `TOMBSTONE_REDIRECT`, `IMPORT_REDIRECTS`, `LIST_REDIRECT_HITS` — each gated by `admin.redirects.manage` through `authorize()`.
- `REDIRECT_TARGET_NOT_ALLOWED` error code (errors.spec.md) — new; Programmer must map `RedirectTargetNotAllowedError` (write path only; the read path never raises this as an HTTP error, per REQ-10) to this code at the route layer.
- Every `redirect.created`/`.updated`/`.tombstoned`/`.hit` outbox event is a durable event other future consumers (SEO cache-warm, analytics) can subscribe to without a schema change.

## Enforcement

How do we prevent violations?
- Code Review Agent flags any import of `src/redirects/repo.memory.ts`/`repo.sqlite.ts` from outside `redirects.ts`/`capture.ts` (via `ports.internal.ts`) — the chokepoint boundary is a review-time check, mirroring ADR-022's import-graph canary pattern.
- Code Review Agent flags any file under `src/redirects/` other than `redirects.ts`'s own chokepoint entry and `repo.sqlite.ts`'s own adapter that issues a raw `BEGIN`/`COMMIT`/`BEGIN IMMEDIATE` — `capture.ts` in particular must never open its own transaction (Decision A's correctness depends on this).
- Code Review Agent verifies the phase-handler's read-path `isAllowedRedirectTarget` call (C-013) has direct integration test coverage before approving any phase-handler PR, and flags any code path that could emit a redirect response without that call having run.
- Code Review Agent verifies the stale `SlugChangeCapture` deletion, the new `capture.ts`, and the `registerSlugChangeCapture()` call all land in the same PR (Migration Safety) — no partial cutover.
- Code Review Agent verifies `src/routing/routing.ts`'s existing test suite (`__tests__/routing.test.ts`) still passes unchanged after the two new additive exports land, confirming no regression to `resolve()`'s existing behavior.

## Complexity Justification

*Fill only if Constitution Check has EXCEPTION entries. Empty = no violations.*

| Article Violated | Why This Complexity Is Needed | Simpler Alternative Considered | Why Simpler Alternative Was Insufficient |
|-----------------|-------------------------------|-------------------------------|------------------------------------------|
| — | — | — | — |

## Related Decisions

- Extends: ADR-033 (Redirects, ACCEPTED 2026-07-10) — this ADR implements it; ADR-039 (routing contract v0, ACCEPTED) — this ADR adds two additive exports to its implementation and specifies the site-route wiring ADR-039 itself left open; ADR-040 (core/origin registry v0, ACCEPTED) — this ADR wires it into the composition root for the first time; ADR-022 (write chokepoint/revision discipline); ADR-021 (`authorize()`); ADR-015 (Drizzle); ADR-007 (workspace scoping); ADR-006 (rule-of-two); ADR-026 (no plugin holds a tx handle — the reasoning Decision A's rejected alternative would have reintroduced).
- Relates to: ADR-PIPE-007 (Settings — the sibling implementation-architecture ADR this document's structure and Migration Safety treatment mirror); SPEC-008/ADR-PIPE-008 (SEO, sibling in-flight pipeline ADR sharing `routing`'s `urlFor`/`canonicalUrl` surface — disjoint files, no coordination needed for this dispatch).
