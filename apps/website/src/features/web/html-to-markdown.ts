import { parse, type DefaultTreeAdapterMap } from "parse5";
import { absolute, ASSET_PROTOCOLS, attr, imageSource, LINK_PROTOCOLS } from "./html-document.js";

/**
 * @file A small HTML -> Markdown converter over parse5 (already a dependency), for reading pages,
 * not for round-tripping them: headings, paragraphs, emphasis, code, links, images, nested lists,
 * blockquotes and simple tables. Text is not Markdown-escaped. Injected through
 * `WebFetchPorts.htmlToMarkdown`, so a library converter can replace it without touching callers.
 */

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const SKIPPED = new Set(["head", "script", "style", "noscript", "template", "svg", "iframe", "object", "canvas", "select", "input", "textarea"]);
const BLOCKS = new Set(["p", "div", "section", "article", "main", "header", "footer", "nav", "aside", "figure", "figcaption", "address", "form", "fieldset", "details", "summary", "dl", "dt", "dd", "body", "html"]);
/** Beyond this nesting, a subtree degrades to its plain text instead of recursing further. */
const MAX_DEPTH = 300;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

/** Iterative so a degraded, very deep subtree cannot overflow the stack either. */
function plainText(root: Node): string {
  const pending: Node[] = [root];
  const parts: string[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.nodeName === "#text" && "value" in node) parts.push(node.value);
    else if ("childNodes" in node && !(isElement(node) && SKIPPED.has(node.tagName))) for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i]!);
  }
  return parts.join("");
}

interface Context { base: string; depth: number }

function children(node: Node, ctx: Context): string {
  if (!("childNodes" in node)) return "";
  return node.childNodes.map(child => convert(child, ctx)).join("");
}

/** Emphasis markers hug the text; the inner text's outer whitespace moves outside them. */
function wrap(marker: string, inner: string): string {
  const trimmed = inner.trim();
  if (!trimmed) return inner ? " " : "";
  return `${/^\s/.test(inner) ? " " : ""}${marker}${trimmed}${marker}${/\s$/.test(inner) ? " " : ""}`;
}

/** A nested list is indented by its parent item, which indents every continuation line. */
function list(element: Element, ctx: Context): string {
  const ordered = element.tagName === "ol";
  const items = element.childNodes.filter(child => isElement(child) && child.tagName === "li") as Element[];
  const lines = items.map((item, index) => {
    const marker = ordered ? `${index + 1}.` : "-";
    const body = children(item, { ...ctx, depth: ctx.depth + 1 }).replace(/\n{2,}/g, "\n").trim();
    return `${marker} ${body.split("\n").join(`\n${" ".repeat(marker.length + 1)}`)}`;
  });
  return `\n\n${lines.join("\n")}\n\n`;
}

function table(element: Element): string {
  const rows: string[][] = [];
  const pending: Node[] = [element];
  while (pending.length) {
    const node = pending.pop()!;
    if (!isElement(node)) continue;
    if (node.tagName === "tr") {
      rows.push(node.childNodes.filter(c => isElement(c) && (c.tagName === "td" || c.tagName === "th")).map(cell => plainText(cell).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|")));
      continue;
    }
    for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i]!);
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map(r => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return `\n\n${[line(rows[0]!), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n")}\n\n`;
}

function element(node: Element, ctx: Context): string {
  const inner = () => children(node, { ...ctx, depth: ctx.depth + 1 });
  const tag = node.tagName;
  if (/^h[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${inner().replace(/\s+/g, " ").trim()}\n\n`;
  switch (tag) {
    case "br": return "\n";
    case "hr": return "\n\n---\n\n";
    case "strong": case "b": return wrap("**", inner());
    case "em": case "i": return wrap("_", inner());
    case "code": return wrap("`", plainText(node));
    case "pre": return `\n\n\`\`\`\n${plainText(node).replace(/\n$/, "")}\n\`\`\`\n\n`;
    case "ul": case "ol": return list(node, ctx);
    case "table": return table(node);
    case "blockquote": return `\n\n${inner().trim().replace(/\n{3,}/g, "\n\n").split("\n").map(line => `> ${line}`).join("\n")}\n\n`;
    case "img": {
      const src = absolute(imageSource(node), ctx.base, ASSET_PROTOCOLS);
      return src ? `![${(attr(node, "alt") ?? "").replace(/\s+/g, " ").trim()}](${src})` : "";
    }
    case "a": {
      const text = inner().replace(/\s+/g, " ").trim();
      const href = absolute(attr(node, "href"), ctx.base, LINK_PROTOCOLS);
      return href && text ? `[${text}](${href})` : text;
    }
    case "li": return `\n${inner()}\n`;
    default: return BLOCKS.has(tag) ? `\n\n${inner()}\n\n` : inner();
  }
}

function convert(node: Node, ctx: Context): string {
  if (node.nodeName === "#text" && "value" in node) return node.value.replace(/\s+/g, " ");
  if (!isElement(node)) return children(node, ctx);
  if (SKIPPED.has(node.tagName)) return "";
  if (ctx.depth > MAX_DEPTH) return plainText(node).replace(/\s+/g, " ");
  return element(node, ctx);
}

/**
 * Converts page HTML to readable Markdown with absolute link/image URLs.
 * @param required.html - Untrusted page source.
 * @param required.pageUrl - Base for relative URLs (after redirects).
 * @returns Markdown with blank lines between blocks and no trailing whitespace.
 * @complexity O(nodes), recursion bounded by {@link MAX_DEPTH}.
 */
export function htmlToMarkdown({ html, pageUrl }: { html: string; pageUrl: string }): string {
  const document = parse(html);
  const head = document.childNodes.find(isElement)?.childNodes.find(c => isElement(c) && c.tagName === "head") as Element | undefined;
  const baseTag = head?.childNodes.find(c => isElement(c) && c.tagName === "base") as Element | undefined;
  const base = absolute(baseTag && attr(baseTag, "href"), pageUrl, ASSET_PROTOCOLS) ?? pageUrl;
  return tidy(convert(document, { base, depth: 0 }));
}

/** Collapses blank-line runs and stray inline spaces; code fences and list indents stay verbatim. */
function tidy(markdown: string): string {
  let fenced = false;
  const lines = markdown.split("\n").map(line => {
    if (line.trim() === "```") { fenced = !fenced; return "```"; }
    if (fenced) return line;
    return /^ *(?:-|\d+\.) /.test(line) ? line.trimEnd() : line.trim();
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
