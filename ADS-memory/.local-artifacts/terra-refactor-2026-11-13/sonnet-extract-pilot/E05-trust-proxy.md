# E05 server: trust-proxy decision -> `@jini-ai/http-kit` (Express stays in Tovu)

Tovu `apps/website/src/server/inbound/shared/trust-proxy.ts`. The pure decision (override text -> `false` | hops | address list; refuse `true`; else the platform's hop count) moves to Jini with no Express and no env names. Tovu keeps: the env var name `TOVU_TRUST_PROXY`, the error wording ("in front of Tovu"), host signals, and `applyTrustProxy` (`app.set`, Express). Same exported Tovu API, so `composition/app.ts` (in the arg-rule list) and every test stay untouched. The platform hop count is a lazy port (`platformHops: () => ...`) so the bundled manifest scan still runs only when no override is set.

## Guards
Tovu `trust-proxy.ts` blob `ea8fa4c91aa4099fb87517d01b83a0cc6f366b89`. Jini `packages/http-kit/src/index.ts` blob `571315dfcb0e75c2ae4943482d6bcf099a6f2aad`; `packages/http-kit/src/trust-proxy.ts` must not exist; `rg -n "TrustProxySetting|resolveTrustProxySetting" packages` prints nothing.

## Jini (commit 1)
1. NEW `packages/http-kit/src/trust-proxy.ts`:
```ts
/**
 * @file The `trust proxy` decision for a server behind a platform edge, without any server framework.
 *
 * Without it, every visitor behind a platform edge shares the edge's IP: per-IP rate limits become
 * one global bucket and stored source IPs are the proxy's. Trusting X-Forwarded-For everywhere would
 * be worse — a direct client could name any IP it likes. So it is trusted for exactly the hops a
 * known platform puts in front of the app, and never when running locally or directly.
 *
 * With a hop count of N, the server takes the Nth address from the RIGHT of X-Forwarded-For — the
 * one the outermost trusted proxy appended — so whatever the client wrote to the left is ignored.
 */

/** `false`, a hop count, or an address/subnet list (e.g. `"loopback, 10.0.0.0/8"`). */
export type TrustProxySetting = false | number | string;

/**
 * Decide `trust proxy`.
 *
 * - `override` wins when non-empty: `false`/`0`/`off`/`no` -> trust none; an integer -> that many
 *   hops; anything else -> an address/subnet list. `true` is refused: it trusts every
 *   X-Forwarded-For entry, so any client could spoof its IP.
 * - Otherwise the platform's declared hop count (`platformHops`, read only in this case).
 * - Otherwise `false`: the socket peer is the client.
 *
 * @param required.override The operator's raw setting (e.g. an env value), or undefined.
 * @param optional.platformHops Lazily reads the matched platform's hop count.
 * @param optional.overrideName Names the setting in the refusal message. @param optional.serverLabel Names the server there.
 * @throws Error when `override` is `true`.
 * @complexity O(1) plus `platformHops`.
 */
export function resolveTrustProxySetting(
  { override }: { override: string | undefined },
  { platformHops, overrideName = 'TRUST_PROXY', serverLabel = 'this server' }: {
    platformHops?: () => number | undefined;
    overrideName?: string;
    serverLabel?: string;
  } = {},
): TrustProxySetting {
  const value = override?.trim() ?? '';
  if (value !== '') {
    const lower = value.toLowerCase();
    if (lower === 'true') {
      throw new Error(
        `${overrideName}="true" would trust X-Forwarded-For from any client. Set the number of proxy hops in front of ${serverLabel} (e.g. 1), or a list of proxy addresses/subnets.`
      );
    }
    if (['false', '0', 'off', 'no'].includes(lower)) return false;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
  }
  return platformHops?.() ?? false;
}
```
2. `packages/http-kit/src/index.ts`: after `export * from './origin.js';` add `export * from './trust-proxy.js';`
3. NEW `packages/http-kit/src/__tests__/trust-proxy.test.ts` (vitest; the pure cases of Tovu's trust-proxy.test.ts):
```ts
import { describe, expect, it } from 'vitest';
import { resolveTrustProxySetting } from '../trust-proxy.js';

describe('resolveTrustProxySetting', () => {
  it('trusts no proxy when nothing is set', () => {
    expect(resolveTrustProxySetting({ override: undefined })).toBe(false);
  });
  it('uses the platform hop count only when the override is empty', () => {
    let reads = 0;
    const platformHops = () => { reads++; return 1; };
    expect(resolveTrustProxySetting({ override: '' }, { platformHops })).toBe(1);
    expect(resolveTrustProxySetting({ override: '2' }, { platformHops })).toBe(2);
    expect(reads).toBe(1);
  });
  it('lets the override turn the platform default off, or name addresses', () => {
    const platformHops = () => 1;
    for (const off of ['false', '0', 'OFF', 'no']) expect(resolveTrustProxySetting({ override: off }, { platformHops })).toBe(false);
    expect(resolveTrustProxySetting({ override: ' loopback, 10.0.0.0/8 ' })).toBe('loopback, 10.0.0.0/8');
  });
  it("refuses 'true', naming the setting and the server", () => {
    expect(() => resolveTrustProxySetting({ override: 'true' }, { overrideName: 'APP_TRUST_PROXY', serverLabel: 'the app' })).toThrow(
      'APP_TRUST_PROXY="true" would trust X-Forwarded-For from any client. Set the number of proxy hops in front of the app (e.g. 1), or a list of proxy addresses/subnets.',
    );
  });
});
```
4. NEW `.changeset/http-kit-trust-proxy.md`: `"@jini-ai/http-kit": minor` / `Add \`resolveTrustProxySetting\` and \`TrustProxySetting\`: the framework-free \`trust proxy\` decision (override, lazy platform hop count, refuses \`true\`).`
5. eslint the 3 .ts files. Commit `E05-jini.msg`: `feat(http-kit): framework-free resolveTrustProxySetting`.

## Tovu (commit 2)
1. Census: `rg -n "trust-proxy" apps content development --glob '!**/node_modules/**'` -> only the 8 files in the guard notes below. None needs editing (the Tovu API is unchanged). New hits: STOP.
2. In `trust-proxy.ts`:
   - add import after line 3: `import { resolveTrustProxySetting as resolveOverrideOrPlatformHops, type TrustProxySetting } from "@jini-ai/http-kit";`
   - delete `export type TrustProxySetting = false | number | string;` and its 2-line doc comment above it; add `export type { TrustProxySetting };`
   - replace the body of `resolveTrustProxySetting` (the 13 lines from `  const override = env.TOVU_TRUST_PROXY?.trim() ?? "";` through `  return (optional.hostSignals ?? resolveHostSignals({ env })).trustProxyHops ?? false;`) with:
```ts
  return resolveOverrideOrPlatformHops({ override: env.TOVU_TRUST_PROXY }, {
    platformHops: () => (optional.hostSignals ?? resolveHostSignals({ env })).trustProxyHops,
    overrideName: "TOVU_TRUST_PROXY",
    serverLabel: "Tovu",
  });
```
   - keep the `@file` header and both functions' JSDoc (Tovu wording) unchanged; append to the header, before ` */`: ` * The decision itself lives in \`@jini-ai/http-kit\` (\`resolveTrustProxySetting\`); this file binds Tovu's env name, host signals and Express.`
3. eslint `trust-proxy.ts`. Commit `E05-tovu.msg`: `refactor(server): trust-proxy decision from @jini-ai/http-kit` + body `Same API, same messages; Tovu binds TOVU_TRUST_PROXY, host signals and Express app.set.` Path: trust-proxy.ts only.

Guard notes: expected census files — `content/agent-plugin-overlays/fly/__tests__/host-signals.test.mjs`, `content/agent-plugin-overlays/fly/__tests__/fixtures/host-signals-head.mjs`, `apps/website/src/server/inbound/public-http/routes/site/__tests__/comments-submit.test.ts`, `apps/website/src/server/inbound/shared/__tests__/trust-proxy.test.ts`, `apps/website/src/server/runtime/composition/app.ts`, `apps/website/src/server/inbound/admin-http/dev-auth.ts`, `apps/website/src/contracts/core/rate-limit/rate-limit.ts`, `apps/website/src/contracts/core/__tests__/unit/host-signals.unit.test.ts`.

## Common rules (part of this recipe; read before editing)
- HARD RULE: stop before 300k tokens of context; if near it, report what is done and what is left.
- Clones: Tovu `/Users/la/Programming/tovu-codex-trial-terra`, Jini `/Users/la/Programming/jini-terra-base`. Both must report `refactor/terra` from `git branch --show-current`; else STOP.
- Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md startup) do not apply; expected. Proceed.
- Run NO tests, tsc, builds, installs, lockfile commands, formatters, `--fix`/`--write`. Leave no process running.
- Edit only the files this recipe names. Never touch node_modules, ADS-memory, *.sql, lockfiles.
- STOP-on-mismatch: a deleted/moved file must match its listed blob (`git hash-object`); every old->new edit's OLD text must occur exactly once (or the stated count) at the time you apply it. Any mismatch, or an importer census hit not listed: restore only the files you changed in this recipe (`git show HEAD:<path> > <path>`; `rm` files you created), report SKIPPED with the reason. Never improvise a fix. A skip is a good outcome.
- No Tovu text in Jini: after the Jini edits, `rg -n -i "tovu|site-chat|apps/(admin|website)" <every Jini file you created or edited>` must print nothing.
- Why-comments move, never deleted (the recipe says where each goes).
- Checks, only these: `node_modules/.bin/eslint <touched .ts/.tsx files>` run from each clone root; `node --check` for touched .js/.mjs. In Tovu, an unresolved-import error for a NEW Jini specifier is expected (Tovu's node_modules hold npm 0.7.x until the D1 link): record it, do not fix. Any other eslint error caused by your edit: fix only if it is a literal consequence of the edit (unused import, import order); otherwise STOP.
- Git: Jini commit FIRST, then Tovu. New file: `git add -- <path>`. Deleted file: `git rm -q -- <path>`. Commit: `git commit -F <msgfile> -- <every path>`. Never `add -A`/`add .`, stash, checkout, reset, rebase, push, amend. Message files go in `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/73a40820-b1fa-4c88-a55c-409efcaf4ee6/scratchpad/`; each message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Report: DONE or SKIPPED (+reason), Jini SHA, Tovu SHA, every path changed, eslint result, anything that differed from the recipe, tokens used.
