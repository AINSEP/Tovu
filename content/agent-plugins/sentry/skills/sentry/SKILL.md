---
name: sentry
description: Connect the site's error tracking to Sentry. Use when the person says "connect Sentry", "add error tracking", "report errors to Sentry", "set up crash reporting", or asks whether Sentry is working.
---

# Sentry

Tovu reports errors through its Sentry provider plugin, `observability-sentry`. This plugin only
knows how to set it up; it holds no key and runs no code.

## Set it up

1. Check status: `provider_status {pluginId:"observability-sentry"}`.
   - Not listed: the provider plugin is not installed. Say so in one line; `plugins_list` shows what is.
   - `enabled: false`: offer `plugins_set_enabled {family:"site-runtime", pluginId:"observability-sentry", enabled:true}`.
   - `configured: true`: say it is already connected. Open the card again only if they ask to change it.
2. Say in one sentence what the card is for, then open it:
   `credential_save {kind:"plugin-provider", target:"sentry"}`.
   The card asks for the DSN (Sentry → Project settings → Client Keys (DSN)) and an optional
   environment name; blank means Tovu picks local, desktop or fly automatically.
3. After it saves: saved for every site in this project; takes effect the next time the site starts.

## Rules

- Never ask for the DSN in chat and never put it in any tool argument. The card is the only way in.
- Changing the environment needs the DSN entered again; the card says so if they try.
