# Shopify Commerce Primitives

## Summary

Shopify's content/commerce model is built on a small set of core entities that every other feature references. Understanding these primitives is the foundation for understanding everything else.

## The Core Nouns

| Primitive | What it is | Tovu analog |
|-----------|-----------|-------------|
| **Product** | The central content entity. Has title, description (plain + HTML), handle/slug, tags, vendor, type, SEO, media, timestamps (created, updated, published). | `Post` |
| **ProductVariant** | A purchasable version of a product, differentiated by options (size, color). Has its own price, SKU, inventory, image. | No current equivalent — Tovu doesn't have variant-level content |
| **Collection** | A group of products. Can be manual or automated (rule-based). Has its own title, description, handle, image, SEO. | No current equivalent — maps to categories/tags/series |
| **Page** | A freeform content page (About Us, Contact, etc). Has title, body (HTML), handle, SEO. | `Post` (type=page) |
| **Blog** | A container for Articles. Has title, handle, authors. | Could map to a workspace or content channel |
| **Article** | A blog post. Has title, content (plain + HTML), excerpt, handle, author, image, tags, comments, published timestamp. | `Post` (type=article) |
| **Cart** | Session-scoped buyer intent. Has lines (items), buyer identity, costs, delivery, discounts. | Not relevant to CMS |
| **Order** | Completed purchase. Has line items, customer, addresses, financial status, fulfillment status, discounts. | Not relevant to CMS |
| **Customer** | A buyer account. Has name, email, addresses, orders, tags, marketing consent. | Maps to Tovu user/member |
| **Image** | An image asset with URL, alt text, dimensions, thumbhash placeholder. Transform args for resize/crop. | Media asset |
| **Metafield** | Arbitrary key-value data attached to any entity. Namespace + key + value + type. | Tovu needs this |
| **Metaobject** | Standalone structured entity with multiple fields, referenceable from other resources. | Tovu needs this |

## Key Patterns

### Dual description fields
Every content entity has both `description` (plain text, stripped) and `descriptionHtml` (full HTML). Articles additionally have `excerpt` and `excerptHtml`. This supports search indexing (plain) vs rendering (HTML) without forcing callers to strip tags.

### Handle as first-class field
Every entity has a `handle` — a URL-friendly slug auto-generated from title but independently editable. This is separate from the `id` (opaque GID). Tovu's `Post` already has `slug` — same pattern.

### Temporal triad
Products have three timestamps: `createdAt`, `updatedAt`, `publishedAt`. This separates creation time, last edit time, and when it became publicly visible. Articles have the same. Tovu's Post should follow this pattern.

### HasMetafields interface
Every major entity implements `HasMetafields`, meaning you can attach arbitrary typed data to anything. This is the extensibility escape hatch — you don't need schema changes to add custom fields.

### Connection-based pagination
All list fields use the Relay connection pattern: `edges > node`, with `first/after/last/before` cursor args. This is consistent across the entire API.

### SEO as sub-object
Products, Collections, Pages, Articles all have an `seo` field returning `{ title, description }`. This keeps SEO concerns grouped rather than scattered as top-level fields.

## Boundaries and Constraints

- Products are not content pages. Shopify has separate Product, Page, and Article types — they don't try to make one "universal content" entity.
- Variants belong to exactly one Product. A variant without a product doesn't exist.
- Collections can contain Products but not other Collections (no nesting).
- Metafields have ownership (app-owned vs merchant-owned) with different permission models.
- All entities have globally-unique IDs in GID format (`gid://shopify/Product/123`).

## Tovu Reconstruction Notes

### Why this exists
Shopify needs a small, stable set of nouns that thousands of apps and themes can build on. The primitives are intentionally constrained — you can't add new entity types, but you can extend any entity with metafields.

### What Tovu should preserve
- **Dual description pattern**: plain text + HTML for every content entity.
- **Handle/slug as first-class**: independent from ID, editable, used in URLs.
- **Temporal triad**: createdAt, updatedAt, publishedAt as separate concerns.
- **SEO as grouped sub-object**: not scattered fields.
- **Metafields on everything**: arbitrary typed custom data without schema migration.

### What Tovu can simplify
- Tovu doesn't need Product/Variant/Cart/Order — it's a CMS, not a commerce platform. The relevant primitives are **Post, Page, Collection, Media, Metafield**.
- Tovu can unify Blog+Article into its Post model with a "channel" or "type" discriminator.
- Tovu doesn't need the `vendor` or `productType` fields — those are commerce taxonomy.

### Possible Tovu seams
- `src/features/post/` should gain: `descriptionHtml`, `publishedAt` (separate from `createdAt`), `seo` sub-object, `metafields` connection.
- A new `src/features/collection/` could group posts into named, ordered sets.
- A new `src/features/custom-data/` could implement the metafield/metaobject pattern.

### Suggested priority
High — this is the foundation. Everything else (themes, extensions, APIs) references these primitives.
