import type { JsonObject } from "@jini-ai/core/primitives";
import type { PostRecord } from "#src/features/post/index";
import type { PresentationSettingsRecord } from "#src/features/presentation/index";
import { DEFAULT_THEME_ID } from "#src/features/theme/index";
import type { WorkspaceRecord } from "#src/features/workspace/index";

/**
 * @file First-run seed content.
 *
 * Purpose:
 * Single source of truth for the demo workspace + posts + presentation settings.
 *
 * How it relates to the project:
 * - The in-memory route deps seed these into their constructors (dev/tests).
 * - The SQLite content.db seeds these once, only when the store is empty
 *   (`db/sqlite/content-db.ts` → `seedContentDb`).
 * - Presentation settings are the single source of theme identity. A boot-time ledger
 *   copy would become stale after theme switches.
 *
 * Architectural role:
 * Keeps seed data out of both the composition root and the storage adapters so
 * the two persistence paths stay identical.
 *
 * These explainer pages are seeded as ordinary published posts and render at `/:slug` through
 * the active theme's `entry` template, so switching themes restyles them. The
 * body vocabulary is what `render.ts` supports: block nodes plus bold/italic/
 * code and (C7) an inline `link` mark, so prose can now cross-link between pages
 * in addition to the theme nav/footer.
 */
export const seededWorkspace: WorkspaceRecord = {
  id: "workspace-local",
  name: "Local Tovu Workspace",
  slug: "local-tovu",
  createdAt: "2026-04-06T00:00:00.000Z",
  version: 1,
};

// --- Tiny doc-authoring helpers (build TipTap-style bodyJson without raw JSON) ---
// Only nodes/marks the renderer supports (apps/website/src/server/inbound/public-http/http/site/render.ts).

type Node = JsonObject;

function t({ text }: { text: string }, { marks = [] }: { marks?: Array<"bold" | "italic" | "code"> } = {}): Node {
  return marks.length ? { type: "text", text, marks: marks.map((m) => ({ type: m })) } : { type: "text", text };
}
/** Exported (with `ol`) so the authoring helpers' full mark/node surface is unit-tested even where the
 * shipped seed copy happens not to use it (a marked link; a pre-built ordered-list item). */
export function link({ text, href }: { text: string; href: string }, { marks = [] }: { marks?: Array<"bold" | "italic" | "code"> } = {}): Node {
  return { type: "text", text, marks: [...marks.map((m) => ({ type: m })), { type: "link", attrs: { href } }] };
}
function p({ kids }: { kids: Array<Node | string> }, _optional = {}): Node {
  return { type: "paragraph", content: kids.map((k) => (typeof k === "string" ? t({ text: k }) : k)) };
}
function h({ level, text }: { level: number; text: string }, _optional = {}): Node {
  return { type: "heading", attrs: { level }, content: [t({ text })] };
}
function li({ kids }: { kids: Node[] }, _optional = {}): Node {
  return { type: "listItem", content: kids };
}
function ul({ items }: { items: Array<string | Node> }, _optional = {}): Node {
  return { type: "bulletList", content: items.map((i) => (typeof i === "string" ? li({ kids: [p({ kids: [i] })] }) : i)) };
}
export function ol({ items }: { items: Array<string | Node> }, _optional = {}): Node {
  return { type: "orderedList", content: items.map((i) => (typeof i === "string" ? li({ kids: [p({ kids: [i] })] }) : i)) };
}
function quote({ lines }: { lines: string[] }, _optional = {}): Node {
  return { type: "blockquote", content: lines.map((l) => p({ kids: [l] })) };
}
function code({ text }: { text: string }, _optional = {}): Node {
  return { type: "codeBlock", content: [t({ text })] };
}
function hr(): Node {
  return { type: "horizontalRule" };
}
function doc({ kids }: { kids: Node[] }, _optional = {}): JsonObject {
  return { type: "doc", content: kids };
}

