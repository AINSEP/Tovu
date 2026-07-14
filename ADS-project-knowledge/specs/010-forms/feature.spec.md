# Feature Spec: forms

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-010 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:d2d727639ef9e1e6131494e2d2dfe90290d917775733b8da72343f8bbfb0d87e |
| feature_name | FEAT-010-forms |
| last_edited | 2026-07-13T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent |
| spec_mode | greenfield |

> **[NEEDS CLARIFICATION] vs Open Questions — use the right one:**
>
> **`[NEEDS CLARIFICATION]`** — inline marker for a requirement that is too ambiguous to be testable as written. Blocks Software Architect dispatch. Must be resolved before the spec advances.
>
> **Open Questions** — tracked questions that do not block Software Architect dispatch. Each must have an owner and a resolution target date.

---

## Overview

Forms ships the **Contact Form** — AW-7's Tier-1 ("declarative, zero-code") sample plugin. An
operator or agent declares one or more form definitions (name, slug, a closed-vocabulary field
set — no code), the public site accepts submissions against that declaration, submissions land
in an admin-viewable log, and on every accepted submission core can email a notification
(`MailerPort`, ADR-037) and/or fan out a webhook to any subscription an admin has configured
against a new domain-event topic (the existing ADR-036 webhook subsystem — Forms adds zero
webhook-specific code, only the event). This is the ADR-024 audit-condition #1 proof: Tier-1
"install from anyone" was blocked on core shipping the mail adapter, webhook dispatch, and a
form-submission sink; the first two landed 2026-07-10, this spec builds the third and wires all
three together in real running code.

---

## Problem Statement

**Current state:** No forms functionality exists anywhere in this codebase. `src/mail` (ADR-037)
and `src/integrations` (ADR-036) landed 2026-07-10 as interfaces + real business logic
(write-services, delivery worker, in-memory repo adapters) but have zero consumers today — no
feature calls `MailerPort.send()` and no feature emits a domain event a webhook subscription
could match. There is also **no Tier-1 declarative-plugin loader or manifest runtime** anywhere
in `src/` — `src/features/plugins/` contains only the Tier-3 `dataModule` spike
(`data-module.ts`) and the hand-wired Tier-3 Store sample plugin (`store-plugin.ts`), both
activated by a direct function call in `src/index.ts`, not through any registry, manifest
parser, or install/enable/disable mechanism. AW-7's own build order names the Tier-3 store slice
as step 1 (already spiked) and this Tier-1 contact form as step 2, explicitly "to expose the
missing core-mediated primitives as a concrete 'dead without them'" — this spec is that step.

**Desired state:** An admin (or an agent acting on `admin.forms.manage`) can declare a form
(name, slug, fields from a closed vocabulary — text/email/textarea/checkbox — with
required/maxLength constraints), the public site can `POST` a submission against that
declaration, invalid/spam/rate-limited submissions are rejected or silently dropped without
persisting, valid submissions are durably logged, and — with zero forms-specific webhook code —
any workspace webhook subscription matching the new `form.submission.received` topic fires
through the existing ADR-036 delivery worker, and any form with notification enabled sends an
email through the existing ADR-037 `MailerPort`, asynchronously, so a slow/broken mail provider
can never block the public submission response.

**Why now:** AW-7 (`todos.md`) named the Contact Form as the priority-2 sample plugin, blocked
until core shipped mail + webhook dispatch. Both landed in the 2026-07-10 sweep
(`ADR-037-core-mail-primitive.md`, `ADR-036-integrations-api.md`), which is the owner-approved
trigger to build this spec now.

**Success signal:** A new developer can implement form-definition CRUD, public submission
handling, notification/webhook side-effect wiring, and the admin submissions log from this spec
package alone, and every P1 acceptance criterion below is verified by an integration-level test
at its real HTTP boundary.

---

## User Journey

**Trigger (admin):** An admin opens **Forms** in the admin nav.

**Steps (admin — define a form):**
1. Admin clicks "New form", enters a name (e.g. "Contact") and a slug (e.g. `contact`).
2. Admin adds field descriptors from the fixed vocabulary (text/email/textarea/checkbox), each
   with a label, required flag, and max length — authored as structured input, not a visual
   drag-drop builder.
