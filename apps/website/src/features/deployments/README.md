# deployments (host)

Tovu's export, publish and plugin deploy paths over `@jini-ai/devops/deploy`.

## Wiring

- In-memory vendor credential fixtures come from `features/vendor-credentials/repo.memory.ts` directly
  (the `publish-credentials/repo.memory.ts` forwarder is gone).
- `deploy-ops/secrets.ts` binds `bindDeployOpsRuntime` (`deploy-ops/run-ops.ts`) into
  `@jini-ai/devops/deploy`'s `runListSecrets`/`runSetSecret`/`runUnsetSecret`; secret types come from
  `@jini-ai/devops/deploy` and `secretFingerprint` from `run-ops.ts` directly.
- `deploy-ops/run-ops.ts` binds `classifyError` by passing the platform `EgressRefusedError` to
  `@jini-ai/integrations/custom-credentials/credential-ports`' `classifyCredentialedRequestError`.
- `deploy-ops/typed-secret-card.ts` injects Tovu card copy (`@tovu/contracts/credential-copy`), the
  `tovu` URI host and the operator locale into the Jini secret-card collector.
