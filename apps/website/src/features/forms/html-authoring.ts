/** HTML authoring adapter. Unsanitized, admin/owner trusted markup, like HTML Pages.
 * parse5 supplies real HTML semantics (comments/scripts are never mistaken for inputs).
 * Prototype belongs in @jini-ai/cms-forms later; Jini is read-only for this dispatch. */
import { parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import { FormFieldValidationError, type FieldDescriptor, type FormDefinitionRecord } from "@jini-ai/cms-forms";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];
export type FormAuthoring = { mode?: "builder" | "html"; html?: string };
export type HtmlFormDefinitionRecord = FormDefinitionRecord & FormAuthoring;

function invalid(reason: string): never {
  throw new FormFieldValidationError({ message: reason, fieldErrors: [{ field: "html", reason }] });
}

function elements(nodes: readonly Node[]): Element[] {
  const found: Element[] = [];
  const stack = [...nodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (!("tagName" in node)) continue;
    found.push(node);
    // Templates are inert and do not contribute successful controls.
    if (node.tagName !== "template") stack.push(...[...node.childNodes].reverse());
  }
  return found;
}

function attr(element: Element, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function labelText(node: Element): string {
  const stack: Node[] = [...node.childNodes].reverse();
  let text = "";
  while (stack.length) {
    const child = stack.pop()!;
    if ("value" in child) text += child.value;
    else if ("tagName" in child && !["input", "select", "textarea", "script", "style"].includes(child.tagName)) {
      stack.push(...[...child.childNodes].reverse());
    }
  }
  return text.trim();
}

/** Derives the submission allowlist at save time and removes server-owned transport overrides.
 * Parsing normalizes HTML syntax; scripts and authored styling remain unsanitized. */
export function deriveHtmlForm(
  { html }: { html: string },
  _optional: Record<string, never> = {},
): { mode: "html"; html: string; fields: FieldDescriptor[] } {
  if (typeof html !== "string" || html.length > 200_000) invalid("HTML must be a string of at most 200000 characters");
  const fragment = parseFragment(html);
  const all = elements(fragment.childNodes);
  const forms = all.filter((element) => element.tagName === "form");
  if (forms.length > 1) invalid("Use a form body or one outer form wrapper");
  for (const form of forms) {
    const parent = form.parentNode;
    if (!parent) continue;
    const index = parent.childNodes.indexOf(form);
    parent.childNodes.splice(index, 1, ...form.childNodes);
    for (const child of form.childNodes) child.parentNode = parent;
  }
  const fields = new Map<string, FieldDescriptor>();
  const labels = all.filter((element) => element.tagName === "label");
  for (const element of all) {
    // A submit button's overrides or a control's `form` attribute must not bypass our endpoint.
    for (const name of ["form", "formaction", "formmethod", "formenctype", "formtarget"]) {
      element.attrs = element.attrs.filter((attribute) => attribute.name !== name);
    }
    if (!["input", "textarea", "select", "button"].includes(element.tagName)) continue;
    if (element.tagName === "button") {
      element.attrs = element.attrs.filter((attribute) => attribute.name !== "name"); // Buttons are actions, not submission columns.
      continue;
    }
    const name = attr(element, "name");
    if (!name) continue;
    if (name === "_hp" || ["__proto__", "constructor", "prototype"].includes(name)) invalid(`Reserved field name '${name}'`);
    const inputType = (attr(element, "type") ?? "text").toLowerCase();
    if (element.tagName === "input" && ["submit", "reset", "button", "image"].includes(inputType)) {
      element.attrs = element.attrs.filter((attribute) => attribute.name !== "name");
      continue;
    }
    if (element.tagName === "input" && ["file", "password"].includes(inputType)) invalid(`Input type '${inputType}' is not supported`);
    if (element.tagName === "select" && attr(element, "multiple") !== undefined) invalid("Multiple selections are not supported");
    if (fields.has(name)) {
      if (inputType === "radio" && fields.get(name)?.type === "text") {
        const group = fields.get(name)!;
        group.required = group.required || attr(element, "required") !== undefined;
        continue;
      }
      invalid(`Duplicate field name '${name}'`);
    }
    if (inputType === "checkbox") {
      // Jini stores checkboxes as booleans; native POST must use its accepted "on" wire value.
      element.attrs = element.attrs.filter((attribute) => attribute.name !== "value");
    }
    const id = attr(element, "id");
    const parentLabel = element.parentNode && "tagName" in element.parentNode && element.parentNode.tagName === "label"
      ? element.parentNode : undefined;
    const label = labels.find((item) => id !== undefined && attr(item, "for") === id) ?? parentLabel;
    const maxLength = attr(element, "maxlength");
    fields.set(name, {
      id: name,
      label: label ? labelText(label) || name : attr(element, "aria-label") || name,
      type: element.tagName === "textarea" ? "textarea" : inputType === "email" ? "email" : inputType === "checkbox" ? "checkbox" : "text",
      required: attr(element, "required") !== undefined,
      ...(maxLength !== undefined ? { maxLength: Number(maxLength) } : {}),
    });
  }
  // Re-serialization also discards ignored/dangling </form> tokens: they must never close our
  // server-owned wrapper early. Raw-text script contents are preserved by the HTML serializer.
  return { mode: "html", html: serialize(fragment), fields: [...fields.values()] };
}

/** Old rows remain arrays; authored forms use the same JSON-in-text column, without a migration. */
export function decodeFormFields({ json }: { json: string }, _optional = {}): Pick<HtmlFormDefinitionRecord, "fields" | "mode" | "html"> {
  const stored = JSON.parse(json) as FieldDescriptor[] | { fields: FieldDescriptor[]; mode: "html"; html: string };
  return Array.isArray(stored) ? { fields: stored } : { fields: stored.fields, mode: stored.mode, html: stored.html };
}

export function encodeFormFields({ definition }: { definition: HtmlFormDefinitionRecord }, _optional = {}): string {
  return JSON.stringify(definition.mode === "html"
    ? { fields: definition.fields, mode: "html", html: definition.html ?? "" }
    : definition.fields);
}