3. Admin optionally enables email notification and enters one or more recipient addresses.
4. Admin saves; the form is created in `active` status and is immediately submittable at its slug.

**Steps (visitor — submit):**
1. A site visitor fills out the public-facing form (rendered by the theme/site layer, out of
   scope here — this spec is the backend contract the site consumes) and submits.
2. The system validates the payload against the definition's field vocabulary.
3. On success, the system persists the submission, emits `form.submission.received`, and (if
   configured) triggers the async email notification and any matching webhook deliveries.
4. The visitor's request returns success without waiting for the email/webhook side effects to
   complete.

**Steps (admin — review submissions):**
1. Admin opens a form's "Submissions" tab.
2. Admin sees a list of submissions (mirrors `apps/admin/src/sections/IntegrationDeliveries.tsx`'s
   list convention) and can open one to see full field values.
3. Admin can delete a submission (e.g. a data-subject deletion request).

**Outcome:** A working, zero-code-to-the-operator contact-form loop: define → submit → notify →
review, with core mediating storage, notification, and webhook fan-out.

**Alternate paths:** A submission with an unregistered field key, a missing required field, or a
field exceeding its declared max length is rejected and nothing is persisted. A submission whose
hidden honeypot field is non-empty is silently discarded (200 response, no persistence, no
notification) so bots are not tipped off. A submission to a disabled or nonexistent slug is
rejected without revealing which case applies. A submission that exceeds the per-IP-per-form rate
limit is rejected. A principal lacking the relevant permission gets a forbidden/unauthenticated
response for every admin-side read or write.

---

## Scope

**In scope:**
- Admin CRUD for form definitions: name, slug (unique per workspace), fields (closed vocabulary:
  `text`/`email`/`textarea`/`checkbox`, each with `id`/`label`/`required`/`maxLength`), notify
  config (enabled flag + recipient email list), status (`active`/`disabled`) — gated by
  `admin.forms.manage` (REQ-01..REQ-04)
- Public, unauthenticated submission endpoint, validated against the definition's declared
  fields, rate-limited per (IP, form) (REQ-05..REQ-09)
- Durable submission storage as a new, bespoke table (no generic ADR-022 `entries` model exists
  in this codebase — same caveat SEO/Redirects already recorded) (REQ-10)
- On accepted submission: emit `form.submission.received` on the existing core outbox, consumed
  by the already-built ADR-036 webhook fan-out with zero Forms-specific webhook code (REQ-11)
- On accepted submission, when notification is enabled: send email via the existing ADR-037
  `MailerPort`, asynchronously through an outbox-driven subscriber (REQ-12, REQ-16)
- Admin list+detail view of submissions, filterable by form, plus permanent delete
  (`admin.forms.submissions.read` / `admin.forms.submissions.delete`) (REQ-13, REQ-14)
- Simple spam/abuse controls: one reserved honeypot field + a fixed per-IP-per-form rate limit
  (REQ-08, REQ-09)

**Out of scope:**
- A drag-and-drop / visual form-builder UI. Field configuration is structured (JSON-shaped)
  admin input from a fixed vocabulary, never freeform code, but the admin surface is a form/JSON
  editor, not a visual builder — AW-7's text does not ask for one and the owner's own build-order
  note says "keep v1 tight."
- File-upload / attachment field types.
- CAPTCHA or any third-party anti-spam service integration (a build-vs-adopt decision deferred,
  see Open Questions).
