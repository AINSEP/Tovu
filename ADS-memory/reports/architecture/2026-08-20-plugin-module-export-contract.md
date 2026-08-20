# Plugin Module Export Contract — `render.contribute` and `http.routes`

- **Date:** 2026-08-20
- **Author:** Software Architect agent (dispatched, `general-work` branch)
- **Trigger:** `ADS-memory/reports/architecture/2026-08-20-call-site-payload-schemas.md`'s own
  "Strongest objection" — the manifest JSON Schemas for `render.contribute` (beyond `capability:
  "static"`) and all of `http.routes` describe only the data half of what a plugin author needs;
  the other half — what the plugin module must **export**, and how the host turns that export into
  a callable, safely — was undesigned. This report designs that half.
- **Constraint honored:** PROPOSE ONLY. No file under `src/` or `apps/` was modified.
- **Scope:** the module-export contract for `render.contribute` (dynamic capabilities only —
  `static` needs no code, see §1) and `http.routes` (always dynamic). Not in scope: the
  `plugin-runtime`/`site-glue` merge (SYNTHESIS Result 1), re-litigating the JSON Schemas
  themselves (already designed, cited not repeated), or building `PLUGIN_SAFE_COMPONENT_IDS` (the
  payload-schemas report's Open Question 1 — orthogonal to export-contract safety).

## Precedent read before designing anything

- `src/features/site-glue/ports.ts:52-55` (`GlueToolRegistration`) — `{ toolId: string; handler:
  (...args) => unknown }`. `toolId` is manifest-shaped data; `handler` is a **real function
  obtained from the module's own `setup()` call**, never resolved by string lookup after the fact.
  This is the split I generalize below.
- `src/features/site-glue/attachment-points/content-lifecycle.ts:28-31` — its own doc comment:
  "the glue module's already-obtained filter — **how it was obtained (a `setup()` call gated by
  this module's own granted `GlueCapability` set) is the loader's concern**, not this attachment
  point's." This is the load-bearing precedent for where function-resolution happens: never at the
  attachment point, never at dispatch time by string lookup — always at `setup()` time, by the
  plugin **pushing** its function into a capability-gated SDK call.
- `src/features/site-glue/attachment-points/tool-registration.ts:54,96-127`
  (`GlueToolQuarantineReason = "THROW" | "DUPLICATE_TOOL_ID"`) — the per-attachment-point failure
  taxonomy shape I mirror for `render.contribute`/`http.routes` in §5.
- `src/features/plugin-runtime/loader.ts:103-143` — `PluginLoadFailureReason` (steps 1-3:
  `INTEGRITY_FAILED`, `SDK_RANGE_UNSATISFIED`, `CODE_ENTRY_MISSING`) and `readDefinedPlugin()`
  (only the SDK's opaque `{ definition }` wrapper is a valid ABI value — a plain `{ setup(){} }` is
  rejected). `PluginEnableFailureReason = PluginLoadFailureReason | "PLUGIN_HOOK_NOT_ATTACHED" |
  "PLUGIN_HOOK_ATTACH_FAILED"` (line 110) is the **exact widening pattern** I extend in §5: an
  attach-time union built on top of the load-time one, for the one hook that already exists.
- `src/features/plugin-runtime/capability-sdk.ts:34-48,84-116` (`CapabilityDeniedError`,
  `buildCapabilityScopedSdk`) and `src/features/site-glue/capability-gate.ts:34-61,91-115`
  (`GlueCapabilityDeniedError`, `buildGlueCapabilityGate`, `GLUE_CAPABILITIES`) — CIC U-003/CIC-1's
  binding property: **every capability position is always present; only calling an ungranted one
  throws.** `capability-gate.ts:48-49` explicitly defers "each capability's real signature ... to
  whichever attachment-point adapter backs it (later slices)" — that typing is this report's job
  for the `render.contribute` and `http.route.register` positions.
- `src/widgets/resolvers/index.ts:1-20,134-179` (`CORE_RESOLVERS`, `resolveWidgetType`,
  `withResolverTimeout`) — "the ONE place a `resolverId` string resolves against real, executable
  code... never a dynamic import path, `eval`-style reference, or arbitrary function lookup
  anywhere else." A plugin resolver must **never** enter this map. §2 below builds a parallel,
  clearly-separate registry instead.
- `src/widgets/types.ts:83-96,223-265` (`WidgetTypeRegistration`, `WidgetRenderIR`,
  `WidgetResolveContext`, `WidgetInstanceView`, `WidgetResolveResult`, `WidgetResolver`) — already
  plain, structured-clone-safe data (`UUID`/`string`/`boolean`/`JsonObject`, no functions, no class
  instances). This is why `render.contribute`'s function contract in §1 is **`WidgetResolver`
  verbatim** — no new shape needed for the signature itself, only for its registration path.
- `src/server/http/site/worker-sandbox.ts` (whole file) — the reusable Tier-2 isolation mechanism
  (spawn-per-call `Worker`, wall-clock `timeoutMs`, V8 `resourceLimits`, `worker.terminate()` on
  timeout/error/exit). Its own header (lines 28-34) documents that carrying this machinery as two
  independently-maintained copies (Liquid/Handlebars) already drifted once — the reason I do not
  propose a third, parallel copy for plugin dispatch in §4.
- `packages/sdk/src/index.ts:14-24,85-116` — ADR-024 §3 ABI rule, cited verbatim: "`PluginSdk`...
  a freshly-built handle of plain closures, never a reference to a live core singleton," and
  `ContentEntryDraft` is "a plain, structured-clone-safe snapshot — never a live ORM entity." This
  existing invariant is what makes the Tier-2 capability-RPC design in §4 safe for free — the two
  capabilities a resolver is most likely to need (`content.read`) already return worker-safe data.
- `src/server/routes/types.ts:154` (`authorize: AuthorizeFn`) — the real host-side authorization
  mechanism every core admin route already uses. Cited in §1.3 to resolve the payload-schemas
  report's Open Question 4 (does a plugin route handler get a scoped `authorize()` or a bare
  boolean).
