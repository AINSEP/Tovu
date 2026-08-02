# Decomposition Playbook

This is the shared method for extracting useful specs from external platforms into `other-repos-specs/`.

It exists so we do not reinvent the process every time we study a new system, and so we do not accidentally turn “research” into “copy their architecture.”

## Placement Decision

Decision after a 2-round debate:

- keep the shared methodology at the root of `other-repos-specs/`
- keep the root [README.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/README.md) short and navigational
- put platform-specific interpretation inside each platform folder
- keep raw extracted artifacts separate from interpretation docs

Why:

- the method is shared across WordPress, Directus, Shopify, Payload, Medusa, and future platforms
- the root README should not become a giant process memo
- proprietary-platform caveats belong in the platform README, not in the shared method

## Where Things Go

### Raw source or local mirrors

Put local source repos under:

- `../other-repos/`

Use this for:

- open source repos cloned locally
- vendor code you need to inspect directly

Do not treat this as the canonical knowledge layer.

### Extracted specs

Put the canonical writable research output under:

- `other-repos-specs/`

Each platform should get its own folder:

- `other-repos-specs/{platform}_specs/`

Recommended structure for a new platform:

- `README.md` - platform summary, relevance to Tovu, what to keep, what to ignore
- `index.md` - corpus navigation
- `coverage-audit.md` - what is covered vs missing vs archival
- subsystem docs in platform-specific folders
- raw evidence folders when needed, for example:
  - `public-api-surface/`
  - `schema-dumps/`
  - `sample-responses/`
  - `screenshots/`
  - `cli-captures/`
- `TODO.md` - operational next steps only

## What We Are Actually Trying To Learn

For Tovu, the target is not “their backend.”

The target is:

- the platform primitives
- the operator editing model
- the extension boundaries
- the trust and safety boundaries
- the admin/product UX assumptions
- the constraints that produce good system behavior

That means:

- WordPress teaches CMS/admin/extensibility lessons
- Directus teaches metadata/admin/headless lessons
- Shopify teaches commerce/extensibility/sandbox/merchant UX lessons

## Decomposition Workflow

### 1. Define the visibility boundary first

For the platform you are studying, explicitly separate:

- what is public and inspectable
- what is open source and inspectable
- what is only observable through APIs or a live dev environment
- what is proprietary and therefore only inferable

Do this before writing specs, so the corpus stays honest.

### 2. Start from official docs and public entry points

Prefer:

- official docs
- official APIs
- official CLI docs
- official engineering posts
- official example repos

Only use secondary material as scaffolding, not as evidence.

### 3. Map the top-level surfaces

Before drilling deep, identify the major zones:

- public API surface
- admin/operator surface
- runtime/content or commerce model
- extension surface
- headless surface
- tooling/deployment/dev workflow

This prevents overfitting the corpus to one folder or one protocol.

### 4. Extract primitives before implementation details

List the nouns and their relationships first.

Examples:

- WordPress: posts, terms, comments, users, options, hooks
- Directus: collections, fields, items, policies, flows, files
- Shopify: products, variants, collections, carts, customers, orders, metafields, metaobjects, sections, blocks, apps, functions

If you do not understand the primitive model yet, do not write low-level architecture conclusions.

### 5. Split specs by product/system boundary, not by arbitrary file count

Good decomposition docs usually follow meaningful surfaces:

- authentication
- content/schema
- theme/presentation
- extension runtime
- admin shell
- SDK/contracts

Do not create fragments just because a codebase has many files.

### 6. Capture raw evidence separately from interpretation

Raw evidence:

- schema dumps
- sample API responses
- copied public-doc notes
- screenshots or CLI captures

Interpretation:

- README summaries
- subsystem spec docs
- Tovu translation notes

Do not mix the two into one unreadable file.

### 7. Translate every important subsystem back to Tovu

Use the same interpretive shape we already settled on:

- `Why this exists`
- `What Tovu should preserve`
- `What Tovu can simplify`
- `Possible Tovu seams`
- `Suggested priority`

This keeps the research useful without forcing Tovu into a clone.

### 8. Re-audit instead of assuming completeness

When a platform corpus grows:

- update `index.md`
- update `coverage-audit.md`
- clearly separate `covered`, `partial`, `not started`, and `archival`

## How To Decompose Proprietary Platforms

For proprietary platforms like Shopify, decompose the product surface instead of pretending you can inspect private internals.

Use:

- official docs
- dev dashboards
- dev stores or test tenants
- public APIs
- CLI output
- public engineering posts
- live sample responses

Avoid claims about:

- private database architecture
- internal service topology
- internal event pipelines
- undocumented safety or scaling systems

Instead say:

- “visible public contract”
- “observable constraint”
- “likely invariant inferred from public surface”

Make the difference explicit.

## Standard Platform README Template

Every new platform README should answer:

1. What is this platform?
2. What parts are public/open vs opaque/proprietary?
3. Why does it matter to Tovu?
4. What do we likely want to keep?
5. What should we not copy?
6. What has been extracted so far?
7. What are the official starting docs?
8. What is the next decomposition pass?

## Standard Subsystem Doc Template

For each important subsystem doc:

1. summary of the subsystem
2. key primitives / contracts
3. boundaries and constraints
4. operational implications
5. `Tovu Reconstruction Notes`

## What Not To Do

- Do not mirror vendor folder structure by default.
- Do not assume product surface equals internal implementation.
- Do not turn one platform into Tovu’s unquestioned target architecture.
- Do not let proprietary systems push Tovu core into provider-coupled assumptions.
- Do not bury the important lessons inside raw schema dumps or copied docs.

## Recommended Next Step For Shopify

Use this playbook with:

- [shopify_specs/README.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/shopify_specs/README.md)
- [shopify_specs/TODO.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/shopify_specs/TODO.md)

Then decompose Shopify in this order:

1. commerce primitives
2. merchant editing model
3. extension boundaries
4. checkout/customization safety model
5. headless runtime and tooling
