/** @file Download-only HTML transforms for the backup/share static copy: backend forms are disabled and document bases rebased. */
import type { DroppedReference } from "@jini-ai/devops/static-export";
import { escapeHtml } from "#src/platform/html/escape";
import { attribute, editedHtml, elements, type Edit, type Element } from "#src/platform/html/source-edits";

/** Local form actions address a backend, including empty actions that post to the page itself. */
function serverAction({ action, publicOrigin, page }: { action: string; publicOrigin?: string; page: string }, _options = {}): URL | undefined {
  const base = publicOrigin ?? "https://static-copy.invalid";
  try {
    const url = new URL(action, base + page);
    return url.origin === base ? url : undefined;
  } catch { return undefined; }
}

/** Mailto comes from an actual page link, never assistant metadata or injected form configuration. */
function emailAlternative({ nodes }: { nodes: Element[] }, _options = {}): string {
  const link = nodes.find(node => node.tagName === "a" && /^mailto:/i.test(attribute({ node, name: "href" }) ?? ""));
  if (!link) return "";
  const href = attribute({ node: link, name: "href" });
  if (href === undefined) throw new Error("Static export email link has no address");
  const address = href.slice(7).split("?")[0]!; // split always returns a first piece
  return ` Email us at <a href="${escapeHtml({ text: href })}">${escapeHtml({ text: address })}</a> instead.`;
}

/** Disable one backend-dependent form and disclose the missing server immediately after it. */
function formEdits({ node, alternative }: { node: Element; alternative: string }, _options = {}): Edit[] {
  const location = node.sourceCodeLocation;
  if (!location) throw new Error("Static export form has no source location");
  const attrs = node.sourceCodeLocation?.attrs ?? {};
  const edits: Edit[] = [];
  if (attrs.action) edits.push({ ...attrs.action, text: "" });
  // Removing action/method alone defaults to GET and leaks answers into the URL. The native
  // dialog method performs no network submission while preserving theme form selectors.
  if (attrs.method) edits.push({ ...attrs.method, text: 'method="dialog"' });
  else {
    if (!location.startTag) throw new Error("Static export form has no start tag location");
    const start = location.startTag.endOffset - 1;
    edits.push({ startOffset: start, endOffset: start, text: ' method="dialog"' });
  }
  const end = location.endOffset;
  edits.push({ startOffset: end, endOffset: end, text: `<p>This form needs a server to send messages.${alternative}</p>` });
  return edits;
}

/** Explicit form owners take precedence over ancestors for outside submit controls. */
function submitOwner({ node, ids, disabled }: { node: Element; ids: Set<string>; disabled: Set<Element> }, _options = {}): boolean {
  const form = attribute({ node, name: 'form' });
  if (form !== undefined) return ids.has(form);
  let parent = node.parentNode;
  while (parent) {
    if ('tagName' in parent && parent.tagName === 'form') return disabled.has(parent);
    parent = 'parentNode' in parent ? parent.parentNode : null;
  }
  return false;
}

/** Dialogs and action-less script/search forms have no known backend destination to disable. */
function backendFormTarget({ node, publicOrigin, page }: { node: Element; publicOrigin: string | undefined; page: string }, _options = {}): URL | undefined {
  if (node.tagName !== 'form' || !node.sourceCodeLocation) return undefined;
  const method = attribute({ node, name: 'method' })?.toLowerCase();
  if (method === 'dialog') return undefined;
  const action = attribute({ node, name: 'action' });
  if (action === undefined && method !== 'post' && attribute({ node, name: 'data-form-slug' }) === undefined) return undefined;
  return serverAction({ action: action ?? '', publicOrigin, page });
}

/** Download-only form policy. Publish retains receiver-enabled actions. Report only removed actions.
 * Theme data attributes remain: themes and the form scripts may use them for styling/validation.
 * Retained sign-in links are reported separately for the download's server-dependency notes.
 * @complexity O(HTML bytes + edits log edits); returned removals are the machine-report evidence.
 */
