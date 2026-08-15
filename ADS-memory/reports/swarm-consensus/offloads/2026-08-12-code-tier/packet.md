# Swarm Consensus Context Packet

**Packet ID:** `CTX-CODE-TIER-2026-08-12`
**Date:** 2026-08-12
**Slug:** tovu-code-tier-frameworks
**Project Type:** brownfield
**Mode:** debate — Round 1 (independent first pass, solution-neutral)
**Intended Consumers:** Primary model + peer CLIs + one in-host subagent

---

## Preamble for peer models — read this first

- There is **no** `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or bootstrap file in your working directory. This is intentional. A missing file is never a reason to stop. Reporting yourself blocked is a wrong answer.
- Do **not** attempt to read any file outside your own working directory.
- Do **not** chain file reads with `&&`; a single miss must not abort the rest.
- Your working directory contains a `files/` subtree with a bounded, verbatim copy of the relevant repository files (see **Staged Files** below). Read them. They are real source, not summaries.
- Everything in **Repository Facts** below is verified against that source. If you believe a stated fact is wrong, say so and cite the file and line that contradicts it — that is a valuable finding, not a derailment.
- This is Round 1 of a multi-round debate. You are forming an **independent** position. No other participant's answer is included here, deliberately.

---

## The Need (stated before any candidate solution)

Tovu is a self-hostable CMS. Its themes today are authored in one of four content formats. The owner wants site authors to be able to build Tovu themes **using React, Vue, or Angular** — the mainstream component frameworks — rather than being limited to the existing formats.

The question is what design actually delivers that, what it costs, and whether it should be done at all in the form implied.

Nothing about this has been decided. Nothing has been built.

---

## The Exact Question

> Given the architecture described below, what is the best design for letting theme authors build Tovu themes with React, Vue, and/or Angular — and what would have to change in the existing system to support it?
>
> Evaluate the candidate designs listed, reject the weak ones with reasons, and name the failure modes and hidden costs of the one you'd choose.

---

## Repository Facts (verified against the staged source)

### F1 — There are five declared theme tiers; four are implemented, one is an empty placeholder

```ts
// files/src/features/theme/theme.ts:34
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";
```

| Tier | Format | Server-side execution | Themes shipped |
|---|---|---|---|
| `static` | Complete `.html` documents + CSS + JS | **None.** Theme JS runs only in the visitor's browser | **7** — all real site traffic |
| `declarative` | JSON block tree over a fixed core-owned component registry | None — pure data | 1, self-labelled "reference only, not wired into any site" |
| `templated` | LiquidJS templates | Sandboxed template logic in a `worker_threads` isolate; `eval`/`new Function` never used | 1 (`storefront`) |
| `handlebars` | Handlebars templates | Same isolation posture as `templated` | **0** (loader, allowlist, sandbox, and render branch are all complete and tested — only content is missing) |
| `code` | undeclared | **Not built** | 0 |

`code` has **zero implementation anywhere** — no loader branch, no renderer branch, no validator, no directory. Its only trace is the type-union member, a doc comment reading *"trusted signed-plugin JS (not built yet)"* (`theme.ts:30`), and an agent-tool schema note calling it *"reserved, no themes exist"* (`agent-tools.ts:127`).

### F2 — A `code` theme is not even discoverable today

```ts
// files/src/features/theme/theme.ts:682
export const ENGINE_SUBFOLDERS = ["declarative", "templated", "handlebars", "static"] as const;
```

Discovery scans `src/themes/` top-level folders plus each of those four engine subfolders. `code` is deliberately absent from the list, so no `code/` directory is ever scanned.

Additionally, `parseTier` (`theme.ts:249-252`) **silently coerces any unrecognised tier string to `"declarative"`** rather than failing — a manifest typo produces the wrong tier's validation rules with no error.

### F3 — No theme has ever executed JavaScript on the server, by design

Both logic tiers (`templated`, `handlebars`) run inside isolated `worker_threads` sandboxes with:
- a **load-time allowlist** of permitted tags/filters/helpers (`liquid-allowlist.ts`, `handlebars-allowlist.ts`) — a template using a disallowed construct fails theme validation with a per-file error naming the construct;
- filesystem lockdown and render/parse/timeout/OOM limits;
- a **degrade-never-500 contract**: any render error falls back to `fallbackBody()` rather than erroring the request (`render.ts:1258-1283`).

The `templated` tier can opt out of the *allowlist* per-theme (`skipLiquidAllowlist: true`), which trades the pre-flight lint for "this is a first-party/trusted artifact". Worker isolation and limits still apply regardless. `handlebars` has **no** opt-out.

Exactly two seams bridge a logic-tier template back into trusted core code (`render.ts:872-902`):
1. `{% render_block component: "tovu/site-header" %}` — renders from the same fixed `COMPONENTS` registry the declarative tier uses;
2. `{{ post.content | raw }}` — injects server-rendered, pre-sanitized TipTap HTML. This is the only value either tier may emit unescaped.

### F4 — The render layer is a pure function; all I/O happens above it

`src/server/routes/site/pages.ts` does every lookup (posts, widgets, menus, media, redirects) and hands a fully-resolved `SiteRenderContext` to `renderSite()` (`render.ts:1154-1295`), which is **resolved data in, HTML string out**. `renderSite()` is `async` only because the two worker-backed tiers are; the declarative walk is fully synchronous.

### F5 — The `static` tier, which carries all real traffic, works by mechanical string rewriting

A `static` theme is a small multi-page website: `pages/*.html` (complete `<!doctype html>` documents), `nav.html`/`footer*.html` partials, `css/styles.css`, `js/*.js`, `tokens.json`. Every byte served is exactly what the author wrote, modulo the rewrites `static-render.ts` performs on the HTML string:

- design-token injection as `:root` custom properties;
- `data-theme="<defaultMode>"` stamped on `<html>` for color mode;
- asset-path rewriting;
- **slot/embed resolution** — markers `data-embed-type` / `data-embed-id` / `data-embed-config`, where `type="partial"` splices in a theme-local partial file and every other type (`menu`, `widget`, `form`, `media`, `post`) splices in CMS-resolved content;
- link rewriting.

Malformed embed config degrades to an empty config with a warning; an unknown embed type degrades silently. Never fail the render.

Note the asymmetry: for a `static` theme, `renderSite()` only implements the `home` route. Every other static route (marketing pages, posts, themed 404) is handled one level *above* `renderSite()`, by `pages.ts` calling `renderStaticPage()` directly.

### F6 — Themes are COPIED, not inherited

There is no runtime `parent` / inheritance mechanism. Installing a theme copies files. The model rests on an untouched originals catalog (`src/themes/__original-themes__/`, plus a marketplace fixture at `src/themes/__marketplace__/`), neither of which is discovered as a live theme. Because the original is never editable, a working copy always has something intact to reset to, and **per-file "restore to pristine" is a plain file copy** (`explore.ts:422-435`).

A `lineage` field is written into a copy's manifest by the copy/download flows but is **deliberately never parsed into `ThemeManifest`** — it is provenance metadata, never something the renderer consults.

### F7 — Themes are live-editable through the admin UI and by an AI agent

- Admin routes expose per-file read, write, copy, rename, and reset within a theme (`explore.ts`), with path-containment checks on every untrusted path.
- A `theme_write_file` agent tool re-validates and effectively replaces the loaded theme content after every write (`agent-tools.ts:202`).
- Otherwise **there is no hot reload**: discovery runs once at boot and the result is held for the process lifetime.

### F8 — Theme CSS is currently trusted, unsanitized content

`DiscoveredTheme.css` is documented in its own field comment as *"Raw theme stylesheet (unsanitized in the spike)"* (`theme.ts:145`). ADR-010 states theme CSS should be sanitized at install (no foreign-origin imports, no `javascript:` URLs, budgeted size). **That sanitizer has not been built.** External fonts are therefore declared in `theme.json`'s `fonts` array and injected as `<link>` tags instead of via CSS `@import`.

### F9 — Build tooling and framework dependencies present in the repo today

- The **admin SPA** (`apps/admin/`) is React 19 + Vite 7 (`@vitejs/plugin-react`).
- The **server** (`src/`) has **no** React, Vue, or Angular dependency of any kind.
- There is **no build step for themes**. A theme is source-on-disk, read and served as-is.

### F10 — Fault isolation is a stated requirement, verified by test

`loadTheme()` catches its own errors and returns `status: "invalid"` with a populated `errors` array rather than throwing. One bad theme never breaks discovery for the others (SPEC-004 REQ-10, verified at `theme.test.ts:162-175`). At selection time, an invalid or missing active theme falls back to the first valid theme.

---

## Constraints (what must be preserved or explicitly traded away)

| # | Constraint | Source |
|---|---|---|
| C1 | Tovu is **self-hostable**. A design requiring a proprietary hosted build service is a material change in product shape and must be flagged as such. | product |
| C2 | The **degrade-never-500** contract: a broken theme must not error a visitor request. | `render.ts:1258-1283` |
| C3 | **Fault isolation**: one broken theme must not break discovery or rendering of others. | SPEC-004 REQ-10 |
| C4 | Themes are **installable from strangers**. The declarative tier's stated appeal (ADR-010) is that it can be installed from an untrusted source with zero code-review and zero code-execution risk. Any design that executes author-supplied code must say what replaces that property. | ADR-010 |
| C5 | The **copy-not-inherit** model and per-file reset must keep working, or the design must say what replaces them. | F6 |
| C6 | **AI-authorability**: an agent edits theme files through `theme_write_file` and the admin file editor. A format an agent cannot safely author or repair loses a first-class capability. | F7 |
| C7 | The route/render split (**route resolves, render renders**) is deliberate and consistent. | F4 |
| C8 | Existing `static` themes must keep working unchanged. | 7 live themes |

---

## Candidate designs to evaluate

These are options, **not a proposal**. Attack them.

**Option A — Per-framework server-side render adapters inside the existing sandbox model.**
Implement the `code` tier as a set of adapters (one per framework) that run the author's components through that framework's SSR API inside a `worker_threads` isolate, mirroring the `templated`/`handlebars` posture: allowlist at load, isolation at render, degrade-never-500.

**Option B — Reject the runtime tier: treat frameworks as a build-time authoring concern that compiles down to the existing `static` tier.**
Authors write React/Vue/Angular in their own toolchain; a build step emits `pages/*.html` + CSS + JS conforming to the existing static-theme contract, embed markers and all. Tovu's runtime gains nothing new and the `code` tier is never implemented.

**Option C — Client-only islands over `static`.**
No server-side framework execution at all. Framework components are shipped as browser bundles that hydrate into designated mount points inside otherwise-static HTML. The server continues to do exactly what it does today.

**Option D — The originally-intended `code` tier: trusted, signed-plugin JavaScript executing in-process.**
Theme code is treated like a first-party plugin — signature-verified at install, then executed with real capability, accepting that untrusted installation is no longer safe for this tier.

**Option E — Something else.** See the Unlisted Option prompt below.

---

## Open questions the packet does not resolve (address these; do not treat them as decided)

1. **Isolation posture.** What replaces the current "no theme JS ever executes server-side" property, and what is the concrete blast radius when an author's component is malicious or merely buggy?
2. **Build & toolchain lifecycle.** Who compiles, when, and where — install time, boot time, request time, or the author's machine? What does that do to C1 (self-hostable) and to the "no build step for themes" status quo?
3. **The mechanical-rewrite gap.** The `static` tier's token injection, asset-path rewriting, slot/embed resolution, and link rewriting operate on an HTML string. State how each of those survives — or is replaced — when the output is produced by a framework renderer or a client-side bundle.
4. **Copy-not-inherit + per-file reset (F6/C5)** against a compiled artifact: what is a "file" that a user resets, when the served output is built rather than authored?
5. **AI-authorability (C6).** Can an agent still author and repair a theme in this format, and what does `theme_write_file` do when a write invalidates a build?
6. **Three frameworks, or one?** Is per-framework adaptation the right decomposition at all, or does a single neutral seam (whatever it is) dominate? Angular in particular differs sharply from React and Vue in build model and runtime weight — say whether that changes your answer.
7. **Distribution & licensing.** What does a framework-based theme look like in a marketplace, and does it change what can be shipped.
8. **Migration & phasing.** If the answer is ambitious, what is the smallest first slice that proves it, and what is the rollback?

---

## Adversarial task

1. Identify the **best** design and say plainly why.
2. **Reject** the options you consider weak, with the specific reason each fails — not a generic "less flexible".
3. For your chosen design, name its **failure modes, hidden costs, and one genuine sacrifice**. If your chosen option looks all-upside, you have not found its cost yet.
4. State **what evidence or repo fact would change your answer**.
5. State explicitly whether you think this should be built at all, or whether the need is better served without a new tier.

Do **not** produce an implementation plan, a ranked solution slate, or sample code in this round. Round 1 is position-forming only.

## Unlisted Option (required)

Is there a strong option, shift, or decomposition **not listed above** that you believe is better, or that this framing has missed entirely? If yes, describe it and explain why it is stronger than the presented options. "No, the listed options cover it" is a valid answer.

## Blind Spots (required — answer all three)

- **(a)** A viable option this packet failed to list.
- **(b)** A question we should be asking but aren't — a reframe of the problem, not just a new answer to the stated questions.
- **(c)** The single assumption baked into this framing that is most likely to be wrong, and why.

---

## Staged Files (read these — they are the real source)

All paths are relative to your working directory.

| Path | Why it matters |
|---|---|
| `files/development/docs/themes/theme-authoring-guide.md` | 522-line descriptive guide to the theme system as it exists, every claim carrying a `path:line` citation. Start here. |
| `files/src/features/theme/theme.ts` | Tier type, `parseTier`, `loadTheme`, discovery, `ENGINE_SUBFOLDERS`, manifest construction, per-tier asset loading |
| `files/src/features/theme/static-render.ts` | The mechanical rewrite pipeline for the tier carrying all real traffic |
| `files/src/server/http/site/render.ts` | `renderSite()`, the tier dispatch, `pageShell()`, the `COMPONENTS` registry, `render_block` seam |
| `files/src/server/http/site/liquid-sandbox.ts`, `liquid-worker.ts` | The existing sandbox posture a new executing tier would be compared against |
| `files/src/features/theme/liquid-allowlist.ts`, `handlebars-allowlist.ts` | The existing load-time security gate |
| `files/src/server/routes/site/pages.ts` | Route layer; the static-tier `GET /:slug` path that bypasses `renderSite()` |
| `files/src/features/theme/theme-files.ts`, `marketplace.ts` | Copy-not-inherit model, originals catalog, per-file reset, marketplace download |
| `files/src/features/theme/agent-tools.ts` | `theme_write_file` and the agent-facing theme surface |
| `files/src/themes/static/basic/theme.json` | A real static theme manifest |
| `files/src/themes/templated/storefront/theme.json`, `templates-home.liquid` | The one real logic-tier theme |
| `files/package.json` | Server dependency set — note the absence of any framework runtime |

---

## Required response format

Begin your response with exactly this line and nothing before it:

```
ACK_PACKET_RECEIVED CTX-CODE-TIER-2026-08-12 -- I received the packet and will work on it.
```

Then answer, using these headings:

```
## Position
## Option Assessment
## Failure Modes And Sacrifice
## What Would Change My Mind
## Unlisted Option
## Blind Spots
```

End your response with exactly this marker on its own line:

```
<<SWARM_END>>
```

A response without the end marker will be classified as truncated and excluded from synthesis.
