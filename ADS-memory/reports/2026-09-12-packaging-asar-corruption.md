# Packaging a moving tree silently corrupts app.asar

**Date:** 2026-09-12
**Area:** `apps/desktop` packaging (electron-builder)
**Severity:** high — ships a signed, runnable-looking, broken application
**Status:** mechanism confirmed; no code fix landed (a verification step is RECOMMENDED below, not built)

---

## Summary

Running `electron-builder` while anything is writing into `apps/desktop` produces a **corrupt
`app.asar`**, and **nothing in the toolchain notices**. electron-builder exited 0, signed the
bundle with a valid Developer ID, and produced a `.dmg`.

A clean-looking success is exactly what this failure looks like.

---

## Mechanism

An `asar` archive is a JSON header of file entries — each an `{offset, size}` into one concatenated
data region — followed by that region. electron-builder walks the source tree to build the header,
then streams the file bytes into the data region.

If a file's size changes between those two passes, every entry positioned *after* it in the data
region is off by the delta. The header still says "this file is N bytes at offset X", and N bytes
are duly read at offset X — but those bytes now belong to a **different file**.

The corruption is therefore **length-correct and content-wrong**. That is precisely why nothing
downstream catches it:

- the archive is structurally valid, so `asar list` and `asar extract` both succeed;
- every file is present at its expected path and its expected length;
- code-signing hashes the corrupt bytes and signs them, happily and validly;
- the dmg builds and mounts.

The first signal is a *runtime* error, in whichever module happens to be read from a shifted offset.

---

## Concrete evidence

Build: `npx electron-builder --mac`, 2026-09-12 10:07–10:11, into `apps/desktop/release/`.
Concurrently: another agent was editing `apps/desktop/src/`, and a `vite build --watch` (PID 33943)
was rewriting `apps/desktop/dist/renderer/`. Files observed written during the pack window included
`main.js`, `src/project-ipc.js`, `src/renderer/*` and `dist/renderer/`.

**Extent — 21 of 30 files under `src/` were corrupt:**

```
CORRUPT: src/site-config.js          CORRUPT: src/sites-mcp-server.js
CORRUPT: src/site-process-registry.js CORRUPT: src/sites-mcp-tools.js
CORRUPT: src/tracked-sites.js        CORRUPT: src/quality-gates.js
CORRUPT: src/project-ipc.js          CORRUPT: src/shell-staleness.js
CORRUPT: src/site-supervisor.js      CORRUPT: src/selftest-tracker.js
CORRUPT: src/site-preview-store.js   CORRUPT: src/webview-guest-policy.js
CORRUPT: src/shutdown-tracker.js     CORRUPT: src/sites-mcp-registration.js
CORRUPT: src/runner-ipc-stubs.js     CORRUPT: src/tovu-server.js
CORRUPT: src/site-dir-store.js       CORRUPT: src/speech/speech-ipc.js
CORRUPT: src/speech/transcription-port.js
CORRUPT: src/speech/pcm-wav-encoder.js
CORRUPT: src/speech/mac-on-device-transcriber.js
src/*.js -> good=9 corrupt=21
```

**The length-correct/content-wrong property, demonstrated.** `src/tracked-sites.js` in the archive
is 20944 bytes — byte-for-byte the same *length* as the real source file — but holds the text of
`src/tovu-server.js`:

```
=== SHIPPED copy head ===
er applied
      // per chunk would echo whichever half arrived first.
      let pending = "";
...
=== sizes: source vs shipped ===
   20944 src/tracked-sites.js
   20944 shipped-tracked-sites.js
```

That comment string lives at `apps/desktop/src/tovu-server.js:578`. The source file on disk was
intact and unmodified in git throughout — the corruption exists only inside the archive.

**Resulting runtime failure**, running the packaged MCP bridge directly:

```
file:///.../Tovu.app/Contents/Resources/app.asar/src/tracked-sites.js:1
er applied
   ^^^^^^^
SyntaxError: Unexpected identifier 'applied'
CHILD_RC=1
```

**Control — the same command against a quiet tree is clean.** Two separate `--mac dir` builds run
while `apps/desktop` was idle verified **30/30 files byte-identical to source**, `bin/mcp-bridge.mjs`
included. Same config, same machine, same command; the only variable was whether the tree was moving.

---

## Why this is severe

There is **no failure signal anywhere in the toolchain**:

| Signal | What it said |
|---|---|
| `electron-builder` exit code | `0` |
| Code signing | succeeded, `Developer ID Application: Leon Aburime (4M96Y556JM)` |
| Artifact produced | `release/Tovu-0.1.0.dmg`, 264 MB, valid and mountable |
| `asar list` / `asar extract` | both succeed, every path present at the right size |

