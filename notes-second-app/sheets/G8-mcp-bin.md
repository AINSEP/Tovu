# G8: `@jini-ai/mcp` resolves its own bin

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 23: this sheet is withdrawn.** `@jini-ai/mcp` already exports `./bin` (`packages/mcp/package.json`,
`exports["./bin"]` → `dist/bin/serve.js`). N3 resolves it with `fileURLToPath(import.meta.resolve('@jini-ai/mcp/bin'))`.
No package helper is added. Do not dispatch. (Gap G8 is closed as "not a gap".)

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g8-mcp-bin`. Estimate: ~40k Sonnet.
Owner: `@jini-ai/mcp`. Prerequisite: N3 merged.

## Inventory

```sh
cat examples/reference-web/src/mcp-bridge.ts examples/reference-web/src/mcp-bridge.test.ts | head -130
cat examples/notes-app/src/gaps/mcp-bin.ts
node -e 'const j=require("./packages/mcp/package.json");console.log(j.bin,j.exports["./bin"],j.jini.entries)'
rg -n "mcp-bridge|resolveJiniMcpBridge|mcp-bin" examples packages -l -g '!**/node_modules/**'
rg -n "serve\.js|jini-mcp" ../Tovu/apps ../Tovu/packages -g '!**/__tests__/**' | head -5      # how Tovu finds the bin today (report only)
```

Expected: reference-web hard-codes `packages/mcp/dist/bin/serve.js` under a `repoRoot`; `bin` is
`./dist/bin/serve.js`.

## Target

New file `packages/mcp/src/bin-path.ts`, exported from the package root (node entry):

```ts
export type JiniMcpBinResolution =
  | { readonly ok: true; readonly command: string; readonly args: readonly string[] }
  | { readonly ok: false; readonly missingPath: string };
export function resolveJiniMcpBin(
  required: { readonly nodePath: string },
  optional?: { readonly moduleUrl?: string; readonly fileExists?: (path: string) => boolean },
): JiniMcpBinResolution;
```

It resolves `bin/serve.js` **relative to the package's own built module** (`new URL('./bin/serve.js',
optional.moduleUrl ?? import.meta.url)`), so it works from a workspace link, a packed tarball and an installed
copy alike. No `process.cwd()`, no repo-root argument, no lazy import. The daemon URL stays the caller's
(it is not part of locating a file). If the root entry is universal (`jini.entries["."]`), put the function
behind a node subpath instead (`./bin-path`) and say so.

## Tests first

`moduleUrl` in a temp dir with a `bin/serve.js` file -> ok, `args[0]` is that absolute path, `command` is
`nodePath`; without the file -> `{ ok:false, missingPath }` naming the expected path; `fileExists` fake
throwing -> `{ ok:false }` (no throw); a `moduleUrl` with spaces and `%20` round-trips to a real path.
Packed check: `pnpm --filter @jini-ai/mcp pack` then assert the tarball listing contains `dist/bin/serve.js`
and `dist/bin-path.js` (run in the package test only if other packages already test their tarball; else
do it once by hand and paste the listing).

## Steps (commit each)

1. Function + tests + export + changeset (`@jini-ai/mcp` minor). 2. reference-web: `mcp-bridge.ts` calls it
   (keeps its `daemonUrl` composition; its tests updated only where they asserted the repo-relative path).
3. notes-app: `assistant.ts` calls it; delete `src/gaps/mcp-bin.ts`, its test and its `GAPS.json` row.

## Acceptance

mcp gates; Jini repo gates; reference-web and notes-app gates; N5 packed-tarball boot still prints
`NOTES_PACKED_BOOT_OK` (this is the case the old resolver could not serve). Deletion ledger.

## Not verified by the planner

The built layout (`dist/bin-path.js` next to `dist/bin/serve.js`): confirm from `tsconfig` `rootDir/outDir`
before fixing the relative URL; the runtime label of the root entry.
