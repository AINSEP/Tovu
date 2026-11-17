# N5: end-to-end proof, install-closure baseline, packed-tarball boot

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n5-proof`. Touches `examples/notes-app/**`,
`examples/notes-web/**`, `examples/README.md`. Prerequisites: N0–N4 merged. Estimate: ~80k Sonnet.

## Goal

Evidence that the web app works as a whole, a number for how much of Jini it drags in (G10), and proof it
runs from packed tarballs (the stand-in for a separate repo, OD-N1).

## Inventory

```sh
ls examples/minimal-host/scripts && sed -n 1,80p examples/minimal-host/scripts/health-boot.ts   # the packed-tarball pattern to reuse
ls examples/reference-web/e2e                                                                    # existing e2e convention (node --test *.test.mjs)
node -e 'require("playwright")' && echo playwright-ok                                             # preinstalled in cloud; do NOT install another copy
```

If `playwright` is not resolvable, write the e2e file anyway, mark step 2 "not run", and say so first in the report.

## Steps (commit each)

1. **Scripted agent mode.** `examples/notes-app/src/main.ts` gains `--scripted-agent` (test/demo only,
   documented as such): `runDriver` = a handler that, for the prompt `create note: <title>`, performs one
   delegated tool call against the daemon (`collections_entry_create`) and finishes the run with a short
   text. <= 50 lines in `src/scripted-agent.ts`. Unit test: the handler with a fake `callTool` port creates
   exactly one call with the parsed title; an unparseable prompt finishes the run with an explanatory text
   and makes no call.
2. **Browser e2e** `examples/notes-web/e2e/notes.e2e.test.mjs` (`node --test`): build notes-web, start
   notes-app on port 0 with a temp db, `--web`, `--scripted-agent`; with Playwright Chromium:
   a) create a note in the UI -> it is listed; b) edit it -> title changes; c) open the same note in a second
   page, save in the first, save in the second -> conflict alert, first writer's title kept; d) search finds
   it by a body word and shows the empty state for nonsense; e) open the assistant, send `create note: From
   agent` -> the note appears in the list without a manual reload; f) restart the server process on the same
   db -> all three notes still listed. Each step asserts text **and** the server JSON (`GET /api/entities/note`).
   Save four screenshots at deviceScaleFactor 2 under `e2e/artifacts/` (git-ignored) and list them.
3. **Security e2e** in the same file, no browser: `fetch` with `Origin: http://evil.example` to
   `POST /api/entities/note` and to `POST /api/runs` -> 403 both; `GET /api/delegated-tool-calls` through the
   app origin -> 404.
4. **Install closure (G10 baseline).** `scripts/closure.mjs`: for `@jini-example/notes-app` and
   `@jini-example/notes-web`, list every `@jini-ai/*` package in the production dependency closure
   (`pnpm ls --prod --depth Infinity --json`), and count third-party packages. Write the table into
   `examples/notes-app/README.md` under "What this app installs", with the date and SHA. No threshold yet;
   INDEX §6 asks each xpkg lane to re-run it.
5. **Packed-tarball boot.** `examples/notes-app/scripts/packed-boot.ts`, modelled on minimal-host's
   health-boot: pack the `@jini-ai/*` closure from step 4, install into a scratch copy of `notes-app`
   outside the workspace, run `scripts/smoke.ts` there. Prints `NOTES_PACKED_BOOT_OK`. If packing fails for
   a package, report the package and the error (that is a publish gap), do not patch the package.
6. **Docs.** `examples/README.md`: add notes-app/notes-web under "Projects and proofs". `notes-app/README.md`:
   feature list, run commands, gap table generated from both `GAPS.json` files (file, gap id, lines).

## Acceptance

- All example gates; e2e passes twice in a row (no flake); `NOTES_PACKED_BOOT_OK` printed or the blocking
  package reported.
- Report: total app-owned gap lines (sum of both ledgers), the closure table, test counts.

## Not verified by the planner

minimal-host's health-boot internals; whether the packed boot can include `express` and `better-sqlite3`
prebuilds in the executor's environment; e2e timing of step (e) with the scripted agent.
