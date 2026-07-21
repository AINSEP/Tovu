# External Audit Packet — ADR-047 Widgets (SPEC-043)

## Ask

- **User request:** Run `/audit-work` against ADR-047 (widgets) and its implementation — the ADR
  cleared a 2-round swarm `/debate` (full 4/4 convergence) on 2026-07-21 and, per this project's
  standing process, owes an external audit pass before it can move from "debate cleared" to
  ACCEPTED.
- **Audit focus:** (1) Does the real implementation (`src/widgets/*`, `src/core/entry-refs/*`)
  actually satisfy the ADR's Debate Fold-In amendments and SPEC-043's REQ/AC/INV set, not just the
  ADR/spec text in isolation? (2) Are the two shared-module changes this feature made
  (`features/entries/field-validation.ts`/`write-service.ts`'s new `owner`/`onWritten` params,
  `navigation/resolver.ts`'s new `resolveMenuDoc` export) safe, additive, and non-breaking for every
  existing caller? (3) Is the four-gap-fix session (commits `c946bbc`, `f9b1952`) accurately
  self-reported, or did it introduce new problems while closing the old ones? (4) Permission-gating
  correctness for REQ-40/41 (`widgets.*` strings) — this is an ordinary authorization-completeness
  check, not a security/vulnerability audit; do not treat it as one.
- **Scope:** custom (ADR + spec + implementation outline + implementation report + real source +
  the two widgets-related commits since the prior stable point)
- **Suggested changes mode:** notes (the domain layer is ~3,700 lines across 30 files plus a
  ~150-line shared-module diff; grounded patch proposals are welcome for specific files you reviewed
  in depth, but a blanket patches-for-everything mode would invite ungrounded diffs at this volume —
  say so if you want to escalate any specific finding to a diff)
- **Audit target:** `HEAD` (commit `f9b1952`) vs. the pre-widgets baseline (`9179e67`, the last
  commit before any widgets work landed) for `src/widgets/`, `src/core/entry-refs/`,
  `src/features/entries/{field-validation,write-service}.ts`, `src/navigation/resolver.ts`. Plus
  the ADR/spec/outline/report as the intended-behavior reference.
- **Planned auditors:** codex (gpt-5.5, reasoning=high, per saved project-knowledge preference) +
  agy (Gemini 3.1 Pro High)
- **Authoring packet:** this file, plus its two appendices, all under
  `ADS-project-knowledge/.local-artifacts/external-audit/packets/20260721T171409Z-adr047-widgets-*`
- **Dispatch packet:** self-contained `-COMBINED.md` (this file + appendices concatenated),
  delivered via stdin/`--print` to both auditors — no live repo file access required, so no staging
  needed for agy.

## Threat Model & Scope Contract (frozen)

- **Threat model id:** `TM-adr047-widgets-audit-001` — **hash:** `sha256:bae8244866587b7ebc65cdb240808e355c613350a82e4e614627a3dcb962fae8` (frozen before dispatch).
- **Audit round:** 1 (no prior `/audit-work` pass exists for this ADR/spec/implementation — this is
  the ADR's first external audit; the ADR itself already cleared a separate swarm `/debate`, which is
  a distinct process from this audit).
- **Intended use / deployment context:** Server-side domain library (`src/widgets/`,
  `src/core/entry-refs/`) inside a multi-tenant CMS backend (Tovu). Callers are: (a) an HTTP admin
  API layer (not yet built — disclosed, see below) that will authenticate a human operator session
  and call these functions on their behalf; (b) an AI agent tool surface (not yet built — disclosed)
  that will call the same functions as a delegated principal; (c) a page-render pipeline
  (`resolvePageWidgets`) invoked server-side on every public page request, never client-facing code.
  No part of this slice runs in a browser or is exposed directly to an unauthenticated caller without
  going through the (not-yet-built) route layer's `authorize()` gate — but the domain functions
  themselves ARE the actual enforcement point (`requireWidgetPermission` inside
  `write-service.ts`/`region-area-service.ts`), so authorization-completeness at THIS layer is
  in-scope and load-bearing regardless of what route layer eventually calls it.
- **Allowed actors & capabilities:** A human operator holding one or more `widgets.*` permissions,
  scoped to one workspace. An AI agent acting as a delegated principal whose effective permission is
  the intersection of its own grant and its delegating user's grant (ADR-021's standing model,
  unchanged by this feature). A "system" actor (`WIDGETS_SYSTEM_ACTOR_ID`) for boot-time/theme-
  activation seeding only (`bindWidgetArea`), which performs no `authorize()` check by design
  (mirrors `navigation`'s identical boot-seeding precedent) — this is a deliberate, documented
  exception, not a gap; verify it is genuinely unreachable from any request-scoped caller.
  No actor may act outside their own `workspaceId` (multi-tenant isolation is a standing invariant of
  the underlying `entries` chokepoint this feature composes, not reinvented here).
- **In-scope blocking failure domains (ALLOWLIST):**
  1. **Authorization bypass** — any code path where a widget mutation (create/update/place/
     trash/purge/embed-insert/embed-remove) executes without its required `widgets.*` permission
     check succeeding first, for either a human or AI-originated call (REQ-40/41, INV-07).
  2. **Cross-workspace data leakage or mutation** — any code path where an actor in workspace A can
     read, reference, or mutate an entry/binding/ref belonging to workspace B.
  3. **Reference-integrity / safe-delete violation** — `entry_refs` failing to reflect the true
     current reference graph (stale rows, missing rows, or rows attributed to the wrong workspace),
     such that REQ-42's safe-delete guard or REQ-34's where-used disclosure could give a wrong
     answer (INV-06, INV-09).
  4. **Concurrency/OCC violation** — a `widget_area` placement-list mutation or widget-instance
     update that loses or silently corrupts a concurrent write instead of rejecting it as a typed
     conflict (INV-02, INV-03, REQ-06/15, AC-04/AC-09, EC-02).
  5. **Resolver failure escaping isolation** — a widget resolver's exception, hang, or invalid output
     propagating past the page-render orchestration boundary and crashing/hanging the surrounding
     page render, or leaking internal error detail (stack trace, correlation internals, config
     secrets) into public HTML output (INV-05, REQ-27/28, AC-19/20).
  6. **Widget-in-widget recursion** — any mutation path (live editor OR the not-yet-built
     server-side/AI command path) that persists a `widgetEmbed` node inside a widget instance's own
     stored data, at rest, regardless of nesting depth (INV-04, REQ-19).
  7. **Registry code-injection surface** — a widget-type registration's `resolverId` (or any other
     registry-data field) being usable, through any code path, as a dynamic import path, `eval`-style
     reference, or arbitrary function/module lookup instead of resolving only through the closed
     `CORE_RESOLVERS` map (REQ-08).
  8. **Contact Form pipeline duplication** — the `contact-form` widget type persisting a submission,
     sending mail, or performing rate-limiting itself, instead of delegating 100% to `src/forms/`'s
     existing, unmodified pipeline (INV-08, REQ-39).
  9. **Shared-module regression** — the changes this feature made to `features/entries/
     {field-validation,write-service}.ts` and `navigation/resolver.ts` (new optional `owner`/
     `onWritten` params, new `resolveMenuDoc` export) changing behavior for ANY existing caller that
     does not opt into the new parameters (every other content type in the system: posts, pages,
     forms, redirects, SEO, comments, menus, collections, …).
  10. **Unrecoverable crash on normal, in-scope use** — a normal (non-adversarial) call sequence
      through the implemented functions (CRUD, region mutation, resolution) throwing an unhandled
      exception or producing a corrupted persisted state, for any documented REQ/AC/EC in
      SPEC-043.
