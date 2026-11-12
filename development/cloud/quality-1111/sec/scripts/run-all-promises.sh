#!/usr/bin/env bash
# Runs run-promises.sh over every unit, smallest first, biggest last (time-boxed by the caller).
S=/home/user/Tovu/development/cloud/quality-1111/sec
export SEC_TOOLS=/tmp/claude-0/-home-user/22e759b2-6583-52c2-824f-84209cff904e/scratchpad/tools
R="$S/scripts/run-promises.sh"
$R tovu packages/sdk; $R tovu packages/contracts; $R tovu apps/site-chat
for p in sqlite memory artifacts analytics protocol sandbox infra sidecar cli search server registry cookie-consent http-kit vibecoding capability-providers ui-kit oauth provider-plugins diagnostics agentic plugins desktop-host mcp commerce devops db user-management platform integrations agent-plugins core daemon agent-runtime chat cms; do
  $R jini packages/$p; done
$R tovu apps/desktop tsconfig.main.json,tsconfig.preload.json,tsconfig.renderer.json
$R jini packages/admin
$R jini packages/ui
$R tovu apps/admin
$R tovu apps/website
echo ALLDONE $(date +%T)
