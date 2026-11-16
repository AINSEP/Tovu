# audit:C06 admin/lib agent inventory snapshot -> `@jini-ai/chat/browser/agent-inventory` (template T-MOVE)

Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092 (unattended planning run; nothing executed).
untangle_overlap: none (no `*.repoint.tsv` row names `apps/admin/src/lib/assistant-agents-snapshot.ts` or its importers' import lines; `wave-b/*` touches no `packages/chat/src/embed-widget/browser/**` and no `packages/chat/package.json` — checked `git diff --name-only origin/refactor/terra...origin/wave-b/<each> -- packages/chat`). Runs before or after the wave-B merge.
Tier: Sonnet 5.5 high, ~35k.

## Shape decision
- The generic part is "last-known inventory placeholder in fail-soft storage": versionable key, shape guard (`id`/`name` strings), never store an empty list, never throw. It moves as a factory over an injected storage port, generic in the entry type, so Jini has no `localStorage` global (same rule as the sibling `browser/session-store`, whose doc says "No browser global or storage backend is selected here") and no dependency on `ChatPaneAgent` (React feature type; the browser entry must not reach `react/`).
- Tovu keeps `apps/admin/src/lib/assistant-agents-snapshot.ts` as the BINDING (the storage key `tovu.admin.assistant-agents.v1`, the choice of `localStorage`, the `ChatPaneAgent` type) with its exported API unchanged. Not a rule-19 forwarder: it owns the key and storage choice. It keeps 4 importers (1 hook, 3 tests that pre-seed through `writeAgentsSnapshot`) untouched.
- Placement: `src/embed-widget/browser/agent-inventory.ts`, beside `session-store.ts`, published as `./browser/agent-inventory` (runtime `browser`), the same pattern as the three existing `./browser/*` subpaths.

```
id: MV-agent-inventory-1
feature: audit:C06 admin/lib (agent inventory snapshot)
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
tovu_files:
  - apps/admin/src/lib/assistant-agents-snapshot.ts | blob b866b63243a1ccfa08edbd6aa73e59e24df9c5a6 | reduce-to-binding
  - apps/admin/src/lib/__tests__/assistant-agents-snapshot.unit.test.ts | blob c12193276167c11fad62638fff28fcf92615130a | keep unchanged (binding-level characterization; must stay green)
jini_guards:
  - packages/chat/package.json | blob 976cf011d47edff3a108bb3659171bb3dfa9fd34
  - packages/chat/src/embed-widget/browser/session-store.ts | blob a424704475d4b7815facad22de7b2b64c4d80aca (imported for its SessionStoragePort type)
  - packages/chat/src/embed-widget/browser/agent-inventory.ts must not exist
  - rg -n "agent-inventory|AgentInventory" packages/chat/src packages/chat/package.json -> prints nothing
importers (unchanged; census proves it): apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:31 (blob 421061e033055ad94a9d26ba2fdb16a8c83c0b8a), components/__tests__/AssistantDock.hooks.unit.test.tsx:135, AssistantDock.execution-refresh.unit.test.tsx:16, AssistantDock.unit.test.tsx:62; comment-only: AssistantDock.hooks.tsx:1429
non_reexport_statements: 4 (STORAGE_KEY, isAgentShape, readAgentsSnapshot, writeAgentsSnapshot)
split: isAgentShape, read/write bodies, empty-list rule, fail-soft catches -> Jini | STORAGE_KEY, localStorage, ChatPaneAgent typing, Tovu why ("agents.ts on the website side warns…", "Local CLI picker", ~4s cold daemon) -> Tovu binding
deps: none (type import from own leaf `./session-store.js` only; COMMON rule 5)
```

## Jini (commit 1)

### J1 NEW `packages/chat/src/embed-widget/browser/agent-inventory.ts` (exact)
```ts
/**
 * @file Last-known agent inventory as an instant placeholder.
 *
 * A host that lists agents from a slow source (a cold daemon re-probing installed CLIs) can show the
 * last live answer this browser saw instead of an empty picker, and swap it for the live list the
 * moment that resolves. The last live answer is the same machine's own probe result, usually still
 * exact, whereas a list bundled into the client would be a hand-maintained duplicate of the server's
 * registry that drifts.
 *
 * Every storage access is fail-soft: browser storage throws in some privacy modes and on quota
 * exhaustion, and a missing placeholder only costs the host's normal loading state.
 */
import type { SessionStoragePort } from './session-store.js';

/** The fields a stored entry must carry to be trusted; hosts may store richer entries. */
export interface AgentInventoryEntry {
  readonly id: string;
  readonly name: string;
}

export interface AgentInventorySnapshot<T extends AgentInventoryEntry> {
  /** The last stored inventory, or `undefined` when there is none, it is empty, or it is unreadable. */
  read(args: Record<string, never>): readonly T[] | undefined;
  /** Stores a live inventory. An empty list is not stored: it would replace a useful placeholder with
   * one that shows nothing. Silent no-op on any storage failure. */
  write(args: { agents: readonly T[] }): void;
}

export interface AgentInventorySnapshotArgs {
  readonly storage: Pick<SessionStoragePort, 'getItem' | 'setItem'>;
  /** Version the key so a later change to the stored shape ignores old entries instead of misreading them. */
  readonly key: string;
}

function isEntryShape(value: unknown): value is AgentInventoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; name?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.name === 'string';
}

/** @complexity read/write O(n) in stored agents. */
export function createAgentInventorySnapshot<T extends AgentInventoryEntry>(
  { storage, key }: AgentInventorySnapshotArgs,
  _optional: { readonly [K in never]?: never } = {},
): AgentInventorySnapshot<T> {
  return {
    read: () => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isEntryShape)) return undefined;
        return parsed as T[];
      } catch {
        return undefined;
      }
    },
    write: ({ agents }) => {
      if (agents.length === 0) return;
      try {
        storage.setItem(key, JSON.stringify(agents));
      } catch {
        // Best-effort: the live list is already on screen; only the next cold load loses its placeholder.
      }
    },
  };
}
```
EXECUTOR: COMMON rule 10 forbids `_optional?: Record<string, never>` but requires the outer `= {}`; the parameter above (`_optional: { readonly [K in never]?: never } = {}`) is a placeholder of that shape. If eslint reports `@typescript-eslint/no-unused-vars` on it, rename to `{}: Record<string, never> = {}` only if that also lints clean; otherwise drop the second parameter entirely (the function then takes only `required`, which rule 10 permits when there is no optional input) — do not add a suppression.

### J2 NEW `packages/chat/src/embed-widget/browser/__tests__/agent-inventory.test.ts` (ported from the Tovu unit test, with an in-memory storage double instead of jsdom localStorage)
```ts
import { describe, expect, it } from 'vitest';
import { createAgentInventorySnapshot } from '../agent-inventory.js';

const KEY = 'example.agents.v1';
function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); }, items };
}

describe('agent inventory snapshot', () => {
  it('round-trips a live list, keeping extra fields', () => {
    const snapshot = createAgentInventorySnapshot<{ id: string; name: string; models?: { id: string; label: string }[] }>({ storage: memoryStorage(), key: KEY });
    snapshot.write({ agents: [{ id: 'cli', name: 'CLI', models: [{ id: 'm', label: 'M' }] }] });
    expect(snapshot.read({})).toEqual([{ id: 'cli', name: 'CLI', models: [{ id: 'm', label: 'M' }] }]);
  });
  it('reads undefined when nothing is stored', () => {
    expect(createAgentInventorySnapshot({ storage: memoryStorage(), key: KEY }).read({})).toBeUndefined();
  });
  it('does not store an empty list over a useful one', () => {
    const snapshot = createAgentInventorySnapshot({ storage: memoryStorage(), key: KEY });
    snapshot.write({ agents: [{ id: 'cli', name: 'CLI' }] });
    snapshot.write({ agents: [] });
    expect(snapshot.read({})).toEqual([{ id: 'cli', name: 'CLI' }]);
  });
  it.each([
    ['corrupt JSON', '{not json'],
    ['a non-array', JSON.stringify({ id: 'cli' })],
    ['an empty array', '[]'],
    ['an entry without a string id/name', JSON.stringify([{ id: 'cli', name: 'CLI' }, { id: 7 }])],
    ['a null entry', JSON.stringify([{ id: 'cli', name: 'CLI' }, null])],
    ['a bare-string entry', JSON.stringify(['cli'])],
  ])('reads undefined for %s', (_label, raw) => {
    expect(createAgentInventorySnapshot({ storage: memoryStorage({ [KEY]: raw }), key: KEY }).read({})).toBeUndefined();
  });
  it('reads undefined, without throwing, when storage throws', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => undefined };
    expect(createAgentInventorySnapshot({ storage, key: KEY }).read({})).toBeUndefined();
  });
  it('writes nothing, without throwing, when storage throws', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => createAgentInventorySnapshot({ storage, key: KEY }).write({ agents: [{ id: 'cli', name: 'CLI' }] })).not.toThrow();
  });
});
```

### J3 packages/chat/package.json (three insertions, mirroring `./browser/session-store`)
- `jini.entries`: after `"./browser/session-store": "browser",` (l.35) add `"./browser/agent-inventory": "browser",`
- `exports`: after the `"./browser/session-store": { … }` block (l.166-170) add
  `"./browser/agent-inventory": { "types": "./dist/embed-widget/browser/agent-inventory.d.ts", "import": "./dist/embed-widget/browser/agent-inventory.js", "default": "./dist/embed-widget/browser/agent-inventory.js" },`
- `typesVersions` map: after `"browser/session-store": [ "./dist/embed-widget/browser/session-store.d.ts" ],` (l.330-332) add `"browser/agent-inventory": [ "./dist/embed-widget/browser/agent-inventory.d.ts" ],`
- If `package.json` has a `neutralEntries`/subpath list that the other three `browser/*` entries also appear in, add the new one there the same way; `rg -n "browser/session-store" packages/chat/package.json` must show the new name on every line it shows session-store.
### J4 README: packages/chat/README.md l.200 sentence: "`transports/fetch-sse`, `browser/session-store` and `browser/frontend-session-bridge` subpaths are published." -> "`transports/fetch-sse`, `browser/session-store`, `browser/agent-inventory` (last-known agent list as a fail-soft placeholder) and `browser/frontend-session-bridge` subpaths are published."
### J5 changeset `.changeset/chat-browser-agent-inventory.md`: `"@jini-ai/chat": minor` | "New `@jini-ai/chat/browser/agent-inventory` subpath: `createAgentInventorySnapshot` keeps the last live agent list in host-supplied storage as a fail-soft placeholder."
jini_msg: "feat(chat): browser agent-inventory snapshot"

## Tovu (commit 2)

### T1 `apps/admin/src/lib/assistant-agents-snapshot.ts` (whole new content; header kept, generic sentences reduced)
```ts
import type { ChatPaneAgent } from "@jini-ai/chat/react";
import { createAgentInventorySnapshot } from "@jini-ai/chat/browser/agent-inventory";

/**
 * @file The assistant picker's instant placeholder: the last `/api/agents` inventory this browser
 * saw, kept in `localStorage` so the Local CLI picker has something real to show while a cold
 * daemon re-probes every installed CLI (~4s after a daemon restart).
 *
 * Why the last live answer rather than a static list shipped in the bundle: the only source of
 * agent defs is `@jini-ai/agent-runtime`, which is Node-only, and `agents.ts` on the website side
 * warns that a hardcoded client list offers agents whose run then fails. `ChatPane` swaps the
 * placeholder for the live list the moment `listAgents` resolves. Storage failures are absorbed by
 * the shared snapshot (`@jini-ai/chat/browser/agent-inventory`).
 */

/** Versioned so a future change to the stored shape can ignore old entries instead of misreading them. */
const STORAGE_KEY = "tovu.admin.assistant-agents.v1";

// Lazy property access: reading `localStorage` itself can throw in some privacy modes, and the shared
// snapshot only absorbs errors raised inside its own calls.
const snapshot = createAgentInventorySnapshot<ChatPaneAgent>({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
  key: STORAGE_KEY,
});

/** The last stored inventory, or `undefined` when there is none, it is empty, or it is unreadable. */
export function readAgentsSnapshot(): readonly ChatPaneAgent[] | undefined {
  return snapshot.read({});
}

/** Stores a live inventory for the next cold load (empty lists are ignored; never throws). */
export function writeAgentsSnapshot(agents: readonly ChatPaneAgent[]): void {
  snapshot.write({ agents });
}
```
behaviour_diff: key, guard, empty-list rule, catch scope (both catch around the storage calls and JSON.parse), return values: same. The Tovu unit test (jsdom `localStorage` + `Storage.prototype` spies) stays unchanged and is the proof: `vi.spyOn(Storage.prototype, "getItem")` still intercepts because the binding calls `localStorage.getItem` at call time.
```
failing_test: -  (pure move)
census: python3 M/scripts/census.py . apps/admin/src/lib/assistant-agents-snapshot.ts | allowed: [AssistantDock.hooks.tsx:31, :1429 (comment), the 3 AssistantDock tests + lib/__tests__/assistant-agents-snapshot.unit.test.ts:3]
rule checks: rg -n -i "tovu|site-chat|apps/(admin|website|desktop)" on J1/J2 -> nothing; rg -n "localStorage|window\." J1 -> nothing
eslint expectation: Tovu unresolved-import for `@jini-ai/chat/browser/agent-inventory` until the clone is linked (D1) — record, do not fix.
bundle_check: admin bundle only (not public); no threshold.
tovu_msg: "refactor(admin): agent inventory placeholder uses @jini-ai/chat/browser/agent-inventory"
```
