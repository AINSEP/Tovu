# other-repos-specs

Extracted research specs from platforms Tovu is learning from.

These files are not dependencies and they are not “vendor internals.” They are the distilled, writable research layer that sits on top of:

- local source mirrors in `../other-repos/`
- public docs and public APIs
- live dev-store or sample outputs when a platform is proprietary

Start here before dropping into raw source trees:

- [DECOMPOSITION_PLAYBOOK.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/DECOMPOSITION_PLAYBOOK.md)

## How This Relates To Tovu

This corpus exists to help Tovu learn from strong systems without cloning them blindly.

The goal is to extract:

- core content or commerce primitives
- merchant and operator editing models
- extensibility boundaries
- admin UX patterns
- safe architectural constraints worth preserving

The goal is not to reproduce private internals or copy provider-specific architecture into Tovu core.

## Reading Order

For any platform:

1. Read this file.
2. Read the platform README if one exists.
3. Read the platform `index.md` and `coverage-audit.md`.
4. Only then drop into subsystem specs or raw source repos.

## Corpus Status

### wordpress_specs

Status: `Extracted`

Current corpus:

- `78` markdown specs
- full Tovu-oriented reconstruction notes across the corpus

Why it matters to Tovu:

- WordPress is still the best reference for authoring workflow, plugin-era extensibility, theme/template composition, and the shape of a merchant/admin CMS that has to survive long-tail customization.

What Tovu may want to keep:

- clear admin/operator lifecycle
- structured content and theme composition ideas
- disciplined extension boundaries instead of raw code injection everywhere
- strong separation between runtime primitives and screen-specific UI

Entry points:

- [wordpress_specs/index.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/wordpress_specs/index.md)
- [wordpress_specs/coverage-audit.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/wordpress_specs/coverage-audit.md)

### directus_specs

Status: `Extracted`

Current corpus:

- `29` markdown specs
- full Tovu-oriented reconstruction notes across the corpus

Why it matters to Tovu:

- Directus is the strongest reference here for metadata-driven admin surfaces, runtime content modeling, policy/access boundaries, and “headless-first” operator UX.

What Tovu may want to keep:

- metadata-backed admin rendering
- protected system/user model boundaries
- explicit access/policy surfaces
- extension seams that sit outside the core domain model

Entry points:

- [directus_specs/index.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/directus_specs/index.md)
- [directus_specs/coverage-audit.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/directus_specs/coverage-audit.md)

### shopify_specs

Status: `Public-surface extraction in progress`

Current corpus:

- `28` public-doc markdown extracts
- `1` full Admin API schema dump from a dev store
- `4` sample API response captures

Why it matters to Tovu:

- Shopify is the best current reference for commerce primitives, merchant-editable composition, app/extension boundaries, safe hosted extensibility, and the split between public storefront contracts and privileged admin contracts.

What Tovu may want to keep:

- two-surface model: public read path vs privileged operator path
- structured custom data via metafields/metaobjects
- merchant-editable page composition through sections/blocks
- extension sandboxes instead of arbitrary DOM/code access
- strong CLI/dev-store workflow for extension development

Entry points:

- [shopify_specs/README.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/shopify_specs/README.md)
- [shopify_specs/TODO.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/shopify_specs/TODO.md)

### payload_specs

Status: `Not yet extracted`

Source repo exists locally at `../other-repos/payload/`.

Why it matters to Tovu:

- Payload is useful for modern TypeScript-native CMS architecture, field config ergonomics, and code-first admin/data design.

### medusa_specs

Status: `Extracted`

Current corpus:

- `28` markdown docs
- deeper Tovu-oriented extraction across runtime, commerce, admin, extensibility, and tooling, including module-level Medusa commerce breakdowns

Source repo exists locally at `../other-repos/medusa/`.

Why it matters to Tovu:

- Medusa is useful for open commerce backend architecture, workflows, module boundaries, and an alternative take on commerce primitives compared with Shopify.

What Tovu may want to keep:

- module-owned commerce domains with explicit cross-module links
- workflow orchestration as a coordination layer above modules
- swappable provider packages for infra-sensitive concerns
- separate store/admin/auth surfaces
- controlled admin extension seams

Entry points:

- [medusa_specs/README.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/medusa_specs/README.md)
- [medusa_specs/index.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/medusa_specs/index.md)
- [medusa_specs/coverage-audit.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/medusa_specs/coverage-audit.md)

## Folder Rules

- `../other-repos/` holds raw local source mirrors or vendor code.
- `other-repos-specs/` holds the extracted, canonical research artifacts.
- New platforms should follow the decomposition process in [DECOMPOSITION_PLAYBOOK.md](/Users/la/Desktop/Tovu AI CMS/other-repos-specs/DECOMPOSITION_PLAYBOOK.md).

## Important Constraint

For proprietary systems like Shopify:

- use public docs, official APIs, dev stores, CLI, engineering posts, and safe sample outputs
- do not pretend we have private implementation access
- treat the result as product-surface reverse engineering, not source-level archaeology
