I’ll audit the committed source state only, without running tests or mutating either repository. I’m loading the repository’s governing instructions and the diff-analysis workflow first, then I’ll trace the stated invariants across both repositories.

===== NEXT AGENT MESSAGE =====

The repository’s graph service is unavailable under this read-only approval profile, so I’m using direct read-only source inspection instead. Git’s Apple wrapper is also blocked from creating its cache; I’m checking whether its installed command-line-tools path can be queried without that cache, then will fall back to raw repository objects if necessary.

===== NEXT AGENT MESSAGE =====

I found a concrete cross-repository bypass in the supposedly read-only path: the gateway checks the requested tool, but Tovu’s executor decorator can then invoke a write-only remedy tool. I’m now tracing its complete trigger and the other persistence paths, rather than treating the gateway’s local check as sufficient.

===== NEXT AGENT MESSAGE =====

I’ve confirmed the primary boundary failures. I’m doing a final source-state pass on the shipped paths and their tests now; I won’t run tests, touch either database, or alter either worktree.

===== NEXT AGENT MESSAGE =====

Coordinator(Review Mode):

I found seven real failures. The read-only gateway and the “durable” operation tier are the worst.

1. **CRITICAL — the read-only gateway can perform a durable write.**

[Jini delegated-tools.ts:135](</Users/la/Programming/Jini/packages/http-kit/src/delegated-tools.ts:135>)

```ts
if (input.requireReadOnly !== true) return null;
if (deps.toolRegistry === undefined) {
  return createApiError('TOOL_OPERATION_DENIED', READ_ONLY_UNVERIFIABLE_MESSAGE);
}
const descriptor = deps.toolRegistry.list().find((candidate) => candidate.id === input.toolId);
if (isReadOnlyTool(descriptor)) return null;
return createApiError('TOOL_OPERATION_DENIED', readOnlyRefusalMessage(input.toolId));
```

[Tovu agent-daemon-server.ts:448](</Users/la/Programming/Tovu/apps/website/src/server/inbound/assistant/agent-daemon-server.ts:448>)

```ts
const toolExecutor = withToolFailureRecovery(
  withToolAttemptAudit(createToolExecutor({ registry }), auditSink, { workspaceId: routeDeps.workspaceId }),
  { surfaceExchanges, registry },
);
```

[Tovu tool-failure-recovery.ts:365](</Users/la/Programming/Tovu/apps/website/src/assistant/tool-failure-recovery.ts:365>)

```ts
const remedyInput: Record<string, unknown> = { ...plan.carryForward };
if (plan.askFor && decision.answerValue !== undefined) remedyInput[plan.askFor.key] = decision.answerValue;
```

[Tovu tool-failure-recovery.ts:373](</Users/la/Programming/Tovu/apps/website/src/assistant/tool-failure-recovery.ts:373>)

```ts
const remedyResult = await inner.execute(principal, run, diagnostic.remedyToolId, remedyInput, signal, emitSurface);
```

[Tovu custom-credentials/tool-registrations.ts:187](</Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/tool-registrations.ts:187>)

```ts
["custom_credential_verify", "none"],
["custom_credential_set_username", "mutates-durable-state"],
```

Concrete failure: call `execute_readonly_delegated_tool` for `custom_credential_verify`. It passes the gateway because that tool is registered read-only. A Bearer credential missing a username produces a diagnostic naming `custom_credential_set_username` as the remedy. The wrapper displays a form, accepts the username, and invokes that mutating tool directly. The username is persisted despite the caller having selected the read-only gateway.

The route check itself is early and fails closed for a missing registry, unknown descriptor, or unclassified tool. The composition layer defeats it afterward.

Confidence: **99%**.

2. **CRITICAL — the submit-then-poll tier is not durable, nor wired into a host.**

[Jini async-operation-store.ts:246](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:246>)

```ts
/**
 * Creates the in-memory reference `AsyncOperationStore`. No persistence — a durable adapter
 * implements the same interface; every method here is written so the equivalent SQL is a direct
 * translation (`claimDue` in particular is a single conditional UPDATE ... RETURNING).
 */
export function createInMemoryAsyncOperationStore(): AsyncOperationStore {
  const rows = new Map<string, AsyncOperationRecord>();
```

There is no durable store adapter, operation table, worker composition, or non-test call site for `startOperation`, `pollDueOperations`, or `recoverAfterRestart`.

Concrete failure: submit an image job, receive a vendor job ID, then restart the process. The `Map` disappears. The vendor may bill and complete the job, but the replacement process has no operation row, no job handle, and nothing to reconcile or poll.

The crash-recovery test falsely calls this a restart while retaining the same map:

[Jini operation-runtime.test.ts:262](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/__tests__/operation-runtime.test.ts:262>)

