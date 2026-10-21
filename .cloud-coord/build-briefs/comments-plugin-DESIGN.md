# DESIGN (no lots yet): Comments as a plugin with providers

Code read: `tovu-int` (integration/2026-10-20), `jini-int`. This is a design for owner review. Build lots come after
the answers.

## Goal (owner terms)
Comments stop being a core module. They become a plugin you can turn on or off, and you pick **where comments
live**:
- **Built-in**: stored in our database and moderated in Tovu. This is today's feature, moved into the plugin.
- **Vendor**: the vendor stores and moderates the comments, and we embed its widget (Giscus/GitHub Discussions, Disqus, and others).

Note that Google has no comments product (Blogger's comments are not embeddable elsewhere).

## Where it is today (what moves)
- Engine (Jini, generic, already plugin-shaped):
  - `jini-int/packages/cms/src/comments/` holds `ports.ts` (`CommentRepoPort`, `SpamCheckPort`), `ingress.ts` (`CommentIngressPolicy`: rate limit, honeypot, sanitize, spam), `write-service.ts`, `sql/repo.ts`, `spam.heuristic.ts` and `express/submit-handler.ts`.
  - Its header already calls it "the Comments bundled plugin (ADR-031)".
- Admin screens (Jini): `jini-int/packages/admin/src/comments/` (queue + settings module).
- Tovu wiring (core today):
  - `apps/website/src/features/comments/`: the data module declares tables `p_comments__comments` and `p_comments__moderation_log` under `COMMENTS_PLUGIN_ID`, tier-2 (`types.ts`), plus `settings.ts` (6 keys), 8 agent tools (`agent-tools.ts:109-194`) and `ip-hash-salt.ts`.
  - It is composed in core at `server/runtime/composition/deps.ts:259,275,307`, `app.ts:236,2344` and `tool-catalog-manifest.ts:26`.
  - The public route is `server/inbound/public-http/routes/site/comments-submit.ts`. The admin panel is People → Comments (`apps/admin/src/panels.tsx:477`, `features/comments/index.ts`).
- **Surprise:** comments can be submitted and moderated, but **no theme displays them**. `listThreadForEntry` has no Tovu caller, and no theme has a comment form or a thread. "Built-in provider" therefore includes building the public thread + form for the first time.

## Proposed shape
**1. The generic contract follows Jini's existing `@jini-ai/capability-providers` pattern**

Existing pattern (`jini-int/packages/capability-providers/`):
- Root ports, one interface per capability, each with a DI token built on core `token()` (`src/tokens.ts:10-14`). Adapters sit at separate subpaths `./adapters/*`, and in-memory stubs live only under `./unsafe-reference`.
- Two rules from its header (`src/index.ts:1-10`): **no optional-method umbrella bag**, so a consumer sees only the ports it binds; and core `bindings()` owns DI, so the package adds no second DI registry.
- The `./visitor-auth` subpath is the closest precedent for "pick one of several vendors":
  - frozen provider **definitions**, metadata only: `definitions.ts:20-31`, with an `implementation: 'metadata-only'` honesty flag;
  - a validated definitions **registry**: `registry.ts:17-22`, with `register`/`get`/`has`/`list`;
  - narrow **ports**: `ports.ts`;
  - **tokens** per port: `tokens.ts:13-33`.

Comments copy that shape as a new subpath, `@jini-ai/capability-providers/comments` (universal, types + pure validation only):
```ts
// definitions.ts — frozen data, validated by the registry (visitor-auth rules: URL-safe id, non-empty label)
interface CommentsProviderDefinition { id: string; label: string; kind: "stored" | "embedded";
  consentCategory: "functional" | "marketing";
  csp: { scriptSrc: string[]; frameSrc: string[]; connectSrc: string[]; styleSrc: string[] };
  settingsSchema: readonly CommentsSettingField[];   // like visitor-auth credentialSchema (public | secret)
  implementation: "metadata-only" | "adapter" }
// registry.ts — CommentsProviderRegistry { register, get, has, list } (the visitor-auth registry shape)
// ports.ts — split ports, NOT one bag with optional members:
interface CommentThreadRendererPort {   // every provider
  renderThread(required: { providerId; entry: { id; slug; title; canonicalUrl }; settings; locale },
               optional?: { nonce?: string }): Promise<{ html: string }> }   // escaped, no inline handlers
interface CommentModerationPort { /* listQueue, get, apply, purge: a subset of today's CommentRepoPort */ } // stored only
// tokens.ts — CommentsProviderRegistryToken, CommentThreadRendererToken, CommentModerationToken
```
- The built-in stored adapter is the existing engine in `@jini-ai/cms/comments`. It implements both ports, importing the types only, so there is no runtime dependency and no cycle.
- Vendor adapters are mostly data (an embed template plus CSP) plus a tiny renderer.

Why not reuse the root five ports or put this under `cms`:
- Comments are a new capability, not auth/storage/db.
- Putting the contract beside visitor-auth keeps the "swappable vendor capability" contracts in one package. The `cms/comments` engine stays where it is, as one adapter.

**Caution:** neither the root ports nor visitor-auth has a Tovu consumer yet. Grep finds no `@jini-ai/capability-providers` import in `tovu-int/apps`, and visitor-auth adoption is still a todo (`development/todos.md:1073`). Comments would be the **first real consumer** of the pattern. The first lot should therefore wire it end to end with the built-in provider before adding any vendor.

**2. The host plugin system (Tovu): the same loader seam as deploy targets and mail adapters, binding into the Jini registry**
- Vendor adapters ship as self-contained bundled agent plugins. Each `.mjs` implements the Jini port types, and Tovu's trusted loader registers its definition and renderer into `CommentsProviderRegistry` at composition. Copies under `capability-providers/adapters/*` come only when a second Jini host needs them.
- A plugin ships `tovu-comment-providers.json` (`[{ id, label, module }]`). The loader mirrors `features/deployments/deploy-targets/registry.ts` and `features/agent-plugins/mail-adapter-registry.ts`.
- The trust rule is the same: the plugin is active, its digest is a bundled digest, and its module is contained and ends in `.mjs`.
- Core keeps only:
  - the composition binding of the Jini `CommentsProviderRegistry` and the two port tokens (no Tovu-owned registry);
  - the active-provider setting `core.comments.provider` (one per site);
  - a theme marker `{"type":"comments"}` resolved by the existing `data-embed-config` marker pass (`features/theme/static-render.ts:783-812`, the same family as `partial`/`widget`/`menu`);
  - the public submit route, which dispatches to the active **stored** provider;
  - the generic `comments_*` tools, which route to the active provider's `moderation` port. A vendor without moderation answers "Moderated at <vendor>" plus a dashboard link.
- Plugins never import each other: a provider plugin asks the host registry at runtime and degrades to "no comments" if the plugin is off.

**3. The built-in provider = a bundled plugin `comments`, seeded ON**
- It keeps `COMMENTS_PLUGIN_ID` and the `p_comments__*` tables, so **no data migration**; only composition moves.
- Its module gets host ports: the data-module repo, the settings slice, the rate limiter, the IP-hash salt and `SpamCheckPort`. Today's admin queue mounts only while it is the active provider.
- New in this provider: `renderThread` (approved comments, threaded to `max_depth`) plus a no-JS `<form method=post>` to the existing submit route.

**4. Vendor providers (one small bundled plugin each, or one `comments-embeds` plugin with several modules)**

| Provider | Storage / moderation | Visitor needs | Consent category | Notes |
|---|---|---|---|---|
| Giscus | GitHub Discussions; moderate on GitHub | GitHub login | functional | Free, no ads. Needs a public repo with Discussions + the giscus app |
| Utterances | GitHub Issues | GitHub login | functional | Older, simpler |
| Disqus | Disqus | Disqus/social login or guest | marketing | Ads + tracking on free tier; has an XML import |
| Cusdis / Remark42 / Commento | Vendor or self-hosted | Optional | functional | Privacy-first options |

Embedded providers work on **static exports** (client-side). The built-in stored provider cannot accept a POST on a static host; this is the same limit consent and forms have (later: Worker/D1).

## Migration path for existing data
- Built-in: nothing moves. Same plugin id and same tables; the composition code moves from `features/comments` into the plugin's module and host-port adapter.
- Switching to a vendor: existing comments **stay in the DB, untouched and hidden**. Switching back shows them again.
- An optional later step is "export comments" to the vendor's import format (Disqus WXR). It is OUT of v1. Uninstalling the plugin keeps the data, per the plugin data rule (todos.md:98).

## Moderation and spam
- Stored: unchanged. The ingress policy and heuristic spam stay, and the "external service" adapter slot (`SpamCheckPort`) can host Akismet-style vendors later.
- Embedded: moderation happens at the vendor. The admin page shows the provider, its status and a link to the vendor dashboard.

## Agent tools
- Keep the 8 `comments_*` names and dispatch them by provider.
- Add `comments_get_provider` and `comments_set_provider`. The set tool uses a confirmation card, because switching hides existing comments.
- A vendor plugin's settings (e.g. the Giscus repo/category) are written through its admin surface or a generic `comments_update_provider_settings`.

## Risks
- Consent: embedded scripts must carry `data-consent-category`, or the gate defaults third-party scripts to marketing and they stay paused. That is correct, but it surprises owners.
- CSP: each provider's `csp` is merged into the public CSP only while it is active.
- The public thread render is new visitor-facing HTML. It needs escaping tests and a Chrome look on several themes.

## Open questions (owner)
1. Should the built-in provider be a bundled **agent plugin** (same family as mail/deploy adapters, recommended) or a regular **site plugin** (`jini.plugin.json`, the way chart providers went on 10-13)?
2. Should there be one provider per site, or per content type (e.g. Giscus on docs, built-in on blog)? Recommendation: one per site in v1.
3. The public comment thread + form has never been built. Should it be built as part of this move, with comments shown on every post template via the new marker, or only where a theme places the marker?

## GAP-CHECK OVERRIDES (2026-10-21 16:15Z — Opus, Sonnet, Codex; raw: runs/plugins-gaps-2026-10-21/). These WIN over the sections above.
- **Contract home:** neutral contracts in `@jini-ai/capability-providers/comments` (2 of 3), but the adapter that connects the cms comments engine to the ports lives in Tovu's comments module, not in `cms` (cms doesn't depend on capability-providers, `cms/package.json`). `cms/comments` stays the engine.
- **Missing ports:** add a submission port (renderer + moderation can't dispatch a public submit) and provider-to-adapter resolution with site scope, readiness and atomic selection (visitor-auth's registry stores definitions only, `capability-providers/src/visitor-auth/registry.ts:17`).
- **Keep data + queue:** table identity, settings, salt, moderation history and the pending queue stay. The moderation queue stays readable while stored rows exist, even if a vendor is selected; switching warns with the pending count. Boot guard: a site with stored comments defaults to the built-in provider. Disabling gates routes AND tools, not just screens.
- **Public form + thread (net-new attack surface):** urlencoded body parser + 303 redirect to the page with `#comment-pending` for no-JS (today JSON only, `cms/src/comments/express/submit-handler.ts:101-105`); Origin/CSRF check; keep honeypot + spam checks; **fix the rate-limit key** (`authorIpHash ?? "unknown"`, `ingress.ts:135-137`) so visitors behind Fly's proxy don't share one bucket — verify trust-proxy + IP hashing; **moderated (held) by default**; escaping test corpus; never render email/IP hash; bounded depth; ~200 per page with paging.
- **SEO/caching:** server-render approved comments per request for the built-in provider; invalidate on approve/selection/disable; static exports bake comments at export time (state it). Vendor threads are client-only (no SEO; state it).
- **Vendors:** only AFTER the cookie-consent gate lands — embeds paused until consent with a "load comments" control (reuse the consent work, no second gate); per-provider CSP metadata stored now (public CSP is report-only today); Giscus maps threads to entry id, not URL; vendor moderation = link + status only, never claims local moderation succeeded. v1 ships the built-in provider only.
- **Tools:** existing 8 + get/set provider; `comments_set_provider` uses a confirmation card; clear answers when no provider is active.
- **Order:** do not seed a new bundled comments plugin until the plugin-lifecycle J3 lands (seeding/digest-ledger conflict). Build from a clean base (`composition/app.ts` has uncommitted live-tree changes). One writer per shared file (`features/agent-plugins/*`, `bundled-catalog.ts`, `composition/app.ts`). No coverage wave on `cms/comments` or `agent-plugins` while these builds run.
- Later: Disqus WXR export, Akismet, vendor sync.
