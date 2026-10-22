# Cloudflare — implementation notes

Host-specific notes moved out of Tovu core comments (2026-10-22, vendor-to-plugins). Core describes these
behaviours generically; the vendor detail lives here.

- **Credentials.** `accountId` is HARD required for Pages publishes; a credential missing it fails with a
  `DeployError` naming the field. The optional Zone ID may be submitted blank, meaning "not provided".
- **Stored `projectName`.** Accepted and stored although, when written, the Pages target derived its project
  name from the publish call's label, not from stored config.
- **Account label.** No reviewed account field is read from the verify response; the account-label heal
  skips these credentials.
- **Security headers.** Root `_headers` is applied only when sent as its own upload field, never as an asset
  (see `lib/pages-upload.mjs`, `skills/cloudflare/references/pages.md`).
