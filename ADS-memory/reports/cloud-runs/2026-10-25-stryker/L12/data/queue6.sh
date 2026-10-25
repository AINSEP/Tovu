#!/bin/bash
S=apps/website/src/server; A=$S/inbound/admin-http; T=$S/__tests__; SY=$A/routes/system
r(){ /root/stryker/run.sh "$@"; }
until grep -q QUEUE5DONE /root/stryker/reports/summary.txt; do sleep 10; done
PT=$T/routes/publish-trust-shared-permission.test.ts,$T/routes/publish-trust-content-authorize.test.ts,$T/routes/publish-trust-apply-coverage.test.ts,$T/routes/publish-trust-revocation-gate.test.ts,$T/routes/publish-trust-gate.test.ts,$A/__tests__/publish-trust-keyless.unit.test.ts
r publish-trust-auth-pass2 "$A/publish-trust-auth.ts:190-245,$A/publish-trust-auth.ts:345-355,$A/publish-trust-auth.ts:395-430" $PT
r publish-credentials-pass2 $SY/publish-credentials.ts $T/routes/publish-credentials-route.test.ts,$SY/__tests__/publish-credentials.tw4.pins.test.ts,$T/route-async-guards.test.ts
r site-key-pass2 "$SY/site-key.ts:200-320,$SY/site-key.ts:430-470" $T/admin-site-key-routes.test.ts,$T/routes/deployment-overview-site-key.test.ts,$T/route-async-guards.test.ts,$SY/__tests__/site-key.tw4.pins.test.ts,$SY/__tests__/site-key-state.unit.test.ts
r source-control-credentials-pass2 $SY/source-control-credentials.ts $T/routes/source-control-credentials-route.test.ts,$SY/__tests__/source-control-credentials.unit.test.ts
echo QUEUE6DONE >> /root/stryker/reports/summary.txt
