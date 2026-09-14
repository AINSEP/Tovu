# Tovu — Landing Page Content Brief

*A comprehensive content brief for the new marketing/landing page (drafted for design elsewhere). Grounded in the actual codebase — `START-HERE.md`, `package.json`, feature-module source, the assistant's execution-mode code, and an existing unpublished draft landing page already sitting in the content database (`landing-sample-xai-2`). Anything not directly verifiable is flagged rather than asserted.*

---

## Tagline

**Operate your site by talking to it.**

## One-line description

A self-hosted content platform where every admin capability is also a typed tool an agent can call — the same screen a person clicks and the tool an assistant invokes are built from one definition, not two.

---

## What it is

Tovu is a WordPress-style CMS: pages, posts, media, themes, forms, members, comments, redirects, SEO, deployments — the full admin surface a content site needs. The difference is architectural, not cosmetic: **every one of those capabilities is defined once and exposed twice** — as a clickable admin screen, and as a typed, permissioned tool an AI agent can call directly. Ask it to fix a redirect, publish a post, or restyle a page, and it does the actual thing through the same code path the UI uses, not a bolted-on integration that has to be kept in sync by hand.

A site is one folder: a SQLite database, an uploads directory, installed themes, installed plugins. One binary creates it, serves it, and exports it. No separate database server, no container orchestration, no hosted account required to get started.

Two distinct content types exist for two distinct jobs:
- **Posts** — formulaic rich-text documents (TipTap/ProseMirror), the familiar blog-post editing experience.
- **Pages** — bespoke, often AI-generated HTML documents, authored conversationally with region-scoped edits and a live preview, for one-off layouts a rigid post editor can't express.

---

## How the agent-tool architecture actually works

This is the core differentiator, so it's worth explaining precisely rather than as a buzzword.

**"Same definition, two front doors."** Every admin capability in Tovu — creating a redirect, approving a comment, publishing a page, regenerating a sitemap — is implemented once as a typed operation with its own validation and permission check. That single definition is then surfaced through two independent transports:

1. **A UI action** — a button or form field in the admin that a human clicks.
2. **An agent tool** — a callable function (`redirects_create`, `pages_write_html`, `seo_regenerate_sitemap`, `comments_approve_comment`, `members_disable`, `theme_read_file`, `forms_list_submissions`, …) that an AI assistant can invoke, reachable over MCP, HTTP, or CLI.

Because both front doors call the *same* underlying operation, they share the same validation rules and the same permission checks — there's no separate "API surface" that can drift out of sync with what the UI actually allows, and no risk that automation can do something a human operator technically couldn't. The draft landing copy already sitting in this repo puts it this way: *"Built once, exposed twice: a screen a person clicks, a typed tool an agent calls. Same definitions, same permissions, same validation."*

