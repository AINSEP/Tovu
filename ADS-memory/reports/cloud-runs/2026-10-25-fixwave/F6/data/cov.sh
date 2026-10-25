#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
cd ${ROOT:-/home/user/Tovu}
shopt -s nullglob
W=apps/website/src; F=$W/features; SV=$W/server
SRC=(
 $F/database-transfer/destination-store.ts $F/database-transfer/exclusions.ts
 $F/identity/permission-list-tool.ts $F/identity/user-manage-permission.ts $F/identity/boot-session-token.ts
 $F/member-login/link-service.ts $F/member-login/link-policy.ts $F/member-login/ready-providers.ts $F/member-login/oidc-login.ts $F/member-login/providers.ts
 $F/members/password-auth.ts $F/members/write-service.ts
 $F/settings/form-delivery.ts $F/settings/publish-content.ts $F/settings/tool-registrations.ts
 $F/mail/attempts.repo.ts
 $SV/inbound/admin-http/publish-trust-auth.ts
 $SV/inbound/public-http/routes/members/me.ts $SV/inbound/public-http/routes/members/unlink-identity.ts
 $SV/inbound/public-http/routes/members/oidc-verify-email.ts $SV/inbound/public-http/routes/members/complete-sign-in.ts
 $SV/inbound/public-http/routes/members/oidc-callback.ts
 $SV/runtime/boot/site-listener-origin.ts $SV/inbound/admin-http/routes/system/site-key.ts
 $SV/inbound/public-http/middleware/canonical-site-host.ts
 $SV/inbound/admin-http/routes/api-keys/issue.ts $SV/inbound/admin-http/routes/api-keys/create-principal.ts
 $SV/inbound/public-http/routes/api-connections/oauth-callback.ts
 $F/identity/api-key-secret.ts $SV/inbound/admin-http/routes/system/site-shares.ts $F/members/agent-tools.ts $F/settings/visitor-tools-agent-tools.ts
)
TESTS=(
 $F/database-transfer/__tests__/destination-store.*.test.ts $F/database-transfer/__tests__/exclusions.unit.test.ts $F/database-transfer/__tests__/table-catalog.unit.test.ts
 $F/identity/__tests__/permission-list-tool.test.ts $F/identity/__tests__/user-manage-permission.test.ts $F/identity/__tests__/boot-session-token.test.ts
 $F/member-login/__tests__/*.test.ts
 $F/members/__tests__/password-auth.test.ts $F/members/__tests__/write-service*.test.ts $F/members/__tests__/password-lifecycle.dialects.test.ts
 $F/settings/__tests__/form-delivery*.test.ts $F/settings/__tests__/publish-content.round-trip.test.ts $F/settings/__tests__/settings-write-tools.test.ts
 $F/mail/__tests__/attempts-retention.dialects.test.ts
 $SV/__tests__/routes/publish-trust-*.test.ts
 $SV/__tests__/routes/member-password-auth.test.ts $SV/__tests__/routes/member-oidc-auth.test.ts
 $SV/inbound/public-http/routes/members/__tests__/*.test.ts
 $SV/runtime/boot/__tests__/site-listener-origin.unit.test.ts
 $SV/inbound/admin-http/routes/system/__tests__/site-key*.test.ts $SV/__tests__/admin-site-key-routes*.test.ts
 $SV/inbound/public-http/middleware/__tests__/canonical-site-host.test.ts
 $SV/inbound/admin-http/routes/api-keys/__tests__/*.test.ts
 $SV/inbound/public-http/routes/api-connections/__tests__/oauth-callback.unit.test.ts
 $F/identity/__tests__/api-key-secret*.test.ts $SV/inbound/admin-http/routes/system/__tests__/site-shares-job-id.unit.test.ts $F/members/__tests__/agent-tools.contract.test.ts $F/settings/__tests__/visitor-tools-agent-tools.contract.unit.test.ts
)
EX=(); for t in "${TESTS[@]}"; do [ -f "$t" ] && EX+=("$t"); done
INC=(); for s in "${SRC[@]}"; do INC+=(--test-coverage-include="$s"); done
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json timeout 1500 node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks --experimental-test-coverage "${INC[@]}" --test-reporter=lcov --test-reporter-destination=/tmp/f6-$1.lcov --test-reporter=spec --test-reporter-destination=/tmp/f6-cov-$1.log "${EX[@]}"
echo "exit $?"
