import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveProductRoot } from '../../../platform/site-dir/product-root.js';
import { resolveApiConnectionRuntime, resolveRuntimeMode, type RuntimeMode } from '../../../contracts/core/runtime-mode.js';

type Read = (file: string, encoding: 'utf8') => string;
function documentAt({ file, read }: { file: string; read: Read }, _optional = {}): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(read(file, 'utf8'));
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Only build-owned version labels can become telemetry dimensions. */
function versionOf({ value }: { value: unknown }, _optional = {}): string | undefined {
  return typeof value === 'string' && value.length <= 64 && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value) ? value : undefined;
}

/** Read the running product's manifest, beside its package.json in dist; source uses package version.
 * @param required Product root from the existing source/dist resolver, never the site directory.
 * @param optional Filesystem seam. @returns A bounded Tovu release; malformed metadata stays unknown.
 */
export function readBuildRelease({ productRoot }: { productRoot: string }, { read = readFileSync }: { read?: Read } = {}): string {
  const manifest = documentAt({ file: path.join(productRoot, 'runtime-manifest.json'), read });
  const version = versionOf({ value: manifest.tovuVersion });
  const sha = manifest.tovuSha;
  if (version && typeof sha === 'string' && /^[a-f0-9]{7,64}$/i.test(sha)) return `tovu@${version}+${sha.slice(0, 7).toLowerCase()}`;
  const pkg = documentAt({ file: path.join(productRoot, 'package.json'), read });
  return `tovu@${versionOf({ value: pkg.version }) ?? 'unknown'}-dev`;
}

let release: string | undefined;
/** Resolve once per process so live config changes cannot rewrite build identity. */
export function processBuildRelease(_required: Record<string, never>, _optional: Record<string, never> = {}): string {
  release ??= readBuildRelease({ productRoot: resolveProductRoot() });
  return release;
}

/** The existing site attribution's bounded host environment, also used before site boot for logs. */
export function telemetryEnvironment({ env, runtimeMode = resolveRuntimeMode({ env }) }: { env: NodeJS.ProcessEnv; runtimeMode?: RuntimeMode }, _optional = {}): 'local' | 'desktop' | 'production' {
  if (runtimeMode === 'production') return 'production';
  return resolveApiConnectionRuntime({ env }) === 'desktop' ? 'desktop' : 'local';
}
