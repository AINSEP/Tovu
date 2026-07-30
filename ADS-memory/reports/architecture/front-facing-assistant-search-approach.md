# Front-facing assistant search/retrieval: NLWeb vs. bespoke MCP tools vs. direct DB calls

**Status:** Research only — no decision has been made, no code has been changed.
**Author:** Software Architect persona (automated research pass), 2026-07-30.
**Scope:** How the *public-site* assistant (visitor-facing, not the admin agent daemon covered by
ADR-049) should search/retrieve posts, pages, and products to answer visitor questions.

---

## 1. What each option actually is

### 1.1 NLWeb (Microsoft's open-source project)

Grounded from the project's own docs/repo (`github.com/microsoft/NLWeb`, whose canonical reference
implementation has since moved to `github.com/nlweb-ai/NLWeb` — the same org's imagery still shows
Microsoft's original authorship):

- NLWeb is **not a library you import** — it is a standalone **Python service** you stand up
  alongside (or in front of) your site. It ships five modules: `AskAgent` (the query engine),
  `AgentFinder` (cross-site agent discovery), `DataFinder` (NL-to-SQL for enterprise sources like
  HubSpot/Dynamics/Jira), `ModelRouter` (picks a cheap-enough LLM per query), and `NLWebScorer`
  (a neural re-ranker).
- It expects your content to already exist as **Schema.org-shaped structured data** (JSON-LD-style
  records) or RSS — i.e., it wants a feed of `Product`/`Article`/`WebPage`-typed records, not raw
  HTML pages or a SQL schema.
- Before it can answer anything, that structured feed has to be **embedded and indexed** into one
  of its supported vector backends: Qdrant, Milvus, Snowflake, Azure AI Search, Elasticsearch,
  Postgres (pgvector), or Cloudflare AutoRAG. This indexing is a **separate offline pipeline step**,
  not something that happens automatically as content is edited.
- It talks to an LLM per query (OpenAI, Anthropic, Gemini, DeepSeek, HuggingFace, etc.) to interpret
  the question and rank results.
- It **is itself an MCP server**: every NLWeb instance exposes an `ask` MCP tool/method, so an agent
  (or another site) queries it over MCP rather than a bespoke REST API. The project's own framing —
  quoted directly from its docs — is *"NLWeb is to MCP/A2A what HTML is to HTTP."*
- Config is YAML-driven; runtime is Python; it explicitly targets "everything from laptops to data
  center clusters." The docs are candid that **most production deployments don't index a copy of
  your content at all** — they wire NLWeb directly into the application and point it at the live
  database instead, which is a materially different (and much less documented/battle-tested) shape
  than the "index your Schema.org feed" happy path the project is built around.
- There is no first-party Node/TypeScript SDK or embeddable library — adopting NLWeb means running
  a second service, in a second language, with its own process lifecycle, config, and (for the
  index-based happy path) a duplicated, periodically-refreshed copy of Tovu's content.

