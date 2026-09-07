# Desktop lifecycle fixes — D-01..D-07 + SEC-01

Agent B (Programmer/Execution). Branch `restructure/apps-website-phased`. Scope: `apps/desktop/`.
Written as the work happened; every RED output below was captured before its fix.

## Shape: one rework, plus two patches that are genuinely separate concerns

Architecture §4.5's framing is right and I worked from it. **D-05, D-06, D-07 and SEC-01/D-04 are
one state machine**: "which site dirs have a live `tovu serve`, and who is allowed to act on one".
Every one of them is a reader trusting a record that no component owns the transitions of —
`openSites` means "was started", `open-sites.json` means "was recorded", a `created` row means "was
made here once". I fixed them as one owner rather than four patches.

**D-01 and D-02 are not part of that machine** and I did not fold them into it:
- D-01 is a *classifier contract* defect (one function written for a single picked folder, reused as
  the predicate of two bulk scans). It has nothing to do with process liveness.
- D-02 is a *contract honesty* defect between the renderer and main. Its state lives in a form.

So: **one rework (the supervisor) + two independent patches**, not six patches and not one
mega-change. `main.cjs` was NOT restructured into boot modules — §4.5 recommends that, but it is a
different task, it is exactly the change that got the file gutted once already (`15548bef`), and
`tsc` cannot check `.cjs`, so a large blind move there has no guard. I extracted the one seam the
lifecycle findings actually need and left the other 1,000 lines alone.

## Status per finding

| ID | Verdict | Where |
|---|---|---|
| SEC-01 / D-04 | VERIFIED-AND-FIXED | `project-delete-guard.cjs`, `project-registry.cjs`, `project-ipc.cjs` |
| D-05 | VERIFIED-AND-FIXED | `project-ipc.cjs` |
| D-06 | in progress | |
| D-07 | in progress | |
| D-01 | in progress | |
| D-02 | in progress | |
| D-03 | in progress | |

---

## SEC-01 / D-04 — VERIFIED-AND-FIXED (High)

**Verified against source, not taken from the report.** `mayEraseProjectDirectory`
(`project-delete-guard.cjs:104-108` at the frozen SHA) tested exactly two things, both properties of
the *row*: `row.origin === "created"` and real-path containment outside `repoRoot`. Nothing consulted
the directory. `handleDelete` (`project-ipc.cjs:151-169`) then ran
`fsp.rm(id, {recursive: true, force: true})` on that answer.

The security lens's severity call is the right one. The bugs lens rated it Low as "code shape"; it is
a live, operator-reachable, unrecoverable erase of content the app never created, and the card even
renders under the *replacement* site's name because `readSiteName` (`main.cjs:279`) reads whatever
`config.json` is at that path now.

### RED (before the fix)

`node --test src/project-delete-guard.test.cjs` — 4 failing:

```
✖ mayEraseProjectDirectory refuses a created row whose path now holds a DIFFERENT site
  AssertionError: Expected values to be strictly equal:
    actual: true,
    expected: false,
✖ mayEraseProjectDirectory refuses a created row that recorded no site identity
    actual: true, expected: false,
✖ mayEraseProjectDirectory refuses a created row whose directory can no longer prove its identity
  AssertionError: absent directory
    actual: true, expected: false,
✖ readSiteIdentity returns a site's own stamped id, and null for anything it cannot read
```

`node --test src/project-ipc.test.cjs` — 3 failing at the sink that really calls `fs.rm`.

### Fix

A third independent test in the guard: the site at `row.siteDir` **right now** must carry the same
`.site-meta.json` `siteId` that was stamped when this app created it.

`siteId` over an inode/device pair deliberately. Both discriminate, but `st_dev` is a property of the
*mount*, free to change across a reboot or a re-mounted volume — that would silently downgrade every
later delete of an ordinary project to a card-removal, a false refusal with no signal. `siteId` is
content the site carries with it: it survives a move, a copy, a reboot and a restore from backup, and
a different site has a different one.

- `readSiteIdentity(siteDir)` — `.site-meta.json`'s `siteId`, or `null` for absent / unreadable /
  not-JSON / no-id. All four are "cannot prove identity" and the caller treats them identically.
- `trackProject(..., origin, { siteId })` — recorded **only** alongside `created`. An `adopted` row
  can never erase anything, so stamping one would record a fact nothing reads and a future rule
  could misread as permission.
- `handleCreate` reads it *after* `adoptSiteDir` — before that there is no site there to have an
  identity.

### USER-VISIBLE BEHAVIOUR CHANGE — Leona rules on this

A `created` row written **before** this stamp existed carries no `siteId`, so **its delete now
removes the card and leaves the folder on disk.** That is the fail-closed direction (the alternative
is trusting precisely the rows this test exists to distrust), and it is not silent:
`buildProjectRecord` reports `deleteErasesFiles: false` for those rows, so the confirm overlay
promises a card-removal and delivers one. It self-corrects for every project created from here on.
If you would rather grandfather existing rows, say so and I will add a one-time stamp-on-first-read.

GREEN: 87/87 across `project-delete-guard.test.cjs`, `project-ipc.test.cjs`,
`project-registry.test.cjs`. Commit `8100de95`.

---

## D-05 — VERIFIED-AND-FIXED (High)

**Verified.** `handleStart` entered `deps.serializer.run(id, …)`; `handleDelete` never touched
`deps.serializer` — `serializer` appeared exactly once in the whole file. `openSiteServer`
(`main.cjs:569-576`) does `openSites.set` only *after* `await startSiteBackend(...)`, which waits for
the boot line up to `DEFAULT_READY_TIMEOUT_MS = 60_000`. During that window `openSites.get(id)` is
`undefined`, so the delete skipped the stop, untracked the row, and erased the directory the child
was booting in.

The reverse interleaving is real too and the report is right about it: `handleStart` validated the
tracked row **outside** the serialized function, so a delete landing between the check and the spawn
started a `tovu serve` for a path that had just been removed.

### RED (before the fix)

```
✖ handleDelete waits for an in-flight handleStart on the same site instead of rm-ing under it
  AssertionError: Expected values to be strictly deep-equal:
  + actual - expected
  -   'stopped'
    actual:   [ 'boot:started', 'boot:dir-present' ],
    expected: [ 'boot:started', 'boot:dir-present', 'stopped' ],
✖ handleStart refuses a project that was deleted while its start was queued behind the delete
  AssertionError: Missing expected rejection.
    actual: undefined, expected: /Unknown project/,
```

Honest note on that first one: the `boot:dir-ERASED` marker did **not** fire in the fake, because
`fsp.rm`'s syscall loses the race to a microtask resolution in a test where the "boot" is instant.
The deterministic proof of the defect is the **missing `stopped`** — the delete completed without
ever stopping the in-flight child. In production the boot takes seconds and the `rm` wins easily.

### Fix

- `handleDelete` now runs its whole body through `deps.serializer.run(id, …)` — the same key
  `handleStart` uses. Body extracted to `deleteProject(id, deps)` so the serialized region is one
  named thing.
- `handleStart` moved its tracked-row check **inside** the serialized region.

No `main.cjs` change was needed: `projectDeps` (`main.cjs:974`) already carries `serializer`.

GREEN: 33/33 `project-ipc.test.cjs`.
