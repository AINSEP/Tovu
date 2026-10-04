Published-site WebMCP is ON by default. Its workspace setting is
`core.privacy.published_site_webmcp_enabled`, on the existing Settings ledger.
An explicit `false` removes the injected browser script and native form-tool
attributes from public HTML. Admin browser opt-out also stops the script locally.
No schema changes, polyfill, credentials or custom tool transport are required.

The generic browser generator is owned by Jini:
`packages/agentic/src/core/annotated-actions-script.ts`. The generated source
snapshot under `generated/` is needed because this dispatch prohibits Jini builds
and publishing and the installed package does not export this addition yet.
The provenance regression verifies its captured Jini source hash, so ordinary
Tovu test runs do not require a sibling Jini checkout. Refresh the snapshot and
provenance together from canonical Jini source whenever that generator changes.
Replace the snapshot import with `@jini-ai/agentic/core` at the next coordinated
package release. Never edit the snapshot independently.

Tools activate annotated `button[type=button]` controls after native confirmation,
or navigate to actual same-origin HTTP(S) anchor targets. They accept no arguments,
read no field values, skip duplicate names, and unregister on mutation/pagehide.
Native forms keep their real submit handler, transport, validation and human
submission; success belongs to that handler. Tool invocation is not authorization.
