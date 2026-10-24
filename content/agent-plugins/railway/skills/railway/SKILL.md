---
name: railway
description: Generate railway.json for the Tovu server, then create its volume and set variables as the output notes require.
---

# Railway server config

For a coding agent or the operator's terminal, use
`tovu deploy config --target railway --region <region>` to generate `railway.json`.
The in-app assistant uses tools, never Bash or a Railway CLI. There is no chat
config-generation tool today: explain that gap and hand the command to the operator
or a coding agent. Do not invent a deploy tool or claim the server was deployed.
The existing generator uses Tovu's server descriptor for the Dockerfile, port and health check.
Railway config-as-code has no volume or secrets fields: follow the command's stderr notes to
create the persistent volume at the named mount path and set variables before the first deploy.
Secret values never appear in the generated file. This plugin contributes config generation only,
with no deployment, status, logs or secrets adapter. Keep one instance for Tovu's SQLite state.
Deploying ships code, not site content.

## Railway token

Writing `railway.json` needs **no token**. Do not open a key card for that task.

Deploying through Railway's API is being added. Until then you cannot deploy, redeploy or
change Railway services: say so and use the manual notes above. Saving a token deploys nothing.

Only when the person wants to save a Railway token, or asks you to look something up in
Railway, first check `content_read { resource: "custom_credential" }` for a saved one and reuse
it. Otherwise open **Connect Railway** with
`credential_save { kind: "plugin-provider", target: "railway" }`; it saves as `Railway API`.
The person creates the token under Account Settings → Tokens and selects the site's workspace.
A project token from a project's settings will not work here.

To look something up, use `custom_credential_make_request` with label `Railway API` and
`https://backboard.railway.com/graphql/v2`, sending GraphQL queries only, never mutations.
The server adds the token. Check the response's `errors` as well as its status.

Never ask for a token in chat. Never offer to replace a working token unless asked.
