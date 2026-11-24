# Desktop contracts

IPC channel names and payload shapes shared by the desktop main process, preload and renderer.

## Wiring

- **Jini owns** the types only: `MemoryMetric` and `ResourceProcess` in
  `@jini-ai/core/contracts/site/contracts-resources` (K4-seam-18).
- **The host keeps** the `RUNNER_RESOURCES_GET_CHANNEL` channel, the grouping/snapshot shapes in
  `resources.ts`, and the sampler that fills them (`desktop-memory-sampler.ts`,
  `desktop-resources.ts`).
