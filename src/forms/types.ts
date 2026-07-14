import type { UUID } from "../core/ports";

/**
 * @file Shared types for the `forms` library (SPEC-010, ADR-PIPE-010).
 *
 * Purpose:
 * Plain data shapes shared across `forms.ts`/`write-service.ts`/`submit-service.ts`/
 * `notify-subscriber.ts`/the repo ports and adapters.
 *
 * `FieldType` intentionally re-states the same four literals `manifest.ts`'s
 * `FIELD_TYPE_VOCABULARY` data also carries, rather than importing that constant — domain code
 * (this file included) never imports `./manifest` (ADR-PIPE-010 Decision/Enforcement: the
 * manifest is read BY activation code, never read BY domain code, which is what keeps a future
 * loader retrofit mechanical). Keep the two lists in sync by hand; Code Review's T049 static
 * check would catch a domain-file import of `./manifest`, but not this kind of value drift, so
 * this is a documented, deliberate duplication, not an oversight.
 */
export type FieldType = "text" | "email" | "textarea" | "checkbox";

export type FormDefinitionStatus = "active" | "disabled";

export interface FieldDescriptor {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  maxLength?: number | null;
}

export interface NotifyConfig {
  enabled: boolean;
  recipients: string[];
}

export interface FormDefinitionRecord {
  id: UUID;
  workspaceId: UUID;
  name: string;
  slug: string;
  fields: FieldDescriptor[];
  notify: NotifyConfig;
  status: FormDefinitionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmissionRecord {
  id: UUID;
  workspaceId: UUID;
  formDefinitionId: UUID;
  data: Record<string, string | boolean>;
  sourceIp: string;
  submittedAt: string;
}

/** `LIST_FORM_SUBMISSIONS` selector output shape (state.spec.md §4). */
export interface FormSubmissionPage {
  items: FormSubmissionRecord[];
  nextCursor: string | null;
}
