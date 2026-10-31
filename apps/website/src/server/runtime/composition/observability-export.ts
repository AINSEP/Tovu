/** Tovu interprets its launch facts; Jini owns the reusable outbound observability decision. */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { observabilityExportAllowed } from '@jini-ai/diagnostics/observability';
import { resolveRuntimeMode } from '../../../contracts/core/runtime-mode.js';
import { resolveCheckoutRoot } from '../../../platform/site-dir/product-root.js';

/** Known dev/test launchers remain development even when NODE_ENV is relabelled production. */
function developmentLaunch({ env }: { env: NodeJS.ProcessEnv }, _options = {}): boolean {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return true;
  if (env.VITEST || env.NODE_TEST_CONTEXT || env.TOVU_DEV_SUPERVISOR_PID) return true;
  return /^(?:dev|desktop|test|e2e)(?::|$)/.test(env.npm_lifecycle_event ?? '');
}

/** Electron main overrides inherited launch flags; other processes read the dedicated fact once. */
function desktopPackagingFact(
  { env, packagedDesktop }: { env: NodeJS.ProcessEnv; packagedDesktop: boolean | undefined },
  _options = {},
): boolean | undefined {
  return packagedDesktop ?? (env.TOVU_PACKAGED_DESKTOP === '1' ? true : env.TOVU_PACKAGED_DESKTOP === '0' ? false : undefined);
}

/** Resolve export eligibility from host evidence, never attribution or provider card fields.
 * Checkout discovery uses the existing source/dist-aware root resolver, so compiled local builds
 * remain checkouts. A source folder alone is not evidence: the deployed Docker image ships one.
 * Electron main supplies app.isPackaged directly; supervised children use the
 * dedicated fact set by main after inherited copies have been cleared.
 * @param required Environment snapshot and, in Electron main only, authoritative packaging status.
 * @param options Checkout fact seam; production derives it from the running product, not site/cwd.
 * @returns Outbound eligibility only. Configuration, consent, capture and admission stay independent.
 * @example resolveTovuObservabilityExport({ env: process.env });
 * @complexity O(depth) bounded ancestor probes; no network I/O.
 */
export function resolveTovuObservabilityExport(
  { env = process.env, packagedDesktop }: { env?: NodeJS.ProcessEnv; packagedDesktop?: boolean },
  { checkout = existsSync(path.join(resolveCheckoutRoot(), '.git')) }: { checkout?: boolean } = {},
): boolean {
  const fact = desktopPackagingFact({ env, packagedDesktop });
  const isDevelopmentLaunch = developmentLaunch({ env });
  const development = checkout || fact === false || isDevelopmentLaunch;
  return observabilityExportAllowed({
    forceEnable: env.TOVU_TELEMETRY_FORCE_ENABLE === '1', development,
    packagedDesktop: fact === true,
    deployedProduction: resolveRuntimeMode({ env }) === 'production' && !checkout && !isDevelopmentLaunch,
  });
}
