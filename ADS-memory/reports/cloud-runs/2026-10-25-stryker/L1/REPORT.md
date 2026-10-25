# L1 REPORT (INTERIM — platform priority tier done; oauth/user-management/platform-rest running)

Jini @ 3e2fbae8. Platform needed an untracked vitest.stryker.config.ts excluding 2 pre-existing failing tests (src/secrets/__tests__/exports.test.ts: expects @jini-ai/core ^0.6.11 but package has ^0.6.12; src/web/__tests__/optional-peers.test.ts) — Stryker aborts on a red initial run. Those 2 tests are stale = suspected test-drift, not mutated source.

## Platform tier 1 (secrets, mail, http, fetch-with-timeout, aws-sigv4, sandbox-env, child-environment, net): 3770 run (671 StringLiteral ignored), 3491 killed, 10 timeout, 269 survived, 0 no-coverage = 92.9% (killed+timeout / run). Wall 13m38s at concurrency 3.

| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/aws-sigv4.ts | 30 | 22 | 8 | 0 | 0 | 73.3 |
| src/http.ts | 17 | 12 | 4 | 0 | 1 | 76.5 |
| src/mail/smtp.ts | 104 | 88 | 16 | 0 | 0 | 84.6 |
| src/mail/feedback.ts | 133 | 116 | 17 | 0 | 0 | 87.2 |
| src/mail/provider-error.ts | 24 | 21 | 3 | 0 | 0 | 87.5 |
| src/secrets/credential-token.ts | 81 | 71 | 10 | 0 | 0 | 87.7 |
| src/net/address.ts | 41 | 36 | 5 | 0 | 0 | 87.8 |
| src/mail/resolve-mailer.ts | 393 | 343 | 46 | 0 | 4 | 88.3 |
| src/sandbox-env.ts | 94 | 79 | 11 | 0 | 4 | 88.3 |
| src/mail/mail-status-cache.ts | 35 | 31 | 4 | 0 | 0 | 88.6 |
| src/mail/builtin-providers.ts | 54 | 48 | 6 | 0 | 0 | 88.9 |
| src/net/endpoint-policy.ts | 283 | 256 | 27 | 0 | 0 | 90.5 |
| src/secrets/credential-sets/provider-matches.ts | 130 | 118 | 12 | 0 | 0 | 90.8 |
| src/http/guarded/node-ports.ts | 11 | 10 | 1 | 0 | 0 | 90.9 |
| src/secrets/passphrase-envelope.ts | 133 | 121 | 12 | 0 | 0 | 91.0 |
| src/http/guarded/fetch-adapter.ts | 45 | 41 | 4 | 0 | 0 | 91.1 |
| src/secrets/credential-sets/vault.repo.memory.ts | 205 | 188 | 17 | 0 | 0 | 91.7 |
| src/http/guarded/transport.fetch.ts | 69 | 65 | 4 | 0 | 0 | 94.2 |
| src/mail/domain-read.ts | 18 | 17 | 1 | 0 | 0 | 94.4 |
| src/child-environment.ts | 103 | 98 | 5 | 0 | 0 | 95.1 |
| src/mail/provider.ts | 106 | 101 | 5 | 0 | 0 | 95.3 |
| src/secrets/credential-sets/vault.meta.ts | 163 | 156 | 7 | 0 | 0 | 95.7 |
| src/http/guarded/client.ts | 262 | 252 | 10 | 0 | 0 | 96.2 |
| src/secrets/credential-sets/vault.service.ts | 498 | 479 | 19 | 0 | 0 | 96.2 |
| src/mail/delivery-wrapper.ts | 90 | 87 | 3 | 0 | 0 | 96.7 |
| src/secrets/keyring.env.ts | 194 | 188 | 6 | 0 | 0 | 96.9 |
| src/mail/sender-domain-verification.ts | 67 | 65 | 2 | 0 | 0 | 97.0 |
| src/mail/rate-limit.ts | 46 | 44 | 1 | 0 | 1 | 97.8 |
| src/mail/policy.ts | 162 | 159 | 3 | 0 | 0 | 98.1 |
| src/fetch-with-timeout.ts | 12 | 12 | 0 | 0 | 0 | 100.0 |
| src/http/guarded/errors.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/mail/delivery-availability.ts | 4 | 4 | 0 | 0 | 0 | 100.0 |
| src/mail/purpose-scoped-mailer.ts | 43 | 43 | 0 | 0 | 0 | 100.0 |
| src/mail/sender-identity.ts | 22 | 22 | 0 | 0 | 0 | 100.0 |
| src/secrets/aad.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/secrets/credential-sets/vault.aad.ts | 4 | 4 | 0 | 0 | 0 | 100.0 |
| src/secrets/credential-sets/vault.types.ts | 54 | 54 | 0 | 0 | 0 | 100.0 |
| src/secrets/keyring.memory.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/secrets/secret-sealer.aesgcm.ts | 34 | 34 | 0 | 0 | 0 | 100.0 |
{"Ignored":671,"Killed":3491,"Survived":269,"Timeout":10}
