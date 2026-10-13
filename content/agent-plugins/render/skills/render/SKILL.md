---
name: render
description: Generate render.yaml for the Tovu server, then follow the manual deployment and secret setup notes.
---

# Render server config

Use `tovu deploy config --target render --region <region>` to generate `render.yaml`.
The existing generator uses Tovu's server descriptor for the Dockerfile, port, health check,
persistent disk and secret names. Secret values are never emitted; `sync: false` leaves them
for the human to supply in Render. Follow the command's stderr notes before the first deploy.
This plugin contributes config generation only, with no deployment, status, logs or secrets adapter.
Deploying ships code, not site content. Keep one server instance for Tovu's SQLite state.
