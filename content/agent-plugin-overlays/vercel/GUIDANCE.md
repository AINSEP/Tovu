# Tovu host guidance for vercel

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/vercel/SKILL.md

Open the plugin’s **Connect Vercel** card with `credential_save {kind:"plugin-provider",target:"vercel"}`. It links to token creation and explains account/team access. The hosting save flow verifies and seals the token.


## Host operations for skills/vercel/SKILL.md

The steps are the same for every host: `deployment_get_static_publish_capabilities` shows whether a
token is saved, `deployment_preview_static_publish` comes first, and `deployment_execute_static_publish`
publishes once the person confirms. `ok: "partial"` means not reachable yet: never call it failed or live.
This file is what is particular to Vercel.
