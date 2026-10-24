---
name: render
description: Generate render.yaml for the Tovu server, then follow the manual deployment and secret setup notes.
---

# Render server config

For a coding agent or the operator's terminal, use
`tovu deploy config --target render --region <region>` to generate `render.yaml`.
The in-app assistant uses tools, never Bash or a Render CLI. There is no chat
config-generation tool today: explain that gap and hand the command to the operator
or a coding agent. Do not invent a deploy tool or claim the server was deployed.
The existing generator uses Tovu's server descriptor for the Dockerfile, port, health check,
persistent disk and secret names. Secret values are never emitted; `sync: false` leaves them
for the human to supply in Render. Follow the command's stderr notes before the first deploy.
This plugin contributes config generation only, with no deployment, status, logs or secrets adapter.
Deploying ships code, not site content. Keep one server instance for Tovu's SQLite state.

## Render API key

Writing `render.yaml` needs **no key**. Do not open a key card for that task.

Deploying through Render's API is being added. Until then you cannot deploy, redeploy or
change Render services: say so and use the manual notes above. Saving a key deploys nothing.

Only when the person wants to save a Render key, or asks you to look something up in Render,
first check `content_read { resource: "custom_credential" }` for a saved one and reuse it.
Otherwise open **Connect Render** with
`credential_save { kind: "plugin-provider", target: "render" }`; it saves as `Render API`.
The person creates the key under Account Settings → API Keys. A deploy hook URL is not a key.

To look something up, use `custom_credential_make_request` with label `Render API` and
`GET` requests under `https://api.render.com/v1`, such as `/services?limit=20`. The server adds
the key. A refusal may mean the account lacks access, not that the key is bad.

Never ask for a key in chat. Never offer to replace a working key unless asked.
