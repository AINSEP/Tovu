### jini:packages/agent-runtime/src/agent-protocol/acp/models.ts
- **Over:** `detectAcpModels` 108
- **Phase:** now · **Batch:** size-16
- **Tests:** `packages/agent-runtime/src/agent-protocol/acp/__tests__/models.test.ts`, `.../model-normalization-w2g.unit.test.ts`, `.../probe-close.unit.test.ts`, `packages/agent-runtime/src/defs/__tests__/shared.test.ts` (pkg `@jini-ai/agent-runtime`)
- **Responsibility map:** A = inside the `new Promise` executor, the child stream listeners `child.stdout.on('data', …)` through `child.on('close', (code, signal) => {` (~L341-360) plus `let stderrBuf` / `let stdoutBytes` (read only there) — probe output bounding + exit reporting; B = rest (spawn, settle/finish, RPC handshake, timeout, initialize) — probe protocol.
- **Splits:**
  1. HELPER `attachProbeStreams({ child, parser, fail, isSettled, markClosed }: AttachProbeStreamsInput): void` (module level, above `detectAcpModels`) ← `let stderrBuf = '';`, `let stdoutBytes = 0;` and the six listener statements verbatim, in order. `closed = true;` becomes `markClosed();`, `if (!settled)` becomes `if (!isSettled())`. Types: `child` = the `spawnProcess` return type (use the existing exported child type from the spawn port; do not widen), `parser` = `ReturnType<typeof createJsonLineStream>` unless a named type is exported, `fail: (message: string) => void`.
  2. Executor: remove the two `let`s and call `attachProbeStreams({ child, parser, fail, isSettled: () => settled, markClosed: () => { closed = true; } });` where the listeners were (after `const parser = …`, before the timeout).
- **Importers to update:** none.
- **After:** `detectAcpModels` ~90; helper ~25; file ~330.
- **Risks / notes:** listener registration order must stay (stdout data → stdout close → stdin error → stderr data → error → close), and it must stay after `parser` is created and before `writeRpc(1, 'initialize', …)`. The 8 MiB and 16 000-char limits stay literal.
