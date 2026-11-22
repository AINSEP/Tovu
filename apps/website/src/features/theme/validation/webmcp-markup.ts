import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { ThemeValidationIssue } from "@jini-ai/cms/themes/manifest-v2";

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
/** What every per-element rule needs: the element, the file's id index (for form=), the literal
 * tool names already seen in this file, and the issue sink. */
type ElementCheck = {
  element: Element;
  ids: ReadonlyMap<string, Element>;
  names: Set<string>;
  issue: (required: { ruleId: string; message: string }, optional?: Record<string, never>) => void;
};

const NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const FORM_NAMES = new Set(['toolname', 'tooldescription', 'toolautosubmit']);
const PARAM_NAMES = new Set(['toolparamtitle', 'toolparamdescription']);
const ACTION_NAMES = new Set(['data-toolname', 'data-tooldescription']);
const NON_ELEMENTS = new Set(['script', 'style', 'template', 'noscript']);
const PARAM_CONTROLS = new Set(['input', 'select', 'textarea']);
const PRIVATE_PARAM_TYPES = new Set(['hidden', 'password', 'file']);
const SECRET_INPUT_TYPES = new Set(['password', 'file']);
const SUBMITTERS = new Set(['input', 'button']);
// The WebMCP namespace is tool{name,desc*,auto*,param*}, bare or data-prefixed (typos included). A bare
// "tool"/"data-tool" prefix also matched ordinary theme attributes (data-tooltip, data-toolbar)
// and refused those themes as "unsupported WebMCP annotation".
const WEBMCP_LIKE = /^(?:data-)?tool(?:name|desc|auto|param)/;
const isLocal = (
  { value }: { value: string },
  _optional = {}
) => value.length > 0 && !/^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i.test(value) && !/[\\\u0000- ]/.test(value);
const isTemplated = ({ value }: { value: string }, _optional = {}) => /{{|{%/.test(value);
/** Template expressions resolve at render time, so only literal targets must be site-relative. */
const isExposableTarget = ({ value }: { value: string }, _optional = {}) => isTemplated({ value }) || isLocal({ value });
const attr = (
  { element, name }: { element: Element; name: string },
  _optional = {}
) => element.attrs.find(attribute => attribute.name === name)?.value;
const inputType = (element: Element) => (attr({ element, name: 'type' }) ?? '').toLowerCase();
const hasAttrIn = ({ element, names }: { element: Element; names: ReadonlySet<string> }) => element.attrs.some(attribute => names.has(attribute.name));

function owningForm(element: Element, ids: ReadonlyMap<string, Element>): Element | undefined {
  const formId = attr({ element, name: 'form' });
  if (formId) return ids.get(formId);
  let parent = element.parentNode;
  while (parent && 'tagName' in parent) {
    if (parent.tagName === 'form') return parent;
    parent = parent.parentNode;
  }
  return undefined;
}

/** The owning form when it carries a toolname attribute at all (even an empty one), else undefined. */
function advertisedOwningForm({ element, ids }: Pick<ElementCheck, 'element' | 'ids'>): Element | undefined {
  const form = owningForm(element, ids);
  return form && attr({ element: form, name: 'toolname' }) !== undefined ? form : undefined;
}

/** Every real element in document order (inert subtrees skipped) plus an id index over them. The
 * index is complete before any rule runs because form= may name a form later in the file. */
function collectElements({ content }: { content: string }): { all: Element[]; ids: Map<string, Element> } {
  const ids = new Map<string, Element>();
  const all: Element[] = [];
  const stack: Node[] = [...parseFragment(content).childNodes].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (node === undefined) throw new Error('Theme WebMCP scan has no pending node');
    if (!('tagName' in node) || NON_ELEMENTS.has(node.tagName)) continue;
    all.push(node);
    const id = attr({ element: node, name: 'id' }); if (id) ids.set(id, node);
    stack.push(...[...node.childNodes].reverse());
  }
  return { all, ids };
}

const isActionHost = (element: Element) => element.tagName === 'a' || (element.tagName === 'button' && attr({ element, name: 'type' })?.toLowerCase() === 'button');
const isPagePublicationHost = (element: Element) => {
  const action = attr({ element, name: 'data-tool-action' });
  if (action === 'read') return ['main', 'section', 'article', 'aside', 'div', 'span', 'nav'].includes(element.tagName);
  if (action === 'accordion') return element.tagName === 'summary' || isActionHost(element);
  if (action === 'fill') return ['input', 'textarea'].includes(element.tagName) && !PRIVATE_PARAM_TYPES.has(inputType(element));
  if (action === 'select') return element.tagName === 'select';
  return action === 'submit' && element.tagName === 'button' && inputType(element) === 'submit';
};

function checkPlacement({ element, issue, hasForm, hasAction }: ElementCheck & { hasForm: boolean; hasAction: boolean }): void {
  if (hasForm && element.tagName !== 'form') issue({ ruleId: 'markup-webmcp-placement', message: 'toolname/tooldescription/toolautosubmit belong on form elements' });
  if (hasAction && !isActionHost(element) && !isPagePublicationHost(element)) {
    issue({ ruleId: 'markup-webmcp-placement', message: 'data-tool* actions require anchors or explicit button[type=button]; native forms own submission' });
  }
}

function checkToolIdentity({ names, issue, name, description }: ElementCheck & { name: string; description: string }): void {
  // Templates may carry a dynamic name/description; validate the concrete
  // grammar only for literal values, while still requiring both attributes.
  const dynamicName = isTemplated({ value: name });
  if (!dynamicName && !NAME.test(name)) issue({ ruleId: 'markup-webmcp-name', message: 'tool names require 1..128 ASCII letters, numbers, dot, underscore or hyphen' });
  if (!description.trim()) issue({ ruleId: 'markup-webmcp-description', message: 'each tool requires a nonempty description' });
  if (name && !dynamicName) {
    if (names.has(name)) issue({ ruleId: 'markup-webmcp-duplicate-name', message: `tool name '${name}' is repeated in this file` });
    names.add(name);
  }
}

function checkToolTarget({ element, issue, hasForm }: ElementCheck & { hasForm: boolean }): void {
  const target = attr({ element, name: hasForm ? 'action' : 'href' });
  // An anchor without href exposes nothing; a form without action or a button action has no target to check.
  const exposable = target === undefined ? element.tagName !== 'a' : isExposableTarget({ value: target });
  if (!exposable) {
    issue({ ruleId: 'markup-webmcp-target', message: 'annotated actions must use site-relative targets; absolute, protocol-relative and script URLs are not exposed' });
  }
  if (element.tagName === 'a' && attr({ element, name: 'download' }) !== undefined) issue({ ruleId: 'markup-webmcp-target', message: 'download anchors are not browser tools' });
}

/** A form (tool*) or action (data-tool*) annotation: its name, description and target. */
function checkAnnotatedTool(check: ElementCheck & { hasForm: boolean }): void {
  const { element, hasForm } = check;
  const name = attr({ element, name: hasForm ? 'toolname' : 'data-toolname' }) ?? '';
  const description = attr({ element, name: hasForm ? 'tooldescription' : 'data-tooldescription' }) ?? '';
  checkToolIdentity({ ...check, name, description });
  checkToolTarget(check);
}

function checkAutosubmit({ element, issue }: ElementCheck): void {
  if (attr({ element, name: 'toolautosubmit' }) !== undefined && (attr({ element, name: 'method' }) ?? 'get').toLowerCase() !== 'get') {
    issue({ ruleId: 'markup-webmcp-autosubmit', message: 'automatic submission is allowed only on read-only GET forms' });
  }
}

const isPublicNamedControl = (element: Element) =>
  PARAM_CONTROLS.has(element.tagName) && Boolean(attr({ element, name: 'name' })?.trim()) && !PRIVATE_PARAM_TYPES.has(inputType(element));
/** Unlike the secret/submitter checks, a parameter needs a real form with a nonempty toolname. */
const ownsParameters = (
  { form }: { form: Element | undefined },
  _optional = {}
) => form?.tagName === 'form' && Boolean(attr({ element: form, name: 'toolname' }));

function checkParameters({ element, ids, issue }: ElementCheck): void {
  if (!hasAttrIn({ element, names: PARAM_NAMES })) return;
  if (!isPublicNamedControl(element) || !ownsParameters({ form: owningForm(element, ids) })) {
    issue({ ruleId: 'markup-webmcp-parameter', message: 'tool parameters require named public controls associated with an annotated form' });
  }
  if (element.attrs.some(attribute => PARAM_NAMES.has(attribute.name) && !attribute.value.trim())) issue({ ruleId: 'markup-webmcp-parameter', message: 'parameter titles/descriptions must be nonempty' });
}

function checkSecretInput({ element, ids, issue }: ElementCheck): void {
  if (element.tagName === 'input' && SECRET_INPUT_TYPES.has(inputType(element)) && advertisedOwningForm({ element, ids })) {
    issue({ ruleId: 'markup-webmcp-secret', message: 'forms with password/file inputs must not be advertised as tools' });
  }
}

function checkSubmitterOverrides({ element, ids, issue }: ElementCheck): void {
  if (!SUBMITTERS.has(element.tagName)) return;
  const form = advertisedOwningForm({ element, ids });
  if (!form) return;
  const action = attr({ element, name: 'formaction' });
  if (action !== undefined && !isExposableTarget({ value: action })) issue({ ruleId: 'markup-webmcp-target', message: 'form submitter overrides must remain site-relative' });
  const method = attr({ element, name: 'formmethod' });
  if (attr({ element: form, name: 'toolautosubmit' }) !== undefined && method !== undefined && method.toLowerCase() !== 'get') issue({ ruleId: 'markup-webmcp-autosubmit', message: 'automatic form submitters cannot override GET with a write method' });
}

const isSupportedAnnotation = (
  { name }: { name: string },
  _optional = {}
) => FORM_NAMES.has(name) || PARAM_NAMES.has(name) || ACTION_NAMES.has(name);

function checkUnknownAttributes({ element, issue }: ElementCheck): void {
  for (const attribute of element.attrs) {
    if (WEBMCP_LIKE.test(attribute.name) && !isSupportedAnnotation({ name: attribute.name })) issue({ ruleId: 'markup-webmcp-attribute', message: `unsupported WebMCP annotation '${attribute.name}'` });
  }
}

/** All rules for one element, in the order their issues are reported. */
function checkElement(check: ElementCheck): void {
  const { element, issue } = check;
  // History (moved from markup.ts's removed, uncalled checkTovuAgentAttributePresence): that was a
  // minimal presence check for `data-tovu-agent` — deliberately NOT a full syntax/grammar validation.
  // `theme-authoring-guide-v2.md` §8 marks this attribute `[TARGET, NOT YET IMPLEMENTED]`: zero code
  // anywhere defines its value grammar yet, so enforcing one here would invent a contract nothing else
  // agrees to. It only caught the one unambiguous mistake possible before that contract exists: the
  // attribute present with an empty value. The public validator now rejects every retired handle here.
  if (attr({ element, name: 'data-tovu-agent' }) !== undefined) issue({ ruleId: 'markup-tovu-agent-retired', message: 'data-tovu-agent is retired; use tool* forms or data-tool* actions' });
  const hasForm = hasAttrIn({ element, names: FORM_NAMES });
  const hasAction = hasAttrIn({ element, names: ACTION_NAMES });
  checkPlacement({ ...check, hasForm, hasAction });
  if (hasForm || hasAction) checkAnnotatedTool({ ...check, hasForm });
  checkAutosubmit(check);
  checkParameters(check);
  checkSecretInput(check);
  checkSubmitterOverrides(check);
  checkUnknownAttributes(check);
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
  const { all, ids } = collectElements({ content });
  const issue = (
    { ruleId, message }: { ruleId: string; message: string },
    _optional = {}
  ) => { issues.push({ ruleId, path: relativePath, message: `'${relativePath}': ${message}` }); };
  for (const element of all) checkElement({ element, ids, names, issue });
  return issues;
}
