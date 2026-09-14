# Jini identity seed audit

Advisory code-only extension expressly requested for `/Users/la/Programming/Jini/packages/cms`; read HEAD `50812f524d8b6a6905aa5c10f0ad856a5e74c5ac`. Production change `434d781e`; `be29a436` changes tests only and was deliberately not inspected beyond commit path metadata. No tests, builds, DB opens, source edits, or commits performed. Jini governing instructions and locked architecture entry points loaded; graph tracing unavailable under tool approval policy, direct source fallback used.

## J01 — High — CONFIRMED: interrupted seed after the owner user write permanently omits the owner role

- Location: `/Users/la/Programming/Jini/packages/cms/src/identity/seed.ts:340` (early return when user exists), `:434` (user write before final role assignment).
- Scenario: first boot writes the owner principal and owner user, then exits or the role-link operation fails before `principalRoles.save`. Every later boot finds the user and returns immediately. The owner can authenticate but has no role links or direct policy links, so every permission evaluates to `no_grant`; the supposedly resumable seed never repairs it.
- Evidence: read complete `seedIdentity` and the helper sequence at HEAD, plus `identity/authorize.ts` end to end. The early return occurs before all role repair logic. After `users.save`, the code still awaits `principalRoles.listByPrincipalId` and then writes the role link; therefore the user is not the final durable completion marker. `resolveEffectivePermissions` starts from principal role/direct-policy links, and with neither link returns no effective grants despite the owner policy containing `*`. Tovu's `identity/wiring.ts` follow-on reconciliation only repairs policy permissions and does not bind the principal to the role.
- Comment discrepancy: the new resume rationale says the owner user is written last, and that its existence means the seed ran to completion. Both claims miss the final role link; the new role-link deduplication check is unreachable on precisely this interrupted replay.
- Window anchor: `434d781e`; this remaining interruption window also existed before that fix.
- Disposition: implementation fix required. Reconcile the owner principal's required link before treating the seed as complete, or persist an atomic completion boundary covering both user and role link.
- Verification limits: static path confirmed; no interruption was induced and no tests inspected or run. No claim that this particular failure has occurred on the live site.