(Note: this operator's environment mentions a local checkout at
`/Users/la/Programming/Jini/examples/nlweb-demo`; that path is not reachable from this sandbox, so
everything above is drawn from the public repo/docs rather than that example — flagged per this
task's instructions rather than assumed.)

### 1.2 A bespoke, purpose-built read-only MCP tool surface

This mirrors the pattern already fully built out in `src/assistant/tool-registrations.ts` and its
~21 domain `tool-registrations.ts` siblings (`src/features/post/tool-registrations.ts`,
`src/features/theme/tool-registrations.ts`, etc.), which is the file this codebase treats as ADR-049
Decision 4's assembly point. Concretely, the existing discipline is:

- One `agent-tools.ts` catalog per domain declaring tool ids, JSON-schema-validated inputs, and a
  declared `sideEffects` classification.
- One `tool-registrations.ts` per domain mapping each catalog id onto a real handler, with its own
  **independently-authored** risk classification (`AgentToolSideEffect`: `none` /
  `mutates-durable-state` / `deletes-durable-state`) — independent of the catalog's own claim, on
  purpose (`postDerivedRisk`, `themesDerivedRisk` in the files read for this report are exactly this).
- Every handler calls `requireToolPermission`/inline `authorize()` before touching data — the same
  `content.read`/`content.write` permission gate the admin HTTP routes use, per ADR-021.
- A single aggregator (`buildAssistantToolRegistrations`) composes every domain's registrations,
  refuses id collisions across domains, and fails the build if a catalog entry has no declared risk
  and no handler.
- Everything runs **inside the existing agent-daemon process** (`src/assistant/agent-daemon-server.ts`)
  — a separate OS process from Tovu's HTTP server, but still Node/TypeScript, still talking to the
  *same* SQLite file Tovu's main process uses (WAL-mode, shared file), and still going through
  `@jini-ai/daemon`'s `ToolExecutor`/`RunLifecycle`/event log.

A new `search`-flavored domain (e.g. `content_search`) in this style would add: a schema-validated
`content_search(query, kinds?, limit?)` catalog entry; a handler that runs a read-only query against
posts/pages/products (likely a simple LIKE/FTS query against Drizzle-backed tables, not a vector
index); a `none`-risk classification (pure read); and wiring into `DOMAIN_SLICES` in
`tool-registrations.ts` alongside the other 21 domains.

Important scoping note: this whole pattern, as it exists today, is the **admin/authenticated agent
surface** (the agent daemon serving the chat pane), not the anonymous public-site visitor. Building
this option for the *public-facing* assistant means either (a) exposing a second, differently-scoped
tool registry/daemon reachable by anonymous visitors with its own authorization tier (public
content only, no `content.write`, no admin-only fields), or (b) reusing the existing daemon with a
new "public" principal kind. Either way it is new plumbing, not a drop-in reuse of the existing
admin-scoped daemon — it inherits the *pattern*, not the existing wiring for free.

### 1.3 Plain/regular direct database calls

This is what the public site *already does* for pages and products, unrelated to any assistant. Read
directly:

- `src/server/routes/site/products.ts`: `GET /products` and `GET /products/:id` call
  `deps.store?.listProducts()` synchronously in the route handler, in-process, no protocol, no
  agent runtime involved at all.
- `src/server/routes/site/pages.ts`: `GET /` and `GET /:slug` call `listPublishedPosts`/
  `getPublishedPostBySlug` (`features/post`) directly against `deps.postRepo`, again synchronously,
  in-process.

Option 3 for the assistant means adding one more typed, in-process query function — e.g.
`searchPublicContent({ deps: { postRepo, store }, input: { query, workspaceId } })` — called directly
from whatever server route handles the assistant's search request (a new
`src/server/routes/site/assistant-search.ts` in the same style), returning already-published,
public-only rows. No MCP, no protocol envelope, no separate process, no risk-classification
machinery — just a function call, same as every other site route already is.

---

## 2. Comparison across the four criteria

### Quality (relevance/accuracy for real visitor queries against Tovu's content model)

- **NLWeb**: Best *ceiling* on relevance for genuinely fuzzy natural-language queries ("something
  cozy for a rainy weekend gift under $50") — that is the specific problem its embedding + neural
  re-ranker (`NLWebScorer`) pipeline is built to solve, and it is the only option of the three with
  real vector-semantic matching out of the box. But that ceiling is gated behind two things Tovu
  doesn't have today: (a) Schema.org-shaped export of posts/pages/products, and (b) a populated,
  periodically-refreshed vector index. Until both exist, NLWeb's quality advantage is theoretical.
  It also over-shoots the content model described in this brief — `DataFinder`/`AgentFinder`/
  cross-site discovery are enterprise/multi-site features Tovu's single-tenant CMS content (posts,
  pages, products) has no use for.
- **Bespoke MCP tool**: Quality is exactly what the handler author builds — realistically a
  keyword/FTS query (SQLite FTS5, or Drizzle `LIKE`) to start, upgradable to embeddings later
  *inside the same handler* without changing the tool's contract. No semantic search out of the
  box, but no gap between "what the option promises" and "what Tovu has wired," either.
  Straightforward to shape `content_search`'s result schema to what Tovu's content model actually
  needs (title, slug, kind, excerpt, price-for-products), because Tovu owns both ends.
- **Direct DB call**: Identical quality ceiling to the bespoke-MCP option (same underlying query
  code) minus the MCP envelope — the two only diverge on protocol overhead and where the
  authorization/schema discipline lives, not on retrieval quality. Anything true of one's
  search-quality is true of the other unless the team deliberately withholds a capability from one.

**Bottom line**: NLWeb wins only once semantic search over fuzzy queries is a real requirement *and*
the indexing pipeline is actually stood up and kept fresh; until then, options 2 and 3 tie on quality
because they'd share the same query code.