- `ADS-memory/reports/architecture/ADR-057-site-glue-tier.md:62,116` — Tier-3's own honesty
  framing ("capability-gated at the interface, not sandboxed") and the explicit instruction that
  `render.contribute`'s adapter reuse `resolver-service.ts`'s "never throws, isolated placeholder"
  pattern. Both are load-bearing for §3's tier-parity argument.

---

## 1. The core design principle

**A plugin module never gets *pulled* from by id. It *pushes* its function into a
capability-gated SDK call during `setup()`, exactly once, and the host retains that function
reference in a plain, loader-owned map.** `resolverId`/`typeKey`/`routeId` strings exist for
**cross-referencing and de-duplication** (does this manifest attachment have a matching
registration? is this the second module claiming the same id?) — never as a key into a dynamic
`import()`, `eval`, or `moduleExports[id]`-style lookup. This is exactly `GlueToolRegistration`'s
existing shape, generalized to the two remaining call sites.

Concretely: at module load, the loader calls `plugin.definition.setup(sdk)` once (as
`loader.ts:204` already does for real plugins; a glue-module equivalent is expected to do the
same). Inside that one call, the plugin's own code — already imported, already in the same
JS heap as whatever closure it builds — calls a gated SDK method, handing over a **live function
reference it just defined**. The host never needs to go find that function later; it already has
it, captured by ordinary lexical closure, the moment `setup()` returns.

### 1.1 `render.contribute` — dynamic capabilities

`render.contribute`'s manifest shape is already frozen by the payload-schemas report
(`typeKey`, `capability`, `configSchema`, `placementContexts`, `clamps`, `componentId`). The one
addition is the resolver:

```ts
// src/features/site-glue/ports.ts (extends the existing GlueToolRegistration-style split)

import type { WidgetResolver } from "../../widgets/types.js";

/** One glue module's render contribution — data (matches
 *  `GlueRenderContributeAttachment` in the manifest 1:1) plus, for dynamic capabilities, the real
 *  resolver. Mirrors `GlueToolRegistration` (`ports.ts:52-55`) field-for-field. */
export interface GlueRenderContribution {
  readonly typeKey: string; // `ext.{moduleId}.{localKey}` — must match a manifest attachment's typeKey
  readonly capability: "static" | "query" | "form" | "entry-reference";
  readonly configSchema: Record<string, unknown>;
  readonly placementContexts: readonly ("region" | "inline")[];
  readonly clamps: { readonly maxItems?: number; readonly timeoutMs: number };
  readonly componentId: string;
  /** REQUIRED for `query`/`form`/`entry-reference`, and a validation error if present for
   *  `static` (nothing should ever be registered for a static type — REQ-10's existing "no
   *  resolver invocation" precedent, `resolvers/index.ts:149-159`). Structurally IDENTICAL to
   *  `WidgetResolver` (`widgets/types.ts:261-266`) — a plugin resolver and a core resolver are
   *  invoked through the exact same `resolveMany(instances, context)` shape, so nothing about
   *  the dispatcher in §2 needs to special-case "this one came from a plugin." */
  readonly resolver?: WidgetResolver;
}
```

