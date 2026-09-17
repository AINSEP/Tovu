# Tovu — Product Brief for Design

*Written for a designer or design-system team with no prior context on this product.
This document explains what Tovu is, who it's for, and how it's built, so you can design
a new public-site theme (and understand the admin interface it lives next to). It is a
briefing document, not a spec — it does not propose any visual direction.*

---

## 1. What Tovu is

Tovu is a self-hosted content platform: you install it, it creates a folder on disk
holding one site's database, uploaded files, themes, and plugins, and it serves both the
public website and its admin interface from that one folder. There's no signup, no
hosted account, and no separate database server — each site is a single SQLite file.

The distinguishing idea is stated on Tovu's own homepage: **"a self-hosted content
platform where every admin capability is also a tool an agent can call."** Every screen
in the admin — editing a page, approving a comment, regenerating a sitemap, creating a
redirect — is backed by the same typed, permissioned action whether a person clicks a
button or an AI agent calls it. Nothing in the admin has a feature a connected agent
can't also use, and nothing exposed to an agent skips the permission and validation
rules a human user would go through.

Concretely, installing and running it looks like:

```
git clone ... && npm install
npx tsx apps/website/src/cli/main.ts init my-site
npx tsx apps/website/src/cli/main.ts serve my-site
# prints two addresses: the site, and its admin.
```

Everything the site owns lives in one folder (`my-site/`): `content.db`, `uploads/`,
`themes/`, `plugins/`.

## 2. Feature inventory

Every row below was checked against the running code (database schema, source files, or both) at
the time of writing, not against planning documents — those drift. Status is one of:

- **Ships** — real, working code and data behind it today.
- **Partial** — real code exists but it's incomplete, off by default, or demo-only.
- **Planned** — named in project backlog documents; no implementation found.

