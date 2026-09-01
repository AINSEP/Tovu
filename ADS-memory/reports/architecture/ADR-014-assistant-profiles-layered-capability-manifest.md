# ADR-014: One Assistant Engine, N Profiles — a Layered Capability Manifest across Tovu / Tovu-Runner

- Status: ACCEPTED — **⚠️ §3's capability clause ("Tovu never imports Runner tools; Runner composes site tools + its own") has been SUPERSEDED (accepted 2026-08-29) by: [ADR-061](ADR-061-runner-tools-for-tovu-site-assistant.md)** grants the admin-context assistant a strictly allowlisted, non-destructive subset of `runner.*` (currently `runner.create_site` alone) via Tovu's generic external-MCP extension point. ADR-011's one-way *dependency* arrow is unaffected — no Runner code or type enters Tovu — and everything else below (the Profile model, the `contexts`/`scope`/`auth`/`effect` axes, the layered manifest, server-side enforcement) is unchanged and is what ADR-061 builds on. Read ADR-061 before treating §3's capability sentence as current.
- Date: 2026-07-06
- Author: Claude Opus 4.8 / Leon Aburime
- Extends: ADR-013 (assistant, tool `surface`). Depends on ADR-011 (topologies),
  ADR-012 (site = template instance), ADR-006 (rule of two), ADR-007 (scoping).

## Context

Two decisions collided and forced this one.

**Repo split.** The codebase is separating into two repos (rename already begun:
`Tovu` → `Tovu-Runner`):

- **Tovu** — the *website product*: the deployed site's frontend renderer, the
  per-site admin, the content model. This is ADR-011's shared, versioned runtime
  and ADR-012's template. WordPress-like: one binary boots an install-dir.
- **Tovu-Runner** — the *desktop host* (Jini engine) that instantiates sites and
  owns generation / assets / videos / tasks. This is ADR-011 **topology 2**, and
  it is what the current `web/src` operator shell (rail pages, Websites, the FAB)
  already is.

The correction the split must respect (ADR-012): the Runner does **not** "spawn
Tovu repos." It spawns **site install-dirs** (`config.json`, `content.db`,
`uploads/`, `themes/`, `plugins/`) served by **one versioned copy** of the Tovu
runtime it bundles. A site is a *data folder*, not a git clone; a full copy
happens only at `tovu build <site>` (ADR-012 export). Dependency arrow stays
one-way: **Runner → Tovu, never reverse** (ADR-011).

**Three chat contexts.** The assistant appears in three places:

1. **Consumer** — chat on a *deployed, public* website: search articles/products.
   Anonymous, internet-facing, read-only, scoped to one site's published content.
2. **Admin** — chat on a deployed site's *backend*: carry out operator commands
   for that one site. Authenticated, write, single-site.
3. **Operator** — chat in Tovu-Runner (what we build now): create many sites,
   generate assets/videos, queue Runner tasks. Owner-level, multi-site + global.

The wrong reading is "three chat systems." The right reading, and ADR-013's
intent, is **one engine + one capability registry** — but ADR-013's registry only
carries the `surface: frontend | data` axis (*where a tool executes*). These three
contexts differ on a **second axis ADR-013 never wrote down**: *who is asking and
what they may do*. Without that axis, one registry cannot safely serve all three.

## Decision

**Not three chats. Not "one chat with a filter." One assistant *engine* plus N
declarative *profiles*, driven by one capability manifest that is *layered* across
the two repos.**

### 1. Extend the tool-registry entry with the missing axes

Every tool in the `tools.ts` registry (ADR-013) declares, in addition to
`surface`:

| Field | Values | Purpose |
|---|---|---|
| `surface` | `frontend \| data` | where it executes (ADR-013, unchanged) |
| `contexts` | `(consumer \| admin \| operator)[]` | which profiles may expose it |
| `scope` | `site \| workspace \| global` | what it addresses |
| `auth` | `public \| member \| admin \| owner` | minimum principal |
| `effect` | `read \| write \| destructive` | HITL gating (destructive ⇒ confirm) |

