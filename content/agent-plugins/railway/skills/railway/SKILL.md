---
name: railway
description: Generate railway.json for the Tovu server, then create its volume and set variables as the output notes require.
---

# Railway server config

Use `tovu deploy config --target railway --region <region>` to generate `railway.json`.
The existing generator uses Tovu's server descriptor for the Dockerfile, port and health check.
Railway config-as-code has no volume or secrets fields: follow the command's stderr notes to
create the persistent volume at the named mount path and set variables before the first deploy.
Secret values never appear in the generated file. This plugin contributes config generation only,
with no deployment, status, logs or secrets adapter. Keep one instance for Tovu's SQLite state.
Deploying ships code, not site content.
