// Node check for the rank table (judge finding 8): an edge rule cannot see a feature that has no edges.
// Every folder under features/ that holds production code must have exactly one FEATURE_RANK entry, and
// the table must not name a folder that is gone or holds only tests.
//   node check-feature-ranks.mjs <repoRoot> <feature-ranks.json> [--features apps/website/src/features]
//   node check-feature-ranks.mjs --self-test      (fixtures: unranked leaf, stale entry, tests-only folder, non-integer rank)
// Exit 0 = table and tree agree; exit 1 = lists every difference.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const TEST = /(^|\/)__tests__\/|\.test\.tsx?$/;
const SOURCE = /\.tsx?$/;

/** True when the folder holds at least one production source file, at any depth. */
function hasProductionCode(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules' && hasProductionCode(path.join(dir, e.name), childRel)) return true; }
    else if (SOURCE.test(e.name) && !e.name.endsWith('.d.ts') && !TEST.test(childRel)) return true;
  }
  return false;
}

export function checkFeatureRanks(required, _optional = {}) {
  const { featuresDir, ranks } = required;
  const folders = fs.readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const production = folders.filter((name) => hasProductionCode(path.join(featuresDir, name)));
  const problems = [];
  for (const name of production) if (!(name in ranks)) problems.push(`unranked feature: ${name} (add it to FEATURE_RANK)`);
  for (const [name, rank] of Object.entries(ranks)) {
    if (!production.includes(name)) problems.push(`stale rank entry: ${name} (${folders.includes(name) ? 'folder holds no production code' : 'folder does not exist'})`);
    if (!Number.isInteger(rank) || rank < 0) problems.push(`bad rank for ${name}: ${JSON.stringify(rank)}`);
  }
  return { production: production.length, problems };
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-ranks-'));
  const write = (rel) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'export {};\n'); };
  write('ranked/a.ts'); write('leaf/only.ts'); write('tests-only/__tests__/x.test.ts'); write('nested/deep/inner/b.ts');
  const expectProblems = (ranks, expected) => { const got = checkFeatureRanks({ featuresDir: root, ranks }).problems; if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`self-test failed:\n got ${JSON.stringify(got)}\n want ${JSON.stringify(expected)}`); };
  expectProblems({ ranked: 0, leaf: 0, nested: 1 }, []);
  expectProblems({ ranked: 0, nested: 1 }, ['unranked feature: leaf (add it to FEATURE_RANK)']); // a leaf with no feature import is still caught
  expectProblems({ ranked: 0, leaf: 0, nested: 1, gone: 2 }, ['stale rank entry: gone (folder does not exist)']);
  expectProblems({ ranked: 0, leaf: 0, nested: 1, 'tests-only': 0 }, ['stale rank entry: tests-only (folder holds no production code)']);
  expectProblems({ ranked: 0, leaf: 1.5, nested: 1 }, ['bad rank for leaf: 1.5']);
  fs.rmSync(root, { recursive: true });
  console.log('self-test: 5 cases passed');
}

if (process.argv[2] === '--self-test') selfTest();
else if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const [repoRoot, ranksFile, ...rest] = process.argv.slice(2);
  const featuresRel = rest[0] === '--features' ? rest[1] : 'apps/website/src/features';
  const result = checkFeatureRanks({ featuresDir: path.join(repoRoot, featuresRel), ranks: JSON.parse(fs.readFileSync(ranksFile, 'utf8')) });
  for (const p of result.problems) console.error(p);
  console.log(`${result.production} feature folders with production code; ${result.problems.length} problem(s)`);
  process.exit(result.problems.length ? 1 : 0);
}
