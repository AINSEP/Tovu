# J3 (Jini): `consumeNodeStartupSecrets` in `@jini-ai/sidecar/supervisor/node` (~50k, T)

Why: the desktop main calls the website's `initializeStartupSecrets({}, {})` (`apps/desktop/src/main/index.ts:115,203`). Its body (Tovu `platform/secrets/startup-secrets.ts:17-33`) is generic mechanics around two functions Jini already owns in `packages/sidecar/src/supervision/supervisor-node.ts` (`splitNodeStartupSecrets` `:307`, `receiveNodeStartupSecrets` `:352`, `STARTUP_SECRETS_ENV` `:298`): split the host-selected keys out of the environment, delete them from it (any case), consume the IPC marker, and when marked read and validate the IPC record. Only the key list (Tovu vocabulary) and the per-process memo/credential state (Tovu composition) are Tovu's. Design: `../D0c-REVISION-3.md` section 3.

## Census (step 0)
```bash
git -C ../Tovu show 2d82735a:apps/website/src/platform/secrets/startup-secrets.ts
rg -n "consumeNodeStartupSecrets" packages        # expected: no hit
wc -l packages/sidecar/src/supervision/supervisor-node.ts   # expected 358
```

## One commit: `feat(sidecar): consumeNodeStartupSecrets (node)`
In `supervisor-node.ts`, below `receiveNodeStartupSecrets` (file stays < 500 lines):
```ts
/** Take host-selected launch credentials out of this process's environment once: the inherited values
 *  synchronously, the IPC record (when the launcher set STARTUP_SECRETS_ENV) asynchronously.
 *  Mutates `env` (removes every case variant of each key and the marker); never re-exports a value.
 *  @throws (from `received`) on refused/malformed IPC or a record carrying keys outside `keys`. */
export function consumeNodeStartupSecrets(
  required: { keys: readonly string[] },
  { env = process.env, peer = process as NodeIpcPeer }: { env?: NodeJS.ProcessEnv; peer?: NodeIpcPeer } = {},
): { inherited: Readonly<Record<string, string>>; received: Promise<Readonly<Record<string, string>> | undefined> }
```
Body = Tovu lines 19-32 with module state removed: `splitNodeStartupSecrets({ env, keys })` -> `inherited.secrets`; the delete loop over `Object.keys(env)` (same upper-case comparison); `fromIpc = env[STARTUP_SECRETS_ENV] === '1'`; `delete env[STARTUP_SECRETS_ENV]`; `received = fromIpc ? (async () => { ... same validation, same error text 'Unexpected startup credential keys' ... })() : Promise.resolve(undefined)`. Order of effects identical (split, delete keys, read marker, delete marker, then IPC).

Tests (vitest, `packages/sidecar/src/supervision/__tests__/consume-startup-secrets.test.ts`): (1) inherited keys are returned and removed from the passed env, case variants included, other keys kept; (2) no marker -> `received` resolves `undefined`, marker removed; (3) marker + fake peer answering a record with only allowed keys -> resolves it; (4) a record with an extra key -> rejects with `Unexpected startup credential keys`; (5) the passed `env` object is the one mutated (identity), so a caller's `process.env` scrub still happens.
Mutation proof: skip the delete loop -> test (1) fails; restore.

Gate: COMMON G (Jini), `PKGS="sidecar"`.
