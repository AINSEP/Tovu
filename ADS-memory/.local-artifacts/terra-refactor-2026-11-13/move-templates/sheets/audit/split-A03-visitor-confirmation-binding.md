# SP-audit-A03-1: bound confirmation gate + bound confirmations -> `@jini-ai/daemon/surface-exchanges` (template T-SPLIT)

Source: AUDIT-ADDITIONS `audit:A03` (ACCEPT, startable now, security tier). Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092.
untangle_overlap: NONE. `rg` over `untangle/sheets/*.repoint.tsv` (C1..C11, R-BARRELS) for `visitor-confirmation`, `visitor-executor`, `site-assistant.ts` composition import lines of these two files: no row names either Tovu file or `packages/daemon/src/surface-exchanges.ts`. Can run before or after wave B; if wave B has merged first, the blob guards below decide (a changed blob = SKIP, re-sheet).
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base  BRANCH=refactor/terra
Order: J (Jini, one commit) -> T (Tovu, one commit). Tier: Sonnet 5.5 high executor + Opus review of the diff (security: digest binding, claim-before-await). est. executor tokens: ~55k.

## Design decisions made here (executor makes none)
- Target: a NEW leaf `packages/daemon/src/bound-confirmations.ts`, re-exported from the existing `./surface-exchanges` subpath file (one `export *` line). No new subpath, no `package.json` edit. The leaf is `universal`-safe: it imports only `@jini-ai/core`, `@jini-ai/core/records` and TYPES from `./tool-executor.js` (type-only imports do not count for subpath isolation; `scripts/check-subpath-isolation.ts:310`).
- `sameFrontendOwner` lives in `frontend-session-registry.ts`, which imports `node:crypto`; importing it at runtime would break the `universal` entry. So the owner comparison is an injected `sameOwner` port and the owner type is a generic `TOwner`. Tovu binds `sameFrontendOwner`.
- Everything Tovu-specific is a required value, never a Jini default: exchange principal `"anonymous-visitor"`, exchange channel `"visitor-tool-confirmation"`, caps `{ maxHeld: 20, perQuotaKey: 2 }`, the directive wire shape (`channel: "client_directive"`, `kind: "tool_confirmation"`), copy and policy reading. Jini has no default for any of them, so no other Jini caller can change behaviour.
- The IP becomes a neutral `quotaKey` in Jini. The Tovu `VisitorConfirmationRequest` type (with `ip`, `title`, `summary`, typed `emit`) is UNCHANGED, so `visitor-executor.ts`, `visitor-execution-ports.ts`, `site-assistant.ts`, `visitor-services.ts` and all Tovu tests compile untouched.
- Gate: the policy decision (`decide`), the live-vs-captured comparison (`isCurrent`) and the prompt (`requestApproval`) are ports. Jini keeps the generic security mechanism: capture snapshot + input digest at the prompt, re-validate after the click AND immediately before the handler, single-use approval, resume-on-every-path, report-not-throw on resume failure. `isCurrent` is evaluated BEFORE the abort check, exactly matching today's evaluation order (Tovu computes the publication read before `!ports.signal?.aborted`).
- Jini's gate returns `isApproved(...) -> Promise<boolean>`; the Tovu wrapper keeps `assertApproved` and throws its own `VisitorPlanRefused` (refusal copy stays in Tovu).
- Tests: every existing Tovu test stays where it is and stays byte-identical (they exercise the Tovu wrappers end to end through real Jini exchanges, which is still the Tovu contract). Jini gains its own unit test of the generic halves. Pure move: no behaviour change, no failing-test-first.
- `mcp-ui-allowlist-completeness.test.ts`: the `exchanges.open(...)` call leaves the Tovu file, so its `DYNAMIC_BINDINGS` entry is dead; delete it (the test has no stale-entry check, so this is tightening only: a future unresolved `open` in that file fails closed again).

## Guards
Tovu (blob): `apps/website/src/assistant/site/visitor-confirmation-gate.ts` 95964a3e9a1fa1e922f4e5da48415dccb8e9287d; `apps/website/src/assistant/site/visitor-confirmations.ts` f8bf096c3a3d3bbb3b982313b152b0cdad412e66. Text guard: `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts` contains the T3 OLD block exactly once.
Jini (blob): `packages/daemon/src/surface-exchanges.ts` 469fa0eaeb47718feff16639cdb327f8f9fe52f4. Absent: `packages/daemon/src/bound-confirmations.ts`, `packages/daemon/src/__tests__/bound-confirmations.test.ts`; `rg -n "BoundConfirmation" packages` prints nothing.

