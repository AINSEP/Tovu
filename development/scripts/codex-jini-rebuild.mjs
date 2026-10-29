/** Runner-local adapter: snapshot Jini source state, then invoke its package-owned builds. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const order = 'protocol core ui diagnostics platform cms devops agent-runtime daemon chat admin desktop-host'.split(' ');
const sourcePackage = (file) => /^packages\/([^/]+)\/src\//.exec(file)?.[1];
const isTest = (file) => file.split('/').includes('__tests__');

/** Recognize both plain and pretty tsc diagnostics, rejecting other reported errors.
 * O(l) time/space for l build-output bytes. A pretty-mode error count is only a summary.
 */
function onlyTestErrors(output) {
  const errors = output.split(/\r?\n/).filter((line) =>
    /\berror\b/i.test(line) && !/^Found \d+ errors?\b/.test(line) && !/^\s*\d+\s/.test(line));
  return errors.length > 0 && errors.every((line) => {
    const diagnostic = /^(.*?)(?:\(\d+,\d+\):|:\d+:\d+ -) error TS\d+:/.exec(line);
    return diagnostic !== null && isTest(diagnostic[1].replace(/\\/g, '/'));
  });
}

/** Collect file mtimes and sizes without following directory symlinks; missing roots are empty.
 * O(n) filesystem reads and space for n files. Other I/O failures propagate to the runner log.
 */
function fileTimes(root) {
  const files = {};
  function visit(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.name === '__tests__') continue;
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) {
        const stat = fs.statSync(name, { bigint: true });
        files[path.relative(root, name)] = `${stat.mtimeNs}:${stat.size}`;
      }
    }
  }
  visit(root);
  return files;
}

function porcelainStatuses({ porcelain }, _options = {}) {
  const statuses = {};
  const entries = porcelain.split('\0');
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    const status = entries[i].slice(0, 2);
    const file = entries[i].slice(3);
    statuses[file] = status;
    // Porcelain -z places the rename/copy source in the next NUL-delimited field.
    if (/[RC]/.test(status)) statuses[entries[++i]] = `${status}:${file}`;
  }
  return statuses;
}

/** Capture raw porcelain plus per-source status and mtimes, including untracked files.
 * O(n + s) time/space for n source files and s Git status entries. Git/read failures propagate.
 */
function snapshot(repo, exec = execFileSync) {
  const porcelain = exec('git', ['-C', repo, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const statuses = porcelainStatuses({ porcelain });
  const files = {};
  for (const entry of fs.readdirSync(path.join(repo, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const prefix = `packages/${entry.name}/src/`;
    for (const [file, time] of Object.entries(fileTimes(path.join(repo, prefix)))) files[prefix + file] = time;
  }
  for (const file of new Set([...Object.keys(files), ...Object.keys(statuses)])) {
    if (sourcePackage(file) && !isTest(file)) files[file] = `${files[file] ?? 'missing'}:${statuses[file] ?? ''}`;
    else delete files[file];
  }
  return { porcelain, files };
}

function recordBuildResult({ log, pkg, rc, result, testOnly, emitted }, _options = {}) {
  const built = rc === 0 || (!result.error && !result.signal && testOnly && emitted);
  fs.appendFileSync(log, `[${pkg}] rc=${rc} built=${built}${built && rc !== 0 ? ' (test-only tsc errors; dist emitted)' : ''}${result.error ? ` error=${result.error.message}` : ''}${result.signal ? ` signal=${result.signal}` : ''}\n`);
}

/** Run one package build, retaining its raw rc and counting test-only errors as built only
 * when fresh runtime JS was emitted. Output goes directly to the shared log, avoiding pipe limits.
 * O(d + l) time/space for d dist files and l output bytes; package errors never stop later builds.
 */
function rebuildPackage({ repo, pkg, log }, exec = spawnSync) {
  const dir = path.join(repo, 'packages', pkg);
  try {
    const before = fileTimes(path.join(dir, 'dist'));
    fs.appendFileSync(log, `\n[${pkg}] npm run -s build\n`);
    const start = fs.statSync(log).size;
    const fd = fs.openSync(log, 'a');
    let result;
    try { result = exec('npm', ['run', '-s', 'build'], { cwd: dir, stdio: ['ignore', fd, fd] }); }
    finally { fs.closeSync(fd); }
    const rc = result.status ?? 1;
    const output = fs.readFileSync(log).subarray(start).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
    const testOnly = onlyTestErrors(output);
    const emitted = Object.entries(fileTimes(path.join(dir, 'dist'))).some(([file, time]) =>
      /\.[cm]?js$/.test(file) && before[file] !== time);
    recordBuildResult({ log, pkg, rc, result, testOnly, emitted });
    return `${pkg}=${rc}`;
  } catch (error) {
    fs.appendFileSync(log, `[${pkg}] rc=1 built=false error=${error.message}\n`);
    return `${pkg}=1`;
  }
}

// Import/exec seam for hermetic runner tests; CLI behavior remains below.
export function runJiniRebuild({ mode, repo, snapshotFile, log }, optional = {}) {
  if (mode === 'snapshot') {
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot(repo, optional.execFileSync)));
  } else if (mode === 'rebuild') {
    const before = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    const after = snapshot(repo, optional.execFileSync);
    // Retain both captures beside the log so a reported package selection can be inspected.
    fs.writeFileSync(`${snapshotFile}.after`, JSON.stringify(after));
    const changed = new Set();
    for (const file of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
      if (before.files[file] !== after.files[file]) changed.add(sourcePackage(file));
    }
    const rank = (pkg) => order.includes(pkg) ? order.indexOf(pkg) : order.length;
    const packages = [...changed].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    const results = packages.map((pkg) => rebuildPackage({ repo, pkg, log }, optional.spawnSync));
    const summary = `jini-rebuild: ${results.join(' ') || 'none'}`;
    fs.appendFileSync(log, `${summary}\n`);
    (optional.console ?? console).log(summary);
  } else throw new Error(`unknown mode: ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, repo, snapshotFile, log] = process.argv.slice(2);
  try { runJiniRebuild({ mode, repo, snapshotFile, log }); }
  catch (error) {
    console.error(`jini-rebuild: ${error.stack ?? error}`);
    process.exitCode = 1;
  }
}
