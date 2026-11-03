import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sourceTreeStamp } from '@jini-ai/devops/local-dev';
import { withFileLock } from '@jini-ai/platform/fs';

/** Include the actual installed UI packages too: a linked Jini rebuild can stale the admin
 * without changing package-lock.json. Missing optional installations are left to the builder.
 * @complexity O(admin dependencies), one or two path resolutions per Jini dependency.
 */
async function adminSourceRoots({ repoRoot, read }) {
  const manifest = await read(path.join(repoRoot, 'apps/admin/package.json'));
  const dependencies = manifest ? Object.keys(JSON.parse(manifest).dependencies ?? {}) : [];
  const roots = [path.join(repoRoot, 'apps/admin'), path.join(repoRoot, 'packages/contracts/src'),
    // Admin imports website contracts, helpers and their transitive dependencies. Hash the source
    // owner as a whole so a newly added cross-app import cannot silently escape freshness checks.
    path.join(repoRoot, 'apps/website/src'), path.join(repoRoot, 'package-lock.json')];
  for (const name of dependencies.filter(name => name.startsWith('@jini-ai/'))) {
    const installed = await realpath(path.join(repoRoot, 'apps/admin/node_modules', name)).catch(() =>
      realpath(path.join(repoRoot, 'node_modules', name)).catch(() => undefined));
    if (installed) roots.push(path.join(installed, 'dist'));
  }
  return roots;
}

/** Reuse the site's existing bundle builder; this module never starts a Vite dev server.
 * A failed build never publishes a freshness marker. @complexity O(admin source bytes).
 */
export async function prepareLiteAdmin({ repoRoot, env }, {
  stamp = sourceTreeStamp, read = file => readFile(file, 'utf8').catch(() => ''), write = writeFile,
  lock = withFileLock,
  build = async input => {
    // Bare Node cannot load the site's TS adapter. Keep its build/locking policy in that owner.
    const { spawn } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', path.join(repoRoot, 'development/scripts/dev-admin-build.ts'), input.output], {
        cwd: repoRoot, env: input.env, stdio: 'inherit', windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Admin build failed')));
    });
  },
} = {}) {
  const output = path.join(repoRoot, 'apps/admin/dist');
  const marker = path.join(output, '.dev-source-stamp');
  return lock({ lockPath: path.join(repoRoot, '.dev-admin-build.lock'), run: async () => {
    const current = await stamp({ roots: await adminSourceRoots({ repoRoot, read }) });
    if (await read(marker) === current && await read(path.join(output, 'index.html'))) return output;
    console.log('tovu dev: preparing prebuilt admin…');
    await build({ repoRoot, output, env });
    await write(marker, current);
    return output;
  } }, { timeoutMs: Infinity, staleMs: Infinity });
}