export function downloadForms({ html, page, publicOrigin }: { html: string; page: string; publicOrigin?: string }, _options = {}): { html: string; removed: DroppedReference[]; serverLinks: DroppedReference[] } {
  const nodes = elements({ html });
  const alternative = emailAlternative({ nodes });
  const disabled = new Set<Element>();
  const edits: Edit[] = [], removed: DroppedReference[] = [], serverLinks: DroppedReference[] = [];
  for (const node of nodes) {
    const signin = signInReference({ node, page, publicOrigin });
    if (signin) serverLinks.push(signin);
    const target = backendFormTarget({ node, publicOrigin, page });
    if (!target) continue;
    disabled.add(node);
    edits.push(...formEdits({ node, alternative }));
    removed.push({ page, url: target.pathname, attribute: "action", reason: "needs-server" });
  }
  const ids = new Set([...disabled].map(node => attribute({ node, name: 'id' })).filter((id): id is string => id !== undefined));
  for (const node of nodes) {
    const override = node.sourceCodeLocation?.attrs?.formmethod;
    if (override && submitOwner({ node, ids, disabled })) edits.push({ ...override, text: 'formmethod="dialog"' });
  }
  return { html: editedHtml({ html, edits }), removed, serverLinks };
}

/** Account entry points need a backend even when their link remains visible in the download. */
function signInReference({ node, page, publicOrigin }: { node: Element; page: string; publicOrigin?: string }, _options = {}): DroppedReference | undefined {
  if (node.tagName !== "a") return undefined;
  const href = attribute({ node, name: "href" });
  if (href === undefined) return undefined;
  const target = serverAction({ action: href, publicOrigin, page });
  if (target?.pathname !== "/signin") return undefined;
  return { page, url: "/signin", attribute: "href", reason: "needs-server" };
}

/** Rebase refresh targets and drop base elements so download links resolve from their own file.
 * @param required HTML and the download owner's URL mapping.
 * @returns HTML with parser-located edits; theme scripts and surrounding formatting stay intact.
 * @complexity O(HTML bytes + edits log edits), no I/O.
 * @example downloadDocumentBase({ html, rewrite: url => url });
 */
export function downloadDocumentBase({ html, rewrite }: { html: string; rewrite: (url: string) => string }, _options = {}): string {
  const edits: Edit[] = [];
  for (const node of elements({ html })) {
    if (node.tagName === "base" && node.sourceCodeLocation) edits.push({ ...node.sourceCodeLocation, text: "" });
    const edit = refreshEdit({ node, rewrite });
    if (edit) edits.push(edit);
  }
  return editedHtml({ html, edits });
}

/** Refresh content is a delay plus one URL; HTML structure and quoting remain parser-owned. */
function refreshEdit({ node, rewrite }: { node: Element; rewrite: (url: string) => string }, _options = {}): Edit | undefined {
  if (node.tagName !== "meta" || attribute({ node, name: "http-equiv" })?.toLowerCase() !== "refresh") return undefined;
  const location = node.sourceCodeLocation?.attrs?.content;
  const content = refreshContent({ content: attribute({ node, name: "content" }) ?? "", rewrite });
  if (!location || content === undefined) return undefined;
  return { ...location, text: `content="${escapeHtml({ text: content })}"` };
}

/** Split the refresh value at its delimiters without overlapping whitespace runs or HTML matching. */
function refreshContent({ content, rewrite }: { content: string; rewrite: (url: string) => string }, _options = {}): string | undefined {
  const match = /^([^;]*;[^=]*=)([\s\S]*)$/.exec(content);
  if (!match) return undefined;
  if (!/;\s*url\s*=$/i.test(match[1]!)) return undefined;
  const url = match[2]!.trim().replace(/^["']|["']$/g, "");
  return match[1] + rewrite(url);
}
