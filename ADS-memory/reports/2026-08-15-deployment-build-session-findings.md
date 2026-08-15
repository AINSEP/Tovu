# Deployment build session — findings and agent reports

Date: 2026-08-15
Coordinator: Claude Opus 5 (1M), Claude Code, darwin. Five Sonnet subagents, all on
`AI-Dev-Shop/agents/programmer/skills.md` v1.7.1 (one on `web-design`).

Written mid-session so a restart does not re-buy any of it. Superseded parts should be struck,
not deleted.

---

## THE headline finding: deployment is already built three times over, and none of it is connected

This is the most important thing on this page. The remaining work is **wiring, not building**.

| Layer | Where | What exists | Wired? |
|---|---|---|---|
| Static host adapters | `Jini/packages/devops/src/deploy/` (`@jini-ai/devops/deploy`) | Provider-agnostic port `DeployPublishInput { files: DeployFile[], projectName, metadata? }`; adapters for **github-pages, vercel, netlify, cloudflare-pages**; `reachability.ts`, `tokens.ts`, `naming.ts`; a test per adapter | Tovu imports **none** of it — absent from `src/`, `apps/`, and `package.json` |
| Server-host deployment domain | `src/features/deployments/` (dated 2026-08-12, predates this session) | `ports.ts`, `types.ts`, `providers/github.ts` (GitHub App adapter w/ SSRF protections) + tests. **Migration `0037_purple_rocket_racer.sql` is APPLIED**, creating `releases`, `deployment_environments`, `deployment_targets`, `deployment_runs`, `deployment_run_events` | **Zero callers.** The only two references outside its own directory are comments (`src/db/schema.ts:1994`, `FullSiteTab.tsx`). No route registered in `app.ts` |
| Static exporter | `src/export/` (built this session) | Route manifest + engine + `tovu export <dir>` CLI. Verified end to end | **CLI only** — no admin HTTP route |

`src/db/schema.ts:1994` documents its own gap in a comment: *"No repository or route…"*.

The `Release`/`Environment`/`DeploymentTarget`/`DeploymentRun` domain is exactly what the
2026-08-12 six-debate consensus recommended (`ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md` §6).
It was built and never called — the same "no callers on both ends" shape as `installAgentPlugin`.

**⚠️ Migration `0037` is already applied. Do not let anything regenerate it** — a regenerated `.sql`
makes drizzle re-run it and die on "already exists" at boot.

### The two remaining slices
1. **Static Site** — an admin HTTP route wrapping `exportSite`/`runExportCommand`, plus progress and
   a way to retrieve the output. Then the tab's button stops being disabled.
2. **Full Site** — an admin route surface over `src/features/deployments/`, registered in `app.ts`.

### Port boundary, arrived at twice independently
Static hosts take **a folder of files**; server hosts take **an image/repo reference**. Two ports,
not one — an interface spanning both has methods that throw for half its implementations. Jini's
split (devops/deploy = the four static hosts only) matches the UI's Static Site / Full Site split.

---

## Owner decisions taken this session

- **Self-hosted-for-developers ships first**; hosted SaaS later. Closes constraints-doc §9.
- **Deployment panel tabs: Overview · Static Site · Full Site · Dockerfile · History.** Named by
  what the user *gets*, not the technology. Static and server hosts are **two separate lists**.
- **Dockerfile gets its own tab** — for a self-hoster the Dockerfile is the contract.
- **Per-provider build BUTTONS yes, per-provider build PIPELINES no.** One export engine + a provider
  *profile* (base path, config files to emit, 404 naming). Hosts differ in packaging, not rendering.
- **Eventual home is `@jini-ai/devops`**, not `cms` or `capability-providers` — its own description is
  "DevOps capabilities for deployment, source control, and CI/CD." **But wire it in Tovu and prove it
  works before moving anything**, or you add a fourth unwired layer to the three above.
- Docker Desktop shut down at owner request; **the image has never been built**.

## Open, awaiting the owner
- **Slug-collision default.** `overridesThemePage` already exists (`PostEditor.tsx:880-895`, a
  warning + checkbox shown only on collision, already agent-tagged). Today the **theme wins** and the
  post must opt in; owner wants **post wins** (more specific). Flipping the default changes the live
  URL of every existing colliding post — needs a backfill decision, not just a code change.
- **Renaming a theme route** (`/about` → `/about-site`) does not exist. Arguably better than an
  override, since a rename keeps both pages reachable.
- **Base path** — see below.

---

## Verified external facts (do not re-derive)

- **GitHub Pages project sites publish to `https://<owner>.github.io/<repositoryname>`**; user/org
  sites publish to the root. So root-relative URLs break on project sites. (GitHub docs.)
- **BuildKit reads `<dockerfile-name>.dockerignore` from beside the Dockerfile**, and it takes
  precedence over a context-root `.dockerignore`. (Docker docs.) This is what makes a
  parent-directory build context both affordable and committable.
- Per-provider packaging differences: GH Pages needs `.nojekyll`; Netlify/Cloudflare read
  `_redirects`; Vercel reads `vercel.json`; GH Pages supports neither. `404.html` works on all three.

## Verified repo facts

