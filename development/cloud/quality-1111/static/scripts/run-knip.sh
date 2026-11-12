#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=5120
D=/home/user/Tovu/development/cloud/quality-1111/static
(cd /home/user/Tovu && npm run quality:knip -- --reporter json > $D/raw/knip-tovu.json 2> $D/raw/knip-tovu.txt; echo "exit $?" >> $D/raw/knip-tovu.txt)
(cd /home/user/Jini && node_modules/.bin/knip --config knip.json --no-exit-code --no-progress --reporter json > $D/raw/knip-jini.json 2> $D/raw/knip-jini.txt; echo "exit $?" >> $D/raw/knip-jini.txt)
