Code Inspection(Review): Personas: Code Inspection + Security — behavior preservation and security test quality.

- **Medium — [member-password-auth.test.ts:566](/Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/member-password-auth.test.ts:566):** The fixture clock starts at October 24, but cookie assertions use real `Date.now()`. After **2026-11-23 12:00 UTC**, the correct implementation returns `Max-Age=0` and this test fails. Smallest fix: pin the system clock to the fixture clock and restore it afterward.

- **Low — [tool-registrations.faults.unit.test.ts:225](/Users/la/Programming/Tovu/apps/website/src/features/database-transfer/__tests__/tool-registrations.faults.unit.test.ts:225):** Cleanup assertions compare every `tovu-transfer-chat-*` directory in the shared system temp directory. Concurrent transfers can fail this test despite correct cleanup; removing production cleanup during mutation testing also leaves folders behind. Smallest fix: use a test-owned temporary root with unconditional teardown.

Source review: **clean**. The scrypt work bound fixes a real CPU-cost issue; failing-test commit `99cb47156` precedes fix `a39872947`. All other source hunks preserve behavior. Database-transfer `members.password_hash`, identity wiring, `members_delete`, and owner/admin `visitor-tools.manage` remain unchanged.

Reviewed F6 head `5801b1197`. No edits, tests, or servers run; no new production process/network leak identified by inspection.
