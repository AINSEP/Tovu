#!/bin/bash
S=apps/website/src/server; M=$S/inbound/public-http/routes/members; T=$S/__tests__/routes
r(){ /root/stryker/run.sh "$@"; }
until grep -q QUEUE3DONE /root/stryker/reports/summary.txt; do sleep 10; done
for f in oidc-callback oidc-start oidc-verify-email unlink-identity complete-sign-in; do
 r m-$f $M/$f.ts $T/member-oidc-auth.test.ts,$T/members-public-complete-sign-in.test.ts
done
echo QUEUE4DONE >> /root/stryker/reports/summary.txt
