import type { JsonObject } from "@jini-ai/cms/core";
import type { PostRecord } from "#src/features/post/index";
import type { PresentationSettingsRecord } from "#src/features/presentation/index";
import {
  migrateLegacyPresentationSettings,
  type MigrateLegacyPresentationSettingsDeps,
  type MigrateLegacyPresentationSettingsResult,
} from "#src/features/settings/migration";
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
 * - `seedSettingsFromPresentation` (below) is this module's boot-time entry
 *   point for the SPEC-007 REQ-08 legacy-presentation → settings-ledger
 *   migration (ADR-PIPE-007 Migration Safety): both composition roots
 *   (`server/app.ts`, `server/deps.ts`) call it right after constructing
 *   their `presentationRepo`/`settingsRepo` pair, mirroring how this file is
 *   already "the one source of truth" for workspace/post/presentation seed
 *   data — it is now also the one call site for kicking off that migration.
 *
 * Architectural role:
 * Keeps seed data out of both the composition root and the storage adapters so
 * the two persistence paths stay identical.
 *
 * NOTE (usability probe, 2026-07-07): there is no content-create API yet
 * (SPEC-002 authoring unbuilt) and no `kind` field, so these explainer "pages"
 * are seeded here as ordinary published posts. They render at `/:slug` through
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
};

// --- Tiny doc-authoring helpers (build TipTap-style bodyJson without raw JSON) ---
// Only nodes/marks the renderer supports (src/server/http/site/render.ts).

type Node = JsonObject;

function t(text: string, ...marks: Array<"bold" | "italic" | "code">): Node {
  return marks.length ? { type: "text", text, marks: marks.map((m) => ({ type: m })) } : { type: "text", text };
}
function link(text: string, href: string, ...marks: Array<"bold" | "italic" | "code">): Node {
  return { type: "text", text, marks: [...marks.map((m) => ({ type: m })), { type: "link", attrs: { href } }] };
}
function p(...kids: Array<Node | string>): Node {
  return { type: "paragraph", content: kids.map((k) => (typeof k === "string" ? t(k) : k)) };
}
function h(level: number, text: string): Node {
  return { type: "heading", attrs: { level }, content: [t(text)] };
}
function li(...kids: Node[]): Node {
  return { type: "listItem", content: kids };
}
function ul(...items: Array<string | Node>): Node {
  return { type: "bulletList", content: items.map((i) => (typeof i === "string" ? li(p(i)) : i)) };
}
function ol(...items: Array<string | Node>): Node {
  return { type: "orderedList", content: items.map((i) => (typeof i === "string" ? li(p(i)) : i)) };
}
function quote(...lines: string[]): Node {
  return { type: "blockquote", content: lines.map((l) => p(l)) };
}
function code(text: string): Node {
  return { type: "codeBlock", content: [t(text)] };
}
function hr(): Node {
  return { type: "horizontalRule" };
}
function doc(...kids: Node[]): JsonObject {
  return { type: "doc", content: kids };
}

// NOTE: named `seededPost` (not `page`) to avoid colliding with the real
// `PostKind` "page" value now that `kind` exists on `PostRecord` — every row
// this helper builds defaults to `kind: "post"` (see the file comment above:
// these explainer docs predate the `kind` field and were never re-classified).
// `kind` is an optional 5th arg (not folded into a caller-supplied `PostRecord`
// shape) so every existing call site below stays untouched.
//
// `templateChoice` (2026-09-04 fix, optional 6th arg, same "existing call sites stay untouched"
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
  id: string,
  title: string,
  slug: string,
  body: JsonObject,
  kind: PostRecord["kind"] = "post",
  templateChoice?: string
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

