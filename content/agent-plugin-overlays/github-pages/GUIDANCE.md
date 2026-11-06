# Tovu host guidance for github-pages

These rules specialize the portable plugin guidance for Tovu.


## Host details for skills/github-pages/SKILL.md

Open the plugin’s **Connect GitHub Pages** card with `credential_save {kind:"plugin-provider",target:"github-pages"}`. Select only the destination repository and grant Contents and Pages **Read and write**. The card links to token creation; the hosting owner verifies and seals it.


## Host operations for skills/github-pages/SKILL.md

The steps are the same for every host: `deployment_get_static_publish_capabilities` shows whether a
credential is saved, `deployment_preview_static_publish` comes first, and `deployment_execute_static_publish`
publishes once the person confirms. `ok: "partial"` means not reachable yet: never call it failed or live.
This file is what is particular to GitHub Pages.
