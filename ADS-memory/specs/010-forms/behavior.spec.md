# Behavior Rules Spec: forms

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-010 |
| feature_name | FEAT-010-forms |
| version | 1.0.0 |
| content_hash | sha256:PENDING |
| last_edited | 2026-07-13T00:00:00Z |

**Purpose:** Captures deterministic, rule-based behavior not fully expressed by the acceptance
criteria alone — immutability rules, default values, numeric limits, and the honeypot
discard/dedup logic.

---

## 1. Precedence / Immutability Rules

### 1.1 Slug Immutability

**Situation:** After a form definition is created, can its `slug` change?

**Rule:** No. `slug` is set once at `CREATE_FORM_DEFINITION` and is never accepted in
`UPDATE_FORM_DEFINITION`'s patch (`api.spec.md` §4 explicitly omits `slug` from the `PUT` body
schema). This is a deliberate simplicity choice (not a rediscovered precedence chain): a slug
change would break any already-embedded public form on the live site and would not correspond to
any AW-7-required capability. If slug-rename support is ever wanted, it is a new requirement for a
future spec revision, not an oversight here.

**Test requirement:** The TDD Agent must write a test asserting a `PUT` body containing `slug` is
either ignored or rejected (Software Architect picks one at implementation time; either is
constitution-compliant, but the chosen behavior must be consistent and documented in code).

### 1.2 Field-Id Removal Restriction

**Situation:** When an admin edits an existing form definition's `fields[]`, can a previously
existing field id be removed?

**Rule:** No — not in v1. `UPDATE_FORM_DEFINITION` rejects any `fields[]` patch that omits a field
id present in the definition's current `fields[]` (i.e., edits may add new fields, relabel or
retype existing ones, or change `required`/`maxLength`, but may not delete a field id). Rationale:
historical `form_submissions.data_json` rows reference field ids by key (INV-01); silently
dropping a field id from the definition would orphan that key in every historical submission's
displayed data with no way to know what it meant. This is intentionally conservative for v1 — a
real "safely retire a field" flow (e.g., archiving rather than deleting) is a follow-up, not
solved here.

**Test requirement:** The TDD Agent must write a test asserting an `UPDATE_FORM_DEFINITION` patch
that omits an existing field id is rejected with `FORMS_FIELD_VALIDATION_ERROR`.

---

## 2. Ordering Rules

### 2.1 Submissions List Order

**Field used for sorting:** `submitted_at`

**Direction:** Descending (newest first).

**Stability:** Ties (identical `submitted_at` to the millisecond) break on `id` descending — `id`
is a ULID, which is lexicographically sortable by creation time at sub-millisecond precision, so
this tie-break is itself effectively chronological.

**When overridden:** Never in v1 — no caller-supplied sort parameter exists (REQ-13 does not ask
for one; keep v1 tight per `feature.spec.md` Scope).

