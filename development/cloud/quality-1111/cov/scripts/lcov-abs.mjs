// Rewrites relative LCOV `SF:` paths to absolute ones (relative to the directory the runner ran in), so
// coverage-all-files.ts matches them by full path instead of an ambiguous suffix. Usage: lcov-abs.mjs <in> <cwd> <out>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [input, cwd, out] = process.argv.slice(2);
writeFileSync(out, readFileSync(input, 'utf8').replace(/^SF:(.*)$/gm, (_, p) => `SF:${path.isAbsolute(p) ? p : path.resolve(cwd, p)}`));
