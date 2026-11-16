# MV-audit-A10-1: issued sign-in collector -> NEW `@jini-ai/agent-plugins/admin-surfaces/node` (template T-MOVE, with one injected predicate)

Source: AUDIT-ADDITIONS `audit:A10` (ACCEPT, startable now; survey u067 MOVE, tracking gap). Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092.
untangle_overlap: NONE on the edited files. `agent-plugin-connections.ts` (the production caller) has wave rows (`C5.repoint.tsv:366-367`, `R-BARRELS.repoint.tsv:1690`) but this sheet does NOT edit it (its `createIssuedSignInCollector()` call keeps resolving to the Tovu binding). Startable now, before or after wave B; blob guards decide.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base  BRANCH=refactor/terra
Order: J -> T. Tier: Sonnet 5.5 high. est. executor tokens: ~25k.

## Design decisions made here (executor makes none)
- New subpath `./admin-surfaces/node` (runtime `node`: `AsyncLocalStorage` from `node:async_hooks`). Leaf file `packages/agent-plugins/src/admin-surfaces/node.ts`. It is the receiving half of the existing `onSignInIssued` hook of `@jini-ai/agent-plugins/admin-surfaces/connections`; no import of it is needed (structural `{ authorizationUrl, expiresAt }`).
- Link admission: https links are always kept (generic: a provider URL must be https). A plain-http link is kept only when the REQUIRED host predicate `admitHttp({ url })` says it is the host's own sign-in link (Tovu: `isHostedSignInLinkPath`). No default, so no Jini caller can admit http by accident.
- Signature: Jini `createIssuedSignInCollector({ admitHttp }, _optional = {})`. Tovu keeps a 1-function binding `createIssuedSignInCollector()` in `issued-sign-ins.ts` (same zero-arg call shape) so all 5 call sites (`agent-plugin-connections.ts:161`, 4 tests) stay byte-identical. The types `HostSignInLink` / `IssuedSignInCollector` leave Tovu; their 3 type importers repoint to Jini (no shells, COMMON 19).
- Pure move: no behaviour change; Tovu tests stay and exercise the binding end to end.

## Guards
Tovu blobs: `features/agent-plugins/admin-surfaces/issued-sign-ins.ts` 59227cec17e4209aad631b53afb4bc4ef1715dbf; `.../admin-surfaces/surfaces.ts` afaa491929f9e706e1b84d2f516d5c3266c44721; `.../admin-surfaces/handlers.ts` 5403b45dffe1b04519d47ed230db0996d9197c4c; `.../admin-surfaces/README.md` fa08bca7e5de6e8e8379cd9f5690008740ebf2e4; `server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-admin-surfaces.security.integration.test.ts` 6554a3184d46108de7137604452a89b9cddfb504 (all paths under `apps/website/src/`).
Jini: `packages/agent-plugins/package.json` blob e32f6ca94122a5aa8042e45fe4f31eb7db029d22 (if changed by wave B: use the J2 text anchors, each once); `packages/agent-plugins/README.md` contains the J3 anchor once; `packages/agent-plugins/src/admin-surfaces/node.ts` absent; `rg -n "createIssuedSignInCollector|HostSignInLink" packages` prints nothing.

## J. Jini (commit 1)

### J1. NEW `packages/agent-plugins/src/admin-surfaces/node.ts` (exact content)
```ts
/**
 * @file The per-request registry of sign-in links the host issued while running one admin-surface
 * action, so the admin route can hand the HOST PAGE exactly those links to open. Bind `record` to the
 * connections port's `onSignInIssued`, and wrap each action dispatch in `collect`.
 *
 * Why: a plugin's frame is sandboxed without `allow-popups`, so it cannot open a sign-in itself, and the
 * host page must never open a URL a plugin made up (an open redirect or phishing page under the
 * operator's trust). AsyncLocalStorage keeps concurrent requests apart. Only https links, and plain-http
 * links the host admits as its own sign-in links, are kept.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

/** One link the host page may offer: the host's own authorization URL and when its attempt expires. */
export interface HostSignInLink {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}

export interface IssuedSignInCollector {
  /** Called by the connections port for each issued sign-in; outside a collection it is a no-op. */
  record(required: HostSignInLink, optional?: Record<string, never>): void;
  /** Runs one action and returns what it issued. */
  collect<T>(required: { readonly run: () => Promise<T> }, optional?: Record<string, never>): Promise<{ readonly value: T; readonly signIns: readonly HostSignInLink[] }>;
}

/**
 * @param admitHttp - Whether a plain-http link is the host's own sign-in link (which follows the site's
 *   scheme). Every other link must be https.
 * @complexity O(1) per record; collect adds O(1) around the run.
 */
export function createIssuedSignInCollector(
  { admitHttp }: { admitHttp: (required: { url: URL }) => boolean },
  _optional = {},
): IssuedSignInCollector {
  const current = new AsyncLocalStorage<HostSignInLink[]>();
  return {
    record({ authorizationUrl, expiresAt }) {
      const url = URL.parse(authorizationUrl);
      if (url && (url.protocol === 'https:' || (url.protocol === 'http:' && admitHttp({ url })))) current.getStore()?.push({ authorizationUrl, expiresAt });
    },
    async collect({ run }) {
      const signIns: HostSignInLink[] = [];
      const value = await current.run(signIns, run);
      return { value, signIns };
    },
  };
}
```

