#!/bin/bash
cd /home/user/Tovu
for f in $(grep -v post/slug.ts /tmp/claude-0/-home-user-Tovu/cd9bf2f4-9a90-55e2-acc7-2a02a371e32f/scratchpad/queue.txt); do
  [ $(date -u +%H%M) -ge 2029 ] && [ $(date -u +%H%M) -lt 2100 ] && { echo STOPPED-AT-DEADLINE $f >> /tmp/claude-0/-home-user-Tovu/cd9bf2f4-9a90-55e2-acc7-2a02a371e32f/scratchpad/results.txt; break; }
  TMO=600 /tmp/claude-0/-home-user-Tovu/cd9bf2f4-9a90-55e2-acc7-2a02a371e32f/scratchpad/run-one.sh $f
done
echo QUEUE-END >> /tmp/claude-0/-home-user-Tovu/cd9bf2f4-9a90-55e2-acc7-2a02a371e32f/scratchpad/results.txt
