import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { ThemeValidationIssue } from './profiles.js';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
const NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const FORM_NAMES = new Set(['toolname', 'tooldescription', 'toolautosubmit']);
const PARAM_NAMES = new Set(['toolparamtitle', 'toolparamdescription']);
const ACTION_NAMES = new Set(['data-toolname', 'data-tooldescription']);
const NON_ELEMENTS = new Set(['script', 'style', 'template', 'noscript']);
const isLocal = (value: string) => value.length > 0 && !/^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i.test(value) && !/[\\\u0000-\u0020]/.test(value);
const attr = (element: Element, name: string) => element.attrs.find(attribute => attribute.name === name)?.value;

function owningForm(element: Element, ids: ReadonlyMap<string, Element>): Element | undefined {
  const formId = attr(element, 'form');
  if (formId) return ids.get(formId);
  let parent = element.parentNode;
  while (parent && 'tagName' in parent) {
    if (parent.tagName === 'form') return parent;
    parent = parent.parentNode;
  }
  return undefined;
}

/** Validate annotations that exist, without requiring every action to be exposed.
 * parse5 is already a runtime dependency; real HTML semantics avoid matching
 * examples in comments, script strings, escaped prose or inert templates. */
export function checkWebMcpMarkup(
  { relativePath, content }: { relativePath: string; content: string },
  _optional: Record<string, never> = {},
): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  const names = new Set<string>();
  const ids = new Map<string, Element>();
  const all: Element[] = [];
  const stack: Node[] = [...parseFragment(content).childNodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (!('tagName' in node) || NON_ELEMENTS.has(node.tagName)) continue;
    all.push(node);
    const id = attr(node, 'id'); if (id) ids.set(id, node);
    stack.push(...[...node.childNodes].reverse());
  }
  const issue = (ruleId: string, message: string) => issues.push({ ruleId, path: relativePath, message: `'${relativePath}': ${message}` });
  for (const element of all) {
    if (attr(element, 'data-tovu-agent') !== undefined) issue('markup-tovu-agent-retired', 'data-tovu-agent is retired; use tool* forms or data-tool* actions');
    const hasForm = element.attrs.some(attribute => FORM_NAMES.has(attribute.name));
    const hasAction = element.attrs.some(attribute => ACTION_NAMES.has(attribute.name));
    if (hasForm && element.tagName !== 'form') issue('markup-webmcp-placement', 'toolname/tooldescription/toolautosubmit belong on form elements');
    if (hasAction && !(element.tagName === 'a' || (element.tagName === 'button' && attr(element, 'type')?.toLowerCase() === 'button'))) {
      issue('markup-webmcp-placement', 'data-tool* actions require anchors or explicit button[type=button]; native forms own submission');
    }
    if (hasForm || hasAction) {
      const name = attr(element, hasForm ? 'toolname' : 'data-toolname') ?? '';
      const description = attr(element, hasForm ? 'tooldescription' : 'data-tooldescription') ?? '';
      // Templates may carry a dynamic name/description; validate the concrete
      // grammar only for literal values, while still requiring both attributes.
      const dynamicName = /{{|{%/.test(name);
      if (!dynamicName && !NAME.test(name)) issue('markup-webmcp-name', 'tool names require 1..128 ASCII letters, numbers, dot, underscore or hyphen');
      if (!description.trim()) issue('markup-webmcp-description', 'each tool requires a nonempty description');
      if (name && !dynamicName) {
        if (names.has(name)) issue('markup-webmcp-duplicate-name', `tool name '${name}' is repeated in this file`);
        names.add(name);
      }
      const target = attr(element, hasForm ? 'action' : 'href');
      if ((element.tagName === 'a' && target === undefined) || (target !== undefined && !/{{|{%/.test(target) && !isLocal(target))) {
        issue('markup-webmcp-target', 'annotated actions must use site-relative targets; absolute, protocol-relative and script URLs are not exposed');
      }
      if (element.tagName === 'a' && attr(element, 'download') !== undefined) issue('markup-webmcp-target', 'download anchors are not browser tools');
    }
    if (attr(element, 'toolautosubmit') !== undefined) {
      if ((attr(element, 'method') ?? 'get').toLowerCase() !== 'get') issue('markup-webmcp-autosubmit', 'automatic submission is allowed only on read-only GET forms');
    }
    if (element.attrs.some(attribute => PARAM_NAMES.has(attribute.name))) {
      const parent = owningForm(element, ids);
      if (!['input', 'select', 'textarea'].includes(element.tagName) || !attr(element, 'name')?.trim() || parent?.tagName !== 'form' || !attr(parent, 'toolname') || ['hidden', 'password', 'file'].includes((attr(element, 'type') ?? '').toLowerCase())) {
        issue('markup-webmcp-parameter', 'tool parameters require named public controls associated with an annotated form');
      }
      if (element.attrs.some(attribute => PARAM_NAMES.has(attribute.name) && !attribute.value.trim())) issue('markup-webmcp-parameter', 'parameter titles/descriptions must be nonempty');
    }
    if (element.tagName === 'input' && ['password', 'file'].includes((attr(element, 'type') ?? '').toLowerCase())) {
      const form = owningForm(element, ids);
      if (form && attr(form, 'toolname') !== undefined) issue('markup-webmcp-secret', 'forms with password/file inputs must not be advertised as tools');
    }
    if (['input', 'button'].includes(element.tagName)) {
      const form = owningForm(element, ids);
      if (form && attr(form, 'toolname') !== undefined) {
        const action = attr(element, 'formaction');
        if (action !== undefined && !/{{|{%/.test(action) && !isLocal(action)) issue('markup-webmcp-target', 'form submitter overrides must remain site-relative');
        const method = attr(element, 'formmethod');
        if (attr(form, 'toolautosubmit') !== undefined && method !== undefined && method.toLowerCase() !== 'get') issue('markup-webmcp-autosubmit', 'automatic form submitters cannot override GET with a write method');
      }
    }
    for (const attribute of element.attrs) {
      if ((attribute.name.startsWith('tool') && !FORM_NAMES.has(attribute.name) && !PARAM_NAMES.has(attribute.name)) || (attribute.name.startsWith('data-tool') && !ACTION_NAMES.has(attribute.name))) {
        issue('markup-webmcp-attribute', `unsupported WebMCP annotation '${attribute.name}'`);
      }
    }
  }
  return issues;
}
