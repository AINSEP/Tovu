# AI-First Documentation Checklist for Tovu

Owner's question (paraphrased): when Tovu ships public docs pages (How Tovu Works, How Themes
Work, more later), can an AI agent be handed a URL, fetch it, understand Tovu's model, and then
go help a user build pages? What has to be true for that?

## Verdict

Tovu is closer to "AI-readable" than it looks, for one specific reason: the doc pages render as
real server-side HTML with no client-side hydration required, and the codebase already treats
"GPTBot/ClaudeBot/PerplexityBot execute no JavaScript" as an enforced architectural constraint,
not an afterthought (see Finding 4 below). That's the hard part, and it's already done.

What's missing is small and cheap: a curated index file (`llms.txt`), one JSON-LD type change,
and a deliberate robots.txt decision about AI crawlers. Do those three things. Do **not** chase
`llms.txt` as a general SEO/discovery play — the 2026 evidence says it doesn't move that needle —
and do **not** build an MCP resource server for docs; nothing in this repo needs it yet and it
would duplicate what a plain URL fetch already gives an agent.

---

## Checklist

### Do now

| # | Item | Status | Why |
|---|---|---|---|
| 1 | `/llms.txt` — curated markdown index of doc pages | Real convention, narrow real value | See Finding 1. Coding-agent tools (Cursor, Claude Code, Windsurf, Copilot, Cline, Aider) explicitly probe `/llms.txt` when a human points them at a docs site. That's exactly the "hand an agent a link" scenario the owner described. Cheap to build off the same published-post list `sitemap.ts` already enumerates. |
| 2 | `schemaType: "TechArticle"` override on the doc posts | Real standard, real fit | `getEntryMeta` already auto-generates JSON-LD per post/page and already supports a per-post `schemaType` override (Finding 3) — today the two doc pages get the generic default (`"Article"`/`"WebPage"`). Setting `TechArticle` costs one field write, no new code. |
| 3 | Heading hierarchy + stable anchor `id`s on doc pages | De-facto convention | Not new engineering — the sidebar-anchor pattern (`#getting-started`, `#what-is-a-theme`, ...) already exists on menu `docs-themes-menu` and the in-flight `docs-nav-pages` work is already building the two doc pages around it. Just don't let it slip: every `<h2>`/`<h3>` needs a stable `id` an anchor link can target, and heading levels must nest without skipping — that's what makes a page parseable as an outline rather than a wall of text, for a model exactly as much as for a sighted reader using the sidebar. |
| 4 | Deliberate robots.txt rule for AI crawlers | Real, mechanism already built | `RobotsRule[]` is per-user-agent already (Finding 2) but the seeded default is an *empty* array — Tovu is silently allowing (or rather, not addressing) every crawler by default. This needs an explicit **owner decision**, not an engineering default: allow the search/citation bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot/Claude-User), and decide on purpose whether to block the training bots (GPTBot, CCBot, ClaudeBot, Google-Extended). See UNRESOLVED below. |

### Worth doing (real value, not urgent)

| # | Item | Status | Why |
|---|---|---|---|
| 5 | Markdown twin for doc pages (`.md` route or `Accept: text/markdown` negotiation) | Machine-readable-content convention, no Tovu code exists yet | Genuinely useful for the stated use case — a model reads a clean markdown page instead of parsing HTML/CSS/theme chrome. Needs a real build: doc pages are TipTap JSON (`bodyFormat: "doc"`), and the only existing text-extraction helper (`extractPlainText`) is a lossy strip-to-text function built for SEO meta descriptions, not a structure-preserving Markdown renderer (Finding 5). Either write a doc-JSON→Markdown renderer, or run an HTML→Markdown pass over the already-rendered doc HTML. |
| 6 | Register a real `SitemapCollectHook` so doc pages are actually in sitemap.xml | Gap in an existing mechanism | The hook registry that would add non-Post routes to the sitemap exists but ships "live-but-empty" — zero real registrants (Finding 2). robots.txt already advertises `/sitemap.xml`; if a doc page ends up living as a static-theme page rather than a Post/Page row, it won't be in the sitemap unless something registers a hook. Coordinate with whichever agent does the Post→Page conversion already tracked for `how-themes-work` (`PageKindMismatchError`, see `development/SESSION-TASKS-2026-08-31.md:9`). |
| 7 | Canonical URLs already correct — just confirm doc pages get them | Real, mostly already built | `getEntryMeta`/`createSeoPageHeadHook` always emit a `<link rel="canonical">` (priority 120), for both entry-backed and entry-less routes (Finding 3). No new work — just confirm it fires for wherever the doc pages ultimately live (Post, Page, or static-theme page all take slightly different code paths in `pages.ts`). |

### Skip, and why