## split (every top-level declaration)
`visitor-confirmation-gate.ts`:
  - VisitorPlanRefused (10) | STAY-PRODUCT (refusal copy)
  - CONFIRMATION_COPY (14) | STAY-PRODUCT
  - confirmationCopy (31) | STAY-PRODUCT
  - createVisitorConfirmationGate (50) | SPLIT: approval map, resumeSafely, capture/validate/digest, delegate, assert/forget -> `createBoundConfirmationGate`; policy mode/forced decision, publication check, binding+copy -> Tovu ports (`decideVisitorConfirmation` new local helper)
`visitor-confirmations.ts`:
  - VISITOR_CONFIRMATION_WAIT_MS (6), ToolConfirmationDirective (7), VisitorConfirmationRequest (8), VisitorConfirmations (16) | STAY-WIRING (unchanged)
  - createVisitorConfirmations (26) | SPLIT: pending/turns/quota caps, open/deliver/send/receive/cleanup, owner check, claim-before-await -> `createBoundConfirmations`; principal/channel/caps values, directive shape, ip->quotaKey mapping STAY

ports:
  - sameOwner: `(required: { expected: TOwner; actual: TOwner | undefined }) => boolean` | Tovu binds `sameFrontendOwner` | why: owner shape + its comparator live in a node-only file
  - emission: `(required: { challengeId: string }) => SurfaceEmission` | Tovu builds `{ channel: "client_directive", payload: { kind: "tool_confirmation", challengeId, title, summary } }` | why: widget wire shape + copy
  - emit: `(required: { payload: unknown }) => void` | Tovu forwards to its typed directive emitter
  - gate `readSnapshot` / `decide` / `isCurrent` / `requestApproval` / `reportError` / `signal` | bound in `createVisitorConfirmationGate` (T1) | why: visitor policy table, publication revision, IP binding, copy

## J. Jini (commit 1)

