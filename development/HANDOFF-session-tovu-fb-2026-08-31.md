# Handoff — session `tovu-fb` → next session, 2026-08-31

**Owner preference: work in SUBAGENTS, not inline. Keep replies SHORT (bullets).**
Owner uses voice input — expect typos, read for intent.

## 0. Rules that bit us tonight

- Scoped test runs only. `apps/admin`: `npx vitest run <path>` from that dir. `apps/website`/root:
  `node --import tsx --test --experimental-test-module-mocks "<glob>"`. Jini: `npx vitest run <path>` from package dir.
- Complexity ceiling **9**. ESLint counts **each default parameter as a branch** — adding `x = null` to a
  function at 9 fails the gate. `tsc` won't catch it; `npx eslint` will.
- **Verified agent roster** (`ls AI-Dev-Shop/agents/`): code-inspection, codebase-analyzer, coordinator, database,
  devops, docs, observer, programmer, qa-e2e, red-team, refactor, search-visibility, security, skills-librarian,
  software-architect, spec, system-design, tdd, testrunner, vibecoder, web-design. There is **no `qa/`, no `test-runner/`,
  no `code-review/`**. Guessing a name blocks the agent on arrival.
- **Theme reload asymmetry**: `.ts` hot-reloads via `tsx watch`; theme **CSS/assets** serve off disk per request;
  theme **HTML partials do NOT reload** (snapshotted at boot). A partial edit only *looks* live when another agent
  happens to be saving TypeScript.
- Theme edits go in **BOTH** `content/themes/static/basic/` and `sites/tovu-com/themes/static/basic/`.
- Ask the owner before restarting/killing anything.

## 1. NOT DONE — do these first, in subagents

1. **Per-message copy buttons in Jini chat.** Owner asked twice. Both user and assistant messages.
   File is `Jini/packages/chat/src/react/components/MessageRow.tsx` (NOT `Markdown.tsx`).
   Per-*block* copy is already a TODO inside `Markdown.tsx` — do both together.
2. **"Files from this turn" UI** (ported from Open Design). **Data already exists** — `ai_chat_messages.events_json`
   holds the raw agent stream; 193 messages carry `tool_use` with real `file_path` values. Stored as
   `{"kind":"raw","line":"<escaped JSON>"}`, so the extractor parses nested JSON and must tolerate different
   agent CLIs using different field names. This is rendering work, not capture work.
   OD reference lives at `/Users/la/Programming/Open-Marketing/apps/web/src/runtime/markdown.tsx` (734 lines).
3. **Vite cache clear + dev restart** — `rm -rf apps/admin/node_modules/.vite` then restart. Until then the
   GFM-table/code-block fix is NOT visible at :5173. Ask owner first.
4. **Logo: owner must pick** simplified-T at ≤32px vs full logo at every size. Comparison sheet at
   `content/brand/icons/candidates/comparison-sheet.png`. Full logo IS a smudge at 16px — recommend simplified.
5. **Favicon/PWA tags not wired.** Assets exist in `content/brand/icons/`; `page-shell.html` has NO favicon link at all,
   and there's no shared `<head>` partial, so it's one edit per page template. Icons also aren't in a served location yet.
6. **NOTHING IS COMMITTED.** Everything below is working-tree only.
7. **ADR-064 is spec only.** Not implemented.
8. **Error states have no red** — no `--danger`/`--success-*` token exists in ANY theme. Success/error are currently
   distinguished structurally. Owner leaned toward a hardcoded red as a *fallback only* so a theme defining `--danger`
   overrides it. Not implemented.

## 2. NEW TASK from the owner (not started)

Docs nav restructure + first docs pages.

- Move **"How It Works"** from top-level nav into the **Docs** dropdown.
- Add doc pages: **How Tovu Works** and **How Themes Work**. Detailed but concise. More coming later (plugins etc).
- Each doc page gets a **sidebar menu of `#` anchors** to its own sections.

**Ground truth — verified, don't re-derive:**
- Nav is DB-driven, NOT `nav.html`. Table `menus`, row `menu-header-nav`, column `doc_json`.
  Current items: `menu-item-how` "How It Works" → `/how-tovu-works` (**top level — this is the one to move**),
  `menu-item-quickstart` → `/quickstart`, `menu-item-docs` "Docs" → `/documentation`
  (**already has one child**: `menu-item-docs-how-themes-work` "How Themes Work" → `/how-themes-work`),
  `menu-item-4` FAQ, `menu-item-1` About.
- **The sidebar pattern already exists**: menu slug `docs-themes-menu` (id `5eb32754-4449-48d1-9d72-4f3b5920e346`)
  already uses exactly the `#anchor` shape — "Getting Started" → `#getting-started`, children "What is a theme" →
  `#what-is-a-theme`, "Theme tiers" → `#theme-tiers`. Follow it, don't invent one.
- **The target pages do not exist yet.** Every nav href above 404s. Also: `entries` contains ONLY widgets
  (13 widget + 2 widget_area rows) — Pages are NOT in `entries`. Find the real table before writing pages;
  there is a `posts` table. Unresolved when this handoff was written.

## 3. DONE tonight, all UNCOMMITTED, all verified

- **Public form pipeline.** Was: unstyled, and submitting dumped the visitor on raw JSON.
  Now: 303 Post/Redirect/Get with same-origin Referer validation; works **JS-disabled**; JSON contract unregressed
  (201/400/404/429). Latent bug found: the route had no `express.urlencoded()`, so a real form POST would have
  redirected fine with every field empty.