**Why `capability: "static"` needs no `setup()` call at all.** A static contribution is pure
manifest data — the payload-schemas report already established that nothing executes for it
(`resolvers/index.ts:149-159`'s existing static path renders `instance.config` directly as
`props`). The loader can register a static `render.contribute` attachment straight from the
validated manifest, with **zero code involvement** — this is the genuinely-zero-code Tier-1 path
the SYNTHESIS asked for, and it means a plugin with only static contributions never needs a
`server/index.mjs` `setup()` call for this call site at all. Only `query`/`form`/`entry-reference`
require the module to also call the SDK below.

### 1.2 `http.routes` — always dynamic

The payload-schemas report already established `http.routes` has no Tier-1 form at all — every
attachment needs a real handler. Raw Express `Request`/`Response` cannot be the handler's
parameter type: they are not structured-clone-safe (sockets, circular refs, prototype methods),
so a handler built to that shape would work in-process but could never cross the Tier-2 worker
boundary in §4 — and I want **one** handler shape a plugin author writes once, that works
unchanged under either tier (§3). So the contract is a plain-data request/response pair, the same
shape serverless platforms (Lambda, Workers) use for exactly this reason:

```ts
import type { JsonValue } from "@jini-ai/cms/core";

export interface PluginHttpRequest {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** `:param` captures from this route's declared `path` segment. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  /** An allowlisted subset (not the raw `IncomingMessage` headers object) — the allowlist is
   *  the real adapter's concern, not this contract's. */
  readonly headers: Readonly<Record<string, string>>;
  /** Parsed JSON only, already bounded by this route's `maxBodyBytes` — a plugin handler never
   *  sees a raw stream. */
  readonly body: JsonValue | undefined;
  /** The host's ALREADY-DECIDED auth outcome — see §1.3. Never a session object, never a
   *  callable `authorize()` closure (neither is structured-clone-safe). */
  readonly auth:
    | { readonly kind: "admin-session"; readonly principalId: string }
    | { readonly kind: "member-session"; readonly memberId: string }
    | { readonly kind: "public" };
}

export interface PluginHttpResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: JsonValue;
}

export type PluginHttpHandler = (request: PluginHttpRequest) => Promise<PluginHttpResponse>;

export interface GlueHttpRouteContribution {
  readonly routeId: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly auth: "admin-session" | "member-session" | "public";
  readonly maxBodyBytes?: number;
  readonly handler: PluginHttpHandler;
}
```

### 1.3 Resolving the payload-schemas report's Open Question 4

That report asked whether an `admin-session` route handler gets a scoped `authorize()` or a bare
boolean. Answer: **neither, directly.** `authorize: AuthorizeFn` (`src/server/routes/types.ts:154`)
runs on the host side, **before** the plugin boundary is ever reached — the same order every core
admin route already uses. The plugin handler receives only the already-decided outcome as plain
data (`request.auth`). This is not a new decision so much as the only one consistent with §1.2's
constraint that nothing crossing into a plugin handler (in-process OR worker) can be a live
closure — `AuthorizeFn` itself is exactly the kind of "real core mechanism" `GlueHostPort`'s own
header says a glue module must never reach directly.

### 1.4 The typed SDK a plugin's `setup()` actually calls

`buildGlueCapabilityGate` (`capability-gate.ts:91-115`) returns a **flat**, uniformly-typed
`Record<GlueCapability, GlueCapabilityDelegate>` where `GlueCapabilityDelegate = (...args:
readonly unknown[]) => unknown`. That generic rest-args type is not narrowable in place — a
function typed `(registration: GlueRenderContribution) => void` is not structurally assignable to
`(...args: readonly unknown[]) => unknown` (parameter contravariance), so plugin authors cannot
safely call `gate["render.contribute"](x)` with a useful type. I do **not** propose changing
`capability-gate.ts` (it is explicitly design-frozen for this feature slice, and the untyped shape
is correct at that layer — a generic gate has no business knowing about widget types).

