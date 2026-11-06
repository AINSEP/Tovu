import tseslint from 'typescript-eslint';

// Use ESLint's maintained AST selector engine instead of a new source parser. This is an early
// syntax tripwire; Map<SiteScopeKey, ...> also rejects aliases at the TypeScript boundary.
const methods = 'CallExpression[callee.property.name=/^(get|set|has|delete|add)$/]';
const sharedSiteKeys = ['workspaceId', 'siteId'].map(name => ({ name, selectors: [
  `${methods}[arguments.0.name="${name}"]`,
  `${methods}[arguments.0.property.name="${name}"]`,
  `${methods}[arguments.0.property.value="${name}"]`,
  `MemberExpression[computed=true][property.name="${name}"]`,
  `MemberExpression[computed=true][property.property.name="${name}"]`,
  `Property[computed=true][key.name="${name}"]`,
  `NewExpression[callee.name=/^(Map|Set)$/] Identifier[name="${name}"]`,
] }));
const restrictions = sharedSiteKeys.map(({ selectors }) => ['error', ...selectors.map(selector => ({
  selector, message: 'Shared site state needs a per-site SiteScopeKey. workspaceId (also named siteId in daemon IPC) may be workspace-local for every site.',
}))]);

export default [
  { ignores: ['**/*.test.*', '**/__tests__/**', '**/fixtures/**'] },
  { files: ['apps/desktop/src/**/*.{ts,tsx,mts,cts}', 'apps/website/src/server/inbound/assistant/agent-daemon-{server,scope-control}.ts'],
    languageOptions: { parser: tseslint.parser }, linterOptions: { noInlineConfig: true },
    rules: { 'no-restricted-syntax': restrictions[0] } },
  // In this private protocol, siteId aliases workspaceId. Desktop UI siteId can instead be a
  // verified directory (for example presence/openSites), so only the shared host bans that alias.
  { files: ['apps/website/src/server/inbound/assistant/agent-daemon-{server,scope-control}.ts'],
    rules: { 'no-restricted-syntax': ['error', ...restrictions.flatMap(rule => rule.slice(1))] } },
];