### J1. NEW `packages/daemon/src/bound-confirmations.ts` (exact content)
```ts
/**
 * @file Human confirmation bound to one exact tool execution, for surfaces whose answering human holds no
 * principal (for example an anonymous page visitor). Two halves:
 * - `createBoundConfirmations` routes a single-use exchange answer back to a server-held binding, with a
 *   cap on held prompts, a cap per quota key, one prompt per run, and claim-before-await replies.
 * - `createBoundConfirmationGate` is an `ExecutionDelegate` that captures a policy snapshot and an input
 *   digest when it prompts, then re-validates both after the click AND immediately before the handler.
 * The host owns copy, policy reading, the prompt's wire shape and every cap value.
 */
import type { SurfaceEmission, SurfaceExchangeStore } from '@jini-ai/core';
import { canonicalArgumentDigest } from '@jini-ai/core/records';
import type { ExecutionDelegate, ToolConfirmationRequest, ToolExecutor } from './tool-executor.js';

/** The server-held execution a prompt answers for. No field of it is ever read from the answering client. */
export interface BoundConfirmationBinding<TOwner> {
  readonly runId: string;
  readonly executionId: string;
  /** Host-authenticated quota scope (for example the client address); never a browser claim. */
  readonly quotaKey: string;
  readonly owner?: TOwner;
}

export interface BoundConfirmationRequest<TOwner> {
  readonly binding: BoundConfirmationBinding<TOwner>;
  /** The human-only emission carrying the prompt; the host owns its wire shape and copy. */
  readonly emission: (required: { challengeId: string }) => SurfaceEmission;
  readonly emit: (required: { payload: unknown }) => void;
  /** Re-checked after the click; `false` or a throw denies. */
  readonly validate: () => Promise<boolean>;
  readonly signal?: AbortSignal;
}

export interface BoundConfirmations<TOwner> {
  request(required: BoundConfirmationRequest<TOwner>, optional?: Record<string, never>): Promise<boolean>;
  confirm(required: { challengeId: string; allow: boolean; owner?: TOwner }, optional?: Record<string, never>): Promise<boolean>;
}

/** @agent-note Host-wired. `principalId` and `channel` must be reserved for these prompts so no other
 *  answer route (an admin surface, another tool's exchange) can resolve them. */
export interface BoundConfirmationsDeps<TOwner> {
  readonly exchanges: SurfaceExchangeStore;
  readonly nowMs: () => number;
  readonly sameOwner: (required: { expected: TOwner; actual: TOwner | undefined }) => boolean;
  readonly principalId: string;
  readonly channel: string;
  readonly limits: { readonly maxHeld: number; readonly perQuotaKey: number };
}

interface HeldConfirmation<TOwner> {
  readonly owner?: TOwner | undefined;
  readonly validate: () => Promise<boolean>;
  readonly expiresAtMs: number;
  readonly deliver: (required: { allow: boolean }) => boolean;
}

/** The random exchange ID is a single-use bearer delivered only on its owning stream. The exchange store
 * owns expiry, buffering, abandonment and timer disposal. This map only routes the human's reply to the
 * server-held binding; no client or model field can retarget a pending execution.
 * @complexity O(1) routing; at most `limits.maxHeld` held prompts, `limits.perQuotaKey` per key, one per run.
 */
export function createBoundConfirmations<TOwner>(deps: BoundConfirmationsDeps<TOwner>, _options = {}): BoundConfirmations<TOwner> {
  const { exchanges, nowMs, principalId, channel, limits } = deps;
  const pending = new Map<string, HeldConfirmation<TOwner>>();
  const turns = new Set<string>();
  const quotaCounts = new Map<string, number>();

  /** Claimed replies are still held streams until finally, so count runs rather than live bearers. */
  function atCapacity({ binding }: { binding: BoundConfirmationBinding<TOwner> }, _optional = {}): boolean {
    return turns.size >= limits.maxHeld || turns.has(binding.runId) || (quotaCounts.get(binding.quotaKey) ?? 0) >= limits.perQuotaKey;
  }

  function releaseHeld({ binding }: { binding: BoundConfirmationBinding<TOwner> }, _optional = {}): void {
    turns.delete(binding.runId);
    const remaining = quotaCounts.get(binding.quotaKey)! - 1;
    if (remaining === 0) quotaCounts.delete(binding.quotaKey);
    else quotaCounts.set(binding.quotaKey, remaining);
  }

  return {
    async request(required, _optional = {}) {
      const { binding, signal } = required;
      const quotaCount = quotaCounts.get(binding.quotaKey) ?? 0;
      if (signal?.aborted || atCapacity({ binding })) return false;
      // Identity here is the unguessable human-only exchange ID, not a principal. The server retains
      // the full execution binding; caller input can supply none of these fields.
      const exchange = exchanges.open({ binding: { principalId, toolId: binding.executionId, channel },
        emit: async ({ payload }) => { required.emit({ payload }); } });
      turns.add(binding.runId);
      quotaCounts.set(binding.quotaKey, quotaCount + 1);
      pending.set(exchange.id, { owner: binding.owner, validate: required.validate, expiresAtMs: exchange.expiresAtMs(),
        deliver: ({ allow }) => exchanges.deliver({ exchangeId: exchange.id, principalId, params: { allow } },
          { toolId: binding.executionId, channel }).ok });
      const abandon = () => exchange.close({});
      signal?.addEventListener('abort', abandon, { once: true });
      try {
        await exchange.send({ emission: required.emission({ challengeId: exchange.id }) });
        const answer = await exchange.receive({});
        return answer.status === 'received' && answer.params.allow === true;
      } finally {
        pending.delete(exchange.id);
        releaseHeld({ binding });
        signal?.removeEventListener('abort', abandon);
        exchange.close({});
      }
    },
    async confirm({ challengeId, allow, owner }, _optional = {}) {
      const held = pending.get(challengeId);
      if (!held) return false;
      if (held.owner && !deps.sameOwner({ expected: held.owner, actual: owner })) return false;
      // Claim before any await: simultaneous clicks/replays cannot queue a second answer.
      pending.delete(challengeId);
      let valid = false;
      let delivered = false;
      try { valid = nowMs() < held.expiresAtMs && await held.validate(); }
      finally {
        valid = valid && nowMs() < held.expiresAtMs;
        delivered = held.deliver({ allow: valid && allow });
      }
      return valid && delivered;
    },
  };
}

/** @agent-note Host-wired policy for one surface. `readSnapshot` must carry a revision that changes on every
 *  write: a value hash cannot detect a changed-and-restored policy. */
export interface BoundConfirmationGatePorts<TSnapshot> {
  readonly readSnapshot: () => Promise<TSnapshot>;
  /** `"ask"` holds the execution for a human; `"deny"` resumes it denied. */
  readonly decide: (required: { request: ToolConfirmationRequest; snapshot: TSnapshot }) => 'ask' | 'deny';
  /** Whether the live snapshot still authorizes what the captured one did. Evaluated before the abort check. */
  readonly isCurrent: (required: { captured: TSnapshot; live: TSnapshot }) => boolean;
  readonly requestApproval: (required: { request: ToolConfirmationRequest; validate: () => Promise<boolean> }) => Promise<boolean>;
  readonly reportError: (required: { error: unknown }) => void;
  readonly signal?: AbortSignal;
}

export interface BoundConfirmationGate {
  readonly delegate: ExecutionDelegate;
  /** Single use: consumes the approval. `false` when none was given, it no longer validates, or the run aborted. */
  isApproved(required: { executionId: string; input: unknown }, optional?: Record<string, never>): Promise<boolean>;
  forget(required: { executionId: string }, optional?: Record<string, never>): void;
}

/** Each approval binds one immutable execution. Re-read the snapshot after the click and immediately
 * before the handler. IDs and argument digests never become model-facing results, and no values are
 * retained in the binding. Input is detached before execution.
 * @complexity O(1) per execution plus the host's snapshot reads and input hashing.
 */
export function createBoundConfirmationGate<TSnapshot>(
  { ports, resume }: { ports: BoundConfirmationGatePorts<TSnapshot>; resume: ToolExecutor['resumeConfirmation'] },
  _options = {},
): BoundConfirmationGate {
  const approved = new Map<string, (required: { input: unknown }) => Promise<boolean>>();

  /** A disconnect already cancels the executor's pending confirmation; never try to resurrect it.
   * Other cancellation paths may also settle it first; report a failed resume without rejecting.
   */
  function resumeSafely({ executionId, allow }: { executionId: string; allow: boolean }, _optional = {}): void {
    if (ports.signal?.aborted) return;
    try { resume({ executionId, decision: allow ? 'confirm' : 'deny' }); }
    catch (error) { ports.reportError({ error }); }
  }

  async function confirm({ request }: { request: ToolConfirmationRequest }, _optional = {}): Promise<void> {
    let allow = false;
    try {
      const captured = await ports.readSnapshot();
      if (ports.decide({ request, snapshot: captured }) !== 'ask') return;
      // An object envelope keeps omitted arguments JSON-serializable without changing handler input.
      const inputDigest = await canonicalArgumentDigest({ args: { input: request.input } });
      const validate = async ({ input }: { input: unknown }, _optional = {}) => {
        const live = await ports.readSnapshot();
        const current = ports.isCurrent({ captured, live });
        return !ports.signal?.aborted && current && await canonicalArgumentDigest({ args: { input } }) === inputDigest;
      };
      allow = await ports.requestApproval({ request, validate: () => validate({ input: request.input }) });
      if (allow) approved.set(request.executionId, validate);
    } catch (error) { ports.reportError({ error }); }
    finally {
      resumeSafely({ executionId: request.executionId, allow });
    }
  }

  const delegate: ExecutionDelegate = { onConfirm(request) {
    // Bare void is the executor's documented resumable seam. The async snapshot read ensures the
    // executor parks before even a synchronous click can call resumeConfirmation.
    void confirm({ request });
  } };
  return { delegate,
    async isApproved({ executionId, input }, _optional = {}) {
      const validate = approved.get(executionId);
      approved.delete(executionId);
      let valid = false;
      try { valid = Boolean(validate) && await validate!({ input }); }
      catch (error) { ports.reportError({ error }); }
      return valid && !ports.signal?.aborted;
    },
    forget({ executionId }, _optional = {}) { approved.delete(executionId); },
  };
}
```

