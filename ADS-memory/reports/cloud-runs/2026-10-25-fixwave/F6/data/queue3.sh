#!/bin/bash
until grep -q QUEUE2_DONE /root/stryker/reports/summary.txt; do sleep 15; done
/tmp/claude-0/-home-user/d1a17135-d985-5020-a283-878dcb27aace/scratchpad/sr.sh api-key-secret-2 "apps/website/src/features/identity/api-key-secret.ts" "apps/website/src/features/identity/__tests__/api-key-secret.test.ts,apps/website/src/features/identity/__tests__/api-key-secret.no-derivation.test.ts"
echo QUEUE3_DONE >> /root/stryker/reports/summary.txt
