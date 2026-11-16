# audit:D12 ports + env file -> `@jini-ai/devops/local-dev` (MV-local-dev-1 = T-MOVE, DD-local-dev-2 = T-DEDUPE)

Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092 (unattended planning run; nothing executed).
untangle_overlap: none (no `*.repoint.tsv` row names `development/scripts/{free-port,port-listeners,load-repo-root-env,dev,dev-desktop,start,dev-server}.mjs` or `packages/devops/src/local-dev/**`; no `wave-b/*` branch touches `packages/devops`).
Tier: Sonnet 5.5 high, ~35k + ~25k.

## Decision that shapes both slices: the three Tovu `.mjs` files STAY as bindings (not deleted)
- `development/scripts/__tests__/desktop-portable.unit.test.ts:19-20` and `__tests__/unit/af-cli-characterization.unit.test.ts:278-298` copy `dev.mjs` / `dev-desktop.mjs` into a temp root and WRITE STUBS at `development/scripts/{free-port,load-repo-root-env,port-listeners}.mjs` (e.g. `pickFreePort = () => null`, `listenersOn = () => { throw Error("unexpected preflight") }`). Those files are the launchers' test seam. Deleting them and importing `@jini-ai/devops/local-dev` directly would make the launcher tests probe real ports / spawn real `lsof` (desktop-portable's `pickFreePort => null` path would no longer be taken). So each file keeps its Tovu API (positional, as its 8 callers use it) and becomes a binding: Tovu policy (the `.env` filename, the `lsof` command line, the sync contract) + one call into Jini. This is not a COMMON rule-19 forwarder: each body supplies host values the Jini function requires.
- Jini's `listenersOn` is **async** with a `ProcessRunnerPort`; Tovu's is **sync** (`dev.mjs:159` inside the sync `preflight()`, `dev-desktop.mjs:493`). Converting the launchers to async is out of scope (and would ripple into `preflight` callers). Tovu keeps its sync `spawnSync` lookup and dedupes only the parser (`parseLsofListeners`).

---

## MV-local-dev-1: `pickFreePort` / `isPortFree` -> Jini (new), Tovu `free-port.mjs` -> binding

```
id: MV-local-dev-1
feature: audit:D12 development/scripts (ports + env file)
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
tovu_files:
  - development/scripts/free-port.mjs | blob 7b4836284aa71644f7923a4627552cdac02fbf29 | reduce-to-binding
jini_guards:
  - packages/devops/src/local-dev/index.ts | blob c94078c97b0c13db07fe5f833428234ed0b8f74b
  - packages/devops/src/local-dev/free-port.ts must not exist
  - packages/devops/src/local-dev/__tests__/free-port.test.ts must not exist
  - rg -n "pickFreePort|isPortFree" packages/devops/src -> prints nothing
jini_new_files: packages/devops/src/local-dev/free-port.ts, packages/devops/src/local-dev/__tests__/free-port.test.ts
exports: packages/devops/src/local-dev/index.ts gains `export { isPortFree, pickFreePort, LOOPBACK_HOSTS } from './free-port.js';` (after l.4). Subpath `./local-dev` already exists with runtime `node` (package.json l.28): no exports/jini.entries change. README l.21 row text -> "Environment-file, listener lookup and advisory free-port helpers with host-supplied paths/commands."
deps: node:net only (built-in; `node` entry). No new npm dependency.
changeset: .changeset/devops-local-dev-free-port.md -> `"@jini-ai/devops": minor` | "`@jini-ai/devops/local-dev` exports `pickFreePort`, `isPortFree` and `LOOPBACK_HOSTS`: an advisory dual-loopback free-port scan for dev launchers."
importers: none change (all 4 import the Tovu binding: dev-desktop.mjs:88, development/e2e/support/isolated-journey-site.ts:5, bug-pin-fixtures.ts:10, __tests__/dev-desktop-admin-port.test.mjs:5)
```

