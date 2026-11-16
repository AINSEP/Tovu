// J4 prototype: runtime module cycles in Jini. PRECOMP=1 reads imports before compilation (types included).
const pre = process.env.PRECOMP === '1';
export default {
  forbidden: [{ name: 'no-runtime-circular', severity: 'error', from: { pathNot: '(^|/)__tests__/|\\.(test|spec|typecheck)\\.[cm]?tsx?$' }, to: { circular: true, ...(pre ? { viaOnly: { dependencyTypesNot: ['type-only'] } } : {}) } }],
  options: { doNotFollow: { path: 'node_modules' }, exclude: { path: '(^|/)(__tests__|dist|node_modules)/|\\.(test|spec|typecheck)\\.[cm]?tsx?$' }, tsPreCompilationDeps: pre, tsConfig: { fileName: process.env.TSCONFIG ?? 'tsconfig.base.json' } },
};
