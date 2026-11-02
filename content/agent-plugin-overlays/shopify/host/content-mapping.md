# Tovu collection write shapes for Shopify

Read the portable `references/catalog-sync.md` through `agent_plugin_shopify` first; it owns
field meanings, variant caps, price units, image reuse and reconciliation order. This file
adds Tovu's inputs to those rules.

Define once with `collections_content_type_define {key:"product", label:"Products", fields:[…]}`.
Each row in the portable field table becomes a field object with exactly its `name`, `kind`,
`required` and `queryable` values. Use an existing compatible definition. If `product` is
rejected as reserved, use `shop_product` in every tool and marker. Never overwrite an unrelated
collection definition.

- List with `content_read.collection_entry {type:"product"}` and index by slug. Follow all pages.
  Only entries whose `shop_domain` matches this validated store belong to this reconciliation.
- Create with `collections_entry_create {type:"product", slug, title, fieldsJson:{ext:{site:{…}}}}`.
  Custom fields go inside `ext.site`, never at the top level. Keep the returned id/version.
- Update changed mapped values with
  `collections_entry_update {id, expectedVersion, title, fieldsJson:{ext:{site:{…}}}}`.
  The field bag is a COMPLETE replacement: retain unrelated fields already present, including
  fields outside `ext.site`. Equal values still create a revision, so skip unchanged writes.
- Publish with `collections_entry_publish {id, expectedVersion}` only if not already published.
  Hide missing published entries with `collections_entry_unpublish {id, expectedVersion}` only
  after the complete successful catalog read. Never delete them. Use the version from the latest
  response for every subsequent write; re-read and compare after a version conflict.
- Import with `media_import_from_url {url:"<image src>", alt:"<entry title>"}` only when the
  source changed, and use `media.publicUrl` as `image_url`. Each import creates a Media row,
  even for identical bytes. Retain `image_source` and reuse its stored URL on an unchanged run;
  share new imports across variants with the same source. A failed import never marks its new
  source successful, so a later run can retry.

Report successful counts, failed writes and variants past 10 as the portable reference requires.
A second identical run must add no entries, Media rows, revisions or publish writes.
