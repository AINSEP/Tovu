# ADR-054 — The public visitor assistant is a separate product from the admin assistant

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** user (product), Coordinator (Review Mode)
- **Supersedes / amends:** nothing. Complements ADR-049 (admin assistant dock).

## Context

The admin assistant (`AssistantDock` → `ChatPane`, ADR-049) works and now accepts image
attachments. The request was to put that same chat on the **public site** — every page, not one
route.

Measuring the public site settled the shape of the problem:

- It is **fully server-rendered HTML with zero JavaScript**. The only `<script>` on a rendered page
  is `application/ld+json`. Verified against `GET /welcome`.
- Rendering goes through `src/server/http/site/render.ts` across five themes in `src/themes/`
  (`tovu-official`, `handlebars`, `liquidjs`, `column`, `grayscale`).
- The only JS bundle Tovu serves anywhere is `apps/admin/dist`, mounted at `/admin`
  (`src/server/app.ts:760-762`). The only other static mount is `/agent-icons`.

So "put the chat on the frontend" is not a component mount. It needs a browser bundle, a static
mount, an injection point, and an endpoint.

The endpoint is where the real decision lives. Every existing assistant route is behind
`requireAdminSession`, and the daemon it fronts **spawns a coding-agent CLI process per run** with
filesystem access and MCP access to Tovu's registered tools — entries, forms, identity, widgets,
including writes. Exposing that path to anonymous visitors would mean any visitor can rewrite the
site, and N visitors spawn N processes.

## Decision

**The public visitor assistant is a separate product that shares only UI components with the admin
assistant.** It does not reuse the admin's transport, endpoint, or agent backend.

### 1. Backend — the direct-provider proxy, not the agent-CLI daemon

Mount `@jini-ai/http-kit`'s existing `registerModelProxyRoutes`
(`POST /api/proxy/{anthropic,openai,azure,google,ollama}/stream`) — a thin SSE relay to a model
API. Already built and tested (`http-kit` 83/83) and, until now, **mounted by nothing in Tovu**;
`grep -rn "api/proxy" src apps/admin/src` returned zero hits. Jini's own server mounts it at
`packages/server/src/builtin-features.ts:389`.

Chosen because the two backends differ on exactly the properties that matter for an anonymous
endpoint:

| | agent-CLI daemon | direct-provider proxy |
|---|---|---|
| OS process per run | **yes** — trivial DoS | no, in-process |
| filesystem access | **yes** | no |
| MCP tool surface | **yes, write-capable** | **none by default** |

The last row is the decisive one: the proxy has no tool surface, so the allowlist below is
**additive** rather than a subtraction from a write-capable agent. Restrictions that must be
enumerated are restrictions that can be forgotten; a default-empty surface fails closed.

### 2. Tool surface — read-only content only

Allowlist, and nothing else:

- `search_published_entries`
- `get_published_entry`
- `list_categories`

Explicitly denied: every create/update/delete; identity/users/roles; settings; widgets; forms; and
**all drafts and unpublished content**. Published-only is part of the contract, not an
implementation detail — an assistant that can read drafts leaks unreleased content to the public.

### 3. The API key is server-side, always

The visitor's browser never sees a provider key. The proxy reads it from server env. This is the
whole reason the relay exists rather than calling a provider from the client.

### 4. Injection at the renderer, not per theme

Inject the mount node and script once in `src/server/http/site/render.ts`, not into five theme
templates. Per-theme injection means five places to keep in sync and silently omits the chat from
any custom theme a user writes — which contradicts "on the frontend, period."

## Consequences

**Good**

- The public surface cannot spawn processes, touch the filesystem, or write content — by
  construction, not by configuration.
- Reuses `ChatFab`/`ChatPane` unchanged, so the two assistants stay visually consistent for free.
- Finally gives the model-proxy route a real consumer.
- The admin assistant is untouched; no regression risk to a working feature.

**Costs and open risks**

- **A new build target.** The public bundle is the second one in the repo. It must not import admin
  code — a build-level boundary worth a check, since an accidental import would ship admin
  internals to anonymous visitors.
- **Anonymous endpoint hitting a paid API is a cost-attack surface.** Rate limiting is required
  before this ships publicly, and is not optional hardening. Not yet designed — see Open.
- **Gemini is not usable with tools here yet.** Measured 2026-08-03: `google-messages.ts` sends no
  `thought_signature` and every currently-served Gemini model rejects the tool continuation with
  HTTP 400. See `ADS-memory/reports/refactors/2026-08-03-image-send-capability.md`. Anthropic and
  OpenAI are unaffected.
- Every rendered page grows by a script tag and a bundle fetch. Should be deferred/async so it
  never blocks first paint.

## Open

1. **Rate limiting design** — per-IP, per-session, or a global budget cap? Needs a decision before
   public exposure.
2. **Does the chat render for logged-out visitors only, or everyone?** If an admin browsing their
   own site sees the visitor assistant, they get the weaker one and may think it is broken.
3. **Prompt-injection via published content.** The assistant reads entries the site owner wrote; a
   compromised or user-submitted entry could carry instructions. Read-only tools bound the blast
   radius but do not eliminate it.

## Evidence

- `GET /welcome` — zero executable `<script>` tags.
- `src/server/app.ts:760-771` — the only static mounts.
- `grep -rn "api/proxy" src apps/admin/src` → 0 hits (Tovu never mounted the proxy).
- `packages/http-kit/src/model-proxy.ts` — route shape; `packages/server/src/builtin-features.ts:389`
  — Jini's own mount.
