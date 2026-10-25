---
name: resend
description: Send the site's email through Resend, and manage the Resend account itself (domains and DNS verification, broadcasts, contacts, segments, topics, templates, logs, usage) through Resend's hosted MCP server. Covers which tools to use for what, the two keys and how each is saved through Tovu's secure form, verifying the sending domain, and what each send failure means in plain words.
---

# Resend: the site's email, and the Resend account

## Scope

Choose the card yourself from its `usedFor` list. Reuse a saved key for that
task. Never offer a replacement unless the person asks.

This plugin does two separate jobs. Keep them apart.

1. **The sending card** (`resend`). The adapter ships in
   this opt-in plugin. Enable it first in Email → Provider → + Add provider, then save its key.
   Choose “Use this provider” to switch delivery; enabling or saving alone never switches mail.
2. **The account card** (`resend-mcp`).
   This goes through Resend's own hosted MCP server, `https://mcp.resend.com/mcp`. Its tools appear
   as `mcp__resend__<name>`, for example `mcp__resend__list-domains`.

## Which tools to use

**Tovu's own mail tools are the source of truth for the site's email.** Use them for anything about
how this site sends:

- `system_get_mail_status`: is mail set up, which provider, is the domain ready.
- `mail_set_provider`: switch the site between Resend, SMTP and none.
- `mail_send_test`: prove the site's mail works end to end.
- `dns_*`: add or check the DNS records on the site's own domain.

Never use `mcp__resend__send-email` to test or stand in for the site's mail: it skips Tovu's outbox,
retries, suppression list and logs, so a pass there proves nothing about the site.

**Use the `mcp__resend__*` tools for work on the Resend account itself**, when the person asks for it:

- **Domains**: `list-domains`, `get-domain`, `create-domain`, `update-domain`, `verify-domain`, and
  the domain-claim tools. `create-domain` returns the DNS records; add them with Tovu's `dns_*`
  tools when the site's DNS is managed in Tovu, otherwise show them to the person. Then call
  `verify-domain`.
- **Broadcasts**: draft, update, compose and cancel. Sending a broadcast is not switched on by
  default (see below); the site's own newsletter goes through Tovu.
- **Contacts, segments, topics, contact properties, templates**: list, read, create, update.
- **Emails**: one-off emails the person asks for (`send-email`, `send-batch-emails`, which ask the
  person to confirm first), reading sent and received emails, cancelling a scheduled one.
- **Logs, usage, suppressions, webhooks, API keys**: read only.

**Off by default:** every `remove-*` tool, `send-broadcast`, creating or changing API keys,
creating, changing or rotating webhooks, and revoking sign-ins. Removals cannot be undone, a
broadcast mails a whole audience, and new keys or webhook secrets would land in the chat. If the
person really needs one of these, do it in the Resend dashboard, or tell them they can switch that
tool on under Settings for this connection.

## Connect the Resend account (before any `mcp__resend__*` tool)

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
3. Paste it into the form Tovu shows. Never into the chat.

- `{ status: "connected" }`: go ahead.
- `{ status: "not-connected" }`: explain the returned outcome; do not call the account tools yet.
- The form says the key was rejected: it is a "Sending access" key. Make a Full access one.
- The form says Resend is unavailable right after a save: most often the key was mistyped (Resend
  answers a malformed key that way). Ask the person to copy it again; retry once, then wait.

Never ask for the key in chat, and never put it in any tool argument.

## Set up the site's email

1. **Get a sending key.** The person signs in at [resend.com/api-keys](https://resend.com/api-keys)
   and creates a key with **Sending access** (only sending; the site needs nothing more). This is a
   different key from the Full access one above.
2. **Save it through the Connect Resend card:** `credential_save { kind: "plugin-provider", target: "resend" }`.
   The card asks only for the key and saves it where Tovu looks for it ("Tovu Mail — Resend API").
   Never ask for the key in chat. If a sending key is already saved, reuse it. Only open a replacement
   card if the person explicitly asks to replace that key; explain that it REPLACES the saved key.
3. **Verify the sending domain.** Until it is verified, Resend only sends to the account's own
   address. Check with `system_get_mail_status`; add records with `dns_*` (or, when the account is
   connected, `mcp__resend__create-domain` then `mcp__resend__verify-domain`).
4. **Select Resend** with `mail_set_provider { providerId: "resend" }`. The change and saved key
   take effect on the next email. Never ask the person to restart Tovu.
5. Prove it with `mail_send_test`.

## What a failure means

- `validation_error`: a bad address or an unverified sending domain. Fix the address or verify the domain.
- `missing_api_key`, `invalid_api_key`, `restricted_api_key`: the saved key is wrong or lacks sending
  access. Explain the failure and needed access. Only after an
  explicit replacement request, use `credential_save { kind: "api", target: "Tovu Mail — Resend API" }`.
- `rate_limit_exceeded`, HTTP 5xx, `TRANSPORT_ERROR`: temporary. Tovu retries these.

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