const welcomeDoc: JsonObject = doc(
  p("This editor is now using a real ", t("TipTap", "bold"), " document with styled prose instead of an empty demo box."),
  p("Use it to pressure-test the shell before we fill in the rest of the CMS."),
  ul(
    li(p(t("Bold", "bold"), t(" and "), t("italic", "italic"), t(" formatting should be obvious immediately."))),
    "Lists, quotes, and code blocks should round-trip through the API.",
    "Switch themes in Appearance to verify the frontend actually changes.",
  ),
  quote("Build the skateboard first, but make sure it actually rolls."),
  code("console.log('Tovu shell is live');"),
);

// --- Content-owned homepage (`post.ts`'s `ROOT_SLUG`) ---
//
// A `kind: "page"` row claiming the literal slug "/" so a fresh `tovu init` site (and every
// dev/test boot that shares this module's seed) renders a real, authored home page instead of
// always falling back to the active theme's own `index.html` — the theme's stock `basic` demo
// page describes a fictional product named "Basic", which is misleading as a brand-new site's
// front door. Kept deliberately short and honest (unlike the fictional stock demo) rather than
// duplicating `welcomeDoc`'s longer walkthrough, which stays reachable at its own `/welcome` slug.

const rootDoc: JsonObject = doc(
  p("Welcome to your new Tovu site."),
  p(
    "This home page is real, editable content — open the admin's Pages panel to rewrite it. See ",
    link("Welcome to Tovu", "/welcome"),
    " for a quick tour of what's already here.",
  ),
);

// --- Site explainer pages (content, not theme-baked) ---

const aboutDoc = doc(
  p("Tovu is a content platform you actually own. Your content, your themes, your data — on a machine you control, in a single folder you can copy, back up, or hand to someone else."),
  h(2, "The idea"),
  p("Most content platforms rent you a database and a dashboard. Tovu inverts that. The whole site — the database, your uploads, your themes, and your plugins — lives in one directory. Move it, version it in git, or export it as a standalone binary. Nothing phones home."),
  ul(
    "No lock-in and no per-seat pricing.",
    "One portable SQLite file today; Postgres-ready behind the same interface.",
    "An audited change-set gateway, so every edit can be reviewed and reverted.",
  ),
  h(2, "Why it reads like this"),
  p("The page you're reading is itself content rendered through a theme. Change the theme in the admin and this same text re-skins instantly — because in Tovu, ", t("content is data and the theme is arrangement", "italic"), "."),
  quote("Own your content the way you own a text file — not the way you rent a spreadsheet."),
);

