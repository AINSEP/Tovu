/** SPEC-046 v3: server-issued theme publication; browser claims never add eligibility. */
import { createHash, randomUUID } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { agentHandle, agentHandleSegment } from '@jini-ai/agentic/core/handle';
import type { PagePublication, PublishedPageAction, PublishedPageElement } from '@jini-ai/agentic/core';
import { checkSiteRelativeTarget } from '#src/platform/routing/index';
import { escapeHtml } from '#src/platform/html/escape';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['childNode'];
interface Publication extends PagePublication { readonly path?: string; readonly workspaceId?: string }
const snapshots = new Map<string, { publication: Publication; expires: number }>();
const ACTIONS = new Set<PublishedPageAction>(['read', 'menu', 'tab', 'accordion', 'carousel', 'media', 'fill', 'select', 'submit', 'navigate']);
const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value;
const excluded = (node: Element) => ['script', 'style', 'template', 'noscript'].includes(node.tagName) ||
  node.attrs.some(a => ['data-agent-private', 'data-agent-personalized', 'data-member-nav'].includes(a.name));

/** Only explicitly marked theme scopes are eligible; no document-wide DOM discovery. */
function* annotated({ html }: { html: string }, _options = {}): Generator<Element> {
  const stack: { node: Node; scoped: boolean }[] = parse(html, { sourceCodeLocationInfo: true }).childNodes.map(node => ({ node, scoped: false }));
  while (stack.length) {
    const { node, scoped } = stack.pop()!;
    if (!('tagName' in node) || excluded(node)) continue;
    const inside = scoped || attr(node, 'data-visitor-scope') !== undefined;
    if (inside && attr(node, 'data-toolname')) yield node;
    stack.push(...node.childNodes.map(child => ({ node: child, scoped: inside })));
  }
}

function declaration({ node, pagePath }: { node: Element; pagePath?: string }, _options = {}): PublishedPageElement | null {
  const name = attr(node, 'data-toolname');
  const label = attr(node, 'data-tooldescription');
  const action = attr(node, 'data-tool-action') as PublishedPageAction;
  if (!name || !label || !ACTIONS.has(action)) return null;
  if (!actionHost({ node, action })) return null;
  const target = targetMetadata({ node, action, pagePath });
  if (target === null) return null;
  const handle = `visitor-${agentHandleSegment({ value: name })}`;
  agentHandle({ handle });
  return { handle, label: label.slice(0, 240), action, ...target, ...(attr(node, 'href') ? { href: attr(node, 'href') } : {}) };
}

/** Existing HTML response transform calls this after theme rendering. Source offsets preserve
 * scripts/formatting. Manifest snapshots are bounded, process-local and expire with bindings.
 * O(n + p log p) server parse/projection over HTML bytes and <=256 reviewed annotations. */
export function publishVisitorPage({ html, path, workspaceId }: { html: string; path?: string; workspaceId?: string }, _options = {}): string {
  if (!html.includes('tovu-site-assistant-root') || html.includes('id="tovu-visitor-publication"')) return html;
  const declared = Array.from(annotated({ html })).map(node => ({ node, entry: declaration({ node, pagePath: path }) })).filter(item => item.entry !== null);
  const counts = new Map<string, number>();
  for (const { entry } of declared) counts.set(entry!.handle, (counts.get(entry!.handle) ?? 0) + 1);
  const unique = declared.filter(({ entry }) => counts.get(entry!.handle) === 1).slice(0, 256);
  const derived = unique.filter(({ node }) => inMainMenu(node)).flatMap(({ entry }) => [
    { ...entry!, handle: `${entry!.handle}-mobile` },
    { handle: `${entry!.handle}-submenu`, label: `${entry!.label} submenu`, action: 'menu' as const },
  ]);
  const elements = withoutHandleCollisions([...unique.map(({ entry }) => entry!), ...derived]).sort((a, b) => a.handle.localeCompare(b.handle));
  // Each document keeps its own binding. A concurrent member/anonymous render of the same
  // path must not revoke a still-live document; revision plus TTL bounds its lifetime.
  const revision = createHash('sha256').update(JSON.stringify({ documentId: randomUUID(), elements, path, workspaceId })).digest('hex');
  const publication = { revision, elements, ...(path ? { path } : {}), ...(workspaceId ? { workspaceId } : {}) };
  rememberPublication({ publication });
  const edits = unique.map(({ node, entry }) => ({ at: node.sourceCodeLocation!.startTag!.endOffset - 1,
    text: projectedAttributes({ node, entry: entry! }) }));
  for (const edit of edits.sort((a, b) => b.at - a.at)) html = html.slice(0, edit.at) + edit.text + html.slice(edit.at);
  const data = JSON.stringify(publication).replace(/</g, '\\u003c');
  html = html.replace(/<body\b/i, `<body data-visitor-page-root data-agent-publication="${revision}"`);
  const script = `<script type="application/json" id="tovu-visitor-publication">${data}</script>`;
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  return bodyEnd < 0 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
}

