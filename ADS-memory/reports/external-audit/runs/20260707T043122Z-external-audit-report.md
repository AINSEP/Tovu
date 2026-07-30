# External Audit Report — Tovu v1 Spec Suite (001–005)

- **Run ID / Packet ID:** `TOVU-SPEC-AUDIT-20260707T043122Z`
- **Date:** 2026-07-07
- **Audit round:** 1 (threat model `TM-SPEC-001`, medium risk → score floor 8.5)
- **Spec-set content hash at audit time (sha256/16):** `136f22e88c6aca5e`
- **Scope:** all 5 specs (001–005), all package files (~5,450 lines / 57k words)
- **Focus:** cross-spec coherence · testability/ACs · completeness/failure modes · traceability integrity · open gap discovery
- **suggest_changes mode:** `notes` (42 files — too broad for safe file-level patches)
- **Packet:** `ADS-memory/.local-artifacts/external-audit/packets/20260707T043122Z-audit-packet.md`
- **Raw offloads:** `ADS-memory/.local-artifacts/external-audit/offloads/20260707T043122Z/`
- **Status at fixes-applied:** codex blockers F1–F4 **IMPLEMENTED** this session (see Proposed-Fix Handling). F5 deferred.

> **⚠️ For the downstream coding agent:** the specs on disk have ALREADY been edited to
> resolve F1–F4. The exact new/changed requirement IDs are in the "Applied Fixes — Implement
> Against These" section at the bottom. Implement against the current spec text, not the
> pre-audit text. Because these edits changed the spec content hashes, specs 001/003/004/005
> are effectively a **round-2 revision** and have NOT yet been re-validated / re-Red-Teamed
> at the new hash — treat the ACs as authoritative but expect a re-validation pass to follow.

---

## Auditor Matrix

| Auditor | CLI / version | Resolved model | Independence | Score | Gate | Result |
|---|---|---|---|---|---|---|
| codex | codex-cli 0.140.0 | self-reported `gpt-5-codex`; config/cache prove `gpt-5.5` | different-family ✓ | **7.8** | **FAIL** (score < 8.5 floor + 4 blockers) | Full structured audit |
| gemini (agy) | agy 1.0.16 | `Gemini 3.1 Pro (High)` (intended) | different-family ✓ | — | — | **FAILED** — `empty_result_transport_failure` ×2, then killed after >7 min past its 5-min print-timeout |
| internal verifier | in-session subagent | (this host) | supplements external | **8.8** | **PASS** | Full pass; supplements, does not replace |

**The native `gemini` CLI was unusable** — Google deprecated its OAuth "Code Assist for
individuals" tier (`IneligibleTierError`); no `GEMINI_API_KEY` present. Substituted `agy`
(Antigravity CLI) per owner direction. agy passed a readability/handshake probe but returned
empty on the full audit prompt twice (inline and file-reference variants).

## Degraded Coverage

External respondents = **1** (codex), below `min_auditors=2`. The Gemini side produced no
findings. The internal verifier (score 8.8, PASS) partially offsets this but is not an
independent external auditor. **Net independent external coverage is single-auditor.** The
owner elected to proceed to remediation rather than retry a third Gemini transport variant.

---

## Per-Auditor Scope Checks

**codex** — Audited SPEC-001…005 as design artifacts (not code). Read all 42 requested files
directly. Noted the packet asks for a scope-check preamble but the JSON schema has no such
field; resolved by adding `auditor_scope_check` as the first JSON key.

**internal verifier** — Read feature/traceability/errors of all 5 specs + behavior of 001 and
005 (the key cross-spec interaction). Sampled api/state/ui less deeply (declared as residual
risk). Actively falsified and *cleared* the SPEC-002 `inversePayload:null` → SPEC-001
`REVERT_NOT_POSSIBLE` path (coherent, not a defect).

---

## What The External LLMs Said

### codex — 4 blocking findings + 1 advisory (score 7.8, gate FAIL)

- **F1 (D4, blocking)** — Plugin `ext.*` writes not reconciled with the command-gateway
  inverse/revert semantics. SPEC-005 writes `ext` in the same content save, but SPEC-001's
  inverse payload is only `{title, slug, bodyJson, status}` — a revert restores core fields
  and leaves stale plugin-derived `ext`, breaking the undo/audit promise. Spans 005/001/002.
