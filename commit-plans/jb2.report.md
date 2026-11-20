Implemented **9 sheets**; **3 STOPPED** under the hard limits.

| Sheet | Status and files touched |
|---|---|
| J-HW1 | Done — `Sidebar.tsx`, hardwiring/log-safety ledgers. Deleted H4/H5; L43 remains value 1 with KEEP reason. |
| J-HW2 | Done — deleted watchdog source/test; updated observability exports, install docs, API spec and changeset. Deleted H94. |
| RT-J1 | Done — `automatic-use.ts`, unit tests, patch changeset. |
| RT-J2 | Done — automatic-use, search candidate/type, unit tests, minor changeset. Existing argv gate retained. |
| RD-J1 | Done — redaction source and three test files, patch changeset. Included the coordinator’s fixture amendment. |
| ACP-1 | Done — RPC/session source, session tests, changeset. |
| ACP-2 | Done — constants/session-results, session tests, changeset. |
| ACP-3 | **STOPPED** — required `createAcpHarness` spans 85 lines, exceeding 50; no split authorized. No edits. |
| ACP-4 | **STOPPED** — same harness limit; prerequisite `acpRepairOptions` absent after ACP-3 stopped. No edits. |
| ACP-5 | **STOPPED** — same limit and prerequisite. No edits. |
| ACP-6 | Done — session-run, session tests, changeset. |
| ACP-7 | Done — pilot definition/test/export, env/executable mapping, daemon HTTP adapter/test, changeset. Pilot remains **OFF**. |

Full file paths, test names, static red reasons and combine work are recorded in [COMMIT-PLAN.md](SCR/c-jb2/COMMIT-PLAN.md).

No `REFRESH.md` entries. Diff review removed one out-of-sheet saved-state assertion; all other deletions are sheet-required.

No tests, builds, installs, type-checks or linters ran. `.git` and `api-baseline/` remain untouched; OPUS-CLOUD must run `pnpm api:update`.
