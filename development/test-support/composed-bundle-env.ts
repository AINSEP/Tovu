/** Preload before test discovery so every worker inherits the same disposable bundled root.
 * Reuse the real package-selection fixture; no build, npm staging, or checkout output is needed.
 * Explicit roots remain available to tests that exercise custom bundles.
 */
import { processComposedBundledSourceRoot } from '../../apps/website/src/features/agent-plugins/__tests__/fixtures/bundled-source-root.js';

if (process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR === undefined) {
  process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = await processComposedBundledSourceRoot();
}
