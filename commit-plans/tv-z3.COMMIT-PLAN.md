# Dispatch tv-z3

Base for every sheet: merge-6, `776ce6d0f`. Source edits only; no commits, tests,
builds, installs, type checks, linters, gate execution, or ledger updates performed.
Expected reductions below are unverified and apply to `(path, catch-reads-error)`.
All paths in the desktop entries are under `apps/desktop/src/`.

## D01 — done (CUT-TO)

- Files / ledger keys: `desktop-agent-inventory.ts` (-1), `desktop-agent-service.ts` (-1); total -2.
- A103 binds the model probe before the async idiom inside the available branch.
  A104 wraps only native realpath. Cache eviction and E9 catches remain unchanged;
  their residual findings stay.
- Combine gate mutation owed: restore each replaced catch independently.
- Tests: none added or changed. Deletions at diff re-read: none.

## D03 — done

- Files / ledger keys: `external-site-stop.ts` (-1), `move-to-applications.ts` (-1),
  `product-telemetry-ipc.ts` (-1); total -3.
- Existing null/false results remain. Failed probes still prevent an unconfirmed
  stop or telemetry admission.
- Combine gate mutation owed: restore each replaced catch independently.
- Tests: none added or changed. Deletions at diff re-read: none.

## D04 — done

- File / ledger key: `renderer/use-site-list-prefs.hooks.ts` (-2).
- The stored-read default and session-only write outcome remain; existing
  why-comments stay beside the idioms.
- Combine gate mutation owed: restore each replaced catch independently.
- Tests: none added or changed. Deletions at diff re-read: none.

## D05 — done

- Files / ledger keys: `shared-sites.ts` (-2), `site-config.ts` (-1),
  `site-dir-store.ts` (-2), `site-folders.ts` (-1), `site-name.ts` (-1),
  `tracked-sites.ts` (-4); total -11.
- Lexical/basename fallbacks stay lazy; incomplete/unreadable outcomes stay
  distinct; discovery follows symlinks. The site-config write cleanup stays.
- Oversized files after edits: `site-dir-store.ts` (595 lines), `tracked-sites.ts`
  (704 lines); continued as instructed.
- Combine gate mutation owed: restore each replaced catch independently.
- Tests: none added or changed. Deletions at diff re-read: none.

## D06 — done

- Files / ledger keys: `stage-payload-lib.ts` (-1), `stage-payload-run.ts` (-1),
  `verify-package-cli.ts` (-1); total -3.
- A144 handles only the stat probe. A145 keeps `fs.unlinkSync(full); return 0;`
  outside the idiom, so unlink still throws. A148 keeps filtering outside it.
- Oversized file after edits: `stage-payload-lib.ts` (704 lines).
- Combine gate mutation owed: restore each replaced catch independently.
- Tests: none added or changed. Deletions at diff re-read: none.

## AP-T — STOPPED

- Blocker: `apps/site-chat/src/vanilla-tool-confirmation.ts:17` already defines a
  67-line `createVanillaToolConfirmation` (17–83); its returned callback spans
  64 lines (19–82). Both exceed the sheet's hard 50-line cap before edits.
  The sheet permits no new helper/extraction or unrelated reformatting to repair
  that size. No AP-T source or test edits made.
- Planned ledger key: `(apps/site-chat/src/tool-confirmation.ts, catch-reads-error)`;
  actual expected reduction 0 while stopped (intended completed sheet: -1).
- Tests not added, pending a revised sheet:
  `hook retains failed decision for retry and clears only on success`;
  `hook ignores late settlement after expiry or supersession`;
  `vanilla retains failed decision through chrome rerenders and retries`;
  `vanilla ignores late settlement after expiry or supersession`.
  Red reason on merge-6: both renderers clear the prompt before a false result,
  losing the prompt and retry controls instead of showing the failure sentence.
- Chrome look owed after implementation: offline Allow and Cancel, focus and
  retry, React and vanilla.
- Mutation owed after implementation: restore clear-then-`void confirm` in each
  renderer; restore the transport catch for the combine gate mutation.
- Targeted importer checks found only the listed production callers. An
  incidental admin test consumer is recorded in `REFRESH.md`; no repoint needed.
- Deletions at diff re-read: none.

Desktop expected total: -21 findings. Combine must confirm zero New/Worse rows
before updating the ledger and verify each expected reduction independently.
