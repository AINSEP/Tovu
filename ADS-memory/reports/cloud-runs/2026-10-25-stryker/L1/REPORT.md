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

## oauth: 2442 mutants (507 StringLiteral ignored), 1935 run: 1752 killed, 9 timeout, 174 survived = 91.0%. 9m46s.
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/oidc.ts | 108 | 75 | 33 | 0 | 0 | 69.4 |
| src/registration-cache.ts | 45 | 35 | 10 | 0 | 0 | 77.8 |
| src/dns-pinned-transport.ts | 15 | 12 | 3 | 0 | 0 | 80.0 |
| src/revocation.ts | 17 | 14 | 3 | 0 | 0 | 82.4 |
| src/errors.ts | 54 | 45 | 9 | 0 | 0 | 83.3 |
| src/token-endpoint.ts | 111 | 96 | 15 | 0 | 0 | 86.5 |
| src/device-code.ts | 85 | 75 | 10 | 0 | 0 | 88.2 |
| src/refresh.ts | 123 | 105 | 13 | 0 | 5 | 89.4 |
| src/authorization-code.ts | 148 | 134 | 14 | 0 | 0 | 90.5 |
| src/endpoint-safety.ts | 98 | 90 | 8 | 0 | 0 | 91.8 |
| src/loopback-receiver.ts | 125 | 115 | 10 | 0 | 0 | 92.0 |
| src/registration.ts | 99 | 92 | 7 | 0 | 0 | 92.9 |
| src/discovery.ts | 191 | 178 | 13 | 0 | 0 | 93.2 |
| src/sealed-state.ts | 129 | 121 | 8 | 0 | 0 | 93.8 |
| src/resource.ts | 17 | 16 | 1 | 0 | 0 | 94.1 |
| src/pending-authorizations.ts | 109 | 100 | 6 | 0 | 3 | 94.5 |
| src/discovery-policy.ts | 43 | 41 | 2 | 0 | 0 | 95.3 |
| src/guarded-transport.ts | 52 | 50 | 2 | 0 | 0 | 96.2 |
| src/options.ts | 27 | 26 | 1 | 0 | 0 | 96.3 |
| src/pkce.ts | 27 | 26 | 1 | 0 | 0 | 96.3 |
| src/registry.ts | 65 | 63 | 2 | 0 | 0 | 96.9 |
| src/file-registration-cache.ts | 81 | 79 | 2 | 0 | 0 | 97.5 |
| src/loopback-callback.ts | 87 | 86 | 1 | 0 | 0 | 98.9 |
| src/bounded-json.ts | 40 | 39 | 0 | 0 | 1 | 100.0 |
| src/messages.ts | 2 | 2 | 0 | 0 | 0 | 100.0 |
| src/node-file-cache.ts | 18 | 18 | 0 | 0 | 0 | 100.0 |
| src/redact.ts | 1 | 1 | 0 | 0 | 0 | 100.0 |
| src/testing/registration-cache.ts | 6 | 6 | 0 | 0 | 0 | 100.0 |
| src/testing/token-store.ts | 12 | 12 | 0 | 0 | 0 | 100.0 |
{"Ignored":507,"Killed":1752,"Survived":174,"Timeout":9}

