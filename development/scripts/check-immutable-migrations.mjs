// Git owns history comparison; Semgrep source patterns cannot express immutability.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseRef = process.argv[2];
if (!baseRef || baseRef.startsWith('-') || process.argv.length !== 3) {
  console.error('Usage: node development/scripts/check-immutable-migrations.mjs <PR-base-sha-or-ref>');
  process.exit(2);
}
try {
  const git = ({ args }, _options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const base = git({ args: ['merge-base', baseRef, 'HEAD'] }).trim();
  const prefix = 'apps/website/src/platform/db/migrations/';
  // Disable rename detection: moving a historical migration is a deletion of its old path.
  const changed = git({ args: ['diff', '--no-renames', '--name-only', '-z', base, 'HEAD', '--', prefix] }).split('\0');
  const historical = new Set(git({ args: ['ls-tree', '-r', '--name-only', '-z', base, '--', prefix] }).split('\0'));
  const violations = changed.filter(path => historical.has(path) && /^apps\/website\/src\/platform\/db\/migrations\/00[^/]*\.ts$/.test(path));
  for (const path of violations) console.log(`immutable-migrations: ${path} changed from merge base ${base}`);
  console.log(`immutable-migrations: ${violations.length} historical migrations changed (new migrations allowed)`);
  process.exitCode = violations.length ? 1 : 0;
} catch (error) {
  console.error(`immutable-migrations could not compare git history: ${error.message}`);
  process.exitCode = 2;
}