// NOTE: named `seededPost` (not `page`) to avoid colliding with the real
// `PostKind` "page" value now that `kind` exists on `PostRecord` — every row
// this helper builds defaults to `kind: "post"` (see the file comment above:
// these explainer docs predate the `kind` field and were never re-classified).
// `kind` is an optional field of the second object (not folded into a caller-supplied `PostRecord`
// shape) so every existing call site below stays untouched.
//
// `templateChoice` (2026-09-04 fix, an optional field of the second object, same "existing call sites stay untouched"
// shape) — needed because a `kind: "page"` row has NO "never chosen -> theme's first template"
// fallback (`isEligibleForTemplateBranch`'s doc, `features/theme/static-render.ts`): an
// untemplated Page falls through to the generic dynamic-post render, which for a `static`-tier
// theme means Tovu's own placeholder `siteHeader`/`siteFooter` markup (`render.ts`'s
// `fallbackSiteBody`), not the theme's real nav/footer. The seeded `"page-root"` row below is a
// `kind: "page"` row and hit exactly this gap: the content-owned homepage rendered with zero
// working internal links. `resolveStaticTierPageShellFallback` (the 2026-09-02 fix for the same
// symptom) does not cover it either — that fallback is scoped to `bodyFormat: "html"` Pages only,
// and every row this helper builds is `bodyFormat: "doc"` (see below). Passing an explicit
// `templateChoice` is the same fix an admin's template picker already applies by hand.
function seededPost(
  { id, title, slug, body }: { id: string; title: string; slug: string; body: JsonObject },
  { kind = "post", templateChoice }: { kind?: PostRecord["kind"]; templateChoice?: string } = {}
): PostRecord {
  return {
    id,
    workspaceId: seededWorkspace.id,
    title,
    slug,
    bodyJson: body,
    // SPEC-047/ADR-056 Decision 3 — every seeded row is a TipTap document, matching what every
    // pre-feature row already was; seed data has no reason to exercise the "html" branch.
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind,
    updatedAt: "2026-07-07T00:00:00.000Z",
    version: 1,
    ...(templateChoice !== undefined ? { templateChoice } : {}),
  };
}

// --- The original welcome post (a route test depends on id "post-home" / slug "welcome") ---

const welcomeDoc: JsonObject = doc({ kids: [
  p({ kids: ["This editor is now using a real ", t({ text: "TipTap" }, { marks: ["bold"] }), " document with styled prose instead of an empty demo box."] }),
  p({ kids: ["Use it to pressure-test the shell before we fill in the rest of the CMS."] }),
  ul({ items: [
    li({ kids: [p({ kids: [t({ text: "Bold" }, { marks: ["bold"] }), t({ text: " and " }), t({ text: "italic" }, { marks: ["italic"] }), t({ text: " formatting should be obvious immediately." })] })] }),
    "Lists, quotes, and code blocks should round-trip through the API.",
    "Switch themes in Appearance to verify the frontend actually changes.",
  ] }),
  quote({ lines: ["Build the skateboard first, but make sure it actually rolls."] }),
  code({ text: "console.log('Tovu shell is live');" }),
] });

// --- Content-owned homepage (`post.ts`'s `ROOT_SLUG`) ---
//
// A `kind: "page"` row claiming the literal slug "/" so a fresh `tovu init` site (and every
// dev/test boot that shares this module's seed) renders a real, authored home page instead of
// always falling back to the active theme's own `index.html` — the theme's stock `basic` demo
// page describes a fictional product named "Basic", which is misleading as a brand-new site's
// front door. Kept deliberately short and honest (unlike the fictional stock demo) rather than
// duplicating `welcomeDoc`'s longer walkthrough, which stays reachable at its own `/welcome` slug.

const rootDoc: JsonObject = doc({ kids: [
  p({ kids: ["This is your home page. The heading, buttons, cards and latest posts around this text come from your theme; this paragraph is yours to change under Pages in the admin."] }),
] });

// --- Blog listing page ---
//
// The landing template's "Read the blog" and "All posts" buttons (`tovu-starter`'s index.html) link
// to `/blog`; without a row at that slug both are dead links on a brand-new site. Bound to the
// starter's `listing-default.html`, whose post-previews marker lists the newest posts under this
// short intro. Another theme without that template falls back to its own first template
// (`resolveTemplate`), so the choice never strands the page.

