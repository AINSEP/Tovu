import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { FORM_VALIDATION_COPY, formValidationCopy } from "./form-validation-i18n.js";

type Node = DefaultTreeAdapterMap["childNode"];
type Element = DefaultTreeAdapterMap["element"];
function attribute({ node, name }: { node: Element; name: string }, _optional = {}) { return node.attrs.find((attr) => attr.name === name)?.value; }
function text(node: Node): string {
  let result = "";
  const stack: Node[] = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current) throw new Error("form validation text traversal has an empty stack");
    if (current.nodeName === "#text" && "value" in current) result += current.value;
    else {
      appendLabelTextChildren(current, stack);
    }
  }
  return result;
}
function appendLabelTextChildren(current: Node, stack: Node[]): void {
  if ("tagName" in current && !["input", "textarea", "select", "script", "style", "template"].includes(current.tagName)) stack.push(...[...current.childNodes].reverse());
}

function elements(nodes: readonly Node[]): Element[] {
  const found: Element[] = [];
  const stack = [...nodes].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (!node) throw new Error("form validation element traversal has an empty stack");
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
function authoredLabel({ control, labels }: { control: Element | undefined; labels: readonly Element[] }, _optional = {}): string | undefined {
  if (!control) return undefined;
  const aria = attribute({ node: control, name: "aria-label" });
  if (aria) return aria;
  const id = attribute({ node: control, name: "id" });
  const linked = id ? labels.find((node) => attribute({ node, name: "for" }) === id) : undefined;
  const label = linked ?? wrappingLabel(control);
  return label && text(label);
}

function englishPhrase({ label }: { label: string }, _optional = {}): string {
  if (label.toLowerCase() === "email") return "your email";
  if (/^Your\s/.test(label)) return "your" + label.slice(4);
  return label;
}

/** A too-long answer names the control's own numeric `maxlength` (the cap the server enforced). */
function tooLongTemplate({ copy, control }: { copy: Copy; control: Element | undefined }, _optional = {}): string {
  const max = control && attribute({ node: control, name: "maxlength" });
  return max && /^\d+$/.test(max) ? copy[5].replace("{max}", () => max) : copy[2];
}

function messageTemplate({ copy, reason, control }: { copy: Copy; reason: string; control: Element | undefined }, _optional = {}): string {
  if (reason === "too_long") return tooLongTemplate({ copy, control });
  if (reason !== "required") return copy[3];
  const checkbox = control !== undefined && attribute({ node: control, name: "type" })?.toLowerCase() === "checkbox";
  return checkbox ? copy[1] : copy[0];
}

function fieldMessage(
  { field, reason, nodes, labels, copy }: { field: string; reason: string; nodes: readonly Element[]; labels: readonly Element[]; copy: Copy },
): { field: string; message: string } {
  const control = nodes.find((node) => CONTROL_TAGS.includes(node.tagName) && attribute({ node, name: "name" }) === field);
  const authored = authoredLabel({ control, labels })?.trim();
  const trimmed = (authored?.endsWith("*") ? authored.slice(0, -1).trimEnd() : authored) || copy[4];
  const label = copy === FORM_VALIDATION_COPY.en ? englishPhrase({ label: trimmed }) : trimmed;
  return { field, message: messageTemplate({ copy, reason, control }).replace("{label}", () => label) };
}

/** Labels come from the actual server-rendered form, never visitor-controlled result params.
 * parse5 handles entities and label/control associations without treating scripts as controls. */
export function formValidationMessages(
  { formHtml, errors, locale }: { formHtml: string; errors: ReadonlyArray<{ field: string; reason: string }>; locale: string },
  _optional = {},
): Array<{ field: string; message: string }> {
  const nodes = elements(parseFragment(formHtml).childNodes);
  const form = nodes.find((node) => node.tagName === "form");
  const copy = formValidationCopy({ locale: (form && attribute({ node: form, name: "lang" })) || locale });
  const labels = nodes.filter((node) => node.tagName === "label");
  return errors.map(({ field, reason }) => fieldMessage({ field, reason, nodes, labels, copy }));
}

export function formDocumentLocale({ html }: { html: string }, _optional = {}): string {
  return /<html\b[^>]*\slang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html)?.slice(1).find((value) => value !== undefined) || "en";
}