```ts
it('resumes a polling operation after a kill -9 without re-charging the vendor', async () => {
  // One durable store across the "restart" — the row is the only thing that survives.
  const store = createInMemoryAsyncOperationStore();
```

Confidence: **100%**.

3. **HIGH — a successful vendor submission can be recorded as terminal failure, losing the job handle.**

[Jini operation-runtime.ts:115](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/operation-runtime.ts:115>)

```ts
const settle = (async (): Promise<StartOperationOutcome> => {
  try {
    const request = params.adapter.buildSubmitRequest(params.ctx);
    const resp = await performSigned(deps, request as UnsignedVendorRequest<unknown>, FETCH_TIMEOUT_MS.GENERATE);
    const outcome = await params.adapter.parseSubmitResponse(resp, params.ctx, request);
```

[Jini operation-runtime.ts:125](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/operation-runtime.ts:125>)

```ts
await deps.store.update(operationId, {
  status: 'polling',
  state: outcome.state,
  nextPollAt: now() + (outcome.retryAfterMs ?? DEFAULT_POLL_INTERVAL_MS),
});
```

[Jini operation-runtime.ts:131](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/operation-runtime.ts:131>)

```ts
} catch (error) {
  await deps.store.update(operationId, { status: 'failed', error: toOperationError(error) });
  return { done: false, operationId };
}
```

Concrete failure: vendor accepts and bills `POST /submit`, returning `{ id: "job-77" }`. The subsequent persistence update fails transiently. The catch marks the operation `failed`; the job ID was never persisted. Restart recovery ignores terminal rows, so the paid vendor job can never be polled or reconciled.

Confidence: **98%**.

4. **HIGH — lease release is unfenced; a stale worker can clear another worker’s lease.**

[Jini async-operation-store.ts:330](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:330>)

```ts
async claimDue(options: AsyncOperationClaimOptions): Promise<AsyncOperationRecord[]> {
  const { now, leaseOwner, leaseMs } = options;
```

[Jini async-operation-store.ts:339](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:339>)

```ts
if (row.leaseExpiresAt !== null && row.leaseExpiresAt > now) continue;
```

[Jini async-operation-store.ts:343](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:343>)

```ts
const leased: AsyncOperationRecord = {
  ...row,
  leaseOwner,
  leaseExpiresAt: now + leaseMs,
  updatedAt: now,
};
```

[Jini async-operation-store.ts:355](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:355>)

```ts
async releaseLease(id: string): Promise<void> {
  const row = requireRow(id);
  if (!row) return;
  rows.set(id, { ...row, leaseOwner: null, leaseExpiresAt: null, updatedAt: Date.now() });
},
```

[Jini operation-runtime.ts:277](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/operation-runtime.ts:277>)

```ts
} finally {
  await deps.store.releaseLease(row.id);
}
```

Concrete failure: worker A takes a 10 ms lease and begins a slow poll. At 11 ms, worker B correctly reclaims the expired lease. A eventually finishes and calls `releaseLease(id)`, clearing B’s lease without proving ownership. Worker C can immediately claim the same operation while B is still polling. The supposed single-worker guarantee is false.

Confidence: **98%** that mutual exclusion fails; **80%** that it becomes a vendor side effect depends on a particular polling adapter.

5. **HIGH — boot blob hydration has a check-then-overwrite race against production blobs.**

[Tovu hydrate-blob-store-from-seed.ts:175](</Users/la/Programming/Tovu/apps/website/src/features/media/hydrate-blob-store-from-seed.ts:175>)

```ts
if (await blobStore.exists({ storageKey })) {
  skipped++;
  continue;
}
const bytes = await readFile(join(seedUploadsDir, relativePath));
await blobStore.put({ workspaceId, sha256, bytes });
```

[Jini blob-store.fs.ts:36](</Users/la/Programming/Jini/packages/cms/src/media/blob-store.fs.ts:36>)

```ts
async put(input: PutBlobInput): Promise<{ storageKey: string }> {
  const storageKey = computeBlobStorageKey(input);
  const path = this.resolvePath(storageKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input.bytes);
```

[Tovu blob-store.s3.ts:115](</Users/la/Programming/Tovu/apps/website/src/features/media/blob-store.s3.ts:115>)

```ts
const storageKey = computeBlobStorageKey(input);
const response = await this.client.fetch(this.objectUrl(storageKey), {
  method: "PUT",
  body: input.bytes,
```

Concrete failure: boot checks a key and sees it absent. A real uploader writes that key before hydration reaches `put`. Hydration overwrites the production blob with the stock bytes. Neither adapter uses a create-only write or compares bytes. Sequential restarts are idempotent; concurrent production activity is not protected.

Confidence: **98%**.

6. **MEDIUM — the seed build check accepts a directory, symlink, or wrong bytes as a “blob.”**

