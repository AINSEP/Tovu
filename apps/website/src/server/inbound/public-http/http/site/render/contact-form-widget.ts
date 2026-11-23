import type { JsonObject } from "@jini-ai/core/primitives";
import { FORM_SUCCESS_CLASS, FORM_ERROR_CLASS, FORM_CLASS, FORM_RANGE_READOUT_SCRIPT, FORM_BASELINE_STYLE } from "../form-presentation-assets.js";
import { stampFormFieldMaxLengths, renderFormSuccessSlot, renderFormErrorSlot } from "@jini-ai/cms/forms/form-controls";
import { fieldMaxChars } from "@jini-ai/cms/forms/field-length-caps";
import { str, arr } from "@jini-ai/cms/public-http/http/site/render/value-readers";
import { renderWidgetPlaceholder } from "./widgets/placeholder.js";
import { randomUUID } from "node:crypto";
import type { FormCollectionPlan } from "@jini-ai/core/contracts/forms";
import { renderFormCollection, renderHtmlForm, renderHtmlFormBody, renderFormSchemaHash } from "@jini-ai/cms/forms/html-render";
import { escapeHtml } from "#src/platform/html/escape";

/** Field rendering, attribute allowlisting and help/error association belong to Jini's registry
 * renderer. The host supplies its existing CSS classes and id prefix for theme compatibility. */
const DEFAULT_CONTACT_FORM_SUCCESS_MESSAGE = "Thanks — your message has been sent.";

/** Renders a `contact-form` widget: Forms' own declared field vocabulary (REQ-37 — never a
 * hardcoded field-type list), posting to Forms' existing public route unmodified (`POST
 * /forms/:slug/submit`, `routes/site/forms-submit.ts`) — this widget type introduces no new
 * submission endpoint (REQ-39).
 *
 * Carries three things beyond the original bare `<form>` (2026-08-31 fix, generalized the same day —
 * see `form-render.ts`'s module doc for why the baseline style/slots/splice live there now):
 * 1. `form-render.ts`'s {@link FORM_BASELINE_STYLE} — see that constant's own doc for why a `<style>`
 *    tag lives here instead of a theme stylesheet or `pageShell`'s `<head>`.
 * 2. The GENERIC `data-form-slug` anchor (plus `.widget-contact-form-success`/`-error`/
 *    `data-contact-form-slug` kept alongside it for theme back-compat — no theme has ever targeted
 *    them, per the audit `form-render.ts` cites, but they were always a documented override surface)
 *    on both the form and its (initially hidden) success-message sibling — the stable anchor
 *    {@link injectFormSubmissionResultIntoHtml} matches against.
 * 3. `props.successMessage` (previously accepted by the resolver, `contact-form.ts`, but never read
 *    here) rendered into that hidden success slot up front, so the post-submission splice only has to
 *    reveal it, never invent or fetch it — this render function is the only place `successMessage` is
 *    naturally in scope.
 */
/** Preserve authored HTML only in HTML mode for a native collection plan.
 * @complexity O(1) time/space; strings are reused, no I/O.
 * @overallScore 97 — Recommended: HTML sanitization remains the authoring write boundary's responsibility. */

function formSchemaOptions({ props }: { props: JsonObject }): { schemaHash?: string } {
  return typeof props.schemaHash === "string" ? { schemaHash: props.schemaHash } : {};
}

function collectionHtmlOptions({ props }: { props: JsonObject }): { html?: string; className: string } {
  return { ...(props.mode === "html" && typeof props.html === "string" ? { html: props.html } : {}), className: FORM_CLASS };
}

/** Render the resolved collection plan for native external forms or the existing built-in form shell.
 * @complexity O(fields + HTML bytes) time/space, no I/O.
 * @overallScore 95 — Low: the legacy built-in Builder shell remains separate for compatibility. */