### J2. `packages/daemon/src/surface-exchanges.ts`: after the exact line `export type { SchedulerPort } from './scheduler.js';` (1 occurrence) insert:
```ts
export * from './bound-confirmations.js';
```

### J3. NEW `packages/daemon/src/__tests__/bound-confirmations.test.ts` (exact content)
```ts
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createSurfaceExchangeStore } from '../surface-exchanges.js';
import { createBoundConfirmationGate, createBoundConfirmations, type BoundConfirmationRequest } from '../bound-confirmations.js';
import type { ToolConfirmationRequest } from '../tool-executor.js';

type Owner = { id: string };

/** Real exchange store; only time, ids and scheduling are replaced. */
function fixture() {
  let now = 0, sequence = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  const clock = { nowMs: () => now, nowIso: () => new Date(now).toISOString() };
  const exchanges = createSurfaceExchangeStore({ clock, idGenerator: { newId: () => String(++sequence).padStart(22, 'a') },
    defaultChannel: 'bound-test', scheduler: { schedule: ({ delayMs, callback }) => {
      const id = ++sequence;
      jobs.set(id, { at: now + delayMs, callback });
      return () => { jobs.delete(id); };
    } } }, { idleTtlMs: 60_000, maxLifetimeMs: 60_000 });
  const confirmations = createBoundConfirmations<Owner>({ exchanges, nowMs: clock.nowMs,
    sameOwner: ({ expected, actual }) => expected.id === actual?.id,
    principalId: 'anonymous', channel: 'bound-test', limits: { maxHeld: 3, perQuotaKey: 2 } });
  const payloads: Record<string, unknown>[] = [];
  const request = (overrides: Partial<BoundConfirmationRequest<Owner>> = {}): BoundConfirmationRequest<Owner> => ({
    binding: { runId: 'run', executionId: 'exec', quotaKey: 'key' },
    emission: ({ challengeId }) => ({ channel: 'prompt', payload: { challengeId } }),
    emit: ({ payload }) => { payloads.push(payload as Record<string, unknown>); },
    validate: async () => true, ...overrides });
  const challenge = async (index = 0): Promise<string> => {
    while (payloads.length <= index) await new Promise((resolve) => setImmediate(resolve));
    return payloads[index]!.challengeId as string;
  };
  return { exchanges, confirmations, request, challenge, jobs, advance(ms: number) {
    now += ms;
    for (const [id, job] of [...jobs]) if (job.at <= now && jobs.delete(id)) job.callback();
  } };
}

test('a single live challenge delivers once; forged and replayed answers are refused', async () => {
  const f = fixture();
  const waiting = f.confirmations.request(f.request());
  const challengeId = await f.challenge();
  assert.equal(await f.confirmations.confirm({ challengeId: 'forged', allow: true }), false);
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true }), true);
  assert.equal(await f.confirmations.confirm({ challengeId, allow: true }), false);
  assert.equal(await waiting, true);
  assert.equal(f.exchanges.size(), 0);
});

test('a different owner cannot answer; validation failure or expiry denies', async () => {
  const owned = fixture();
  const waiting = owned.confirmations.request(owned.request({ binding: { runId: 'run', executionId: 'exec', quotaKey: 'key', owner: { id: 'a' } } }));
  const challengeId = await owned.challenge();
  assert.equal(await owned.confirmations.confirm({ challengeId, allow: true, owner: { id: 'b' } }), false);
  assert.equal(await owned.confirmations.confirm({ challengeId, allow: true, owner: { id: 'a' } }), true);
  assert.equal(await waiting, true);
  for (const reason of ['changed', 'expires'] as const) {
    const f = fixture();
    const held = f.confirmations.request(f.request({ validate: async () => {
      if (reason === 'expires') f.advance(60_000);
      return reason !== 'changed';
    } }));
    assert.equal(await f.confirmations.confirm({ challengeId: await f.challenge(), allow: true }), false);
    assert.equal(await held, false);
  }
});

test('caps: one prompt per run, perQuotaKey per key and maxHeld overall', async () => {
  const f = fixture();
  const first = f.confirmations.request(f.request());
  assert.equal(await f.confirmations.request(f.request()), false);
  const second = f.confirmations.request(f.request({ binding: { runId: 'run-2', executionId: 'e2', quotaKey: 'key' } }));
  assert.equal(await f.confirmations.request(f.request({ binding: { runId: 'run-3', executionId: 'e3', quotaKey: 'key' } })), false);
  const third = f.confirmations.request(f.request({ binding: { runId: 'run-4', executionId: 'e4', quotaKey: 'other' } }));
  assert.equal(await f.confirmations.request(f.request({ binding: { runId: 'run-5', executionId: 'e5', quotaKey: 'third' } })), false);
  for (let index = 0; index < 3; index += 1) await f.confirmations.confirm({ challengeId: await f.challenge(index), allow: false });
  assert.deepEqual(await Promise.all([first, second, third]), [false, false, false]);
});

test('gate: approval binds the captured snapshot revision and the exact input, once', async () => {
  let revision = 1;
  const resumed: string[] = [];
  let approve: (() => void) | undefined;
  const gate = createBoundConfirmationGate<{ revision: number }>({
    resume: ({ decision }) => { resumed.push(decision); },
    ports: {
      readSnapshot: async () => ({ revision }),
      decide: () => 'ask',
      isCurrent: ({ captured, live }) => captured.revision === live.revision,
      requestApproval: async ({ validate }) => { await new Promise<void>((resolve) => { approve = resolve; }); return validate(); },
      reportError: ({ error }) => { throw error; },
    },
  });
  const request = (executionId: string) => ({ executionId, input: { q: 'x' }, tool: { id: 't' } }) as unknown as ToolConfirmationRequest;
  gate.delegate.onConfirm!(request('a'));
  while (!approve) await new Promise((resolve) => setImmediate(resolve));
  approve();
  while (resumed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(resumed, ['confirm']);
  assert.equal(await gate.isApproved({ executionId: 'a', input: { q: 'changed' } }), false);
  gate.delegate.onConfirm!(request('b'));
  approve = undefined;
  while (!approve) await new Promise((resolve) => setImmediate(resolve));
  approve();
  while (resumed.length === 1) await new Promise((resolve) => setImmediate(resolve));
  revision = 2;
  assert.equal(await gate.isApproved({ executionId: 'b', input: { q: 'x' } }), false);
  assert.equal(await gate.isApproved({ executionId: 'never', input: {} }), false);
});
```
If `ExecutionDelegate.onConfirm` is not optional in `tool-executor.ts`, drop the two `!` (literal consequence of an eslint `no-unnecessary-type-assertion` error; nothing else changes).