| # | Item | Why skip |
|---|---|---|
| 8 | MCP resource server for docs | Speculative. Nothing in Tovu or Jini registers any MCP resource today — `tovu introspect --format mcp` is the *only* real MCP surface in the repo, and it reshapes the CLI's own command tree (init/serve/...) for a driving agent like Tovu-Runner; it has nothing to do with documentation content (Finding 7). Building a docs MCP resource server would be new infrastructure serving the same content a plain URL fetch already serves, for a use case the owner didn't describe (an agent that already holds an open MCP session to Tovu, vs. "given a link"). Revisit only if that scenario becomes real. |
| 9 | `llms.txt` as a general SEO/AI-citation strategy | The two largest public studies (SE Ranking, ~300k domains; Ahrefs, 137k domains) found no measurable citation benefit, and Ahrefs found AI bots largely aren't even requesting the file on domains that lack one — they're not proactively discovering it. Google has said explicitly that Search ignores it. Ship it anyway (item 1) for the narrow, real reason — dev-tool agents look for it on docs sites when a human points them there — not as a discovery mechanism for Tovu's marketing pages generally. |
| 10 | `FAQPage`/`HowTo` JSON-LD | Google restricted `FAQPage` rich-result eligibility to a narrow set of sites in 2023, cutting most of its SEO value, and it adds real per-page authoring overhead (explicit Q&A pairs) for marginal benefit beyond what a well-headed markdown/HTML page already gives a model reading it directly. Revisit per-page only if a specific doc page is naturally FAQ- or step-shaped. |
| 11 | Any theme-rendering rework "for AI" | Unnecessary — the base rendering path is already server-rendered HTML with no hydration requirement, and the one place client-side-only content COULD leak in (a `build.source: "compiled"` theme) already has a hard, enforced install-time gate rejecting it for exactly this reason (Finding 4). Nothing to build. |
| 12 | Bot-detection / per-user-agent response branching | The existing generic `RobotsRule[]` mechanism (Finding 2) is the right level of control. Don't build logic that serves different content to different user agents — that's a detection-evasion pattern in reverse and adds real complexity for no benefit once the pages are already static HTML any crawler can read identically. |

---

## Implementation plan

