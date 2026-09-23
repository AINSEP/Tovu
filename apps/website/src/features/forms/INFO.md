# forms Overview

Owns the Contact Form — AW-7's Tier-1 ("declarative, zero-code") sample plugin (SPEC-010,
ADR-PIPE-010). An operator declares a form definition (name, workspace-unique slug, a closed
field-type vocabulary — text/email/textarea/checkbox), the public site accepts submissions against
that declaration, submissions land in an admin-viewable log, and every accepted submission can
trigger an email notification (`MailerPort`, ADR-037) and/or a webhook fan-out (the existing
ADR-036 subsystem — Forms adds zero webhook-dispatch code, only the event).

## Responsibilities

- Own `form_definitions`/`form_submissions` (two new, core-owned, bespoke tables — not the generic
  ADR-022 `entries` model, which doesn't exist in this repo).
- Validate the closed field-type vocabulary and a submission payload against a definition's
  declared fields (`forms.ts` — the pure "one evaluator").
- Admin definition CRUD (create/update/setStatus) through the existing `executeCommand` gateway
  (`write-service.ts`), mirroring `posts`/every other gateway-routed admin mutation.
- The sole public submission write path (`submit-service.ts`'s `submitForm`), deliberately
  bypassing `executeCommand` (no actor/permission fits an anonymous visitor) — mirrors
  `routes/site/analytics-ingest.ts`'s precedent.
- Enqueue `form.submission.received` on the core outbox for every accepted submission, consumed by
  both `notify-subscriber.ts` (Forms-owned) and `integrations`' `enqueueDelivery` (forwarded from
  one line in `server/app.ts` — zero Forms-owned webhook logic).
- Reuse the existing `server/middleware/rate-limit.ts` fixed-window limiter (`rate-limit-profile.ts`
  wraps it with a `(sourceIp, formDefinitionId)` composite key) rather than hand-rolling a second one.

## Rules

- A form definition is deleted like everything else — through the Trash (owner ruling 2026-09-21,
  superseding the original INV-08 "never deleted" wording): deleting moves it to the Trash, and it
  is removed permanently only by a Trash purge (a human on the Trash screen, or the 60-day
  sweeper), which removes its submissions with it; restore brings it back with its submissions.
  `FormDefinitionRepoPort` structurally has no delete method — that path is the Trash, not this
  port. A submission's own delete (REQ-14) likewise moves it to the Trash; only a purge deletes it
  permanently.
- `slug` is set once at creation and is never accepted from an `UPDATE_FORM_DEFINITION` patch
  (behavior.spec.md §1.1) — enforced in `write-service.ts`'s `updateFormDefinition`.
- An update patch may never omit a field id present in the current definition (behavior.spec.md
  §1.2) — historical `form_submissions.data_json` rows reference field ids by key (INV-01).
- A honeypot-tripped submission (`_hp` present and non-empty after trim) never persists a row,
  never emits the event, never triggers notification/webhook — but returns the identical `201`
  response as a genuine accept (REQ-08/INV-04) — see `isHoneypotTripped`/`submitForm`.
- `submit-service.ts` never `await`s `processOutbox(...)` or any mail/webhook-adjacent call inline
  — always `void`, so a slow/broken mail provider can never block the public response (REQ-16/
  INV-05, AC-24). This is a standing Code Review gate (ADR-PIPE-010 Enforcement).
- `manifest.ts` is plain, JSON-serializable data only — zero functions/closures, never imported by
  `forms.ts`/`write-service.ts`/`submit-service.ts`/`notify-subscriber.ts` (the OQ-01 seam that
  keeps a future real Tier-1 loader retrofit a wiring change, not a rewrite).
- No import of `repo.memory.ts`/`repo.sqlite.ts` from outside `write-service.ts`/`submit-service.ts`
  (the chokepoint boundary is a review-time architecture check, mirroring ADR-022's CI-canary
  pattern).

## Key Files

| File | Purpose |
|---|---|
| `manifest.ts` | THE OQ-01 seam — plain data declaration of Forms' Tier-1-shaped surface. |
| `types.ts` | Shared record/DTO shapes. |
| `forms.ts` | Pure validation core: `validateFieldDescriptors`, `validateSubmissionPayload`, `isHoneypotTripped`. |
| `write-service.ts` | Admin definition mutations, wraps `executeCommand`. |
| `submit-service.ts` | The public submission write path (`submitForm`), fire-and-forget outbox drain. |
| `notify-subscriber.ts` | Outbox subscriber: `MailerPort.send()` per configured recipient. |
| `rate-limit-profile.ts` | `FORMS_SUBMIT_PROFILE` + composite rate-limit key builder. |
| `ports.ts` | `FormDefinitionRepoPort`, `FormSubmissionRepoPort` (rule-of-two). |
| `repo.memory.ts` / `repo.sqlite.ts` | The two adapters. |
| `errors.ts` | Typed domain errors mapped 1:1 to `errors.spec.md` §2. |

## Out of Scope (this pass)

- A real Tier-1 plugin-manifest loader/registry — `manifest.ts` is the seam, not the loader.
- `webhookSigner`/`KeyringPort` production wiring, and a SQLite adapter for
  `webhook_subscriptions`/`webhook_deliveries` — pre-existing `integrations` gaps, unaffected by Forms.
- A drag-and-drop form builder, file-upload fields, CAPTCHA, multi-step forms.
