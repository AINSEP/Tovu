Programmer(Execution): Programmer persona selected for the scoped hook, cache, and stream repairs.

**CHANGED FILES:** Under `apps/admin/src/`:

- `components/__tests__/AssistantDock.hooks.unit.test.tsx` — added provider wrappers; kept every assertion. The stale-read case now explicitly refreshes to supersede shared pending reads.
- `components/AssistantDock/hooks/AssistantDock.hooks.tsx` — restored HEAD’s daemon probe and original comment; removed placeholder principal plumbing while retaining principal-scoped query keys.
- `components/__tests__/AssistantDock.runtime-access.unit.test.tsx` — restored HEAD’s pending-only health expectations.
- `lib/settings-events.ts` — uses `opened || cursor` so resumed sources publish; retained the explanatory comments.
- `lib/assistant-agents-snapshot.ts` and its unit test — restored exactly to HEAD.
- `__tests__/app-boot-request-volume.test.tsx` — expects three agents requests: inventory plus health probes for the initial and restored panes, based on source tracing.

`admin-boot-readers.test.tsx` contained no placeholder-isolation case to remove. Excluded lane files were untouched.

Scoped `git diff --check` passed; exact HEAD restorations were confirmed.

**NOT DONE:** No tests, typecheck, builds, or servers ran, as instructed. Runtime behavior and the inferred boot count remain unverified. No index, branch, or commit changes were made.