- **F2 (D1, blocking)** — SPEC-003 self-contradiction: REQ-05 says serve writes **both**
  `schemaVersion` and `schemaTag` after migration; INV-04 / BR-05 / BR-06 / state / traceability
  say **only** `schemaVersion`. A stale `schemaTag` defeats the divergent-lineage guard.
- **F3 (D3, blocking)** — SPEC-004 and SPEC-005 both define the same validation codes
  (`MANIFEST_MISSING`, `ID_DUPLICATE`, `ENGINE_UNSUPPORTED`, …) with different owners/meanings
  and no declared namespace; suite tooling/enum-gen/traceability could map one code to two things.
- **F4 (D4, blocking, med conf)** — Gateway atomicity gap: REQ-01/BR-04 never state that the
  feature mutation and the change-set record commit in one transaction, so a record-persist
  failure after the entity write yields "mutation without a record" — the exact state INV-01 forbids.
- **F5 (advisory)** — `PLUGIN_HOOK_FAILED` (500) collapses deterministic contract violations
  (bad field path/type, `CAPABILITY_DENIED`) with genuine runtime throws; weakens operability.

codex structural gaps the owner didn't name: suite-wide transaction/unit-of-work model;
cross-spec ID/namespace policy; concurrency semantics (single-process only); upgrade/compat
governance matrix; operational recovery (backup/restore, safe mode). Out-of-scope fatal
warnings: auth/z deferred (fine locally, fatal before any non-local deploy); plugin sandboxing
deferred while executing in-process ESM.

### internal verifier — 7 findings, none blocking (score 8.8, gate PASS)

Converged with codex on **F1 as the highest-value gap** (rated D5, non-blocking: bounded,
self-heals on next save). Additional findings codex did not surface: SPEC-005 errors §5
"every code maps to an AC/EC" checkbox is factually false (6 codes map only to REQ/INV/behavior
→ D3 orphan); SPEC-005 INV-01 `DDL_ATTEMPTED` is untestable in v1 (no SDK surface can issue DDL
→ D2); SPEC-004 `ENGINE_UNSUPPORTED` orphaned + "16 codes" vs 17 enumerated; SPEC-005
enable/disable endpoint named 3 ways (`PLUGIN_SET_ENABLED` / `PLUGIN_ENABLE` / PATCH); SPEC-003
EC-05 maps a transient DB lock to non-retryable `SITE_CORRUPT`. Structural gaps largely matched
codex: `ext`/revert inverse extension point, auth deferred, single-process concurrency,
migration rollback, observability envelope deferred, multi-tenant/workspace reconciliation.

---

## Cross-Auditor Synthesis

- **Strong convergence:** F1 (ext-under-revert) is the #1 issue for BOTH auditors — high
  confidence, fix it. F3/F5 (theme↔plugin error vocabulary) flagged by both, severity disputed.
- **codex-unique but valid:** F2 (schemaVersion/schemaTag contradiction) — a genuine D1 hard
  contradiction the verifier missed (didn't read SPEC-003 state/behavior deeply). F4 (gateway
  atomicity) — real INV-01 gap.
- **verifier-unique advisories:** false "every code maps to AC/EC" checkboxes (005, 004),
  untestable `DDL_ATTEMPTED`, endpoint-naming drift, DB-lock mislabel. All non-blocking; good
  cleanup backlog.
- **Severity disagreement (F1, F3):** codex blocking, verifier advisory. Coordinator sided
  with "fix now" because the fixes are cheap and strictly improve testability/coherence.

---

## Coordinator Response

**Agree (implemented):** F1, F2, F3, F4 — all four codex blockers. F2 in particular vindicates
the codex run: a real hard contradiction single-auditor coverage still caught.

**Change (from auditor framing):** F1 resolved by making `ext` part of the entry pre-image and
restoring it verbatim on revert (data restore, no plugin needed) + NOT re-firing the hook on a
revert — rather than codex's alternative of marking the save "non-revertible." This keeps the
undo promise whole instead of weakening it.

**Disagree:** None of the blockers were rejected. The internal verifier's *non-blocking*
classification of F1/F3 was noted but not used to skip the fixes (cheap + strictly better).

