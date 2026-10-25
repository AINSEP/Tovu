#!/bin/bash
until grep -q QUEUE4_DONE /root/stryker/reports/summary.txt; do sleep 15; done
/tmp/claude-0/-home-user/d1a17135-d985-5020-a283-878dcb27aace/scratchpad/sr.sh settings-tool-registrations-2 "apps/website/src/features/settings/tool-registrations.ts" "apps/website/src/features/settings/__tests__/settings-write-tools.test.ts"
echo QUEUE5_DONE >> /root/stryker/reports/summary.txt
