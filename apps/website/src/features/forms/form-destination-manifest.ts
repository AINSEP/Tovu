import { createHash } from "node:crypto";
import { canonicalJson } from "@jini-ai/core/records";
import { FIELD_TYPE_REGISTRY, submissionEvidenceSchema, type FormDefinitionRecord, type FormDeliveryForm, type FormSubmissionEvidence, type HtmlFormDefinitionRecord } from "@jini-ai/cms/forms";
import { htmlSubmissionDefinition } from "@jini-ai/cms/forms/html";
import { fieldMaxChars } from "./field-length-caps.js";

/**
 * @file The compact form manifest a hosting target receives so it can accept the site's forms where
 * Tovu's own server does not run (a static export). Generic: no host is named here. Names, required
 * flags, lengths, original labels/consent evidence and receiver validation; notification recipients and answers never leave Tovu, and
 * full validation still runs in Tovu when submissions are pulled back.
 */
export interface FormDestinationManifestForm {
  readonly slug: string;
  readonly evidence: Omit<FormSubmissionEvidence, "capturedAt" | "source">;
  readonly fields: readonly { readonly name: string; readonly type?: string; readonly options?: readonly string[]; readonly minLength?: number; readonly min?: number | string; readonly max?: number | string; readonly step?: number; readonly checkboxValue?: string; readonly validationUnsupported?: true; readonly required: boolean; readonly maxLength?: number; readonly multiple?: true }[];
}

/**
 * Active definitions only, in their stored order. HTML-mode forms use the same submission view the
 * live endpoint validates against, so the posted names match.
 * @complexity O(definitions * fields).
 */
export function buildFormDestinationManifest({ definitions }: { definitions: readonly HtmlFormDefinitionRecord[] }, _optional = {}): FormDestinationManifestForm[] {
  return definitions.filter((definition) => definition.status === "active" && (!definition.provider || definition.provider.id === "builtin")).map((stored) => {
    const definition = htmlSubmissionDefinition({ definition: stored, body: {} });
    const schema = submissionEvidenceSchema({ definition });
    const evidence = { version: 1 as const, ...schema, schemaHash: createHash("sha256").update(canonicalJson({ value: schema })).digest("hex") };
    return { slug: definition.slug, evidence, fields: definition.fields.map((field) => ({ ...manifestField(field), ...submitCap(field), ...receiverValidation(field) })) };
  });
}

/** The live submit path's cap (`field-length-caps.ts`), defaults included, so a static host refuses
 *  the same over-long answers Tovu's own server would. @complexity O(1). */
function submitCap(field: FormDefinitionRecord["fields"][number]): { maxLength?: number } {
  const maxLength = fieldMaxChars({ field });
  return maxLength === undefined ? {} : { maxLength };
}

/**
 * The form as a push delivery receives it: the manifest's fields plus each field's `label` and
 * `type` and original option labels, so a destination can name its columns and historical choices. Used for the snapshot frozen when a submission is
 * planned, whatever the definition's status is now (the submission was accepted already).
 * @complexity O(fields).
 */
export function buildFormDeliveryForm({ definition: stored }: { definition: FormDefinitionRecord }, _optional = {}): FormDeliveryForm {
  const definition = htmlSubmissionDefinition({ definition: stored, body: {} });
  return { slug: definition.slug, fields: definition.fields.map((field) => ({ ...manifestField(field), label: field.label, type: field.type, ...(field.options ? { options: structuredClone(field.options) } : {}) })) };
}

function manifestField(field: FormDefinitionRecord["fields"][number]): FormDestinationManifestForm["fields"][number] {
  return {
    name: field.name ?? field.id,
    required: field.required,
    ...(typeof field.maxLength === "number" ? { maxLength: field.maxLength } : {}),
    ...((FIELD_TYPE_REGISTRY as Record<string, { multiple?: boolean }>)[field.type]?.multiple === true ? { multiple: true as const } : {}),
  };
}

/** Describe the receiver's supported subset; unsupported rules fail at destination preparation,
 * before a visitor can be told that an invalid answer succeeded. O(options), no I/O. */
function receiverValidation(field: FormDefinitionRecord["fields"][number]): Partial<FormDestinationManifestForm["fields"][number]> {
  const pattern = field.pattern ?? field.attributes?.pattern;
  return { type: field.type,
    ...(field.options ? { options: field.options.map(option => option.value).filter(value => value !== '') } : {}),
    ...(field.minLength !== undefined || field.attributes?.minlength !== undefined ? { minLength: field.minLength ?? Number(field.attributes!.minlength) } : {}),
    ...(field.checkboxValue !== undefined ? { checkboxValue: field.checkboxValue } : {}),
    ...(field.min !== undefined || field.attributes?.min !== undefined ? { min: field.min ?? field.attributes!.min! } : {}),
    ...(field.max !== undefined || field.attributes?.max !== undefined ? { max: field.max ?? field.attributes!.max! } : {}),
    ...(field.step !== undefined || field.attributes?.step !== undefined ? { step: field.step ?? Number(field.attributes!.step) } : {}),
    ...(pattern !== undefined ? { validationUnsupported: true as const } : {}),
  };
}
