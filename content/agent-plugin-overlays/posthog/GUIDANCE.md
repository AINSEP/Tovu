# Tovu host guidance for posthog

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/posthog/SKILL.md

1. Check status: `provider_status {pluginId:"analytics-posthog"}`.
   - Not listed: the provider plugin is not installed. Say so in one line; `content_read.plugin` shows what is.
   - `enabled: false`: offer to turn it on with
     `plugins_set_enabled {family:"site-runtime", pluginId:"analytics-posthog", enabled:true}` (the person confirms).
   - `usedByThisSite: false` with a `keyId`: ask "Use the saved PostHog key for <site>?".
     Yes → `project_key_use {keyId, use:true}`. To use a different key, open the card;
     it saves for this site only when other sites use the project key.
   - `configured: true`: say it is already connected. Open the card again only if they ask to change it.
2. Say in one sentence what the card is for, then open it:
   `credential_save {kind:"plugin-provider", target:"posthog"}`.
   The card asks for the region (US Cloud is the default, EU Cloud, or Custom for a self-hosted
   URL) and the Project API key (PostHog → Project settings → Project API key, starts with `phc_`).
3. After it saves: the key is saved to your project; no site uses it yet. Ask the result's
   `ask` ("Apply this PostHog key to <site>?"). Yes → `project_key_use {keyId, use:true}`;
   it applies now. If the result says `appliesAt: "restart"`, offer `site_restart`.
   No → it stays saved for later. An already-attached or site-only save applies now.
