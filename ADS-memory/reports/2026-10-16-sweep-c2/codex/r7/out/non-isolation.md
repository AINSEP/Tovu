Programmer(Execution): Chose Programmer for root-cause tracing and minimal repairs.

CHANGED FILES:

- `/Users/la/Programming/Tovu/apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts`  
  VERDICT: stale test since Jini `13e90536`, adopted by Tovu `c9105af5e`; now expects “Recovery window ended.”

- `/Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts`  
  VERDICT: env-or-load flake — isolation guard masks workspace validation. Added first isolation import.

- `/Users/la/Programming/Tovu/apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts`  
  VERDICT: env-or-load flake — isolation guard masks override validation. Added first isolation import.

- `/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts`  
  VERDICT: env-or-load flake — isolation guard masks plugin validation. Added first isolation import.

- `/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts`  
  VERDICT: env-or-load flake — isolation guard during module initialization. Added first isolation import.

- `/Users/la/Programming/Tovu/apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts`  
  VERDICT: stale test since Jini `13e90536` / Tovu `c9105af5e`; exact expectations now include exhaustion details.

- `/Users/la/Programming/Tovu/apps/website/src/contracts/core/tool-metadata/site-inspection.ts`  
  VERDICT: real discoverability bug in this file’s search metadata at line 11; added two natural capability questions through the existing metadata owner. Ranking effect unverified.

- `/Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json`  
  VERDICT: synchronized the projection fixture with that metadata change.

NOT DONE:

- `site-capabilities-search-discoverability.test.ts` remains unchanged. VERDICT: real ranking defect, addressed through the metadata above; top-three assertion preserved, resulting rank unverified.
- Tests, typecheck, builds, and package scripts were not run, as instructed.
- Targeted `git diff --check` passed. No git state changes, Jini writes, or protected production-source edits. Relevant history/diff checks found no causal in-flight changes.