- **`npm` installs the 22 `file:` deps as SYMLINKS** into `../Jini/packages/*`. Both trees must exist
  in the image at their sibling layout, or you get an image that builds clean and dies on first
  `require`.
- **`npm pack` tarballs and `--install-links` are both dead ends** — Jini packages declare internal
  deps with pnpm's `workspace:*`, which npm cannot resolve.
- **In a compiled build the agent daemon spawns as plain `node`**; the `npx → tsx → node` chain is
  dev-only. A production image does not need `tsx` for the assistant.
- **`TOVU_RUNTIME_MODE` is the only signal arming the production boot gate.** `NODE_ENV` is never
  read for it (`src/core/runtime-mode.ts`); anything but the literal `"production"` = `local`, with
  no containment at all.
- **Agent tagging exists**: `agentHandle()` from `@jini-ai/agentic` emits `data-agent-element`, **28
  call sites** in `apps/admin`. Grepping the raw attribute finds only comments and reads as
  "unbuilt" — that is wrong. Applied as a prop-spread onto native elements, so adding it later is
  additive, not a restructure.
- **`/page-shell` and other `theme.manifest.templates` stems are publicly reachable today** —
  `pages.ts`'s `theme.pages[slug]` lookup has no exclusion, so a template shell is served as if it
  were a real page. Live minor defect, unfixed, out of scope this session.
- Seeded demo data contains a **real** slug collision: the "about" post loses to the theme's
  `about.html`.

---

## Commits (all on `general-work`, none pushed)

| SHA | What |
|---|---|
| `173765e` | Production boot refuses on default owner password (§4.2). `DEFAULT_OWNER_PASSWORD` now single-sourced |
| `9593802` | Reset-password dialog: confirm field + per-field reveal toggles |
| `ede9edf` | Reveal toggle uses house eye/eye-off icon |
| `cf83b43` | **e2e**: reset-password proven against real browser + API, incl. old-password-rejected control |
| `3a17004` | Dockerfile, Dockerfile.dockerignore, docker-compose.yml, `.env.example` Docker section — **never built** |
| `0c67fbf` | `RouteManifestPort` + implementation — 17 routes on the seeded fixture |
| `ab258d0` | Exporter engine — boots the real app, fetches every route |
| `6355fc9` | `tovu export <dir> [--out] [--workspace] [--clean]` CLI |
| `c83a323` | Read-only admin routes: deployment-overview + dockerfile-source |
| `7b081b0` | Admin API client methods + status-pill CSS |
| `4315a06` | The five-tab Deployment panel |
| `46e3376` | Correct Static Site's exporter claim once the exporter became real |
| `fa7d7a1` | Scope Full Site's "no backend" claim to admin-reachability |
| *(this doc's sibling)* | `development/docs/agents/subagent-dispatch-protocol.md` |

---

## Exporter detail

Drives the **real app** — `createServer(createApp(routeDeps))` + `listen(0)` + `fetch` — so exported
HTML is identical to served HTML by construction. **No second renderer**; this repo already drifts
between the editor and public-site renderers, and a third path would drift too.

Output: clean URLs (`/about` → `about/index.html`), `404.html`, `theme-assets/<id>/…` mirroring the
live mount. Default dir `infra/export` (`--out` > `TOVU_EXPORT_DIR` > default), deliberately not
`dist/` (already the tsc output). Refuses a non-empty directory unless `--clean`. A failed route does
not abort the export but does force a non-zero exit — never false success.

Assets are **crawled from rendered HTML and fetched over the same HTTP path**, one bounded hop into
CSS `url(...)`. Rationale: `/m/` uploads are a rendition pipeline over DB rows with no folder to
copy, and a whole-theme-folder copy would ship `.liquid` source.

### Known gaps
- **Base path unhandled** — output is root-relative, so it works on an apex domain and breaks
  completely on a GitHub Pages project site. **Decision still owed**: (a) `--base-path` rewrite,
  (b) apex-only + document it, (c) per-page relative URLs.
- `robots.txt`, `sitemap.xml`, `favicon.ico` are **not exported** — a crawl cannot find files nothing
  links to. Needs an explicit always-include list.
- Assets a theme's JS builds at runtime are invisible to a crawl. Needs a "these files were never
  referenced and were not exported" warning so an incomplete export cannot look complete.
- `prefix`/`wildcard`/`regex` redirect rules are reported in `skipped[]`, not exported (they match a
  family of paths, not one enumerable path).

---

## Process notes

- **Five mid-flight messages were sent; at least two were lost.** Both drops were caught by
  *measuring the code*, not by reading reports. See
  `development/docs/agents/subagent-dispatch-protocol.md` — read it before dispatching.
- **Two briefs contained a gated check-in** ("message me before you fix"), which is a deadlock: the
  agent asks and the answer cannot reach it. Grep your own brief for "before you" / "wait for"
  before dispatching.
- **The first security-fix dispatch named the wrong persona** (`security/skills.md` is review-only,
  "do not implement fixes"). The agent refused and asked for the conflict to be resolved. Pick the
  persona from the *work*, not the *finding*.
- **Four of five agents found real errors in their briefs**, because pushback was explicitly invited
  and non-blocking. Keep inviting it — as report output, never as a gate.
