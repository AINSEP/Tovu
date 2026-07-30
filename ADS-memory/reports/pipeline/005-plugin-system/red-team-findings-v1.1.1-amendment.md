# Red-Team Findings: plugin-system — v1.1.1 Amendment (UI + `plugin.tier`)

- Feature: FEAT-005-plugin-system
- Spec version reviewed: 1.1.1
- Spec hash reviewed: sha256:057bcf45540398391aa7ac4b96a451bf1f8ee256ebcc75e8335f7ab53f29d479
- Red-Team completed: 2026-07-28
- Red-Team agent: Claude Sonnet 5 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this
  session, confirmed below)
- **Scope of this pass:** ONLY the material added since the 2026-07-07 pass recorded in the
  sibling `red-team-findings.md` (historical, untouched): REQ-12…17 / AC-18…25 / EC-11 /
  `ui.spec.md` (the 1.1.0 plugins list+toggle admin screen) and the `plugin.tier` addition to
  REQ-01 / `state.spec.md` / `behavior.spec.md` (the 1.1.1 fix). REQ-01…11's pre-existing content
  (apart from the `tier` addition) was **not** re-probed except where it forms a fresh interaction
  with the new material, per the dispatch's own instruction.
- Finding count: 0 BLOCKING · 5 ADVISORY · 0 CONSTITUTION_FLAG

---

## Explicitly-Requested Probes — Disposition

The dispatch asked three specific questions to be checked against the evidence. Recorded here for
traceability before the numbered findings (these are not themselves RT-numbered — they came back
clear, or their concrete manifestation is captured as a finding below):

1. **Does REQ-16's error display correctly cover a plugin invalidated by the new required `tier`
   field?** — **Confirmed clear.** `errors.spec.md` §3 assigns a missing/invalid `tier` to the
   already-existing `MANIFEST_MALFORMED` code (no new code was invented). `PLUGINS_LIST`'s
   `errors[]` shape (`{code, file, message}`, `api.spec.md` §5 / `state.spec.md` §2
   `PluginDiscoveryRecord`) is generic — REQ-16/AC-24 render *any* invalid/incompatible row's
   `errors[]` entries by `code`+`message`, with no special-casing per code. A tier-invalid manifest
   therefore renders through the exact same generic path as an engine-invalid or hook-invalid one.
   No gap between the two features here. (A related, more concrete version of this same question
   is captured as RT-009 below — not a display gap, but a **fixture-construction** gap for TDD.)
2. **Does `tier` becoming required retroactively invalidate any previously-valid manifest, and is
   there a migration story?** — **Confirmed clear, evidence-based.** `src/` was grepped for
   `definePlugin`, `PluginManifest`, `tovu.plugin.json`, and `plugin_activations`: no plugin
   manifest exists anywhere in code (the only `pluginTier` hit in `src/features/plugins/store/
   store-plugin.ts` is the unrelated, already-approved SPEC-032/ADR-023 `DataModuleDecl.pluginTier`
   encoding, not a SPEC-005 plugin manifest). v1 is genuinely pre-launch; REQ-01's own revision note
   already declares `word-count` will carry `tier: "tier-3"`. No migration story is needed. See
   RT-009 for the one place this *does* need an explicit note (a shared test fixture, not a shipped
   artifact).
3. **Does the new UI material imply custom implementation where an existing library/pattern should
   be reused?** — **Confirmed clear, verified against real source, not just the spec's claims.**
   `apps/admin/src/sections/Roles.tsx` and `Redirects.tsx` were read directly. Every convention
   `ui.spec.md` §0 cites was checked against the actual code: `list-table`/`notice`/`notice error`
   classes, the `toggleStatus`-style single button whose label names the action, `Roles.tsx`'s
   `rowSavingId` per-row in-flight pattern (correctly cited as the *deliberate* choice over
   `Redirects.tsx`'s coarser single global `saving` flag — verified both actually exist as
   described), the built-in-row-shows-`—` idiom, and the `App.tsx` `case "section":` ternary-chain
   dispatch with `Placeholder` fallback (verified line-for-line against `apps/admin/src/App.tsx`).
   All citations are accurate, not aspirational. No new component library, modal system, or state
   pattern is introduced. This is a clean example of Article I/III compliance, not a flag.