[Tovu seed-site.mjs:207](</Users/la/Programming/Tovu/development/scripts/seed-site.mjs:207>)

```ts
export function findMissingSeedBlobs(db, liveDir) {
  const rows = db.prepare(`SELECT storage_key FROM asset_blobs`).all();
  return rows.map((row) => row.storage_key).filter((storageKey) => !fs.existsSync(path.join(liveDir, "uploads", storageKey)));
}
```

[Tovu hydrate-blob-store-from-seed.ts:123](</Users/la/Programming/Tovu/apps/website/src/features/media/hydrate-blob-store-from-seed.ts:123>)

```ts
for (const entry of entries) {
  const full = join(dir, entry.name);
  if (entry.isDirectory()) {
    results.push(...(await listSeedBlobRelativePaths(root, full)));
  } else if (entry.isFile()) {
    results.push(relative(root, full).split(sep).join("/"));
  }
}
```

Concrete failure: `asset_blobs.storage_key` is `ws/<workspace>/blobs/aa/<hash>`, but the matching source path is a directory. `existsSync` passes, so the image ships. The hydrator finds no file at that exact blob path, so the database row survives with no readable bytes and media requests fail. A wrong regular file also passes: no hash comparison occurs.

Confidence: **99%**.

7. **MEDIUM — “credentials never enter state” is a narrow key denylist, not the claimed invariant.**

[Jini async-operation-store.ts:53](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:53>)

```ts
const CREDENTIAL_KEY_PATTERN = /^(apikey|api_key|authorization|bearer|secret|password|access_token|accesstoken|refresh_token|refreshtoken)$/i;
```

[Jini async-operation-store.ts:176](</Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/async-operation-store.ts:176>)

```ts
for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
  if (CREDENTIAL_KEY_PATTERN.test(key)) {
    throw new Error(CREDENTIAL_IN_STATE_MESSAGE);
  }
  walk(entry, depth + 1);
}
```

Concrete failure: an adapter returns:

```ts
{ jobId: "job-77", clientSecret: "vendor-secret" }
```

`clientSecret` and `client_secret` do not match the denylist. The value is cloned into operation state and a future durable adapter would serialize it to `state_json`. The existing tests cover only `apiKey` and `authorization`.

Confidence: **99%** for the bypass; no current shipped adapter appears to emit this key.

### Credential sealing / AAD

I read every production `.seal(` and `.open(` call site under `apps/website/src`, including the multiline external-MCP call. I found **11 seal paths, all supplying AAD**. I found no current AAD derived from anything other than the relevant row identity, and no silent fallback for a versioned record.

The “only five columns” claim is outdated: current schema has six `aad_version` columns plus `oauth_aad_version`. The remaining AAD-protected stores have no legacy version because their paths were introduced with AAD already mandatory. This is not a structural invariant: the port still permits a new caller to omit AAD/versioning. It is, however, not a present call-site failure.

### Reversibility

Blob storage shape is persisted without a discriminator.

[Jini blob-key.ts:25](</Users/la/Programming/Jini/packages/cms/src/media/blob-key.ts:25>)

```ts
export function computeBlobStorageKey(input: { workspaceId: UUID; sha256: string }): string {
  const shard = input.sha256.slice(0, 2);
  return `ws/${input.workspaceId}/blobs/${shard}/${input.sha256}`;
}
```

[Jini media/types.ts:87](</Users/la/Programming/Jini/packages/cms/src/media/types.ts:87>)

```ts
export interface AssetBlobRecord {
  id: UUID;
  workspaceId: UUID;
  sha256: string;
  storageKey: string;
```

Changing the key prefix, tenant layout, sharding, or hash scheme requires copying/re-keying every live blob and migrating every persisted `storageKey`; there is no key-format version to branch on. Confidence: **100%**.

### What is actually SOLID

- The raw gateway check is correctly before principal resolution and execution, and correctly rejects missing registry, missing descriptors, and non-read-only descriptors.
- External MCP environment and OAuth writers now pair ciphertext with their corresponding AAD-version fields; the prior cross-writer desynchronization is addressed.
- Blob hydration is idempotent for sequential boots when the existing object and source object are valid.

### Where tests verify the wrong property

- The crash-recovery test preserves an in-memory `Map` across its simulated kill/restart. It proves retry behavior with retained memory, not durability after process loss.
- The lease test proves that two claims at the same timestamp do not overlap. It does not test A’s late unconditional release after B reclaims an expired lease.
- The seed test tests an absent regular file, not a directory, symlink, malformed source, or hash mismatch.
- The hydration test tests “already present” before hydration begins, not the `exists`→concurrent write→`put` interleaving.
- The state-secret tests prove rejection of two chosen key names, not the invariant that credential material cannot persist.
