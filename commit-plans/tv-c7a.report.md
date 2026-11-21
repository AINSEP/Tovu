Five sheets completed; C7-IDS partially completed; C7-CRED-LABELS stopped under its specified condition.

- **C7-FILENAMES — done:** 105 logical files, including eight fixture renames. Updated all 180 references and the bundler checks. Residual searches match only the two excluded docs.
- **C7-IDS — partial:** seven test files updated. Stopped member-login because `providers.ts:43` requires the old production identity. Stopped three plugin-host cases at `:202`, `:456`, and `:475`: source origin is unavailable or no permitted identity literal exists.
- **C7-CRED-LABELS — STOPPED:** no sheet-specific edits. `mail-provider-catalog.ts:45,77` supplies the Tovu SMTP label; `provider-operations.ts:116–118` writes it outside the allowed files.
- **C7-CSS — done:** `styles.css` selector and three selectors in `Themes.unit.test.tsx` updated.
- **C7-PREVIEW-FEED — done:** exact wait loop and assertion inserted in `preview-feed-access.test.ts`.
- **C7-AGUI-TESTS — done:** six expectations updated in `assistant-transport.ag-ui.unit.test.ts`. **DEPENDS: Jini c7-jini C7-J-AGUI-ERROR.**
- **C7-TEST-SAFETY — done:** 14 messages added across nine files. Counts: **6→5, 2→1, 1→0, 4→2, 6→5, 3→1, 5→1, 1→0, 2→1.**

[COMMIT-PLAN.md](SCR/c-tv-c7a/COMMIT-PLAN.md) contains file lists, test names, breaks, dependencies, mutations, and size notes. [REFRESH.md](SCR/c-tv-c7a/REFRESH.md) records the escaped bundler expectation, shifted activation anchors, and STOP evidence.

Diff review required no scope deletions. The specified `retiredEnv` array was removed. No tests, builds, installs, linters, staging, or commits ran; all changes remain unstaged.
