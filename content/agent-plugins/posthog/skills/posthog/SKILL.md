---
name: posthog
description: Connect the site to PostHog product analytics. Use when the person says "connect PostHog", "set up analytics", "add product analytics", "track events in PostHog", or asks whether PostHog is working.
---

# PostHog

Tovu sends product analytics through its PostHog provider plugin, `analytics-posthog`. This plugin
only knows how to set it up; it holds no key and runs no code.

It is part of `analytics-posthog` and turns on and off with it: there is no separate switch for this plugin.

## Set it up

1. Check status: `provider_status {pluginId:"analytics-posthog"}`.
   - Not listed: the provider plugin is not installed. Say so in one line; `plugins_list` shows what is.
   - `enabled: false`: offer to turn it on with
     `plugins_set_enabled {family:"site-runtime", pluginId:"analytics-posthog", enabled:true}` (the person confirms).
   - `configured: true`: say it is already connected. Open the card again only if they ask to change it.
2. Say in one sentence what the card is for, then open it:
   `credential_save {kind:"plugin-provider", target:"posthog"}`.
   The card asks for the region (US Cloud is the default, EU Cloud, or Custom for a self-hosted
   URL) and the Project API key (PostHog → Project settings → Project API key, starts with `phc_`).
3. After it saves, tell them: saved for every site in this project; it takes effect the next time
   the site starts (restart the site to start sending now).

## Rules

- Never ask for the key in chat and never put a key in any tool argument. The card is the only way in.
- Changing the region needs the key entered again; the card says so if they try.
- Owner events go out only with the operator's analytics consent; that is Tovu's setting, not PostHog's.