const blogDoc: JsonObject = doc({ kids: [
  p({ kids: ["Everything published on this site, newest first."] }),
] });

// --- Site explainer pages (content, not theme-baked) ---

const aboutDoc = doc({ kids: [
  p({ kids: ["Tovu is a content platform you actually own. Your content, your themes, your data — on a machine you control, in a single folder you can copy, back up, or hand to someone else."] }),
  h({ level: 2, text: "The idea" }),
  p({ kids: ["Most content platforms rent you a database and a dashboard. Tovu inverts that. The whole site — the database, your uploads, your themes, and your plugins — lives in one directory. Move it, version it in git, or export it as a standalone binary. Nothing phones home."] }),
  ul({ items: [
    "No lock-in and no per-seat pricing.",
    "One portable SQLite file today; Postgres-ready behind the same interface.",
    "An audited change-set gateway, so every edit can be reviewed and reverted.",
  ] }),
  h({ level: 2, text: "Why it reads like this" }),
  p({ kids: ["The page you're reading is itself content rendered through a theme. Change the theme in the admin and this same text re-skins instantly — because in Tovu, ", t({ text: "content is data and the theme is arrangement" }, { marks: ["italic"] }), "."] }),
  quote({ lines: ["Own your content the way you own a text file — not the way you rent a spreadsheet."] }),
] });

const themesDoc = doc({ kids: [
  p({ kids: ["A theme decides how your site looks and how its content is arranged. Tovu themes come in three tiers — three levels of power — so you trade exactly as much safety for capability as you need, and never more."] }),
  h({ level: 2, text: "Three kinds of theme" }),
  p({ kids: ["The same content renders through whichever theme you choose. What changes from tier to tier is how much a theme is allowed to do."] }),
  ul({ items: [
    li({ kids: [p({ kids: [t({ text: "Declarative" }, { marks: ["bold"] }), t({ text: " — the default, and all most sites ever need. Pure data: design tokens, JSON templates, and a sanitized stylesheet. No code runs, so it is safe to install from anyone. CSS alone goes a long way — gradients, transitions, and animation are all on the table." })] })] }),
    li({ kids: [p({ kids: [t({ text: "Templated" }, { marks: ["bold"] }), t({ text: " — for designers who outgrow fixed blocks. It adds real arranging logic — loops, conditionals, reusable includes — through Liquid, a sandboxed template language. Expressive, but it still cannot run JavaScript, so a templated theme stays safe to share." })] })] }),
    li({ kids: [p({ kids: [t({ text: "Code" }, { marks: ["bold"] }), t({ text: " — full power for developers: real JavaScript and component frameworks like Astro or Next, plus motion libraries like Framer Motion or GSAP. Anything you can build, you can ship." })] })] }),
  ] }),
  p({ kids: [t({ text: "Declarative themes ship today; templated and code themes are how Tovu grows — without ever forcing that power on a site that doesn't want it." }, { marks: ["italic"] })] }),
  h({ level: 2, text: "The trade you are making" }),
  p({ kids: ["The tiers run in a straight line from safe to powerful. A declarative theme does less, but you can install one from a stranger without a second thought. A code theme can do anything — which means it runs JavaScript on your machine, so you install it the way you'd add a dependency: from an author you trust."] }),
  p({ kids: ["We will always tell you which tier a theme is before you install it, and we will never dress a code theme up as ", t({ text: "safe" }, { marks: ["italic"] }), ". That honesty is the whole point — ", t({ text: "you" }, { marks: ["italic"] }), " choose the ceiling."] }),
  h({ level: 2, text: "What ships in a theme" }),
  p({ kids: ["Every theme starts with the same two files, then its own tier decides the rest — a themeable ", t({ text: "declarative" }, { marks: ["bold"] }), "/", t({ text: "templated" }, { marks: ["bold"] }), "/", t({ text: "code" }, { marks: ["bold"] }), " theme arranges JSON template blocks; a ", t({ text: "static" }, { marks: ["bold"] }), " theme (Tovu's fully hand-editable HTML/CSS/JS tier) ships whole pages instead."] }),
  ul({ items: [
    li({ kids: [p({ kids: [t({ text: "theme.json" }, { marks: ["code"] }), t({ text: " — the manifest: id, version, fonts, and the theme's " }), t({ text: "tier" }, { marks: ["code"] }), t({ text: "." })] })] }),
    li({ kids: [p({ kids: [t({ text: "tokens.json" }, { marks: ["code"] }), t({ text: " — design tokens: color, type, spacing, radii." })] })] }),
    li({ kids: [p({ kids: [t({ text: "templates/" }, { marks: ["code"] }), t({ text: " — declarative/templated/code tiers: how the page is arranged (home, entry, …)." })] })] }),
    li({ kids: [p({ kids: [t({ text: "render/pages/, render/partials/" }, { marks: ["code"] }), t({ text: " — the static tier: full page HTML plus nav/footer partials, every byte editable." })] })] }),
    li({ kids: [p({ kids: [t({ text: "css/theme.css" }, { marks: ["code"] }), t({ text: " — a sanitized stylesheet. No imports from foreign origins." })] })] }),
  ] }),
  h({ level: 2, text: "Where behavior comes from" }),
  p({ kids: ["Whatever the tier, a theme gains new capability the same safe way — from a ", t({ text: "plugin" }, { marks: ["bold"] }), ", the trusted plane where code lives with its permissions shown up front. A theme never has to become dangerous just to earn a feature."] }),
  p({ kids: ["When a design needs one — a newsletter box, a pricing table, a live search — the theme can ship as a ", t({ text: "bundle" }, { marks: ["bold"] }), " that declares the plugins it needs and installs them in one consented step, instead of leaving you to hunt them down. See ", link({ text: "How Plugins Work", href: "/how-plugins-work" }), " and ", link({ text: "The Plugin API", href: "/plugin-api" }), "."] }),
  h({ level: 2, text: "Trying it" }),
  p({ kids: ["Every page here renders through the active theme — because in Tovu, ", t({ text: "content is data and the theme is arrangement" }, { marks: ["italic"] }), ". Switch between Tovu Official, Column, and Signal in the admin's Appearance section and watch this exact page change shape."] }),
  code({ text: "themes/\n  tovu-official/           # declarative/templated/code tier\n    theme.json           # id, version, fonts, tier\n    tokens.json\n    templates/{home,entry}.json\n    css/theme.css" }),
  code({ text: "themes/\n  basic/                   # static tier\n    theme.json           # id, version, fonts, tier\n    tokens.json\n    render/\n      pages/index.html   # every page, full HTML\n      partials/nav.html  # nav, footer, ...\n    css/theme.css\n    scripts/" }),
] });