const themesDoc = doc(
  p("A theme decides how your site looks and how its content is arranged. Tovu themes come in three tiers — three levels of power — so you trade exactly as much safety for capability as you need, and never more."),
  h(2, "Three kinds of theme"),
  p("The same content renders through whichever theme you choose. What changes from tier to tier is how much a theme is allowed to do."),
  ul(
    li(p(t("Declarative", "bold"), t(" — the default, and all most sites ever need. Pure data: design tokens, JSON templates, and a sanitized stylesheet. No code runs, so it is safe to install from anyone. CSS alone goes a long way — gradients, transitions, and animation are all on the table."))),
    li(p(t("Templated", "bold"), t(" — for designers who outgrow fixed blocks. It adds real arranging logic — loops, conditionals, reusable includes — through Liquid, a sandboxed template language. Expressive, but it still cannot run JavaScript, so a templated theme stays safe to share."))),
    li(p(t("Code", "bold"), t(" — full power for developers: real JavaScript and component frameworks like Astro or Next, plus motion libraries like Framer Motion or GSAP. Anything you can build, you can ship."))),
  ),
  p(t("Declarative themes ship today; templated and code themes are how Tovu grows — without ever forcing that power on a site that doesn't want it.", "italic")),
  h(2, "The trade you are making"),
  p("The tiers run in a straight line from safe to powerful. A declarative theme does less, but you can install one from a stranger without a second thought. A code theme can do anything — which means it runs JavaScript on your machine, so you install it the way you'd add a dependency: from an author you trust."),
  p("We will always tell you which tier a theme is before you install it, and we will never dress a code theme up as ", t("safe", "italic"), ". That honesty is the whole point — ", t("you", "italic"), " choose the ceiling."),
  h(2, "What ships in a theme"),
  p("Every theme starts with the same two files, then its own tier decides the rest — a themeable ", t("declarative", "bold"), "/", t("templated", "bold"), "/", t("code", "bold"), " theme arranges JSON template blocks; a ", t("static", "bold"), " theme (Tovu's fully hand-editable HTML/CSS/JS tier) ships whole pages instead."),
  ul(
    li(p(t("theme.json", "code"), t(" — the manifest: id, version, fonts, and the theme's "), t("tier", "code"), t("."))),
    li(p(t("tokens.json", "code"), t(" — design tokens: color, type, spacing, radii."))),
    li(p(t("templates/", "code"), t(" — declarative/templated/code tiers: how the page is arranged (home, entry, …)."))),
    li(p(t("render/pages/, render/partials/", "code"), t(" — the static tier: full page HTML plus nav/footer partials, every byte editable."))),
    li(p(t("css/theme.css", "code"), t(" — a sanitized stylesheet. No imports from foreign origins."))),
  ),
  h(2, "Where behavior comes from"),
  p("Whatever the tier, a theme gains new capability the same safe way — from a ", t("plugin", "bold"), ", the trusted plane where code lives with its permissions shown up front. A theme never has to become dangerous just to earn a feature."),
  p("When a design needs one — a newsletter box, a pricing table, a live search — the theme can ship as a ", t("bundle", "bold"), " that declares the plugins it needs and installs them in one consented step, instead of leaving you to hunt them down. See ", link("How Plugins Work", "/how-plugins-work"), " and ", link("The Plugin API", "/plugin-api"), "."),
  h(2, "Trying it"),
  p("Every page here renders through the active theme — because in Tovu, ", t("content is data and the theme is arrangement", "italic"), ". Switch between Tovu Official, Column, and Signal in the admin's Appearance section and watch this exact page change shape."),
  code("themes/\n  tovu-official/           # declarative/templated/code tier\n    theme.json           # id, version, fonts, tier\n    tokens.json\n    templates/{home,entry}.json\n    css/theme.css"),
  code("themes/\n  basic/                   # static tier\n    theme.json           # id, version, fonts, tier\n    tokens.json\n    render/\n      pages/index.html   # every page, full HTML\n      partials/nav.html  # nav, footer, ...\n    css/theme.css\n    scripts/"),
);

const pluginsDoc = doc(
  p("If a theme is arrangement, a plugin is capability. When a site needs something new — a word counter, an SEO panel, a custom block — a plugin provides it."),
  h(2, "The split that keeps you safe"),
  p("Most themes are data — you can install one from a stranger without a second thought — and the rare theme that carries its own code is clearly marked before you install it (see ", link("How Themes Work", "/how-themes-work"), " for the tiers). Plugins are the trusted plane where capability always lives. Keeping those planes separate is the whole security model: you add a plugin the way you'd add a dependency — deliberately, with its permissions shown up front."),
  ul(
    "Plugins declare exactly what they touch: content fields, a few typed hooks, and admin surfaces.",
    "A plugin can extend a post with its own data, but it never runs raw migrations against your database.",
    "Capabilities are permission-scoped, so the blast radius is always visible.",
  ),
  h(2, "Themes and plugins together"),
  p("A good-looking theme sometimes needs a capability its components don't cover. Rather than making you download a theme and then go hunt for the right plugin, a ", t("theme bundle", "bold"), " can declare the plugins it needs and install them in one consented step. The theme stays code-free; the behavior lives in the plugin."),
  quote("Plugins power it; themes arrange it."),
);

