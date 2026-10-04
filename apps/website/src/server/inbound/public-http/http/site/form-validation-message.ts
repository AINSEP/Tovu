import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { formValidationCopy } from "./form-validation-i18n.js";

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
  return errors.map(({ field, reason }) => {
    const control = nodes.find((node) => ["input", "textarea", "select"].includes(node.tagName) && attribute(node, "name") === field);
    const id = control && attribute(control, "id");
    let label = control && attribute(control, "aria-label");
    if (!label) {
      const linked = id ? labels.find((node) => attribute(node, "for") === id) : undefined;
      if (linked) label = text(linked);
      else for (let parent = control?.parentNode; parent && "tagName" in parent; parent = parent.parentNode) {
        if (parent.tagName === "label") { label = text(parent); break; }
      }
    }
    label = label?.trim().replace(/\s*\*\s*$/, "") || copy[4];
    if (copy === formValidationCopy({ locale: "en" })) {
      if (label.toLowerCase() === "email") label = "your email";
      else if (/^Your\s/.test(label)) label = "your" + label.slice(4);
    }
    const template = reason === "required" ? (control && attribute(control, "type")?.toLowerCase() === "checkbox" ? copy[1] : copy[0])
      : reason === "too_long" ? copy[2] : copy[3];
    return { field, message: template.replace("{label}", () => label!) };
  });
}

export function formDocumentLocale({ html }: { html: string }, _optional = {}): string {
  return /<html\b[^>]*\slang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html)?.slice(1).find((value) => value !== undefined) || "en";
}
