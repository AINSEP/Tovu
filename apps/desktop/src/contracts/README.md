# Desktop contracts

IPC channel names and payload shapes shared by the desktop main process, preload and renderer.

## Wiring

- **Jini owns** `MemoryMetric` and `ResourceProcess` in
  `@jini-ai/core/contracts/site/contracts-resources` (K4-seam-18), and the memory
  sampler in `@jini-ai/desktop-host/electron/memory-sampler`.
- **The host keeps** the `RUNNER_RESOURCES_GET_CHANNEL` channel, the grouping/snapshot shapes in
  `resources.ts`, and panel assembly in `desktop-resources.ts`.
