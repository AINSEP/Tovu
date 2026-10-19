TDD(Direct): Loaded the TDD persona for test design. Added 26 focused tests across seven files; production code is unchanged.

**CHANGED FILES:**

- /Users/la/Programming/Tovu/apps/website/src/features/identity/__tests__/wiring.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/delivery-tools.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/origin/__tests__/configured-origin.test.ts
- /Users/la/Programming/Tovu/apps/website/src/features/plugins/__tests__/disk-headroom.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/http/__tests__/test-origin-allowlist.test.ts
- /Users/la/Programming/Tovu/apps/website/src/platform/server-logs/__tests__/unit/process-logs.unit.test.ts
- /Users/la/Programming/Tovu/apps/admin/src/features/ai-assistant/__tests__/AdminPermanentDeletes.unit.test.tsx

**PER FILE:**

| Source | Added coverage targets |
|---|---|
| `identity/wiring.ts` | ISO-only clock, verified read-only owner, reconciliation guard, injected API-key repository, empty credentials, unsupported deletion defaults. |
| `newsletter/delivery/tool-registrations.ts` | Unset/blank owner email, default builder, three cancellation boundaries, committed launch followed by audience failure. |
| `newsletter/subscriptions.ts` | No additions: existing tests already exercise every current conditional, including batch limits and dependency failures. |
| `origin/configured-origin.ts` | Default environment, console warnings, runtime policy and boot timestamp. |
| `plugins/disk-headroom.ts` | Measurement failure and WAL-only rounded headroom. |
| `http/test-origin-allowlist.ts` | Native transport/default ports, existing development-host permission, private-address permission, normalization/deduplication. Historical lines 33–34 are now comments. |
| `server-logs/index.ts` | Repeated installation/removal, fatal-formatting failure, repeated attachment/detachment, missing files, timestamp ordering and ties. |
| `use-admin-permanent-deletes.hooks.ts` | Unchanged toggle, disabled/loading guards, unchecked filtering, deduplication and explicit options. |

**UNREACHABLE:**

- `apps/website/src/platform/http/test-origin-allowlist.ts:47`: false outcomes of `!url.username` and `!url.password`; preceding raw-origin equality already excludes credentials.
- `apps/website/src/features/newsletter/delivery/tool-registrations.ts:168`: present-but-falsy `requeueFailed`; current service returns either no property or literal `true`.
- `apps/website/src/features/newsletter/delivery/tool-registrations.ts:186`: default `options = {}` initializer; the enclosing Jini error wrapper always supplies an options object.

These remain unchanged for the owner’s decision.

**NOT DONE:**

Execution and measured 100% confirmation remain with the verifying agent. No tests, typechecks, builds, coverage, package scripts, or git mutations were performed. The existing modified log suite was left untouched; its new companion suite covers process lifecycle behavior.
