#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
O=/home/user/Tovu/development/cloud/quality-1111/static
cd /home/user/Tovu
npm ci > $O/raw/tovu-npm-ci-root.txt 2>&1; echo "exit $?" >> $O/raw/tovu-npm-ci-root.txt
for a in admin desktop site-chat; do (cd apps/$a && npm ci > $O/raw/tovu-npm-ci-$a.txt 2>&1; echo "exit $?" >> $O/raw/tovu-npm-ci-$a.txt) & done; wait
npm run build --workspace @tovu/sdk > $O/raw/tovu-build-sdk.txt 2>&1; echo "exit $?" >> $O/raw/tovu-build-sdk.txt
