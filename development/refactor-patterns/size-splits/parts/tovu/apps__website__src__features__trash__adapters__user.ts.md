### tovu:apps/website/src/features/trash/adapters/user.ts
- **Over:** `createUserTrashAdapter` 103 (file 147, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/features/trash/__tests__/user-adapter.test.ts`, `.../__tests__/user-adapter.dialects.test.ts`, `.../__tests__/account-protections.test.ts`. No test mocks this module.
- **Responsibility map:** returned adapter methods `hide` (33), `unhide` (29), `purge` (27) sharing `underPrincipalLock`, `kernel`, `deps`, `idGen`, `clock`, `purge` (dep).
- **Splits:** HELPER at module level directly above `createUserTrashAdapter` (after `appendEvent`): `hideUser({ input, deps, kernel, underPrincipalLock }: HideUserInput)` ← the `hide` method body word for word (`input` = the method's existing parameter(s) folded into one object; `idGen`/`clock` read as `deps.idGen`/`deps.clock` only if the body uses the destructured names — otherwise pass `idGen, clock` too, keeping the names). Return type = `hide`'s. The adapter's `hide` becomes `hide: (…same params…) => hideUser({ … })`. `kernel` type = `ReturnType<typeof lazyKernel>`; `underPrincipalLock` type = declare `type UnderPrincipalLock = <T>(input: { workspaceId: string; principalId: string; body: … }) => Promise<T>` copied from its definition.
- **Importers to update:** none.
- **After:** `createUserTrashAdapter` ~72; file ~160.
- **Risks / notes:** the method name `purge` shadows the destructured dep `purge` — keep names exactly as they are.