Instead, the loader wraps the flat gate in a **nested, narrowly-typed convenience object** before
calling `setup()` — precisely the same relationship `PluginSdk`'s `content.read`/`addFilter`
already have to `CapabilityScopedSdkCoreDeps` (`capability-sdk.ts:53-61,105-114`): the untyped-cast
happens exactly once, in one reviewed spot, never at the plugin author's call site.

```ts
export interface GlueRenderSdk {
  /** Gated by `render.contribute` (throws `GlueCapabilityDeniedError` if not granted — the
   *  underlying flat gate position still enforces this; this wrapper only adds the type). */
  contribute(registration: GlueRenderContribution): void;
}

export interface GlueHttpSdk {
  /** Gated by `http.route.register`. */
  registerRoute(registration: GlueHttpRouteContribution): void;
}

// Loader-owned, not exported to plugin authors:
function wrapRenderGate(flat: Readonly<Record<GlueCapability, GlueCapabilityDelegate>>): GlueRenderSdk {
  return {
    contribute: (registration) => {
      flat["render.contribute"](registration); // one reviewed, intentional cast boundary
    },
  };
}
```

A glue module's `setup()` then looks like:

```ts
// plugin's server/index.mjs
export default defineGlueModule({
  setup(sdk) {
    sdk.render.contribute({
      typeKey: "ext.weather.card",
      capability: "query",
      configSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      placementContexts: ["region", "inline"],
      clamps: { timeoutMs: 800 },
      componentId: "text", // or a future PLUGIN_SAFE_COMPONENT_IDS member
      resolver: {
        async resolveMany(instances, context) {
          const results = new Map();
          for (const instance of instances) {
            const city = String(instance.config.city ?? "");
            const temp = await sdk.http.fetchWeather(city); // hypothetical granted capability
            results.set(instance.id, {
              ok: true,
              ir: { componentId: "text", props: { body: `${city}: ${temp}°` } },
              dependencyKeys: [instance.id],
            });
          }
          return results;
        },
      },
    });
  },
});
```

---

## 2. Host-side resolution — a parallel registry, never `CORE_RESOLVERS`

`CORE_RESOLVERS` (`resolvers/index.ts:52-67`) and `getWidgetTypeRegistration` (`registry.ts:144`)
only know the closed, 5-member `WidgetTypeKey` union (`types.ts:63`) — `ext.weather.card` is not
and must never become a member of it (the payload-schemas report already says so explicitly). So
plugin contributions resolve through a **second, explicitly plugin-only** registry, populated at
attach time (never touching `CORE_RESOLVERS`):

```ts
interface PluginWidgetRegistryEntry {
  readonly moduleId: string;
  readonly tier: "tier-2" | "tier-3";
  readonly registration: GlueRenderContribution;
}

const PLUGIN_WIDGET_REGISTRATIONS = new Map<string, PluginWidgetRegistryEntry>(); // key: typeKey

interface PluginHttpRouteRegistryEntry {
  readonly moduleId: string;
  readonly tier: "tier-2" | "tier-3";
  readonly registration: GlueHttpRouteContribution;
}

const PLUGIN_HTTP_ROUTES = new Map<string, PluginHttpRouteRegistryEntry>(); // key: `${moduleId}/${routeId}`
```

A page render that hits an `ext.*` `typeKey` dispatches through a new, sibling function —
`resolvePluginWidgetType()` — that copies `resolveWidgetType`'s exact try/catch + clamp discipline
(`resolvers/index.ts:116-121,167-176`) but looks in `PLUGIN_WIDGET_REGISTRATIONS` and additionally
branches on `tier` (§3/§4). `resolveWidgetType` itself is untouched — this satisfies the
constraint that a plugin resolver never becomes the exception inside the closed core map.

---

## 3. Tier-3 (in-process) — same contract, direct call

