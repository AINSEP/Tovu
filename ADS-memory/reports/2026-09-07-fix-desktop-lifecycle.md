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

**Every one of the seven was CONFIRMED against source. None was refuted.** All seven are fixed,
each with a RED capture taken before its fix, without reverting the shared working tree.

| ID | Sev | Verdict | Commit | Where |
|---|---|---|---|---|
| SEC-01 / D-04 | High | VERIFIED-AND-FIXED | `8100de95` | `project-delete-guard.cjs`, `project-registry.cjs`, `project-ipc.cjs` |
| D-05 | High | VERIFIED-AND-FIXED | `6831f683` | `project-ipc.cjs` |
| D-06 | Med | VERIFIED-AND-FIXED | `79ab57fc` | new `site-supervisor.cjs`, `tovu-server.cjs`, `main.cjs`, `project-ipc.cjs` |
| D-07 | Low | VERIFIED-AND-FIXED | `79ab57fc` | `site-registry.cjs`, `main.cjs`, `project-ipc.cjs` |
| D-01 | Med | VERIFIED-AND-FIXED | `3bbbb551` | `site-dir-store.cjs`, `project-registry.cjs`, `main.cjs` |
| D-03 | Med | VERIFIED-AND-FIXED | `516dc010` | `renderer/App.hooks.ts`, `renderer/App.tsx` |
| D-02 | Med | VERIFIED-AND-FIXED (one product call left open) | `516dc010` | `project-ipc.cjs`, `renderer/CreateWebsiteOnboarding.tsx` |

### Evidence

- **293/293** across all 21 `apps/desktop` test files (explicit paths, one process). 278 before this
  work started; 15 net new tests, no test deleted or weakened.
- `tsc` clean on **both** desktop projects (`tsconfig.preload.json --noEmit`, `tsconfig.renderer.json`).
  It says nothing about the `.cjs` files, which is why every `.cjs` change is pinned behaviourally.
- **Complexity: zero errors at this repo's ceiling of 9** across every file touched
  (`npx eslint <10 changed files> --rule '{"complexity":["error",9]}'`). The repo's own config only
  applies that ceiling to `apps/admin/src/**` and does not cover `.cjs` at all, so it was forced
  explicitly. Lint warnings on `App.hooks.ts`: **9 before, 9 after, the identical set** — verified by
  linting the pre-change file from `3bbbb551` side by side. Nothing new introduced.

### Scope note

D-02 and D-03 have no `.cjs` surface whatsoever — D-03 is entirely renderer, D-02's honest fix is
renderer plus one `.cjs` boundary check. I read the dispatch's "nothing outside that directory" as
`apps/desktop/` and the `.cjs` emphasis as descriptive, since both findings were explicitly assigned
to me. Neither file collides with the two agents in `apps/website/src` and `apps/admin`. Flagged to
the lead in flight rather than blocking on it.

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


---

## D-06 — VERIFIED-AND-FIXED (Medium)

**Verified.** `tovu-server.cjs`'s only `exit` listener fed the single-settle `finish()`, which is a
no-op once the boot line has already resolved the promise. Nothing in the process observed a
POST-ready exit. Confirmed the report's reading of every consequence:

- `openSites` (a bare `Map`) kept the dead entry;
- `buildProjectRecord` kept reporting `status: "running"` and the dead child's port;
- `openSiteServer` (`main.cjs:569-576`) returns `already.server` whenever the key is present, so
  "Start site" handed the corpse back and spawned nothing — wedged for the session;
- `useProjectsPolling`'s header comment ("a site can crash … so re-poll on an interval") is a **false
  comment**: it re-read a map that could not change. Now true.

### RED

```
✖ startTovuServer's handle reports the child's exit AFTER boot, which is the signal D-06 had none of
  TypeError: handle.onExit is not a function
✖ startTovuServer's onExit replays an exit that already happened before the listener attached
  TypeError: handle.onExit is not a function
✖ a crashed project is reported stopped, with a statusDetail saying why
  actual: null, expected: "The site's server exited (code 1)."
✖ a killed project reports its signal rather than an exit code
  actual: null, expected: "The site's server was stopped by SIGKILL."
```

