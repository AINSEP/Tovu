# Vercel — implementation notes

Host-specific notes moved out of Tovu core comments (2026-10-22, vendor-to-plugins). Core describes these
behaviours generically; the vendor detail lives here.

- **Account label.** The verified account label is the Vercel `username`.
- **Project name.** The publish label seeds the Vercel project name (sanitized by `safeVercelProjectName`).
- **Security headers.** Rendered into a root `vercel.json` from the publish's `responseHeaders`
  (`targets/vercel.mjs`).
- **Base path.** Served at the root, so no base path is set.
- **Deploy poll.** A publish blocks on Vercel's deployment poll (up to about a minute).
- **Errors.** No code path puts `credential.token` into a `DeployError` message (verified when core's
  adapter boundary was written); core's message-only boundary holds regardless.