const pluginsDoc = doc({ kids: [
  p({ kids: ["If a theme is arrangement, a plugin is capability. When a site needs something new — a word counter, an SEO panel, a custom block — a plugin provides it."] }),
  h({ level: 2, text: "The split that keeps you safe" }),
  p({ kids: ["Most themes are data — you can install one from a stranger without a second thought — and the rare theme that carries its own code is clearly marked before you install it (see ", link({ text: "How Themes Work", href: "/how-themes-work" }), " for the tiers). Plugins are the trusted plane where capability always lives. Keeping those planes separate is the whole security model: you add a plugin the way you'd add a dependency — deliberately, with its permissions shown up front."] }),
  ul({ items: [
    "Plugins declare exactly what they touch: content fields, a few typed hooks, and admin surfaces.",
    "A plugin can extend a post with its own data, but it never runs raw migrations against your database.",
    "Capabilities are permission-scoped, so the blast radius is always visible.",
  ] }),
  h({ level: 2, text: "Themes and plugins together" }),
  p({ kids: ["A good-looking theme sometimes needs a capability its components don't cover. Rather than making you download a theme and then go hunt for the right plugin, a ", t({ text: "theme bundle" }, { marks: ["bold"] }), " can declare the plugins it needs and install them in one consented step. The theme stays code-free; the behavior lives in the plugin."] }),
  quote({ lines: ["Plugins power it; themes arrange it."] }),
] });

