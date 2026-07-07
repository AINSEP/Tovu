import type { JsonObject, JsonValue } from "../../../core/ports";
import type { PostRecord } from "../../../features/post";

/**
 * @file Server-side HTML rendering for the dummy public site.
 *
 * Purpose:
 * Renders seeded posts as themed HTML pages so a deployable binary serves a
 * visible site with zero frontend build for the public surface.
 *
 * How it relates to the project:
 * - Used by `server/routes/site/pages.ts`.
 * - Theme look switches with the presentation feature's activeThemeId.
 *
 * Architectural role:
 * Deliberately tiny stand-in for the real theme engine (ADR-010 declarative
 * themes land in Phase 3). Rendering stays server-side and dependency-free.
 */

const THEME_STYLES: Record<string, string> = {
  paper: `
    :root { --bg:#faf6ef; --ink:#2b2620; --accent:#a4551e; --card:#ffffff; }
    body { font-family: Georgia, 'Times New Roman', serif; }
  `,
  atlas: `
    :root { --bg:#0e1420; --ink:#e8ecf4; --accent:#4f8cff; --card:#1a2334; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; }
  `,
  glassmorphic: `
    :root { --bg:linear-gradient(135deg,#1c2740,#3a2a55); --ink:#f2f4fb; --accent:#7dd3fc; --card:rgba(255,255,255,0.09); }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; }
    main > * { backdrop-filter: blur(12px); }
  `,
};

const BASE_STYLE = `
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); min-height:100vh; }
  main { max-width:44rem; margin:0 auto; padding:3rem 1.5rem; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  article, .post-card { background:var(--card); border-radius:12px; padding:2rem; margin-bottom:1.5rem; box-shadow:0 2px 12px rgba(0,0,0,0.08); }
  h1,h2,h3 { line-height:1.2; }
  blockquote { border-left:3px solid var(--accent); margin:1rem 0; padding:0.25rem 1rem; opacity:0.9; }
  pre { background:rgba(0,0,0,0.25); color:#eaeaea; padding:1rem; border-radius:8px; overflow-x:auto; }
  footer { opacity:0.6; font-size:0.85rem; padding:2rem 0; text-align:center; }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarks(text: string, marks: JsonValue[] | undefined): string {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    const type = isObject(mark) ? mark.type : null;
    if (type === "bold") html = `<strong>${html}</strong>`;
    if (type === "italic") html = `<em>${html}</em>`;
    if (type === "code") html = `<code>${html}</code>`;
  }
  return html;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderNodes(nodes: JsonValue[] | undefined): string {
  return (nodes ?? []).map((node) => renderNode(node)).join("");
}

/** Renders a TipTap/ProseMirror-style doc node to HTML. Unknown nodes render children. */
export function renderNode(node: JsonValue): string {
  if (!isObject(node)) return "";
  const content = Array.isArray(node.content) ? node.content : undefined;

  switch (node.type) {
    case "doc":
      return renderNodes(content);
    case "paragraph":
      return `<p>${renderNodes(content)}</p>`;
    case "heading": {
      const level = isObject(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 2;
      const h = Math.min(Math.max(level, 1), 6);
      return `<h${h}>${renderNodes(content)}</h${h}>`;
    }
    case "text":
      return renderMarks(typeof node.text === "string" ? node.text : "", Array.isArray(node.marks) ? node.marks : undefined);
    case "bulletList":
      return `<ul>${renderNodes(content)}</ul>`;
    case "orderedList":
      return `<ol>${renderNodes(content)}</ol>`;
    case "listItem":
      return `<li>${renderNodes(content)}</li>`;
    case "blockquote":
      return `<blockquote>${renderNodes(content)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${renderNodes(content)}</code></pre>`;
    case "horizontalRule":
      return "<hr/>";
    default:
      return renderNodes(content);
  }
}

function pageShell(required: { title: string; themeId: string; body: string }): string {
  const themeStyle = THEME_STYLES[required.themeId] ?? THEME_STYLES.paper;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(required.title)}</title>
<style>${themeStyle}${BASE_STYLE}</style>
</head>
<body>
<main>${required.body}</main>
<footer>Powered by Tovu · theme: ${escapeHtml(required.themeId)} · <a href="/admin/">Admin</a></footer>
</body>
</html>`;
}

/** Home page: list of published posts. */
export function renderHomePage(required: { posts: PostRecord[]; themeId: string; siteTitle: string }): string {
  const cards = required.posts
    .map(
      (post) =>
        `<div class="post-card"><h2><a href="/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2><p>Updated ${escapeHtml(post.updatedAt.slice(0, 10))}</p></div>`
    )
    .join("");
  const body = `<h1>${escapeHtml(required.siteTitle)}</h1>${cards || "<p>No published posts yet.</p>"}`;
  return pageShell({ title: required.siteTitle, themeId: required.themeId, body });
}

/** Single post page. */
export function renderPostPage(required: { post: PostRecord; themeId: string; siteTitle: string }): string {
  const body = `<p><a href="/">← ${escapeHtml(required.siteTitle)}</a></p><article><h1>${escapeHtml(required.post.title)}</h1>${renderNode(required.post.bodyJson)}</article>`;
  return pageShell({ title: `${required.post.title} — ${required.siteTitle}`, themeId: required.themeId, body });
}