**Proposed Fix Handling:** see disposition table below — F1–F4 `agree-implement` (done +
re-verified this session), F5 `agree-defer` (out of the owner's "fix the blockers" scope).

| Finding | Disposition | Implemented? | Re-verified? |
|---|---|---|---|
| F1 ext↔revert | agree-implement | yes | yes (no dup IDs, refs resolve) |
| F2 schemaTag contradiction | agree-implement | yes | yes (schemaTag in all serve-write locations) |
| F3 error-code namespace | agree-implement | yes | yes |
| F4 gateway atomicity | agree-implement | yes | yes (EC-08/AC-17 added) |
| F5 hook-500 granularity | agree-defer | no | — (tracked as follow-up) |
| verifier advisories (checkbox falsity, DDL_ATTEMPTED, endpoint naming, DB-lock label) | agree-defer | no | — (cleanup backlog) |

---

## Audit Outcome

**ESCALATED → owner chose remediation.** codex gate = FAIL (7.8 < 8.5 + 4 blockers); internal
verifier PASS (8.8). External coverage degraded (Gemini transport failure, 1 external auditor).
Owner directed: fix the codex blockers. **All 4 blockers implemented + re-verified this
session.** A re-validation pass at the new spec hash is still owed before Architect/TDD.

## Decision Points For User

1. **Re-validate the revised specs** (001/003/004/005) at the new hash + Red-Team/human
   re-affirmation before code proceeds. (Owner has started coding — flag the ordering risk.)
2. **Gemini coverage** was never obtained. Optionally retry via `agy` stdin/lower-tier, or
   accept single-external-auditor coverage for this round.
3. **Deferred cleanup backlog** (F5 + verifier advisories) — schedule or drop.
4. **Structural gaps both auditors named** — transaction model, ID-namespace policy,
   concurrency, upgrade/compat matrix, operational recovery, auth thread-through — are
   post-skeleton spec work; not blocking v1 but load-bearing soon.

---

## Applied Fixes — Implement Against These (for the coding agent)

Current authoritative spec IDs after remediation:

**SPEC-001 (admin-command-gateway)**
- `REQ-01` + `BR-04` — feature mutation + change-set header + item commit as ONE unit of work
  (SQL transaction / memory all-or-nothing). Record-persist failure rolls back the mutation.
- `EC-08` — change-set persist failure after mutation ⇒ full rollback, no change set, no event.
- `AC-17` — injected change-set-item persist failure ⇒ post unchanged, no change set/event (INV-01).
- `AC-02` / `AC-10` — content-entry inverse payload now includes pre-edit `ext`; revert restores
  it; `content.entry.beforeSave` does NOT fire during a revert restore.

**SPEC-003 (site-install-dir)**
- `REQ-05` (unchanged, was correct), `INV-04`, `BR-05`, `BR-06`, state §/`SERVE_SITE`,
  traceability `INV-04`, `AC-07` — serve updates `schemaVersion` AND `schemaTag` together,
  atomically, only after `migrate()`. Bumped `schemaVersion` beside a stale `schemaTag` is an
  illegal state. AC-07 asserts a follow-up serve passes the guard cleanly (proves tag stamped).

**SPEC-004 (theme-system) & SPEC-005 (plugin-system)**
- errors.spec.md §3 — validation codes are **envelope-scoped** (`THEME_INVALID.details.errors[].code`
  / `PLUGIN_INVALID.details.errors[].code`); canonical identity is `(parent envelope, code)`.
  Tooling/enum-gen/traceability MUST key by the pair, never the bare string. The two validators
  mirror shape but never share a registry.

**SPEC-005 (plugin-system)**
- `BR-08` (new §7a) — gateway inverse pre-image includes pre-edit `ext`; revert restores the
  `ext` snapshot verbatim and does NOT fire `beforeSave`; restore needs no plugin
  enabled/installed (INV-03 retains data).
- `AC-17` — save-twice (count 5→9), revert 2nd save ⇒ `bodyJson` AND `ext.word-count.count`
  both return to 5 in one revert, hook doesn't re-fire, works even if plugin later uninstalled;
  reverting the save that first created the `ext` namespace restores the pre-image (ext absent).
- `REQ-06` + `BR-06` — `ext` is part of the entry pre-image the gateway captures for revert.
