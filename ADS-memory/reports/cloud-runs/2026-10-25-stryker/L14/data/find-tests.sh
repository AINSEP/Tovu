#!/bin/bash
# usage: find-tests.sh <src file relative to repo root>
f="$1"; d=$(dirname "$f"); b=$(basename "$f" .ts)
cd /home/user/Tovu
# test files in same-dir __tests__ (and parent feature __tests__) importing ../b or ./b
grep -rlE "from ['\"](\.\./|\./)+([a-z0-9-]+/)*$b(\.js|\.ts)?['\"]" "$d/__tests__" 2>/dev/null | grep -E '\.test\.ts$'