## user-management: 6802 mutants (1386 ignored), 5416 run: 4941 killed, 1 timeout, 472 survived, 1 no-coverage, 1 runtime-error = 91.2%. ~50 min.
| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/admin/react/index.ts | 24 | 16 | 8 | 0 | 0 | 66.7 |
| src/admin/react/hooks/UsersPage.hooks.ts | 38 | 28 | 10 | 0 | 0 | 73.7 |
| src/admin/react/hooks/PermissionPanel.hooks.ts | 37 | 28 | 9 | 0 | 0 | 75.7 |
| src/admin/conformance/index.ts | 349 | 265 | 84 | 0 | 0 | 75.9 |
| src/admin/members.module.ts | 9 | 7 | 2 | 0 | 0 | 77.8 |
| src/admin/react/hooks/AuthBinding.hooks.ts | 18 | 14 | 4 | 0 | 0 | 77.8 |
| src/core/permissions.ts | 14 | 11 | 3 | 0 | 0 | 78.6 |
| src/admin/react/hooks/LoginPage.hooks.ts | 38 | 30 | 8 | 0 | 0 | 78.9 |
| src/admin/roles.module.ts | 10 | 8 | 2 | 0 | 0 | 80.0 |
| src/admin/users.module.ts | 10 | 8 | 2 | 0 | 0 | 80.0 |
| src/react/members/hooks/use-members.hooks.ts | 114 | 93 | 20 | 1 | 0 | 81.6 |
| src/admin/react/hooks/RolesTab.hooks.ts | 46 | 38 | 8 | 0 | 0 | 82.6 |
| src/admin/react/hooks/PeopleController.hooks.ts | 24 | 20 | 4 | 0 | 0 | 83.3 |
| src/server/repo.memory.ts | 192 | 161 | 31 | 0 | 0 | 83.9 |
| src/admin/react/hooks/RolesController.hooks.ts | 26 | 22 | 4 | 0 | 0 | 84.6 |
| src/admin/react/hooks/MembersPage.hooks.ts | 61 | 52 | 9 | 0 | 0 | 85.2 |
| src/admin/controllers/members.controller.ts | 193 | 165 | 28 | 0 | 0 | 85.5 |
| src/admin/auth.module.ts | 8 | 7 | 1 | 0 | 0 | 87.5 |
| src/server/hasher.ts | 16 | 14 | 2 | 0 | 0 | 87.5 |
| src/react/users/hooks/use-reset-password-fields.hooks.ts | 18 | 16 | 2 | 0 | 0 | 88.9 |
| src/admin/react/hooks/PoliciesTab.hooks.ts | 64 | 57 | 7 | 0 | 0 | 89.1 |
| src/server/agent-tools.ts | 85 | 76 | 9 | 0 | 0 | 89.4 |
| src/react/users/rules.ts | 124 | 111 | 13 | 0 | 0 | 89.5 |
| src/react/users/hooks/use-users.hooks.ts | 325 | 292 | 33 | 0 | 0 | 89.8 |
| src/admin/controllers/roles.controller.ts | 404 | 363 | 41 | 0 | 0 | 89.9 |
| src/admin/controllers/controller-store.ts | 21 | 19 | 2 | 0 | 0 | 90.5 |
| src/react/testing.ts | 260 | 237 | 23 | 0 | 0 | 91.2 |
| src/core/types.ts | 12 | 11 | 1 | 0 | 0 | 91.7 |
| src/server/repo.memory-transactions.ts | 42 | 39 | 3 | 0 | 0 | 92.9 |
| src/admin/error-copy.ts | 16 | 15 | 1 | 0 | 0 | 93.8 |
| src/admin/controllers/users.controller.ts | 345 | 324 | 21 | 0 | 0 | 93.9 |
| src/server/grant-service.ts | 186 | 175 | 11 | 0 | 0 | 94.1 |
| src/admin/adapters/http.ts | 105 | 99 | 6 | 0 | 0 | 94.3 |
| src/server/admin-crud-service.ts | 352 | 332 | 20 | 0 | 0 | 94.3 |
| src/admin/react/hooks/MembersBinding.hooks.ts | 18 | 17 | 1 | 0 | 0 | 94.4 |
| src/admin/react/hooks/UsersBinding.hooks.ts | 18 | 17 | 1 | 0 | 0 | 94.4 |
| src/admin/react/hooks/RolesBinding.hooks.ts | 19 | 18 | 1 | 0 | 0 | 94.7 |
| src/react/users/hooks/use-change-username.hooks.ts | 42 | 40 | 2 | 0 | 0 | 95.2 |
| src/server/authorize.ts | 92 | 88 | 4 | 0 | 0 | 95.7 |
| src/admin/adapters/memory.ts | 433 | 416 | 16 | 0 | 1 | 96.3 |
| src/react/errors.ts | 27 | 26 | 1 | 0 | 0 | 96.3 |
| src/server/seed.ts | 139 | 134 | 5 | 0 | 0 | 96.4 |
| src/admin/rules.ts | 39 | 38 | 1 | 0 | 0 | 97.4 |
| src/server/auth-challenge.ts | 79 | 77 | 2 | 0 | 0 | 97.5 |
