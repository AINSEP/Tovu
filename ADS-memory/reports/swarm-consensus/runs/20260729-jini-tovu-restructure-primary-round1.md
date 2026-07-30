# Primary (Claude Sonnet 5) — Round 1 frozen first-pass answer

Written before any peer dispatch, before reading any peer output. Debate: `jini-tovu-restructure`.

## Position: Option C, generalized — not "who hosts", but "make Jini a host-agnostic toolbox"

Given the two hard constraints (ToolExecutor/RunLifecycle co-location; first-boot DB-seeding race) and — more importantly — the requirement that Jini serve at least three structurally different products (Tovu: a CMS where AI is one feature among ~50 routes; Open Marketing: unknown shape, treated as a peer CMS/product-style consumer; Zana: a bolt.diy/open-lovable-like app-builder where AI-driven execution likely **is** most of the product surface), I don't think "should Jini host, or should the product host" has one right answer across all three. Forcing a single answer is itself the mistake.

**Recommendation:** Jini should ship a **host-agnostic composition primitive** — call it `mountJiniKernel(app: Express, config)` — that takes a *caller-owned* Express app (as `tovu-learnings.md` §1 already proposed) and mounts a **buffet of route families the caller selects**, not all 16 unconditionally. `createLocalNodeDaemon` becomes a thin wrapper over this: open a listener, default every buffet flag to `true`. This preserves it unchanged for existing consumers (backward compatible = reversible) while making the underlying primitive genuinely reusable.

