/**
 * @file The OQ-01 seam (SPEC-010, ADR-PIPE-010 Decision).
 *
 * Purpose:
 * Isolates Forms' declarative, Tier-1-shaped surface — field-type vocabulary, capability
 * (permission) strings, admin nav entry, and webhook topic name — as plain, side-effect-free,
 * JSON-serializable data. Nothing in this file is a function, a closure, or an import of runtime
 * code from `./forms`, `./write-service`, `./submit-service`, or any other domain module.
 *
 * How it relates to the project:
 * - Read by ordinary hand-wired registration code today: `server/app.ts` (route registration),
 *   `identity/permissions.ts` (permission catalog registration) — see ADR-PIPE-010 Decision.
 * - When a real Tier-1 manifest loader eventually exists, the retrofit is: (a) serialize this
 *   object to whatever manifest format the loader defines, and (b) replace the hand-wired
 *   registration call sites with the loader's generic registration calls. No change to
 *   `forms.ts`/`write-service.ts`/`submit-service.ts`/`notify-subscriber.ts`/the repo
 *   ports/adapters is required.
 *
 * Enforcement (ADR-PIPE-010 Enforcement / tasks.md T049): Code Review verifies this file contains
 * only plain data literals — no function/closure exports, no imports of runtime code — and that no
 * domain file (`forms.ts`/`write-service.ts`/`submit-service.ts`) imports this module back. That
 * asymmetry (this file is read BY activation code, never read BY domain code) is what keeps the
 * loader retrofit mechanical instead of a rewrite.
 */

/** The closed field-type vocabulary (REQ-02, INV-02) — the only types a `FieldDescriptor` may declare. */
export const FIELD_TYPE_VOCABULARY = ["text", "email", "textarea", "checkbox"] as const;

/** The three `admin.forms.*` capability/permission strings (REQ-15, api.spec.md §2), verbatim. */
export const FORMS_CAPABILITIES = [
  "admin.forms.manage",
  "admin.forms.submissions.read",
  "admin.forms.submissions.delete",
] as const;

/** The domain-event topic name `submit-service.ts` enqueues onto the outbox (REQ-11, REQ-12). */
export const FORM_SUBMISSION_RECEIVED_TOPIC = "form.submission.received";

/** The admin sidebar nav entry descriptor Forms declares (ui.spec.md §6, mirrors `apps/admin/src/nav.ts`'s shape). */
export const FORMS_ADMIN_NAV_ENTRY = {
  id: "forms",
  label: "Forms",
  href: "#/forms",
} as const;

/**
 * Plain, JSON-serializable declaration of Forms' Tier-1-shaped surface (ADR-PIPE-010 API/Event
 * Contract Summary: `pluginId`, `tier`, `displayName`, `fieldTypeVocabulary`, `capabilities[]`,
 * `adminMenuEntry`, `webhookTopics[]`). This is the one object other agents (and any future
 * loader-design work) should read as "what Forms declares."
 */
export const FORMS_MANIFEST = {
  pluginId: "forms",
  tier: 1,
  displayName: "Contact Form",
  fieldTypeVocabulary: FIELD_TYPE_VOCABULARY,
  capabilities: FORMS_CAPABILITIES,
  adminMenuEntry: FORMS_ADMIN_NAV_ENTRY,
  webhookTopics: [FORM_SUBMISSION_RECEIVED_TOPIC],
} as const;
