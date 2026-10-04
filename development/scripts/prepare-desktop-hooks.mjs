/** Per-checkout npm preparation: desktop pushes must run the existing quality gates. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HOOKS_PATH = 'apps/desktop/scripts/hooks';
export function installDesktopHooks({ repoRoot }, { env = process.env,
  runGit = ({ args }) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' }),
} = {}) {
  if (env.CI && env.CI !== 'false' && env.CI !== '0') return 'ci';
  const checkout = runGit({ args: ['rev-parse', '--show-toplevel'] });
  // An npm archive can sit inside another checkout: never configure that parent repository.
  if (checkout.status !== 0 || path.resolve(checkout.stdout.trim()) !== path.resolve(repoRoot)) return 'not-checkout';
  const current = runGit({ args: ['config', '--local', '--get', 'core.hooksPath'] });
  if (current.status === 0 && current.stdout.trim() === HOOKS_PATH) return 'already-installed';
  const installed = runGit({ args: ['config', '--local', 'core.hooksPath', HOOKS_PATH] });
  if (installed.status !== 0) throw new Error('Could not install the desktop pre-push hook.');
  return 'installed';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installDesktopHooks({ repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') });
}
