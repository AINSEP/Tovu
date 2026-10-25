#!/bin/bash
cd /root/stryker/l15
for f in $(cat plug-order2.txt); do
  n=$(echo $f | sed 's#content/agent-plugins/##; s#/#_#g; s#\.mjs$##')
  L=$(wc -l < /home/user/Tovu/$f)
  if [ $L -le 260 ]; then
    [ $(date +%s) -gt $(date -d '2026-10-25 23:35' +%s) ] && { echo "TIME STOP before $n" >> batch2.log; break; }
    echo "$(date -u +%T) START $n" >> batch2.log
    ./run-plug.sh $f plug_$n 1500 > /dev/null 2>&1
    echo "$(date -u +%T) END $n $([ -f plug_$n.json ] && echo ok || echo NOJSON)" >> batch2.log
  else
    s=1; i=0
    while [ $s -le $L ]; do
      e=$((s+199)); i=$((i+1))
      [ $(date +%s) -gt $(date -d '2026-10-25 23:35' +%s) ] && { echo "TIME STOP before $n s$i" >> batch2.log; break 2; }
      echo "$(date -u +%T) START $n s$i ($s-$e)" >> batch2.log
      ./run-plug.sh $f plug_${n}__s$i 1500 ":$s-$e" > /dev/null 2>&1
      echo "$(date -u +%T) END $n s$i $([ -f plug_${n}__s$i.json ] && echo ok || echo NOJSON)" >> batch2.log
      s=$((e+1))
    done
  fi
done
echo BATCH-DONE >> batch2.log
