# Tovu host guidance for sentry

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/sentry/SKILL.md

1. Check status: `provider_status {pluginId:"observability-sentry"}`.
   - Not listed: the provider plugin is not installed. Say so in one line; `content_read.plugin` shows what is.
   - `enabled: false`: offer `plugins_set_enabled {family:"site-runtime", pluginId:"observability-sentry", enabled:true}`.
   - `usedByThisSite: false` with a `keyId`: ask "Use the saved Sentry key for <site>?".
     Yes → `project_key_use {keyId, use:true}`. To use a different key, open the card;
     it saves for this site only when other sites use the project key.
   - `configured: true`: say it is already connected. Open the card again only if they ask to change it.
2. Say in one sentence what the card is for, then open it:
   `credential_save {kind:"plugin-provider", target:"sentry"}`.
   The card asks for the DSN (Sentry → Project settings → Client Keys (DSN)) and an optional
   environment name; blank means the host picks one for where the site runs.
3. After it saves: the key is saved to your project; no site uses it yet. Ask the result's
   `ask` ("Apply this Sentry key to <site>?"). Yes → `project_key_use {keyId, use:true}`;
   it applies now. If the result says `appliesAt: "restart"`, offer `site_restart`.
   No → it stays saved for later. An already-attached or site-only save applies now.
