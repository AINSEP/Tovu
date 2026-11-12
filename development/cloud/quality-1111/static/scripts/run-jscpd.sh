#!/bin/bash
# Copies the prod file lists into one staging dir (Tovu/ + Jini/) so cross-repo clones are detected.
export PATH=$HOME/.local/node24/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=5120
D=/home/user/Tovu/development/cloud/quality-1111/static
S=${STAGE:-/tmp/claude-0/-home-user/251e88ae-2da5-5847-8659-ad3c76df3d42/scratchpad/dup}
cd $S
npx --yes jscpd@4 --min-tokens 50 --reporters json,console --output $D/raw/jscpd --max-size 2mb --exitCode 0 Tovu Jini > $D/raw/jscpd.txt 2>&1; echo "exit $?" >> $D/raw/jscpd.txt