const pluginApiDoc = doc({ kids: [
  p({ kids: ["The plugin API is small on purpose. A plugin is a prebuilt module plus a signed manifest that declares what it extends. This page sketches the surface — the full contract lives in the SDK."] }),
  h({ level: 2, text: "A hook" }),
  p({ kids: ["Plugins subscribe to typed hooks. The v1 walking-skeleton ships one, so you can see the shape:"] }),
  code({ text: "export default definePlugin({\n  id: \"acme/word-count\",\n  hooks: {\n    \"content.entry.beforeSave\": (entry) => {\n      entry.ext[\"acme/word-count\"] = countWords(entry.bodyJson);\n      return entry;\n    },\n  },\n});" }),
  h({ level: 2, text: "Extension fields, not schema changes" }),
  p({ kids: ["A plugin never owns your schema. It writes into a namespaced ", t({ text: "ext" }, { marks: ["code"] }), " bag keyed by plugin id, so two plugins can never collide and uninstalling one never corrupts your tables."] }),
  ul({ items: [
    li({ kids: [p({ kids: [t({ text: "definePlugin(...)" }, { marks: ["code"] }), t({ text: " — declare id, hooks, and requested capabilities." })] })] }),
    li({ kids: [p({ kids: [t({ text: "content.entry.beforeSave" }, { marks: ["code"] }), t({ text: " — the first typed hook; more land as the surface grows." })] })] }),
    li({ kids: [p({ kids: [t({ text: "ext.{pluginId}" }, { marks: ["code"] }), t({ text: " — where a plugin's data lives, namespaced and safe." })] })] }),
  ] }),
  p({ kids: [t({ text: "This is a preview of a thin slice; the API is not yet stable." }, { marks: ["italic"] })] }),
] });

const selfHostingDoc = doc({ kids: [
  p({ kids: [t({ text: "Coming soon." }, { marks: ["bold"] }), t({ text: " Managed self-hosting is on the roadmap. This page is a placeholder so we can describe what it will be." })] }),
  h({ level: 2, text: "What we're building" }),
  p({ kids: ["Today you run Tovu yourself: one binary, one folder, your machine. That will always work and will always be free. The coming service adds a managed path for people who want the ownership model without running a server."] }),
  ul({ items: [
    "One-click deploy of your Tovu folder to a host you control.",
    "Automatic backups of the single site folder — database, uploads, themes, and plugins.",
    "A painless move from SQLite to Postgres when you outgrow a file, with no rewrite.",
    "Bring-your-own-domain and TLS, handled for you.",
  ] }),
  h({ level: 2, text: "What won't change" }),
  p({ kids: ["The important part: it stays ", t({ text: "your" }, { marks: ["italic"] }), " site. Managed hosting is a convenience layer over the same portable folder — export to a standalone binary and walk away at any time. No lock-in is the point, not a feature we can quietly remove."] }),
  hr(),
  p({ kids: [t({ text: "Want to be notified when self-hosting opens? That signup form is one of the pages still to build." }, { marks: ["italic"] })] }),
] });

// --- Generic sample content (deliberately NOT about Tovu — a theming stress test) ---

const typographyDoc = doc({ kids: [
  p({ kids: ["Type has weight before it has meaning. Before a reader parses a single word, the shape of the page has already told them how to feel about it — formal or friendly, urgent or unhurried."] }),
  h({ level: 2, text: "Three decisions that carry a page" }),
  ol({ items: [
    "Measure: the line length that keeps the eye from getting lost on the return sweep.",
    "Rhythm: the vertical spacing that makes paragraphs feel like breathing, not stacking.",
    "Contrast: the jump between a heading and its body that signals hierarchy without shouting.",
  ] }),
  h({ level: 2, text: "The quiet defaults" }),
  p({ kids: ["Most good typography is subtraction. A comfortable measure, one restrained typeface used at two or three sizes, and enough air. The failures are almost always additions — a second decorative face, a tighter leading to \"fit more,\" a heading that competes with its own body."] }),
  quote({ lines: [
    "The best typography disappears. You notice a page that is hard to read; you rarely notice one that is easy.",
  ] }),
  p({ kids: ["Which is the honest test for any theme: read a long paragraph on it, and see whether you finish."] }),
] });

