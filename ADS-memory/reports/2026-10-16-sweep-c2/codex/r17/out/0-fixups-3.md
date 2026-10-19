TDD(Direct): Selected TDD to diagnose failures and repair tests without weakening assertions.

CHANGED FILES:

1. [/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts:256](/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts:256)  
   VERDICT: test bug. `/private/` matches the HTML script comment “privately, outside DOM/HTML.” Checks now target distinct planted credentials in results and emissions.

2. [/Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts:342](/Users/la/Programming/Tovu/apps/website/src/features/external-mcp/__tests__/unit/static-token-setup.unit.test.ts:342)  
   VERDICT: test bug. Fixture now persists `oauthStatus: "connected"` and retains token nondisclosure checks.

3. [/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/create-agent-tool.unit.test.ts:610](/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/create-agent-tool.unit.test.ts:610)  
   VERDICT: test bug. Asserts the exact generic refusal; secret nondisclosure assertions remain.

4. [/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts:248](/Users/la/Programming/Tovu/apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts:248)  
   VERDICT: test bug in fixture arguments. Repository calls incorrectly supplied `postId` instead of `id`; corrected reads, deletions, and trash setup.

5. [/Users/la/Programming/Tovu/apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx:57](/Users/la/Programming/Tovu/apps/admin/src/features/trash/__tests__/use-trash.unit.test.tsx:57)  
   VERDICT: test bug suspected; isolation hardened with explicit unmounting and mock restoration before global restoration. `unstubAllGlobals()` already existed.

NOT DONE:

- The page busy loop was not located; termination remains unconfirmed.
- The trash paging failures’ root cause remains unconfirmed.
- Tests, typecheck, builds, and package scripts were not run. Coverage reaching 100% is unverified.
- No product files, Jini files, or git state were changed.