### J2. `packages/agent-plugins/package.json` (each OLD exactly once)
1. jini.entries: OLD `      "./admin-surfaces/connections": "universal"` NEW
```
      "./admin-surfaces/connections": "universal",
      "./admin-surfaces/node": "node"
```
2. exports: OLD
```
    "./admin-surfaces/connections": {
      "types": "./dist/admin-surfaces/connections/index.d.ts",
      "import": "./dist/admin-surfaces/connections/index.js",
      "default": "./dist/admin-surfaces/connections/index.js"
    }
  },
```
NEW
```
    "./admin-surfaces/connections": {
      "types": "./dist/admin-surfaces/connections/index.d.ts",
      "import": "./dist/admin-surfaces/connections/index.js",
      "default": "./dist/admin-surfaces/connections/index.js"
    },
    "./admin-surfaces/node": {
      "types": "./dist/admin-surfaces/node.d.ts",
      "import": "./dist/admin-surfaces/node.js",
      "default": "./dist/admin-surfaces/node.js"
    }
  },
```
(No `typesVersions` block exists in this package. Validate JSON.)

### J3. `packages/agent-plugins/README.md`: after the line that starts with ``| `./admin-surfaces/client` | universal |`` (once) insert
```
| `./admin-surfaces/node` | node | `createIssuedSignInCollector({ admitHttp })`: per-request (AsyncLocalStorage) registry of the sign-in links the connections port issued during one action, for the host page to open. |
```

### J4. NEW `packages/agent-plugins/src/admin-surfaces/__tests__/issued-sign-ins.test.ts` (exact content)
```ts
import { describe, expect, test } from 'vitest';
import { createIssuedSignInCollector } from '../node.js';

const link = (authorizationUrl: string) => ({ authorizationUrl, expiresAt: '2026-01-01T00:00:00.000Z' });

describe('createIssuedSignInCollector', () => {
  test('keeps https and host-admitted http links issued inside one collection only', async () => {
    const collector = createIssuedSignInCollector({ admitHttp: ({ url }) => url.pathname.startsWith('/sign-in/') });
    collector.record(link('https://outside.test/a'));
    const { value, signIns } = await collector.collect({ run: async () => {
      for (const url of ['https://idp.test/x', 'http://host.test/sign-in/1', 'http://evil.test/x', 'javascript:alert(1)', 'not a url']) collector.record(link(url));
      return 7;
    } });
    expect(value).toBe(7);
    expect(signIns.map((entry) => entry.authorizationUrl)).toEqual(['https://idp.test/x', 'http://host.test/sign-in/1']);
  });

  test('concurrent collections stay apart', async () => {
    const collector = createIssuedSignInCollector({ admitHttp: () => false });
    const [a, b] = await Promise.all(['https://a.test/', 'https://b.test/'].map((url) => collector.collect({ run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      collector.record(link(url));
    } })));
    expect(a!.signIns.map((entry) => entry.authorizationUrl)).toEqual(['https://a.test/']);
    expect(b!.signIns.map((entry) => entry.authorizationUrl)).toEqual(['https://b.test/']);
  });
});
```

### J5. Changeset `.changeset/agent-plugins-issued-sign-ins.md`
```
---
"@jini-ai/agent-plugins": minor
---

Add `@jini-ai/agent-plugins/admin-surfaces/node` with `createIssuedSignInCollector({ admitHttp })`: the per-request registry of sign-in links issued during one admin-surface action (the receiving half of `onSignInIssued`), keeping https links and host-admitted http links only.
```

