# `core.site.title` setting — scoping investigation (not implemented)

**Date:** 2026-09-12 · **Branch:** `restructure/apps-website-phased`
**Disposition:** Investigated and escalated to a spec pass (owner ruling). Nothing in this area was
changed — see "Nothing touched" below. This document exists so the spec pass starts from evidence,
not from repeating this investigation.

## The ask, as dispatched

Add a real `core.site.title` setting that defaults to the workspace name. The hardcoded literal
`SITE_TITLE = "Tovu Demo Site"` stays put until the setting exists, and the setting must resolve to
today's exact rendered behaviour when unset — no silent behaviour change for any existing site.

## The contradiction

Those two requirements are not simultaneously satisfiable by one static default:

- **"Defaults to the workspace name"** — the seeded workspace's actual `name` is
  `"Local Tovu Workspace"` (`apps/website/src/server/runtime/configuration/seed.ts:44`).
- **"Resolves to today's behaviour when unset"** — today's rendered `<title>`/OG title for every
  existing site is the literal `"Tovu Demo Site"` (`apps/website/src/server/inbound/public-http/
  routes/site/pages.ts:174`).

`"Local Tovu Workspace"` ≠ `"Tovu Demo Site"`. A setting definition can carry exactly one default
value per workspace at registration time. If that default is the workspace name, every existing site
is not "unchanged" the moment anything reads the setting — it silently flips from `"Tovu Demo Site"`
to `"Local Tovu Workspace"` (or whatever that site's own workspace name is). If instead the default is
pinned to `"Tovu Demo Site"` for everyone, new workspaces never get their own name — the other half of
the ask.

Both halves can be true at once only with a two-tier default, the same shape the codebase already
uses for `core.presentation.activeThemeId` (see "Required shape" below): register the definition with
default = workspace name (covers workspaces created *after* this ships), and separately run a
one-time migration that explicitly pins `"Tovu Demo Site"` into every workspace that already exists
*before* this ships (so `getEffective` keeps returning today's literal for them specifically, not the
generic default).

## Blast radius — this is production SEO behaviour, not incidental copy

`apps/website/src/features/seo/page-head-contributor.ts:76` emits `ctx.siteTitle` as a `{kind:
"title", priority: 100}` head element for every entry-less route (home), and every other route's
title flows through the same priority-100 slot via `getEntryMeta`/`resolved.title`. Priority 100 is
the lowest (first-applied, base) priority in this contributor's own band scheme (meta-desc=110,
canonical=120, robots=130, og=140-149, twitter=150-159, jsonld=900) — nothing outranks it, so whatever
resolves here IS the live `<title>` and the `og:title` fallback, on every page, of every site, today.
Any change to what feeds this value is a live production SEO change, not a cosmetic default tweak.

## Current call-site state (verified myself; the original brief may have been stale)

Confirmed a previous session's agent had already collapsed a duplicate onto the exported constant —
verified by grepping for the literal itself, not by trusting the brief:

```
$ grep -rn "Tovu Demo Site" --include=*.ts --include=*.tsx apps/website/src
apps/website/src/server/inbound/public-http/routes/site/pages.ts:174:export const SITE_TITLE = "Tovu Demo Site";
```

Exactly one definition. Its importers/use sites, verified with `grep -rn "SITE_TITLE"`:

- **`pages.ts`** (the exporter) — 6 use sites: `buildExtraHead(deps, "page"/"post"/"home", SITE_TITLE,
  ...)` at lines 1154, 1235, 1256, 1615, and `siteTitle: SITE_TITLE` passed into the render call at
  lines 1266, 1621.
- **`apps/website/src/server/inbound/public-http/routes/site/products.ts`** — imports it from
  `./pages.js`; its own header comment (line ~21) already documents that it used to hold a private
  duplicate of `pages.ts:173`'s literal and was collapsed onto the export. Used at lines 94, 125
  (`renderSite({ ..., siteTitle: SITE_TITLE, ... })` for the products/product routes).
- **`apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts`** — imports it,
  uses it once at line 231 (`siteTitle: SITE_TITLE`).
- A test, `server/__tests__/routes/seo-site-serving.test.ts`, asserts the literal directly
  (`<title>${SITE_TITLE}</title>`) — any change to how this resolves needs that assertion updated too.

All three call sites ultimately feed `siteTitle`/`buildExtraHead`'s title argument into whatever
becomes `ctx.siteTitle` at `page-head-contributor.ts:76`, or the per-entry `resolved.title` path.

