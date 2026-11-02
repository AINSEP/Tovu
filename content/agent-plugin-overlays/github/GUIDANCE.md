# Tovu host guidance for github

This Tovu guidance comes before the portable `github` skill. Where the two differ, this guidance is
the more specific one.

**Deploying the Tovu server with GitHub Actions.** `deployment_ops_deploy` with platform
`github-actions` resolves the branch or tag to a full SHA and dispatches the repository's Tovu deploy
workflow with `expected_sha` pinned to it. The workflow refuses to deploy if that ref moved, and a
manual dispatch without a full 40-character lowercase `expected_sha` fails before anything builds.
Say which commit will build. Setting up the Fly server itself is the `fly` plugin's job.

**`CREDENTIAL_UNREADABLE` (site backup and source control).** The Site key decides it. No Site key:
start Tovu with it (`npm run dev` from the repo root, or `npm run desktop`). Malformed: fix it under
**Secrets → Site key**. A different Site key from the one the credential was saved under: check
**Secrets → Site key**, or save the credential again.

**Static export.** `source_control_execute_commit`'s package layout does not change Tovu's static
publishing or `tovu export`, which keep their current output.

**Restore.** Tovu has no restore tool yet. Do not promise one.
