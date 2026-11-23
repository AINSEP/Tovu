## Wiring

`mail-adapter-registry.ts` binds the host's default credential label and the bundled-plugin source
walk into `@jini-ai/agent-plugins/lifecycle/mail`. It forwards nothing: callers take the
`MailAdapterRegistry` type from `@jini-ai/agent-plugins/lifecycle/mail`.
