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
