# Tovu Admin — Detailed Sitemap

Date: 2026-07-05
Companion to: `admin-section-architecture-outline.md` (backend structure analysis).
Grounded in: current `tovu/src/admin-shell/navigation.ts`, `features/presentation`,
target sidebar screenshots (`screen-9-admin.png`, `screen-6-themes.png`,
`lab-gold-brown-luxe.png`), and cross-cutting patterns from
`OSS-Repos/open-design/apps/web/src` + the seven CMS admin graphs.

This doc defines **what the admin is** (the map), not how each screen is built.
It supersedes the flat WordPress-shaped menu currently in `navigation.ts` (see §7
Delta) and adopts the grouped taxonomy in the screenshots.

---

## 1. Two planes — keep them separate everywhere

The word "theme" (and much of the admin) means two different things. Nothing in
the sitemap should blur them.

| | **Site plane** (published) | **App/chrome plane** (operator) |
|---|---|---|
| Who sees it | site visitors | the person running the admin |
| Theme concept | site theme: `paper` / `atlas` / `glassmorphic` | app skin: "Editorial Luxe" + light/dark/system |
| Owned by | `features/presentation` (server, workspace-scoped) | shell-local theming layer (§6, new) |
| Persisted in | workspace presentation settings (ADR-007 scoped) | app/user settings, **not** workspace |
| Edited under | **Design & System → Appearance** | top-bar theme toggle (the sun/monitor/moon in screenshots) |
| Example | changing how `leons-sportshop.com` looks | changing how the Tovu desktop app looks |

Rule: the top-bar light/dark/system toggle and the app skin are **never** a
workspace setting. Appearance (the section) edits the *site*; the toggle edits the
*chrome*. Two people in the same workspace can run different chrome themes.

---

## 2. Navigation frame — three surfaces

The screenshots show three distinct nav surfaces; the sitemap lives mostly in (B).

**(A) App rail** — the far-left vertical icon strip (Tovu mark + home / projects /
globe / …). App-level, *spans projects*. Not part of a single site's admin. Items:
`Home`, `Projects`, `Explore/Marketplace`, `Activity`, `Account`. Out of scope for
this sitemap except that the project admin mounts inside it.

**(B) Section sidebar** — the wide grouped list (`Overview` + Content / People /
Marketing / Design & System). **This is the admin sitemap.** Scoped to one
project/workspace. Defined in §3.

**(C) Top bar** — context + actions for the current project:
`Projects ↩` · workspace identity (`Leon's Sportshop — Backend · Marketplace`) ·
publish status pill · **theme toggle (chrome plane, §6)** · `View site` · `Deploy`.

---

## 3. The sitemap (section sidebar)

Legend — **Status**: `Live` (exists today) · `Build` (next up, backing feature
partially exists) · `SOON` (stubbed nav entry, no backend yet — matches the `SOON`
badges in the screenshots). **Plane**: `content` (descriptor-derived) /
`control` (hand-written, security-critical) — see outline §6.

### Overview  `/admin`  · Live · content
Dashboard landing. Stat cards (Published pages, Drafts, Page views/30d, Avg build
time), recent-activity feed, and the inline **"Ask Tovu to edit this site"** prompt
bar (AI entry point, present on every list too).
- Backing: aggregate read queries over `features/*` + `core/events` outbox.
- Permission: `admin.dashboard.read`.

