J4 done; verification remains with combine.

- Changed the entries registration, write service and named test file. The signal now reaches a check inside the transaction callback, before persistence.
- Added both tests first: admission cancellation preserves the original row, adds no revision/event and rejects with the same reason; cancellation during outbox enqueue preserves successful completion. Test count: 8 → 10.
- The admission witness should fail before the fix. The committed control pins existing behavior.
- No S6 overlap: the original entry write service matches the sheet’s base.
- `REFRESH.md` records that `widgets/host-ports.ts:58` follows the signature through `typeof updateEntry`; no edit needed.
- `COMMIT-PLAN.md` records files, additive API delta, mutation owed and the 656-line file notice. No deletions at diff review.

No tests or other prohibited checks ran. `.git`, existing pads and other sheets remain untouched.