**Invariant:** `FORMS_LIST_SUBMISSIONS` results are always newest-first; out-of-order results are
a bug.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `status` | `CREATE_FORM_DEFINITION` | `"active"` | A newly created form should be immediately submittable — the admin's whole point in creating it is to start collecting submissions; requiring a second "activate" step would add friction with no safety benefit (unlike, say, a payment feature). |
| `notify.enabled` | `CREATE_FORM_DEFINITION` (when `notify` omitted) | `false` | Opt-in notification avoids surprising an admin with unconfigured-recipient emails; an empty recipient list with `enabled: true` would silently no-op, which is worse than an explicit `false`. |
| `field.required` | `FieldDescriptor` | `false` | Matches the common contact-form convention where only a subset of fields (e.g. email) are mandatory; explicit opt-in to required is safer than assuming every field is mandatory. |
| `limit` | `FORMS_LIST_SUBMISSIONS` query param | `50` | Balances admin-screen responsiveness against needing many round trips for an active form. |
| Rate limit window | `FORMS_SUBMIT` profile | `5 requests / 60s per (ip, formId)` | Generous enough for a real visitor who mistypes and resubmits, tight enough to blunt a naive scripted flood without needing a CAPTCHA dependency (out of scope, see Open Questions). |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Form name length | 1–200 characters | API | |
| Slug pattern | `^[a-z0-9][a-z0-9-]{0,63}$` | API | Lowercase, digits, hyphens only — safe for a URL path segment with no encoding. |
| Fields per definition | 1–20 | API | Rejected above 20 with `FORMS_FIELD_VALIDATION_ERROR`, not silently truncated — keeps the declarative surface small and provably bounded, in the spirit (not the letter — no expression language is introduced here) of ADR-024 §5's Tier-1 boundedness principle. |
| Field label length | 1–200 characters | API | |
| Field `maxLength` | 1–5000 | API | Forbidden (must be absent/null) when `type === "checkbox"` — a checkbox has no length-bounded value. |
| Notify recipients | 0–10 addresses | API | Above 10 is rejected, not clamped. |
| Honeypot field (`_hp`) length | ≤200 characters | API | Informational cap only — any non-empty value (1+ chars) triggers the discard path (REQ-08); the cap just bounds payload size. |
| `FORMS_SUBMIT` rate limit | 5 requests / 60s per `(ip, formId)` | API (this feature's own enforcement — the one exception to the "no rate-limiting infra exists yet" posture noted in `api.spec.md`) | The 6th request in-window is rejected with `FORMS_RATE_LIMIT_EXCEEDED`, not queued or delayed. |
| Submissions list page size | 1–100 | API | Requesting >100 is rejected with `FORMS_FIELD_VALIDATION_ERROR`-shaped query validation, matching the general list-endpoint convention in this codebase. |

---

## 5. Deduplication / Discard Rules

### 5.1 What Counts as a Honeypot Trip

A submission is honeypot-tripped if and only if its `_hp` body key is present **and** non-empty
after trimming whitespace. An absent `_hp` key, or a present-but-empty/whitespace-only `_hp`
value, is the normal case and proceeds through ordinary validation (EC-09) — it is not itself
suspicious (a visitor whose browser omits unfilled hidden fields, or sends an empty string, is
indistinguishable from one whose theme always includes the field).

### 5.2 How a Honeypot Trip Is Handled

**At submission time:** No `form_submissions` row is inserted, `form.submission.received` is
never emitted, and `MailerPort.send()` is never called (INV-04). The HTTP response is
**identical** to a genuinely accepted submission (`201`, `FormSubmitResponse{status:"accepted"}`)
— a scripted bot must not be able to distinguish "your submission was silently dropped" from
"your submission worked," which would let it detect and route around the honeypot.

**Not deduplication in the classic sense:** this is a silent-discard rule, not a
same-content-conflict rule — Forms has no "duplicate submission" concept at all in v1 (two
identical submissions from the same visitor are both accepted, subject only to the rate limit in
§4). If duplicate-submission suppression is ever wanted, it is a new requirement, not implied by
this section.

---

## 6. Tie-Break Logic

### 6.1 Slug Creation Race

**When does this apply:** Two `CREATE_FORM_DEFINITION` requests for the same workspace, same
`slug`, arrive concurrently (EC-04).

**Tie-break rule:** The database's unique index on `(workspace_id, slug)` admits exactly one
insert; whichever transaction commits first wins, and the other's insert raises a constraint
violation the write-service maps to `FORMS_SLUG_CONFLICT`. There is no application-level
"first-request-wins" logic to get right — SQLite's own constraint enforcement is the tie-break
mechanism (matching the `posts_workspace_slug_unique` precedent already in `src/infra/db/schema.ts`,
rather than the app-level pre-check `settingDefinitions` needed for its *partial* uniqueness —
Forms' uniqueness is unconditional, so a real DB unique index suffices).

**Rationale:** A real unique index is strictly simpler and more correct than an app-level
check-then-insert race for unconditional uniqueness — no partial-uniqueness (`WHERE` clause)
requirement exists here the way it did for settings' active-or-alias rows.

**Invariant:** The tie-break is deterministic at the database level — identical concurrent inputs
always produce exactly one winner and one `FORMS_SLUG_CONFLICT`.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| `fields[]` has exactly 20 entries | Accepted. | Yes |
| `fields[]` has 21 entries | Rejected with `FORMS_FIELD_VALIDATION_ERROR`. | Yes |
| A `checkbox` field declares `maxLength: 100` | Rejected with `FORMS_FIELD_VALIDATION_ERROR` (maxLength forbidden for checkbox). | Yes |
| `notify.recipients` has exactly 10 entries | Accepted. | Yes |
| `notify.recipients` has 11 entries | Rejected with `FORMS_FIELD_VALIDATION_ERROR`. | Yes |
| 5th submission in-window from the same `(ip, formId)` | Accepted. | Yes |
| 6th submission in-window from the same `(ip, formId)` | Rejected with `FORMS_RATE_LIMIT_EXCEEDED`. | Yes |
| A submission's `_hp` field is `"   "` (whitespace only) | Treated as empty — normal validation proceeds, not the discard path (§5.1). | Yes |
| An `UPDATE_FORM_DEFINITION` patch omits a field id present in the current definition | Rejected with `FORMS_FIELD_VALIDATION_ERROR` (§1.2). | Yes |
| A `PUT` body includes `slug` | Ignored or rejected (implementation's choice, §1.1) — never changes the stored `slug`. | Yes |
