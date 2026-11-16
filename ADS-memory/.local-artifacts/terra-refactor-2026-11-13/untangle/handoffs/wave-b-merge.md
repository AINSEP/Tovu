# wave-b-merge handoff
Done: integ/wave-b in Jini (HEAD e60ccf6d5) and Tovu (HEAD bd9841200); lanes merged; reports in U/lane-reports/; followups applied for C2, C3 (§A), C4 (A1-A5), C5 (A1-A3), C7 (none), C9a (A1); coordinator manifests + lockfile.
Remaining:
1. followups/C11-ids.md (whole file, BEFORE B1): large clock sweep across ~10 packages, defaults.test split, ElevenLabs module-client deletion. Not started. Needs its own agent.
2. followups/C9-ui.md §A: A1 stale guard (nothing to do), A2 Tovu jini-kits.ts uiKit merge (Tovu file absent/not checked), A3 ui fake already passes ref as prop (React 19) - left as is, decide.
3. C11a, C8 merges (later), pass B1, then §B items of C3/C4/C5/C9a/C9-ui.
4. Sheet-only edits (U/sheets/*.md) in followups (C2 none, C4 A1-A6 sheet text, C5 A1-A4 sheet text) NOT done.
Decisions: C3a A1 SqliteConnectionSource moved back to db/kernel/sqlite/driver.ts (driver now imports SqliteClient/SqliteOpener from core; the dangling ../../sqlite/types.js import removed). Tovu source-digests.ts reset to {} per C3 A5 (recompute at B2). C4: lane had its own MountHostContext/RouteExceptionContext; renamed to RouteHostContext/RouteHostInternalErrorContext, MountHostContext export dropped from http-kit index. ui index.ts line 154 now final form (applier row for it will be STALE).
Warnings: pnpm install was --lockfile-only. Nothing tested. C5 A3 step 4 (platform ./net/endpoint-policy manifest lines) not checked.
