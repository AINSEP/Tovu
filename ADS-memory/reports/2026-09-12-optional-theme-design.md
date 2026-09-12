# Optional theme support — design proposal

- **Date:** 2026-09-12
- **Branch surveyed:** `restructure/apps-website-phased` (HEAD `f5e695c1`)
- **Status:** SURVEY + PROPOSAL. Nothing implemented. Read-only throughout.
- **Scope:** `apps/website`, `apps/admin`, and the theme system. **NOT** `apps/desktop`.

---

## The owner's requirement

> "I want the ability for theme section... I want the ability to not have a theme at all. It should
> default to a basic/default theme, but then we cannot have a theme active specifically in case
> someone just wants to handle theming themselves."

Read as three states where today there are fewer:

1. A theme is active — today's normal case.
2. Nothing chosen → falls back to a basic/default theme.
3. **No theme active, deliberately** — the site renders with no theme applied, because the operator
   intends to handle styling themselves. This is the new capability.

**Finding: today there are 1.5 states, not 2.** State 3 is impossible, and state 2 is a fiction —
see "The named default" below.

---

## Read this first: the framing rule

> **`fallbackSiteBody` and its helpers were written as a safety net nobody would see. State 3
> promotes them to the primary output for an entire class of site.**

Every string, link, and default on that path was "good enough for an edge case." Under state 3 an
operator ships it as their public website. **Anything on that path must now be re-read against "an
operator is shipping this," not against "this only appears when a theme is broken."**

The four defects in "Build scope" below are *instances*. The rule is what matters — a later agent
will find more, and should treat finding more as expected rather than as a surprise.

The sharpest instance, and the one that shows the pattern: **`SITE_TITLE` is the hardcoded literal
`"Tovu Demo Site"`.** It is invisible today because a static theme owns its own document and
`pageShell` suppresses its own `<title>` whenever the SEO fold emits one — so the literal sits there
costing nothing. Turn the theme off and it becomes visible body text in three places on every page.
An operator who disables the theme to write their own CSS discovers their site calling itself
"Tovu Demo Site". **A value that is correct only because nobody can see it is not correct.**

---

## 1. Sequencing — two shippable pieces

### Piece 1 (ship first): the named default theme

Independent of the owner's request, fixes a real latent bug, cheaper, and a **prerequisite** for
testing piece 2.

**The bug.** `apps/website/src/features/theme/active-theme.ts:45-49`:

```ts
export function resolveActiveTheme(deps: ActiveThemeResolutionDeps, activeThemeId: string): DiscoveredTheme | null {
  const active = findTheme({ themes: deps.themes, id: activeThemeId });
  if (active && active.status === "valid") return active;
  return deps.themes.find((t) => t.status === "valid") ?? deps.themes[0] ?? null;
}
```

`deps.themes.find(valid)` takes the first valid theme **in discovery order**, and discovery sorts by
id — `features/theme/theme.ts:1268`:

```ts
return [...topLevel, ...engineThemes].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
```

So "the default" is *whatever theme sorts first alphabetically*. On `sites/tovu-com` the on-disk set
is `basic`, `basic-2`, `basic-declarative`, `fashion-modern`, `kuinetic-showcase`, `storefront`,
`tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre` — `basic` wins **by coincidence of
naming**. Install a theme called `aurora` and it silently becomes the default for every site that
falls through.

The codebase already documented this and routed around it instead of fixing it —
`server/runtime/configuration/seed.ts:313-319`, verbatim: *"a fresh workspace's active theme silently
fell through `resolveActiveTheme()`'s fallback to whatever the alphabetically-first valid discovered
theme happened to be, **making the real default effectively arbitrary**."*

**Where the constant is declared.** `features/theme/theme.ts`, alongside `THEME_TIERS` /
`ENGINE_SUBFOLDERS` / `THEME_CATALOG_DIR`, re-exported from `features/theme/index.ts`:

```ts
/** The stock theme a site falls back to when its configured theme id no longer resolves.
 *  A NAME, not a position: discovery sorts by `id.localeCompare`, so "first valid" silently
 *  changes the default the moment a theme sorting before this one is installed. */
export const DEFAULT_THEME_ID = "basic";
```

It must live in `features/theme`, **not** `features/presentation` — for the measured reason
`features/presentation/active-theme-id.ts:8-20` gives for its own split: `features/presentation` is
inside the pre-existing 36-module SCC and `features/theme` is not. A constant consumed by
`resolveActiveTheme` must not create that edge.

