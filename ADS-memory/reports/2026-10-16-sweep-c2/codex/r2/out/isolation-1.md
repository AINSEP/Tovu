Programmer(Execution): Selected Programmer for the minimal test setup fix. Added the existing isolation helper as the first import in all 10 files. Static inspection confirmed correct paths and preserved every original byte after the added line. Both whole-file failures have a matching guard path in module-level setup.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-search-tool.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-tool-search-ranking.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/__tests__/unit/install-upload.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-uninstall-tool-busy.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/__tests__/unit/activation-durable-write.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/database/__tests__/unit/tool-registrations.input-validation-status.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/deployments/deploy-ops/__tests__/search-discoverability.test.ts

NOT DONE: Tests, typechecks, builds, package scripts, and git operations were not run, as instructed. Runtime success remains unverified.
