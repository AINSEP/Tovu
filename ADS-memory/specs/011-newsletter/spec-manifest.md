# Spec Manifest: newsletter

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-011 |
| feature_name | FEAT-011-newsletter |
| version | 1.0.0 |
| last_edited | 2026-07-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/011-newsletter |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** Package index for the strict Speckit compatibility flow for FEAT-011.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | PRESENT | `api.spec.md` | Admin CRUD + send/pause/resume + import + public confirm/unsubscribe HTTP surface is in scope |
| `state.spec.md` | PRESENT | `state.spec.md` | Durable campaign/list/subscription/snapshot/send/confirmation-token state plus admin-UI client state |
| `orchestrator.spec.md` | PRESENT | `orchestrator.spec.md` | Unlike SPEC-007/SPEC-009 (which correctly omitted it), Newsletter has a genuine async orchestration layer distinct from a synchronous write chokepoint: audience freeze → outbox-driven batch fan-out → completion detection, adapted from the template's generic shape to this backend pipeline |
| `ui.spec.md` | PRESENT | `ui.spec.md` | The Newsletter admin screens (campaign list/composer, list management, subscriber table, send log) are in-scope UI surfaces (REQ-26) |
| `errors.spec.md` | PRESENT | `errors.spec.md` | New error registry, including the load-bearing `NEWSLETTER_LAUNCH_GATE_BLOCKED` code |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Non-trivial ordering: campaign status transition authority, Launch Readiness Gate precondition evaluation/reporting order, per-row hook ordering, confirmation-token reissuance, defaults, and bounds |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, plus ADR-034 (+ its Round-2/Round-3 folds), ADR-037, ADR-038, ADR-040, ADR-030, ADR-023 (+ sweep §A), ADR-026, `src/newsletter/ports.ts`/`types.ts`, `src/members/*`, `src/mail/*`, `src/http/*`, `src/origin/*`, `src/integrations/ports.ts` (`KeyringPort`), `src/core/events/outbox-worker.ts` |
| `tdd` | `feature.spec.md`, `traceability.spec.md`, `behavior.spec.md`, `errors.spec.md`, `orchestrator.spec.md`, `spec-dod.md`, governing ADRs, tasks |
| `programmer` | `feature.spec.md`, `api.spec.md`, `state.spec.md`, `orchestrator.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADRs, certified tests |

---

## Brownfield / Reverse-Spec References

This feature is `brownfield`: real interface/type stubs already exist for it, and it depends
on a mix of real, already-implemented libraries and design-only ADRs with zero built
adapters. Both are recorded below without collapsing the distinction.

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `src/newsletter/ports.ts` | source touchpoint | Pre-existing `SubscriberDirectoryPort`/`SendBatchJob` interface stubs, and a re-export of `MailerPort` from `../mail`. This spec's REQ-16/REQ-17 must be satisfied against this exact interface. Its own doc comments already record the Round-3 audit fold demoting `SubscriberDirectoryPort` from an ADR-006 port to a single-evaluator dependency — this spec treats that as settled, not re-litigated. |
| `src/newsletter/types.ts` | source touchpoint | Pre-existing `CampaignFields`/`CampaignCounters`/`NewsletterListRow`/`SubscriptionRow`/`AudienceSnapshotRow`/`SendRow`/permission catalog/event & hook names/`UnsubscribeTokenClaims`. **Known deviations, not silently resolved:** (1) `NEWSLETTER_PERMISSIONS` uses unprefixed `newsletter.*` strings, predating the frozen `admin` + section + action convention this spec uses throughout (`admin.newsletter.*`) — flagged in `feature.spec.md` Agent Directives, same pattern SPEC-009 used for `admin.redirects.manage`. (2) `types.ts` has zero shape for a confirmation-token record even though ADR-034's Round-2 fold explicitly assigns Newsletter the confirmation-mechanics scope that needs one — this spec's `state.spec.md` introduces `ConfirmationTokenRecord`/`p_newsletter__confirmation_tokens` as a 5th own-table (OQ-03) to cover that gap, modeled on `MagicLinkTokenRecord`'s shape for consistency. (3) No error classes exist in `types.ts` yet (`errors.spec.md` both names the vocabulary and directs the Programmer phase to add them, mirroring `src/members/types.ts`'s error-class pattern). |
| `src/members/ports.ts`, `src/members/types.ts`, `src/members/subscriber-directory.ts`, `src/members/INFO.md` | source touchpoint | Real, working `MemberRepoPort`/`MemberRecord` and `MembersSubscriberDirectory` (implements `SubscriberDirectoryPort`, resolving global — not purpose-scoped — deliverability). This satisfies ADR-030's decided "publish `AudienceDirectoryPort`" outcome under its pre-existing interface name — a naming reconciliation, not a functional gap. **Critically, `src/members/INFO.md` explicitly discloses that `member_consents` and `members.consent.request/confirm/revoke` do not exist anywhere in this codebase** — this is the central real-world fact the Launch Readiness Gate (REQ-21) is built to structurally guard against being silently assumed away. |
| `src/mail/ports.ts`, `src/mail/types.ts`, `src/mail/index.ts` | source touchpoint | Real, ACCEPTED ADR-037 `MailerPort`/`OutboundEmail`/`MailerSendOptions`/`MailerFeedbackEvent`/`MailSuppressionRepoPort`/`MailSendDedupRepoPort` type shapes this spec's REQ-16/REQ-17/REQ-22/REQ-28 depend on directly. **No adapter class of any kind exists in this repo yet** (`ConsoleMailerAdapter`/`SmtpMailerAdapter`/`HttpApiMailerAdapter`/`InMemoryMailerAdapter` are all bare `type X = MailerPort` aliases, no class) — this is the other half of why the Launch Readiness Gate exists (precondition (d)), independent of Members' readiness. |
| `src/http/ports.ts`, `src/http/types.ts` | source touchpoint | Real, ACCEPTED ADR-038 `HttpClientPort`/`EgressPolicy` shapes — referenced by name for the deferred `HttpApiMailerAdapter` (out of scope this spec), not directly consumed by any in-scope REQ here. |
| `src/origin/ports.ts`, `src/origin/origin.ts`, `src/origin/index.ts`, `src/origin/INFO.md` | source touchpoint | Real, working, ACCEPTED ADR-040 `OriginRegistry` class + `InMemoryOriginSettingRepo` — genuinely implemented (unlike `mail`/`KeyringPort`). REQ-21c/REQ-30/INV-09 depend on `canonicalOrigin` exactly as it exists today. |
| `src/integrations/ports.ts`, `src/integrations/index.ts` | source touchpoint | Real, exported `KeyringPort` interface (home per ADR-036 Round-4 fold, pending a dedicated ADR-041) with a generic `derive({ workspaceId, purpose, info })` method this spec's REQ-14 unsubscribe-token derivation calls. **Interfaces-only — no concrete adapter (not even an in-memory one) exists yet**, same brownfield gap class as `mail`. |
| `src/core/events/outbox-worker.ts` | source touchpoint | Real, working `processOutbox`/`OutboxPort`/`EventBusPort` generic claim/deliver/retry loop. `orchestrator.spec.md`'s `claimBatch` explicitly reuses this primitive rather than forking a Newsletter-local one. |
| `src/features/post/` | source touchpoint | The only concrete content-write-chokepoint precedent in this repo (no generalized `entries`/content-type registry exists) — cited in `feature.spec.md`/`state.spec.md` Dependencies/Note as the real precedent Software Architect must generalize or bypass for `CampaignRecord`'s storage mechanism; not resolved in this spec. |
| `src/identity/permissions.ts` | source touchpoint | Real `PermissionDescriptor` catalog and registration pattern; REQ-25's `admin.newsletter.*` catalog must be registered here following the existing pattern, same as SPEC-009 directed for `admin.redirects.manage`. |
| `apps/admin/src/sections/Members.tsx`, `src/server/routes/admin/members/*.ts` (`deps.ts`, `list.ts`) | source touchpoint | UI/route convention reference: thin `useState`/`useEffect` + `api` client, direct `authorize()` calls in-route, `MembersRouteDeps`-style deps-bundle extension pattern this spec's `MembersRouteDeps`-equivalent for Newsletter should follow. Note `Members.tsx` today is read-only (list only, no create/edit) — Newsletter's UI is intentionally richer per this spec's own scope, not a mismatch to flag. |
| ADR-034-newsletter.md (+ Round-2 sweep fold, + Round-3/Round-4 audit folds) | architecture (ACCEPTED) | Governing ADR for this entire feature; §1–§9 plus the sweep-crosscutting-decisions fold map directly to REQ-01–REQ-32. This spec translates it; it does not re-decide any of its content. |
| ADR-037-core-mail-primitive.md | architecture (ACCEPTED) | Owns `MailerPort`/suppression+dedup ledgers this spec's REQ-16/REQ-17/REQ-22/REQ-28 depend on; also the source of the "no adapter built yet" brownfield finding above. |
| ADR-038-core-http-egress-primitive.md | architecture (ACCEPTED) | Owns `HttpClientPort`/`EgressPolicy` the deferred `HttpApiMailerAdapter` would consume; referenced, not directly exercised in v1 scope. |
| ADR-040-core-origin-registry-v0.md | architecture (ACCEPTED) | Owns the verified-origin oracle this spec's REQ-21c/REQ-30/INV-09 depend on; genuinely implemented in `src/origin/`. |
| ADR-030-members.md | architecture (ACCEPTED) | Owns `AudienceDirectoryPort`/`member_consents`/`members.consent.*` — the Members-side half of REQ-11/REQ-14/REQ-15/REQ-21b/REQ-32; **not yet built**, per `src/members/INFO.md`'s own disclosure. |
| ADR-023-core-mediated-plugin-data-modules.md (+ sweep §A) | architecture (ACCEPTED) | Owns the `dataModule` declared-schema shape and the first-party-bundled-execution-in-v1 sanction (§A.2) this spec's five `p_newsletter__*` tables need; the reconciliation engine itself and a concrete interim table-creation code path are both unbuilt, per ADR-034's own Round-3 fold text quoted in `feature.spec.md` Dependencies. |
| ADR-026-core-mediated-atomic-multi-write.md | architecture (ACCEPTED) | Owns the atomic multi-write envelope REQ-24/INV-02 (SendRow status + campaign counters) rides; no implementation of this primitive exists in `src/` yet (confirmed by repo-wide search) — inherited precondition, not this spec's to build. |
| `sweep-crosscutting-decisions-20260710.md` line 71 | governance record | The authoritative source (per this task's own directive) settling the `admin` + section + action permission-namespace convention this spec uses throughout — already confirmed against the same source by SPEC-008 and SPEC-009. |

---

## Validation Notes

- Validator last run: pending this run's own execution (see `pipeline-state.md`)
- Validator result: pending
- Validator manual waiver: N/A
- Canonical hash verified at: pending (`--phase spec --update-hash`)
- Notes: This spec package names two classes of brownfield gap without collapsing them: (1)
  genuinely-implemented Tier-2 primitives this feature can build against today
  (`core/origin`, the generic outbox worker, Members' subscriber-directory read seam), and
  (2) named, still-unbuilt primitives this feature structurally depends on for *real
  recipient sending specifically* (`core/mail`'s adapters, `KeyringPort`'s adapter, Members'
  consent ledger/handlers, the ADR-023 interim table-creation path, the ADR-026 atomic
  multi-write primitive). The Launch Readiness Gate (REQ-21) is the spec's answer to class
  (2) for the specific, user-directed sequencing constraint ("must not ship to real
  recipients before Members live") — it is deliberately broader than just "Members," since
  the mail-adapter gap alone would block real sending even if Members shipped tomorrow.