const pluginApiDoc = doc(
  p("The plugin API is small on purpose. A plugin is a prebuilt module plus a signed manifest that declares what it extends. This page sketches the surface — the full contract lives in the SDK."),
  h(2, "A hook"),
  p("Plugins subscribe to typed hooks. The v1 walking-skeleton ships one, so you can see the shape:"),
  code("export default definePlugin({\n  id: \"acme/word-count\",\n  hooks: {\n    \"content.entry.beforeSave\": (entry) => {\n      entry.ext[\"acme/word-count\"] = countWords(entry.bodyJson);\n      return entry;\n    },\n  },\n});"),
  h(2, "Extension fields, not schema changes"),
  p("A plugin never owns your schema. It writes into a namespaced ", t("ext", "code"), " bag keyed by plugin id, so two plugins can never collide and uninstalling one never corrupts your tables."),
  ul(
    li(p(t("definePlugin(...)", "code"), t(" — declare id, hooks, and requested capabilities."))),
    li(p(t("content.entry.beforeSave", "code"), t(" — the first typed hook; more land as the surface grows."))),
    li(p(t("ext.{pluginId}", "code"), t(" — where a plugin's data lives, namespaced and safe."))),
  ),
  p(t("This is a preview of a thin slice; the API is not yet stable.", "italic")),
);

const selfHostingDoc = doc(
  p(t("Coming soon.", "bold"), t(" Managed self-hosting is on the roadmap. This page is a placeholder so we can describe what it will be.")),
  h(2, "What we're building"),
  p("Today you run Tovu yourself: one binary, one folder, your machine. That will always work and will always be free. The coming service adds a managed path for people who want the ownership model without running a server."),
  ul(
    "One-click deploy of your Tovu folder to a host you control.",
    "Automatic backups of the single site folder — database, uploads, themes, and plugins.",
    "A painless move from SQLite to Postgres when you outgrow a file, with no rewrite.",
    "Bring-your-own-domain and TLS, handled for you.",
  ),
  h(2, "What won't change"),
  p("The important part: it stays ", t("your", "italic"), " site. Managed hosting is a convenience layer over the same portable folder — export to a standalone binary and walk away at any time. No lock-in is the point, not a feature we can quietly remove."),
  hr(),
  p(t("Want to be notified when self-hosting opens? That signup form is one of the pages still to build.", "italic")),
);

// --- Generic sample content (deliberately NOT about Tovu — a theming stress test) ---

const typographyDoc = doc(
  p("Type has weight before it has meaning. Before a reader parses a single word, the shape of the page has already told them how to feel about it — formal or friendly, urgent or unhurried."),
  h(2, "Three decisions that carry a page"),
  ol(
    "Measure: the line length that keeps the eye from getting lost on the return sweep.",
    "Rhythm: the vertical spacing that makes paragraphs feel like breathing, not stacking.",
    "Contrast: the jump between a heading and its body that signals hierarchy without shouting.",
  ),
  h(2, "The quiet defaults"),
  p("Most good typography is subtraction. A comfortable measure, one restrained typeface used at two or three sizes, and enough air. The failures are almost always additions — a second decorative face, a tighter leading to \"fit more,\" a heading that competes with its own body."),
  quote(
    "The best typography disappears. You notice a page that is hard to read; you rarely notice one that is easy.",
  ),
  p("Which is the honest test for any theme: read a long paragraph on it, and see whether you finish."),
);

const morningsDoc = doc(
  p("A slow morning is not an empty one. It is a morning with a deliberate order — a few small rituals that happen before the day starts asking for things."),
  h(2, "A short list"),
  ul(
    "Light before screens: open a window before you open a laptop.",
    "One warm thing, made slowly, with both hands.",
    "Ten minutes of the day that belong to no one else.",
  ),
  p("None of it is productive in the way the word usually means. That is the point. The morning is the one stretch of the day you can refuse to optimize."),
  quote("Begin gently, and the rest of the day has to negotiate with a calm person."),
);