const morningsDoc = doc({ kids: [
  p({ kids: ["A slow morning is not an empty one. It is a morning with a deliberate order — a few small rituals that happen before the day starts asking for things."] }),
  h({ level: 2, text: "A short list" }),
  ul({ items: [
    "Light before screens: open a window before you open a laptop.",
    "One warm thing, made slowly, with both hands.",
    "Ten minutes of the day that belong to no one else.",
  ] }),
  p({ kids: ["None of it is productive in the way the word usually means. That is the point. The morning is the one stretch of the day you can refuse to optimize."] }),
  quote({ lines: ["Begin gently, and the rest of the day has to negotiate with a calm person."] }),
] });

export const seededPosts: PostRecord[] = [
  seededPost({ id: "post-home", title: "Welcome to Tovu", slug: "welcome", body: welcomeDoc }),
  seededPost({ id: "post-about", title: "What Is Tovu?", slug: "about", body: aboutDoc }),
  seededPost({ id: "post-themes", title: "How Themes Work", slug: "how-themes-work", body: themesDoc }),
  seededPost({ id: "post-plugins", title: "How Plugins Work", slug: "how-plugins-work", body: pluginsDoc }),
  seededPost({ id: "post-plugin-api", title: "The Plugin API", slug: "plugin-api", body: pluginApiDoc }),
  seededPost({ id: "post-self-hosting", title: "Self-Hosting — Coming Soon", slug: "self-hosting", body: selfHostingDoc }),
  seededPost({ id: "post-typography", title: "Field Notes: The Weight of Type", slug: "the-weight-of-type", body: typographyDoc }),
  seededPost({ id: "post-mornings", title: "Slow Mornings", slug: "slow-mornings", body: morningsDoc }),
  // Content-owned homepage — see `rootDoc`'s own comment above. `kind: "page"` (not "post") is
  // what gates the literal "/" slug (`post.ts`'s `ROOT_SLUG`/`resolveExplicitSlug`).
  //
  // `templateChoice: "index"` (2026-09-27) — renders the page through the default theme's landing
  // template (`tovu-starter/render/pages/index.html`: hero, this page's body, feature cards, latest
  // posts) instead of the plain article shell. An explicit choice is required: a `kind: "page"` row
  // has no "never chosen" fallback into the template branch (`seededPost`'s doc). It replaced
  // `"page-shell.html"` (2026-09-04), which rendered "/" as a bare dated article. A theme without an
  // `index` template that carries a content slot falls back to its first template (`resolveTemplate`,
  // `features/theme/static-render.ts`).
  seededPost({ id: "page-root", title: "Home", slug: "/", body: rootDoc }, { kind: "page", templateChoice: "index" }),
  seededPost({ id: "page-blog", title: "Blog", slug: "blog", body: blogDoc }, { kind: "page", templateChoice: "listing-default.html" }),
];

export const seededPresentation: PresentationSettingsRecord = {
  workspaceId: seededWorkspace.id,
  // A fresh site is seeded into state 1 — the default theme EXPLICITLY active — not into the
  // resolver's fallback. `resolveActiveTheme`'s step 2 would produce the same theme, but a seeded
  // row is what makes the admin show "tovu-starter — Active" instead of a blank card, and what
  // keeps a new install distinguishable from a site whose theme has gone missing.
  //
  // `DEFAULT_THEME_ID`, not the literal `"basic"` (2026-09-12): until the resolver grew a named
  // default, this seed's literal and the resolver's implicit winner were two independent facts that
  // happened to agree, and the 2026-08-10 comment here recorded the resolver bug rather than fixing
  // it. One name means they cannot disagree. See `features/theme/active-theme.ts`.
  activeThemeId: DEFAULT_THEME_ID,
  updatedAt: "2026-04-06T00:00:00.000Z",
};

/**
 * The trusted boot-time actor settings-definition writes are
 * attributed to (mirrors `Jini packages/user-management/src/server/seed.ts`'s well-known `system` principal
 * convention — kept here rather than importing from `identity` so `settings`
 * doesn't need a real, resolved identity principal row to run this migration
 * before `identity`'s own async seed completes).
 */
export const SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID = "system-settings-migration";