- Multi-step forms, conditional field logic, or any Turing-complete computed-field behavior.
- The public-facing rendering of a form on the live site theme (a `site`/theme-layer concern
  that consumes this spec's read API — not re-specified here).
- A dynamically-loadable, installable third-party Tier-1 plugin package/manifest runtime. **No
  such loader exists in this codebase** (confirmed: only the Tier-3 `dataModule` spike and the
  hand-wired Store sample are wired directly into `src/index.ts`). Forms ships as a bundled,
  hand-wired core module — the same precedent already set by SEO (ADR-032) and Redirects
  (ADR-033) — not as an installable package. See Dependencies and Open Question OQ-01.
- Migrating submission/definition storage onto the generic ADR-022 `entries` model — it does not
  exist in this repo (same caveat SEO/Redirects already recorded against the bespoke `posts`
  table).
- Non-email/non-webhook notification channels (SMS, Slack, in-app, etc.).
- Analytics/conversion tracking on form views or submissions.
- Hard-deleting form **definitions** — disable only (see Behavior/Invariants); only
  **submissions** support permanent delete.

---

## Requirements

- REQ-01: The system shall allow a principal holding `admin.forms.manage` to create a form
  definition with a name, a workspace-unique slug, one or more field descriptors from the
  registered vocabulary, an optional notification configuration, and a default status of
  `active`.
- REQ-02: The system shall reject a form-definition write containing a field descriptor whose
  `type` is outside the registered vocabulary (`text`, `email`, `textarea`, `checkbox`), without
  persisting any part of that write.
- REQ-03: The system shall enforce that a form definition's `slug` is unique among all form
  definitions in its workspace, regardless of status.
- REQ-04: The system shall allow a principal holding `admin.forms.manage` to read, update, and
  disable (or re-enable) a form definition; the system shall never permanently delete a form
  definition.
- REQ-05: The system shall expose a public, unauthenticated endpoint that accepts a submission
  addressed to a form definition by its slug.
- REQ-06: The system shall validate a submission payload against the addressed form definition's
  field vocabulary (required fields present, declared `maxLength` respected, no keys outside the
  declared fields plus the reserved honeypot key) and shall reject the entire submission,
  persisting nothing, when validation fails.
- REQ-07: The system shall reject a submission addressed to a form definition that does not exist
  or whose status is `disabled`, without revealing which of the two conditions applies.
- REQ-08: The system shall silently discard a submission whose reserved honeypot field is
  non-empty — no submission row is persisted, no notification is sent, and no domain event is
  emitted — while still returning a success response to the caller.
- REQ-09: The system shall rate-limit submissions per `(sourceIp, formDefinitionId)` pair and
  shall reject a submission that exceeds the configured rate limit.
- REQ-10: The system shall persist every accepted, non-honeypot submission as an immutable row
  containing the form definition's id, the workspace id, the submitted field values, the source
  IP, and the submission timestamp.
- REQ-11: The system shall emit a `form.submission.received` domain event on the core outbox for
  every accepted submission, carrying the workspace id, the form definition id, and the
  submission id, consumed by the existing webhook fan-out mechanism with no Forms-specific
  webhook-dispatch code.
- REQ-12: The system shall, for every accepted submission addressed to a form definition with
  notification enabled, dispatch an email through `MailerPort` to the definition's configured
  recipient(s), via an outbox-driven subscriber decoupled from the public submission request.
- REQ-13: The system shall allow a principal holding `admin.forms.submissions.read` to list and
  view submissions for any form definition in its workspace.
- REQ-14: The system shall allow a principal holding `admin.forms.submissions.delete` to
  permanently delete a single submission.
- REQ-15: The system shall reject any form-definition write, submissions list/read, or submission
  delete attempted by a principal lacking the respective required permission.
- REQ-16: The system shall never fail or delay the public submission response due to a downstream
  email-send or webhook-delivery outcome — those side effects are always dispatched
  asynchronously through the existing outbox mechanism.

<!-- Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a principal holding `admin.forms.manage`, when they `POST` a valid
  form definition (name, unique slug, ≥1 valid field descriptor), then the definition is created
  with `status: "active"` and a subsequent `GET` returns it unchanged.
- AC-02 (REQ-01) [P2]: Given a principal holding `admin.forms.manage`, when they `POST` a form
  definition with notification enabled and one or more recipient addresses, then the recipients
  are persisted and returned on a subsequent `GET`.
- AC-03 (REQ-02) [P1]: Given a form-definition write whose fields include a descriptor with
  `type: "date"` (not in the registered vocabulary), when the write is submitted, then it is
  rejected with `FORMS_FIELD_VALIDATION_ERROR` and no definition is created or modified.
- AC-04 (REQ-03) [P1]: Given an existing form definition with slug `contact`, when a second
  create request uses the same slug in the same workspace, then it is rejected with
  `FORMS_SLUG_CONFLICT` and the existing definition is unchanged.
- AC-05 (REQ-04) [P1]: Given a principal holding `admin.forms.manage`, when they set an existing
  form definition's status to `disabled`, then a subsequent submission to that slug is rejected
  (REQ-07) while a `GET` of the definition itself still succeeds and shows `status: "disabled"`.
- AC-06 (REQ-04) [P1]: Given a form definition, when any client attempts a delete/removal
  operation against it, then no such operation exists — the only supported lifecycle transition
  is `active` ⇄ `disabled` (verified by the absence of a delete endpoint in `api.spec.md`).
- AC-07 (REQ-05) [P1]: Given `POST /forms/:slug/submit` with no `Authorization` header and a
  valid payload for an active form, when the request is processed, then it returns `201` (no
  authentication is required).
- AC-08 (REQ-06) [P1]: Given an active form definition requiring `name` and `email`, when a
  submission omits `email`, then the request is rejected with `FORMS_SUBMISSION_VALIDATION_ERROR`
  naming `email`, and no submission row is persisted.
- AC-09 (REQ-06) [P1]: Given a submission payload containing a key not among the definition's
  declared field ids (and not the reserved honeypot key), when submitted, then the request is
  rejected with `FORMS_SUBMISSION_VALIDATION_ERROR` and no submission row is persisted.
- AC-10 (REQ-06) [P2]: Given a `text` field declared with `maxLength: 100`, when a submission
  supplies a 101-character value for that field, then the request is rejected with
  `FORMS_SUBMISSION_VALIDATION_ERROR`.
- AC-11 (REQ-07) [P1]: Given a submission addressed to a slug with no matching form definition,
  when submitted, then the request is rejected with `FORMS_DEFINITION_NOT_FOUND` (`404`).
- AC-12 (REQ-07) [P1]: Given a submission addressed to a slug whose form definition has
  `status: "disabled"`, when submitted, then the request is rejected with the same
  `FORMS_DEFINITION_NOT_FOUND` (`404`) response as AC-11 — the two cases are indistinguishable to
  the caller.
- AC-13 (REQ-08) [P1]: Given a submission whose reserved honeypot field is non-empty, when
  submitted, then the response is `201` but no submission row is persisted, no
  `form.submission.received` event is emitted, and no notification is dispatched.
- AC-14 (REQ-09) [P1]: Given a form definition with a rate limit of N submissions per IP per
  window, when a single IP submits N+1 times to that form within the window, then the (N+1)-th
  request is rejected with `FORMS_RATE_LIMIT_EXCEEDED` (`429`) while the first N succeed.
- AC-15 (REQ-10) [P1]: Given an accepted submission, when it is persisted, then a subsequent
  admin `GET` of that submission returns the same field values, form definition id, source IP,
  and timestamp that were submitted.
- AC-16 (REQ-11) [P1]: Given a workspace with an active webhook subscription matching topic
  `form.submission.received`, when a submission to any form in that workspace is accepted, then
  the existing webhook delivery worker enqueues and eventually delivers a matching delivery — with
  zero Forms-specific dispatch code (verified by inspecting the delivery worker's queued row,
  not a Forms-owned code path).
- AC-17 (REQ-12) [P1]: Given a form definition with notification enabled and recipient
  `ops@example.com`, when a submission to that form is accepted, then `MailerPort.send()` is
  invoked with a message addressed to `ops@example.com`, asynchronously from the public request.
- AC-18 (REQ-12) [P2]: Given a form definition with notification disabled, when a submission to
  that form is accepted, then `MailerPort.send()` is never invoked for that submission.
- AC-19 (REQ-13) [P1]: Given a principal holding `admin.forms.submissions.read`, when they `GET`
  the submissions list for a form definition, then they receive every non-deleted submission for
  that definition, newest first.
- AC-20 (REQ-14) [P1]: Given a principal holding `admin.forms.submissions.delete`, when they
  `DELETE` a submission, then a subsequent `GET` of that submission returns
  `FORMS_SUBMISSION_NOT_FOUND` and it no longer appears in the submissions list.
- AC-21 (REQ-15) [P1]: Given an authenticated principal lacking `admin.forms.manage`, when they
  attempt any form-definition write, then the request is rejected with `FORBIDDEN` and no data
  changes.
- AC-22 (REQ-15) [P1]: Given an authenticated principal lacking `admin.forms.submissions.read`,
  when they attempt to list or view submissions, then the request is rejected with `FORBIDDEN`.
- AC-23 (REQ-15) [P1]: Given an authenticated principal lacking `admin.forms.submissions.delete`,
  when they attempt to delete a submission, then the request is rejected with `FORBIDDEN` and the
  submission is unchanged.
- AC-24 (REQ-16) [P1]: Given a `MailerPort.send()` call that would throw or reject, when a
  submission is accepted, then the public submission response has already returned `201` before
  that call is attempted — verified by asserting the HTTP response completes without awaiting the
  mail-send outcome.

<!-- Rules: every REQ-* has at least one AC; every AC has a priority tag; P1 ACs are independently testable; AC numbers are never reused. -->

---

## Invariants

- INV-01: A `form_submissions.data_json` value's keys must always be a subset of its form
  definition's declared field ids at the time of submission — never a superset.
- INV-02: A `form_definitions.fields_json` value must never contain a field descriptor whose
  `type` is outside the registered vocabulary (`text`, `email`, `textarea`, `checkbox`).
- INV-03: `form_definitions.slug` must always be unique per workspace, across every status.
- INV-04: A submission whose reserved honeypot field is non-empty must never be persisted, must
  never emit `form.submission.received`, and must never trigger a notification or webhook
  delivery.
- INV-05: The public submission endpoint must never block its HTTP response on
  `MailerPort.send()` or webhook delivery completing — both are always dispatched through the
  outbox, asynchronously from the request/response cycle.
- INV-06: A form-definition write, a submissions list/read, or a submission delete must never
  bypass its required permission check (`admin.forms.manage` / `admin.forms.submissions.read` /
  `admin.forms.submissions.delete`).
- INV-07: `form.submission.received` must be emitted for every accepted (non-honeypot,
  non-rate-limited, validation-passing) submission, and only for such submissions.
- INV-08: A form definition is never permanently deleted — its only lifecycle transition is
  `active` ⇄ `disabled`; a form submission, in contrast, supports permanent delete (REQ-14) since
  it is PII-bearing data an operator may have an affirmative deletion obligation toward.

---

## Edge Cases

- EC-01: What happens when a submission supplies only its required fields and omits every
  optional field? Expected behavior: the submission is accepted; omitted optional fields are
  simply absent from `data_json`.
- EC-02: What happens when a submission is missing a required field? Expected behavior: rejected
  with `FORMS_SUBMISSION_VALIDATION_ERROR` naming the missing field; nothing is persisted (AC-08).
- EC-03: What happens when a submission targets a slug whose form definition was disabled minutes
  earlier? Expected behavior: rejected with `FORMS_DEFINITION_NOT_FOUND`, identical to a
  nonexistent slug (AC-12) — existence is never leaked.
- EC-04: What happens when two form-definition creates for the same workspace race on the same
  slug? Expected behavior: the database's unique index on `(workspace_id, slug)` guarantees
  exactly one wins; the loser is rejected with `FORMS_SLUG_CONFLICT`.
- EC-05: What happens when an admin disables a form definition while a submission that already
  passed the "is this definition active" check is still being persisted? Expected behavior: that
  in-flight submission is still accepted and persisted — disable stops new submissions from the
  moment its write commits, it is not a fence against a request already past that check. This is
  an accepted, benign race (not a correctness violation) — disable's contract is "no new
  submissions from now on," not "atomically cancel in-flight ones."
- EC-06: What happens when `MailerPort.send()` returns `{ok: false, errorCode: 'SUPPRESSED'}` for
  a suppressed recipient? Expected behavior: the notification attempt is treated as terminal (not
  retried); the submission itself remains persisted and admin-visible regardless of the
  notification outcome (ties to INV-05/REQ-16 — email failure never hides or rolls back a
  submission).
- EC-07: What happens when a workspace has zero webhook subscriptions matching
  `form.submission.received`? Expected behavior: the event is still emitted onto the outbox (REQ-11/
  INV-07); the existing webhook fan-out subscriber simply finds no matching subscriptions and
  enqueues nothing — this is normal, not an error.
- EC-08: What happens when an admin requests the submissions list for a form definition with zero
  submissions? Expected behavior: a valid empty list is returned with `200`, not an error.
- EC-09: What happens when a submission's honeypot field is present but empty (the normal,
  non-bot case)? Expected behavior: treated identically to the honeypot field being entirely
  absent — normal validation proceeds (EC-01/REQ-06), not the silent-discard path (REQ-08).

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `src/mail` (ADR-037 `MailerPort`) | The single mail-send seam this spec calls for notification (REQ-12) | The `mail` lib ships **interfaces and ports only** (`src/mail/index.ts` — "adapters ... are the ADR-037 follow-up build"); the one concrete adapter that exists today, `ConsoleMailerAdapter`, lives under `src/members/mailer.console.ts` (member-scoped), not re-exported from `src/mail`'s own barrel | Forms' notification subscriber depends on whatever concrete `MailerPort` the app wires at boot (e.g., relocating/reusing the existing console adapter) — a small, real, pre-existing gap in `src/mail` that this spec surfaces but does not itself have to close; Software Architect must name the injected adapter explicitly rather than assume one exists in `src/mail` |
| `src/integrations` (ADR-036 webhook subsystem) | Outbox-driven webhook fan-out keyed on domain-event topic — Forms adds zero webhook-dispatch code, only a new topic (REQ-11) | `webhook_subscriptions`/`webhook_deliveries` have real business logic (`delivery.ts`, `subscriptions.ts`) but only **in-memory** repo adapters exist (`repo.memory.ts`); no SQLite persistence adapter for these tables is wired into `src/infra/db/schema.ts` yet | Forms only emits the domain event and never queries webhook state directly; a production SQL adapter for `webhook_subscriptions`/`webhook_deliveries` is an `integrations`-owned upgrade, not something this spec builds or blocks on |
| core outbox / domain-event bus (ADR-009) | Delivery of `form.submission.received` to the webhook fan-out subscriber and to the Forms notification subscriber | Outbox delivery is delayed or fails | Webhook/email side effects lag; the submission itself is already durably persisted (REQ-10) independent of outbox delivery (INV-05) |
| `src/identity` (ADR-021 `authorize()` + permission catalog) | Permission-gated authorization for every admin route (`admin.forms.manage`, `admin.forms.submissions.read`, `admin.forms.submissions.delete`) | None currently — implemented and exercised by every other admin section | N/A |
| **No Tier-1 declarative-plugin loader/manifest runtime** (`src/features/plugins/` has only the Tier-3 `dataModule` spike and the hand-wired Store sample, both activated directly in `src/index.ts`, not through any registry) | N/A — this is an absent dependency, not a built one | Forms cannot literally be "installed from a manifest by anyone" per ADR-024 Tier-1's full promise; there is no install/enable/disable-as-a-package mechanism to build against | Forms ships as a bundled, hand-wired core module (declarative field-config data, zero operator code) — the same precedent SEO (ADR-032) and Redirects (ADR-033) already set in this codebase. See Open Question OQ-01 — this gap is named, not silently invented into a new ADR. |

