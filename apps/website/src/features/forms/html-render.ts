/** Framework-free HTML renderer, kept separate for extraction into @jini-ai/cms-forms.
 * Local prototype authorized 2026-10-04; Jini is read-only in this dispatch.
 * The host owns the endpoint; field styling belongs entirely to the page author. */
import type { FieldDescriptor } from "@jini-ai/cms-forms";

export function escapeFormHtml({ value }: { value: string }, _optional = {}): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function renderHtmlFormBody(
  { fields }: { fields: readonly FieldDescriptor[] },
  { submitLabel = "Send" }: { submitLabel?: string } = {},
): string {
  return fields.map((field) => {
    const name = escapeFormHtml({ value: field.id });
    const label = escapeFormHtml({ value: field.label });
    const required = field.required ? " required" : "";
    const maxLength = field.maxLength != null ? ` maxlength="${field.maxLength}"` : "";
    const hooks = `name="${name}" data-tovu-field="${name}" toolparamtitle="${label}" toolparamdescription="${label}"${required}${maxLength}`;
    const control = field.type === "textarea"
      ? `<textarea ${hooks}></textarea>`
      : `<input type="${field.type}" ${hooks}>`;
    return `<label>${label}${control}</label>`;
  }).join("\n") + `\n<button type="submit">${escapeFormHtml({ value: submitLabel })}</button>`;
}

export function renderHtmlForm(
  { slug, fields, action }: { slug: string; fields: readonly FieldDescriptor[]; action: string },
  { html, successMessage = "Thanks — your message has been sent." }: { html?: string; successMessage?: string } = {},
): string {
  const escapedSlug = escapeFormHtml({ value: slug });
  const slugHook = `data-form-slug="${escapedSlug}"`;
  return `<div data-tovu-form-success ${slugHook} role="status" hidden>${escapeFormHtml({ value: successMessage })}</div>` +
    `<form data-tovu-form="${escapedSlug}" ${slugHook} toolname="form_${escapeFormHtml({ value: slug.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 123) })}" tooldescription="${escapedSlug}" method="post" action="${escapeFormHtml({ value: action })}">` +
    `<div data-tovu-form-error ${slugHook} role="alert" hidden></div>` +
    (html ?? renderHtmlFormBody({ fields })) +
    // Hidden container requires neither a theme class nor inline CSS; bots still see the input.
    `<div hidden aria-hidden="true"><input type="text" name="_hp" tabindex="-1" autocomplete="off"></div></form>`;
}