### CONTENT
| Item | Route | Status | Plane | Backing feature | Permission | Notes |
|---|---|---|---|---|---|---|
| Pages | `/admin/pages` | Build | content | `features/page` (new, mirrors `post`) | `admin.pages.*` | List: search, All/Published/Drafts filter, columns Page·Status·Template·Author·Updated, row `⋯`, **New page**. Templates: Landing/Collection/Dynamic/Standard/Form/Accordion. |
| Posts | `/admin/posts` | Live | content | `features/post` | `admin.posts.*` | Routes exist: `admin/v1/posts` list/get/update. Editor at `/admin/posts/:id`. |
| Media | `/admin/media` | Build | content | `features/media` (new) | `admin.media.*` | Library grid + upload. Export-as-image (PNG/JPEG/WebP) is a media concern. |
| Collections | `/admin/collections` | Build | content | `features/collection` (new) | `admin.collections.*` | Directus-style user-defined content models (see §5 data-model note). |
| Menus | `/admin/menus` | SOON | content | — | `admin.menus.*` | Site navigation builder. |
| Categories & Tags | `/admin/taxonomy` | SOON | content | `features/taxonomy` | `admin.taxonomy.*` | Shared taxonomy across posts/pages. |
| Forms | `/admin/forms` | Build | content | `features/form` (new) | `admin.forms.*` | Form builder + submissions inbox. |

### PEOPLE
| Item | Route | Status | Plane | Backing feature | Permission | Notes |
|---|---|---|---|---|---|---|
| Users | `/admin/users` | Build | control | `features/identity` (new) | `admin.users.*` | Operators/admins of the workspace. Hand-written (security-critical). |
| Roles & Permissions | `/admin/roles` | SOON | control | `core/permissions` (new, Strapi-style named actions) | `admin.roles.*` | Editor for the same action registry the whole admin is gated on. |
| Members | `/admin/members` | SOON | control | `features/membership` | `admin.members.*` | End-users/subscribers of the *site* (distinct from operators). |
| Comments | `/admin/comments` | SOON | content | `features/comment` | `admin.comments.*` | Moderation queue. **Stale as of ADR-031 (2026-07-10, Tier-3 bundled-plugin decision) — see reconciliation note below the table.** |

> **Comments reconciliation (SPEC-035, 2026-07-16):** the row above predates ADR-031's §3.5
> placement decision and its `features/comment` / `admin.comments.*` backing-feature column is
> stale. Comments is a **Tier-3 bundled plugin**, not core content — it lives at `src/comments/`
> (repo, ingress policy, write-service, settings, hooks), not `features/comment`. Its permission
> catalog is the flat `comments.*` strings registered in `identity/permissions.ts` (`comments.read`,
> `.moderate`, `.reply`, `.delete`, `.delete.force`, `.submit`, `.configure`), not `admin.comments.*`.
> See ADR-031 (`ADR-031-comments.md`) for the full placement rationale and OQ-2's original flag.
> This is a documentation-only correction — the row is left in place (not restructured into the
> CONTENT/PEOPLE/MARKETING grouping this doc otherwise uses) since Comments' actual admin-surface
> UI (the origin-isolated moderation panel, ADR-025) is still unbuilt — see ADR-031's v1 backend
> status note for what's shipped (the HTTP/backend surface) vs. still blocked (the UI).

### MARKETING
| Item | Route | Status | Plane | Backing feature | Permission | Notes |
|---|---|---|---|---|---|---|
| SEO & Metadata | `/admin/seo` | SOON | content | `features/seo` | `admin.seo.*` | Per-entity meta + site defaults; sitemaps/robots. |
| Redirects | `/admin/redirects` | SOON | control | `features/redirects` | `admin.redirects.*` | URL map; touches routing → control plane. |
| Newsletter | `/admin/newsletter` | SOON | content | `features/newsletter` | `admin.newsletter.*` | Broadcasts to Members. |
| Analytics | `/admin/analytics` | SOON | content | read-only over events/provider | `admin.analytics.read` | The "Page views / Avg build time" numbers, expanded. |

