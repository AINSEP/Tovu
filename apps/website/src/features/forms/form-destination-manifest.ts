import { FIELD_TYPE_REGISTRY, type FormDefinitionRecord } from "@jini-ai/cms/forms";
import { htmlSubmissionDefinition } from "@jini-ai/cms/forms/html";

/**
 * @file The compact form manifest a hosting target receives so it can accept the site's forms where
 * Tovu's own server does not run (a static export). Generic: no host is named here. Names, required
 * flags and lengths only; markup, theme, notification recipients and answers never leave Tovu, and
 * full validation still runs in Tovu when submissions are pulled back.
 */
export interface FormDestinationManifestForm {
  readonly slug: string;
  readonly fields: readonly { readonly name: string; readonly required: boolean; readonly maxLength?: number; readonly multiple?: true }[];
}

/**
 * Active definitions only, in their stored order. HTML-mode forms use the same submission view the
 * live endpoint validates against, so the posted names match.
 * @complexity O(definitions * fields).
 */
export function buildFormDestinationManifest({ definitions }: { definitions: readonly FormDefinitionRecord[] }, _optional = {}): FormDestinationManifestForm[] {
  return definitions.filter((definition) => definition.status === "active").map((stored) => {
    const definition = htmlSubmissionDefinition({ definition: stored, body: {} });
    return { slug: definition.slug, fields: definition.fields.map((field) => manifestField(field)) };
  });
}

/**
 * The form as a push delivery receives it: the manifest's fields plus each field's `label` and
 * `type`, so a destination can name its columns. Used for the snapshot frozen when a submission is
 * planned, whatever the definition's status is now (the submission was accepted already).
 * @complexity O(fields).
 */
export function buildFormDeliveryForm({ definition: stored }: { definition: FormDefinitionRecord }, _optional = {}): FormDeliveryManifestForm {
  const definition = htmlSubmissionDefinition({ definition: stored, body: {} });
  return { slug: definition.slug, fields: definition.fields.map((field) => ({ ...manifestField(field), label: field.label, type: field.type })) };
}

/** A manifest form whose fields also carry their display label and field type. */
export interface FormDeliveryManifestForm {
  readonly slug: string;
  readonly fields: readonly (FormDestinationManifestForm["fields"][number] & { readonly label: string; readonly type: string })[];
}

function manifestField(field: FormDefinitionRecord["fields"][number]): FormDestinationManifestForm["fields"][number] {
  return {
    name: field.name ?? field.id,
    required: field.required,
    ...(typeof field.maxLength === "number" ? { maxLength: field.maxLength } : {}),
    ...((FIELD_TYPE_REGISTRY as Record<string, { multiple?: boolean }>)[field.type]?.multiple === true ? { multiple: true as const } : {}),
  };
}
