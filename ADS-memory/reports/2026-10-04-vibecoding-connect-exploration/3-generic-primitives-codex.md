> **⚠️ EXPLORATORY — NOT A DECISION.** Owner curiosity session, 2026-10-04. Nothing here was chosen or approved, and nothing is being built. The owner noted the proposed format "looks kinda funny" and that none of this can be judged until it is tried on a real vibe-coded app. Treat as raw input for a future prototype, not a spec.

_Source: Codex gpt-6.1-sol (high)_

**Keep four primitives: call, render, subscribe, and transfer files.** Most of the proposed list describes uses of those primitives, not additional mechanisms.

| Primitive | Covers |
|---|---|
| **Call** | Queries and actions, including identity operations, route resolution, and custom server functions |
| **Render** | A registered widget, or data bound into the author’s HTML |
| **Subscribe** | Authorized events, invalidations, and streams |
| **Transfer** | Upload negotiation and streaming bytes |

Identity still needs first-class session handling, but its application operations belong in the registry. Routing needs a small host-router adapter. Custom functions are another registry implementation. The app manifest belongs in the admin/control plane, not in embed markup.

What is genuinely missing is **a shared contract around those primitives**:

- **Context:** app, workspace, principal, locale, and cancellation. The server resolves workspace and permissions.
- **Lifecycle:** loading, success, empty, error, teardown; consistent accessible defaults.
- **Coordination:** named regions, success events, and explicit refresh targets. Avoid a general shared-state engine.
- **Contracts:** versioned names, input/output schemas, structured errors, request IDs, and declared caching.
- **Execution limits:** payload size, duration, concurrency, stream lifetime, and file limits.
- **Rendering boundaries:** distinguish browser enhancement from rendering that actually happens before the HTTP response.

Offline writes, an HTML expression language, arbitrary client-side permissions evaluation, and a workflow engine do not belong in the minimum. Long-running work can return a job ID handled by ordinary queries and subscriptions.

The generic runtime, transport, and registry contracts belong in `@jini-ai/*`, with injected ports. Tovu supplies CMS registrants and adapters.

**Use one configuration envelope, with a small number of optional modifiers.**

```ts
type EmbedConfig = {
  v: 1;                         // Envelope version
  call?: {
    name: string;               // Explicit contract, e.g. "catalog.list@1"
    args?: Record<string, unknown>;
  };
  run?: "load" | "click" | "submit" | "manual"; // Default: load
  argsFrom?: "form";             // Native named form controls
  view?: {
    widget?: string;             // Versioned widget contract
    props?: Record<string, unknown>;
    template?: true;
    items?: string;              // One path selecting an array
  };
  watch?: {
    name: string;
    args?: Record<string, unknown>;
  };
  when?: "signed-in" | "signed-out";
  refresh?: string[];            // Region IDs, after successful action
};
```

A region needs `call`, `view`, or `when`. `view.widget` and `view.template` are mutually exclusive.

For query-plus-widget composition, the server passes the query result as the widget’s `data` input, separate from `props`. It validates both contracts and authorizes both operations. The browser does not shuttle the result through another request.

The script establishes app identity and protocol configuration:

```html
<script defer src="https://cms.example/embed.js"
        data-tovu-app="storefront"
        data-tovu-locale="en-US"></script>
```

The app ID is a public locator, never a credential. Locale can inherit from the document or region’s `lang`. Neither attribute establishes authorization.

**Ten examples cover the surface.**

1. Render a registered widget:

```html
<div data-embed-config='{
  "v":1,
  "view":{"widget":"navigation.menu@1","props":{"menu":"main"}}
}'>
  <nav slot="fallback"><a href="/">Home</a></nav>
</div>
```

Widget contracts provide HTML and, when needed, an approved browser module. The runtime loads each module once.

2. Query into the author’s own HTML:

```html
<section data-embed-config='{
  "v":1,
  "call":{"name":"catalog.list@1","args":{"limit":12}},
  "view":{"template":true,"items":"items"}
}'>
  <p data-tovu-status aria-live="polite">Loading products…</p>
  <div data-tovu-results></div>
  <template data-tovu-item>
    <article>
      <h2 data-tovu-text="title"></h2>
      <a data-tovu-href="url">View product</a>
    </article>
  </template>
</section>
```

The convention supports text, safe URLs, and one repeated template. Values become text nodes; URLs undergo protocol validation. No expressions, executable attributes, or raw HTML insertion.

3. Query feeding a widget:

```html
<div data-embed-config='{
  "v":1,
  "call":{"name":"catalog.list@1","args":{"category":"books"}},
  "view":{"widget":"catalog.product-grid@1","props":{"columns":3}}
}'></div>
```

4. Submit an action without a widget:

```html
<form data-embed-config='{
  "v":1,
  "call":{"name":"comments.create@1","args":{"postId":"post-42"}},
  "run":"submit","argsFrom":"form","refresh":["comments"]
}'>
  <label>Comment <textarea name="body" required></textarea></label>
  <button type="submit">Post</button>
  <p data-tovu-status aria-live="polite"></p>
</form>
```

Form fields supply schema-validated arguments. Reject collisions with fixed `call.args`; do not silently override them. The runtime preserves input on failure and retains one idempotency key across retries of the same submission.

5. Sign in and conditionally display content:

```html
<button data-embed-config='{
  "v":1,
  "call":{"name":"identity.sign-in@1","args":{"provider":"email"}},
  "run":"click","when":"signed-out"
}'>Sign in</button>

<section hidden data-embed-config='{"v":1,"when":"signed-in"}'>
  <div data-embed-config='{
    "v":1,
    "call":{"name":"identity.current@1"},
    "view":{"template":true}
  }'>
    <div data-tovu-results></div>
    <template data-tovu-item>
      Welcome, <span data-tovu-text="displayName"></span>
    </template>
  </div>
</section>
```

Visibility is presentation only. Protected calls still enforce authorization. Identity changes reevaluate affected regions and clear protected cached results.

Sign-in may return an approved navigation instruction to a fixed authentication route. Authentication redirects and callbacks remain protocol endpoints.

6. Resolve routes through one host-router hook:

```html
<main id="page" data-embed-config='{
  "v":1,
  "call":{"name":"routing.resolve@1"},
  "run":"manual",
  "view":{"widget":"content.page@1"}
}'></main>

<script>
  // Pseudocode: these two router functions belong to the host app.
  router.onChange(path =>
    tovu.refresh({id: "page", args: {path}}, {}).then(applyRoute)
  );
</script>
```

`routing.resolve@1` returns a documented union:

```ts
{ kind: "redirect", location: string }
| { kind: "content", content: unknown, head: HeadData }
| { kind: "not-found" }
```

The host adapter handles navigation, head updates, and its 404 experience. HTML alone cannot integrate correctly with every framework router.

7. Keep a region live:

```html
<section id="comments" data-embed-config='{
  "v":1,
  "call":{"name":"comments.list@1","args":{"postId":"post-42"}},
  "view":{"widget":"comments.list@1"},
  "watch":{"name":"comments.changed@1","args":{"postId":"post-42"}}
}'></section>
```

The declarative default is **invalidate and refetch**, with coalescing. Arbitrary streamed patches and chat-specific accumulation belong in widget code or JS.

8. Upload a visitor file:

```html
<form data-embed-config='{
  "v":1,
  "call":{"name":"media.upload@1","args":{"collection":"visitor"}},
  "run":"submit","argsFrom":"form"
}'>
  <input type="file" name="file" accept="image/*" required>
  <button type="submit">Upload</button>
  <p data-tovu-status aria-live="polite"></p>
</form>
```

The runtime recognizes `File` values, negotiates a scoped upload ticket, transfers bytes, and returns the operation’s validated result. Files do not become base64 JSON. Server-side file policy determines whether completion means accepted, scanning, or ready.

9. Stripe checkout:

```html
<div data-embed-config='{
  "v":1,
  "view":{
    "widget":"payments.stripe-checkout@1",
    "props":{"cartId":"cart-123"}
  }
}'></div>
```

The widget owns payment-specific browser behavior. Its server operation derives prices and payment credentials from the authorized cart.

10. A custom server function:

```html
<form data-embed-config='{
  "v":1,
  "call":{"name":"app.generate-summary@1"},
  "run":"submit","argsFrom":"form",
  "view":{"template":true}
}'>
  <textarea name="text"></textarea>
  <button type="submit">Summarize</button>
  <div data-tovu-results></div>
  <template data-tovu-item>
    <p data-tovu-text="summary"></p>
  </template>
</form>
```

Custom functions follow the same contracts and exposure rules. Their sandbox additionally restricts secrets, outbound access, CPU, memory, and execution time.

**The JS API should expose the same operations, not feature-specific clients.**

```js
const {data} = await tovu.call({
  name: "catalog.list@1",
  args: {category: "books"}
}, {signal});

await tovu.call({
  name: "comments.create@1",
  args: {postId: "post-42", body: "Hello"}
}, {idempotencyKey: submissionId});

const rendered = await tovu.call({
  name: "catalog.list@1",
  args: {limit: 12},
  view: {widget: "catalog.product-grid@1", props: {columns: 3}}
}, {});

const unsubscribe = tovu.subscribe({
  name: "comments.changed@1",
  args: {postId: "post-42"},
  onEvent: event => console.log(event)
}, {signal});

const removeListener = tovu.on({
  event: "identity:changed",
  handler: () => updateAccountUI()
}, {});

await tovu.refresh({id: "comments"}, {});

await tovu.call({
  name: "media.upload@1",
  args: {collection: "visitor", file}
}, {});
```