### Speed (latency)

- **NLWeb**: A full extra network hop — visitor's browser → Tovu's server → NLWeb's Python
  process/service (its own process, possibly its own host) → NLWeb's own LLM call for query
  interpretation/ranking → vector-store round-trip → back. This is the slowest path of the three by
  construction: it adds an LLM call (typically hundreds of ms to seconds) into the *retrieval* step
  itself, on top of whatever LLM call the visitor-facing assistant already makes to compose its
  answer.
- **Bespoke MCP tool**: Faster than NLWeb (no separate LLM-in-the-loop for retrieval, no cross-process
  vector-store hop for a keyword query), but still carries real overhead from Tovu's own existing
  architecture: per `agent-daemon-server.ts`'s own module doc, tool execution goes through
  `@jini-ai/daemon`'s `ToolExecutor`, is recorded into a `RunLifecycle` event log, and — critically —
  a run's tool calls are actually issued by a **spawned `jini-mcp` subprocess** talking to the daemon
  over HTTP (`/api/delegated-tool-calls`), which the daemon then dispatches to the in-process
  handler. That is at least one HTTP round-trip plus IPC/audit-sink overhead per search call, even
  though the handler itself is a fast in-process query once it starts running.
- **Direct DB call**: Fastest by a wide margin — a normal Express route handler calling a typed
  query function against the same SQLite connection the rest of the site already uses, the same
  path `products.ts`/`pages.ts` take today. No protocol envelope, no daemon hop, no event log write.

**Bottom line**: Direct DB call < bespoke MCP tool < NLWeb, in that order, and the gaps are not
small — NLWeb adds a whole LLM call to retrieval itself, and the bespoke-MCP path inherits Tovu's
existing daemon-hop overhead that a direct call skips entirely.

### Cost (infra/hosting + dev/maintenance)

- **NLWeb**: Highest cost on both axes. Infra: a second runtime (Python) to host and keep patched,
  independent of Tovu's Node/TypeScript stack; a vector database to run or pay for (Qdrant/Milvus/
  Elasticsearch/Azure AI Search/etc. — none of which Tovu runs today); ongoing LLM spend for the
  retrieval step itself, separate from whatever the visitor-facing chat already spends on answer
  composition. Dev/maintenance: a new dependency + protocol surface to track upstream (the project
  is young — it moved orgs from `microsoft/NLWeb` to `nlweb-ai/NLWeb` already), a data pipeline to
  build and keep the Schema.org export fresh as content changes, and a second config/deploy story
  (YAML, Python env) alongside Tovu's existing one. This is a genuinely new subsystem, not an
  extension of one.
- **Bespoke MCP tool**: Low infra cost (no new service, no new database — it's a new Drizzle query
  against tables that already exist), but real dev cost in *ceremony*: a new domain needs its own
  `agent-tools.ts` catalog, `tool-registrations.ts` handler, risk classification, schema validation,
  and — as noted in §1.2 — likely a whole new authorization tier for anonymous public callers, since
  the existing tool-registration discipline was built for the authenticated admin daemon. That's
  meaningfully more code and more moving parts than option 3 for a capability that is, at bottom,
  "search some already-public rows."
- **Direct DB call**: Lowest cost on both axes. No new infra. Dev cost is one query function plus
  one route handler, in the exact idiom `products.ts`/`pages.ts` already use — the kind of change a
  reviewer familiar with this codebase can assess in minutes, not a new subsystem's worth of tests.

**Bottom line**: Direct DB call is cheapest; bespoke MCP tool is a moderate step up in ceremony (not
infra); NLWeb is a full new subsystem with recurring infra and LLM cost.

### Architectural fit

