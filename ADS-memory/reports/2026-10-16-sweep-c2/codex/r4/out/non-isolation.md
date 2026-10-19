Programmer(Direct): Programmer persona selected for root-cause diagnosis and minimal test fixes.

CHANGED FILES:

- /Users/la/Programming/Tovu/apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts  
  VERDICT: stale test setup since `fec2a6a9f`. Added first isolation import; boot’s swallowed guard explains the `undefined` results.

- /Users/la/Programming/Tovu/apps/website/src/features/webhooks/__tests__/integration/site-key-ensure-race.integration.test.ts  
  VERDICT: stale test setup since `fec2a6a9f`. Added first isolation import and passed `isolatedCatalogEnv` to both children.

- /Users/la/Programming/Tovu/apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts  
  VERDICT: stale test setup since `fec2a6a9f`. Added first isolation import; collision assertions remain intact.

- /Users/la/Programming/Tovu/apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts  
  VERDICT: stale test since Jini `30290220`, which intentionally removed spec IDs from runtime messages. Updated exact expectation.

- /Users/la/Programming/Tovu/apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts  
  VERDICT: stale test since Jini `30290220`. Updated exact expectation; preserved `BAD_REQUEST` and error-code assertions.

Reused the existing isolation helper. Preserved all comments. Only these five test files were edited; patch whitespace check passed.

NOT DONE:

- Tests, typecheck, builds, and package scripts were not run, as instructed. No git state was changed.
- Additional `seal-aad-invariant.test.ts` timeout left unchanged. VERDICT: env-or-load flake suspected from the 20-second `ETIMEDOUT`; unconfirmed without execution. Its CLI scans source and does not resolve catalog/home storage.