### Fix

1. `startTovuServer`'s handle gains `onExit(cb)`. It **replays**: the capture is registered
   immediately after `spawn`, before any `await`, so a child dying in the gap between the promise
   resolving and a supervisor attaching is still reported. A plain `child.once("exit", …)` attached
   later would miss it and wedge the entry "running" for the whole session — the exact state being
   fixed.
2. New `src/site-supervisor.cjs`: `openSites` becomes a **Map-compatible** store (`get`/`set`/`has`/
   `delete`/`values`/`size` unchanged, so every call site and every test injecting a plain `Map`
   still works) that watches each entry's child and removes an entry whose serve has died.
   **Entry-object identity, not site dir**, decides whether an exit is still about what is held — a
   late reap from a replaced child must never evict its healthy successor.
3. `ProjectRecord.statusDetail` now distinguishes "crashed" from "never started".

Deliberate closes were **not** taken over. `handleDelete` and the window `closed` listener already
drop the entry and the row themselves, in an order their own comments justify; rewriting two working
paths to fix a third is how the file got gutted last time. The module owns exactly the transition
that had no owner.

`site-supervisor.test.cjs` runs every behavioural case **twice** — against the supervisor and against
a plain `Map`, the pre-fix shape with nothing else changed. That paired baseline is what stops any
assertion there being vacuous, and the `Map` arm pins D-06 by asserting the old shape keeps the
corpse.

### KNOWN LIMIT — stated, not hidden

In **own-server mode** a crashed site's `BrowserWindow` is left open showing a dead page rather than
destroyed. Destroying it would fire `window-all-closed` and **quit the app** when the only open
site's server dies — a worse outcome than a stale window. Consequence: reopening that site now
spawns a fresh server in a second window instead of focusing a permanently dead one. Fleet mode (the
default, and where the finding was reported) has no per-site window and is unaffected.

---

## D-07 — VERIFIED-AND-FIXED (Low, fixed as part of the same rework)

**Verified.** `recordSiteOpened` did `[row, ...sites.filter(existing => existing.siteDir !== row.siteDir)]`
— an unconditional replace. `isOrphanedProcess`'s own doc already established that two Electron
instances can run at once (no `requestSingleInstanceLock`), and `reconcileOrphans` had been taught to
RETAIN a live sibling's row. The write path was left on the old rule. Fix landed in one arm, sibling
left — the night's dominant pattern.

### RED

```
✖ recordSiteOpened keeps a LIVE sibling instance's row for the same site instead of replacing it
  AssertionError: the live sibling's child must still be recorded and therefore still reapable
    actual: false, expected: true,
✖ recordSiteClosed narrowed by pid drops only that child's row, not a sibling's for the same site
    actual: [], expected: [ 47929 ],
```

Both drive a REAL child process (`spawnFakeServeChild`), following this file's stated convention —
the identity proof reads live argv, so only a process the OS really knows about can test it.

### Fix

`recordSiteOpened` displaces a same-`siteDir` row only once it is **proven dead**, using the same
identity proof (`isServeProcessForSite`) reconciliation makes before killing anything — so a pid the
OS recycled never counts as live and rows cannot accumulate. Two rows for one `siteDir` therefore
mean what they say: two `tovu serve` children really are running over that `content.db`. That is its
own problem (two sqlite writers, pre-existing and out of scope), but recording it truthfully is
strictly better than recording one and losing the other.

