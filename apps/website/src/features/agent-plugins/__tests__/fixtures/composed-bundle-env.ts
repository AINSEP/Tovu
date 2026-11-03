import { processComposedBundledSourceRootSync } from "./bundled-source-root.js";

/**
 * @file Side-effect import for tests that compose the real app (`createRouteDeps()` and the catalogs it
 * reads at import time): points `TOVU_BUNDLED_AGENT_PLUGINS_DIR` at the composed bundle the build ships
 * (Tovu's own plugins plus each selected `@jini-ai/agent-plugins/<id>`), as `npm run dev` does. Without
 * it the app reads `content/agent-plugins` alone and finds none of the plugins that moved to Jini (the
 * hosting plugins among them). Import it FIRST; it is synchronous so every later module sees the same bundle.
 */
process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ??= processComposedBundledSourceRootSync();
