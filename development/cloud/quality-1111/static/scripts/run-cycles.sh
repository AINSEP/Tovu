#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
D=/home/user/Tovu/development/cloud/quality-1111/static
run() { # name cwd tsconfig paths...
  local n=$1 cwd=$2 tsc=$3; shift 3
  (cd $cwd && /home/user/Tovu/node_modules/.bin/depcruise --config $D/scripts/cycles.depcruise.cjs ${tsc:+--ts-config $tsc} --output-type json --output-to $D/raw/depcruise-$n.json "$@" > $D/raw/depcruise-$n.txt 2>&1; echo "exit $?" >> $D/raw/depcruise-$n.txt)
}
run tovu-website /home/user/Tovu tsconfig.json apps/website/src &
run tovu-admin /home/user/Tovu/apps/admin tsconfig.json src &
run tovu-desktop /home/user/Tovu/apps/desktop tsconfig.renderer.json src scripts &
run tovu-site-chat /home/user/Tovu/apps/site-chat tsconfig.json src scripts &
run tovu-packages-content /home/user/Tovu tsconfig.json packages content &
wait
run jini /home/user/Jini tsconfig.base.json packages