### J4. Changeset `.changeset/daemon-bound-confirmations.md`
```
---
"@jini-ai/daemon": minor
---

`@jini-ai/daemon/surface-exchanges` adds `createBoundConfirmations` (single-use, owner-checked, capped human confirmation exchanges bound to one execution) and `createBoundConfirmationGate` (an `ExecutionDelegate` that binds an approval to a policy snapshot revision and the exact input digest, re-validated after the click and before the handler).
```

### J5. Checks + commit
COMMON rule checks on `bound-confirmations.ts` (rule 2 `rg` must print nothing; rule 5: imports are `@jini-ai/core`, `@jini-ai/core/records`, `./tool-executor.js` type-only ONLY). eslint the 3 code files. Commit paths: `packages/daemon/src/bound-confirmations.ts`, `packages/daemon/src/surface-exchanges.ts`, `packages/daemon/src/__tests__/bound-confirmations.test.ts`, `.changeset/daemon-bound-confirmations.md`.
jini_msg: `feat(daemon): bound human confirmations for principal-less surfaces` | body: "Moved from a host's site assistant: single-use exchange routing with held-prompt caps and claim-before-await replies, plus an execution delegate that binds an approval to a snapshot revision and the input digest. Copy, policy, caps and wire shape are host-supplied."

## T. Tovu (commit 2)

