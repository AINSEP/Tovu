## Wiring

- `credential-copy-tool.ts` binds the host (`TOVU_CREDENTIAL_COPY_HOST`, card identity, tool metadata) into
  `createCredentialCopyRegistrations` from `@jini-ai/integrations/credentialed-http/tools` and re-exports nothing:
  callers import `createCredentialCopyRegistrations` and `CredentialCopyRequired` from that owner subpath.
- `plugin-credential-card.ts` binds the validation error and the credential-free field check into
  `createPluginCredentialCardOperations` (`@jini-ai/agent-plugins/connect`). It still re-exports
  `LoadPluginCredentialCards` and `loadPluginCredentialCardsSafely` only because the mail-status provider tool
  registration (a different lane) imports them from here; every other caller takes them, and
  `findPluginCredentialCard`, from `@jini-ai/agent-plugins/connect` directly.