- **NLWeb**: A clear outlier against this codebase's conventions. Tovu's whole `assistant/` surface
  (ADR-049) is explicitly built as an in-process, typed, authorization-gated tool registry over
  Tovu's own domain code — see `mcp-federation/`'s posture for the closest analogue to "talk to an
  external tool-shaped thing," and it is instructive precisely because of how cautious it is: read-only
  by default, an operator-authored allowlist independent of the vendor's own claims, pinned package
  versions, fail-open-at-boot/fail-closed-on-misconfig, and a documented refusal to expose writes
  until a confirmation transport exists. NLWeb would be the *first* case of Tovu depending on a
  same-shape external service for a *default, always-on, visitor-facing* feature rather than an
  opt-in admin integration — a materially different trust and availability posture (if NLWeb's
  process is down, the public site's search goes down with it, unlike an admin-only integration).
- **Bespoke MCP tool**: Excellent fit *in spirit* — it is exactly the `tool-registrations.ts` pattern
  this codebase has proven 21 times over. But it is a fit for the **admin agent surface's shape**,
  not literally the public site's existing routing, and (per §1.2) using it for anonymous public
  visitors means building a parallel authorization/principal story the existing 21 domains don't
  need, because none of the existing tools are meant to be called by an unauthenticated visitor.
  That's a real, non-trivial extension of the pattern, not a pure reuse of it.
- **Direct DB call**: Exact fit with zero extension needed — it's the identical shape
  `registerProductRoutes`/`registerSiteRoutes` already use for every other piece of visitor-facing
  content. No new authorization model, no new protocol, no new process boundary. The only argument
  against it is that it doesn't reuse the MCP tool-catalog discipline at all — which matters if this
  assistant is meant to later grow into something that reasons over multiple tools/actions (not just
  search), because then the tool-registry pattern would already be there to extend.

**Bottom line**: Direct DB call fits today's conventions exactly; the bespoke MCP tool fits the
*spirit* of ADR-049 but requires inventing a new public/anonymous authorization tier that doesn't
exist yet; NLWeb is architecturally foreign on every axis this codebase currently cares about
(runtime, trust model, availability coupling).

---

## 3. Recommendation

**Start with Option 3 (direct DB calls) for the search itself; do not adopt NLWeb for this feature.**

Reasoning, stated plainly:

1. The visitor-facing assistant's search need, as scoped in this brief, is "find relevant
   posts/pages/products for a visitor's question" — not cross-site agent discovery, not NL-to-SQL
   over enterprise systems, not multi-tenant federation. NLWeb's actual feature set (AgentFinder,
   DataFinder, ModelRouter) is built for a different, broader problem than the one Tovu has. Adopting
   it here means paying for a Python service, a vector database, and a second LLM call per query to
   get a keyword-search-equivalent result on a small, already-in-process content set — until and
   unless fuzzy semantic queries over a large catalog become the actual bottleneck, this is buying
   infrastructure the requirement doesn't call for yet.
2. Between the bespoke-MCP-tool and direct-DB-call options, the honest answer really does depend on
   one thing, named precisely: **whether the assistant's *only* current job is to fetch data (a
   pure read), or whether it is meant to grow, in the near term, into something that reasons over
   multiple public-facing tools/actions (e.g., "add to cart," "subscribe to newsletter," "check
   order status") that would benefit from the schema-validated, risk-classified, authorization-gated
   discipline the existing tool-registration pattern already provides.**
   - If it's staying a pure read for the foreseeable future: a direct DB call, exactly like
     `products.ts`/`pages.ts`, is strictly better on speed and cost with no quality tradeoff, and
     nothing is lost by not routing it through MCP.
   - If the roadmap genuinely includes more public-facing agent actions soon, building the search
     capability as a `content_search`-style tool from the start avoids a rewrite later — but that
     still means designing the new anonymous/public authorization tier called out in §1.2 and §2
     up front, as a deliberate decision, not an afterthought.
3. Whichever of options 2/3 is chosen, it's a straightforward, low-risk decision to revisit later:
   both share the same underlying query code, so starting with a direct DB call and wrapping it in a
   tool registration later (if the roadmap calls for it) costs little. Starting with NLWeb and later
   deciding it was overkill costs a live migration off a second running service, a vector index, and
   a Python dependency — the asymmetry in switching cost is itself an argument for starting simple.

**If a human wants NLWeb's specific capability (true semantic/fuzzy search across a large content
volume) without its operational weight**, the narrower middle path worth naming explicitly: keep the
retrieval as an in-process/tool-registered function (option 2 or 3) but back it with a lightweight
embedding index Tovu owns and runs in-process (e.g., SQLite + a vector extension, or a small
embeddings table scored in application code) rather than adopting NLWeb's separate-service model
wholesale. That gets most of the quality benefit NLWeb targets while staying inside this codebase's
existing runtime and trust boundaries — worth a follow-up spike if "quality" turns out to be the
actual sticking point once real visitor queries are seen in practice.