Since two rows are now legitimate, `recordSiteClosed` takes `options.pid`, and **all four call sites
pass it** (`main.cjs`'s catch path, the window `closed` listener, the supervisor's unexpected-exit
callback, and `project-ipc.cjs`'s delete). Closing by `siteDir` alone would wipe the sibling's row and
reintroduce D-07 from the close side. Omitting the pid keeps the old drop-all behaviour, so no
existing call site changed meaning silently.

---

## D-01 — VERIFIED-AND-FIXED (Medium). Architecture's "wider than codex stated" is correct: **four** call sites, not one

`classifySiteDir` was written for one folder the operator picked in a dialog, where throwing is
right — the picker catches it and shows them why. It was reused unchanged as the filter predicate of
two bulk scans. Confirmed all four unguarded paths, all inside `app.whenReady().then(...)` whose only
handler is `.catch(reportBootFailure)`, all before `openFleetWindow()`:

1. **`existingRecentSiteDirs`** — no guard at all, and it is `projectDeps.recentSiteDirs`, the thunk
   `rescanProjects` calls. The guard inside `discoverSiteDirs` is therefore dead for every known dir.
2. **`discoverSiteDirs`** — its guard *reads* like one and is not: `throwIfNoEntry` suppresses
   **ENOENT alone**, so `statSync` itself still raises EACCES/ELOOP. The guard's own line was one of
   the throws.
3. **`seedDevFallbackProject`** — runs one line before `projectDeps` is built.
4. **`resolveDevFallback`** — own-server mode's `resolveStartupSiteDirs` runs it in the same chain.
   Not in the original finding; found by reading.

### RED — every one a real error escaping to the caller

```
ENOTDIR: not a directory, scandir '.../was-a-site-now-a-file'          (existingRecentSiteDirs)
ENOTDIR: not a directory, scandir '.../sites-tovu-com-is-a-file-now'   (resolveDevFallback)
ELOOP: too many symbolic links encountered, stat '.../loop-a'          (discoverSiteDirs)
EACCES: permission denied                                              (discoverSiteDirs, injected)
ENOTDIR: not a directory, scandir '.../not-a-dir'                      (seedDevFallbackProject)
TypeError: classifySiteDirSafely is not a function
```

The fixtures are deliberately root-proof: a plain **file** where a directory is expected (ENOTDIR)
and a **symlink cycle** (ELOOP), not `chmod 000`, which behaves differently as root.

### Fix

`classifySiteDirSafely` returns `"unreadable"` in place of the throw; the picker path keeps
`classifySiteDir`. Both list filters and both single-candidate boot checks use the safe form.

Two things worth recording because they were nearly wrong:

- I first guarded `seedDevFallbackProject` with `isDiscoverableSite`, which adds a real `statSync`.
  **Six of its existing tests failed** — its classifier is injected precisely so the seeding decision
  can be tested without a folder on disk, and I had broken that contract to fix a throw. Split into
  `classifiesAsSite` (throw-guard only) and `isDiscoverableSite` (throw-guard + `statSync`).
- **The unwired call site the new verdict creates**: `describeRejectedDefault` (`main.cjs`) does
  `rejectedDefault.missing.join(...)` unconditionally once past `"empty"`, and the `"unreadable"` arm
  carries no marker list — it would have thrown on `undefined` while building the very dialog meant
  to explain the problem. Handled before that read, and pinned by a wiring test.

One existing wiring test pinned the seed call's exact classifier argument while being about the
*directory*; its regex now accepts either form, since the argument is pinned by its own new test.

---

## D-03 — VERIFIED-AND-FIXED (Medium)

**Verified exactly as reported.** Deps `[webviewRef, resetKey]`, early return on
`webviewRef.current === null`, and `ProjectWorkspace` renders `<webview>` only when
`running && !failed`. A ref object is stable for the component's whole life, so neither dep changed
on the two ordinary paths that mount a guest. The hook was right in form and wrong in binding: its
own doc says the listeners "must move with" the node, and nothing in its inputs changed when the node
appeared.

### Fix

The node arrives through `guestRef`, a **callback ref backed by state**, so the effect's lifetime IS
the node's.

The reset is deliberately a **second effect keyed on `resetKey` alone**. Folding it back into the
node-keyed effect looks tidier and reintroduces a worse bug: `failed` going true unmounts the guest,
which fires `guestRef(null)`, which would re-run a combined effect and clear the very flag that
unmounted it — guest remounts, fails again, panel flickers forever. That trap has its own test, so a
future tidy-up cannot land it silently.

### Test-method note

`apps/desktop`'s test script is `node --test "src/**/*.test.cjs"` — the renderer's `.ts`/`.tsx` has
**no runner in this package**, and both D-02 and D-03 type-check perfectly, which is why they
survived. New `src/renderer/webview-failure-wiring.test.cjs` is a source-text wiring guard following
`rescan-wiring.test.cjs`'s stated precedent. I did **not** add a React test framework: that is a
coverage-expansion decision for Leona, not mine to take mid-task. If you want real behavioural
coverage of these hooks, that is the ask, and it is a separate piece of work.

---

## D-02 — VERIFIED-AND-FIXED (Medium), with one product call left open

**Verified, including the architecture's addendum**, which makes it worse than "silently discarded":
`computeCanCreate` gates on `supabaseReady`/`customReady`, so choosing Supabase **forces** the
operator to type a project URL and an API key before the button enables — and `handleCreate` reads
only `input.displayName` while `buildProjectRecord` hard-codes `{kind: "sqlite"}`. They are made to
type a credential that is thrown away, and told it succeeded.

### RED

```
✖ handleCreate refuses a hosted-database choice instead of quietly making a SQLite site
  AssertionError: a "supabase" choice must be refused, not silently narrowed
```
plus two renderer wiring assertions.

### Fix

- `handleCreate` **refuses** a non-`sqlite` kind with an operator-facing message, **before the folder
  dialog opens** — nobody should pick a folder for a site that was never going to be made. An absent
  `database` is still sqlite; omitting it is not a claim about a provider.
- The two options are **shown and disabled**, with the reason on the card, using `disabled` on the
  radio rather than styling alone (a control that only *looks* disabled is still keyboard-selectable).
  A disabled radio cannot be chosen, so the vendor field blocks never render and no credential is
  ever requested.

### PRODUCT CALL FOR LEONA

The audit's preferred seam is **dropping `database` from the desktop's `CreateProjectInput`
entirely**. That deletes a signposted future capability from the onboarding flow — a roadmap
decision, not a defect fix — so I made the form honest without making that choice for you. If you
want the full removal (contract type, picker, vendor fields, `computeCanCreate`'s two arms,
`buildCreateProjectInput`'s packing), it is a small, contained follow-up.

---

## User-visible behaviour changes — all four, for Leona to rule on

1. **A pre-existing `created` project's delete no longer erases its folder** (SEC-01). Those rows
   carry no site-identity stamp, so the guard fails closed. Not silent: `deleteErasesFiles` is
   `false` for them, so the confirm overlay promises a card-removal and delivers one. Self-corrects
   for every project created from here on. The alternative is a one-time stamp-on-first-read that
   grandfathers existing rows — I did not do it because it trusts exactly the rows the check exists
   to distrust.
2. **A crashed site now shows as stopped** with a reason on the card, and "Start site" spawns a fresh
   server instead of returning the dead one (D-06). This is the fix, but it is a visible change: a
   tab that used to sit there claiming "running" will now say it stopped.
3. **Supabase and Custom DB are visibly disabled** in the create-website form (D-02).
4. **Own-server mode leaves a crashed site's window open** rather than closing it — see the D-06
   known limit above for why closing it would quit the app.

## What I did NOT do, and why

- **`main.cjs` was not restructured into boot modules.** §4.5 recommends it and the recommendation is
  sound, but it is a different task, it is exactly the change that gutted the file once already
  (`15548bef`), and `tsc` cannot check `.cjs` — a large blind move there has no guard at all. I
  extracted the one seam the lifecycle findings need (`site-supervisor.cjs`) and left the other ~1,000
  lines alone.
- **The three-JSON-files problem (§1's holders #3/#4/#5) is untouched.** Collapsing
  `open-sites.json`, `desktop-projects.json` and `desktop-state.json`'s MRU into one source of truth
  is a real finding and a real piece of work; none of D-01..D-07 requires it, and each file's header
  documents why it exists separately.
- **No `requestSingleInstanceLock` was added.** D-07 is fixed by making the registry tolerate two
  instances truthfully, which is what the codebase already chose (`isOrphanedProcess` exists *because*
  two instances can run). Adding a lock now would be a product decision that changes how the app
  starts.
- **No React test framework was added** — see the D-03 test-method note.

## Test invocation used

One process, explicit file paths, never a directory or glob:

```
cd /Users/la/Programming/Tovu/apps/desktop && node --test \
  src/desktop-auth.test.cjs src/keyed-serializer.test.cjs src/main-project-wiring.test.cjs \
  src/main-speech-wiring.test.cjs src/preload/preload.test.cjs src/project-delete-guard.test.cjs \
  src/project-ipc.test.cjs src/project-registry.test.cjs src/renderer/rescan-wiring.test.cjs \
  src/renderer/webview-failure-wiring.test.cjs src/runner-ipc-stubs.test.cjs \
  src/selftest-tracker.test.cjs src/site-dir-store.test.cjs src/site-registry.test.cjs \
  src/site-supervisor.test.cjs src/speech/mac-on-device-transcriber.test.cjs \
  src/speech/pcm-wav-encoder.test.cjs src/speech/preload-speech.test.cjs \
  src/speech/speech-ipc.test.cjs src/speech/transcription-port.test.cjs src/tovu-server.test.cjs
```

No delete test ever pointed at a real site directory; every one uses a fresh `mkdtemp` scratch dir.
`sites/tovu-com/` was read only (`cat` of its two marker files) and never opened as a database.


---

# DS-01 — desktop session validity (added after the original seven, authorized separately)

Routed by Agent C, dispatched by the lead. **VERIFIED-AND-FIXED (validity half). One half reported
and deliberately NOT fixed — see DS-01b.**

## Verified, not inherited

- `desktop-auth.cjs` `hasActiveSessionCookie` is `cookies.length > 0` — presence, not validity.
- `startSiteBackend` passed `emitBootToken: !alreadyAuthenticated` and skipped the redeem entirely.
- **C's addition is correct and is the part the original audit missed**: `endSiteSession` has exactly
  ONE production call site (`main.cjs`, `openSiteWindow`'s `closed` listener). `openSiteServer` — the
  `<webview>` path, which is the *default* UI — never calls it, and its own comment says "Nothing
  here ever closes what it opens." So a fleet site's stale cookie survives every relaunch.
- I verified `/api/admin/v1/auth/me` really answers **401** unauthenticated
  (`apps/website/src/server/inbound/admin-http/dev-auth.ts:429-433`) before building a probe on it. A
  route answering `200 {user: null}` would have made the probe worthless — a check that tolerates the
  bug it is meant to catch.

**A false comment, now corrected.** `hasActiveSessionCookie`'s doc claimed a stale cookie "fails
exactly like a missing one: the ordinary login screen shows". It does not: this shell passes no
`desktopCredential` (`startSiteBackend` never sets it), and the only recovery is wired to a path
fleet mode never reaches.

**SEVERITY CORRECTED — I overstated this, and the correction is on the record.** My first write-up
called it "a lockout with no in-app exit". That is wrong, and I had inferred it rather than traced
it. The shell passing no `desktopCredential` does not mean no credential exists: the SITE's own
seeding decides, and `apps/website/src/features/identity/wiring.ts:126` falls back to
`DEFAULT_OWNER_PASSWORD` (`wiring.ts:62`) when `TOVU_ADMIN_PASSWORD` is unset — verified directly,
not taken from the two agents who reported it. `@jini-ai/cms`'s identity seed early-returns for an
existing owner, so it is never rotated. A working credential therefore exists.

The accurate claim: **not a hard lockout, still a real bug.** A stale cookie blocks the boot-token
path and forces a manual login the operator should never have needed, using a build-time default
this app has never shown them — on a site the app itself just opened. I had also written the
overstated version into four source comments (`desktop-auth.cjs` x3, `main.cjs` x1); all four are
corrected, since a false comment in the fix for a false comment is the worst possible outcome.

## Sink audit — as asked

| Path | Opens a session? | Clears it? |
|---|---|---|
| `openSiteWindow` → `startSiteBackend` (own-server) | yes | **yes** — `window.on("closed")` |
| `openSiteServer` → `startSiteBackend` (fleet, default) | yes | **no** — by design, nothing stops a tab |
| operator logs in inside the admin | yes (not shell-minted) | no |
| `deleteProject` (`project-ipc.cjs`) | — | **no** |
| `before-quit` | — | **no** |
| `openSiteWindow`'s `createWindow`-threw catch | — | **no** |
| supervisor unexpected-exit | — | n/a (child already dead) |

**One of five deliberate paths clears a session. In fleet mode, none do.**

## The root cause is an ORDERING problem, which is why the obvious fix does not work

C proposed probing `/auth/me` before deciding `emitBootToken`. That cannot work: `emitBootToken` is a
**spawn argument**, decided before any server exists to probe. And because it was decided from the
jar, a wrong guess could never be revised — no token had been minted, leaving only a login form
for a password this shell never issued.

Inverted it instead: **always emit, decide after the server answers.** An unnecessary token is inert
(single-use, process-scoped, never written to disk, dies with the child). What stays conditional is
the **redeem**, which is what creates a 30-day session and what left 713 live rows.

- `hasValidSession` — cheap cookie negative first (a new partition should not pay a round trip that
  could only answer 401), then `GET /auth/me` with `useSessionCookies: true`. Without that flag the
  probe asks anonymously, always reports 401, and would redeem on every open — rebuilding the exact
  pile-up this mechanism exists to prevent. Pinned by a test.
- `ensureSiteSession` — the decision `main.cjs` made inline, **extracted** so it is covered
  behaviourally (4 tests) instead of by grep. This matters for the evidence-quality question below.

## RED

```
hasValidSession is not a function          (5 tests)
ensureSiteSession is not a function        (4 tests)
5 main.cjs wiring assertions
```

One self-inflicted RED worth recording: my first `fakeSession` helper collided by name with an
existing one in the same file, and **function hoisting made the later declaration win**, breaking two
previously-passing tests. Reused the existing helper rather than adding a second.

GREEN: **307/307**, full suite, 22 explicit test files. Zero complexity errors at 9 on both changed
files. Commit `5e3651f1`.

## Evidence quality — flagged as the lead asked

The `main.cjs` half is pinned by **source-text wiring guards only** (`src/main-auth-wiring.test.cjs`),
because `main.cjs` imports `electron` at module scope and cannot be `require`d under `node --test`.
I reduced that exposure rather than accepting it: the load-bearing decision was extracted into
`desktop-auth.cjs`, where it has real behavioural tests against fakes. What the wiring guard still
covers by text alone is the *call order* — that `ensureSiteSession` runs after `startTovuServer` and
is handed this site's own partition and admin URL.

That is the residual gap, stated plainly for the React-runner decision: a change that keeps the call
shape but breaks the ordering would pass. No `.tsx` was touched by this fix.

## DS-01b — REPORTED, NOT FIXED (deliberate)

The forced-login defect is fully closed by the probe: a stale cookie is now detected and a fresh
token redeemed,
whether or not the cookie was ever cleared. What remains is **session hygiene** — fleet-mode sessions
are never revoked, so 30-day rows accumulate one per site open, which is the original 713-row problem
resurfacing on the default path.

I did not fix it, and the reason is a real risk rather than scope timidity. The natural fix is calling
`endSiteSession` from `before-quit`, but that adds an HTTP round trip per open site to the quit path,
and `net.request` here has **no timeout** — `endSiteSession` resolves on error but a hung connection
never errors, so an unresponsive child would hang the quit indefinitely. `before-quit` already
`preventDefault()`s and waits. Making that safe needs a bounded race, which is a design decision about
the shutdown path that I should not take unilaterally at the end of a task.

Recommended shape, if you want it: give `endSiteSession` an explicit timeout and call it from
`before-quit` and from `deleteProject` (the latter needs `net`/`session` threaded through
`projectDeps`, consistent with that module's deps-injection convention). Note `deleteProject`'s leak
is narrower than it looks — for a `created` project the whole `content.db` is erased, taking the
session row with it; only an `adopted` project leaks.