**Phase 1 — this sprint, rides along with the in-flight `docs-nav-pages` work**
- Heading/anchor discipline on the two doc pages — *no extra effort, already in scope; just don't drop it.*
- `schemaType: "TechArticle"` override on the doc posts — **XS** (~30 min: one field write + a test).
- `/llms.txt` route — **S** (0.5–1 day: new public route generating markdown from the same published-post enumeration `sitemap.ts`/`route-manifest.ts` already do; needs an explicit "which pages count as docs" tag or convention).
- AI-crawler robots.txt rule set — **XS engineering** (~1 hr, the mechanism already exists) **+ one owner decision** (blocked on UNRESOLVED #1 below).

**Phase 2 — next sprint**
- Markdown twin for doc pages — **M** (2–4 days: needs a real doc-JSON→Markdown renderer or an HTML→Markdown pass; decide which before starting).
- Register a `SitemapCollectHook` for doc/marketing pages — **S–M**, depends on where doc pages land (blocked on the Post→Page conversion already tracked in `development/SESSION-TASKS-2026-08-31.md:9`).

**Not now**
- MCP resource server for docs, `FAQPage`/`HowTo` structured data — revisit only if a concrete need shows up (see Skip table above for the trigger condition on each).

---

## Findings (verified against code/config, not memory)

1. **`llms.txt`** — real community convention, proposed by Jeremy Howard/Answer.AI, September 2024; spec published at llmstxt.org as plain CommonMark with a required H1. **Not** an IETF/W3C standard. 2026 adoption trackers disagree wildly by methodology (8.7% of Tranco top 1,000 to 51.8% of a small reachable-host panel), but the two large content-outcome studies (SE Ranking ~300k domains, Ahrefs 137k domains/May 2026) found **no measurable AI-citation benefit**, and Google's June 2026 documentation states Search ignores the file entirely. Its one confirmed, real use: dev-facing agentic tools (Cursor, Windsurf, Claude Code, GitHub Copilot, Cline, Aider) explicitly look for `/llms.txt`/`/llms-full.txt` when pointed at a documentation site by a person — which matches the owner's stated scenario closely enough to be worth shipping, just not as a general SEO play.

2. **robots.txt / sitemap.xml already exist and work.** `GET /robots.txt` is live at `apps/website/src/server/inbound/public-http/routes/site/robots.ts:14`, built from `buildRobots` (`apps/website/src/features/seo/sitemap.ts:94-103`), which reads `SeoSettings.robotsRules` — an already **per-user-agent** rule array (`RobotsRule[]`, `apps/website/src/features/seo/settings.ts:55`) — but the seeded default is an empty list, so no AI-crawler policy exists today by default. `buildSitemap` (`apps/website/src/features/seo/sitemap.ts:74-82`) is real, cached, invalidated on publish/update/unpublish (`sitemap.ts:105-127`), and already excludes unpublished/`noindex` entries. It only covers `PostRepoPort` rows today — the `SitemapCollectHook` registry meant to let other route kinds (static-theme marketing pages) register into it exists but is documented as "live-but-empty... zero real registrants in v1" (`sitemap.ts:16-18,34`). The backlog independently flags per-bot granularity as unconfirmed: `development/todos.md:1081,1085`.

3. **JSON-LD is already auto-generated per page, at `TechArticle`-ready granularity.** `getEntryMeta` (`apps/website/src/features/seo/seo.ts:215-238`) builds one JSON-LD object per Post/Page via `buildJsonLdEntry` (`seo.ts:198-206`), typed by `CONTENT_TYPE_SCHEMA_MAP` (`seo.ts:23-26`: `post → "Article"`, `page → "WebPage"`), with a per-post `schemaType` override already wired (`resolveContentTypeFields`, `seo.ts:157-160`; override field declared at `apps/website/src/features/seo/types.ts:158`). Emission happens through `createSeoPageHeadHook` (`apps/website/src/features/seo/page-head-contributor.ts:98-103`) at priority 900, which also auto-emits `BreadcrumbList` JSON-LD when an entry has ancestors (`page-head-contributor.ts:46-63`) and an always-present canonical `<link>` (priority 120) for every route, entry-backed or not (`page-head-contributor.ts:72-78,87`).

4. **AI-crawler-safe rendering is already a real, enforced constraint — not a gap.** `apps/website/src/features/theme/build-conformance.ts:48-52` and `apps/website/src/features/theme/code-tier-asset-normalizer.ts:30-37` name GPTBot, ClaudeBot, and PerplexityBot explicitly as "execute no JavaScript whatsoever," and use that as the stated justification for rejecting a `build.source: "compiled"` theme whose content only exists after client-side hydration (`checkIslandContent`, tested at `apps/website/src/features/theme/__tests__/theme-compiled-load-gate.test.ts:160`). This means Tovu's rendering architecture already treats "readable without executing JS" as a hard install-time gate for the one theme path that could violate it — the doc pages, which render through the ordinary server-side `renderDocNode` path (`apps/website/src/server/inbound/public-http/http/site/render.ts:1137`) from TipTap JSON seeded at `apps/website/src/server/runtime/configuration/seed.ts:91,100,246-253`, never hit that risk at all.

5. **No markdown/JSON content-negotiation twin exists.** A repo-wide search for `text/markdown`, `Accept`-header content negotiation, and any doc-JSON→Markdown converter found nothing beyond one unrelated comment (`forms-submit.ts:31`, about a different negotiation). The only text-extraction helper is `extractPlainText` (`apps/website/src/features/seo/seo.ts:33`), which strips a TipTap doc down to bare text for meta-description generation — lossy, no headings/links/lists preserved, not fit for reuse as a Markdown twin without real rework.

6. **A full static-export pipeline already exists** and enumerates every public route from the same source of truth the live server renders from: `apps/website/src/platform/export/route-manifest.ts` (308 lines) + `apps/website/src/platform/export/site-exporter.ts` (872 lines). This is the natural integration point for generating `llms.txt`/sitemap-adjacent artifacts for the static-hosting deployment path specifically, if/when that path needs its own generation step separate from the live server's route.

7. **No MCP resource surface exists anywhere in this repo.** A repo-wide search (Tovu and Jini both) for MCP resource registration patterns (`registerResource`, `server.resource(`, `ListResourcesRequestSchema`, `resources/list`, `ResourceTemplate`) returned zero matches. The only real MCP surface is `tovu introspect --format mcp` (`apps/website/src/cli/commands/introspect.ts:1-39`), which reshapes the CLI's own `init`/`serve`/etc. command tree into MCP tool definitions for a subprocess-driving agent (e.g., Tovu-Runner) — an entirely different concern from serving documentation content, and not something "expose docs as MCP" would extend rather than build from scratch.

## UNRESOLVED

1. **Which AI crawlers to allow vs. block is a business decision, not an engineering default.** The mechanism (`RobotsRule[]`) is ready; the 2026 convention many sites are converging on is allow the search/citation bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot/Claude-User) while blocking the training bots (GPTBot, CCBot, ClaudeBot, Google-Extended) — but that's the owner's call to make deliberately, not something to default silently.
2. **Where the doc pages ultimately live (Post vs. Page) isn't settled yet.** `development/SESSION-TASKS-2026-08-31.md:9` tracks converting `how-themes-work` from Post to Page (`PageKindMismatchError` — Posts can't carry HTML). Items 6 and 7 above (sitemap coverage, canonical-URL confirmation) depend on that landing first — don't build against the current Post-based shape if it's about to move.
3. **Whether Tovu wants `llms-full.txt`** (a full concatenated-content variant) in addition to the curated `llms.txt` index. Recommend starting with just `llms.txt`; the Ahrefs data found essentially no fetch activity for either file on sites lacking one, so there's no evidence yet that a `-full` variant would be used even by the coding-agent tools that do check for the base file. Add it later only if real request logs show agents asking for it.
