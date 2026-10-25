#!/bin/bash
S=apps/website/src/server; B=$S/runtime/boot; BT=$B/__tests__; A=$S/inbound/admin-http; T=$S/__tests__
r(){ /root/stryker/run.sh "$@"; }
until grep -q QUEUE4DONE /root/stryker/reports/summary.txt; do sleep 10; done
r dev-auth-pass2 "$A/dev-auth.ts:118-125,$A/dev-auth.ts:223-226,$A/dev-auth.ts:361-370,$A/dev-auth.ts:434-436,$A/dev-auth.ts:520-533,$A/dev-auth.ts:592-605,$A/dev-auth.ts:632-675,$A/dev-auth.ts:732-755" $T/admin-boot-session-route.test.ts,$T/admin-password-status-route.test.ts,$T/identity-routes.test.ts,$A/__tests__/dev-auth.unit.test.ts,$A/__tests__/dev-auth-boot-owner.unit.test.ts
r production-readiness-gate $B/production-readiness-gate.ts $T/unit/production-readiness-gate.unit.test.ts
for f in local-owner-signin bind-host boot-readiness-gate site-listener-origin boot-listener dev-tls parent-watchdog site-key-boot-notice mail-delivery-policy; do
  r b-$f $B/$f.ts $BT/$f.unit.test.ts
done
r request-cookie $S/http/request-cookie.ts $S/http/__tests__/request-cookie.unit.test.ts
r error-respond $S/error-mapping/respond.ts $S/error-mapping/__tests__/respond.test.ts
echo QUEUE5DONE >> /root/stryker/reports/summary.txt