### T1. REPLACE `apps/website/src/assistant/site/visitor-confirmation-gate.ts` with (exact content)
```ts
import { readVisitorPagePublication } from '#src/features/theme/visitor-publication';
/** Visitor policy, publication check and copy for Jini's bound confirmation gate. */
import { stripControlSequences } from "@jini-ai/core/text";
import type { ToolConfirmationRequest, ToolExecutor } from "@jini-ai/daemon";
import { createBoundConfirmationGate } from "@jini-ai/daemon/surface-exchanges";
import { resolveVisitorToolChoice } from "../../contracts/site-assistant/visitor-tools.js";
import type { VisitorExecutionPorts } from "./visitor-execution-ports.js";

/** A cancelled/revised held plan is refused without reporting an operational handler error. */
export class VisitorPlanRefused extends Error {
  constructor() { super("I can't help with that request here."); }
}

const CONFIRMATION_COPY: Readonly<Record<string, { title: string; summary: string; field?: string }>> = {
  search_published_entries: { title: "Allow search?", summary: "Search published entries", field: "query" },
  get_published_entry: { title: "Allow reading an entry?", summary: "Read a published entry", field: "slug" },
  list_categories: { title: "Allow listing categories?", summary: "List published categories." },
  'page.fill': { title: 'Allow filling this field?', summary: 'Fill the reviewed field on this page.' },
  'page.select_option': { title: 'Allow changing this selection?', summary: 'Change the reviewed selection on this page.' },
  'page.click': { title: 'Allow this action?', summary: 'Activate the reviewed control on this page.' },
  'page.navigate': { title: 'Allow navigation?', summary: 'Open a published public page.' },
  'page.scroll_to': { title: 'Allow scrolling?', summary: 'Scroll to public content.' },
  'page.highlight': { title: 'Allow highlighting?', summary: 'Highlight public content.' },
  site_guide: { title: "Allow reading the site guide?", summary: "Read the public site guide", field: "topic" },
};

type VisitorSnapshot = Awaited<ReturnType<NonNullable<VisitorExecutionPorts["readSnapshot"]>>>;

/** Project only a declared string field into CMS-owned copy, never serialize the model's input.
 * Jini owns control stripping; this surface additionally removes bidi controls and links.
 * @complexity O(n) time/space in one input field; fields are capped at 120 and summaries at 240.
 */
function confirmationCopy({ request }: { request: ToolConfirmationRequest }, _options = {}) {
  const copy = CONFIRMATION_COPY[request.tool.id] ?? { title: "Allow this action?", summary: "Perform this site's reviewed action." };
  const input = request.input as Record<string, unknown> | null;
  const value = copy.field && input?.[copy.field];
  if (typeof value !== "string") return { title: copy.title, summary: copy.summary };
  const field = stripControlSequences({ text: value })
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ").trim()
    .replace(/https?:\/\/\S+/gi, "[link]").slice(0, 120)
    .replace(/\b[\w-]+\.[a-z]{2,}\S*/gi, "[link]").slice(0, 120);
  return { title: copy.title, summary: `${copy.summary}: "${field}"`.slice(0, 240) };
}

/** Only Ask registrations (or forced confirmations) prompt; everything else resumes denied.
 * Authorization refuses legacy/headless ports without the owner's value-row snapshot. */
function decideVisitorConfirmation(
  { ports, request, snapshot }: { ports: VisitorExecutionPorts; request: ToolConfirmationRequest; snapshot: VisitorSnapshot },
  _options = {},
): "ask" | "deny" {
  if (!snapshot.policy || !ports.confirmation) return "deny";
  const mode = resolveVisitorToolChoice({ policy: snapshot.policy, toolId: request.tool.id }).mode;
  const forced = ports.requiresConfirmation?.({ toolId: request.tool.id, input: request.input }) === true;
  return mode === 'off' || (mode !== 'ask' && !forced) ? "deny" : "ask";
}

/** The bound gate lives in `@jini-ai/daemon/surface-exchanges` (`createBoundConfirmationGate`). Tovu binds
 * the visitor policy, the value-row revision (a value hash cannot detect changed-and-restored settings),
 * the page publication check, the IP/owner binding and the copy. Four calls per turn.
 */
export function createVisitorConfirmationGate({ ports, resume }: { ports: VisitorExecutionPorts; resume: ToolExecutor["resumeConfirmation"] }, _options = {}) {
  const gate = createBoundConfirmationGate<VisitorSnapshot>({ resume, ports: {
    readSnapshot: () => ports.readSnapshot!(),
    decide: ({ request, snapshot }) => decideVisitorConfirmation({ ports, request, snapshot }),
    isCurrent: ({ captured, live }) => {
      const publicationValid = !ports.publicationRevision || Boolean(readVisitorPagePublication({ revision: ports.publicationRevision, workspaceId: ports.workspaceId }));
      return publicationValid && live.policy !== null && live.revision === captured.revision;
    },
    requestApproval: ({ request, validate }) => ports.confirmation!.request({
      binding: { runId: ports.runId, executionId: request.executionId, ip: ports.ip, owner: ports.owner },
      ...confirmationCopy({ request }),
      emit: ports.confirmation!.emit, validate, signal: ports.signal,
    }),
    reportError: ({ error }) => ports.reportError({ error }),
    signal: ports.signal,
  } });
  return { delegate: gate.delegate,
    async assertApproved({ executionId, input }: { executionId: string; input: unknown }, _optional = {}) {
      if (!await gate.isApproved({ executionId, input })) throw new VisitorPlanRefused();
    },
    forget({ executionId }: { executionId: string }, _optional = {}) { gate.forget({ executionId }); },
  };
}
```

