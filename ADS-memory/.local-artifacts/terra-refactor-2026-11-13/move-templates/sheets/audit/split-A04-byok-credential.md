# SP-audit-A04-1: provider execution-credential resolution -> NEW `@jini-ai/agent-runtime/providers/credentials` (template T-SPLIT)

Source: AUDIT-ADDITIONS `audit:A04` (ACCEPT, startable now). Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092.
untangle_overlap: YES (light) -> **execute after wave B merge**. `R-BARRELS.repoint.tsv:221` repoints `byok-credential.ts` line 30 (`type SecretSealerPort` from `../features/webhooks/index.js` -> `@jini-ai/integrations/webhooks`); `C6.repoint.tsv:250` edits another import line of `assistant-byok.ts`; `C10-shell.repoint.tsv:7-11` and `R-BARRELS.repoint.tsv:1830-1833` drop other lines of `assistant/index.ts`. None of those rows touches a line this sheet edits, so all three Tovu files are TEXT-guarded (and `byok-credential.ts` derived-blob-guarded). No Jini file here has a wave row.
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base  BRANCH=refactor/terra (after wave B merge)
Order: J -> T. Tier: Sonnet 5.5 high. est. executor tokens: ~40k.

## Design decisions made here (executor makes none)
- New subpath `@jini-ai/agent-runtime/providers/credentials` (runtime `universal`; no I/O, no Node built-ins). Leaf `packages/agent-runtime/src/providers/credentials.ts`. The protocol union is the EXISTING `ProviderProtocol` (`providers/provider-tool-policy.ts:8`, `"anthropic" | "openai" | "azure" | "google"`): imported type-only, not redeclared. These are wire-protocol names the package already dispatches on, not vendor SDK code (COMMON rule 4 holds).
- Jini names are neutral: `ResolvedProviderCredential`, `RequestSuppliedProviderConfig`, `ExecutionCredentialPort` (same name), `StoredProviderCredential`, `createRequestSuppliedExecutionCredentialPort`, `createStoredExecutionCredentialPort`. The stored lookup is ONE port, `readStored({ workspaceId, principalId })`, returning a plain record or `null`; it must never throw for a decrypt failure (the host's resolver already degrades to `null`).
- Resolution order (generic): a usable request-supplied credential wins; else the stored row; a stored row with an unknown protocol or blank model is unusable. Moves verbatim.
- Tovu keeps `createStoredExecutionCredentialPort({ repo, sealer })` (same name, same signature: 1 caller in `assistant-byok.ts` and the Tovu test) as a binding that wires `resolveExecutionCredential`. The Tovu types `ResolvedByokCredential` / `RequestSuppliedByokConfig` / `ExecutionCredentialPort` are DELETED (no shells, COMMON 19): `assistant-byok.ts` imports the Jini types under import aliases (`as ResolvedByokCredential`, `as RequestSuppliedByokConfig`) so its body is untouched; `assistant/index.ts` drops its type re-export line.
- `createRequestSuppliedExecutionCredentialPort` (no production caller) moves; the Tovu test repoints its import to Jini. Every test body stays byte-identical. Pure move: no behaviour change.

## Guards
Tovu: derived blob for `apps/website/src/assistant/byok-credential.ts`: `sed 's#@jini-ai/integrations/webhooks#../features/webhooks/index.js#' apps/website/src/assistant/byok-credential.ts | git hash-object --stdin` = `ce5b828054a27b9de51c813e3fa925decfa02711` (else SKIP). TEXT guards (each OLD below occurs exactly once): `assistant/index.ts`, `server/runtime/composition/modules/assistant-byok.ts`, `assistant/__tests__/byok-credential.test.ts`.
Jini: `packages/agent-runtime/package.json` blob 52bfeffd81b12c9b070f0c9ebfe3cb5142152b3d (if wave B changed it, use the TEXT anchors in J2 instead: each must occur once); `packages/agent-runtime/README.md` contains the J3 anchor line once; `packages/agent-runtime/src/providers/credentials.ts` absent; `rg -n "createStoredExecutionCredentialPort|ResolvedProviderCredential" packages` prints nothing; `rg -n 'export type ProviderProtocol = "anthropic" \| "openai" \| "azure" \| "google";' packages/agent-runtime/src/providers/provider-tool-policy.ts` prints 1 line.

## split (`byok-credential.ts`, every top-level declaration)
  - file header (1-27) | STAY (shortened, Tovu design pointer kept)
  - ResolvedByokCredential (32) | MOVE -> `ResolvedProviderCredential`
  - RequestSuppliedByokConfig (44) | MOVE -> `RequestSuppliedProviderConfig`
  - ExecutionCredentialPort (52) | MOVE (doc reworded neutral)
  - VALID_PROTOCOLS (69), parseByokProtocol (79), parseByokRequiredString (86), parseByokOptionalString (93), parseByokMaxTokens (99), parseRequestSuppliedCredential (103) | MOVE (renamed `parseProtocol` etc., bodies verbatim)
  - createRequestSuppliedExecutionCredentialPort (129) | MOVE
  - StoredExecutionCredentialPortDeps (137) | STAY-WIRING
  - createStoredExecutionCredentialPort (156) | SPLIT: order + stored-row checks MOVE; `resolveExecutionCredential({ deps, input })` binding STAY
ports:
  - readStored: `(required: { workspaceId: string; principalId: string }) => Promise<StoredProviderCredential | null>` | Tovu binds `(input) => resolveExecutionCredential({ deps, input })` in `byok-credential.ts` | why: Tovu's vault context, table and sealer

## J. Jini (commit 1)

### J1. NEW `packages/agent-runtime/src/providers/credentials.ts` (exact content)
```ts
/**
 * @file Resolve the provider credential for one bring-your-own-key turn. A credential supplied on the
 * request wins when it is complete (someone trying a key they have not saved yet: no store read);
 * otherwise the host's stored credential for that `(workspaceId, principalId)` is used. Absence is a
 * value (`null`), never a throw, so a caller treats a missing or invalid credential as an ordinary
 * client error branch.
 */
import type { ProviderProtocol } from './provider-tool-policy.js';

export interface ResolvedProviderCredential {
  readonly protocol: ProviderProtocol;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model: string;
  readonly maxTokens?: number;
}

/** What a client sends on one request. Every field may be omitted or empty: that is exactly the signal
 *  `createStoredExecutionCredentialPort` reads as "fall back to the stored credential". */
export interface RequestSuppliedProviderConfig {
  readonly protocol?: unknown;
  readonly apiKey?: unknown;
  readonly baseUrl?: unknown;
  readonly model?: unknown;
  readonly maxTokens?: unknown;
}

/** A host's stored credential row, already decrypted. `protocol` is unvalidated text. */
export interface StoredProviderCredential {
  readonly protocol: string;
  readonly apiKey: string;
  readonly model: string | null;
  readonly baseUrl: string | null;
  readonly maxTokens: number | null;
}

export interface ExecutionCredentialPort {
  /** `null` for "no usable credential". Identity-scoped and async because a stored backing reads a
   *  `(workspace, principal)` row and decrypts it; the request-only port ignores the identity fields. */
  resolve(input: { requestBody: RequestSuppliedProviderConfig; workspaceId: string; principalId: string }): Promise<ResolvedProviderCredential | null>;
}

const VALID_PROTOCOLS = new Set(['anthropic', 'openai', 'azure', 'google']);

/** `requestBody.protocol`'s own field parse, split out of `parseRequestSuppliedCredential` to keep its
 *  complexity under the ceiling; behaviour is unchanged. */
function parseProtocol({ value }: { value: unknown }, _options = {}): ProviderProtocol | null {
  return typeof value === 'string' && VALID_PROTOCOLS.has(value) ? (value as ProviderProtocol) : null;
}

/** A required, non-blank string field (`apiKey`/`model`). */
function parseRequiredString({ value }: { value: unknown }, _options = {}): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** An optional, non-blank string field (`baseUrl`). */
function parseOptionalString({ value }: { value: unknown }, _options = {}): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** `requestBody.maxTokens`'s own field parse: a positive number or nothing. */
function parseMaxTokens({ value }: { value: unknown }, _options = {}): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** Pure parse of a client-supplied config: no I/O, `null` when any required field is missing or invalid. */
function parseRequestSuppliedCredential(requestBody: RequestSuppliedProviderConfig): ResolvedProviderCredential | null {
  const protocol = parseProtocol({ value: requestBody.protocol });
  if (!protocol) return null;
  const apiKey = parseRequiredString({ value: requestBody.apiKey });
  if (!apiKey) return null;
  const model = parseRequiredString({ value: requestBody.model });
  if (!model) return null;
  const baseUrl = parseOptionalString({ value: requestBody.baseUrl });
  const maxTokens = parseMaxTokens({ value: requestBody.maxTokens });
  return {
    protocol,
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

/**
 * Trusts ONLY the credential sent on this one request: never reads a store, never writes anything.
 * @complexity O(1).
 */
export function createRequestSuppliedExecutionCredentialPort(_options = {}): ExecutionCredentialPort {
  return {
    async resolve({ requestBody }) {
      return parseRequestSuppliedCredential(requestBody);
    },
  };
}

/**
 * Request-supplied credential first; otherwise the host's stored row. A stored row whose protocol this
 * package cannot dispatch, or with no model set (turns always need a model), is unusable.
 * `readStored` must not throw for an undecryptable row: it returns `null`.
 * @complexity O(1): at most one `readStored` call, only when the request supplied nothing usable.
 */
export function createStoredExecutionCredentialPort(
  { readStored }: { readStored: (required: { workspaceId: string; principalId: string }) => Promise<StoredProviderCredential | null> },
  _options = {},
): ExecutionCredentialPort {
  return {
    async resolve({ requestBody, workspaceId, principalId }) {
      const requestSupplied = parseRequestSuppliedCredential(requestBody);
      if (requestSupplied) return requestSupplied;

      const stored = await readStored({ workspaceId, principalId });
      if (!stored) return null;
      if (!VALID_PROTOCOLS.has(stored.protocol)) return null;
      if (!stored.model || stored.model.trim().length === 0) return null;
      return {
        protocol: stored.protocol as ProviderProtocol,
        apiKey: stored.apiKey,
        model: stored.model,
        ...(stored.baseUrl ? { baseUrl: stored.baseUrl } : {}),
        ...(stored.maxTokens !== null ? { maxTokens: stored.maxTokens } : {}),
      };
    },
  };
}
```

### J2. `packages/agent-runtime/package.json` (each OLD occurs exactly once)
1. jini.entries: OLD `      "./providers/sse-decode": "universal",` NEW
```
      "./providers/sse-decode": "universal",
      "./providers/credentials": "universal",
```
2. exports: OLD
```
    "./providers/sse-decode": {
      "types": "./dist/providers/sse-decode.d.ts",
      "import": "./dist/providers/sse-decode.js",
      "default": "./dist/providers/sse-decode.js"
    },
```
NEW: the same 5 lines followed by
```
    "./providers/credentials": {
      "types": "./dist/providers/credentials.d.ts",
      "import": "./dist/providers/credentials.js",
      "default": "./dist/providers/credentials.js"
    },
```
3. typesVersions: OLD
```
      "providers/sse-decode": [
        "./dist/providers/sse-decode.d.ts"
      ],
```
NEW: the same 3 lines followed by
```
      "providers/credentials": [
        "./dist/providers/credentials.d.ts"
      ],
```
(If the `providers/sse-decode` typesVersions entry is the LAST in its object, i.e. its `]` has no trailing comma, STOP: the sheet's comma layout is wrong.) Validate JSON (COMMON checks).

### J3. `packages/agent-runtime/README.md`: after the exact line `| \`@jini-ai/agent-runtime/providers/sse-decode\` | Universal | Inbound SSE frame decoder over an async iterable |` insert
```
| `@jini-ai/agent-runtime/providers/credentials` | Universal | Bring-your-own-key credential resolution: request-supplied first, then a host-stored row through an injected `readStored` |
```

### J4. NEW `packages/agent-runtime/src/providers/__tests__/credentials.test.ts` (exact content)
```ts
import { describe, expect, test } from 'vitest';
import { createRequestSuppliedExecutionCredentialPort, createStoredExecutionCredentialPort, type StoredProviderCredential } from '../credentials.js';

const ids = { workspaceId: 'w', principalId: 'p' };
const complete = { protocol: 'anthropic', apiKey: 'k', model: 'm' };
const stored = (row: Partial<StoredProviderCredential> = {}): StoredProviderCredential =>
  ({ protocol: 'openai', apiKey: 'sk', model: 'gpt', baseUrl: null, maxTokens: null, ...row });

describe('provider credentials', () => {
  test('request-supplied: complete config resolves; optional fields carried only when usable', async () => {
    const port = createRequestSuppliedExecutionCredentialPort();
    await expect(port.resolve({ requestBody: complete, ...ids })).resolves.toEqual(complete);
    await expect(port.resolve({ requestBody: { ...complete, baseUrl: 'https://x.test', maxTokens: 9 }, ...ids }))
      .resolves.toEqual({ ...complete, baseUrl: 'https://x.test', maxTokens: 9 });
    await expect(port.resolve({ requestBody: { ...complete, baseUrl: '  ', maxTokens: 0 }, ...ids })).resolves.toEqual(complete);
    for (const broken of [{ ...complete, protocol: 'other' }, { ...complete, apiKey: ' ' }, { ...complete, model: undefined }]) {
      await expect(port.resolve({ requestBody: broken, ...ids })).resolves.toBeNull();
    }
  });

  test('stored: the request wins without a read; otherwise the identity-scoped row is used', async () => {
    const reads: unknown[] = [];
    const port = createStoredExecutionCredentialPort({ readStored: async (identity) => { reads.push(identity); return stored({ baseUrl: 'https://b.test', maxTokens: 5 }); } });
    await expect(port.resolve({ requestBody: complete, ...ids })).resolves.toEqual(complete);
    expect(reads).toEqual([]);
    await expect(port.resolve({ requestBody: { apiKey: '' }, ...ids }))
      .resolves.toEqual({ protocol: 'openai', apiKey: 'sk', model: 'gpt', baseUrl: 'https://b.test', maxTokens: 5 });
    expect(reads).toEqual([ids]);
  });

  test('stored: no row, unknown protocol or blank model resolves null', async () => {
    for (const row of [null, stored({ protocol: 'other' }), stored({ model: null }), stored({ model: ' ' })]) {
      const port = createStoredExecutionCredentialPort({ readStored: async () => row });
      await expect(port.resolve({ requestBody: {}, ...ids })).resolves.toBeNull();
    }
  });
});
```

### J5. Changeset `.changeset/agent-runtime-provider-credentials.md`
```
---
"@jini-ai/agent-runtime": minor
---

Add `@jini-ai/agent-runtime/providers/credentials`: bring-your-own-key credential resolution (`createRequestSuppliedExecutionCredentialPort`, `createStoredExecutionCredentialPort` with an injected `readStored`), request-supplied first, then the host's stored row.
```

### J6. Checks + commit
Rule checks (2, 5: only `./provider-tool-policy.js` type import; 8: no env). eslint credentials.ts + test. Commit: credentials.ts, the test, package.json, README.md, the changeset.
jini_msg: `feat(agent-runtime): providers/credentials BYOK resolution with an injected stored read` | body: "Moved from a host's assistant. The host keeps its vault-backed stored-row read and its route."

## T. Tovu (commit 2)

### T1. REPLACE `apps/website/src/assistant/byok-credential.ts` with the content below, where `{SEALER_IMPORT}` is the file's CURRENT `import type { SecretSealerPort } from ...;` line copied byte for byte (post-wave it reads `import type { SecretSealerPort } from "@jini-ai/integrations/webhooks";`):
```ts
/**
 * @file Tovu's stored BYOK credential binding. Resolution order and parsing live in
 * `@jini-ai/agent-runtime/providers/credentials` (`createStoredExecutionCredentialPort`); Tovu binds the
 * admin's own `(workspaceId, principalId)` row from `execution-credential-store.ts` (design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved). A request-
 * supplied key still wins, mirroring the `useStoredCredential` pattern of
 * `apps/admin/src/lib/execution-settings.ts` for the test-connection/list-models routes.
 */

import { createStoredExecutionCredentialPort as createJiniStoredExecutionCredentialPort, type ExecutionCredentialPort } from "@jini-ai/agent-runtime/providers/credentials";
import { resolveExecutionCredential, type AdminExecutionCredentialRepoPort } from "./execution-credential-store.js";
{SEALER_IMPORT}

export interface StoredExecutionCredentialPortDeps {
  repo: AdminExecutionCredentialRepoPort;
  sealer: SecretSealerPort;
}

/**
 * The port `assistant-byok.ts` constructs. A decrypt failure on the stored row degrades to `null`
 * (`resolveExecutionCredential`'s never-throws contract), which `assistant-byok.ts` treats as an ordinary 400.
 * @complexity O(1): at most one repo read plus one decrypt.
 */
export function createStoredExecutionCredentialPort(deps: StoredExecutionCredentialPortDeps): ExecutionCredentialPort {
  return createJiniStoredExecutionCredentialPort({ readStored: (input) => resolveExecutionCredential({ deps, input }) });
}
```
(`resolveExecutionCredential` returns `ResolvedAdminExecutionCredential` = `{ apiKey; protocol; providerId; baseUrl; model; maxTokens }`, structurally assignable to `StoredProviderCredential` (extra `providerId` is fine); its `input` takes `UUID`, which is a plain `string` alias in `@jini-ai/core/primitives`. If eslint/type-aware lint reports either assignment as an error: STOP.)

### T2. `apps/website/src/assistant/index.ts` (each OLD exactly once)
OLD
```ts
// `createRequestSuppliedExecutionCredentialPort` (the request-only port variant) has no external
// caller today — kept internal. `createStoredExecutionCredentialPort` is the one
// `assistant-byok.ts` actually constructs.
export { createStoredExecutionCredentialPort } from "./byok-credential.js";
export type { ExecutionCredentialPort, ResolvedByokCredential, RequestSuppliedByokConfig } from "./byok-credential.js";
```
NEW
```ts
// `createStoredExecutionCredentialPort` is Tovu's stored-row binding of the Jini credentials port
// (`@jini-ai/agent-runtime/providers/credentials`, which also owns the credential types).
export { createStoredExecutionCredentialPort } from "./byok-credential.js";
```

### T3. `apps/website/src/server/runtime/composition/modules/assistant-byok.ts` (each OLD exactly once)
1. OLD
```ts
  createStoredExecutionCredentialPort,
  type ExecutionCredentialPort,
  type RequestSuppliedByokConfig,
  type ResolvedByokCredential,
```
NEW
```ts
  createStoredExecutionCredentialPort,
```
2. After the exact line `import type { Principal, SurfaceEmission, SurfaceEmitter } from "@jini-ai/core";` insert
```ts
import type { ExecutionCredentialPort, RequestSuppliedProviderConfig as RequestSuppliedByokConfig, ResolvedProviderCredential as ResolvedByokCredential } from "@jini-ai/agent-runtime/providers/credentials";
```
(No other line of the file changes.)

### T4. `apps/website/src/assistant/__tests__/byok-credential.test.ts`: OLD
```ts
import {
  createRequestSuppliedExecutionCredentialPort,
  createStoredExecutionCredentialPort,
} from "../byok-credential.js";
```
NEW
```ts
import { createRequestSuppliedExecutionCredentialPort } from "@jini-ai/agent-runtime/providers/credentials";
import { createStoredExecutionCredentialPort } from "../byok-credential.js";
```
All 14+ test bodies stay byte-identical (the stored ones prove Tovu's binding against the real repo + sealer; the request ones now prove the Jini port through the host).

### T5. Census + checks + commit
Census: `rg -n "ResolvedByokCredential|RequestSuppliedByokConfig|ExecutionCredentialPort\b|parseRequestSuppliedCredential|parseByok" apps/website/src --glob '!**/node_modules/**'` | allowed: `assistant-byok.ts` (the alias import + its existing uses at ~385/390/414/417), `assistant/byok-credential.ts` (`ExecutionCredentialPort` import/return type), `assistant/__tests__/byok-credential.test.ts` comment line 14. Any other hit: STOP. Comment mentions in `server/routes/types.ts:359` and `features/site-inspection/site-profile.ts:53` name `createStoredExecutionCredentialPort` / `byok-credential.ts`, which still exist: leave them.
eslint the 4 Tovu files (new Jini specifier unresolved until D1 link: record). Commit the 4 paths.
tovu_msg: `refactor(assistant): BYOK credential resolution from @jini-ai/agent-runtime/providers/credentials` | body: "Tovu keeps the vault-backed stored-row binding (createStoredExecutionCredentialPort) and its route; the parse, precedence and stored-row checks are Jini's."
extra_stops: `assistant-byok.ts` has a second import of `#src/assistant/index` that also names one of the 3 types -> STOP.
Cloud run owes: Jini vitest `providers/__tests__/credentials.test.ts`; agent-runtime typecheck; subpath isolation (new universal entry); published-types check sees the new subpath. Tovu: node:test `byok-credential.test.ts` (all green, unchanged bodies), website typecheck.
