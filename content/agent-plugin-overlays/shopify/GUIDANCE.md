# Tovu host guidance for Shopify

This guidance adds Tovu's tools and rendering constraints to the portable Shopify skill.
The portable references own catalog mapping, idempotency and safe checkout/domain order.
Shopify is available from Jini for explicit installation; Tovu does not bundle it by default.

Read portable files through `agent_plugin_shopify` with `file: "references/<file>"`.
Before collection writes, read `file: "host/content-mapping.md"`. Before writing the shop grid,
read `file: "host/storefront-snippets.md"`. Before redirects, domain changes or live components,
read `file: "host/site-integration.md"`. Never read these files through a repository root.

| Job | Tovu tool |
|---|---|
| The one question if the store is unknown | `assistant_ask_choice`, suggested default first |
| Read raw catalog and metadata | `web_fetch_page {url, format:"raw", maxChars:200000}` |
| List saved product entries | `content_read.collection_entry {type:"product"}` (use `shop_product` after fallback) |
| Define the collection | `collections_content_type_define` |
| Create, update, publish or hide an entry | `collections_entry_create`, `collections_entry_update`, `collections_entry_publish`, `collections_entry_unpublish` |
| Import a changed product image | `media_import_from_url {url, alt}`; save the returned `media.publicUrl` |
| Create the Shop page | `pages_write_html` |
| Add navigation, retaining unrelated items | `menus_create_menu`, `menus_update_menu_tree`, `menus_assign_location` |
| Load the plugin providing `ui-design` before styling | `agent_plugin_ui_ux_design {skill:"ui-ux-design"}` |
| Save old product and collection paths | `redirects_import`; check each result |

Raw collection reads use the `content_read.collection_entry` card. The former standalone
collection-list tool is retired. Use the current tool schema for pagination and batch envelopes;
read every page of saved entries before reconciliation, and inspect each batch result.
