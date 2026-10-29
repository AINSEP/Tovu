#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
R=/home/user/Tovu/ADS-memory/reports/cloud-runs/2026-10-29-verify/raw
mkdir -p $R/jini-vitest-rerun-after-ui-assets-b
for p in admin chat ui; do
 cd /home/user/Jini/packages/$p
 timeout 1500 npx vitest run --maxWorkers=2 --minWorkers=1 > $R/jini-vitest-rerun-after-ui-assets-b/$p.txt 2>&1
 echo "$p exit=$?" >> $R/jini-vitest-rerun-after-ui-assets-b/_exit-codes.txt
done
echo ALLDONE >> $R/jini-vitest-rerun-after-ui-assets-b/_exit-codes.txt
