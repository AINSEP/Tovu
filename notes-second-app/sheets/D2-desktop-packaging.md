# D2: packaging recipe and template for a second Electron app, proven on notes-desktop

## Revision 3 corrections (authoritative; over revision 2)

**Ownership (coordinator, 2026-11-16; `../INDEX.md` section 00).** This plan owns the devops Electron packaging recipe
for a second app (`packages/devops/src/packaging/electron/README.md` + template) and the packaged notes-desktop proof.
The desktop-extraction plan's D2 (which also wrote that recipe in its step 4) is **withdrawn**; its
`D2-notes-desktop.md` points here. **OD-N11 is the same question as the desktop plan's OD-6**, moved to this plan;
answer it once, here. **Collision:** desktop D1c2 also edits `packages/devops/package.json`
(`update-manifest-merge`): one run at a time on that file (`../INDEX.md` section 4); STOP (X4) if D1c2 has an open
branch at dispatch.

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 25: blocked on new owner decision OD-N11.** `node-toolchain` does not find a system Node: it builds shims
around a supplied **Electron** executable (`packages/desktop-host/src/node-toolchain/index.ts:55-77`). Running the
sidecar through those shims means Electron's Node ABI, which changes how the SQLite native module must be built and
staged (the plan's D6 assumed system Node). Do not start until `../INDEX.md` shows `OD-N11 … DECIDED:`. Delete the
step "prefer a Node found by node-toolchain".

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-d2-desktop-packaging`. Estimate: ~80k Sonnet.
Owner of the recipe: `@jini-ai/devops` (`packaging/electron`). Prerequisite: D1 merged. Closes G14.

## Inventory

```sh
ls packages/devops/src/packaging/electron; sed -n 1,60p packages/devops/src/packaging/electron/entry.ts
rg -n "^export" packages/devops/src/packaging/electron/{staging,staged-closure,staged-closure-node,optional-peers,policies}.ts | head -40
ls packages/devops/src/packaging/electron/__tests__ | head; ls packages/devops/*.md packages/devops/src/packaging/electron/*.md 2>/dev/null
rg -n "node-toolchain" packages/desktop-host/package.json; rg -n "^export" packages/desktop-host/src/node-toolchain/*.ts | head -20
node --version; node -e 'console.log(require("./package.json").engines)'
```

## Decisions fixed by this sheet

- The packaged app ships a **built** main (`dist/`) and a **staged server payload**: notes-app compiled to JS
  (`tsc` to `payload/server/`), notes-web `dist/` as `payload/web/`, and the production dependency closure
  of notes-app staged with the existing `staged-closure` helpers, **outside the asar** so the child Node can
  read it and so `better-sqlite3`'s `.node` file loads.
- The child runs under the Node the host names. Order of preference, stated in the recipe: a Node found by
  `@jini-ai/desktop-host/node-toolchain`; else Electron's own binary with `ELECTRON_RUN_AS_NODE=1` (then
  `better-sqlite3` must be rebuilt for Electron's ABI: the recipe gives the command and says when). The
  example uses the first and prints a clear message when no Node is found.
- Template values are host inputs: `appId`, product name, publish feed, entitlements. The template contains
  **no** `disable-library-validation`; `allow-jit` only with a comment on when it is needed. No signing or
  notarization secrets, no real feed URL.

## Deliverables

| File | Content |
|---|---|
| `packages/devops/src/packaging/electron/README.md` (or the package README section, whichever the package already uses for docs) | "Packaging a second Electron app": the 6 steps (build main, build renderer, compile server, stage closure, native modules, builder config), with the helper each step uses and the notes-desktop file that calls it. |
| `packages/devops/templates/electron-builder.template.yml` (published via `files`; add to `package.json` `files` only, no new export) | commented template with `<HOST: …>` placeholders. |
| `examples/notes-desktop/scripts/stage.ts` | calls the devops helpers to produce `payload/`; <= 120 lines; pure planning function `planPayload({ … })` unit-tested with a fake fs port from the helpers' own `ports.ts`. |
| `examples/notes-desktop/electron-builder.yml` | the template filled with example values (`appId: dev.jini.example.notes`). |
| `examples/notes-desktop/scripts/packaged-smoke.mjs` | `electron-builder --dir`, launch the unpacked app with a temp `userData`, same assertions as D1's smoke (create note, quit, relaunch, note present, no orphan child). |

## Tests first

1. `planPayload` : the staged closure list `toEqual` an inline literal of `@jini-ai/*` package names taken
   from N5's closure table (so a new dependency edge shows up here); native modules listed for unpacking
   contain `better-sqlite3` exactly once; a closure containing a path outside the workspace root is refused.
2. Template check (a small test in devops): the template parses as YAML, contains every placeholder the
   README names, and does **not** contain `disable-library-validation`, a GitHub owner/repo, or an `appId`
   without a placeholder (AP6: pin the security-relevant defaults).

## Steps (commit each)

1. Tests + `stage.ts`. 2. Builder config + `electron-builder` devDependency in the example (same major
   reference tooling uses, else latest stable; say which). 3. Packaged smoke. 4. README + template + changeset
   (`@jini-ai/devops` patch: docs/template only).

## Acceptance

devops gates; Jini repo gates; example-desktop gates; packaged smoke output pasted, or, if the environment
cannot run Electron/`electron-builder` (no display, no network for the Electron download), the exact
blocking error and the statement "packaged launch NOT proven" as the first line of the report. A packaged
launch that was not run is not reported as done.

## Not verified by the planner

Every devops packaging helper signature (only the file list was read); whether `electron-builder` is
already a workspace devDependency; Windows and macOS signing paths; whether notes-app compiles with plain
`tsc` output runnable by Node without type stripping (its imports use `.ts` extensions today: the compile
step needs `rewriteRelativeImportExtensions` or an equivalent, to be confirmed in step 1).