| Feature | What it does | Status |
|---|---|---|
| **Content** | | |
| Posts | Blog-style entries: drafts, publishing, revisions | Ships |
| Pages | Standalone site pages, edited in the same page editor as templates | Ships |
| Media library | Upload, store, and serve images/video/audio/files; generates renditions | Ships |
| Collections | Custom structured content types beyond posts/pages (e.g. a "products" or "events" type), with their own entries and revisions | Ships (newer, less proven than posts/pages) |
| Categories & tags | Hierarchical and flat taxonomy, attachable to any content type | Ships |
| Forms | Form builder: field definitions plus stored submissions | Ships |
| Widgets & regions | Reusable content blocks bound into named layout regions on a page | Ships |
| Redirects | URL redirect rules with status codes and hit-count tracking | Ships |
| Comments | Threaded comments with a moderation queue, built as a bundled plugin | Ships |
| Search | Ranked full-text search (SQLite FTS5 + BM25 ranking) over posts and pages | Ships (posts & pages only — not yet collections) |
| **Marketing** | | |
| SEO | Per-entry metadata overrides, sitemap generation/regeneration | Ships |
| AEO (answer-engine optimization) | Structuring content for AI answer engines | Planned — backlog only, nothing built |
| GEO (generative-engine optimization) | Structuring content/entity data for generative search engines | Planned — backlog only, nothing built |
| Newsletter | Subscriber lists, campaigns, sends, built as a bundled plugin | Ships |
| Members | Site-visitor accounts, tiers, subscriptions, magic-link sign-in | Ships |
| **Front end** | | |
| Themes | Four capability tiers (static / templated / handlebars / declarative) — see §6 | Ships (see §8 for tier-by-tier maturity) |
| **Extensibility** | | |
| Plugins | Install/enable/disable/quarantine runtime for first-party extensions | Ships, small catalog (a handful of first-party plugins today; no third-party or marketplace ecosystem) |
| Agent plugins | Plugins that register additional tools into the assistant's tool catalog | Ships |
| Integrations / External MCP | Tovu connects OUT to third-party MCP tool servers (OAuth, credential storage, tool federation) | Ships |
| MCP (Tovu as an MCP server) | Exposing Tovu's own tools TO an external MCP client (e.g. a desktop AI app) | Planned — only an outbound MCP client exists today; no inbound server |
| WebMCP (browser-agent-operable pages) | Letting a general-purpose browser agent (e.g. Chrome's own) discover and operate actions on a page | Partial — the underlying registration machinery exists but is off by default in the admin and not built at all on the public site yet (decided 2026-09-17) |
| Local CLI coding-agent runtime | The assistant can spawn a real local coding-agent CLI process (Claude Code, Codex CLI, OpenCode, and 21 others via one shared registry) and drive it | Partial, demo-only — deliberately double-gated off in production; not the default operating mode. No dedicated Gemini CLI integration — Gemini only appears as a selectable model inside some other tools (e.g. OpenCode) |
| BYOK (bring-your-own-key) | Server-side API keys for Anthropic, OpenAI, Azure OpenAI, and Google, called in-process | Ships |
| **Publishing & operations** | | |
| Static export & one-shot publish | Exports the rendered site and pushes it to GitHub Pages, Vercel, Netlify, Cloudflare Pages, or any S3-compatible bucket (AWS S3, R2, B2, Spaces, MinIO, etc.) | Ships |
| Continuous deployment | Promotes an existing git commit through a connected GitHub App | Ships |
| Source control | Commits the site's own content/config to a connected git repository | Ships |
| Database | SQLite, one file per site | Ships |
| | Postgres as a second database backend | Planned — only isolated evaluation logic exists; no live adapter |
| Media storage | Local filesystem by default, or an S3-compatible bucket | Ships (both) |
| Users, roles & permissions | Staff/admin accounts under a roles-to-policies permission model | Ships |
| Settings | Typed, versioned settings scoped globally, per-workspace, or per-user | Ships |
| Backups & recovery | Restore points with a guided, reversible restore process | Ships |
| Desktop app | A native (Electron) shell that wraps one Tovu site's admin and site locally | Partial — real and present in this codebase, but its feature completeness relative to the browser experience was not verified in this pass |

Note on the desktop app: some project documentation describes desktop packaging as living entirely
in a separate, sibling product. That is only partly accurate — this codebase does contain a
single-site desktop shell. A separate multi-site manager product is a different, unrelated
application and out of scope for this brief.

### What a theme can actually surface

Most of the table above lives entirely in the admin and never reaches a theme. A theme is
responsible for rendering or linking to a much smaller subset:

- **Rendered directly by theme markup:** posts, pages, media, categories & tags, forms (as an
  embeddable block), widgets/regions, comments (as an embeddable thread), navigation menus,
  newsletter sign-up, and member sign-in/sign-up pages. Collections can be queried and rendered by
  a theme but this is newer and less common in shipped themes today.
  SEO shows up only as metadata in the page `<head>`, never as visible UI.
- **Markup convention only, not a visible feature:** the WebMCP `tool*`/`data-tool*` attributes
  (§7) are something every interactive theme element should carry, but they don't change what
  renders — they change whether an agent can operate it.
- **Never touched by a theme:** redirects, search infrastructure (a theme can host a search box,
  but the ranking/indexing is server-side), plugins, agent plugins, integrations/MCP, the local
  CLI agent runtime, BYOK, the desktop app, publishing/deploy, database/storage choice, users and
  roles (as opposed to members), settings, and backups/recovery. All of these are admin- or
  infrastructure-only and have no theme-facing surface at all.

## 3. Who it's for, and how it's different

Tovu's own positioning is against WordPress, Ghost, Payload, and Directus — general-purpose
CMS/headless-CMS platforms. Per the project's competitive-positioning analysis:

- **Vs. WordPress:** WordPress has an unmatched plugin/theme ecosystem (tens of
  thousands of each) and near-zero training cost, but any plugin is full, untrusted PHP
  execution, and its options/meta model wasn't designed with AI agents editing content in
  mind. Tovu has none of that ecosystem yet, but plugins run against a permissioned,
  typed capability surface rather than arbitrary code trust.
- **Vs. Ghost:** Ghost has a best-in-class minimal writing experience and a mature native
  memberships/newsletter/payments stack. Tovu's equivalents are newer and less
  battle-tested.
- **Vs. Payload (headless, TypeScript-first):** Payload has a config-as-code developer
  experience, live preview, and years of production hardening. Tovu's content-type model
  is comparable in shape but far less proven in production.
- **Vs. Directus:** Directus wraps an *existing* database non-destructively and ships
  mature low-code automation (Flows) and BI dashboards (Insights). Tovu deliberately
  doesn't do either — it owns its own schema and write path so that every mutation is
  revisioned and attributable, which a "wrap any database" model can't guarantee.

The honest self-assessment (informal internal analysis, not an audited claim): Tovu is
ahead on architecture that resists needing a later rewrite — a single write chokepoint
with append-only revisions, a plugin trust model with declared capability tiers, and
structural multi-tenancy — and behind on everything that only comes from years of
production traffic and an ecosystem: ready-made themes and plugins, migration tooling,
community support, and a track record.

**Target user:** small-to-mid site operators, not enterprise buyers — the docs and
decisions consistently favor simplicity over features like SSO or built-in BI dashboards
that would only matter to a larger customer profile.

## 4. The distinctive idea: agent-operable surfaces

This is the one idea a design partner needs to internalize, because it changes what
"finished" looks like for a screen or a page template.

**In the admin:** the interface includes a chat dock (the admin's assistant) that can
act on the same screens a person sees. Interactive elements in the admin are tagged with
`data-agent-element` so an agent driving the browser (or the in-product assistant) can
find and act on them, distinct from a merely-visual label. Every admin capability also
exists as a typed, permissioned tool definition — the landing page describes this as
"one capability, two front doors: built once, exposed twice — a screen a person clicks,
a typed tool an agent calls. Same definitions, same permissions, same validation."

**On the public site:** the same idea is extending outward under the name **WebMCP** — a
browser-native standard that lets a general-purpose browser agent (e.g., Chrome's own
agent) discover and operate actions on a page it's visiting, not just an in-house
assistant. This is a decision made the same day as this brief (2026-09-17) and is not
yet implemented on themes — see §7 for the concrete markup convention a new theme must
support.

**What this is not:** it is not a chatbot bolted onto a normal CMS. There's no separate
"AI mode" — the same button, form, or admin action a human uses is the thing an agent
calls. Design work should treat "can an agent reliably identify and operate this
control" as a real, checkable requirement for admin components and theme forms — on the
same footing as accessibility, not an add-on.

## 5. The surfaces that need design

### 5.1 The public site — themes

The public-facing surface is entirely theme-driven (see §6). A theme is the only thing
that determines the visitor-facing look of a site: header/nav, footer, page layouts,
typography, color tokens, and the handful of "embed" building blocks (menus, widgets,
media, forms, and reusable partials) that a page can drop into its markup.

### 5.2 The admin

The admin is a full dashboard-style application, organized into sidebar groups. Pulled
directly from the current panel registry (`apps/admin/src/panels.tsx`), grouped as
they appear in the sidebar:

- **Ungrouped (top row):** Overview (dashboard), Sites, AI Assistant
- **Content:** Pages, Posts, Media, Collections, Menus, Widgets, Categories & Tags, Forms
- **People:** Users, Authentication, Roles & Permissions, Members, Comments
- **Studio:** Themes, Skills, Design System, Appearance, Playground
- **Add-Ons:** Plugins, Agent Plugins, Integrations
- **Commerce:** Payments, Orders, Products, Subscriptions, Billing
- **Operations:** Database, Recovery, Deployment, Source Control, Secrets, Observability, Activity Log, Import & Export
- **Administration:** Settings, Notifications, Trash
- **Marketing:** SEO & Metadata, Redirects, Newsletter, Analytics

That's roughly 40 distinct panels. Not every panel is equally mature or equally
important to a first design pass (Commerce and Operations, for example, are deep
operator tooling; Content and Studio are what a typical site owner touches daily) — but
a design system for the admin needs to hold together across all of them, including
data tables, forms, editors (page/post editors), a theme file browser/editor, and a
chat dock that can appear alongside any of these screens.

## 6. How theming actually works

This is the section that constrains what a design partner can actually deliver, so it's
worth being precise. A theme is a folder of files; nothing about how it is built,
validated, or served is up for negotiation by choosing a different tool or stack outside
what's described here.

### 6.1 Four theme tiers

A theme declares a `tier` in its manifest (`theme.json`). The tier is a trust/capability
level, not just a stylistic choice — it determines what kind of logic the theme is
allowed to contain:

| Tier | What it is | Logic allowed |
|---|---|---|
| **static** | Plain HTML/CSS/JS pages, no template language. Every byte is what ships. | Full client-side JS |
| **templated** | LiquidJS templates — loops, conditionals, partials | Sandboxed template logic, no JS execution server-side |
| **handlebars** | Same idea as templated, in Handlebars syntax | Sandboxed template logic, no JS |
| **declarative** | Pages are JSON block trees, no template language at all | None — pure data, safest tier, the one an AI agent can edit most safely |

(A fifth value, `code` — trusted, signed plugin JavaScript — exists in the type system
as a reserved slot but is not built yet; there is no code-tier theme today.)

`declarative` is the safest and most restrictive; `static` is the most expressive and
gives an author the least platform-managed help. The homepage summarizes this as "Four
ways to build a front end. A theme declares its tier; the renderer picks the engine.
Plain HTML is first-class, not a fallback."

There is also a **build provenance flag** (`theme.json.build.source`), separate from
tier: a `static`-tier theme can additionally declare `source: "compiled"`, meaning its
files were produced by an external framework build (e.g., Astro, Angular) rather than
hand-authored, with a hash manifest proving integrity. This lets a design system ship as
a real framework build while still running as an ordinary static theme at request time —
but the author (or their CI) does the build; Tovu never runs a framework's build step
itself.

### 6.2 What a theme is made of on disk

Every theme is one folder, named to match its `id` in `theme.json`. The real, currently
shipping shape (verified against `content/themes/static/basic/`):

```
<theme-id>/
├── theme.json           # manifest: id, tier, pages, slots/partials, modes, templates
├── tokens.json           # design tokens for the default color mode
├── tokens.<mode>.json    # optional — e.g. tokens.light.json for a second mode
├── NOTICE.md             # free-text license/attribution notes
├── manifest.webmanifest  # PWA manifest
├── css/
│   └── theme.css         # the one stylesheet the platform loads automatically
├── render/
│   ├── pages/            # one file per route (static tier: raw .html)
│   └── partials/         # nav, footer, and other theme-owned reusable fragments
├── scripts/              # optional JS (forbidden in the declarative tier)
│   └── vendor/           # third-party scripts, kept separate from first-party code
├── assets/               # images, fonts, logos
├── icons/                # favicons and PWA icons
└── screenshots/          # marketplace/preview thumbnails
```

Tokens (colors, spacing, etc.) are a separate JSON file per color mode, not embedded in
CSS — `tokens.json` is the default mode, `tokens.<mode>.json` layers a second mode
(e.g., light) over it. `css/theme.css` is the single stylesheet entry point every theme
must provide; anything else is pulled in via `@import`.

A theme's page can also declare reusable "embed" building blocks in its markup — menus,
widgets, media, forms, other posts, and theme-owned partials — via a
`data-embed-config` HTML attribute holding a small JSON payload. This is how a theme's
own header/nav or footer gets reused across every page without duplicating markup.

### 6.3 What a theme author can and cannot change

- Can fully control: page layout and markup (within the chosen tier's rules), CSS,
  design tokens, fonts, iconography, light/dark mode token sets, JS behavior (static
  tier only).
- Cannot: run a template language that executes arbitrary server-side code (LiquidJS and
  Handlebars are both sandboxed — no filesystem, no eval); ship a `declarative`-tier
  theme with any script at all; bypass the validator's structural rules (approved
  top-level folders, no symlinks, size/file-count ceilings); use the admin-only
  `data-agent-element` attribute in theme markup (a validator rule exists specifically to
  keep the admin's trusted-surface convention out of visitor-facing, eventually
  third-party-authored theme content).

### 6.4 What ships today vs. what's still a target design

A schema migration ("v2") landed for the built-in themes as of 2026-08-18 — the folder
shape and manifest fields described above (`render/`, `partials`, `tokens.json`,
structured `theme.json` fields, `apiVersion: 2`) are the live, currently-enforced shape
for every built-in theme, verified directly against the validator and the files on disk
for this brief. Some adjacent ideas that show up in design discussion are **not** live:
an `ai/` folder for a theme's own agent-capability metadata, a root `AGENTS.md` file for
theme authors, and a `tests/` fixture folder are all named in planning documents but have
zero implementation on disk as of this writing. Treat anything not shown in the folder
tree in §6.2 as aspirational unless you confirm otherwise.

## 7. Constraints and requirements a new theme must honor

- **Agent tagging, decided 2026-09-17 (see `development/todos.md`).** Themes should
  bias toward the WebMCP standard's real declarative attributes now, because agents are
  expected to act on the public site first (as opposed to the admin, which is staying on
  its existing `data-agent-element` convention for now):
  - Forms use WebMCP's actual attributes: `toolname`, `tooldescription`,
    `toolautosubmit` on the `<form>` element, and `toolparamdescription` /
    `toolparamtitle` on its fields.
  - Non-form actionable elements (buttons, links, tabs, etc. — WebMCP has no standard
    attribute for these) use a `data-` prefixed mirror of the same vocabulary:
    `data-toolname`, `data-tooldescription`, and so on. This is a deliberate, adjustable
    house convention, not a web standard.
  - This is a fresh decision; no shipped theme uses it yet, and the theme validator does
    not yet enforce it. A new theme built during this redesign is a natural place to
    establish the pattern.
- **Light/dark mode.** Themes declare which color modes they support and which is
  default (`modes`/`defaultMode` in `theme.json`); tokens for each mode are separate
  files. A new theme should plan for at least two modes from the start, not retrofit one.
- **Accessibility.** Not covered by a dedicated automated gate found in this review —
  treat WCAG-reasonable defaults (contrast, focus states, semantic markup) as an
  unstated but real requirement; confirm current enforcement level with the team rather
  than assuming a specific standard is checked automatically.
- **Validator-enforced structural rules** (`apps/website/src/features/theme/validation/`):
  only approved top-level folders, no symlinks, file-count/size ceilings, every
  manifest-declared file path must exist, `data-embed-config` markers must use the real,
  current type vocabulary, and unknown top-level manifest fields are rejected outright
  (fail-closed) for any theme opting into schema v2.
- **No arbitrary server execution outside the static tier.** If the new theme needs
  real interactivity beyond CSS/JS-in-the-browser, it belongs in the `static` tier;
  `templated`/`handlebars` are sandboxed template languages, and `declarative` is pure
  data.

## 8. Current state, honestly

Themes shipping today (verified on disk, `content/themes/`), all `apiVersion: 2`:

- **static:** `basic`, `basic-2`, `tailark-dusk`, `tailark-quartz-dark`,
  `tailark-quartz-libre` (the built-in catalog), plus `kuinetic-showcase` installed on
  the live tovu-com site but not in the shared built-in catalog.
- **templated (LiquidJS):** `fashion-modern`, `storefront`
- **declarative:** `basic-declarative`
- **handlebars:** no complete example theme found on disk as of this writing, despite
  the tier being real, typed, and advertised on the marketing site. Flag this as a gap
  if a handlebars-tier example matters to the redesign.

What's rough or unfinished, stated plainly rather than oversold:

- The WebMCP/`tool*` tagging convention in §7 is a same-day decision with zero themes
  implementing it and no validator support yet.
- The "code" tier (trusted signed-plugin JS) is a reserved type value with nothing built
  behind it.
- Some manifest fields and folders described in planning documents (`ai/`, root
  `AGENTS.md`, `tests/`) don't exist on any real theme yet — don't design against them.
- The product overall is pre-production: an active, growing codebase with a real commit
  history, but no public release, no third-party theme or plugin ecosystem, and (per the
  project's own competitive analysis) no production track record yet.

## 9. What the owner wants from the redesign — TBD

The owner has asked for a complete redo of the Tovu theme but has not yet specified a
visual direction, target audience feel, or which theme(s) to start from. This is
genuinely open — do not infer a direction from anything above. Questions worth asking
back before starting visual work:

1. Is this a new theme meant to replace the current landing/marketing site (the "basic"
   theme currently serving tovu-com), a new addition to the built-in catalog, or both?
2. Which tier should the new theme target — `static` for full creative control, or
   `templated`/`declarative` if reusability or agent-editability matters more than raw
   expressiveness?
3. Is there a reference aesthetic, competitor site, or existing design system to align
   with, or is this greenfield?
4. Should the new theme be the first to implement the `tool*` WebMCP tagging convention
   from §7 (i.e., does this redesign double as the reference implementation for that
   decision)?
5. Does the admin's visual language need to relate to the new public-site theme at all,
   or are they independent design problems?
6. What's the target device/breakpoint priority — is this desktop-first marketing
   content, or does it need to hold up as a general-purpose site theme across arbitrary
   page types (blog, docs, pricing, etc., per the `basic` theme's current page list)?
