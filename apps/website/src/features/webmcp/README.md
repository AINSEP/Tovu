Published-site WebMCP is ON by default. Its workspace setting is
`core.privacy.published_site_webmcp_enabled`, on the existing Settings ledger.
An explicit `false` removes the injected browser script and native form-tool
attributes from public HTML. Admin browser opt-out also stops the script locally.
No schema changes, polyfill, credentials or custom tool transport are required.

The generic browser generator comes from `@jini-ai/agentic/core`.

Tools activate annotated `button[type=button]` controls after native confirmation,
or navigate to actual same-origin HTTP(S) anchor targets. They accept no arguments,
read no field values, skip duplicate names, and unregister on mutation/pagehide.
Native forms keep their real submit handler, transport, validation and human
submission; success belongs to that handler. Tool invocation is not authorization.
