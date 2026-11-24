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
- `deploy-config.ts` binds `@jini-ai/devops/deploy/site/deploy-config` (descriptor derivation, generator kit,
  deploy-notes overlay): it injects the `tovu deploy config` command label, `REQUIRED_SECRETS`, the readiness
  route source (`server/inbound/public-http/routes/ops/health.ts`), `MIGRATIONS_NOTE`, `ValidationError`, the
  overlay root `content/agent-plugin-overlays` and `process.cwd()` as the repo root. `HOST_DEPLOY_ENV` stays here.
- `deploy-config-registry.ts` binds `createDeployConfigGeneratorSource` (`@jini-ai/devops/deploy/site/deploy-config-registry`)
  to `DEPLOY_CONFIGS_FILENAME`, `../agent-plugins/bundled-contribution-sources.ts`, the agent-plugins
  contribution seam (`../agent-plugins/lifecycle.ts`) and `console.warn` for installed-loader refusals.
  The bound source is the ONE export `deployConfigGenerators`; callers use its members
  (`deployConfigGenerators.readBundledDeployConfigCandidatePaths(...)` etc.) rather than per-member aliases.
  `parseDeployConfigsFile` is imported from `@jini-ai/devops/deploy` directly.
- The provider-neutral deployment port types live in `@jini-ai/devops/deploy/site/ports`, generic over the
  HTTP client type; a Tovu consumer pins `#src/platform/http/index`'s `HttpClientPort` as the type argument.
