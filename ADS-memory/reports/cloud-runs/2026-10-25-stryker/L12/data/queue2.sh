#!/bin/bash
S=apps/website/src/server
A=$S/inbound/admin-http; PM=$S/inbound/public-http/middleware; PH=$S/inbound/public-http; T=$S/__tests__/routes
r(){ /root/stryker/run.sh "$@"; }
M=$PH/routes/members
MT=$T/member-password-auth.test.ts,$T/member-oidc-auth.test.ts,$T/members-public-complete-sign-in.test.ts,$T/members-public-sign-in.test.ts,$T/members-auth.test.ts
r members-pw $M/password-sign-in.ts,$M/reset-password.ts,$M/forgot-password.ts,$M/set-password.ts,$M/sign-out.ts,$M/sign-in.ts,$M/me.ts $MT
r members-oidc $M/oidc-callback.ts,$M/oidc-start.ts,$M/oidc-verify-email.ts,$M/unlink-identity.ts,$M/complete-sign-in.ts,$M/oidc-deps.ts,$M/deps.ts $MT
r handshake $PH/routes/publish-trust/handshake.ts $PH/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts,$T/publish-trust-gate.test.ts
r site-consent $PM/site-consent.ts $PM/__tests__/site-consent-policy.unit.test.ts,$PM/__tests__/site-consent-metadata.unit.test.ts
r site-key $A/routes/system/site-key.ts $A/routes/system/__tests__/site-key-sources.unit.test.ts,$A/routes/system/__tests__/site-key-state.unit.test.ts,$A/routes/system/__tests__/site-key.tw4.pins.test.ts
r publish-credentials $A/routes/system/publish-credentials.ts $A/routes/system/__tests__/publish-credentials.tw4.pins.test.ts
r source-control-credentials $A/routes/system/source-control-credentials.ts $A/routes/system/__tests__/source-control-credentials.unit.test.ts
r dev-auth-pass2 "$A/dev-auth.ts:118-125,$A/dev-auth.ts:223-226,$A/dev-auth.ts:361-370,$A/dev-auth.ts:434-436,$A/dev-auth.ts:520-533,$A/dev-auth.ts:592-605,$A/dev-auth.ts:632-675,$A/dev-auth.ts:732-755" $S/__tests__/admin-local-boot-session-route.test.ts,$S/__tests__/admin-boot-session-route.test.ts,$S/__tests__/admin-password-status-route.test.ts,$S/__tests__/identity-routes.test.ts,$A/__tests__/dev-auth.unit.test.ts,$A/__tests__/dev-auth-boot-owner.unit.test.ts
echo QUEUE2DONE >> /root/stryker/reports/summary.txt
