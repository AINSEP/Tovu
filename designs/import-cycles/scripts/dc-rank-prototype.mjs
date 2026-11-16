import fs from 'node:fs';
const FEATURE_RANK = JSON.parse(fs.readFileSync(new URL('./feature-ranks.json', import.meta.url), 'utf8'));
const F = 'apps/website/src/features';
const byRank = new Map();
for (const [name, rank] of Object.entries(FEATURE_RANK)) byRank.set(rank, [...(byRank.get(rank) ?? []), name]);
const alt = (names) => names.map((n) => n.replace(/[-]/g, '\\-')).join('|');
const rules = [...byRank.keys()].sort((a, b) => a - b).map((rank) => {
  const sameOrHigher = Object.entries(FEATURE_RANK).filter(([, r]) => r >= rank).map(([n]) => n);
  return { name: 'feature-rank:' + rank, severity: 'error',
    comment: 'A feature may value-import only features of a strictly lower rank (FEATURE_RANK).',
    from: { path: '^' + F + '/(' + alt(byRank.get(rank)) + ')/', pathNot: '.*/__tests__/.*|\\.test\\.ts$' },
    to: { path: '^' + F + '/(' + alt(sameOrHigher) + ')/', pathNot: '^' + F + '/$1/', dependencyTypesNot: process.env.TYPES === '1' ? [] : ['type-only', 'type-import'] } };
});
rules.push({ name: 'feature-rank:unranked', severity: 'error', comment: 'Every feature directory must have a FEATURE_RANK entry.',
  from: { path: '^' + F + '/[^/]+/', pathNot: '^' + F + '/(' + alt(Object.keys(FEATURE_RANK)) + '|__tests__)/|.*/__tests__/.*|\\.test\\.ts$' }, to: { path: '^' + F + '/[^/]+/' , pathNot: '^' + F + '/$1/'} });
if (process.env.FOLDER === '1') rules.push({ name: 'no-folder-cycles', scope: 'folder', severity: 'warn', from: { path: '^' + F + '/[^/]+$' }, to: { circular: true } });
export default { forbidden: rules, options: { doNotFollow: { path: 'node_modules' }, tsPreCompilationDeps: process.env.PRECOMP !== '0', tsConfig: { fileName: 'tsconfig.json' } } };