### J1 NEW `packages/devops/src/local-dev/free-port.ts` (exact)
```ts
/**
 * @file Advisory free-port scan for development launchers.
 *
 * A probe is a hint, not a reservation: another process can take the port between the probe and
 * the real bind. Pair it with a strict bind that fails loudly; for a server this package binds
 * itself, prefer `listenServer`, which retries on the real bind and has no probe/bind race.
 */
import net from 'node:net';

/** Both loopback addresses. A dev server that binds `localhost` can land on `::1` while other
 * servers bind `127.0.0.1`, so a probe of one family can report free a port a strict bind on the
 * other family then fails on. */
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', '::1'];

/** Only EADDRINUSE counts as taken. Any other bind error (e.g. EADDRNOTAVAIL for `::1` on a host
 * with IPv6 disabled) means that address family cannot be used at all, which says nothing about the port.
 * @complexity One bind/close round trip. */
function isPortFreeOn({ port, host }: { port: number; host: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error: NodeJS.ErrnoException) => resolve(error.code !== 'EADDRINUSE'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/** Whether nothing listens on `port` on every host (default: both loopbacks), probed in order and
 * stopping at the first taken one.
 * @complexity One bind/close round trip per host. */
export async function isPortFree({ port }: { port: number }, { hosts = LOOPBACK_HOSTS }: { hosts?: readonly string[] } = {}): Promise<boolean> {
  for (const host of hosts) {
    if (!(await isPortFreeOn({ port, host }))) return false;
  }
  return true;
}

/** The first port in `[start, start + span)` the probe reports free, or `null` when none is.
 * Scans upward from a fixed base rather than asking the OS for `:0`, so a single instance lands on a
 * predictable port (easy to spot in logs) while a second instance still gets the next one.
 * @complexity O(span) probes in the worst case. */
export async function pickFreePort({ start, span }: { start: number; span: number }, {
  isPortFree: probe = ({ port }: { port: number }) => isPortFree({ port }),
}: { isPortFree?: (args: { port: number }) => Promise<boolean> } = {}): Promise<number | null> {
  for (let port = start; port < start + span; port += 1) {
    if (await probe({ port })) return port;
  }
  return null;
}
```
### J2 NEW `packages/devops/src/local-dev/__tests__/free-port.test.ts` (exact; generalized from Tovu `__tests__/dev-desktop-admin-port.test.mjs:17-41`)
```ts
import { afterEach, expect, test } from 'vitest';
import net from 'node:net';
import { isPortFree, pickFreePort } from '../free-port.js';

const open: net.Server[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))); });
const busy = (taken: readonly number[]) => async ({ port }: { port: number }) => !taken.includes(port);

test('pickFreePort returns the first port in the range the probe reports free', async () => {
  expect(await pickFreePort({ start: 5273, span: 10 }, { isPortFree: busy([5273, 5274]) })).toBe(5275);
});

test('pickFreePort returns null when every port is taken, without probing past the range', async () => {
  const probed: number[] = [];
  const probe = async ({ port }: { port: number }) => { probed.push(port); return false; };
  expect(await pickFreePort({ start: 5273, span: 3 }, { isPortFree: probe })).toBeNull();
  expect(probed).toEqual([5273, 5274, 5275]);
});

test('isPortFree reports a port held on the probed host as taken and an unused one as free', async () => {
  const server = net.createServer();
  open.push(server);
  await new Promise<void>((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve));
  const { port } = server.address() as net.AddressInfo;
  expect(await isPortFree({ port }, { hosts: ['127.0.0.1'] })).toBe(false);
  open.splice(0).forEach((s) => s.close());
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await isPortFree({ port }, { hosts: ['127.0.0.1'] })).toBe(true);
});

test('a host whose address family is unavailable does not make a port look taken', async () => {
  expect(await isPortFree({ port: 1 }, { hosts: ['192.0.2.1'] })).toBe(true); // TEST-NET-1: EADDRNOTAVAIL, not EADDRINUSE
});
```
(The last test pins the "only EADDRINUSE counts" rule; it is GREEN-by-construction from the moved body, recorded as a characterization pin.)

