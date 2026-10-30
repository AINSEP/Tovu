import { parse, type DefaultTreeAdapterMap } from "parse5";
import type { DroppedReference } from "@jini-ai/devops/static-export";
import { injectPublishedWebMcp } from "../webmcp/published-html.js";
import { escapeHtml } from "#src/platform/html/escape";

type Element = DefaultTreeAdapterMap["element"];
type Edit = { startOffset: number; endOffset: number; text: string };

/** Source locations keep theme scripts, formatting and root-relative paths byte-for-byte intact.
 * @complexity O(HTML bytes); iterative traversal includes template contents.
 */
function elements({ html }: { html: string }, _options = {}): Element[] {
  const pending: DefaultTreeAdapterMap["node"][] = [parse(html, { sourceCodeLocationInfo: true })];
  const found: Element[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    if ("childNodes" in node) pending.push(...node.childNodes);
    if ("tagName" in node) found.push(node);
    if ("content" in node) pending.push(node.content);
  }
  return found;
}

/** Apply disjoint edits from the end so offsets refer to the original source. */
function editedHtml({ html, edits }: { html: string; edits: Edit[] }, _options = {}): string {
  const parts: string[] = [];
  let end = html.length;
  for (const edit of edits.sort((a, b) => b.startOffset - a.startOffset)) {
    parts.push(html.slice(edit.endOffset, end), edit.text);
    end = edit.startOffset;
  }
  parts.push(html.slice(0, end));
  return parts.reverse().join("");
}

function attribute({ node, name }: { node: Element; name: string }, _options = {}): string | undefined {
  return node.attrs.find(attr => attr.name === name)?.value;
}

/** Identity and omitted discovery documents cannot truthfully advertise a public address. */
function omittedMetadata({ node }: { node: Element }, _options = {}): boolean {
  if (node.tagName === "meta") return omittedSocialMetadata({ node });
  if (node.tagName !== "link") return false;
  const rel = attribute({ node, name: "rel" })?.toLowerCase().split(/\s+/) ?? [];
  return rel.includes("canonical") || /\/(?:feed|sitemap)\.xml(?:[?#]|$)/i.test(attribute({ node, name: "href" }) ?? "");
}

/** Without an origin, social images must be root-relative or omitted. */
function omittedSocialMetadata({ node }: { node: Element }, _options = {}): boolean {
  const property = (attribute({ node, name: "property" }) ?? attribute({ node, name: "name" }))?.toLowerCase();
  if (property === "og:url") return true;
  if (property !== "og:image" && property !== "twitter:image") return false;
  return !/^\/(?!\/)/.test(attribute({ node, name: "content" }) ?? "");
}

/** JSON-LD identity is optional; keep the remaining structured data valid without a domain. */
function jsonWithoutIdentity({ value }: { value: unknown }, _options = {}): unknown {
  if (Array.isArray(value)) return value.map(item => jsonWithoutIdentity({ value: item }));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "url" && key !== "@id")
    .map(([key, item]) => [key, jsonWithoutIdentity({ value: item })]));
}

/** Malformed structured data cannot be repaired safely; omit that block in the no-domain copy. */
function jsonLdEdit({ node, html }: { node: Element; html: string }, _options = {}): Edit | undefined {
  if (node.tagName !== "script" || attribute({ node, name: "type" })?.toLowerCase() !== "application/ld+json") return undefined;
  const location = node.sourceCodeLocation;
  if (!location?.startTag || !location.endTag) return undefined;
  try {
    const value: unknown = JSON.parse(html.slice(location.startTag.endOffset, location.endTag.startOffset));
    const text = JSON.stringify(jsonWithoutIdentity({ value })).replaceAll("<", "\\u003c");
    return { startOffset: location.startTag.endOffset, endOffset: location.endTag.startOffset, text };
  } catch { return { ...location, text: "" }; }
}

/** Reuse WebMCP's exact opt-out owner; leave all theme-owned data attributes alone.
 * Without public identity remove canonical/OG identity and JSON-LD url/@id, without serializing HTML.
 * @complexity O(HTML bytes + edits log edits), no I/O.
 */
export function exportHtml({ html, publicOrigin }: { html: string; publicOrigin?: string }, _options = {}): string {
  html = injectPublishedWebMcp({ html, enabled: false });
  if (publicOrigin) return html;
  const edits: Edit[] = [];
  for (const node of elements({ html })) {
    if (omittedMetadata({ node }) && node.sourceCodeLocation) edits.push({ ...node.sourceCodeLocation, text: "" });
    else {
      const edit = jsonLdEdit({ node, html });
      if (edit) edits.push(edit);
    }
  }
  return editedHtml({ html, edits });
}

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
  const href = attribute({ node: link, name: "href" })!;
  const address = href.slice(7).split("?")[0]!;
  return ` Email us at <a href="${escapeHtml(href)}">${escapeHtml(address)}</a> instead.`;
}

/** Disable one backend-dependent form and disclose the missing server immediately after it. */
function formEdits({ node, alternative }: { node: Element; alternative: string }, _options = {}): Edit[] {
  const edits: Edit[] = [];
  const attrs = node.sourceCodeLocation?.attrs ?? {};
  for (const name of ["action", "method"]) {
    if (name === "method" && attribute({ node, name })?.toLowerCase() !== "post") continue;
    const location = attrs[name];
    if (location) edits.push({ ...location, text: "" });
  }
  const end = node.sourceCodeLocation!.endOffset;
  edits.push({ startOffset: end, endOffset: end, text: `<p>This form needs a server to send messages.${alternative}</p>` });
  return edits;
}

/** Download-only form policy. Publish retains receiver-enabled actions. Report only removed actions.
 * Theme data attributes remain: themes and the form scripts may use them for styling/validation.
 * @complexity O(HTML bytes + edits log edits); returned removals are the machine-report evidence.
 */
export function downloadForms({ html, page, publicOrigin }: { html: string; page: string; publicOrigin?: string }, _options = {}): { html: string; removed: DroppedReference[] } {
  const nodes = elements({ html });
  const alternative = emailAlternative({ nodes });
  const edits: Edit[] = [], removed: DroppedReference[] = [];
  for (const node of nodes) {
    if (node.tagName !== "form" || !node.sourceCodeLocation) continue;
    const action = attribute({ node, name: "action" });
    if (action === undefined) continue;
    const target = serverAction({ action, publicOrigin, page });
    if (!target) continue;
    edits.push(...formEdits({ node, alternative }));
    removed.push({ page, url: target.pathname, attribute: "action", reason: "needs-server" });
  }
  return { html: editedHtml({ html, edits }), removed };
}