---

## Open Questions

- OQ-01: Should a dedicated Tier-1 plugin-manifest loader/registry be designed and built (a real
  install/enable/disable-as-a-package mechanism) before or after a second Tier-1 sample plugin is
  attempted, given Forms — like SEO and Redirects before it — ships as a hand-wired bundled core
  module rather than an installable package? This is arguably the actual "missing core-mediated
  primitive" AW-7's build order was probing for, one level up from mail/webhook/storage. — Owner:
  Coordinator / Software Architect — Resolve by: before dispatching a second Tier-1 sample plugin,
  or explicitly deferred with a named follow-up ADR.
- OQ-02: Exact Drizzle migration/table naming for `form_definitions`/`form_submissions`
  (mechanical naming-convention alignment with existing migrations, no behavior impact) — Owner:
  Software Architect — Resolve by: 2026-07-20.
- OQ-03: Should `form_submissions.source_ip` be stored raw, hashed, or omitted, given its only
  functional use is spam investigation and rate-limiting (which could key on a hash instead)? —
  Owner: Software Architect / Security review — Resolve by: 2026-07-20.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new library dependency is warranted: field-vocabulary validation is a small closed-enum check, rate limiting reuses whatever fixed-window mechanism the codebase already has none of yet (same not-yet-enforced posture as SEO/Redirects, see `api.spec.md`), and honeypot spam detection is a single reserved-key check — none of these justify adopting a new dependency. |