- **Generalized to ALL forms** (owner insisted twice). New `.../http/site/form-render.ts` owns baseline styles,
  success/error slots and the PRG splice, keyed on generic `data-form-slug`. Emits `.tovu-form*` AND legacy
  `.widget-contact-form*` together — legacy names are **permanent**, they're the theme-override surface.
- **Field-wipe fixed.** Validation no longer wipes already-typed fields. Short-lived read-once cookie
  `tovu_form_flash` (HttpOnly, Max-Age=120, SameSite=Lax, conditional Secure). **Values never touch the query string** —
  that's a privacy requirement, not a preference. Allowlist of repopulatable types, so a future `password` is excluded automatically.
- **`[hidden]` was a no-op.** `:where(.widget-contact-form){display:flex}` is author-origin and beats the UA
  `[hidden]{display:none}` regardless of `:where()`'s zero specificity. Fixed with `:not([hidden])`. Any `.widget-*`
  rule that sets `display` has this hazard.
- **Dead design tokens.** `--danger`, `--danger-bg`, `--success-bg`, `--success-fg`, `--accent-contrast` exist in NO
  theme — all fell back to hardcoded light-mode hexes on a dark page. Rebuilt from the real 12-token set.
- **Admin Submissions 404.** `list-submissions.ts` used `findById` while the URL carries the **slug**. Two more latent
  instances in `get-submission.ts`/`delete-submission.ts`. Fixed via shared `routes/forms/resolve-definition.ts`.
- **ADR-063 implemented** — `/admin/forms/:formId/submissions` deep-links; Themes got `?tab=`. Caught a regression the
  ADR missed: `Themes` also mounts at a nav-less `/admin/appearance`, so tab clicks needed a `basePath` prop.
- **Logo** — new gold mark in header + footer, 1x/2x. Artwork was only 61% of the source canvas (hence "small in a big
  black box"); now cropped tight, transparent, no tile.
- **Full icon set** at `content/brand/icons/` + repeatable `development/scripts/build-brand-icons.mjs`
  (.icns, multi-res .ico, Linux PNGs, favicon, apple-touch, PWA + maskable). Per-platform alpha rules verified at pixel level.
- **Front page padding** — `.wrap`'s `padding: 0 24px` was clobbered by `section.band`/`\.hero` using the `padding`
  *shorthand* (higher specificity / later). Switched to `padding-block`. Was pre-existing, not from tonight.
- **Chat GFM tables + code-block CSS** (Jini). NOT an MCP-UI bug — `Markdown.tsx` simply had no `table` case.
  Ported from OD. Wide-table pop-out built as a plain component. **Needs the Vite clear to be visible.**
- **Two stale rows corrected** in `development/docs/deployment/deployment-constraints.md` §3 (static exporter, Dockerfile).
  The stale static-exporter row had caused the site assistant to tell the owner a working feature "doesn't exist yet."

## 4. Deployment — settled, don't re-litigate

- **Tovu's server cannot run on Vercel/Netlify/Cloudflare.** Blocker is the process model + filesystem, NOT SQLite:
  `app.listen`, a detached child daemon, mutable SQLite + uploads on local disk, native modules, `worker_threads`.
- **Static export CAN go to Vercel/Netlify** — but it drops five POST routes including `forms-submit`, plus
  `newsletter-confirm` (a state-mutating **GET**). Static export silently kills the contact form.
- **Git-based deploy on Railway/Render CANNOT work.** The Dockerfile builds from the **parent** directory — 22 `file:`
  deps into `../Jini/packages/*`, and Jini uses pnpm `workspace:*`. Build locally → push image → deploy image.
- Host Tovu itself on Fly/Railway/Render/VPS. Owner wants no CLI → Railway or Render fit better; Fly has the only
  first-party MCP server of the three. `flyctl`/`railway`/`render` are NOT installed on this machine.
- `VendorId` models github/gitlab/bitbucket/vercel/netlify/cloudflare/s3-compatible. **Fly/Railway/Render not modeled.**
  `apps/admin/src/features/deployment/rules.ts` already ships them as `status:"planned"` rows.

## 5. ADR-064 — agent-guided deployment (spec written, not built)

`ADS-memory/reports/architecture/ADR-064-agent-guided-deployment.md`.

- **Hard invariant: a credential must NEVER pass through the agent's message stream.** It would land in the transcript,
  run events, `ai_chat_messages`, and the model provider's logs. Use the existing server-direct POST pattern
  (`deployment_propose_custom_provider_credential`).
- **Landmine**: `assistant_ask_choice` shipped missing from `MCP_UI_REDEEMABLE_TOOL_IDS` — form rendered, every
  submission 403'd. Now fixed (line 105). The next credential tool will repeat this, and there a real token leaves the
  browser before the 403 lands.
- Open: designs **first deploy only**; "push an update" is undesigned. And where the one-time
  `TOVU_INTEGRATIONS_ROOT_KEY` reveal screen lives.

## 6. Also open (from `development/HANDOFF-verification-2026-08-31.md`, still valid)

Items 1, 3, 4, 5, 6, 7, 8, 9, 10 — Codex tool-access verification, widget slug auto-suffixing, fields-table visual check,
site-chat widget browser check, missing CI e2e job, dead-test sweep, adversarial confirmation coverage, UI backlog 3+4,
Antigravity. Item 2 (slug embed markers) is RESOLVED and cleared to commit.

## 7. Test data

`form_submissions` has ~13 rows, all agent/owner test submissions, traceable by name. Not deleted — owner's call.
Live data to preserve: widget `29721c44-a811-444f-b7b5-e61a9918a3a9` (slug `contact-form`), form definition `contact-us`.
