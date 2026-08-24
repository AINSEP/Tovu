^D## D1 Merge or separate — REVISING

I argued to separate (Peer D) because ADR-057 made a compelling case that glue's fixed Tier-3 execution and non-distributed nature meant it lived on an orthogonal axis to plugins. But Correction 1 demolishes the mechanical argument for separation: site-glue isn't a live parallel system, it's just a manifest contract and three adapters floating in the void without a loader. 

If site-glue has no runtime engine to separate, building one from scratch just to preserve ADR-057's purity violates our simplicity and library-first constraints. The plugin-runtime already has a working loader and lifecycle. We should merge: treat site-glue as a specific local-only, Tier-3 installation source within the unified plugin runtime. The authorship/reviewability state (staged → approved) can still be tracked independently in the database as an orthogonal axis, without requiring us to maintain a completely separate runtime architecture.

## D2 Contribution return shape — REVISING

Raw HTML is undeniably dead — genericity belongs in the scanner, and arbitrary raw strings break isolation. I am revising to the `{componentId, props}` model, reusing `WidgetTypeRegistration` and `CORE_RESOLVERS`.

The existing widget seam is already sufficient because it natively models the exact split we need: JSON-serializable declarative data (Tier-1 safe) pointing to executable behavior (`resolverId`, Tier-2/3 gated).

A host-owned `RenderIR` tree is too restrictive. The concrete failure case for `RenderIR` is complex client-side interactivity — for example, a plugin that needs to render an interactive map or a complex data grid. A generic `RenderIR` cannot express this without reinventing a massive, leaky abstraction of the DOM across the boundary. By using `{componentId, props}`, the host can provide highly interactive, optimized components (like `<DataGrid>`), and Tier-1 plugins just feed them safe data props. If a plugin needs truly novel interactivity, it must step up to Tier-2/3 to provide a new executable resolver, which the widget seam already correctly anticipates.

## D3 Kinds vs capabilities — CONCEDING

This is purely a vocabulary dispute, not a substantive architectural difference. Both sides agree on the critical outcome: a closed, enumerable, schema-backed catalog of extension points. 

Whether we call it an "extension kind" (`http.route`) or a "capability" (`http.route.register`) is just semantics if both require a statically validated data record (schema + placement + clamps). 

The merged form: The declared contributions *are* the capabilities requested. A plugin declares an array of attachments/contributions, each identified by a specific string (e.g., `http.route`) and validated against its specific schema. Approving the manifest grants the authority. We can drop a redundant top-level `capabilities` array if the attachments themselves exhaustively declare what the plugin intends to do.

## What I got wrong in round 1

I built a mechanical argument for separation based on `capability-gate.ts` and `manifest.ts` deliberately avoiding sibling dependencies, without realizing that the site-glue system had no loader driving it. I read the decoupled interface files and hallucinated a working parallel runtime, failing to verify the end-to-end execution path.

## The one thing I would still refuse to concede, and why

The strict enumerability of the extension contract. We cannot allow plugins to define arbitrary, untyped dynamic extension seams (the WordPress `do_action` model). Keeping the catalog closed and schema-backed is the only way to guarantee that `tovu introspect` can statically determine exactly what a plugin will touch before it ever executes. This is structurally non-negotiable for maintaining the Tier-1 declarative trust model.