| II — Test-First | COMPLIES | TDD Agent certifies failing tests against this spec before the Programmer writes implementation code, per Article II. |
| III — Simplicity Gate | COMPLIES | Every new surface traces to a requirement: `form_definitions`/`form_submissions` tables → REQ-01/10; the notification subscriber → REQ-12; the webhook topic emission → REQ-11; the admin submissions view → REQ-13/14. No form-builder UI, no CAPTCHA integration, no multi-step logic — all explicitly out of scope. |
| IV — Anti-Abstraction Gate | COMPLIES | Forms introduces no new port. It consumes two already-accepted ports by handle (`MailerPort` from ADR-037, the outbox/domain-event bus from ADR-009) and a new topic string on the existing webhook subsystem (ADR-036) — no second webhook-dispatch mechanism, no second mail seam. |
| V — Integration-First Testing | COMPLIES | Every P1 AC above is verified at a real HTTP boundary: the public `POST /forms/:slug/submit` route, or the admin `/api/admin/v1/workspaces/:workspaceId/forms/**` routes. |
| VI — Security-by-Default | EXCEPTION (standing v1, per Constitution Art. VI) | The dev server has no full auth layer yet; this spec still enforces `admin.forms.manage`/`admin.forms.submissions.read`/`admin.forms.submissions.delete` at the existing `authorize()` gateway for every admin route. The public submission route is intentionally unauthenticated by design (REQ-05, a public contact form must be reachable by any site visitor) — a deliberate scope decision, not an instance of the standing no-auth gap. Submissions may carry visitor-supplied PII (name/email/message) and a source IP; this is stored admin-side only, never exposed on any public route, and REQ-14 gives operators a permanent-delete path for data-subject requests. |
| VII — Spec Integrity | COMPLIES | This spec's `spec_id`/`content_hash` are referenced by every downstream stage per Article VII. |
| VIII — Observability | COMPLIES | Every write path (definition write, submission accept/reject, notification dispatch) emits a structured error on failure (`errors.spec.md` §2); `form.submission.received` carries `workspaceId`/`formDefinitionId`/`submissionId` as its available correlation identifiers, matching the deferred-`correlationId` pattern already used elsewhere in this codebase. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (verified against existing `ADS-project-knowledge/reports/pipeline/` folders — `010-forms` is unused)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has default-value, limits, and dedup/honeypot rules)
- [x] traceability.spec.md complete (pending implementation — all rows seeded)
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row is reserved for Coordinator Planning Preflight before `/plan`
- [x] `spec_mode` is `greenfield` — no prior stub/reverse-spec evidence exists for Forms (unlike SEO/Redirects, which had `src/seo`/`src/redirects` interface stubs already); the brownfield-shaped dependency risks (mail/integrations adapter gaps, no plugin loader) are recorded in Dependencies/Open Questions instead

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Read `src/mail/{types,ports,index}.ts` and `src/integrations/{types,ports,index}.ts` in full
  before writing any Forms adapter/route code — consume `MailerPort` and the webhook topic
  mechanism exactly as those libraries already define them; do not redeclare a parallel mail or
  webhook-dispatch seam.
- Keep the public submission handler's response path free of any `await` on `MailerPort.send()`
  or webhook delivery (INV-05) — both must be dispatched through the outbox.

Ask before:
- Building any Tier-1 plugin-manifest loader/registry as part of this feature (OQ-01) — that is a
  separate, larger architectural decision this spec does not authorize.

Never:
- Add a form-builder (drag-drop) UI.
- Introduce a second webhook-dispatch mechanism parallel to `src/integrations`.
- Permanently delete a form definition (INV-08) — disable only.