- **Mandatory invariants (verbatim from SPEC-043, in scope for this audit):** INV-01 through INV-09
  as written in `feature.spec.md`'s Invariants section (config validity, binding-table
  derivability, whole-document OCC, no embed recursion, resolver failure isolation, entry_refs
  same-transaction atomicity, permission-gating, Contact Form non-duplication, safe-delete).
- **Blocking impact threshold:** A finding blocks if an ALLOWED actor, under NORMAL (non-exotic)
  operation of the code AS WRITTEN (not a hypothetical future caller), can violate a mandatory
  invariant or land in one of the 10 domains above — with concrete evidence (a code path, not
  speculation). A finding about code that does not exist yet (the route/UI/AI-tool layer — see
  "Explicit non-goals" below) is out of scope unless it demonstrates the DOMAIN layer itself
  (what does exist) is unsafe to build that layer on top of.
- **Risk tier & score floor:** medium — floor **8.5**. (Domain-layer library code, not yet wired to
  a live HTTP surface or real user traffic; real invariants around money/PII-adjacent data — Contact
  Form/mail delegation — are in scope, which is why this isn't "low," but nothing here is internet-
  reachable yet, which is why this isn't "high.")
- **Gate formula (deterministic):** `blocking_gate = FAIL` iff `(count(validated unresolved
  blockers) > 0) OR (score < 8.5)`. Independent terms; neither rescues the other. The Coordinator
  recomputes this from your returned validated blockers + score.
- **Explicit non-goals (NOT in scope for this audit — do not flag their mere absence):**
  - The admin HTTP routes, AI-tool registrations, and admin UI (`WidgetsLibrary.tsx`/
    `WidgetPlacement.tsx`, the TipTap `widgetEmbed` editor extension) — **confirmed genuinely not
    started**, a separate concurrent effort is building this now. Do not flag "no routes exist" or
    "no UI exists" as a finding; DO flag if the domain layer's current shape would make building that
    layer unsafe or would force it to reimplement enforcement the domain layer should own.
  - Boot-time wiring of `wireCoreResolvers`/`registerCoreResolver` against real repo adapters — also
    confirmed not yet called anywhere (see `resolvers/index.ts`'s own doc comment). This means
    `CORE_RESOLVERS` is empty at runtime today; every dynamic widget type would currently resolve to
    `resolver-error` if rendered. This is a disclosed, known, pre-route-layer gap — do not report it
    as a new finding, but DO evaluate whether the *dispatch design* (`resolveWidgetType`) is correct
    for when wiring lands.
  - `bodyJson.placements`/literal REQ-11 storage-path wording: the implementation report discloses
    that `widget_area` placements actually live in `fieldsJson.ext.widgets.payload` (JSON-serialized),
    not literally in `entry.bodyJson`, because `features/entries`' `updateEntry` has no parameter to
    change `bodyJson` after creation. This is a KNOWN, DISCLOSED deviation — do not report its mere
    existence as a new finding. DO evaluate whether the deviation is actually behavior-safe (does
    `core/entry-refs/extractor.ts`'s extraction still correctly find the placement list given where
    it actually lives? does `resolvePageWidgets` read from the same actual location?).
  - Any change to `src/forms/`'s own submission/rate-limit/mail pipeline — out of scope by design
    (REQ-39); flag ONLY if the `contact-form` resolver imports or duplicates any part of it.
  - Whether SPEC-043 was produced by the formal Spec Agent + validator pipeline (it was authored
    directly by the Coordinator in-session, disclosed in `spec-manifest.md`) — a process-provenance
    fact, not a correctness question for this audit.

## Prior-Round Disposition Ledger

_Empty — round 1, first external audit for this `TM-<id>`._

## Work Log

- **2026-07-20/21:** ADR-047 drafted, then stress-tested by a 2-round swarm `/debate` (Primary Claude
  Sonnet 5, agy/Gemini 3.1 Pro High, Codex GPT-5.6-sol, Fable) — full 4/4 convergence, 6 amendments
  folded into the ADR's "Debate Fold-In" section. SPEC-043 (`feature.spec.md`, 45 REQs/30 ACs/9
  INVs/8 ECs) + `spec-manifest.md` + an implementation outline produced from that convergence, all in
  the same session.
- **Commit `03a8781`:** Real type/port/error contracts for `src/widgets/`/`src/core/entry-refs/`, a
  certified TDD suite (33 tests, red-first), then a scoped implementation dispatch made 32/33 pass
  against real infrastructure (in-memory adapters over the real `features/entries` chokepoint). One
  remaining test (`AC-29/REQ-42`) initially had two authoring bugs (wrong function under test, no
  actual referencing placement) — fixed in the same commit.
- **Commit `c946bbc`:** Fresh baseline verification — full suite run twice (1734 tests, 1732 pass, 2
  pre-existing unrelated failures both times, confirmed untouched by widgets work). The
  previously-flagged `AC-29/REQ-42` test confirmed genuinely passing (not vacuous — creates a real
  referencing placement, then asserts the purge-without-force rejection). A stale file-header
  comment corrected. Four implementation gaps independently re-verified against live source (not
  just trusting prior comments) and DECIDED to leave as logged technical debt (see implementation
  report Step 2) — all four live in shared modules (`features/entries/*`, `navigation/resolver.ts`)
  this task was scoped not to edit.
- **Commit `f9b1952`:** Owner reviewed the four logged-debt decisions and directed all four be fixed
  immediately instead. Done in increasing-risk order, typecheck + relevant suite run after each, full
  suite run twice at the end (1736 tests, 1734 pass, same 2 pre-existing unrelated failures both
  times). Full narrative of what changed for each gap is in the implementation report's Step 4 and
  is included verbatim in this packet — **read it in full**, it is the single most detailed
  first-person account of what changed and why.
- **This audit dispatch:** Coordinator (Claude Sonnet 5) independently re-read every file under
  `src/widgets/`, `src/core/entry-refs/`, and the shared-module diff before building this packet —
  not just trusting the implementation report's self-description. Candidate issues the Coordinator
  found during that read are listed under "Coordinator's Own Pre-Dispatch Findings" below,
  specifically so you can independently confirm, refute, or extend them — treat them as leads to
  verify, not as pre-settled conclusions.

## Files And Artifacts

| Path | Why it matters |
|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-047-widgets-region-and-embed-placement.md` | The governing ADR, especially the 2026-07-21 Debate Fold-In section (6 amendments) — included in full below |
| `ADS-project-knowledge/specs/043-widgets/feature.spec.md` | The certified spec: 45 REQs, 30 ACs, 9 INVs, 8 ECs — included in full below |
| `ADS-project-knowledge/specs/043-widgets/spec-manifest.md` | Package index + disclosed provenance deviations — included in full below |
| `ADS-project-knowledge/reports/pipeline/043-widgets/implementation-outline.md` | Module/contract/wiring map produced from the spec — included in full below |
| `ADS-project-knowledge/reports/pipeline/043-widgets/implementation-report.md` | First-person account of baseline verification + all 4 gap-fix decisions and their eventual fixes — included in full below, **read in full** |
| `src/widgets/*.ts`, `src/widgets/resolvers/*.ts`, `src/widgets/__tests__/**` | The real domain implementation + its TDD suite — full content in Appendix A |
| `src/core/entry-refs/*.ts`, `src/core/entry-refs/__tests__/**` | The `entry_refs` slice + its test — full content in Appendix A |
| `src/features/entries/field-validation.ts`, `write-service.ts` (diff only) | The shared chokepoint's new `owner`/`onWritten` extension points — diff in Appendix B |
| `src/navigation/resolver.ts` (diff only) | The new `resolveMenuDoc` export the `menu` widget resolver depends on — diff in Appendix B |
| `src/infra/db/schema.ts` (excerpt) | The real `entry_refs`/`widget_region_bindings` Drizzle table definitions — excerpt in Appendix B |
| `src/identity/permissions.ts` (excerpt) | The real `widgets.*` permission registrations — excerpt in Appendix B |

## Validation

- **Checks run (by the implementing session, per the implementation report):** `npm run typecheck`
  (clean), full suite run twice before the gap fixes (1734 tests, 1732 pass, 2 pre-existing unrelated
  failures both times — `redirects-site-serving.test.ts`/`seo-site-serving.test.ts`, confirmed
  untouched by widgets work via `git show --stat`), full suite run twice after the gap fixes (1736
  tests, 1734 pass, same 2 pre-existing failures both times).
- **Checks NOT run (Coordinator's own observation, not self-reported by the implementation report):**
  No test anywhere in `src/widgets/__tests__/` or `src/core/entry-refs/__tests__/` exercises the real
  `SqliteEntryRepo`/`SqliteEntryRefsRepo`/`SqliteWidgetRegionBindingRepo` adapters — every widgets
  test uses `InMemoryEntryRepo`/`InMemoryEntryRefsRepo`/`InMemoryWidgetRegionBindingRepo` exclusively
  (verified by grep — zero matches for `Sqlite*Repo` imports anywhere under
  `src/widgets/__tests__/` or `src/core/entry-refs/__tests__/`). The implementation outline's own
  "Test Expectations" section promises "one shared contract-test suite run against each port's
  `repo.memory.ts` and `repo.sqlite.ts` adapters" for both new ports (`EntryRefsRepoPort`,
  `WidgetRegionBindingRepoPort`) — that suite does not exist in the repo as of this audit. This means
  the implementation report's Step 4 claim that entry_refs extraction "genuinely rolls back the whole
  write" under SQLite's real `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` is a claim about the CODE'S DESIGN
  (verified true by reading `features/entries/write-service.ts`'s transaction plumbing directly — see
  Appendix B) but is not exercised end-to-end by any automated test against the real SQLite adapters
  together. See Coordinator's Own Pre-Dispatch Findings #1 below.
  No test in this repo runs `npm run build`/`npm run typecheck` from a fresh clean state as part of
  this specific audit dispatch — the Coordinator relied on the implementation report's self-reported
  typecheck-clean claim rather than re-running it independently before this dispatch. Flag if you
  believe independent re-verification is warranted before this can be marked ACCEPTED.
- **Known caveats:** The route/UI/AI-tool layer does not exist yet (explicit non-goal above). Boot
  wiring for dynamic resolvers does not exist yet (explicit non-goal above). This audit therefore
  evaluates a domain library in isolation, one layer below what will eventually be internet-facing.

## Out-Of-Scope Local Changes

- `ADS-project-knowledge/reports/architecture/ADR-INDEX.md` — currently has an uncommitted local
  modification (a one-line status update for ADR-031/Comments, unrelated to widgets). Not part of
  this audit.
- `src/server/http/site/render.ts` — currently has an uncommitted local modification (an SEO
  page-head `<title>`-fold change, unrelated to widgets — appears to be concurrent work from a
  different in-flight task). Not part of this audit; do not review it.

## Internal Verification Findings (mandatory pre-external-audit pass — verify independently)

Per this project's `/audit-work` protocol, a curated, rationale-stripped evidence packet (spec/ADR/
outline/real-source/diffs only — the implementer's own implementation report was deliberately
withheld) was given to an internal falsification-framed verifier before this external dispatch. It
scored the work **6.5/10** (below this contract's 8.5 floor) and returned an **Escalation** gate
recommendation (not a hard blocker — external audit is proceeding as required for medium-risk work
regardless). Its two highest-confidence findings, which the Coordinator independently re-confirmed by
direct grep/read against the actual file tree before writing this section, are surfaced here so you
can verify them yourselves rather than the Coordinator asserting them unchallenged:

1. **`src/widgets/embed-service.ts` does not exist anywhere in the delivered code.** The
   implementation outline's own Contract Map names it as C-007
   (`insertWidgetEmbed`/`removeWidgetEmbed`/`reorderWidgetEmbeds`) — the server-side, versioned
   document-mutation path SPEC-043 REQ-44/REQ-45 require and ADR-047's Debate Fold-In **Amendment 6**
   exists specifically to add ("agent-native mutation must not depend solely on a live editor" — the
   gap Codex caught in Round 1 of the swarm debate that produced this ADR). `WidgetEmbedGuardrailError`
   is defined in `errors.ts` with a doc comment naming this exact file as its intended thrower, but is
   never thrown anywhere in the delivered code (confirmed: `ADS-project-knowledge/.../appendix-source.txt`
   contains exactly one substring match for "embed-service", inside a comment in a different file — no
   `===== FILE: src/widgets/embed-service.ts =====` block exists). AC-11 and AC-30 (both P1) have no
   implementation or test behind them. This gap is NOT on this packet's "Explicit non-goals" list
   (which discloses only the HTTP-route/UI/AI-tool layer as absent) — `embed-service.ts` is a
   domain-layer file, the same class as `write-service.ts`/`region-area-service.ts`, both of which
   ARE fully delivered. **Independently confirm: is this in fact undelivered, and if so, is it
   correctly a blocker for ACCEPTED status (not necessarily for this specific audit round, since it
   may be intentionally sequenced next) or should it have been disclosed as a known gap the way the
   other four implementation gaps were?**
2. **No `widgets.read`-gated read/list accessor exists** in `write-service.ts` or anywhere else in
   the package (confirmed: `grep -n "export.*function" src/widgets/write-service.ts` returns only
   `create`/`update`/`trash`/`purge` — no `get`/`read`/`list`). REQ-04 ("a principal holding
   `widgets.read` can read a widget instance's current state and its full revision history") has no
   dedicated implementation; AC-01's "a subsequent read returns it unchanged" is verified in the
   existing tests only against `createWidgetInstance`'s own return value, never an independent read
   call gated by `widgets.read`. **Independently confirm this gap and assess its severity** — is
   `widgets.read` enforcement entirely absent from the domain layer, or does some other delivered
   function implicitly cover it that the Coordinator and internal verifier both missed?

The internal verifier's other findings (INV-06 same-transaction atomicity unproven by any test since
every test uses in-memory-only adapters; AC-28/permission-denial path has zero test coverage; a
force-purged widget's own outgoing `entry_refs` rows are never retracted; the real `recent-entries`
resolver does an unbounded, unfiltered `listByWorkspace` scan with no dedicated test; a
non-exhaustive `sourceKind` ternary in `purgeWidgetInstance`'s referencing-list builder; several
stale "TDD-stub, currently RED" doc-comments in fully-implemented files) are lower-confidence or
lower-severity but included in Appendix A/B's raw material for you to independently assess — do not
take the above two as the only things worth checking.

## Coordinator's Own Pre-Dispatch Findings (verify independently — not pre-settled)

The Coordinator read every file in Appendix A directly (not just the implementation report's
self-description) before building this packet. These are leads, not conclusions — confirm, refute,
or extend each one with your own independent read of the actual code:

1. **No SQLite-backed test coverage for either new port.** See "Checks NOT run" above. Is this a
   blocker (domain #3/#9 — reference-integrity claims not actually proven against the production
   adapter) or an advisory (the design is sound by inspection, and in-memory coverage is adequate for
   a pre-route-layer library)? Your call — but the specific missing-suite claim itself is verified
   fact, not speculation.

2. **`resolveWidgetType`'s resolver-id-to-map-key cast** (`src/widgets/resolvers/index.ts`, the line
   `CORE_RESOLVERS[registration.resolverId as WidgetTypeKey]`). `resolverId` is declared as an opaque
   `string` in `types.ts` (matching REQ-08's framing: "resolverId... indexes into a closed core-owned
   map"), but `CORE_RESOLVERS` is typed `Partial<Record<WidgetTypeKey, WidgetResolver>>` — keyed by
   widget TYPE key, not by resolver id. In the current v1 registry every `resolverId` happens to equal
   its own `typeKey` (`recent-entries`→`recent-entries`, `menu`→`menu`, `contact-form`→`contact-form`),
   so this works today and fails safely (an unresolvable cast just falls through to `resolver-error`,
   not a crash — verified: `if (!resolver) { ...results.set(instance.id, { ok: false, reason:
   "resolver-error" })... }`). Is this future risk worth flagging now (REQ-08's own stated intent is a
   resolver-id-keyed map, and a future SHARED resolver across two types — a legitimate pattern — would
   silently degrade to `resolver-error` for one of them with no compile-time signal), or is it
   appropriately deferred since it doesn't affect any REQ/AC as currently registered?

3. **`trashWidgetInstance`/`purgeWidgetInstance` omit the `onWritten` hook** that
   `createWidgetInstance`/`updateWidgetInstance`/`region-area-service.ts`'s mutations all pass. Verify:
   is this actually behavior-neutral (does `extractAndStoreInstanceRefs`'s input — `widgetType`+
   `config` — genuinely never change on a status-only `trash`/`purge` transition, making
   re-extraction a no-op either way), or is there a scenario where a trashed/purged widget instance's
   OWN outgoing config-field refs (e.g., a trashed `contact-form`'s `formDefinitionId` reference) stay
   stale in `entry_refs` in a way that matters for REQ-42's safe-delete check on the TARGET (the Forms
   definition) or REQ-34's where-used disclosure? Trace an actual scenario, don't just accept the
   "no-op" framing at face value.

4. **Is the `bodyJson.placements`→`fieldsJson.ext.widgets.payload` storage deviation actually
   internally consistent end-to-end?** Confirmed: `region-area-service.ts`'s
   `extractAndStoreAreaRefs` correctly passes `payload.doc` (the parsed, real placement list) as the
   `bodyJson` param to `extractEntryRefs`, and `resolvePageWidgets` correctly reads placements via
   `parseWidgetAreaPayload(areaEntry.fieldsJson)`, not `areaEntry.bodyJson` — so despite the storage
   location differing from the ADR/spec's literal wording, both the extraction path and the
   resolution path agree on where the real data lives. Independently confirm this holds for every
   read/write site, not just the two the Coordinator checked.

## Open Questions

- Does the domain layer as built give the still-to-be-written route/AI-tool layer everything it needs
  to enforce REQ-40/41/INV-07 correctly, or does anything about the current function signatures make
  it easy for a future route handler to accidentally bypass `requireWidgetPermission` (e.g., by
  calling a lower-level helper directly instead of the public CRUD functions)?
- Is the widget-type registry's Tier-1-safety claim (REQ-07/08 — registration data can never name
  arbitrary executable code) actually enforced as a structural guarantee, or only as a convention a
  future registration author could violate by adding a new field nobody reviews for this property?

## Auditor Instructions

Please review this work independently. Use the Ask section's `Audit target` and this packet (plus
Appendix A: full source, Appendix B: shared-module diffs/schema/permissions) as the source of truth
for what to inspect. Evaluate strictly against the frozen **Threat Model & Scope Contract** above —
do not silently revise it.

Do not assume any other auditor has seen the same issues you see. Return your own review only; the
Coordinator will synthesize across auditors after all independent responses are collected.

Mindset: do not assume defects exist. **Attempt to falsify every mandatory invariant; a zero-findings
result is valid** if the evidence supports it. Do not manufacture speculative findings to look
thorough.

**Threat-model handshake (acceptance is the FIRST thing you compute, reported as
`threat_model_accepted`/`rejection_reason` inside the single object below — do NOT emit a separate
JSON block).** Before accepting, independently enumerate the artifact's actual normal-use surfaces,
actors, capabilities, and material failure classes, then compare them to the contract's allowlist.
**Reject** (`threat_model_accepted: false`) if the allowlist omits a material normal-use failure
class, under-specifies the adversary for this artifact, or appears narrowed to guarantee a pass;
state the omission in `rejection_reason`. If you reject, return the object with empty `findings` and
do not score.

**Round behavior.** This is round 1 — perform a full threat-model pass over the named surfaces (the
real `src/widgets/`/`src/core/entry-refs/` implementation plus the shared-module diff), grounded
against the ADR/spec/outline/report's stated intent.

**Blocker rule.** A finding is a **blocker only if** an allowed actor/execution violates a mandatory
invariant with concrete evidence, AND it maps to exactly one **in-scope blocking failure domain**
from the allowlist (1-10 above), AND it meets the blocking impact threshold. Decide this BEFORE
assigning any score. Anything that fails this test is `advisory`, `out-of-scope`, or `unsupported` —
never a blocker.

**No denylist routing.** You may not escalate an excluded concern (the explicit non-goals list above)
by renaming its class. To raise something resembling an excluded item, prove it occurs during normal
in-scope operation or that the excluded premise is unnecessary — and map it to an allowlist domain.

**Escape valve.** If you find a catastrophic issue OUTSIDE the pinned threat model, do NOT lower the
score or block the gate — record it in `out_of_scope_fatal_warnings` so the human still sees it.

Return a single structured object plus prose, in this shape:

```json
{
  "threat_model_accepted": true,
  "rejection_reason": "",
  "auditor_scope_check": "what you audited, active scope/target, files reviewed, any mismatch",
  "ledger_updates": [],
  "findings": [{
    "id": "...", "severity": "blocker|high|medium|low",
    "in_scope_domain": "<allowlist domain 1-10 or null>",
    "rationale": {"checked": "...", "expected": "...", "observed": "...",
                  "why_it_matters": "...", "recommended_fix": "...", "confidence": "high|medium|low"}
  }],
  "out_of_scope_fatal_warnings": [],
  "score": 0,
  "score_rationale": "one sentence",
  "blocking_gate": "PASS|FAIL — set FAIL if ANY validated blocker is unresolved OR score is below 8.5",
  "closure": "COVERAGE_COMPLETE — round-1 coverage finished under TM-adr047-widgets-audit-001; see blocking_gate for the pass/fail outcome."
}
```

Severity taxonomy: `blocker` = must fix before relying on the work; `high` = real risk if ignored;
`medium` = notable improvement or maintainability risk; `low` = minor polish. Include file references
whenever possible. Then add prose for: what looks solid and should stay unchanged; and — per this
packet's `notes` suggest-changes mode — file-level edit guidance and concise replacement snippets for
anything you'd change, grounded only in files you actually reviewed (Appendix A/B).

---

# APPENDIX SOURCES FOLLOW BELOW

The remainder of this combined packet is:
1. `ADR-047-widgets-region-and-embed-placement.md` (full text)
2. `feature.spec.md` (SPEC-043, full text)
3. `spec-manifest.md` (full text)
4. `implementation-outline.md` (full text)
5. `implementation-report.md` (full text)
6. Appendix A — full current source of every file under `src/widgets/` and `src/core/entry-refs/`
   (implementation + tests)
7. Appendix B — diff of the shared-module changes (`features/entries/field-validation.ts`,
   `write-service.ts`, `navigation/resolver.ts`), the `entry_refs`/`widget_region_bindings` schema
   excerpt, the `widgets.*` permissions excerpt, the widgets-scoped commit log, and current
   `git status --short`.
