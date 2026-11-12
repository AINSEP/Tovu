#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
O=/home/user/Tovu/development/cloud/quality-1111/static
cd /home/user/Jini
pnpm install --frozen-lockfile > $O/raw/jini-install.txt 2>&1; echo "exit $?" >> $O/raw/jini-install.txt
pnpm --no-bail -r build > $O/raw/jini-build.txt 2>&1; echo "exit $?" >> $O/raw/jini-build.txt