`subscribe` delivers server events; `on` observes local runtime lifecycle events. Both return cleanup functions. Dynamically inserted regions mount automatically; removed regions abort calls and close subscriptions.

Results use one envelope:

```ts
{ data, meta: { requestId, contract, revision?, cache? } }
```

Errors contain a stable code, safe message, request ID, optional field errors, and retry guidance. They exclude internal stack traces.

**Three generic routes are enough.**

| Route | Responsibility |
|---|---|
| `POST /embed/v1/call` | Queries, actions, widget rendering, composition, bounded batches, upload negotiation |
| `POST /embed/v1/stream` | Fetch-based SSE subscriptions with bearer authentication, cancellation, and resume cursors |
| `PUT /embed/v1/uploads/:ticket` | Stream bytes against a short-lived scoped ticket; finish the authorized upload operation |

Direct storage uploads can replace the third route where supported. Authentication protocol routes, provider webhooks, and the script asset remain outside this generic surface.

Use one registry entry shape; a feature can register several entries during one setup step:

```ts
interface RegistryEntry {
  name: string;
  version: number;
  kind: "query" | "action" | "widget" | "stream" | "upload";

  exposed: boolean; // Default false
  input: JSONSchema;
  output: JSONSchema;

  authorize: (
    required: {ctx: ServerContext; input: unknown},
    optional: {signal?: AbortSignal}
  ) => Promise<void>;

  limits: {
    requestsPerMinute: number;
    concurrency: number;
    maxInputBytes: number;
    maxDurationMs: number;
  };

  cache?: {
    ttlSeconds: number;
    scope: "public" | "workspace" | "principal";
    tags: string[];
  };

  idempotency?: "required";
  browserModule?: string; // Approved asset ID
  files?: {
    maxBytes: number;
    maxCount: number;
    allowedMediaTypes: string[];
  };

  run: (
    required: {ctx: ServerContext; input: unknown},
    optional: {signal?: AbortSignal; files?: VerifiedFile[]}
  ) => Promise<unknown> | AsyncIterable<StreamEvent>;
}
```

`ServerContext` comes from verified server-side resolution: app, workspace, principal, locale, request ID, and injected ports. Tenant IDs supplied in arguments never replace that context.

The existing widget and tool registries can contribute entries, but **agent tools must opt into browser exposure explicitly**. An agent’s privileged execution context is not an appropriate browser authorization policy.

The app manifest pins contracts and permitted operations, associates the app with its workspace, configures origins, and describes app-owned content types for admin management. An origin allowlist controls browser access; it does not authenticate callers. Service/app credentials stay server-side.

**Stop declarative HTML at binding, triggering, rendering, and invalidation.**

Allow one list template, fixed field paths, native form submission, identity visibility, and named refresh targets. Use JS for calculations, dependent queries, optimistic updates, complex validation, arbitrary branching, multi-step flows, and sophisticated router integration.

Conceptually, borrow htmx’s direct HTML interaction model, Web Components’ widget lifecycle, and shortcodes’ compact invocation. Avoid growing an Alpine-like expression system or a Liquid-like template language inside JSON attributes. Offer a Supabase/Firebase-style data API through the **same named contracts**, without exposing unrestricted database access.

Use Shadow DOM for widgets that need style isolation. Bind author templates in light DOM so their CSS and semantics work naturally. Shadow DOM is not a security sandbox; untrusted browser code needs a stronger isolation boundary.

Locale is context passed to registrants, with localized output and cache variation. Loading/error defaults and static fallback markup belong in the runtime. Permissions UI consumes server-computed capabilities for display; server checks remain authoritative.

Admin preview should use the production protocol with scoped preview credentials and explicit locale/principal fixtures. Contract validation belongs in registration and CI. These are supporting facilities, not more browser primitives.

**The top five risks each need a primary mitigation.**

| Risk | Primary mitigation |
|---|---|
| **Generic surface exposes privileged behavior** | A default-deny exposure gateway validates contracts and resolves context, then requires authorization for every call, render, upload, and subscription—including resource visibility inside handlers. |
| **Schema drift breaks deployed apps** | Pin immutable versioned contracts in manifests; validate inputs and outputs, and keep compatible versions available through a defined migration window. |
| **Debugging becomes opaque** | Carry one request ID through region → registry → handler → downstream calls; expose a region inspector showing contract, status, sanitized arguments, and correlated errors. |
| **Many embeds cause N+1 requests and work** | Use a request coordinator that batches mount-time operations, deduplicates identical reads, composes query/widget calls server-side, and enforces aggregate work budgets. |
| **Client rendering harms SEO and no-JS behavior** | Pre-render public content through the same registry during the host’s server/build rendering, then hydrate it. Client-only hosts must provide meaningful fallback HTML; the script cannot guarantee server-delivered content or head metadata. |

That last constraint is architectural: a single browser script makes attachment easy, but complete SEO requires participation from whichever host produces the initial HTML.