**Resolution becomes three steps.** Step 3 is today's behaviour, kept deliberately, so this change
can never make a site render *less* than it does now:

```ts
const active = findTheme({ themes: deps.themes, id: activeThemeId });
if (active && active.status === "valid") return active;                         // 1. configured
const fallback = findTheme({ themes: deps.themes, id: DEFAULT_THEME_ID });
if (fallback && fallback.status === "valid") return fallback;                   // 2. NAMED default
return deps.themes.find((t) => t.status === "valid") ?? deps.themes[0] ?? null; // 3. unchanged
```

**Behaviour change for real sites: none.** `basic` sorts first on `tovu-com` and is the seeded value
everywhere else, so step 2 returns exactly what step 3 returns today. The change is additive — it
inserts a deterministic step in front of an arbitrary one and removes nothing.

**Observability.** Step 2 firing means the configured theme is gone; step 3 firing means `basic` is
gone too. Both warrant a one-time `console.warn` naming the ids, matching the existing convention at
`static-render.ts:623` and `:636`.

**What happens to `seed.ts:312-320`'s hardcoded workaround:**

- The `"basic"` **literal** goes → `activeThemeId: DEFAULT_THEME_ID`. Today the seed's literal and
  the resolver's implicit winner are two independent facts that happen to agree; one constant makes
  disagreement impossible. That is the actual defect being closed.
- The **workaround comment** (`:313-319`) is replaced. It documents a bug that no longer exists;
  leaving it creates a false comment of exactly the kind already in the register.
- **Writing an explicit row stays.** A fresh site should land in state 1 (default theme explicitly
  active) so the admin shows "basic — Active", not an ambiguous blank card. State 2 is for degraded
  and legacy rows, not new installs. Seeding no row would make every fresh site permanently
  indistinguishable from a broken one.

### Piece 2: the no-theme sentinel

**Storage: `active_theme_id = ""`.**

| State | Stored | Resolves to |
|---|---|---|
| 1 — theme active | `"basic"` | that theme |
| 2 — nothing chosen | no row, or an id that no longer resolves | the named default (piece 1) |
| 3 — deliberately none | `""` | `"none"` — no fallback, no substitution |

**Sentinel over nullable, on evidence:**

- The column is `TEXT NOT NULL` on **both** dialects (`platform/db/schema.ts:189`,
  `schema.postgres.ts:922`). `""` needs **zero DDL**; a nullable needs a migration on SQLite *and*
  Postgres.
- The settings-ledger mirror's schema is `{ type: "string" }` with no enum
  (`features/settings/migration.ts:120`). `""` round-trips; `null` would fail validation and log
  from `:200`'s catch on **every boot**.
- `""` is already the in-code spelling for "no theme id": `resolveActiveThemeId` returns it
  (`features/presentation/active-theme-id.ts:55`), and the admin already special-cases it —
  `isStrandedActiveTheme` reads `settings.activeThemeId !== "" && …`
  (`apps/admin/src/features/themes/rules.ts:36`).

**`resolveActiveTheme` must become three-way — `DiscoveredTheme | "none" | null`.** Overloading the
existing `null` routes "deliberately themeless" straight into `sendNoThemesInstalled`'s 500
(`pages.ts:1034`), which is precisely the defect class this repo keeps producing.

**One authority, one mirror.** `presentation_settings` is authoritative at render time. The settings
ledger's `core.presentation.activeThemeId` is a **write-only mirror**: `features/settings/migration.ts:226`
copies rows in on every boot and **nothing reads it back** — `features/post/reverters.ts:16-20`
confirms the reverter that would have was forward-reserved and never built.

**Migration: zero DDL, zero row changes, zero behaviour change for any existing site.** `""` is
currently unreachable through the API (the PATCH rejects it 400), so no stored row can already be
sitting on the sentinel. The only migration-shaped work is a guard at
`features/settings/migration.ts:171` so `""` is never registered as the ledger default for fresh
workspaces.

---

## 2. The Jini seam — one line, and the comment that must ship with it

**This is a Tovu-only feature. No Jini edit, no `pnpm publish`, no version bump.**

Jini's write validation is **caller-supplied**, by design —
`/Users/la/Programming/Jini/packages/cms/src/presentation/presentation.ts:91-96`:

