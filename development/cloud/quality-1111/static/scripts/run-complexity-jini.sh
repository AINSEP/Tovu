#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Jini
xargs -s 2000000 -a /home/user/Tovu/development/cloud/quality-1111/static/raw/files-jini.txt node_modules/.bin/eslint --no-config-lookup --config /home/user/Tovu/development/cloud/quality-1111/static/scripts/complexity.eslint.config.mjs -f json -o /home/user/Tovu/development/cloud/quality-1111/static/raw/complexity-jini.json > /home/user/Tovu/development/cloud/quality-1111/static/raw/complexity-jini.txt 2>&1; echo "exit $?" >> /home/user/Tovu/development/cloud/quality-1111/static/raw/complexity-jini.txt
