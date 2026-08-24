I’m using the codebase-understanding skill to verify the live seams behind D1–D3. I’ll first load the repository’s mandatory bootstrap instructions, then inspect only the cited governing docs and source—excluding both prohibited report locations.

Round-2 Peer(Consensus): The mandatory bootstrap is loaded. This dispatch is exempt from interactive startup, and it requires the response prefix you’ll see here. The configured codebase-memory graph tools are unavailable in this session, so I’m following the repository-approved fallback: the local knowledge graph first, then narrowly targeted source reads.

Round-2 Peer(Consensus): The local understanding graph is also absent; that skill normally recommends running `/understand` first. This is a read-only rebuttal, so I’m not generating a graph or blocking the answer—I’m proceeding with focused evidence reads from the exact documents and source named in the packet.

Round-2 Peer(Consensus):

## D1 Merge or separate — REVISING

ADR-057 survives as a policy argument, not as a runtime-boundary argument. Local agent-authored code is permanently local and currently has Tier-3 execution semantics; authorship/reviewability remains an orthogonal axis.

Correction 1 defeats the draft’s mechanical premise, however. Its “three real adapters” and “one real Tovu host adapter” are not production realities: `GlueHostPort` has no implementation, and the attachment functions are tested delegators with no driver. Meanwhile, the plugin runtime is composed into the server and save path. This is one working substrate plus an unfinished design—not two systems.

I therefore still land on merge, but with a revised rationale:

- Share one extension kernel: catalogs, validation, activation, quarantine, introspection, attachment dispatch, and capability enforcement.
- Keep site glue’s staging/approval/snapshot workflow as a distinct source-specific module.
- Model distribution and authorship as independent installer-recorded metadata.
- Apply artifact integrity in the distributed-artifact installer; local glue has no artifact to verify. That policy difference does not justify another runtime.

The independent literals in [site-glue/manifest.ts](/Users/la/Programming/Tovu/src/features/site-glue/manifest.ts:25) show intended dependency isolation, not a requirement for duplication. Put shared vocabulary below both features instead of making either sibling depend on the other.

## D2 Contribution return shape — CONCEDING

I concede raw HTML. The plugin must not own escaping, and the scanner must not become a second renderer.

Return the existing bounded component IR:

```ts
{ componentId, props, children? }
```

A contribution may compose a bounded tree of host-known components; it may not invent arbitrary HTML tags or attributes. Tier-1 can only parameterize allowlisted components. A future Tier-2/3 resolver may compute that IR inside its isolation boundary, but its output still resolves through the host renderer catalog. Unknown IDs degrade to the existing placeholder.

The decisive cost against arbitrary element trees is concrete: Tovu would acquire a permanent second HTML security model covering URL protocols, `style`, forms, outbound resources, dangerous attributes, nesting, size limits, and accessibility semantics. Today those policies live inside host renderers—`safeHref`, field-attribute validation, escaping—and the earlier four-scanner drift demonstrates how parallel generic contracts decay.

The widget seam is therefore sufficient as the foundation, but not yet a plugin API. `WidgetTypeKey`, `WIDGET_TYPE_REGISTRATIONS`, `CORE_RESOLVERS`, and `WIDGET_IR_RENDERERS` are still core-closed, and `COMPONENTS` is a separate catalog. Generalize that registration path with provenance, tier checks, schemas, clamps, and bounded-tree validation; do not invent `RenderIR` v2 or a third renderer registry.

This answer depends on neither A2UI nor web components.

## D3 Kinds vs capabilities — REVISING

The positions share “closed and schema-backed,” but the distinction is substantive:

- A kind says what is being attached and determines its payload schema, placement, lifecycle, failure policy, and adapter.
- A capability says what authority the resulting handler receives.

They form a many-to-many relationship. `render.component` may need zero authority or `content.read`; `content.read` may also be used by a job handler or flow step. A capability record therefore cannot sensibly own one placement schema or resolver pointer.

Merged form:

```ts
contributions: [
  { kind: "render.component", registration: { /* WidgetTypeRegistration-shaped data */ } }
],
capabilities: ["content.read"]
```

Maintain two generated closed catalogs:

- `ExtensionKindCatalog`: schema, placements, clamps, adapter/resolver policy, failure behavior, allowed tiers.
- `CapabilityCatalog`: authority semantics, optional scope schema, enforcement handle, consent description.

Strings such as `render.contribute`, `admin.nav.register`, and `tools.register` should not also be capabilities when the contribution already declares that fact. If capabilities carry placement and resolver metadata, they are extension kinds under the wrong name.

## What I got wrong in round 1

I treated tested glue delegators as production wiring, failed to engage ADR-057’s strongest argument, treated rendering as more greenfield than it is, and described jobs as lacking an existing contract. The corrections materially change the architecture argument, although not the agreed MVP sequencing.

## The one thing I would still refuse to concede, and why

Merging the runtime must not erase ADR-057’s authorship axis. Distribution provenance answers where code came from; it does not answer whether a non-technical owner reviewed an agent-authored change. `staged → approved-active → quarantined/disabled`, with snapshots and explicit disclosure, remains an essential workflow even inside one unified extension system.