### J6. Checks + commit
Rule checks (2; 5: only `node:async_hooks`). eslint node.ts + test. Commit: node.ts, the test, package.json, README.md, the changeset.
jini_msg: `feat(agent-plugins): admin-surfaces/node issued sign-in collector` | body: "Moved from a host. The host supplies which plain-http links are its own sign-in links."

## T. Tovu (commit 2)

### T1. REPLACE `apps/website/src/features/agent-plugins/admin-surfaces/issued-sign-ins.ts` with (exact content)
```ts
import { createIssuedSignInCollector as createJiniIssuedSignInCollector, type IssuedSignInCollector } from "@jini-ai/agent-plugins/admin-surfaces/node";

import { isHostedSignInLinkPath } from "../../../contracts/core/hosted-sign-in-links.js";

/**
 * @file Tovu's binding of the issued sign-in collector (`@jini-ai/agent-plugins/admin-surfaces/node`).
 * The host's own sign-in link follows the site's scheme, so a plain-http link is admitted only on
 * Tovu's hosted sign-in path; provider URLs must be https.
 */

/** @complexity O(1) per record; collect adds O(1) around the run. */
export function createIssuedSignInCollector(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): IssuedSignInCollector {
  return createJiniIssuedSignInCollector({ admitHttp: ({ url }) => isHostedSignInLinkPath({ pathname: url.pathname }) });
}
```
(The `Record<string, never>` defaults are today's exact signature, kept so the 5 callers stay byte-identical; not new code.)

### T2. Type importers (each OLD exactly once)
- `features/agent-plugins/admin-surfaces/surfaces.ts`: `import type { HostSignInLink, IssuedSignInCollector } from "./issued-sign-ins.js";` -> `import type { HostSignInLink, IssuedSignInCollector } from "@jini-ai/agent-plugins/admin-surfaces/node";`
- `features/agent-plugins/admin-surfaces/handlers.ts`: `import type { IssuedSignInCollector } from "./issued-sign-ins.js";` -> `import type { IssuedSignInCollector } from "@jini-ai/agent-plugins/admin-surfaces/node";`
- `server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-admin-surfaces.security.integration.test.ts`: `import { createIssuedSignInCollector, type IssuedSignInCollector } from "#src/features/agent-plugins/admin-surfaces/issued-sign-ins";` -> two lines: `import type { IssuedSignInCollector } from "@jini-ai/agent-plugins/admin-surfaces/node";` then `import { createIssuedSignInCollector } from "#src/features/agent-plugins/admin-surfaces/issued-sign-ins";`
- `features/agent-plugins/admin-surfaces/README.md` line 46: replace `per-request registry (AsyncLocalStorage) of the https sign-in links the connections port issued;` with `Tovu binding of \`@jini-ai/agent-plugins/admin-surfaces/node\`'s per-request registry of the sign-in links the connections port issued (https, or http on Tovu's hosted sign-in path);` (rest of the line unchanged).

### T3. Census + checks + commit
Census: `rg -n "HostSignInLink|IssuedSignInCollector" apps --glob '!**/node_modules/**'` | allowed: the 4 edited code files above and `issued-sign-ins.ts`. `rg -n "issued-sign-ins" apps --glob '!**/node_modules/**'` | allowed: the 9 files listed in this sheet's guard list plus `features/api-connections/__tests__/surface-adapters.security.test.ts`, `admin-surfaces/__tests__/unit/{handlers,surfaces}.unit.test.ts`, `server/runtime/composition/agent-plugin-connections.ts` (all import `createIssuedSignInCollector` only: unchanged). Any other hit: STOP.
eslint the 4 code files (new Jini specifier unresolved until D1 link: record). Commit the 5 Tovu paths.
tovu_msg: `refactor(agent-plugins): issued sign-in collector from @jini-ai/agent-plugins/admin-surfaces/node` | body: "Tovu keeps the hosted sign-in path admission for plain-http links."
Cloud run owes: Jini vitest `admin-surfaces/__tests__/issued-sign-ins.test.ts`; subpath isolation (new node entry). Tovu: node:test surfaces/handlers unit tests, `surface-adapters.security.test.ts`, the admin-surfaces security integration test; website typecheck.
