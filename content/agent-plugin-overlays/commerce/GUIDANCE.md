# Tovu host guidance for commerce

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/commerce/SKILL.md

For the Tovu host, set up checkout in this order:

1. Enable Commerce and the selected payment provider through the existing plugin activation controls. Use `provider_status` to discover the provider plugin id. Open its secure settings card with `credential_save({kind:"provider-settings",target:"<provider plugin id>"})`. For Stripe, save the merchant `accountId` and the selected mode's `test_secretKey`/`test_webhookSecret` or `live_secretKey`/`live_webhookSecret` in that human form. Never put these keys in tool arguments, general settings or chat.
2. Use `settings_list_definitions` to inspect namespace `core.commerce`. Save its workspace `configuration` with `settings_set_value`: `{"namespace":"core.commerce","key":"configuration","scope":"workspace","value":{"providerId":"stripe","accountId":"<matching merchant account id>","mode":"test","publicOrigin":"https://<deployed shop host>"}}`. `providerId` selects the payments provider; `accountId` must match its secure settings; `mode` is `test` or `live`; `publicOrigin` is an HTTPS origin without a path, query, credentials or fragment. Use the deployed shop origin, never the desktop address. Do not change this selection while original payments are draining.
3. Call `commerce_get_status`. Its `checkout.webhookUrl`, when present, is the exact public URL the owner must register manually in the selected provider's webhook dashboard, using that mode's signing secret in the secure settings card. The Tovu URL is `<publicOrigin>/api/payments/webhooks/<trusted site id>/<providerId>/<mode>`; use the returned URL rather than guessing the site id. Webhook provisioning is manual. A ready status does not prove external reachability: verify delivery on the deployed site in provider test mode before live acceptance.
4. Call `commerce_create_product({name:"Notebook",slug:"notebook"})`, then `commerce_create_price({productId:"<returned product id>",amount:{minorUnits:123,currency:"JPY"}})`. Prices are immutable positive integer minor units; JPY has no decimal units. Setup activates the prepared catalog only when the plugin and provider configuration are usable. Check `commerce_get_status` again and explain any unavailable reason before offering checkout.