```ts
const allowed = deps.availableThemeIds ?? ALLOWED_THEME_IDS;
if (!allowed.includes(input.activeThemeId)) {
  throw new PresentationSettingsValidationError(`theme '${input.activeThemeId}' is not supported`);
}
```

That module's own header (`presentation.ts:3-10`) states the intent: *"Deliberately theme-engine
agnostic: this module validates an `activeThemeId` against a set of ids the caller supplies… a host
owns theme discovery and passes the resulting ids in."* Using the seam as documented is not a
workaround.

Tovu already supplies the list, so the change is to append the sentinel at
`apps/website/src/server/inbound/admin-http/routes/presentation/patch-active-theme.ts:77`.

### The asymmetry — and why a DRY pass must not merge these

The two call sites are **character-for-character identical**, same expression, same field name, same
import, in sibling files under one directory:

```
patch-active-theme.ts:77    availableThemeIds: validThemeIds(deps.themes),
get.ts:44                   availableThemeIds: validThemeIds(deps.themes),
```

**They are not the same thing.** `patch-active-theme.ts:77` is the **write allowlist** — what a
caller is permitted to store. `get.ts:44` is the **read catalogue** — it is echoed to the client as
`AdminPresentation.availableThemeIds` and feeds the admin's theme picker.

If the sentinel is added to `get.ts:44`, or if the two are hoisted into one shared call, the admin
theme picker grows a blank card. **Nothing would fail** — no type error, no test, no gate. An agent
asked to reduce duplication in `routes/presentation/` merges them with no reason visible not to.

**Required, both ends:**

- At `patch-active-theme.ts:77` — name the value (e.g. `writableThemeIds(deps.themes)`) rather than
  inlining `[...validThemeIds(deps.themes), NO_THEME_ID]`, and comment that the sentinel is accepted
  here **because this is the write allowlist**.
- At `get.ts:44` — comment that this one is **deliberately NOT the write allowlist**: it is echoed to
  the client and feeds the picker, so the sentinel must never appear here.

A comment only where the sentinel lives explains the addition but not the asymmetry, and the site
that breaks is the one with nothing written on it. **Both ends, or the note does not do its job.**

### The value survives the whole journey, not just the gate

Verified hop by hop — this is the check that distinguishes "the front door opens" from "the value
arrives intact":

| Hop | File | Behaviour with `""` |
|---|---|---|
| write validation | Jini `presentation.ts:91-96` | caller-supplied allowlist — passes once `""` is in it |
| record type | Jini `presentation.ts:24` | `activeThemeId: string` — plain, not a union or branded type |
| memory repo | Jini `repo.memory.ts:14-22` | array assignment, no coercion |
| sqlite repo | `features/presentation/repo.sqlite.ts:20-26, 35-44` | bare `as ThemeId` cast, upsert, no coercion |
| column | `platform/db/schema.ts:189`, `schema.postgres.ts:922` | `TEXT NOT NULL`, **no CHECK, no FK**, both dialects |
| read | Jini `presentation.ts:69-84` | **no validation** — returns whatever the repo holds |
| response mapper | `admin-http/http/presentation.ts:12-22` | field copy |

No layer rejects, rewrites, or normalises it. Because Jini does not change, the local symlinks
(`node_modules/@jini-ai/cms -> ../../../Jini/packages/cms`) are irrelevant: no `dist` rebuild, no
cross-repo test dance. Scoped Tovu tests from the repo root suffice.

---

## 3. The four document producers

The theme split is on a **different axis** from the known live / Preview-iframe / GrapesJS triad
(`reference_tovu_three_render_paths_diverge`), which is about a Page's *body HTML*. This axis is
**who owns the `<html>` document**. Both are true at once.

### Family A — theme supplies CSS only; Tovu owns the document

`renderSite` (`render.ts:2943`) → `pageShell` (`:2673`). Tiers `declarative`, `templated`,
`handlebars`. The theme contributes **exactly four things** (`:2700-2701`): `fontLink(theme)`,
`tokensToCss(theme.tokens)`, `theme.css`, `data-theme="<id>"`. Doctype, `<head>`, charset, viewport,
title, the SEO `extraHead` fold, `BASE_STYLE` and the site-assistant mount are all Tovu's and read no
theme. `buildSiteRenderContext` (`:2810`) extracts only `themeName`, a string — **no `DiscoveredTheme`
reaches any body renderer.**