**Why it matters practically:** most CMS platforms bolt automation on afterward — a REST API or plugin layer added years after the admin UI, maintained separately, and prone to gaps (things the UI can do that the API can't, or vice versa). Tovu inverts that: the tool catalog isn't a wrapper around the admin, it's the same code the admin runs on. An operator can describe an intent in plain language — *"the /blog page is 404ing since we renamed it, redirect it to /articles and refresh the sitemap"* — and the assistant calls `redirects_create` and `seo_regenerate_sitemap` directly, with the same guarantees a human clicking through the redirect screen would get.

---

## The 18 capability areas

Each of these is a full admin feature module with its own screens, data model, and matching tool definitions.

| Area | What it actually does |
|---|---|
| **Pages** | Bespoke, often AI-authored HTML documents — structure, routing, and region-scoped conversational edits with live preview. Distinct from Posts (see above). |
| **Posts** | The traditional rich-text content type: drafting, publishing/status workflow, and full-text search over published content. |
| **Media** | Uploads and generated assets — image/video storage, transforms/renditions, and blob lifecycle (including garbage collection of orphaned files). |
| **Themes** | Discovering, installing, switching, and editing theme files across four rendering tiers (below). |
| **Forms** | Form definitions, field schemas, and the submissions that come in through them. |
| **Members** | Member accounts, roles, and access control for gated/member-only content. |
| **Newsletter** | Mailing lists, campaign issues, and the send pipeline that delivers them. |
| **Comments** | Comment threads, spam checking, and moderation workflow. |
| **Taxonomy** | Categories, tags, and general term hierarchies, plus the rules for assigning terms to content. |
| **Widgets** | Reusable content blocks, layout regions, and embeds (media, forms, or other content dropped into a page/theme region). |
| **Redirects** | Redirect rules, HTTP status codes, and hit-count tracking on each rule. |
| **SEO** | Metadata management, per-page overrides, and sitemap generation/regeneration. |
| **Deployments** | Site builds and static export — turning a live site into a deployable static bundle. |
| **Webhooks** | Outbound event delivery to third-party endpoints when things happen in the CMS. |
| **External MCP** | Connecting third-party MCP tool servers so the assistant can call tools that live outside Tovu itself. |
| **Credentials** | Stored secrets (API keys, tokens, vendor/publish credentials) — sealed at rest, not plaintext. |
| **Recovery** | Restore points and rollback — undoing a bad change without restoring from an external backup tool. |
| **Plugins** | Bundled and installed extensions that add their own data modules and admin surfaces (Comments and Newsletter are themselves built as plugins on this same contract). |

*(One nuance worth noting for accuracy: some of these — Media, Members, Taxonomy, Presentation — are implemented as shared library modules re-exported into Tovu rather than Tovu-only code, so the same domain logic can back more than one host product. Doesn't change what they do for a Tovu site; noted for anyone drafting technical copy.)*

---

## The four theme tiers — what each is for

A theme declares which tier it is; the renderer picks the matching engine automatically. This isn't a hierarchy of "better to worse" — it's a tradeoff between how much power a theme has and how safely it can be installed from someone else.

| Tier | Engine | What it's for | Who'd pick it |
|---|---|---|---|
| **Static** | Plain HTML + CSS + JS | What you write is exactly what ships — no templating layer, no build step to reason about. | Anyone who wants full control and is comfortable hand-authoring markup, or an AI agent generating a bespoke one-off page. |
| **Templated** | LiquidJS | Loops, conditionals, and partials — reusable structure across many pages without a full programming environment. | Sites with repeating layouts (blog listings, product grids) that still want a constrained, safe templating language. |
| **Handlebars** | Handlebars | The same templating idea as above, in a different syntax — for teams or theme authors who already know Handlebars from elsewhere. | Anyone porting existing Handlebars templates or with an existing preference for that syntax. |
| **Declarative** | JSON block trees | No template language at all — page structure is data (a tree of typed blocks), which means an agent can edit it programmatically and safely without risking arbitrary code execution. | The highest-trust-required case: themes meant to be edited by an AI agent (or a non-technical operator) without any risk of breaking the page structure. |

The practical safety story: a **Static** or **code-based** theme can run arbitrary JavaScript, so you install one the way you'd add a dependency — from an author you trust. A **Declarative** theme structurally *cannot* do that, so it's safe to install from a stranger without a second thought. (This distinction is drawn directly from the codebase's own seed documentation.)

---

## Who this is for

Grounded in what the product actually does, not invented personas or testimonials:

- **People who want an AI agent to actually operate a site**, not just draft copy for a human to paste in — the tool-call architecture is the point, not a bolted-on chat widget.
- **Developers who want a CMS that's a Node/TypeScript codebase they can read**, not a PHP plugin ecosystem with an opaque security surface.
- **Anyone who wants zero hosting setup to start** — a site is a folder on disk with its own SQLite file; there's no database server to provision before you can begin.
- **People who want a real rollback mechanism built in** (restore points), rather than relying on a separate backup plugin or manual database snapshotting.
- **Theme authors/agents who want a safe-by-construction editing target** — the Declarative tier exists specifically so a page's structure can be edited programmatically without a templating language in the way.

*(No user counts, adoption numbers, or customer quotes exist to cite here — flagging explicitly rather than inventing any, per the brief.)*

---

## Pricing: Local CLI mode vs. BYOK

Tovu's assistant supports two execution modes, and the distinction is the whole pricing story:

- **Local CLI mode (default).** The assistant drives a code-agent CLI already installed on your machine — Claude Code, Codex, or Gemini (via `agy`) — using the subscription/usage allowance you already have for that CLI. There is **no separate metered AI API bill from Tovu** on top of that: if you already pay for one of these coding-assistant subscriptions, running Tovu's assistant through it doesn't cost anything additional beyond what you already pay. This is the literal meaning of "effectively free with your AI credits" — it's not a discount, it's that Tovu doesn't introduce a second AI bill at all.
- **BYOK mode (bring your own key).** For operators who'd rather point the assistant at a model endpoint directly with their own API key (Anthropic, OpenAI, Azure, or Google-shaped endpoints are all supported), rather than going through a locally installed CLI. This is metered by the provider in the normal way — it's the alternative for anyone without a CLI subscription, or who wants a specific model/provider Local CLI mode doesn't expose.

*(Flagging for accuracy: the phrase "desktop AI credits" is language from a separate sibling application outside this repo's scope, and wasn't independently verified as part of this research — the above is grounded strictly in what this repo's code proves about how the two execution modes bill.)*

---

## Tovu vs. WordPress

| | WordPress | Tovu |
|---|---|---|
| **Core language/runtime** | PHP | TypeScript/Node.js |
| **Plugin security surface** | Any installed plugin can execute arbitrary PHP with full server access — a large, historically frequent attack surface | Themes declare a tier; only Static/code themes run arbitrary JS, and that's an explicit, disclosed trust decision — Declarative themes structurally cannot execute code at all |
| **Hosting/setup to start** | Needs a web server + MySQL/MariaDB database provisioned before install | A site is one folder with its own SQLite file — `npm install`, `init`, `serve` |
| **Automation/API** | REST API and plugin hooks added on top of a UI-first admin, historically prone to drift from what the UI can do | Every capability is one definition exposed as both a UI action and an agent tool — no separate surface to drift |
| **AI integration** | Bolted on via third-party plugins calling an external API | Native: the admin *is* a tool catalog; Local CLI mode needs no separate AI subscription at all |
| **Rollback** | Typically a separate backup plugin | Built-in restore points |
| **Ownership** | Self-hostable, but commonly run on managed/hosted plans (WordPress.com, managed hosts) with recurring fees | Self-hosted by default, single binary, single folder — no hosted-plan lock-in |
| **Extensibility model** | Enormous plugin ecosystem (a real strength) | Smaller but structurally consistent plugin contract (Comments and Newsletter are themselves built as plugins on the same contract other extensions use) |

*(Deliberately not claimed: that WordPress isn't open-source — it is. The comparison above is about architecture and operational model, not licensing.)*

---

## Architecture & technical notes (for the design brief, not necessarily page copy)

- **Self-hosted, single-binary.** One `tovu` binary can create, serve, and export a site.
- **One folder per site.** `content.db` (SQLite) + `uploads/` + `themes/` + `plugins/` + `skills/` + `theme.json` — everything for one site lives in one place.
- **Modular monolith.** Feature areas (Pages, Posts, Media, etc.) are separated modules with enforced boundaries, not a tangle of includes — several (Media, Members, Taxonomy, Presentation) are shared library code re-exported into Tovu so the same logic can back more than one product.
- **Typed end-to-end.** TypeScript, strict mode, Zod validation at boundaries.
- **Restore points.** Rollback is a first-class recovery feature, not an afterthought.
- **License.** Apache-2.0.

---

## Get started (from the repo's own quickstart)

```bash
git clone <your-repo> && cd Tovu
npm install
npx tsx apps/website/src/cli/main.ts init my-site
npx tsx apps/website/src/cli/main.ts serve my-site
# prints two addresses: the site, and its admin.
```

Requirements: Node.js 24+, git, npm — nothing else. No Docker, no database server, no signup, no account, no hosted plan. The repo's own draft landing copy estimates roughly ten minutes from an empty folder to a published post.
