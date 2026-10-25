#!/bin/bash
S=apps/website/src/server; A=$S/inbound/admin-http; T=$S/__tests__; SY=$A/routes/system; PH=$S/inbound/public-http/routes
r(){ /root/stryker/run.sh "$@"; }
until grep -q QUEUE6DONE /root/stryker/reports/summary.txt; do sleep 10; done
r dev-auth-pass3 "$A/dev-auth.ts:118-125,$A/dev-auth.ts:223-226,$A/dev-auth.ts:361-370,$A/dev-auth.ts:434-436,$A/dev-auth.ts:520-533,$A/dev-auth.ts:592-605,$A/dev-auth.ts:632-675,$A/dev-auth.ts:732-755" $T/admin-boot-session-route.test.ts,$T/admin-password-status-route.test.ts,$A/__tests__/dev-auth.unit.test.ts,$A/__tests__/dev-auth-boot-owner.unit.test.ts
r api-conn-oauth-callback $PH/api-connections/oauth-callback.ts $PH/api-connections/__tests__/oauth-callback.unit.test.ts
r site-share $PH/site-share.ts $PH/__tests__/site-share.unit.test.ts
r site-shares-admin $SY/site-shares.ts $SY/__tests__/site-shares.integration.test.ts
r settings-shared $A/routes/settings/shared.ts $A/routes/settings/__tests__/shared.unit.test.ts
r publish-site $SY/publish-site.ts $SY/__tests__/publish-site.tw4.pins.test.ts,$SY/__tests__/publish-site-listing.unit.test.ts
r sites $SY/sites.ts $SY/__tests__/sites.tw4.pins.test.ts
echo QUEUE7DONE >> /root/stryker/reports/summary.txt
