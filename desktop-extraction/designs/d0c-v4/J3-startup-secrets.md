# J3 (Jini): `takeNodeStartupSecrets` and `allowedNodeStartupSecrets` in `@jini-ai/sidecar/supervisor/node` (one repo: Jini; Codex-ready)

Why: the desktop main calls the website's `initializeStartupSecrets({}, {})` (`apps/desktop/src/main/index.ts:115,203`). Its mechanics are generic and composed of Jini's own `splitNodeStartupSecrets` (`packages/sidecar/src/supervision/supervisor-node.ts:307`), `receiveNodeStartupSecrets` (`:352`) and `STARTUP_SECRETS_ENV` (`:298`). v3 put the whole sequence, IPC start included, into one Jini function; judge 3 S1 showed that reorders the website's effects (inherited credentials were assigned **before** IPC started) and adds a promise turn. v4 moves only the two **synchronous** halves into Jini; the website keeps its own async sequence line for line (T4).
Jini for verification: this sheet's commit. Named packages: `sidecar`.

Original Tovu body (`2d82735a6:apps/website/src/platform/secrets/startup-secrets.ts:19-32`), for reference:
```ts
const inherited = splitNodeStartupSecrets({ env: process.env, keys: STARTUP_SECRET_KEYS });
for (const key of Object.keys(process.env)) {
  if (STARTUP_SECRET_KEYS.some(name => name === key.toUpperCase())) delete process.env[key];
}
credentials = inherited.secrets;
const fromIpc = process.env[STARTUP_SECRETS_ENV] === '1';
delete process.env[STARTUP_SECRETS_ENV];
startup = (async () => {
  if (!fromIpc) return;
  const received = await receiveNodeStartupSecrets({ peer: process });
  const allowed = splitNodeStartupSecrets({ env: received, keys: STARTUP_SECRET_KEYS });
  if (Object.keys(allowed.env).length) throw new Error('Unexpected startup credential keys');
  credentials = allowed.secrets;
})();
```

## Files to change (one commit: `feat(sidecar): take and allow startup secrets (node)`)
In `supervisor-node.ts`, after `receiveNodeStartupSecrets` (file stays < 500 lines; ~385 after):
```ts
/** Take host-selected launch credentials out of `env` before any probe or child can inherit them.
 * Key names match case-insensitively on both sides (Windows environment names, and host key lists
 * written in any case): every case variant of each key, and the IPC marker, is deleted from `env`
 * itself. Synchronous, so a host can store the inherited values before it starts any IPC.
 * @returns Inherited values under the host's own key spelling, and whether the launcher offered an IPC record.
 * @complexity O(e + k) time; no I/O.
 * @example const { inherited, fromIpc } = takeNodeStartupSecrets({ keys: ['HOST_TOKEN'] });
 */
export function takeNodeStartupSecrets({ keys }: { keys: readonly string[] }, {
  env = process.env,
}: { env?: NodeJS.ProcessEnv } = {}): { inherited: Record<string, string>; fromIpc: boolean } {
  const inherited = splitNodeStartupSecrets({ env, keys }).secrets;
  const names = new Set(keys.map(key => key.toUpperCase()));
  for (const key of Object.keys(env)) if (names.has(key.toUpperCase())) delete env[key];
  const fromIpc = env[STARTUP_SECRETS_ENV] === '1';
  delete env[STARTUP_SECRETS_ENV];
  return { inherited, fromIpc };
}

/** Accept a received startup record only when every key is one the host selected (any case).
 * @returns The values under the host's own key spelling.
 * @throws `Unexpected startup credential keys` for any other key; values are never echoed.
 * @complexity O(r + k) time; no I/O.
 * @example allowedNodeStartupSecrets({ keys: ['HOST_TOKEN'], record: await receiveNodeStartupSecrets({ peer: process }) });
 */
export function allowedNodeStartupSecrets({ keys, record }: {
  keys: readonly string[]; record: Readonly<Record<string, string>>;
}, _optional: Record<string, never> = {}): Record<string, string> {
  const allowed = splitNodeStartupSecrets({ env: record, keys });
  if (Object.keys(allowed.env).length) throw new Error('Unexpected startup credential keys');
  return allowed.secrets;
}
```
Behaviour vs the Tovu body: identical for Tovu's all-uppercase key list; for a lowercase declared key (`host_token`) the scrub now also removes `HOST_TOKEN`, which `splitNodeStartupSecrets` already treats as that key (judge 3 S1, second half). The subpath `./supervisor/node` maps straight to `dist/supervision/supervisor-node.js` (`packages/sidecar/package.json:42-45`), so both functions are public with no entry edit.
- Release inventory: `api-baseline/jini-ai__sidecar.json` via `pnpm api:update`; NEW `.changeset/sidecar-take-startup-secrets.md`: `"@jini-ai/sidecar": minor` / "Add `takeNodeStartupSecrets` and `allowedNodeStartupSecrets` to `@jini-ai/sidecar/supervisor/node`." The Tovu side of the release (range bump in root and `apps/desktop` manifests, three lockfiles) is T4's landing rule (COMMON section 6).

## Characterization tests to add
NEW `packages/sidecar/src/supervision/__tests__/take-startup-secrets.test.ts` (vitest; every env is a fresh object, never `process.env`):
1. keys `['HOST_TOKEN']`, env `{ Host_Token: 'a', OTHER: 'x' }` -> inherited `{ HOST_TOKEN: 'a' }`; `Host_Token` is gone from the passed env; `OTHER` stays.
2. lowercase key list `['host_token']` with env `{ HOST_TOKEN: 'a' }` -> inherited `{ host_token: 'a' }` and `HOST_TOKEN` deleted.
3. marker `'1'` -> `fromIpc: true`, marker deleted; marker `'0'` -> `fromIpc: false`, marker deleted; no marker -> `false`.
4. the passed env object is the one mutated (identity), and the returned `inherited` is a separate object.
5. `allowedNodeStartupSecrets`: only allowed keys -> values under host spelling (a lowercase record key is accepted); one extra key -> throws exactly `Unexpected startup credential keys` and the message contains no value.
Red checks: (1) replace `names.has(key.toUpperCase())` with `keys.includes(key.toUpperCase())` (the Tovu comparison) -> case 2 fails; (2) delete the delete loop -> case 1 fails; (3) drop the `throw` line -> case 5 fails.

## STOP conditions
- `rg -n "takeNodeStartupSecrets|allowedNodeStartupSecrets" packages` prints a hit before the edit.
- `wc -l packages/sidecar/src/supervision/supervisor-node.ts` is not 358, or `:298`/`:307`/`:352` are not the three cited declarations.
- `packages/sidecar/package.json` `"./supervisor/node"` does not point at `./dist/supervision/supervisor-node.js`.
- `pnpm api:update` changes a baseline other than `jini-ai__sidecar.json`.
