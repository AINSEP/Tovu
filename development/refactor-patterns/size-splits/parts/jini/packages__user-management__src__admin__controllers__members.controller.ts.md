### jini:packages/user-management/src/admin/controllers/members.controller.ts
- **Over:** `createMembersController` 120 (file 126)
- **Phase:** now · **Batch:** size-33
- **Tests:** `packages/user-management/src/admin/__tests__/members.controller.branches.test.ts`, `packages/user-management/src/admin/__tests__/people.controllers.test.ts`, `packages/user-management/src/admin/react/__tests__/MemberRow.pins.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `confirmDestructive`, returned `requestDestructive`, `cancelDestructive` | disable-member confirm flow |
| B | rest (`load`, `loadDetail`, `toggleDetail`, `resendSignInLink`, store helpers) | list + detail (stays) |

- **Splits:**
  1. GENERATIONS BOX: replace `let listGeneration = 0, detailGeneration = 0;` with `const generations: MembersGenerations = { list: 0, detail: 0 };` and rewrite every `listGeneration`/`detailGeneration` read/`++` as `generations.list`/`generations.detail` (needed because the counters now cross a function boundary; same arithmetic).
  2. FACTORY (same file, above) `createMemberDestructiveFlow({ api, store, read, set, call, gate, row, list, patchRow, report, generations }: CreateMemberDestructiveFlowInput): { confirmDestructive, requestDestructive, cancelDestructive }` ← `confirmDestructive` verbatim + the two returned methods' bodies (keep their `(required, optional = {})` signatures). Return object spreads `...createMemberDestructiveFlow({...})` in place of those three keys.
- **Importers to update:** none (`MembersController = ReturnType<…>` keeps the same shape).
- **After:** `createMembersController` ~85; file ~140.
- **Risks / notes:** closures over mutable `let`s — every counter site must go through `generations`; grep the function for `Generation` after the edit (zero bare names left). Consider Opus execution (see report).
