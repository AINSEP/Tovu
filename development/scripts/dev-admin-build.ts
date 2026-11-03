/** Source-mode bridge to the same bounded, redacted builder used by local-site children. */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const env = { ...process.env, NODE_ENV: 'production' };
delete env.VITE_TOVU_SITE_URL;
// Match apps/admin's prebuild lifecycle before loading its build adapter: a missing or changed
// @tovu/contracts dist must be prepared as well as the admin, including on a fresh install.
execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'),
  '-p', path.resolve('packages/contracts/tsconfig.json')], { cwd: process.cwd(), env, stdio: 'inherit', timeout: 120_000 });
const { buildAdmin } = await import('../../apps/website/src/platform/site-dir/local-admin-bundle.js');
await buildAdmin({ repoRoot: process.cwd(), output: path.resolve(process.argv[2]!), env });
