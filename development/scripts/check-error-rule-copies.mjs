/**
 * The three error-gate rules are owned by Jini (`scripts/eslint-rules/errors/`); the files in
 * `development/eslint-rules/` are byte-identical copies (error-system decision D5). This check fails
 * when a copy no longer matches the hash recorded in `error-gate-rules.lock.json`, so a rule is never
 * edited here. When a Jini checkout sits beside this repository (or `JINI_PACKAGES_DIR` names one),
 * the copies are also compared with the originals, which catches a Jini change that was not copied.
 *
 * To take a new version: copy the three files from Jini, then run this script with `--update`
 * and put the Jini commit in the lock file's `source`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lockFile = 'development/eslint-rules/error-gate-rules.lock.json';
export const ruleFiles = ['catch-reads-error.mjs', 'failure-text-from-catalog.mjs', 'no-generic-failure-text.mjs'];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** One sentence per copy that differs from its recorded hash, or from the original when one is given. */
export function findRuleCopyDrift({ copies, lock }, { originals } = {}) {
  const problems = [];
  for (const file of ruleFiles) {
    const copy = copies[file];
    if (copy === undefined) { problems.push(`${file} is missing from development/eslint-rules/. Copy it from Jini scripts/eslint-rules/errors/.`); continue; }
    if (sha256(copy) !== lock.files[file]) problems.push(`${file} does not match the hash recorded in ${lockFile}. Rules are edited in Jini and copied here; do not edit the copy.`);
    const original = originals?.[file];
    if (original !== undefined && !copy.equals(original)) problems.push(`${file} differs from Jini scripts/eslint-rules/errors/${file}. Copy the Jini file here and run this script with --update.`);
  }
  return problems;
}

function readAll({ directory }) {
  return Object.fromEntries(ruleFiles.filter(file => existsSync(path.join(directory, file))).map(file => [file, readFileSync(path.join(directory, file))]));
}

function main(argv) {
  const copies = readAll({ directory: path.join(root, 'development/eslint-rules') });
  const lockPath = path.join(root, lockFile);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (argv.includes('--update')) {
    const files = Object.fromEntries(ruleFiles.map(file => [file, sha256(copies[file])]));
    writeFileSync(lockPath, `${JSON.stringify({ ...lock, files }, null, 2)}\n`);
    console.log(`Recorded ${ruleFiles.length} rule hashes in ${lockFile}.`);
    return 0;
  }
  const jiniRules = path.resolve(process.env.JINI_PACKAGES_DIR ?? path.join(root, '../Jini/packages'), '../scripts/eslint-rules/errors');
  const compared = existsSync(jiniRules);
  const problems = findRuleCopyDrift({ copies, lock }, compared ? { originals: readAll({ directory: jiniRules }) } : {});
  for (const problem of problems) console.error(problem);
  if (!problems.length) console.log(`Error-gate rule copies match their recorded hashes${compared ? ' and the Jini originals' : ' (no Jini checkout beside this repository; originals not compared)'}.`);
  return problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