### T1 Tovu `development/scripts/free-port.mjs` after the edit
Keep the `@file` header l.1-10 verbatim (Tovu why: :5173 collision, `dev-desktop.mjs`'s `resolveDesktopAdminVitePort`), and the Tovu-specific half of the `isPortFree` doc ("Vite binds `localhost`, which resolves to `::1` on this machine …", "`apps/admin/vite.config.ts`'s `strictPort: true` … `reportAdminViteGone`"). Delete `isPortFreeOn` and its doc (moved). New body after the header:
```js
import { isPortFree as isSharedPortFree, pickFreePort as pickSharedFreePort } from "@jini-ai/devops/local-dev";

/**
 * (kept Tovu half of the old isPortFree doc: Vite on `::1`, strictPort race, reportAdminViteGone)
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isPortFree(port) {
  return isSharedPortFree({ port });
}

/**
 * The launchers' seam: tests replace this module file (see desktop-portable.unit.test.ts), so it keeps
 * the positional `deps.isPortFree(port)` shape its callers and fakes use.
 * @param {{start: number, span: number}} range
 * @param {{isPortFree?: (port: number) => Promise<boolean>}} [deps]
 * @returns {Promise<number | null>}
 */
export function pickFreePort(range, deps = {}) {
  const check = deps.isPortFree ?? isPortFree;
  return pickSharedFreePort(range, { isPortFree: ({ port }) => check(port) });
}
```
behaviour_diff: probe order (127.0.0.1 then ::1, short-circuit), EADDRINUSE-only rule, range bounds, null result: same (body moved verbatim). Tests: `__tests__/dev-desktop-admin-port.test.mjs` (blob a8b90478ae99b9068f4ed4627342c57af7323a2b) unchanged and must stay green.
```
census: python3 M/scripts/census.py . development/scripts/free-port.mjs | allowed: [dev-desktop.mjs:88, development/e2e/support/isolated-journey-site.ts:5, development/e2e/support/bug-pin-fixtures.ts:10, __tests__/dev-desktop-admin-port.test.mjs:5, __tests__/desktop-portable.unit.test.ts:19 (stub filename), __tests__/unit/af-cli-characterization.unit.test.ts:295 (stub filename)]
jini_msg: "feat(devops): local-dev pickFreePort and isPortFree" | tovu_msg: "refactor(scripts): free-port binds @jini-ai/devops/local-dev"
```

---

## DD-local-dev-2: `parseLsofListeners` + `loadRepoRootEnvFile` (no Jini commit)

```
id: DD-local-dev-2
tovu_files:
  - development/scripts/port-listeners.mjs | blob e1567ad78d6174216879b3999d53fd625c32dbb7 | reduce-to-binding
  - development/scripts/load-repo-root-env.mjs | blob 2bcee3c5d0cedd89be83fd694974b66a20dc5c96 | reduce-to-binding
jini_survivor: @jini-ai/devops/local-dev {parseLsofListeners, loadRepoRootEnvFile} at packages/devops/src/local-dev/index.ts:20,11 | blob c94078c97b0c13db07fe5f833428234ed0b8f74b (both already in published 0.7.0)
behaviour_diff:
  - parseLsofListeners args: Tovu `(stdout)` / Jini `({ stdout })` / call shape only
  - parseLsofListeners CRLF: Jini normalises `\r\n` / Tovu not / differs only on CRLF lsof output (lsof emits LF on macOS/Linux; unreachable). No test.
  - parseLsofListeners dangling p / c without p: same (body identical)
  - listenersOn: NOT adopted (Jini async + runner port; Tovu sync callers) — Tovu keeps its sync spawnSync wrapper, which calls the shared parser
  - loadRepoRootEnvFile: Tovu `(repoRoot, {existsSync, loadEnvFile})` joins `.env` / Jini `({ environmentFile, fs, loader })` takes the full path / same branch logic, same return, loader errors propagate in both
real_caller_check: dev.mjs:71 / dev-desktop.mjs:103 / start.mjs:221 / dev-server.mjs:12 use the boolean return; __tests__/load-repo-root-env.test.mjs (blob 0d4cb5c9653e045846d387866597aa0d8830921a) injects `{existsSync, loadEnvFile}` -> binding keeps that deps shape. __tests__/port-listeners.test.mjs (blob 4c5cb3c1b75b1b64c41ed40b60a13bc53b0d55cf) calls `parseLsofListeners(stdout)` and `listenersOn(port, {spawnSync})` -> both keep their Tovu shape.
```
### binding: port-listeners.mjs
Keep header l.1-12 and both doc blocks. Replace the `parseLsofListeners` body (keep the export: port-listeners.test.mjs and its 4 parser tests use it) with a binding, and keep `listenersOn` unchanged:
```js
import { spawnSync } from "node:child_process";
import { parseLsofListeners as parseSharedLsofListeners } from "@jini-ai/devops/local-dev";

export function parseLsofListeners(stdout) {
  return parseSharedLsofListeners({ stdout });
}
```
Move the parser's `-F pc` format why (doc l.15-21: "one field per line … dropped rather than emitted with an undefined command") — Jini already says "Parse lsof's field format, dropping incomplete records"; reword the Jini doc only if the executor is also making a Jini commit (it is not) -> the Tovu doc stays on the Tovu binding. `listenersOn` keeps calling `parseLsofListeners(out.stdout)` (now the binding).

### binding: load-repo-root-env.mjs
Keep header l.1-12 and the whole doc block of `loadRepoRootEnvFile` (all Tovu why: TOVU_SITE_KEY, start.mjs, Dockerfile CMD). Body:
```js
import { existsSync } from "node:fs";
import path from "node:path";
import { loadRepoRootEnvFile as loadSharedEnvFile } from "@jini-ai/devops/local-dev";

export function loadRepoRootEnvFile(repoRoot, deps = {}) {
  const checkExists = deps.existsSync ?? existsSync;
  const doLoad = deps.loadEnvFile ?? process.loadEnvFile.bind(process);
  return loadSharedEnvFile({
    environmentFile: path.join(repoRoot, ".env"),
    fs: { exists: ({ path: file }) => checkExists(file) },
    loader: { load: ({ path: file }) => doLoad(file) },
  });
}
```
```
failing_test: -  (no behaviour change)
census: rg -n "port-listeners|load-repo-root-env" -g '!node_modules' development apps | allowed: [dev.mjs:51,53,62,68; dev-desktop.mjs:54,89,91,102; start.mjs:35; dev-server.mjs:8; __tests__/load-repo-root-env.test.mjs; __tests__/port-listeners.test.mjs; __tests__/start.test.mjs:21,209; __tests__/desktop-portable.unit.test.ts:19-20; __tests__/unit/af-cli-characterization.unit.test.ts:278-298]
checks: node --check on both .mjs
tovu_msg: "refactor(scripts): dev launchers' lsof parser and .env loader run on @jini-ai/devops/local-dev"
```
Fixture edit (required; checked 2026-11-16): `development/scripts/__tests__/start.test.mjs` (blob 2214da86d5aa1ec6b81641a71c985a7e05d0ee93) test "main supplies the imported server with loopback binding…" (l.204) copies `start.mjs` + `load-repo-root-env.mjs` into a temp dir with NO `node_modules`, so the binding's `@jini-ai/devops/local-dev` import would not resolve there. Add, right after its `writeFileSync(path.join(fixture, "package.json"), '{"type":"module"}');` line:
```js
    symlinkSync(fileURLToPath(new URL("../../../node_modules", import.meta.url)), path.join(fixture, "node_modules"), "dir");
```
(the af-cli / desktop-portable fixtures already do exactly this). Add `symlinkSync` to the file's existing `node:fs` import and `fileURLToPath` to its `node:url` import if absent. No assertion changes. Add `development/scripts/__tests__/start.test.mjs` to this slice's tovu_files and commit pathspec.