export function renderWidgetContactForm(props: JsonObject): string {
  const slug = str({ value: props.slug });
  if (!slug) return renderWidgetPlaceholder();
  // Allocate at the occurrence boundary: the same resolved IR can appear in several embeds or
  // regions, even repeatedly in one region. No answer data or process-wide counter is retained.
  const idPrefix = `widget-contact-${randomUUID()}`;
  // HTML mode is Builder's look plus author refinements, not "unstyled": the same baseline and
  // `tovu-form` hook let the active theme's form rules apply, and author CSS still wins over both.
  // The slider value readout ships only with forms that have a range field.
  const rangeReadout = arr({ value: props.fields }).some(field => typeof field === "object" && field !== null && !Array.isArray(field) && field.type === "range") ? FORM_RANGE_READOUT_SCRIPT : "";
  const fieldDescriptors = arr({ value: props.fields }) as unknown as import("@jini-ai/cms/forms").FieldDescriptor[];
  if (props.collectionPlan) return FORM_BASELINE_STYLE + renderFormCollection({
    slug, fields: fieldDescriptors, plan: props.collectionPlan as unknown as FormCollectionPlan,
    hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
  }, { ...collectionHtmlOptions({ props }), idPrefix, consentOff: props.collectionConsentOff === true }) + rangeReadout;
  // Both modes show the length caps the submit route enforces (owner 2026-10-25, spam protection).
  if (props.mode === "html") return FORM_BASELINE_STYLE + stampFormFieldMaxLengths({ html: renderHtmlForm({
    slug, action: `/forms/${encodeURIComponent(slug)}/submit`,
    hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-jini-form-success", error: "data-tovu-form-error" },
    fields: fieldDescriptors,
  }, {
    ...(typeof props.html === "string" ? { html: props.html } : {}),
    ...formSchemaOptions({ props }),
    idPrefix,
    successMessage: str({ value: props.successMessage }) || DEFAULT_CONTACT_FORM_SUCCESS_MESSAGE,
    className: FORM_CLASS,
  }), fields: fieldDescriptors, fieldMaxChars }) + rangeReadout;
  const escapedSlug = escapeHtml({ text: slug });
  const fieldOptions = { submitLabel: "Send", idPrefix, fieldClass: "widget-form-field", errorClass: "widget-form-field-error" };
  const fields = stampFormFieldMaxLengths({ html: renderHtmlFormBody({ fields: fieldDescriptors, hooks: { field: "data-tovu-field" } }, fieldOptions), fields: fieldDescriptors, fieldMaxChars });
  const successMessage = escapeHtml({ text: str({ value: props.successMessage }) || DEFAULT_CONTACT_FORM_SUCCESS_MESSAGE });
  const legacyAttrs = `data-contact-form-slug="${escapedSlug}"`;
  const successSlot = renderFormSuccessSlot({ slug: escapedSlug, message: successMessage, className: FORM_SUCCESS_CLASS }, { extraClasses: "widget-contact-form-success", extraAttrs: legacyAttrs });
  const errorSlot = renderFormErrorSlot({ slug: escapedSlug, className: FORM_ERROR_CLASS }, { extraClasses: "widget-contact-form-error", extraAttrs: legacyAttrs });
  return (
    FORM_BASELINE_STYLE +
    successSlot +
    `<form class="widget ${FORM_CLASS} widget-contact-form" toolname="form_${escapeHtml({ text: slug.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 123) })}" tooldescription="${escapedSlug}" method="post"${fieldDescriptors.some(field => field && String(field.type) === "file") ? ' enctype="multipart/form-data"' : ""} action="/forms/${escapedSlug}/submit" data-form-slug="${escapedSlug}" ${legacyAttrs}>` +
    errorSlot +
    fields + renderFormSchemaHash(formSchemaOptions({ props })) +
    `<div hidden aria-hidden="true"><input type="text" name="_hp" tabindex="-1" autocomplete="off"></div>` +
    `</form>` +
    rangeReadout
  );
}
