#!/bin/bash
cd /root/stryker/l15
for n in $(cat order.txt); do
  [ $(date +%s) -gt $(date -d '2026-10-25 23:40' +%s) ] && { echo "TIME STOP before $n" >> batch.log; break; }
  echo "$(date -u +%T) START $n" >> batch.log
  ./run-file.sh src/$n.ts $n 1500 > run-$n.out 2>&1
  echo "$(date -u +%T) END $n $(grep -m1 -E 'Mutation score|All files' $n.log | head -c 200)" >> batch.log
done
echo BATCH-DONE >> batch.log