### DESIGN & SYSTEM
| Item | Route | Status | Plane | Backing feature | Permission | Notes |
|---|---|---|---|---|---|---|
| Appearance | `/admin/appearance` | Live | content | `features/presentation` | `admin.presentation.*` | **Site** theme switch (`paper`/`atlas`/`glassmorphic`) + preview. Sub: Themes, Editor, Fonts. Routes exist: `admin/v1/presentation` get + patch-active-theme. |
| Plugins | `/admin/plugins` | SOON | control | future (ADR-003/004) | `admin.plugins.*` | Installed + marketplace. Registry-based extension (WordPress lesson). |
| Database | `/admin/database` | SOON | control | `headless`/data layer | `admin.database.*` | Schema/data browser (Directus admin-as-DB-client idea). |
| Integrations & API | `/admin/integrations` | SOON | control | `features/integrations` | `admin.integrations.*` | API keys, webhooks, provider connections (mirrors open-design `providers/`). |
| Backups | `/admin/backups` | SOON | control | `core` ops | `admin.backups.*` | Export/restore. |
| Settings | `/admin/settings` | Build | control | `features/workspace` | `admin.settings.*` | General/Writing/Reading/Discussion + i18n locale defaults (§5). |

---

## 4. URL model

- **Admin UI**: `/admin/<section>[/<id>]` — flat, section == sidebar key.
- **Admin API**: `/admin/v1/<resource>[/...]` (versioned; already how `posts` and
  `presentation` are mounted). Each resource = a folder under
  `server/routes/admin/` per the outline's Medusa-style layout.
- **Content plane** resources derive both their `/admin/v1/<resource>` routes and
  their sidebar entry from one descriptor in `server/routes/admin/registry.ts`.
  **Control plane** resources are hand-written folders.