/** Derived mobile identities obey the same collision rule as authored declarations. */
function withoutHandleCollisions(elements: PublishedPageElement[]): PublishedPageElement[] {
  const counts = new Map<string, number>();
  for (const entry of elements) counts.set(entry.handle, (counts.get(entry.handle) ?? 0) + 1);
  return elements.filter(entry => counts.get(entry.handle) === 1);
}

/** Missing/expired snapshots fail closed, including after a server restart. */
export function readVisitorPagePublication({ revision, workspaceId }: { revision: string; workspaceId?: string }, _options = {}): Publication | null {
  const snapshot = snapshots.get(revision);
  if (!snapshot || snapshot.publication.workspaceId !== workspaceId) return null;
  if (snapshot.expires <= Date.now()) { snapshots.delete(revision); return null; }
  return snapshot.publication;
}

/** Only the authored menu source may project independently addressed mobile variants. */
function inMainMenu(node: Element): boolean {
  let current: DefaultTreeAdapterMap['parentNode'] | null = node.parentNode;
  while (current && 'tagName' in current) {
    if ((attr(current, 'class') ?? '').split(/\s+/).includes('main-nav')) return true;
    current = current.parentNode;
  }
  return false;
}

function actionHost({ node, action }: { node: Element; action: PublishedPageAction }): boolean {
  if (['menu', 'tab', 'carousel', 'media'].includes(action)) return node.tagName === 'button' && attr(node, 'type') === 'button';
  if (action === 'accordion') return ['summary', 'button'].includes(node.tagName);
  return action !== 'navigate' || node.tagName === 'a';
}
function rememberPublication({ publication }: { publication: Publication }): void {
  for (const [revision, snapshot] of snapshots) {
    if (snapshot.expires <= Date.now()) snapshots.delete(revision);
  }
  snapshots.delete(publication.revision);
  snapshots.set(publication.revision, { publication, expires: Date.now() + 30 * 60_000 });
  while (snapshots.size > 512) {
    const oldest = snapshots.keys().next().value!;
    snapshots.delete(oldest);
  }
}

function projectedAttributes({ node, entry }: { node: Element; entry: PublishedPageElement }): string {
  const mobile = inMainMenu(node) ? ` data-visitor-mobile-handle="${entry.handle}-mobile" data-visitor-submenu-handle="${entry.handle}-submenu"` : '';
  const roles: Readonly<Record<string, string>> = { read: 'region', navigate: 'link', fill: 'field', select: 'field' };
  const role = roles[entry.action] ?? 'button';
  return `${mobile} data-agent-element="${entry.handle}" data-agent-label="${escapeHtml(entry.label!)}" data-agent-role="${role}"`;
}

/** Bind the published submitter to its reviewed same-site form action and method. */
function submissionTarget({ node, pagePath }: { node: Element; pagePath?: string }): PublishedPageElement['target'] | undefined {
  const form = owningForm(node);
  if (!form || attr(node, 'form') !== undefined) return undefined;
  const target = effectiveSubmitTarget({ node, form, pagePath });
  if (!safeFormAction(target.action) || !['get', 'post'].includes(target.method)) return undefined;
  return target;
}
function owningForm(node: Element): Element | undefined {
  let form = node.parentNode;
  while (form && 'tagName' in form) {
    if (form.tagName === 'form') return form;
    form = form.parentNode;
  }
  return undefined;
}
function effectiveSubmitTarget({ node, form, pagePath }: { node: Element; form: Element; pagePath?: string }) {
  return { action: attr(node, 'formaction') ?? attr(form, 'action') ?? pagePath ?? '',
    method: (attr(node, 'formmethod') ?? attr(form, 'method') ?? 'get').toLowerCase() };
}
function targetMetadata({ node, action, pagePath }: { node: Element; action: PublishedPageAction; pagePath?: string }): Pick<PublishedPageElement, 'target'> | null {
  if (action !== 'submit') return {};
  const target = submissionTarget({ node, pagePath });
  return target ? { target } : null;
}
function safeFormAction(action: string): boolean {
  return checkSiteRelativeTarget(action).kind === 'ok' && !/[?#]/.test(action);
}

