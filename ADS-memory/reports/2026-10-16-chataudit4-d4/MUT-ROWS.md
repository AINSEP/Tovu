# Mutation rows from chataudit4-d4 (Tovu commits 21102b62d 1c97a4997 76d635055; Jini c7557838 13e90536 0de2f161)

## Tovu (lane-ready; explicit tests)
| 901 | T1 | `apps/website/src/features/deployments/export-run.ts` | `apps/website/src/features/deployments/__tests__/export-run.test.ts` `apps/website/src/features/deployments/__tests__/diagnose-static-export.unit.test.ts` `apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts` |
| 902 | T1 | `apps/website/src/features/deployments/tool-registrations.ts` | `apps/website/src/features/deployments/__tests__/diagnose-static-export.unit.test.ts` `apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts` |
| 903 | T1 | `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts` | `apps/website/src/server/inbound/assistant/__tests__/assistant-system-overlay.unit.test.ts` `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts` `apps/website/src/server/inbound/assistant/__tests__/credential-guidance.unit.test.ts` |
| 904 | T1 | `apps/website/src/server/inbound/assistant/durable-run-routes.ts` | `apps/website/src/server/inbound/assistant/__tests__/durable-run-routes.unit.test.ts` `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.durable-binding.unit.test.ts` |
| 905 | T1 | `apps/website/src/cli/commands/export.ts` | `apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts` `apps/website/src/cli/__tests__/integration/export-command-migration-recovery.integration.test.ts` |

## Jini (general-work; TARGETS.md says the lanes tool cannot target Jini — needs a Jini-repo lane or vitest-based sweep there)
- packages/core/src/registration-kit.ts — packages/core/src/__tests__/registration-kit.test.ts
- packages/chat/src/server/durable-runs/recover.ts — packages/chat/src/server/durable-runs/__tests__/recover.test.ts
- packages/chat/src/core/durable-runs/policies.ts — same recover.test.ts
- packages/devops/src/static-export/runner.ts — packages/devops/src/static-export/__tests__/runner.test.ts
- packages/devops/src/static-export/transforms.ts — runner.test.ts (+ transforms tests if present)
