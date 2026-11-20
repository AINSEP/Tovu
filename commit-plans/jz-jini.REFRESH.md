# Refresh notes

Base: `c39b5bbdd`. No importer repoints were retained.

ACP-3 stopped on the nullable resume input contract described in COMMIT-PLAN.md. ACP-4 and ACP-5 stopped on that prerequisite. The targeted `runAcpDispatch` search also found direct test callers in:

- `packages/daemon/src/agent-executor/__tests__/mcp-bridge-staging.test.ts`
- `packages/daemon/src/agent-executor/__tests__/native-events-characterization.test.ts`

Their direct input objects currently omit the proposed required resume fields. They remain unchanged because ACP-3 stopped. A revised sheet must account for them. The staging test also asserts the exact attach option keys, which a completed ACP-5 beforeRelease hook would change.

`packages/daemon/src/agent-executor.ts` and `packages/daemon/src/agent-executor/index.ts` expose `runAcpDispatch` through re-exports; the inspected production invocation is in the named `launch.ts`. No unlisted production invocation was found in the targeted symbol search.

The named `handleInitializeAck` test callers are in `session.handlers.unit.test.ts`; their temporary result arguments were removed with the stopped sheet. No additional test repoints were performed.

Combine checks: daemon suite for ACP-H; UI test plus the named focus mutation and Chrome menu check; exact citation check plus restoration mutation for J-C1; first CI audit log with later checks continuing. No API baseline changes are needed for the retained edits.