A build engineer, a CI log, and a release checklist would all read this as a successful build. The
only way to discover it is to run the app and hit whichever module landed on a shifted offset.

**User-facing symptom, in product terms.** The corrupt module here was on the MCP bridge's import
path, so the bridge died at startup. For the operator that renders as: **every time you open a site,
the app stalls for 15 seconds, and then the assistant simply does not have its desktop tools** — no
error dialog, no log the operator would find, nothing naming a cause. Which module gets corrupted is
essentially arbitrary, so a different pack of the same tree would present as a different, equally
unexplained defect.

---

## How to detect it

Do not trust the build. Verify the artifact:

```sh
cd apps/desktop
npx asar extract release/mac/Tovu.app/Contents/Resources/app.asar /tmp/asar-x
for f in $(cd src && find . -name '*.js' -not -name '*.test.js' | sed 's#^\./##'); do
  cmp -s "src/$f" "/tmp/asar-x/src/$f" || echo "CORRUPT: src/$f"
done
```

Silence means clean. Note that a size comparison alone would NOT catch this — the sizes match. Only
a content comparison works.

---

## Precondition for a valid build

`apps/desktop` must be **quiet** for the whole pack:

- no `vite build --watch` running (check `pgrep -f "vite build --watch"`);
- no agent or human editing `apps/desktop/src/`;
- no concurrent `npm run build` writing `apps/desktop/dist/`.

This is not a theoretical hygiene rule — it is the single variable that separated the corrupt build
from the two clean ones on the same day.

Related but distinct: `scripts/stage-payload.mjs`'s staleness guard already refuses a stale
`apps/admin/dist` or `apps/site-chat/dist`. It correctly refused once during this session when
another agent wrote `apps/admin/src/lib/api.ts` mid-run. That guard protects the *payload*'s
freshness; it does nothing about the *shell*'s asar integrity, which is a different failure.

---

## Recommendation (NOT built)

Add a **post-pack verification step** that extracts the freshly built `app.asar` and `cmp`s its
`src/`, `bin/` and `main.js` against the source tree, failing loudly on any mismatch.

**The existing gate harness is the wrong home for it, structurally.** `package.json`'s script is:

```
"package": "npm run gates && npm run build && npm run stage && electron-builder --mac"
```

`npm run gates` runs *first*, before the artifact exists — a gate in `quality-gates.json` cannot
inspect an asar that has not been built yet. The verification has to be a **new final step appended
after `electron-builder`**, e.g. a `scripts/verify-package.mjs` invoked as the last link in that
chain, so a corrupt pack fails the `package` command rather than producing a signed artifact.

Two properties it should have, both learned from this incident:

1. Compare **content**, never size — size comparison cannot detect this class at all.
2. Fail with a non-zero exit, not a warning. `shell-staleness.js`'s own header already records why:
   a check that runs, finds the problem, and reports success is the failure class this harness
   exists to end.

---

## What this did and did not invalidate

The corrupt build was produced at 10:07–10:11 and condemned at 10:14. The federation verification
that proved the packaged MCP launcher works ran at **10:02:34**, nine minutes earlier, against a
**different output directory** (`release-bin-probe/`, not `release/`), whose integrity was
independently confirmed at the time by extracting `src/tracked-sites.js` and `cmp`-ing it against
source. It was subsequently re-confirmed at 10:19 on a third, independently verified clean build
(30/30 byte-identical), including with the process cwd set to `/`.

So no conclusion drawn about federation rests on the corrupt artifact.

The direction is worth stating explicitly, because it is easy to get backwards: **the corrupt build
produced a FAILURE, not a false pass.** Its bridge died at import with a `SyntaxError`, which
presents as a federation failure when it is really an asar failure. The hazard in this incident was
a false negative about working code — not a false green about broken code.

---

## Related

- `a0e4edaa` — `fix(desktop): ship bin/ in the packaged app, so the MCP launcher has a bridge to
  exec`. A separate, real packaging defect found the same day: `electron-builder.yml`'s `files:`
  list omitted `bin/`, because electron-builder prepends its permissive default **only** when the
  list is empty or contains nothing but negations (`app-builder-lib/out/fileMatcher.js:120-122`), so
  the first positive pattern silently makes the list exhaustive.
- `apps/desktop/src/shell-staleness.js` — the payload-freshness guard, and prior art for the "a
  check that reports success is the real failure" principle.
