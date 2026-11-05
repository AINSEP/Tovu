import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

// Verification-only preload: keep the real file adapters and fsync, deny writes outside TMPDIR.
const root = fs.realpathSync(os.tmpdir());
function check(value) {
  if (typeof value === 'number') return; // Descriptors originate in the guarded open call.
  let target = path.resolve(value instanceof URL ? fileURLToPath(value) : String(value));
  const suffix = [];
  while (!fs.existsSync(target)) { suffix.unshift(path.basename(target)); target = path.dirname(target); }
  const resolved = path.join(fs.realpathSync(target), ...suffix);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    process.stderr.write(`FIXTURE_WRITE_DENIED ${resolved}\n`);
    throw new Error(`Write outside disposable fixture root: ${resolved}`);
  }
}
for (const name of ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'unlink', 'truncate', 'chmod', 'chown', 'utimes', 'createWriteStream']) {
  for (const owner of [fs, fs.promises]) for (const method of [name, `${name}Sync`]) {
    if (typeof owner[method] !== 'function') continue;
    const original = owner[method];
    owner[method] = function (...args) { check(args[0]); return Reflect.apply(original, this, args); };
  }
}
for (const name of ['rename', 'copyFile', 'link', 'symlink', 'cp']) {
  for (const owner of [fs, fs.promises]) for (const method of [name, `${name}Sync`]) {
    if (typeof owner[method] !== 'function') continue;
    const original = owner[method];
    owner[method] = function (...args) {
      if (name === 'rename') check(args[0]);
      check(args[1]);
      return Reflect.apply(original, this, args);
    };
  }
}
for (const owner of [fs, fs.promises]) for (const method of ['open', 'openSync']) {
  if (typeof owner[method] !== 'function') continue;
  const original = owner[method];
  owner[method] = function (...args) {
    const flags = args[1] ?? 'r';
    const writes = typeof flags === 'string' ? /[wa+]/.test(flags)
      : (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
    if (writes) check(args[0]);
    return Reflect.apply(original, this, args);
  };
}
syncBuiltinESMExports();