### 2. A Profile selects capabilities per session

A **Profile** = `(context, persona/system-prompt, tool filter, skill set, runtime
binding)`. Consumer / admin / operator are three profiles. Per session the
exposed toolset is *computed*, not hand-listed:

```
exposed = registry.filter(t =>
  t.contexts.includes(session.context) &&
  principalRank(session.principal) >= principalRank(t.auth) &&
  scopeMatches(t.scope, session.scope))
```

`search_tools` (ADR-013) keeps a large exposed set bounded. The chat client
(CopilotKit headless), the wire protocol (AG-UI), and the composer are identical
across profiles — only the profile differs.

### 3. The manifest is layered like the runtime, not centralized

The registry is **composed**, mirroring the one-way repo arrow:

- **Site-level tools ship inside Tovu** (they deploy with the site online):
  `search_products`, `search_articles` (consumer · public · read · site);
  `publish_post`, `set_theme` (admin · admin · write · site).
- **Operator tools ship inside Tovu-Runner**, layered **above** the site
  registry: `create_site`, `generate_video`, `queue_task` (operator · owner ·
  write · workspace/global).

Tovu never imports Runner tools; Runner composes site tools + its own. This
layering *is* the modularization — the manifest splits along the same seam the
runtime does.

### 4. Runtime binding is a port, chosen per deployment (ADR-006/011)

Same chat abstraction, different bound implementation:

- Consumer/admin run **online** → hosted/BYOK `LLMPort` (ADR-011 standalone; no
  Electron, no local CLI).
- Operator runs in the **Runner** → local-CLI agents + generation (ADR-013 Tier
  2), falling back to BYOK (Tier 1).

### 5. Skills and persona are part of the profile (ADR-013 §6)

Skill packs are context-tagged: `make-website` / `make-deck` are operator-only; a
"find me a product" skill is consumer. Persona (system prompt) differs per
profile: consumer = shopping/search host; admin = ops copilot; operator = builder.

## Consequences

- **The filter is a security control, not UX.** Consumer chat is anonymous and
  internet-facing: the exposed set must be **computed and enforced server-side**
  on the deployed site. The client is never trusted to hide admin/operator tools.
- **Data isolation (ADR-007).** Consumer search returns only *published* content
  of *its* site — no drafts, no cross-site leakage, no PII surfaced via the LLM.
- **Public consumer chat needs rate-limiting / abuse controls.**
- **Session storage splits by tier (ADR-013).** Consumer/admin transcripts live
  in the site's `content.db`; operator sessions in the platform DB.
- **The manifest schema is now a cross-repo contract** (Runner ↔ Tovu) — pin a
  minimal surface and contract-test it against a fixture, or the two repos drift
  silently (same version-coupling discipline as ADR-011's daemon boundary).
- **Rule of two is satisfied for real:** `LLMPort` = {hosted/BYOK, local-CLI};
  profiles = {consumer, admin, operator}; registry sources = {site (Tovu),
  operator (Runner)}.
- **ADR-013 is extended, not replaced:** `surface` stays; `contexts/scope/auth/
  effect` + `Profile` are added. The A12 appendix's `@tovu/ai` remains superseded
  by `tools.ts`.

## Rejected alternatives

- **Three separate chat runtimes** (one per context). Rejected: triples the client
  / composer / protocol surface, and makes the security boundary ad-hoc per app
  instead of one enforced filter.
- **One flat global registry** shared verbatim by all contexts. Rejected: cannot
  express that operator tools must never reach a public consumer session, and
  forces Tovu to know about Runner-only tools (violates the one-way arrow).
- **Client-side tool hiding.** Rejected as a security model: an anonymous
  internet client cannot be trusted to withhold admin/operator capabilities.

## Deferred

- Concrete `Profile` type + `tools.ts` schema in code (next step).
- The specialized-webapp product (Lovable/Bolt-style) as a second *generative
  template kind* under the same platform — its own ADR (declarative-vs-generative
  axis, containment story for generated code).
