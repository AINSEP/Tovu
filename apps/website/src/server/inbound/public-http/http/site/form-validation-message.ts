import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { FORM_VALIDATION_COPY, formValidationCopy } from "./form-validation-i18n.js";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];
function attribute(node: Element, name: string) { return node.attrs.find((attr) => attr.name === name)?.value; }
function text(node: Node): string {
  let result = "";
  const stack: Node[] = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.nodeName === "#text" && "value" in current) result += current.value;
    else if ("tagName" in current && !["input", "textarea", "select", "script", "style", "template"].includes(current.tagName)) stack.push(...[...current.childNodes].reverse());
  }
  return result;
}
function elements(nodes: readonly Node[]): Element[] {
  const found: Element[] = [];
  const stack = [...nodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (!("tagName" in node) || ["script", "style", "template"].includes(node.tagName)) continue;
    found.push(node);
    stack.push(...[...node.childNodes].reverse());
  }
  return found;
}

const CONTROL_TAGS = ["input", "textarea", "select"];
type Copy = ReturnType<typeof formValidationCopy>;

function wrappingLabel(control: Element): Element | undefined {
  for (let parent = control.parentNode; parent && "tagName" in parent; parent = parent.parentNode) {
    if (parent.tagName === "label") return parent;
  }
  return undefined;
}

/** aria-label wins, then label[for=id], then the closest wrapping label. */
function authoredLabel(control: Element | undefined, labels: readonly Element[]): string | undefined {
  if (!control) return undefined;
  const aria = attribute(control, "aria-label");
  if (aria) return aria;
  const id = attribute(control, "id");
  const linked = id ? labels.find((node) => attribute(node, "for") === id) : undefined;
  const label = linked ?? wrappingLabel(control);
  return label && text(label);
}

function englishPhrase(label: string): string {
  if (label.toLowerCase() === "email") return "your email";
  if (/^Your\s/.test(label)) return "your" + label.slice(4);
  return label;
}

/** A too-long answer names the control's own numeric `maxlength` (the cap the server enforced). */
function tooLongTemplate(copy: Copy, control: Element | undefined): string {
  const max = control && attribute(control, "maxlength");
  return max && /^\d+$/.test(max) ? copy[5].replace("{max}", max) : copy[2];
}

function messageTemplate(copy: Copy, reason: string, control: Element | undefined): string {
  if (reason === "too_long") return tooLongTemplate(copy, control);
  if (reason !== "required") return copy[3];
  const checkbox = control !== undefined && attribute(control, "type")?.toLowerCase() === "checkbox";
  return checkbox ? copy[1] : copy[0];
}

function fieldMessage(
  { field, reason, nodes, labels, copy }: { field: string; reason: string; nodes: readonly Element[]; labels: readonly Element[]; copy: Copy },
): { field: string; message: string } {
  const control = nodes.find((node) => CONTROL_TAGS.includes(node.tagName) && attribute(node, "name") === field);
  const trimmed = authoredLabel(control, labels)?.trim().replace(/\s*\*\s*$/, "") || copy[4];
  const label = copy === FORM_VALIDATION_COPY.en ? englishPhrase(trimmed) : trimmed;
  return { field, message: messageTemplate(copy, reason, control).replace("{label}", () => label) };
}

/** Labels come from the actual server-rendered form, never visitor-controlled result params.
 * parse5 handles entities and label/control associations without treating scripts as controls. */
export function formValidationMessages(
  { formHtml, errors, locale }: { formHtml: string; errors: ReadonlyArray<{ field: string; reason: string }>; locale: string },
  _optional = {},
): Array<{ field: string; message: string }> {
  const nodes = elements(parseFragment(formHtml).childNodes);
  const form = nodes.find((node) => node.tagName === "form");
  const copy = formValidationCopy({ locale: (form && attribute(form, "lang")) || locale });
  const labels = nodes.filter((node) => node.tagName === "label");
  return errors.map(({ field, reason }) => fieldMessage({ field, reason, nodes, labels, copy }));
}

export function formDocumentLocale({ html }: { html: string }, _optional = {}): string {
  return /<html\b[^>]*\slang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html)?.slice(1).find((value) => value !== undefined) || "en";
}