Tier-3 execution is the simple case and matches ADR-057's own honesty framing (`ADR-057:62`:
"capability-gated at the interface, not sandboxed"): `setup(sdk)` runs once, on the main thread,
at module load — identical to `loader.ts:198-207`'s existing step 4. The `sdk` handed to `setup()`
is built from real `coreDelegates` closures (no RPC, no worker). The registered `resolver`/
`handler` value is a genuine in-process function; `resolvePluginWidgetType()`/the HTTP dispatcher
call it **directly**, wrapped only in the same tier-agnostic `withResolverTimeout`
(`resolvers/index.ts:93-108`) every core resolver already gets. That wrapper is a `Promise.race`,
not a true preemptive timeout (`worker-sandbox.ts:21-23`'s own header explains why that matters
for genuinely CPU-bound code) — which is the **same, already-disclosed** weaker guarantee Tier-3
themes and Tier-3 plugin hooks already carry. I am not introducing a new gap; I am extending an
existing, named one to two more call sites.

---

## 4. Tier-2 (worker-sandboxed) — the hard part

**A worker boundary is a structured-clone boundary; functions and class instances do not cross
it.** This is the central fact the whole design has to route around, and the payload-schemas
report's own strongest objection already anticipated it. The resolution:

### 4.1 `setup()` runs *inside* the worker, once per call — there is no cross-thread function

`worker_threads` do not share a module registry or heap with the main thread (`worker-sandbox.ts`
already spawns a fresh `Worker` per render with no pooling — its own doc, lines 166-167 area:
"one Worker spawn/teardown per call. No pooling"). So the main thread can never hand a live
`resolver`/`handler` function to a worker — there is nothing to hand. Instead, the **worker does
its own load**: the main thread passes only plain data — `entryPath`, the contribution id being
invoked, and the call payload (`instances`/`context` for render, `PluginHttpRequest` for http) —
and the worker's bootstrap script:

1. `import(entryPath)` (fresh, worker-local — this IS step 3 of BR-01, re-executed in this
   isolate; see §4.3 for why this is safe without re-hashing files).
2. `readDefinedPlugin()` on the result (identical check to `loader.ts:136-143`).
3. Builds a **worker-local** SDK (§4.2) and calls `plugin.definition.setup(workerSdk)`.
4. `setup()` runs the plugin's own registration code again, capturing its `resolver`/`handler`
   into a worker-local map — the exact same code path as Tier-3's `setup()`, just executing in a
   throwaway isolate instead of the long-lived main process.
5. Looks up the requested id in that worker-local map and invokes it with the call payload.
6. `postMessage`s the plain-data result back and lets the outer `renderInWorkerSandbox`-style
   harness terminate the worker.

**Consequence worth stating plainly, because it is a real cost, not a free abstraction:** for
Tier-2, `setup()` executes **once per call**, not once per plugin-enable lifecycle the way Tier-3's
single main-thread `setup()` does. If a plugin author puts expensive work in `setup()` itself
(rather than inside the resolver/handler it registers), that cost is paid on every single request,
because there is no worker pool to amortize it across (`worker-sandbox.ts`'s own documented
tradeoff). This should be disclosed to plugin authors as a hard rule: *`setup()` for a
worker-tier contribution must do nothing but register — all real work belongs inside the
resolver/handler function itself.*

### 4.2 Mid-call host services: an RPC stub, bounded by the same outer timeout

A `query`-capability resolver plausibly needs `content.read()` or similar mid-call. Inside the
worker, the SDK's capability delegates cannot be the real `coreDeps` closures (they live on the
main thread) — they are **RPC stubs**: calling `sdk.content.read()` inside the worker does
`parentPort.postMessage({ kind: "capability-call", id, capability: "content.read", args })` and
awaits a matching `{ kind: "capability-reply", id, ok, value }` message. On the main thread, the
existing per-call `Worker` listener (today a one-shot `.once("message", …)` at
`worker-sandbox.ts` — see the harness note below) needs to become a **persistent** `.on("message",
…)` that dispatches on `message.kind`: a `"capability-call"` message re-checks the SAME granted
capability set already computed once at manifest-validation time and invokes the real
`coreDelegate`, replying with its (already structured-clone-safe, per ADR-024 §3 — see
`packages/sdk/src/index.ts:17-19`) result; a `"result"` message is the terminal reply the harness
already knows how to handle.

