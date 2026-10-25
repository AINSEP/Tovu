#!/bin/bash
S=apps/website/src/server; A=$S/inbound/admin-http/routes; U=$A/users; UT=$U/__tests__
r(){ /root/stryker/run.sh "$@"; }
until grep -q QUEUE2DONE /root/stryker/reports/summary.txt; do sleep 10; done
r u-remove-policy-permission $U/remove-policy-permission.ts $UT/remove-policy-permission.test.ts,$UT/remove-policy-permission-errors.test.ts,$S/__tests__/identity-policy-permission-removal.test.ts
for f in assign-role attach-policy create delete disable enable reset-password update create-role delete-role update-role create-policy delete-policy update-policy; do
  r u-$f $U/$f.ts $UT/$f.test.ts,$UT/owner-protection.test.ts,$UT/account-protections.test.ts
done
r api-keys $A/api-keys/issue.ts,$A/api-keys/revoke.ts,$A/api-keys/create-principal.ts,$A/api-keys/deps.ts $S/__tests__/api-key-routes.test.ts,$A/api-keys/__tests__/deps.test.ts,$A/api-keys/__tests__/handler-failures.test.ts
r ext-mcp-guard $A/external-mcp/guard.ts $A/external-mcp/__tests__/external-mcp-route-failures.unit.test.ts,$S/__tests__/admin-external-mcp-routes.test.ts
echo QUEUE3DONE >> /root/stryker/reports/summary.txt