## Required shape, traced against the codebase's own precedent

`core.presentation.activeThemeId` (`apps/website/src/features/settings/migration.ts`) is the existing
precedent for exactly this "introduce a setting behind a previously-hardcoded/legacy value, without
changing anyone's current effective value" problem. `core.site.title` would need the same shape:

1. **Definition registration** mirroring `ensureSeoSettingDefinitions`
   (`apps/website/src/features/seo/settings.ts:106`) — register namespace/key (e.g.
   `core.site`/`title`), schema `{type: "string"}`, scope workspace, idempotent
   (`resolveDefinitionRaw` skip-if-registered), default = workspace name.
2. **Get/set pair** mirroring `getSeoSettings`/`setSeoSettings` (same file) — `getEffective`/`set`
   through the settings ledger chokepoint, not a raw repo call.
3. **Boot wiring at two call sites**, mirroring where `ensureSeoSettingDefinitions` is already called
   twice: `apps/website/src/server/runtime/composition/app.ts:305` and
   `apps/website/src/server/runtime/composition/deps.ts:770`.
4. **A workspace-name read from boot context.** `workspace.name` is exposed today via
   `apps/website/src/server/inbound/admin-http/http/workspace.ts:24`, but that is a request-scoped
   admin HTTP handler, not something boot-time registration code can call into. **I found no reusable
   read of the workspace's name from boot/registration context — this is a real gap, not just
   plumbing**, and whoever picks this up needs to either expose a boot-safe workspace-name lookup or
   thread the already-loaded workspace record into the registration call.
5. **A one-time pin-migration**, modeled directly on `migrateLegacyPresentationSettings` in the same
   `migration.ts` — the mechanism that makes the two-tier default in "The contradiction" actually
   work: iterate every workspace that exists at the moment this ships, and if `core.site.title` has no
   explicit value yet, `set()` it to the literal `"Tovu Demo Site"` explicitly (skip-if-already-set,
   catch-log-continue per row, matching that module's W-003 idempotency contract). Workspaces created
   after this migration point were never touched by it, so they fall through to the true default
   (their own name) via `getEffective`.

None of the above exists anywhere yet — confirmed by searching for `core.site`, `site.title`, and any
`features/site-config`-shaped directory; nothing partial is stubbed out.

## Why "register the definition now, wire it into nothing" is a trap, not the safe option

This was the option I initially leaned toward as the "small, safe" slice: register
`core.site.title` with default = workspace name, wire it into zero render call sites, ship it as inert
scaffolding for later. It looks safe because nothing reads it yet, so nothing renders differently
today.

It is the **correct-primitive, unwired-call-site** defect — per this repo's own recurring pattern,
the single most common real bug found across past audits here. The primitive (the setting) is
correctly built; the wiring is simply deferred. The danger is entirely in what a *later* change looks
like: whoever eventually wires `page-head-contributor.ts`/`pages.ts`/`products.ts`/
`theme-page-preview.ts` to read this setting instead of the `SITE_TITLE` literal will see a definition
that already exists, already has a plausible-looking default, and already passes typecheck and
whatever tests exist. Nothing in *that* diff would look wrong — the diff is "read the setting instead
of the constant," a completely reasonable-looking change. The silent flip (`"Tovu Demo Site"` →
`"Local Tovu Workspace"`, or each site's own workspace name) would ship invisibly inside a
change that reviews as a clean, mechanical wiring-up, because the actual defect — no pin-migration
ever ran — was committed earlier, separately, and looked inert at the time. That is exactly the shape
that makes this defect class hard to catch in review: the dangerous half and the triggering half are
in different commits, possibly different sessions, with nothing at the trigger site to suggest a
problem.

Registering the definition and the pin-migration together (or not registering at all until both are
designed) is the only version of "add the setting" that doesn't plant this trap.

## Nothing touched

No production file was modified for item 3: `SITE_TITLE`, `pages.ts`, `products.ts`,
`theme-page-preview.ts`, and `page-head-contributor.ts` are all exactly as they were before this
investigation started. This document, plus the read-only `grep`/`Read` calls it cites, is the entire
output of this task.

## Recommendation

Owner ruling (relayed via dispatching agent): route through a spec pass rather than building any of
the three options (register-only / register+migration / hold) inside a cleanup dispatch, given the
production-SEO blast radius and the boot-context workspace-name gap found above.
