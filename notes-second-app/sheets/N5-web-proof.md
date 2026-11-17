# N5: end-to-end proof, install-closure baseline, packed-tarball boot

## Revision 3 (authoritative; revision-2 corrections folded into the steps below, which were rewritten in place)

- **The assistant round trip changes a note's title, not its body** (`../INDEX.md` section 00, item 5): body edits by
  the agent are owner decision OD-N13 (G19, on hold); `collections_entry_update` already forwards `title`.
- **No `--web` flag.** N2 serves the admin bundle at **`/admin/`** (through N0's `onUnmatched`, or G1's `routeRequest`
  once G1 has landed). Read `examples/notes-app/src/main.ts`'s argv parsing at dispatch and use the bundle argument
  N2 actually landed; none and the bundle not found from the package location: STOP.
- Judge 26: the packed proof drives the **browser** consumer (step 5). Judge 22: health-boot is the root
  `scripts/health-boot.ts`; the browser sequence creates **two** notes and asserts two. Judge 8: the list updates
  after the assistant's edit with no focus change and no click.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n5-proof`. Touches `examples/notes-app/**`,
`examples/notes-web/**`, `examples/README.md`. Prerequisites: N0–N4 merged. Estimate: ~85k Sonnet.

## Goal

Evidence that the web app works as a whole, a number for how much of Jini it drags in (G10), and proof it
runs from packed tarballs (the stand-in for a separate repo, OD-N1).

## Inventory

```sh
sed -n 1,80p scripts/health-boot.ts                                      # the packed-tarball pattern to reuse (root script; minimal-host has no scripts/health-boot.ts)
sed -n 15,30p examples/minimal-host/src/health-boot.test.ts              # how it is invoked
ls examples/reference-web/e2e                                            # existing e2e convention (node --test *.test.mjs)
rg -n "parseArgs|options:" examples/notes-app/src/main.ts                # the flags N2/N3 landed (bundle location, assistant)
node -e 'require("playwright")' && echo playwright-ok                    # preinstalled in cloud; do NOT install another copy
```

If `playwright` is not resolvable, write the e2e file anyway, mark steps 2 and 5 "not run", and say so first in the report.

## Steps (commit each)

1. **Scripted agent mode.** `examples/notes-app/src/main.ts` gains `--scripted-agent` (test/demo only,
   documented as such): `runDriver` = a handler in `src/scripted-agent.ts` (functions <= 50 lines) that understands two
   prompts and otherwise finishes the run with an explanatory text and no call:
   - `create note: <title>` -> one delegated `collections_entry_create`;
   - `retitle note <slug>: <title>` -> `collections_entry_list` to read the note's `version`, then one
     `collections_entry_update` with `{ title, expectedVersion }`.
   Unit tests with a fake `callTool` port: exact calls and arguments for both prompts; an unparseable prompt makes no
   call; a list without the slug finishes with a plain-words "no note <slug>" text and no update.
2. **Browser e2e** `examples/notes-web/e2e/notes.e2e.test.mjs` (`node --test`): build notes-web, start notes-app on
   port 0 with a temp db, the bundle argument from the inventory, and `--scripted-agent`; with Playwright Chromium on
   `<origin>/admin/`:
   a) create a note in the UI -> it is listed; b) edit it -> title changes; c) open the same note in a second
   page, save in the first, save in the second -> conflict alert, first writer's title kept; d) search finds
   it by a body word and shows the empty state for nonsense; e) open the assistant, send `create note: From
   agent` -> the note appears in the list with no reload, no click, no focus change; f) send `retitle note
   from-agent: Renamed by agent` -> the open list shows the new title the same way; g) restart the server process
   on the same db -> **both** notes still listed with their latest titles. Each step asserts text **and** the server
   JSON (`GET /api/entities/note`). Save four screenshots at deviceScaleFactor 2 under `e2e/artifacts/`
   (git-ignored) and list them.
3. **Security e2e** in the same file, no browser: `fetch` with `Origin: http://evil.example` to
   `POST /api/entities/note` and to `POST /api/runs` -> 403 both; `GET /api/delegated-tool-calls` through the
   app origin -> 404.
4. **Install closure (G10 baseline).** `scripts/closure.mjs`: for `@jini-example/notes-app` and
   `@jini-example/notes-web`, list every `@jini-ai/*` package in the production dependency closure
   (`pnpm ls --prod --depth Infinity --json`), and count third-party packages. Write the table into
   `examples/notes-app/README.md` under "What this app installs", with the date and SHA. No threshold yet;
   INDEX §6 asks each xpkg lane to re-run it.
5. **Packed-tarball boot (browser).** `examples/notes-app/scripts/packed-boot.ts`, modelled on the root
   `scripts/health-boot.ts`: pack the `@jini-ai/*` closure from step 4, install it into a scratch copy of `notes-app`
   and `notes-web` outside the workspace (no workspace resolution), build `notes-web` there, boot `notes-app` serving
   it at `/admin/`, and drive Chromium through create, edit, publish and the scripted `retitle` round trip (steps
   2a, 2b, 2f plus publish). Print `NOTES_PACKED_BOOT_OK` only after all pass. If packing fails for a package, report
   the package and the error (a publish gap); do not patch the package. `scripts/smoke.ts` (HTML pages + contact
   form) stays a separate check and is also run there.
6. **Docs.** `examples/README.md`: add notes-app/notes-web under "Projects and proofs". `notes-app/README.md`:
   feature list, run commands, gap table generated from both `GAPS.json` files (file, gap id, lines).

## Acceptance

- All example gates; e2e passes twice in a row (no flake); `NOTES_PACKED_BOOT_OK` printed or the blocking
  package reported.
- Report: total app-owned gap lines (sum of both ledgers), the closure table, test counts.

## Not verified by the planner

`scripts/health-boot.ts` internals; whether the packed boot can include `express` and `better-sqlite3`
prebuilds in the executor's environment; e2e timing of steps (e) and (f) with the scripted agent; whether
`collections_entry_list`'s result carries `version` per entry (if not, the `retitle` prompt is a STOP, not a guess).