- Nav is generated from the resource registry + a section/group registry, not
  hard-coded per screen (extends today's `buildAdminMenuEntries`).

---

## 5. Cross-cutting concerns to design in now (from open-design + the CMS graphs)

Things that are cheap to bake into the map and expensive to retrofit:

1. **i18n (the one you flagged).** open-design ships **18 locale files**
   (`src/i18n/content.*.ts` + `locales/`, RTL for `ar`/`fa`) with a typed content
   dictionary and separate `plugin-content.ts` / `runErrors.ts` namespaces.
   Implications for the admin: (a) admin **chrome strings** need a dictionary from
   day one — don't inline copy; (b) **site content** is itself translatable, so
   Pages/Posts/Collections need a locale dimension (Payload/Strapi treat locale as
   a first-class field). Decision needed: is Tovu admin localized, site content
   localized, or both? Recommend: admin chrome = yes (dictionary), site content =
   later but reserve a `locale` axis on content entities now so it isn't a
   migration. Add **Settings → Languages** for locale defaults + RTL.
2. **Observability.** open-design has explicit `observability/` detectors
   (`white-screen`, `stuck-run`, `boot-timing`, `long-task`). The admin should
   surface a **System/health** read (already have `core/events` outbox + an
   `ops/` health route) — fold into Overview + a future System panel rather than a
   separate top-level section.
3. **Provider/integration registry.** open-design's `providers/registry.ts`
   (anthropic/openai/google/ollama/…) is the model behind **Integrations & API**.
   Same registry shape; keep provider config server-side and serializable.
4. **Design tokens.** open-design centralizes look in `styles/tokens.css` +
   `primitives.css`. This is the seam the chrome-theme abstraction (§6) plugs into.
5. **Permissions as named actions** (Strapi). Every row in §3 already carries an
   `admin.<resource>.<verb>` action. The **Roles & Permissions** screen edits this
   registry; one middleware enforces it (outline §4). Don't check perms inline.
6. **Descriptor → MCP tool** (Strapi's derive-content-type-mcp-tools). The same
   content-plane descriptor that mounts `/admin/v1/posts` and its nav entry should
   also derive the agent-facing tool behind the "Ask Tovu to edit this site" bar.
   This is the highest-leverage line for an AI-native CMS; reserve it in the
   registry shape even if not built first.

---

## 6. Chrome-theme abstraction layer (bullet 4)

Goal: let the operator swap the desktop app's own look (image 3 shows an
"Editorial Luxe" skin + light/dark/system toggle), independent of the site theme.

**Shape** — a shell-local theming layer, not a workspace feature:

```
tovu/src/
  shell-theme/                      # NEW — app/chrome plane only
    tokens/                         # named skins as token sets
      editorial-luxe.ts             #   the gold/brown luxe skin in the screenshot
      <skin>.ts                     #   each skin = { color, type, spacing, radius } tokens
    modes.ts                        # light | dark | system resolution
    registry.ts                     # available skins (id, label, preview swatch)
    resolve.ts                      # (skinId, mode, systemPref) -> CSS custom properties
    persist.ts                      # read/write app-user setting (NOT workspace)
    INFO.md __tests__/
```

**Principles**
- A skin is **data** (a token set), rendered by emitting CSS custom properties onto
  a root — same seam as open-design `styles/tokens.css`. Adding a skin = adding a
  token file to the registry, no component changes.
- `mode` (light/dark/system) is orthogonal to `skin`; the toggle sets `mode`, a
  skin picker sets `skinId`. `system` follows OS preference.
- Persisted per app-user (local/app settings), so it survives across projects and
  never leaks into workspace/site data.
- Components consume tokens (`var(--...)`) only — never a skin id directly — so the
  same component tree renders any skin. This is the "abstraction layer" you asked
  for: one contract (token names), many skins behind it.
- Mirrors the site plane's own indirection: `features/presentation` already treats
  the *site* theme as a validated id with shell-local renderers; §6 is the same
  discipline applied to the *chrome*.

**Not** in scope of `features/presentation` — keep INFO.md's rule ("theme renderers
remain shell-local") true by putting chrome skins in `shell-theme/`, site themes in
`presentation`.

---

## 7. Delta from current `navigation.ts`

The existing menu is a WordPress.com-flavored flat list with product-chrome promo
entries (`My Home`, `Stats`, `Hosting`, `Jetpack`, `Upgrades`, upgrade promo). To
reach the screenshots:

- **Introduce groups**: `Overview` (standalone) + `Content` / `People` /
  `Marketing` / `Design & System`. Today's model has links + separators but no
  named group headers — add a `group` concept to `AdminMenuDefinition`.
- **Drop the WordPress.com promo/product entries** (`upgrade-promo`, `my-home`,
  `stats`, `hosting`, `upgrades`, `jetpack`, `feedback`) — not in the target.
- **Add SOON badges** as a first-class nav state (screenshots show `SOON` pills);
  today only `badge?: string` exists — reuse it or add `status: 'live'|'soon'`.
- **Re-home sections**: `tools` → folds into System/Backups/Database;
  `comments` → People; `appearance` stays but is explicitly *site plane*.
- **New sections** to add as entries (SOON where no backend): Pages, Collections,
  Menus, Categories & Tags, Forms, Roles & Permissions, Members, SEO & Metadata,
  Redirects, Newsletter, Analytics, Database, Integrations & API, Backups.
- Keep `buildAdminMenuEntries` framework-agnostic (it already is); groups + status
  flow through the same blueprint→entry mapping.

---

## 8. Open questions (need a call before building)

1. **i18n reach** — admin chrome only, or site content too (adds a `locale` axis to
   content entities)? Recommend chrome now, reserve content-locale axis.
2. **Members vs Users** — confirm the split: Users/Roles = operators; Members =
   site subscribers. Screenshots list both, implying yes.
3. **Collections vs Pages/Posts** — are Pages/Posts special-cased content types, or
   the first two rows of a general Collections model (Directus-style)? Recommend
   Collections as the general model with Pages/Posts as built-in collections.
4. **Chrome skins scope** — is "Editorial Luxe" one of several shipped skins, or a
   user-authorable theme? Recommend: ship a few named skins first (§6 registry),
   author-your-own later.
5. **Build order** — proposed: Pages (mirror Posts) → chrome-theme layer (§6, small
   and unblocks the toggle) → Media → permissions/Roles → the rest as SOON→Build.
