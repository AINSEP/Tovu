Programmer(Execution): Selected Programmer for the behavior-preserving mail-engine cutover.

Implemented Jini bindings while retaining Tovu’s public mail surface, settings/vault/catalog wiring, sign-in resend policy, and plugin HTTP ABI.

Changed under `apps/website/src/`:

- `server/runtime/boot/{resolve-mailer,mail-delivery-policy,mail-domain-read,mail-status-cache,sender-domain-verification}.ts`
- `platform/mail/{adapter-module,mail-status,ports,provider-error,purpose-gate-probe,sender-domain-verification}.ts`
- New `server/runtime/boot/__tests__/mail-engine-adoption.unit.test.ts`
- Three-line ownership note in `SURVEY.md`

Freeze diff against `c0e4943c5` was empty. Parity goldens remain unchanged. Strict cyclomatic/cognitive complexity ≤10 and diff checks passed.

No tests, installs, dependency changes, Jini edits, or commits performed. Post-edit typechecks reported only concurrent out-of-scope chat/composition errors; runtime parity remains unverified. Details: [handoff](/Users/la/Programming/tovu-integration-clones/tovu-signin/ADS-memory/.local-artifacts/mail-engine-shard8/progress-ledger.md).

Exact central test commands:

```bash
node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 \
  apps/website/src/server/runtime/boot/__tests__/{mail-engine-adoption,mail-engine-parity,resolve-mailer,resolve-mailer-lifecycle,mail-delivery-policy,mail-status-cache,mail-plugin-account-token}.unit.test.ts \
  apps/website/src/server/runtime/boot/__tests__/sender-domain-verification.test.ts \
  apps/website/src/server/runtime/composition/__tests__/site-mailer.unit.test.ts \
  "apps/website/src/platform/mail/__tests__/**/*.test.ts" \
  "apps/website/src/features/mail-status/**/*.test.ts" \
  "apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts" \
  "apps/website/src/features/members/**/*.test.ts" \
  "apps/website/src/server/__tests__/routes/member*.test.ts" \
  "apps/website/src/server/__tests__/routes/members-public*.test.ts" \
  "apps/website/src/server/inbound/admin-http/routes/settings/__tests__/mail-cache-invalidation.unit.test.ts" \
  "content/agent-plugins/resend/__tests__/*.test.mjs"
```

```bash
pnpm --dir /Users/la/Programming/tovu-integration-clones/jini-int2 \
  --filter @jini-ai/platform exec vitest run \
  --maxWorkers=2 --minWorkers=1 src/mail
```

Published-package adoption/typecheck remains pending the owner’s release.
