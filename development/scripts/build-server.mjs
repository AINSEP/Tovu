/** Tovu's server build and runtime-asset staging. Node filesystem operations work on Windows too. */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildServer({ repoRoot }, { npmCli = process.env.npm_execpath,
  tscCli = createRequire(path.join(repoRoot, 'package.json')).resolve('typescript/bin/tsc'),
  runNode = ({ args }) => {
    const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Build step failed (${result.signal ?? result.status}): ${args[0]}`);
  },
} = {}) {
  if (!npmCli) throw new Error('Run this script through npm run build:server so npm_execpath is available.');
  // Invoke npm's JavaScript entrypoint with node, avoiding Windows npm.cmd shell quoting entirely.
  runNode({ args: [npmCli, 'run', 'build', '--workspace=@tovu/sdk'] });
  // Deleted source files must not survive into the next runtime as stale compiled modules.
  rmSync(path.join(repoRoot, 'dist/src'), { recursive: true, force: true });
  runNode({ args: [tscCli, '-p', 'tsconfig.json'] });
  runNode({ args: [path.join(repoRoot, 'development/scripts/emit-dist-package-json.mjs')] });
  for (const relative of ['dist/content', 'dist/src/platform/db/drizzle', 'dist/src/platform/db/drizzle-database-journal']) {
    rmSync(path.join(repoRoot, relative), { recursive: true, force: true });
  }
  for (const relative of ['content/templates', 'content/themes', 'content/agent-plugins', 'content/public', 'src/platform/db/drizzle']) {
    const source = relative.startsWith('src/') ? path.join(repoRoot, 'apps/website', relative) : path.join(repoRoot, relative);
    const destination = path.join(repoRoot, 'dist', relative);
    mkdirSync(destination, { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildServer({ repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') });
}
