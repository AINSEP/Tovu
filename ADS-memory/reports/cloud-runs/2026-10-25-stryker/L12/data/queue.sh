#!/bin/bash
S=apps/website/src/server
A=$S/inbound/admin-http; PM=$S/inbound/public-http/middleware; R=$S/runtime
r(){ /root/stryker/run.sh "$@"; }
r dev-auth $A/dev-auth.ts $A/__tests__/dev-auth.unit.test.ts,$A/__tests__/dev-auth-boot-owner.unit.test.ts
r publish-trust-auth $A/publish-trust-auth.ts $A/__tests__/publish-trust-keyless.unit.test.ts,$S/__tests__/routes/publish-trust-gate.test.ts
r canonical-site-host $PM/canonical-site-host.ts $PM/__tests__/canonical-site-host.test.ts
r site-serving-gate $PM/site-serving-gate.ts $PM/__tests__/site-serving-gate.test.ts
r public-page-security-headers $PM/public-page-security-headers.ts $PM/__tests__/public-page-security-headers.test.ts
r site-consent $PM/site-consent.ts $PM/__tests__/site-consent.test.ts,$PM/__tests__/site-consent-policy.unit.test.ts,$PM/__tests__/site-consent-metadata.unit.test.ts
r write-policy-permission $A/routes/users/write-policy-permission.ts $A/routes/users/__tests__/write-policy-permission.test.ts
r remove-policy-permission $A/routes/users/remove-policy-permission.ts $S/__tests__/identity-policy-permission-removal.test.ts
r app-permission-grants $R/composition/app-permission-grants.ts $R/composition/__tests__/permission-grants.test.ts
r process-error-guards $R/boot/process-error-guards.ts $R/boot/__tests__/process-error-guards.unit.test.ts
r content-db-schema-guard $R/boot/content-db-schema-guard.ts $R/boot/__tests__/content-db-schema-guard.unit.test.ts
r oauth-public-origin $S/inbound/public-http/routes/oauth/public-origin.ts $S/inbound/public-http/routes/oauth/__tests__/public-origin.test.ts
r oauth-callback-page $S/inbound/public-http/routes/oauth/callback-page.ts $S/inbound/public-http/routes/oauth/__tests__/callback-page.test.ts
r external-mcp-oauth-callback $S/inbound/public-http/routes/external-mcp/oauth-callback.ts $S/inbound/public-http/routes/external-mcp/__tests__/oauth-callback.test.ts
echo QUEUE1DONE >> /root/stryker/reports/summary.txt