**This needs no new timeout mechanism.** The existing per-call `timeoutMs` +
`worker.terminate()` (`worker-sandbox.ts:169-215`) already bounds the *entire* worker lifetime —
spawn, `setup()`, the resolver/handler body, and every capability RPC round-trip inside it. If a
capability reply never arrives, the resolver never resolves, and the same outer timer that already
exists fires and terminates the whole worker. I am not proposing a second timeout; I am pointing
out the existing one already covers this case for free, precisely because it wraps the whole
call rather than any one step inside it.

**What this requires from `worker-sandbox.ts` that does not exist today:** the harness's
message-handling needs widening from "one reply, then terminate" to "N capability-call
round-trips, then one terminal result, then terminate" — a real, if small, protocol change, not
just a new `workerBasename`. I flag this as necessary follow-up plumbing for whoever wires the
Tier-2 adapter rather than specifying an exact diff here, since that file is live under separate,
concurrent work in this same session (per the teammate roster) and a same-tree edit is out of my
PROPOSE-ONLY remit regardless.

### 4.3 Integrity/`sdkRange` ordering across repeated worker imports

CIC U-001 (`loader.ts:17-22`) requires integrity + `sdkRange` to pass **before any plugin code is
evaluated**. A worker's own `import(entryPath)` is a fresh evaluation event in an isolate that has
never run those checks. Re-hashing every declared file on **every single Tier-2 call** would be a
real, disclosed cost (per-call file I/O + SHA-256, at odds with this codebase's own batch-first
cost discipline for widgets — REQ-24). My design choice: **verify once, at enable time, on the
main thread** (the existing `loadPlugin()` pipeline, unchanged) — subsequent per-call worker
imports of the *same, already-enabled* plugin trust that the on-disk bytes have not changed since
that gate ran. This is a genuine, named residual risk (a TOCTOU window between enable-time
verification and a later worker's re-import), not a solved problem — see the strongest objection
below.

---

## 5. Failure taxonomy

**Load-time (module-level, before any contribution is even considered):** unchanged.
`PluginLoadFailureReason` (`loader.ts:103-108`) already covers `INTEGRITY_FAILED`,
`SDK_RANGE_UNSATISFIED`, `CODE_ENTRY_MISSING` — these gate `setup()` itself and apply identically
regardless of which call sites a module declares.

**Attach-time (per-contribution, after `setup()` succeeds):** new — widening the union exactly the
way `PluginEnableFailureReason` already widens `PluginLoadFailureReason` for the one existing hook
(`loader.ts:110`):

```ts
export type GlueRenderContributeFailureReason =
  | PluginLoadFailureReason
  | "CONTRIBUTION_NOT_REGISTERED"    // manifest declared a dynamic typeKey; setup() never called sdk.render.contribute for it
  | "CONTRIBUTION_CAPABILITY_MISMATCH" // setup()-registered capability disagrees with the manifest attachment
  | "DUPLICATE_TYPE_KEY";            // mirrors GlueToolQuarantineReason's "DUPLICATE_TOOL_ID" (tool-registration.ts:54)

export type GlueHttpRouteFailureReason =
  | PluginLoadFailureReason
  | "CONTRIBUTION_NOT_REGISTERED"    // every http.routes attachment requires code — there is no static form
  | "DUPLICATE_ROUTE_ID";
```

"Wrong shape" (registered value isn't a function, or is a function with the wrong arity) is
deliberately **not** a new reason: the typed SDK wrapper in §1.4 does a synchronous `typeof`
check and throws inside the same `setup()` call the loader already wraps in try/catch
(`loader.ts:203-207`) — it collapses into the existing `PLUGIN_SETUP_FAILED`, exactly as any other
`setup()`-time throw does today. No new machinery needed for that case.

**Per-call (every request, after a successful attach):** not a load/attach failure at all —
`render.contribute` reuses `WidgetResolveFailureReason` (`widgets/types.ts:244-249`) verbatim,
since a plugin resolver is dispatched through the exact same `resolveMany` shape as a core one
(§2). `timeout`/`resolver-error` cover both Tier-3's `Promise.race` timeout and Tier-2's hard
worker-level timeout — the caller sees the same reason either way, which is intentional: a plugin
author should not have to know which tier resolved a given request to interpret a failure.
`http.routes` has no existing equivalent, so I define one of the same shape:

```ts
export type PluginHttpInvocationFailureReason = "timeout" | "handler-error" | "handler-invalid-response";
```

---

## 6. Tier-3 vs. Tier-2 — same contract, different execution

**Same `GlueRenderContribution`/`GlueHttpRouteContribution`/`PluginHttpHandler` shapes, same
`setup()` call site, same typed SDK wrapper.** The only thing that differs is *who calls `setup()`,
how many times, and what the capability delegates inside the `sdk` argument actually do* — a
direct closure call for Tier-3, an RPC stub for Tier-2. A plugin author writes one resolver/handler
function; whether it runs in-process or per-call-in-a-worker is a manifest-level `tier` decision
(carried on the extension record per the SYNTHESIS's Result 1 shape), not something the module's
own code has to branch on. This was a deliberate design goal, not an accident: it is what keeps
"upgrade a plugin from Tier-3 to Tier-2" a deployment/trust decision rather than a rewrite.

---

## 7. What I could not resolve from source

1. **The exact `.once("message", …)` → `.on("message", …)` widening in `worker-sandbox.ts`
   (§4.2) is designed at the protocol level, not committed to a diff**, because that file is
   under active, concurrent work in this session and editing it is outside my PROPOSE-ONLY remit
   regardless. Whoever wires the Tier-2 adapter needs to actually make this change; I have
   specified its shape, not its patch.
2. **The enable-time-only integrity verification in §4.3 is a deliberate tradeoff, not a proof.**
   I could not find any existing mechanism in this codebase for detecting a plugin's on-disk files
   changing between enable and a later use (no file-watcher, no re-hash-on-use path anywhere in
   `loader.ts`/`discovery.ts`) — so I am extending an *absence* of re-verification that already
   exists for Tier-3, not contradicting a stronger guarantee that exists today. Whether that
   absence is acceptable for Tier-2's wider (network-facing, for `http.routes`) blast radius is a
   product/security call I am flagging, not making.
3. **Whether `GlueRenderSdk`/`GlueHttpSdk` (§1.4) belong on `GlueHostPort` or are purely a
   loader-internal detail** — I designed them as loader-internal (never exported from `ports.ts`)
   because `ports.ts`'s own header says it is "the entire boundary" to host mechanisms, and a
   typed convenience wrapper around the capability gate is not a host mechanism. But I did not
   find a precedent file that draws this exact line for a nested (vs. flat) SDK shape, since no
   other `GlueCapability` position has been typed yet.

## 8. Strongest objection to this design

**Re-running `setup()` once per Tier-2 call (§4.1) is a real behavioral divergence from every
existing doc comment's "built fresh per plugin *load*" framing** (`capability-sdk.ts:21-23`:
"Built fresh per plugin load (never a shared module-level singleton)") — that line was written
for Tier-3's single main-thread load and is silently no longer true once "load" can mean "once per
request." A plugin author who writes `setup()` assuming it runs once per process lifetime (a
reasonable assumption given every existing example in this codebase) and puts a database
connection, a counter, or any other stateful side effect there will get subtly wrong behavior
under Tier-2 — not a crash, not a typed error, just silently-wrong semantics that no validator in
this design catches. §4.1 states the rule ("`setup()` must do nothing but register") but nothing
in the TypeScript contract *enforces* it; enforcing it would need either a lint rule, a runtime
guard (e.g., freezing/inspecting what `setup()` touches beyond the SDK, which is expensive and
fragile), or accepting this as a documented-only constraint the same way several other CICs in
this codebase already are. I did not find a existing pattern in this codebase for enforcing "this
function must be side-effect-free beyond its declared surface," so I am not inventing one here —
but this is the single largest gap between "the contract is safe" and "the contract is safe **and**
foolproof," and it should be named to whoever builds the loader-side Tier-2 adapter next.

## Relates to

`ADS-memory/reports/architecture/2026-08-20-call-site-payload-schemas.md` (the manifest half this
report completes), `ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`
(Result 1's merge, Result 2's `WidgetRenderIR` freeze, Result 3's `kind`/`capabilities` split —
none of which this report's contract contradicts), `ADR-057-site-glue-tier.md` (Tier-3 honesty
framing, `resolver-service.ts`'s fail-isolated precedent), `ADR-020-theme-capability-tiers.md`
(the origin of the Tier-1/2/3 vocabulary this report's tier gating reuses).
