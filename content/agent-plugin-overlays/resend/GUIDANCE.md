# Tovu host guidance for resend

This Tovu guidance comes before the portable `resend` skill. Where the two differ, this guidance is
the more specific one.

**Enable and switch.** Enable the sending adapter in Email → Provider → + Add provider, then save
its key. Choose “Use this provider” (or `mail_set_provider { providerId: "resend" }`) to switch
delivery; enabling or saving alone never switches mail. Never ask the person to restart Tovu.

## Bounces and complaints (webhook)

Resend tells Tovu when a message hard-bounces or is marked as spam, so Tovu stops mailing that
address (a complaint stops newsletters only; sign-in links still go out).

1. In Resend, **Webhooks**, add the endpoint `https://<the site's public address>/hooks/mail/resend`
   with the events `email.bounced`, `email.complained` and `email.delivered`. Do this in the
   dashboard, not with the MCP tools: the signing secret must not pass through the chat.
2. Copy the endpoint's **signing secret** (it starts with `whsec_`). Never ask for it in chat.
3. Save it through the secure form: `credential_save { kind: "api", label: "Tovu Mail — Resend
   Webhook Secret", baseUrl: "https://api.resend.com", category: "ops" }`.
4. **Rotating it:** rename the saved one to `Tovu Mail — Resend Webhook Secret (previous)`, save the
   new one under the label above, then delete the previous one once Resend uses only the new secret.

Without a saved secret the endpoint answers 503 and Resend retries later; nothing is lost while it is
being set up.


## Host details for skills/resend/SKILL.md

The account connection uses a separate **Full access** API key, not browser OAuth. Reuse a saved
account key; never offer to replace it unless the person asks. Call
`agent_plugin_connect { pluginId: "resend" }` to check the saved connection or open its secure key card.
Only say the card is open after the tool emits it. A cancelled or expired card is not a connection.

If opening the account card directly, use
`credential_save { kind: "plugin-provider", target: "resend-mcp" }`. Explain first:
"This is a separate Full access key so I can add and verify your domain. It keeps your site's
existing sending key." Then tell the person:
1. Sign in at [resend.com/api-keys](https://resend.com/api-keys) and choose **Create API Key**.
2. Permission: **Full access** (a "Sending access" key is refused). Domain: all domains.
3. Paste it into the secure form the host shows. Never into the chat.

1. **Get a sending key.** The person signs in at [resend.com/api-keys](https://resend.com/api-keys)
   and creates a key with **Sending access** (only sending; the site needs nothing more). This is a
   different key from the Full access one above.
2. **Save it through the Connect Resend card:** `credential_save { kind: "plugin-provider", target: "resend" }`.
   The card asks only for the key and saves it under the label the host reads ("Tovu Mail — Resend API").
   Never ask for the key in chat. If a sending key is already saved, reuse it. Only open a replacement
   card if the person explicitly asks to replace that key; explain that it REPLACES the saved key.
3. **Verify the sending domain.** Until it is verified, Resend only sends to the account's own
   address. Check with `system_get_mail_status`; add records with `dns_*` (or, when the account is
   connected, `mcp__resend__create-domain` then `mcp__resend__verify-domain`).
4. **Select Resend** with `mail_set_provider { providerId: "resend" }`. The change and saved key
   take effect on the next email. Never ask the person to restart the host.
5. Prove it with `mail_send_test`.

- `validation_error`: a bad address or an unverified sending domain. Fix the address or verify the domain.
- `missing_api_key`, `invalid_api_key`, `restricted_api_key`: the saved key is wrong or lacks sending
  access. Explain the failure and needed access. Only after an
  explicit replacement request, use `credential_save { kind: "api", target: "Tovu Mail — Resend API" }`.
- `rate_limit_exceeded`, HTTP 5xx, `TRANSPORT_ERROR`: temporary. The host retries these.
