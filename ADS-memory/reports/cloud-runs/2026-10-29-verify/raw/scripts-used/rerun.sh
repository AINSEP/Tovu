#!/bin/bash
# usage: rerun.sh listfile outdir
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu
mkdir -p $2
while read f; do
  n=$(echo $f | tr '/' '_')
  TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json timeout 700 node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 --test-timeout=600000 $f > $2/$n.txt 2>&1
  echo "$f exit=$?" >> $2/_exit-codes.txt
done < $1
echo ALLDONE >> $2/_exit-codes.txt
