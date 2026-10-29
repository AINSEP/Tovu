#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
R=/home/user/Tovu/ADS-memory/reports/cloud-runs/2026-10-29-verify/raw
mkdir -p $R/jini-vitest
cd /home/user/Jini/packages
for p in admin agent-plugins agent-runtime agentic analytics capability-providers chat cli cms commerce cookie-consent core daemon db desktop-host devops diagnostics http-kit infra integrations mcp memory oauth platform plugins protocol provider-plugins registry sandbox search server sidecar sqlite ui-kit ui user-management vibecoding artifacts; do
  [ -d $p ] || continue
  cd $p
  s=$(date +%s)
  timeout 1200 npx vitest run --maxWorkers=2 --minWorkers=1 --coverage --coverage.reportOnFailure=true --coverage.reporter=json-summary --coverage.reporter=text-summary --coverage.reportsDirectory=coverage > $R/jini-vitest/$p.txt 2>&1
  ec=$?
  [ -f coverage/coverage-summary.json ] && cp coverage/coverage-summary.json $R/jini-vitest/$p.coverage-summary.json
  echo "$p exit=$ec secs=$(( $(date +%s)-s ))" >> $R/jini-vitest/_exit-codes.txt
  cd ..
done
echo ALLDONE >> $R/jini-vitest/_exit-codes.txt