### T2. REPLACE `apps/website/src/assistant/site/visitor-confirmations.ts` with (exact content)
```ts
import { sameFrontendOwner, type FrontendSessionOwner } from '@jini-ai/daemon';
/** Visitor-only binding of Jini's bound confirmations. Never shares the admin exchange store. */
import type { SurfaceExchangeStore } from "@jini-ai/core";
import { createBoundConfirmations } from "@jini-ai/daemon/surface-exchanges";
import type { ClientDirective } from "./client-directives.js";

export const VISITOR_CONFIRMATION_WAIT_MS = 60_000;
export type ToolConfirmationDirective = Extract<ClientDirective, { kind: "tool_confirmation" }>;
export interface VisitorConfirmationRequest {
  readonly binding: { readonly runId: string; readonly executionId: string; readonly ip: string; readonly owner?: FrontendSessionOwner };
  readonly title: string;
  readonly summary: string;
  readonly emit: (directive: ToolConfirmationDirective) => void;
  readonly validate: () => Promise<boolean>;
  readonly signal?: AbortSignal;
}
export interface VisitorConfirmations {
  request(required: VisitorConfirmationRequest, optional?: Record<string, never>): Promise<boolean>;
  confirm(required: { challengeId: string; allow: boolean; owner?: FrontendSessionOwner }, optional?: Record<string, never>): Promise<boolean>;
}

/** The bound exchange routing lives in `@jini-ai/daemon/surface-exchanges` (`createBoundConfirmations`).
 * Tovu binds: the visitor principal/channel (fc576483f: kept off the MCP-UI admin route), at most 20 held
 * site prompts and two per client IP, and the `tool_confirmation` client directive.
 */
export function createVisitorConfirmations({ exchanges, nowMs }: { exchanges: SurfaceExchangeStore; nowMs: () => number }, _options = {}): VisitorConfirmations {
  const bound = createBoundConfirmations<FrontendSessionOwner>({ exchanges, nowMs, sameOwner: sameFrontendOwner,
    principalId: "anonymous-visitor", channel: "visitor-tool-confirmation", limits: { maxHeld: 20, perQuotaKey: 2 } });
  return {
    request(required, _optional = {}) {
      const { binding } = required;
      return bound.request({
        binding: { runId: binding.runId, executionId: binding.executionId, quotaKey: binding.ip, owner: binding.owner },
        emission: ({ challengeId }) => ({ channel: "client_directive", payload: {
          kind: "tool_confirmation", challengeId, title: required.title, summary: required.summary,
        } }),
        emit: ({ payload }) => { required.emit(payload as unknown as ToolConfirmationDirective); },
        validate: required.validate, signal: required.signal,
      });
    },
    confirm: (required, _optional = {}) => bound.confirm(required),
  };
}
```
(If the website tsconfig has `exactOptionalPropertyTypes` and eslint/tsc-in-eslint flags `owner: binding.owner` or `signal: required.signal`, that is NOT a literal consequence: STOP and report. Today's file already passes `owner: binding.owner` into an optional field, so it is not expected.)

### T3. `apps/website/src/assistant/__tests__/mcp-ui-allowlist-completeness.test.ts`: OLD (exactly once)
```ts
  // fc576483f: visitor Ask-first confirmations open on the site assistant's OWN exchange store
  // (channel "visitor-tool-confirmation", principal "anonymous-visitor"); the MCP-UI admin route never sees them.
  ["assistant/site/visitor-confirmations.ts", new Set(["binding.executionId"])],
]);
```
NEW
```ts
]);
```

### T4. Census + checks + commit
Census: `rg -n "createVisitorConfirmationGate|createVisitorConfirmations|VisitorPlanRefused" apps --glob '!**/node_modules/**'` | allowed: the two files above, `visitor-executor.ts`, `server/runtime/composition/modules/site-assistant.ts`, `assistant/site/__tests__/{visitor-executor.unit,visitor-confirmation-gate.unit}.test.ts`, `assistant/site/__tests__/visitor-confirmations.fixture.ts`. Any other hit: STOP. None of those importers is edited.
eslint T1, T2, T3 (`@jini-ai/daemon/surface-exchanges` new names unresolved until the D1 link: record, do not fix).
Commit paths: the 3 Tovu files.
tovu_msg: `refactor(site-assistant): visitor confirmations on @jini-ai/daemon bound confirmations` | body: "Tovu keeps the visitor policy decision, publication check, copy table, IP/owner binding, caps (20 held, 2 per IP), the anonymous-visitor channel and the tool_confirmation directive."

tests_split: every Tovu test stays byte-identical (`visitor-confirmations.unit.test.ts`, `visitor-confirmation-gate.unit.test.ts`, `visitor-executor*.unit.test.ts`, `visitor-page-confirmation.unit.test.ts`); they now prove the Tovu binding through Jini. New Jini coverage: J3.
extra_stops: `ExecutionDelegate` / `ToolConfirmationRequest` / `ToolExecutor` not exported from `packages/daemon/src/tool-executor.ts` -> STOP. `SurfaceEmission` not exported from `@jini-ai/core` root -> STOP.
Cloud run owes: Jini vitest `bound-confirmations.test.ts`, `surface-exchanges*.test.ts`; daemon typecheck; subpath isolation (`./surface-exchanges` stays universal). Tovu (after D1 link): node:test for the 5 visitor test files above + `mcp-ui-allowlist-completeness.test.ts`; website typecheck.
