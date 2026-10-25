#!/bin/bash
until grep -q QUEUE3_DONE /root/stryker/reports/summary.txt; do sleep 15; done
/tmp/claude-0/-home-user/d1a17135-d985-5020-a283-878dcb27aace/scratchpad/sr.sh form-delivery-2 "apps/website/src/features/settings/form-delivery.ts" "apps/website/src/features/settings/__tests__/form-delivery.security.test.ts,apps/website/src/features/settings/__tests__/form-delivery.unit.test.ts"
/tmp/claude-0/-home-user/d1a17135-d985-5020-a283-878dcb27aace/scratchpad/sr.sh complete-sign-in-2 "apps/website/src/server/inbound/public-http/routes/members/complete-sign-in.ts,apps/website/src/server/inbound/public-http/routes/members/oidc-verify-email.ts" "apps/website/src/server/inbound/public-http/routes/members/__tests__/member-proof-bodies.unit.test.ts,apps/website/src/server/__tests__/routes/member-password-auth.test.ts,apps/website/src/server/__tests__/routes/member-oidc-auth.test.ts"
echo QUEUE4_DONE >> /root/stryker/reports/summary.txt