**Producer 1 — `renderSite`, routes `home` / `post` / `products` / `product`.**
Coherent output: **yes.** Falls to `fallbackSiteBody` (`:2846`) — the same path it already takes for
any theme missing a template. Serves a complete, valid, unstyled document with every styling hook
present: `.site-header`, `.wordmark`, `.site-nav`, `.wrap`, `.entry-list`, `.entry`, `.entry-title`,
`.entry-meta`, `.prose`, `.site-footer`. SEO fold, media resolution and embed substitution all still
run, because none of them read the theme.

This is the one case where the markup decides something, so it is recorded in full — it is what an
operator who wants to write their own CSS actually receives for `GET /`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tovu Demo Site</title>
<!-- extraHead: canonical / OG / title from page-head — unchanged, reads no theme -->
<style>
  *,*::before,*::after { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; height: auto; }
  a { color: inherit; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
</head>
<body>
<div class="site">
  <header class="site-header"><div class="wrap"><a class="wordmark" href="/">Tovu Demo Site</a><nav class="site-nav"><a href="/">Home</a><a href="/admin/">Admin</a></nav></div></header>
  <section class="entry-list entry-list--index"><div class="wrap"><ol class="entries">
    <li class="entry"><a class="entry-link" href="/welcome"><span class="entry-index">No 01</span><h2 class="entry-title">Welcome to Tovu</h2><p class="entry-meta">Apr 6, 2026</p></a></li>
  </ol></div></section>
  <footer class="site-footer"><div class="wrap"><span>Tovu Demo Site — powered by Tovu</span><span class="theme-badge">theme: </span></div></footer>
</div>
</body>
</html>
```

A post route swaps the middle for `entryContent` (`:1615-1618`); `/products` uses `productEntryList`
(`:1441-1451`).

### Family B — the theme IS the document

`renderStaticPage` (`static-render.ts:604-646`) reads `theme.pages[pageId]` — already-complete
`<!doctype html>` files authored *inside* the theme folder (`theme.ts:356-362`) — then injects
`theme.tokens` at a sentinel, resolves `theme.partials` into `data-tovu-slot` markers, and rewrites
every asset URL against `theme.manifest.id`. **Bypasses `pageShell` entirely.** Tier `static` only.

This is what the live site is. Verified against the running server, not the filesystem:

```
$ curl -sk https://localhost:3000/
<!doctype html>
<html lang="en" data-theme="dark">
<link rel="icon" href="/theme-assets/basic/icons/favicon.ico" sizes="any" />
```

`basic` is `tier: "static"`.

**Producer 2 — theme-owned static pages** (`/pricing`, `/docs`, `/blog`, themed `/404`;
`pages.ts:1099`, `:1268`).
Coherent output: **no.** The page *is* a theme file; with no theme there is no file.
Instead: `isMarketingPageSlug` (`pages.ts:1068`) can never match, so the route falls to the bare
pre-existing 404 at `pages.ts:1277` — `<h1>404 — page not found</h1><p><a href='/'>Home</a></p>`,
the entire response body.

**Producer 3 — template branch for Posts/Pages** (`renderViaTemplate`, `pages.ts:797`).
Coherent output: **yes — and for free.** Both gates test tier first (`static-render.ts:1066`,
`:1048`), so with no theme they return early, `renderTemplateBranchIfEligible` returns `undefined`
(`pages.ts:1205`), and every Post and Page — including the seeded homepage row carrying
`templateChoice: "page-shell.html"` (`seed.ts:309`) — falls through to Producer 1's output.
**No change to either function is required.** `templateChoice` is **ignored, not cleared**, and takes
effect again the moment a theme is reactivated — this is what makes "fully reversible" true rather
than approximately true.

**Producer 4 — admin template preview** (`template-preview.ts:220-223`).
Coherent output: **no.** The thing being previewed is a theme file.
Instead, today's path yields a **blank body with a 200**: `resolveTemplate`'s diagnostic branch →
`renderStaticPage` → `theme.pages` lookup `undefined` → `null` → the `?? ""` at `pages.ts:830`.
Must be made to return a real error. Admin tool, not a public surface.

**The exporter** (`platform/export/route-manifest.ts:200-217`) is the one place that already models
this — a first-class `skipped: { reason: "no-theme" }` with `activeTheme: undefined`, guarded at
`site-exporter.ts:858-864`, with a passing test at `__tests__/route-manifest.test.ts:404-417`.
**Caveat:** the `detail` string becomes false under state 3 — it says "no valid theme discovered"
when the truth is "the operator chose none." Two reasons, two messages.

### Verdict

**There is no site for which "no theme" produces nothing coherent.** Every tier serves a valid public
site: home, posts, pages, products, 404. Producer 3's tier gates carry static-tier content into
Family A automatically, which is the load-bearing fact.

**What varies is route coverage, not coherence.** On `static`-tier sites only — `declarative`,
`templated` and `handlebars` have no theme-owned page routes to lose — turning the theme off removes
the theme's own marketing pages.

---

## 4. Build scope — four unwired call sites

All four only become visible once state 3 exists. All are instances of the framing rule at the top.

| # | Site | Problem | Fix |
|---|---|---|---|
| 1 | `render.ts:1621` (`siteFooter`) | emits `<span class="theme-badge">theme: </span>` — an empty badge | suppress when no theme |
| 2 | `render.ts:2701` (`pageShell`) | emits `data-theme=""` | **omit the attribute entirely** — an empty one is a selector someone matches by accident |
| 3 | `render.ts:1412` (`siteHeader`) | hardcodes `<a href="/admin/">Admin</a>` | today reached only by broken themes; under state 3 it is the **primary output**, so a themeless public page advertises the admin panel to every visitor. **Owner decision, not an implementation detail.** |
| 4 | `pages.ts:173`, `products.ts:8` | `SITE_TITLE = "Tovu Demo Site"` — hardcoded literal, **duplicated in two files**, not read from settings | becomes visible body text in three places on every page: header wordmark (`:1412`), post back-link (`:1616`), footer (`:1621`). See the framing rule. |

### Cleared — do not re-derive, and do not "fix"

- **`productEntryList`'s empty state** (`render.ts:1449`) correctly reads `"No products available
  yet."` and does **not** inherit `entryList`'s post-shaped copy. The 2026-08-12 fix already handled
  this. Verified 2026-09-12.
- **The `No NN` folio numbering** in `entryList` / `productEntryList` is **deliberate house style**,
  not fallback filler. Do not "fix" it.

### Full call-site audit (every reader of the active theme)

**Direct `resolveActiveTheme` callers — 4 files, 6 sites, all must handle `"none"`:**

| Site | Today | Required under state 3 |
|---|---|---|
| `pages.ts:1559` (`GET /`) | `if (!theme) sendNoThemesInstalled` | render themeless via `renderSite` |
| `pages.ts:1635` (`GET /:slug`) | same | same; also short-circuit `resolveMarketingPageOrOverride` (`:1657`) and `renderTemplateBranchIfEligible` (`:1688`) |
| `products.ts:65` | inline 500 | render themeless; **and switch to `resolveActiveThemeId`** |
| `products.ts:91` | inline 500 | same |
| `route-manifest.ts:280` | `no-theme` skip | reuse; **distinguish the skip `detail`** |
| `template-preview.ts:223` | renders via theme | return a real error (see Producer 4) |

**`products.ts` carries a pre-existing divergence — fix it in the same change.** Lines 62 and 88 call
`getPresentationSettings` **raw**, not `resolveActiveThemeId`. A workspace with no settings row
degrades to `""` on `pages.ts` but **throws** on `products.ts`, landing in its catch as
`<h1>Site error</h1>` (`products.ts:100`). Two routes, two behaviours, same missing row, today. Add a
third state without unifying these and it becomes three.

**Indirect sinks — read `activeThemeId` without going through `resolveActiveTheme`:**

| Site | With `""` | Verdict |
|---|---|---|
| `admin-http/routes/presentation/get.ts:53-57` | `activeThemeTemplates` / `activeThemeStaticPageIds` → `[]` via `?? []` | already safe |
| `admin-http/routes/presentation/patch-active-theme.ts:88-90` | same shape | already safe |
| `admin-http/routes/themes/list.ts:91` | every card `active: false` | correct; UI must say *why* |
| `public-http/routes/content/posts/get-by-slug.ts:57-60` | headless `presentation.activeThemeId` → `""` | **wire-contract change** — `contracts/headless/contracts.ts:113,147` types it `HeadlessThemeId` |
| `features/site-inspection/site-profile.ts:523-531` | `active: null`, reported as drift (`:511`) | must distinguish deliberate from stranded, or the profile cries wolf |
| `features/settings/migration.ts:171` | registers `""` as the ledger default, poisoning fresh workspaces | **must guard** |
| admin `themes/rules.ts:126` | `themeTabGroup("")` opens the wrong tab | cosmetic |
| admin `pages/hooks/use-theme-pages.hooks.ts:158-167` | `port.getThemeDetail("")` → 404 → error banner | **real break** |
| admin `posts/hooks/use-post-editor.hooks.ts:703-709` | `activeThemeTier: null`, empty picker | degrades acceptably |
| admin `pages/hooks/use-page-editor.hooks.ts:435-440` | same | degrades acceptably |

**Verified unaffected:** `/theme-assets/:themeId` (`middleware/theme-static-assets.ts:67`) is keyed by
URL, not the active theme; `middleware/theme-page-preview.ts` previews a *named* theme;
**`apps/site-chat` and `packages/sdk` contain no `activeTheme` reference at all**; **no agent/MCP tool
can set the theme** (`features/theme/agent-tools.ts:68`, plus a repo-wide grep for
`theme_set` / `set_active_theme` returning nothing) — the HTTP PATCH is the sole writer.

### Admin UI

No null/none option exists — `Themes.tsx:385-409` renders one Activate button per discovered theme
and nothing else. Minimum: a distinct **"No theme"** card or header control that PATCHes `""`, plus a
persistent banner. `Themes.tsx:273` already renders a stranded-theme warning; state 3 must not
trigger it — `isStrandedActiveTheme`'s `!== ""` guard already gets this right, by accident.

### False comment to fix while in this area

`apps/admin/src/features/themes/rules.ts:26-28` claims a stranded active theme makes
`resolveActiveTheme` return `null` and the public site serve a 500. **It does not** —
`active-theme.ts:48` substitutes a different theme and renders it silently. True only in the
zero-themes sub-case. One for the false-comment register.

---

## 5. Data-loss clearance

**No no-theme path can destroy a site's copied theme directory.** Three independent lines of evidence;
the first is structural and is the one to preserve.

**1. The seeder cannot see the setting — it runs before the database is open.**
`apps/website/src/server/runtime/composition/deps.ts`:

```
706    seedSiteThemes({ stockDir: builtInThemesDir(), siteThemesDir: resolvedThemesDir });
...
710    const db = resolveOrOpenContentDb(dbPath, overrides);
```

`content.db` is the **only** place `active_theme_id` exists, and it is not open on line 706. The
seeder's entire input is `{ stockDir, siteThemesDir }` (`seed-site-themes.ts:56-61`) and its only
decision is `if (existsSync(siteThemesDir)) return { status: "already-present" }` (`:94`). It does not
merely fail to consult the setting — it **structurally cannot**. A site with the sentinel set is
byte-identical, from where the seeder stands, to one set to `"basic"`.

**2. No cleanup path exists to look like a candidate for.** A search for
`prune|garbage|unusedTheme|cleanupTheme|removeTheme|deleteTheme` across `features/theme/`,
`admin-http/routes/themes/` and `server/runtime/` returns one hit, in an unrelated comment about
starter content. `app.delete` across `routes/themes/`, `routes/presentation/` and
`routes/marketplace/` yields only `registerAdminThemeFileDeleteRoute` — a single *file*, keyed on the
URL `:themeId` param.

**3. There is no path at all from the setting to the filesystem.** `activeThemeId` appears in the
entire `apps/website/src/features/theme/` tree **exactly twice** — `active-theme.ts:45` and `:46`,
both inside `resolveActiveTheme`.

**Every branch on "theme doesn't resolve" / "no valid theme", and what it does:**

| Branch | Effect |
|---|---|
| `active-theme.ts:47-48` | substitutes another theme — in-memory only |
| `pages.ts:1560`, `:1636` → `sendNoThemesInstalled` (`:1034`) | HTTP 500 response |
| `products.ts:66`, `:92` | inline HTTP 500 response |
| `route-manifest.ts:206-211` | pushes a record into an in-memory `skipped[]` |
| `site-exporter.ts:859` | returns an empty list |
| `site-profile.ts:528` | `active: null` in a report payload |
| `themes/list.ts:91` | `active: false` per card |
| admin `rules.ts:36` | renders a warning banner |
| `settings/migration.ts:171` | registers a ledger default value |
| `static-render.ts:616` | returns `null` |
| `static-render.ts:1048`, `:1066` | return `undefined` / `false` |

**Eleven branches, zero filesystem effects.** The closest thing nearby:
`findUnreferencedThemeFiles` (`site-exporter.ts:778-800`) only **reads** (`listFilesRecursively`) and
its output is report-only (`ExportReport.unreferencedThemeFiles`, `:183`, `:890-897`) — nothing
consumes it to delete. `prepareOutputDir`'s `--clean` (`:265-277`) operates on the **export output
directory**, never on `themesDir`.

**Conclusion: theme → none → theme is fully reversible.** The copied tree is untouched;
`templateChoice` values are ignored rather than cleared; restoring is one PATCH.

### Binding constraint

> **"No theme" is a database value and must never touch the filesystem.**

Not advisory. See independent finding A below for the hazard this closes.

---

## 6. The product constraint

One sentence, for the owner:

> **Turning the theme off on a static-tier site — which `tovu-com` is — removes its marketing pages
> from the web until a theme is turned back on.**

Posts and Pages keep rendering, unstyled. `/pricing`, `/docs` and the themed 404 start returning the
bare 404. Nothing is destroyed and reactivating restores every URL — but they are gone while it is
off. This must be said before anyone builds it.

---

## 7. Independent findings — not part of this work, do not lose

### A. `seedSiteThemes` cannot distinguish "cleared on purpose" from "seeding failed"

`seed-site-themes.ts:94` uses **presence of the directory** as the "already seeded" signal, and its
own doc says so deliberately (`:74-77`):

> *Presence of `<site>/themes/` — not its contents — is the "already seeded" signal. An existing but
> empty directory is therefore left empty… there is no state to distinguish "cleared on purpose" from
> "never seeded" other than the directory itself.*

**Reachable only through `existsSync(siteThemesDir)`. The sentinel lives in `content.db`, which that
path cannot reach — so nothing this feature adds touches it.** Filed as independent, with its own fix.

It still matters here for one reason: if anyone implements "no theme" as *removing or emptying*
`<site>/themes/` instead of as a stored value, the next boot re-seeds ~19MB of stock themes over a
directory the operator emptied on purpose. Theme Studio writes edits **in place** into that tree, and
`__original-themes__/` (the "reset to original" backups) lives in the same tree — so the
customisation and its backup go together, with no warning. **That is why the binding constraint above
is binding.**

Worth its own fix on its own merits: "empty because it failed" and "empty because I meant it" being
indistinguishable is exactly the ambiguity the no-theme feature removes one layer up.

Related: `project_tovu_upgrade_destroys_themes`, `project_tovu_theme_copy_model`.

### B. `SITE_TITLE` is a hardcoded literal, duplicated across two files

`pages.ts:173` and `products.ts:8` each declare `SITE_TITLE = "Tovu Demo Site"`. Not read from
settings, and the two copies can drift independently. Independent of this work; becomes acute under
state 3 (build scope item 4). See the framing rule at the top of this document.

### C. Reported by another agent, NOT verified here

`site-registry.ts:220`'s comment claiming `sites/tovu-com` carries neither marker file is reported as
**false** — the real site has `templateId: "unknown"` / `templateVersion: "0.0.0"` from a
`tovu adopt` on 2026-09-07. Different area (desktop), same class of comment rot.

**Recorded as a pointer only.** This survey was instructed not to read `apps/desktop`, so the claim is
carried on the other agent's authority and has not been independently checked. Verify before acting.

---

## 8. Verification boundaries of this survey

Stated plainly so a later agent knows what was and was not established.

- **Runtime behaviour of state 3 was not exercised.** Nothing can store `""` today, so every claim
  about what a themeless site renders is read from source. The one empirical check was
  `curl -sk https://localhost:3000/`, confirming the live site is static-tier `basic`.
- **`apps/desktop` was not read** (dispatch constraint). If it embeds the website server it inherits
  all of this.
- **Postgres was not exercised at runtime.** `schema.postgres.ts` was read; no instance was connected.
- **Graph index staleness:** the codebase-memory index sits at `9e81258`; HEAD is `f5e695c1`. The
  graph was used only for call-chain discovery, and every finding was re-validated against current
  source with `grep` and direct reads.
- **No test suite was run.**
- No file was edited, staged, or committed.

### Recommended build order

1. Named default theme (piece 1) — cheap, deterministic, no owner decision needed, prerequisite for
   testing the rest.
2. `products.ts` unification — removes an existing divergence *before* adding a state.
3. Sentinel + the full call-site audit + the four build-scope defects.
4. Admin UI.