---

## BLOCKING Findings

None. No item below prevents an AC from being written as a deterministic, automatable test, and
none contradicts another AC/REQ outright.

---

## ADVISORY Findings

### RT-007
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: EC-11 (double-activation guard) × REQ-13
- Description: EC-11 is titled generically ("What happens when an operator activates a row's
  enable/disable toggle a second time before the first request's response has arrived?") but its
  answer only covers **one render instance** of the screen: the disabled-button/in-flight-state
  guard is per-component-instance client state. It says nothing about — and does not need to,
  since it explicitly declines the one mechanism that would — two **separate sessions** (two
  browser tabs, or two different operators) both viewing `#/section/plugins` and clicking
  "Enable"/"Disable" on the **same plugin id** at nearly the same time. EC-11 explicitly states
  "this UI does not send [an `Idempotency-Key`] in v1... the client-side single-flight discipline
  is the operative guard, not a server-side dedupe key" — which, read carefully, means the
  cross-session case has **no stated guard at all**. What the `PLUGIN_SET_ENABLED`/BR-05 backend
  actually does when two concurrent `{enabled:true}` PATCH requests arrive for a plugin that is
  already `enabled:true` after the first one lands (silent no-op 200? a second, spurious change
  set? a state-machine assertion failure?) is not specified anywhere in this package. This is a new
  question raised by EC-11's own wording, not a re-litigation of the original REQ-07 gateway design
  (which was cleared in the 2026-07-07 pass without this specific interleaving being named).
- Suggested resolution: Either (a) narrow EC-11's own wording to state explicitly that its guarantee
  is scoped to a single rendered screen instance, and add one sentence on what BR-05 does for a
  same-transition repeat request from a second session (e.g., "a second `{enabled:true}` request
  against an already-`enabled:true` plugin is a no-op 200, no additional change set" — if that is
  in fact BR-05's intended behavior, this should be stated as a rule, not left implicit); or (b)
  accept the residual risk explicitly as out of scope for v1 (single-admin-operator assumption,
  consistent with the rest of this admin app) and say so in EC-11 rather than only in the negative
  ("this UI does not send one").

### RT-008
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-17 × `apps/admin/src/nav.ts` (existing code, lines ~135–144)
- Description: The live `plugins` nav entry in `nav.ts` currently carries a comment block reading,
  in part: *"SPEC-045 (scoping memo, BLOCKED pending an owner decision on Options A/B/C): no plugin
  loader/artifact/registry exists in this codebase yet (SPEC-005 is APPROVED but unimplemented) —
  `href` removed and `soon: true` restored so this entry doesn't point at a route with nothing real
  behind it. See `ADS-memory/specs/045-plugins-admin/feature.spec.md` before building
  anything here."* That decision is no longer pending — SPEC-045's Option A was greenlit by the
  owner on 2026-07-28 and is exactly what this amendment implements (confirmed by reading
  `specs/045-plugins-admin/feature.spec.md` directly: Option A is "treat this as finish SPEC-005,
  then add the thin admin UI," which is precisely REQ-12…17). REQ-17's own text only specifies that
  `href` is restored and `soon: true` is dropped — it says nothing about the surrounding comment.
  If a Programmer edits only the two fields REQ-17 literally names and leaves the comment verbatim,
  the shipped code will contain an actively false, contradictory statement ("BLOCKED pending an
  owner decision... see [scoping memo] before building anything here") sitting directly on the
  entry that decision now unblocks — confusing for the next person who reads it.
- Suggested resolution: Add one clause to REQ-17 (or a note in `ui.spec.md` §1) instructing that the
  stale SPEC-045-blocked comment be replaced or removed as part of this edit, e.g. "note: SPEC-005
  v1.1.1 ships REQ-12..17, resolving SPEC-045 Option A" or simply deleted.

### RT-009
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: AC-11 (REQ-10, already-cleared) × AC-18 (REQ-12, new) — shared fixture
- Description: AC-18 explicitly reuses AC-11's fixture ("the AC-11 fixture": built-in `word-count`
  plus one valid and one invalid site plugin) to assert the UI renders exactly three rows. AC-11's
  fixture was authored (in spec-abstract form; no concrete manifest JSON lives in the spec text)
  before the 1.1.1 `tier` fix existed. Per REQ-01/BR-02/§10 as amended, `tier` is now a required
  field with no safe default — a manifest missing it is `invalid` with `MANIFEST_MALFORMED`,
  full stop. If TDD builds the shared AC-11/AC-18 fixture's "valid" site plugin manifest without
  adding `tier: "tier-3"` (or another in-vocabulary value), that fixture will *spuriously* become
  `invalid`, and **both** AC-11 (already-cleared, but re-run under 1.1.1) and AC-18 (new) will fail
  or assert the wrong row distribution (two invalid rows instead of one valid + one invalid) —
  not because of a real product defect, but because of an unstated cross-amendment fixture
  dependency. Nothing in the spec package states this explicitly; it must be inferred by combining
  REQ-01's revision note (which only mentions `word-count` explicitly) with AC-18's "the AC-11
  fixture" cross-reference.
- Suggested resolution: Add one sentence to REQ-01's revision note or to `traceability.spec.md`'s
  REQ-12/AC-18 row stating that the AC-11/AC-18 shared "valid site plugin" fixture must declare
  `tier: "tier-3"` post-1.1.1, so TDD does not construct a fixture that accidentally exercises the
  wrong code path.

### RT-010
- Severity: ADVISORY
- Category: ambiguity
- Location: `ui.spec.md` §9 ("On the two things intentionally NOT built here" → item 1, "Capability
  tier") × REQ-01's new `tier` field × ADR-024
- Description: `ui.spec.md` §9 has a section literally titled **"Capability tier"** explaining why
  it is out of scope for the list screen — but its body text discusses only the `capabilities`
  **array** (`content.read`/`content.extend`/`hooks.attach`, `state.spec.md` §2
  `PluginManifest.capabilities`), never the `tier` **field** (`tier-1`/`tier-2`/`tier-3`) that 1.1.1
  added to REQ-01 afterward. This is explainable by sequencing — `ui.spec.md` was drafted at 1.1.0,
  before `tier` existed on the manifest at all, and "capability tier" was simply carried over
  verbatim from SPEC-045's own original framing of the ask ("capability tier, any config surface")
  which meant the capabilities vocabulary. But post-1.1.1, this section's *title* now reads, to any
  fresh reader, as if it already settled whether the *new* `tier` field is shown to operators — and
  it did not. This matters because ADR-024 (cited approvingly in REQ-01's own revision note and in
  `spec-manifest.md`'s evidence table) states `plugin.tier` exists specifically to "drive onboarding
  and install consent, exactly as `theme.json.tier` does" — i.e., its designed purpose is to be
  operator-facing, consent-relevant information. Yet `PLUGINS_LIST`'s response shape
  (`PluginDiscoveryRecord`, `state.spec.md` §2) was not extended by 1.1.1 to include `tier` at all,
  and `api.spec.md` is explicitly "content-unchanged... package-level bump only." The net effect:
  the one admin surface this system has is silent about a field whose entire stated rationale is to
  inform an admin operator's trust decision, and no part of the spec package discloses this as a
  deliberate, considered choice (unlike `capabilities`, which *is* explicitly disclosed and
  deferred to OQ-11).
  This is plausibly fine for v1 — REQ-02's install path is filesystem-only with no consent-gated
  HTTP step for either plugins or themes to hang a tier disclosure on, so ADR-024's "consent" role
  may simply be entirely unbuilt UI-wise in this codebase yet, matching capabilities' status
  exactly. But that reasoning is not written down anywhere; it must be reconstructed by the reader.
- Suggested resolution: Either (a) explicitly fold `tier` into OQ-11's already-deferred scope
  alongside `capabilities` and config surfaces (one sentence in `feature.spec.md`'s OQ-11 and in
  `ui.spec.md` §9), disclosing that the list screen intentionally omits it in v1 for the same
  filesystem-install-has-no-consent-step reason; or (b) if the owner judges tier visibility to be
  more load-bearing than capabilities (given ADR-024 frames it as a trust/consent signal, not just
  an implementation detail), add `tier` to `PLUGINS_LIST`'s response shape and REQ-12's rendered
  columns now, before TDD certifies AC-18's "renders exactly three rows... showing that record's
  id/name/version/source/status/enabled" list (which would then be one field short).

### RT-011
- Severity: ADVISORY
- Category: ambiguity
- Location: REQ-16 / `ui.spec.md` §5 (per-row `errors[]` rendering) × `errors[].file`
- Description: Minor, low-severity. The `errors[]` entry shape carried by both `PLUGINS_LIST` and
  `PLUGIN_INVALID.details` is `{ code, file: string|null, message }` (`errors.spec.md` §3,
  `state.spec.md` §2). REQ-16/AC-24 require only `code` and `message` to appear on a row; `file`
  (which names the specific packaged file a validation error concerns, e.g. distinguishing a
  manifest-level error from a specific asset file) is never mentioned by REQ-16, `ui.spec.md` §5,
  or AC-24 — it is silently absent from the UI, with no equivalent to §9's disclosed-omission
  pattern used for `capabilities`/config-surface. For a single-file manifest error like a missing
  `tier` this is immaterial (there is only one candidate file), but for a multi-file `integrity`/
  `FILE_NOT_ALLOWED` failure, `file` is the one piece of information that tells an operator *which*
  packaged file is implicated, and dropping it is a small loss of diagnostic value that reads as an
  oversight rather than a decision.
- Suggested resolution: Either add `file` to the per-row error rendering rule in `ui.spec.md` §5
  (e.g. "`file`: `message`" when `file` is non-null), or add one clause to §9 disclosing that `file`
  is intentionally omitted from the row display in v1.

---

## CONSTITUTION_FLAG Findings

None. The new UI material (`ui.spec.md`) was checked directly against `Roles.tsx`/`Redirects.tsx`
source and found to faithfully reuse existing patterns with no new library, component, or state
paradigm introduced (see probe 3 above) — a clean Article I/III pass, not a pressure point. The
`plugin.tier` field reuses an existing, already-approved literal encoding (SPEC-032/ADR-023) rather
than inventing new vocabulary — likewise a clean Article I pass. Nothing in the new material implies
a fresh constitution exception beyond what RT-006 (original findings, carried forward, unaffected by
this amendment) already covers for the backend's overall security posture.

---

## Routing Decision

**0 BLOCKING findings.** All 5 findings are ADVISORY. Per the Red-Team skill's escalation rule
(route back to Spec Agent only at ≥3 BLOCKING), this does not trigger a systemic route-back.

**Cleared for TDD to certify tests against REQ-12…17 / AC-18…25 / EC-11 / `ui.spec.md` and the
`tier` addition to REQ-01**, carrying the 5 ADVISORY findings forward as context rather than
requiring a pre-TDD spec revision:

- RT-007 and RT-009 should be read by TDD directly before fixture/test authoring — RT-009 in
  particular affects how the shared AC-11/AC-18 fixture must be constructed to avoid a false test
  failure, and RT-007 clarifies the actual scope of the guarantee EC-11's tests should assert
  (single render instance, not cross-session).
- RT-008, RT-010, and RT-011 are lower-urgency documentation/completeness gaps that the human owner
  should see before or during TDD/Programmer work but do not block test-writing — RT-010 in
  particular is worth an explicit owner decision (fold `tier` into OQ-11's disclosed deferral, or
  add it to REQ-12/`PLUGINS_LIST` now) since it concerns whether a security/trust-relevant field's
  stated purpose (ADR-024's consent role) is quietly unmet rather than deliberately deferred.

No finding above requires the Spec Agent to revise the spec package before Software Architect/TDD
proceeds; all are advisory context. The pre-existing 2026-07-07 pass (`red-team-findings.md`, 1
BLOCKING resolved, 4 ADVISORY, 1 CONSTITUTION_FLAG) remains the historical record for REQ-01…11's
original content and is unchanged by this pass.
