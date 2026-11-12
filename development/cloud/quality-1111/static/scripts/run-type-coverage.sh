#!/bin/bash
# type-coverage@2 per Jini package / Tovu app. typescript@5.9.3 is supplied alongside because Jini's TS 7.0.2 lacks ts.createProgram.
export PATH=$HOME/.local/node24/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=4096
D=/home/user/Tovu/development/cloud/quality-1111/static
one() { # label dir tsconfig
  cd "$2" && timeout 900 npx --yes -p type-coverage@2 -p typescript@5.9.3 type-coverage -p "$3" --json-output --ignore-files '**/__tests__/**' --ignore-files '**/*.test.*' --ignore-files '**/*.spec.*' --ignore-files '**/dist/**' --ignore-files '**/fixtures/**' > $D/raw/type-coverage/$1.json 2>&1; echo "exit $?" > $D/raw/type-coverage/$1.exit
}
export -f one; export D
{
  echo "tovu-website /home/user/Tovu tsconfig.json"
  echo "tovu-admin /home/user/Tovu/apps/admin tsconfig.json"
  echo "tovu-desktop-main /home/user/Tovu/apps/desktop tsconfig.main.json"
  echo "tovu-desktop-renderer /home/user/Tovu/apps/desktop tsconfig.renderer.json"
  echo "tovu-site-chat /home/user/Tovu/apps/site-chat tsconfig.json"
  for p in /home/user/Jini/packages/*/; do n=$(basename $p); [ -f $p/tsconfig.json ] && echo "jini-$n $p tsconfig.json"; done
} | xargs -P 3 -L 1 bash -c 'one "$0" "$1" "$2"'