This reframes the "who hosts" question: it stops being a Jini-wide architecture decision and becomes a **per-consumer choice enabled by the same primitive**:
- **Tovu**: use `mountJiniKernel` inside the existing daemon-*child-process* shape (unchanged process topology — the co-location constraint plus "Tovu never spawns a CLI directly" both argue for keeping the daemon separate from Tovu's main app), with `routes: {runs:true, agents:true, delegatedTools:true}` and everything else off. Tovu's ~50 CMS routes stay exactly where they are — re-platforming them onto Jini's shell (pure Option A) buys nothing; a CMS's content/media/member logic has no relationship to agent execution, and coupling it to Jini's release cadence is a real reusability tax working the wrong direction (it would make Jini *less* generic, not more).
- **Zana** (app-builder, bolt.diy/open-lovable-like): plausibly wants close to the full preset — `createLocalNodeDaemon` (or `mountJiniKernel` with most flags on) as the literal host, since nearly all of that product's surface *is* agent-execution surface. This is closer to Option A, and that's fine — it's the right shape for that consumer, not a universal rule.
- **Open Marketing**: unknown without more detail; the same primitive should be able to express either shape once its needs are clearer. Not resolving this now is correct — don't fabricate a specific recommendation for a product with no stated requirements.

## Correction (pre-freeze, after internal fact-check — see verification note below)

Two things in my reasoning above and below needed fixing before this counts as frozen: (1) I had
treated the origin-guard finding as "resolved" — it's more accurate to say the specific
browser-cross-origin failure mode is neutralized, but the underlying guard is neutralized *for
everyone*, not satisfied — the daemon has no bearer-token or origin check of its own, so any local
process reaching its port directly gets the same free pass Tovu's own proxy does. That's a real gap
this debate should weigh in on (folded into the Auth unification section below). (2) My buffet
sketch below originally modeled a "feature" as just a route family. It isn't — `registerTerminalRoutes`
and `createTerminalToolRegistrations` are two separate mounting steps into a shared internal
`ToolRegistry`, and only the first is route-gated; disabling `terminal` at the route layer alone
would leave `jini.terminal.create` reachable via the always-mounted delegated-tool-calls route. Fixed
below.

## Buffet config sketch

```ts
mountJiniKernel(app: Express, config: {
  dataDir: string;
  routes: {
    // low blast radius, default true
    health?: boolean;          // default true
    runs?: boolean;            // default true
    agents?: boolean;          // default true
    delegatedTools?: boolean;  // default true
    // higher blast radius, default false — a host opts in explicitly
    terminal?: boolean;        // default false — real shell spawn
    daemonDb?: boolean;        // default false — raw sqlite inspect/verify/vacuum
    hostTools?: boolean;       // default false
    modelProxy?: boolean;      // default false
    activeContext?: boolean;   // default false
    toolCatalog?: boolean;     // default false
    connectors?: boolean | { auth?: bool; storage?: bool; payments?: bool; db?: bool; realtime?: bool }; // default false, sub-slot granularity
    research?: boolean;        // default false
    xai?: boolean;             // default false
  };
  auth?: { bearer?: {...}; origin?: {...} };  // same safe defaults createLocalNodeDaemon already has
  toolRegistrations?: ToolRegistration[];
  httpExtensions?: LocalNodeHttpExtension[];  // still available — for whichever routes a full-preset HOST wants bolted on
}): { registry, lifecycle, toolExecutor, agentExecutor, ... }
```

The default split (core-4 on, everything else off) follows the corpus's own strongest cross-product pattern: WordPress's "operator-set constant is unappealable; the extension filter may only ever disable" (borrowable, `[yes]`, `src/wp-includes/ai-client.php:21-38`) — high-blast-radius capabilities should default closed and only ever be *lowered* further by a host, never silently raised. Jini's own report already flags `deny-by-default is convention, not kernel-enforced` (`core/src/tool-registry.ts`) as its biggest self-admitted gap — the buffet's opt-in defaults should be enforced structurally (the flag literally gates whether `registerXRoutes` is called at all), not just documented, so this doesn't become a second instance of the same gap.

## Migration path

The `mountJiniKernel` swap is valuable **independent of which end-state topology wins**, and should happen first: Tovu's daemon child process replaces its 3 hand-picked `@jini-ai/http` registrar calls with one `mountJiniKernel(app, {routes:{runs:true,agents:true,delegatedTools:true}})` call. Mechanical, low-risk, no process-topology change. This de-risks the bigger "who hosts" decision by decoupling it from "does the config surface exist" — the latter should ship regardless.

## Multi-tenancy

Recommend **one daemon process per Tovu instance**, not per-workspace within one instance. Tovu's multi-workspace model already scopes at the request layer (`workspaceId` in routes, principal-based auth); the daemon's `RunLifecycle`/`EventLog` are process-wide in-memory state, not workspace-partitioned today, and workspace-scoping *inside* the daemon (separate run lists, separate event logs per workspace) is a materially bigger change than anything else in this debate. I'm not fully confident here — genuinely want peer input, since I haven't verified whether Tovu's multi-workspace model has any per-workspace resource-isolation requirement strong enough to force this.

## Auth unification

**Do not fully unify.** Keep Tovu's session-cookie auth as the "who is this browser session" layer and Jini's `Principal`/`ToolPolicy` as the "what is this run/tool-call allowed to do" layer. The existing bridge (stamping `principal.id` into `contextRef`) is a legitimate boundary translation, not tech debt — it mirrors how Strapi, Payload, and Directus (per the AI-Capabilities corpus) all keep their own RBAC/permission engine as ground truth and feed *derived* authorization into their AI surface rather than replacing it (Strapi: `RBAC-derived, per-caller JSON Schema`, `[yes]`, `derive-content-type-mcp-tools.ts:73-171`; Payload: `bind principal and access-override together so they cannot drift`, `[no]` (meaning: not superior to Jini, but a good corroborating pattern), `localAPIDefaults.ts:17-22`). Full unification would mean Jini acquiring opinions about each host's roles/permissions model — directly against the "stay product-agnostic across 3 consumers" constraint.

## Testing/CI

`mountJiniKernel` itself should be unit-testable against a bare in-memory Express app with no real process spawn (verifies route wiring/config correctness cheaply). Full end-to-end (real subprocess, real CLI spawn) stays a smaller, slower integration suite — the co-location constraint means Tovu's daemon has to be a real separate process for *that* class of test regardless of which topology wins.

## What would change my mind

If Open Marketing or Zana turn out to have a stated requirement that specifically needs the *product's own* app to be the literal host (e.g., a hard requirement that AI routes share one TLS/reverse-proxy termination point with the product's other routes, which an extension-based approach could still satisfy, but a fully separate-process daemon could not without extra plumbing) — that would push me toward recommending Option B/A be picked per-consumer more explicitly rather than leaving it as "whichever the primitive allows." Also: if `mountJiniKernel`'s own construction turns out not to be cleanly separable from `createLocalNodeDaemon`'s existing internals (i.e., the refactor is much bigger than `tovu-learnings.md` §1's suggestion implies), that would change my "do this first, low risk" claim about the migration path.
