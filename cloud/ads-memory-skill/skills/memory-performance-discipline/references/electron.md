# Electron resource discipline

Load only for Electron desktop work, including its launched servers, daemons, and bridges. Apply the general checklist first. The incidents below illustrate application decisions, not universal numeric defaults or measured Electron overhead.

## Process attribution

Map main, renderers/guests, helpers, site servers, shared daemon, agent CLIs, and bridges by PID and owner. Record executable **and execution mode**. [Electron's process model](https://www.electronjs.org/docs/latest/tutorial/process-model) explains separate window/embed renderers; an Electron executable alone does not identify a renderer.

Tovu's [server launch](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/tovu-server.ts) and [daemon launch](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/desktop-agent-service.ts) use `process.execPath` with `ELECTRON_RUN_AS_NODE=1`. [Electron documents](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node) that mode as a normal Node process, subject to the run-as-Node fuse. Polling, JSON churn, query scans, and checkpoint retries remain general server problems.

Preserve launch settings across environment filtering. Tovu's [MCP bridge incident](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/website/src/assistant/mcp-injection.ts) records a missing run-as-Node setting opening a GUI instead of speaking MCP, causing timeout and missing tools. Put the setting on the child launch contract; inspect actual transport selection because eligible CLIs can use HTTP instead of a stdio child.

## Views and recurring IPC

Hidden guests still retain renderers and application state. Reuse the existing soft live-view limit, releasing only eligible guests after explicit dirty-editor/chat/upload guards permit it. Timeout, failure, or unknown retains the guest; preserve route and scroll. Tovu's [live-view incident/fix `e377c1dd3`](https://github.com/AINSEP/Tovu/commit/e377c1dd3) introduced guarded release; [the pinned policy](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/renderer/use-live-views.hooks.ts) restricts probes to audited admin routes. Public forms without guards are not implicitly safe to destroy.

Do not create a renderer for a thumbnail. Capture an eligible existing public guest; recheck identity, URL, and navigation after awaiting capture. [Fix `b8c5c07de`](https://github.com/AINSEP/Tovu/commit/b8c5c07de) changed the approach; [capture ownership](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/main/boot/site-preview.ts) preserves the old image on failed eligibility. Send preview version tokens through recurring IPC and fetch image bytes only when changed ([store rationale](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/site-preview-store.ts)).

Share main's cached sampler and in-flight promise; invalidate site/PID attribution when ownership changes. [Fix `6331ff2ea`](https://github.com/AINSEP/Tovu/commit/6331ff2ea) addresses stale attribution. Hidden documents own no polling timer; disposal removes listeners and prevents late results restarting work ([renderer owner](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/renderer/use-resources.hooks.ts)). Include IPC serialization and image bytes in cost estimates.

## Sleep, replacement, and shutdown

Share daemon infrastructure while isolating site scopes. Withdraw only dead-boot bindings, preserving replacements; cancel restart work on explicit Stop/delete/quit. HTTP completion alone cannot prove background idleness. [Fix `27ba3c762`](https://github.com/AINSEP/Tovu/commit/27ba3c762) and the [binding owner](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/desktop-agent-service.ts) illustrate why process-exit identity and background holds matter. Dispose preload/IPC subscriptions with their view or process owner.

## Measurement and responsiveness

Label metric, units, PID scope, platform, and unavailable readings. [Electron's memory API](https://www.electronjs.org/docs/latest/api/process#processgetprocessmemoryinfo) reports platform-dependent fields in KB and documents macOS limitations. Tovu's [memory adapter](https://github.com/AINSEP/Tovu/blob/e327c07c8/apps/desktop/src/desktop-memory-sampler.ts) uses a bounded batched macOS footprint probe with labelled RSS fallback and Windows committed-memory readings. Do not compare footprint directly with older RSS totals or count missing readings as zero; summed RSS can double-count shared pages.

Validate the packaged runtime, including fuses and child environment, on representative work and idle recovery. A source flag such as Tovu's `--optimize-for-size` proves neither savings nor acceptable latency. Follow [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance): profile the running app and avoid blocking main-process I/O or synchronous IPC. Preserve security boundaries while optimizing; this reference does not propose a view migration or new monitoring framework.
