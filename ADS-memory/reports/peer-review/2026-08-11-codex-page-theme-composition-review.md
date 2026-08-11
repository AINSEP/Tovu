# Codex gpt-5.6-sol — peer review of the page/theme composition model

Dispatched 2026-08-11 from the Tovu embed-marker session. Model `gpt-5.6-sol`, reasoning effort `high`, codex-cli 0.147.0. Clean `turn.completed`, no errors.

Packet sent: the full design conversation (owner's questions verbatim, my answers each round), what was built (`basic-child`, single-level inheritance), and what is not built. Six questions, weighted toward blind spots.

---

I’ll give you a direct architectural judgment, with special attention to long-term failure modes and the gap between “edit the finished page” and the current compositional model.

---

Codex(Peer Review): Blunt version: the direction is sound, but the current proof demonstrates composition, not safe inheritance or “edit the finished page.”

1. Is “layout + content block, never merge” right?

Yes as an ownership rule. No as the complete page model.

The stronger paradigm is **region-based structured composition**:

- The theme owns global chrome, styling, and layout contracts.
- The page owns a block/component tree.
- Layouts expose typed regions such as `main`, `sidebar`, `hero`, and `after-content`.
- A page selects a layout and populates its permitted regions.
- Child themes customize site-wide layouts and defaults, not ordinary page content.

A single hole inside `<article>` will eventually be too restrictive for landing pages, full-width heroes, or pages with unusual flow. But allowing arbitrary editing of the entire shell recreates the merge problem.

So preserve “never merge,” but evolve from **shell + one content hole** to **chrome + typed regions + page composition**.

Also distinguish these explicitly:

- `html-fragment`: author owns HTML inside a region; theme chrome remains.
- `standalone-html`: author owns the complete document and accepts full responsibility.

Calling both “HTML pages” will create confused expectations.

2. Attack on the ten-line fork

The ten-line argument is not durable by itself.

Line count is the wrong coupling metric. That small file already depends implicitly on:

- Marker schemas and resolver behavior
- Partial IDs
- Wrapper classes
- Parent CSS selectors
- DOM structure expected by responsive CSS
- Token names
- Accessibility conventions
- Asset loading and render order

A one-line wrapper change can break more severely than fifty lines of independent markup. In particular, inheriting parent CSS is both the feature and the danger: a parent stylesheet update can silently break a child layout even though no bytes conflicted.

There is no honest empirical half-life to quote here. Tovu has no ecosystem data, and evidence from other template systems would not transfer cleanly. I would assume accretion begins as soon as several real customers need conditional navigation, landing pages, membership states, and experiments—not years later.

The shell remains structural only if the system enforces that boundary:

- No loops, arbitrary expressions, or generic conditional language in layouts.
- SEO and `<head>` contributions use structured APIs.
- A/B decisions happen in routing or slot resolution.
- Authentication variation belongs in resolvers/components.
- Page differences use explicit layout variants or region configuration.
- Parent layout contracts are versioned and tested.
- CI renders child layouts against candidate parent updates.

If you eventually add `if`, iteration, variables, and arbitrary helper calls to marker JSON, you will have rebuilt a template language—just a worse one.

3. “Edit a finished version” without flattening

There is a third option: a **visual editor backed by a render-origin manifest**.

Render the real composed page in an editor preview. Alongside it, produce a transient map like:

```json
{
  "node": "preview-42",
  "owner": "menu",
  "resourceId": "docs-nav",
  "fieldPath": "items",
  "editor": "menu-editor",
  "scope": "site"
}
```

Clicking the visible element opens the editor for its actual source. Page content is editable in place; shared nav, footer, menu, and theme regions can be selected but clearly identified as shared or structural.

This stores neither a flattened page nor byte-level ancestry. But, honestly, it is still provenance—just the minimum useful provenance at component boundaries.

Minimum viable version:

- Stable component-instance IDs
- Owning resource type and ID
- Field or block path
- Editable/locked capability
- Scope: page, layout, theme, or site
- Resource revision for conflict detection

For arbitrary selection and mutation across undifferentiated HTML, there is no magic third way: you need AST/source mapping or provenance eventually. Component-level provenance is the affordable compromise.

You also need two visible modes:

- Page editing
- Theme/layout editing

Otherwise clicking the footer and changing it “on this page” may accidentally change every page using that partial.

4. Posts-formulaic / Pages-special

It is a valid product distinction but a poor fundamental ontology.

Treat Post and Page as content-type presets over shared machinery:

- Field schema
- Editor capabilities
- Routing behavior
- Collection/listing behavior
- Default layout
- Publication metadata
- Allowed regions and blocks

Keeping `kind` is fine for defaults and UX. Scattering `if kind === "page"` throughout rendering, storage, indexing, and administration is not.

The likely future is that some pages become formulaic and some posts become highly composed. The architecture should tolerate that without changing their database identity.

5. One level of inheritance

It is a good v1 guardrail and probably wrong as the final agency model. The exact base → client → site scenario will appear.

Do not allow arbitrary inheritance chains. Introduce three explicit layers:

```text
base theme → client/brand child → site override
```

The site override should be a first-class customization layer, not another distributable child theme. It can override layouts, tokens, partial bindings, and CSS. If it becomes reusable, it can be promoted into a child package.

Resolve those layers into one effective theme with:

- Deterministic precedence
- Explicit tombstones for removing inherited keys
- Origin information per effective key
- Parent version pinning
- Compatibility declarations
- Preview before updating the base

That solves the agency case without permitting a six-generation family tree.

6. What will hurt in month six

The largest misconception is:

> No merge conflicts does not mean no update conflicts.

You eliminated byte conflicts. You did not eliminate semantic compatibility failures. Parent CSS, token changes, renamed partials, changed marker contracts, or altered component markup can break a child invisibly.

The other likely delayed failures are:

- **Shared-edit blast radius.** Editing a footer from one page changes the whole site. The editor must show scope and where-used information before saving.
- **Non-reproducible revisions.** Restoring an old page body will not restore what that page looked like under an older theme, menu, partial, or token set. Published releases need dependency/version manifests or atomic site snapshots.
- **No deletion semantics.** Per-key fallback requires explicit tombstones; absence cannot mean both “inherit” and “remove.”
- **CSS accumulation.** Parent-then-child append-only CSS eventually creates specificity wars. Use cascade layers, scoping, and documented override contracts.
- **Layout variant explosion.** Avoid solving every page exception with another child layout. Prefer typed regions and configuration.
- **Cache invalidation.** A partial, menu, token, or parent-theme update may affect hundreds of rendered pages. The dependency graph must drive invalidation.
- **Raw HTML safety.** Decide whether scripts, event attributes, and external assets are allowed, and separate trusted-owner HTML from delegated-author content.
- **AI-generated breakage.** AI layout editing needs schema validation, unresolved-marker checks, accessibility checks, and visual previews—not merely a small file.

I would continue the experiment, but immediately add the dedicated `content` marker and define the typed-region/render-origin contracts. The architecture is promising because ownership is separated—not because the demo layout happens to be nine lines.