export const seededPosts: PostRecord[] = [
  seededPost("post-home", "Welcome to Tovu", "welcome", welcomeDoc),
  seededPost("post-about", "What Is Tovu?", "about", aboutDoc),
  seededPost("post-themes", "How Themes Work", "how-themes-work", themesDoc),
  seededPost("post-plugins", "How Plugins Work", "how-plugins-work", pluginsDoc),
  seededPost("post-plugin-api", "The Plugin API", "plugin-api", pluginApiDoc),
  seededPost("post-self-hosting", "Self-Hosting — Coming Soon", "self-hosting", selfHostingDoc),
  seededPost("post-typography", "Field Notes: The Weight of Type", "the-weight-of-type", typographyDoc),
  seededPost("post-mornings", "Slow Mornings", "slow-mornings", morningsDoc),
  // Content-owned homepage — see `rootDoc`'s own comment above. `kind: "page"` (not "post") is
  // what gates the literal "/" slug (`post.ts`'s `ROOT_SLUG`/`resolveExplicitSlug`).
  //
  // `templateChoice: "page-shell.html"` (2026-09-04 fix) — binds this row to the stock `basic`
  // theme's own content-agnostic document shell (`content/themes/static/basic/render/pages/
  // page-shell.html`: real nav + footer partials around one `{"type":"content"}` slot) so `GET /`
  // renders inside the theme's actual site chrome instead of Tovu's generic placeholder
  // header/footer. See `seededPost`'s own doc for the full regression this closes.
  //
  // Named `"page-shell.html"`, the theme's CURRENT (pre-rename) filename, not `"pages-default.html"`
  // (the name `sites/tovu-com`'s already-renamed copy uses) — deliberately, because
  // `content/themes/static/basic/` is the stock theme every `tovu init` installs, and it has not
  // been renamed (see that dir's own history). `resolveTemplate`'s `LEGACY_TEMPLATE_FILENAME_ALIASES`
  // (`features/theme/static-render.ts`) maps `"page-shell"` -> `"pages-default"` automatically, so
  // this stays correct unmodified if the stock theme is ever renamed the same way later.
  seededPost("page-root", "Home", "/", rootDoc, "page", "page-shell.html"),
];

export const seededPresentation: PresentationSettingsRecord = {
  workspaceId: seededWorkspace.id,
  // `tovu-official` (until 2026-08-10) lived only under `development/fixtures/theme-archive/`, which discovery never
  // scans — a fresh workspace's active theme silently fell through `resolveActiveTheme()`'s fallback
  // to whatever the alphabetically-first *valid* discovered theme happened to be, making the real
  // default effectively arbitrary. `basic` (`content/themes/static/basic/`) is a real, valid, currently
  // shipping static theme, so the stored id now resolves directly instead of relying on the fallback.
  activeThemeId: "basic",
  updatedAt: "2026-04-06T00:00:00.000Z",
};

/**
 * The trusted boot-time actor `seedSettingsFromPresentation`'s writes are
 * attributed to (mirrors `identity/seed.ts`'s well-known `system` principal
 * convention — kept here rather than importing from `identity` so `settings`
 * doesn't need a real, resolved identity principal row to run this migration
 * before `identity`'s own async seed completes).
 */
export const SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID = "system-settings-migration";

/**
 * SPEC-007 REQ-08 boot entry point (ADR-PIPE-007 Migration Safety): a thin
 * pass-through to `migrateLegacyPresentationSettings`, kept here (rather than
 * called directly by each composition root) so this module stays the single
 * place both composition roots' seed-time behavior is defined. Idempotent —
 * safe to call on every boot (W-003); fire-and-forget from the caller (see
 * `RouteDeps.settingsReady`).
 */
export function seedSettingsFromPresentation(
  deps: MigrateLegacyPresentationSettingsDeps
): Promise<MigrateLegacyPresentationSettingsResult> {
  return migrateLegacyPresentationSettings(deps);
}
