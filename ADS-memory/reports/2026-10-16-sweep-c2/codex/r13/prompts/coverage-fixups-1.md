# Tovu: two new coverage tests fail; fix the tests (last coverage round wrote them)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.
Persona: load /Users/la/Programming/Tovu/AI-Dev-Shop/agents/tdd/skills.md.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:` + per failure `VERDICT:` (test bug | real product bug, with file:line).
REUSE before you write. Smallest change. Never weaken an assertion to make it pass: find out what the code really does and why.
If the product code is wrong (the test expectation is right), do NOT change the test; describe the bug under NOT DONE.
Edit only the test files named below.

## 1. apps/website/src/features/identity/__tests__/delete-user-service.test.ts (node:test)
```
test at apps/website/src/features/identity/__tests__/delete-user-service.test.ts:1:27700
✖ a seeded account requires an owner caller even after losing its owner role (148.319674ms)
  Error: username 'admin' is already in use
      at createUser (/Users/la/Programming/Jini/packages/user-management/src/server/grant-service.ts:264:11)
      at async createBareUser (.../delete-user-service.test.ts:108:25)
      at async TestContext.<anonymous> (.../delete-user-service.test.ts:577:18)
```
Every other test in the file passes. The fixture already seeds a user named 'admin'; the new test creates another one.
Reuse the seeded account (or a unique username) so the test proves what its name says.

## 2. apps/admin/src/features/publish-content/__tests__/PublishContentDialog.unit.test.tsx (vitest + jsdom)
```
FAIL  PublishContentDialog — destination reads and incomplete connections > uses the destination-check fallback when an error carries no message
TestingLibraryElementError: Unable to find an element with the text: Could not check whether this install can publish yet.. This could be because the text is broken up by multiple elements.
```
116 other tests in the file pass. The rendered dialog shows the "Publish all content" body without that text.
Read apps/admin/src/features/publish-content/hooks/use-publish-content-confirm.hooks.ts and the dialog to find which
path a message-less destination-check error really takes and what it shows, then assert that (or fix the setup so the
error reaches the branch the test means to cover). Goal for use-publish-content-confirm.hooks.ts: 100% lines/branches.

## 3. apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx (vitest + jsdom)
```
FAIL  roles port contracts > the default permission port reads and deletes through the authenticated policy endpoints
AssertionError: expected {} to be undefined
 ❯ src/features/roles/__tests__/use-roles.unit.test.tsx:66:123
     64|       .mockResolvedValueOnce(new Response(null, { status: 204 }));
     65|     await expect(defaultRolesPort.listPolicyPermissions("policy/one"))…
     66|     await expect(defaultRolesPort.removePolicyPermission({ policyId: "…
```
Every other test in the file passes. Read what removePolicyPermission really resolves to on a 204 (apps/admin/src/lib/api.ts
and the roles port) and assert that. Goal: apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts 100% (now 100/95.34; 28,38 left).
