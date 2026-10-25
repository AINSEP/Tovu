| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/source-control/source-control.module.ts | 14 | 6 | 3 | 0 | 0 | 66.7% |
| src/agent-plugins/conformance/agent-plugins-api.conformance.ts | 232 | 141 | 68 | 0 | 0 | 67.5% |
| src/source-control/adapters/memory.ts | 125 | 89 | 30 | 0 | 0 | 74.8% |
| src/source-control/conformance/source-control-api.conformance.ts | 162 | 105 | 30 | 0 | 0 | 77.8% |
| src/agent-plugins/controllers/agent-plugins.controller.ts | 193 | 167 | 25 | 0 | 0 | 87.0% |
| src/agent-plugins/rules.ts | 163 | 75 | 11 | 0 | 0 | 87.2% |
| src/source-control/controllers/source-control.controller.ts | 157 | 135 | 17 | 0 | 0 | 88.8% |
| src/agent-plugins/agent-plugins.module.ts | 14 | 9 | 1 | 0 | 0 | 90.0% |
| src/agent-plugins/controllers/agent-plugin-files.controller.ts | 75 | 63 | 5 | 0 | 0 | 92.6% |
| src/source-control/adapters/http.ts | 43 | 27 | 2 | 0 | 0 | 93.1% |
| src/source-control/rules.ts | 109 | 89 | 6 | 0 | 0 | 93.7% |
| src/agent-plugins/package-file-tree.ts | 214 | 147 | 9 | 0 | 0 | 94.2% |
| src/agent-plugins/adapters/http.ts | 27 | 17 | 1 | 0 | 0 | 94.4% |
| src/agent-plugins/adapters/memory.ts | 43 | 36 | 2 | 0 | 0 | 94.7% |
| src/agent-plugins/ports.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/source-control/messages.en.ts | 9 | 1 | 0 | 0 | 0 | 100.0% |
| src/source-control/ports.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 1584 killed 1109 survived 210 nocov 0 ignored 265 score 84.08%

### src/source-control/source-control.module.ts
by mutator: {"ArrayDeclaration":1,"ObjectLiteral":2}
5:292 ArrayDeclaration `export const sourceControlModule = defineAdminModule({ id: 'source-control', requires: { s` -> []
5:322 ObjectLiteral `export const sourceControlModule = defineAdminModule({ id: 'source-control', requires: { s` -> {}
5:379 ObjectLiteral `export const sourceControlModule = defineAdminModule({ id: 'source-control', requires: { s` -> {}

### src/agent-plugins/conformance/agent-plugins-api.conformance.ts
by mutator: {"BlockStatement":9,"ConditionalExpression":33,"LogicalOperator":8,"OptionalChaining":6,"EqualityOperator":5,"BooleanLiteral":3,"MethodExpression":2,"ObjectLiteral":2}
12:76 BlockStatement `await test('lists installed packages independent of activation', () => { check(initial.len` -> {}
12:84 ConditionalExpression `await test('lists installed packages independent of activation', () => { check(initial.len` -> true
12:84 LogicalOperator `await test('lists installed packages independent of activation', () => { check(initial.len` -> initial.length >= 2 || new Set(initial.map(p => p.pluginId))
12:84 ConditionalExpression `await test('lists installed packages independent of activation', () => { check(initial.len` -> true
12:107 ConditionalExpression `await test('lists installed packages independent of activation', () => { check(initial.len` -> true
14:159 ConditionalExpression `await test('activation replies with the single updated row', async () => { const row = awa` -> true
14:159 LogicalOperator `await test('activation replies with the single updated row', async () => { const row = awa` -> row.pluginId === pluginId && row.enabled === !first.enabled 
14:159 ConditionalExpression `await test('activation replies with the single updated row', async () => { const row = awa` -> true
14:159 LogicalOperator `await test('activation replies with the single updated row', async () => { const row = awa` -> row.pluginId === pluginId || row.enabled === !first.enabled
14:159 ConditionalExpression `await test('activation replies with the single updated row', async () => { const row = awa` -> true

### src/source-control/adapters/memory.ts
by mutator: {"ArrayDeclaration":3,"ObjectLiteral":1,"ArrowFunction":2,"MethodExpression":4,"ConditionalExpression":12,"LogicalOperator":3,"UpdateOperator":1,"BooleanLiteral":2,"BlockStatement":1,"EqualityOperator":1}
4:60 ArrayDeclaration `export function createMemorySourceControlApi({ providers = [], credentials = [] }: { provi` -> ["Stryker was here"]
5:127 ObjectLiteral `const catalog: readonly SourceControlProvider[] = Object.freeze(providers.map(p => Object.` -> {}
4:192 ArrowFunction `export function createMemorySourceControlApi({ providers = [], credentials = [] }: { provi` -> () => undefined
8:78 MethodExpression `function checkLabel(providerId: string, label: string, id?: string) { if (!label.trim()) f` -> label
8:188 MethodExpression `function checkLabel(providerId: string, label: string, id?: string) { if (!label.trim()) f` -> label
9:145 ArrayDeclaration `function validate(input: SourceControlCredentialInput['connection']) { const info = source` -> ["Stryker was here"]
10:111 ConditionalExpression `function setDefault(row: SourceControlCredential) { if (row.isDefault) for (const old of r` -> true
10:59 ConditionalExpression `function setDefault(row: SourceControlCredential) { if (row.isDefault) for (const old of r` -> true
10:111 ConditionalExpression `function setDefault(row: SourceControlCredential) { if (row.isDefault) for (const old of r` -> true
10:111 LogicalOperator `function setDefault(row: SourceControlCredential) { if (row.isDefault) for (const old of r` -> old.providerId === row.providerId && old.id !== row.id || ol

### src/source-control/conformance/source-control-api.conformance.ts
by mutator: {"MethodExpression":3,"ConditionalExpression":12,"LogicalOperator":3,"OptionalChaining":2,"ObjectLiteral":8,"ArrowFunction":1,"ArrayDeclaration":1}
22:19 MethodExpression `pass({ run, ok: (await api.providers({})).some(p => p.id === providerId), name: 'provider ` -> (await api.providers({})).every(p => p.id === providerId)
24:19 ConditionalExpression `pass({ run, ok: first.configured && !!first.id, name: 'create returns configured summary' ` -> true
24:19 LogicalOperator `pass({ run, ok: first.configured && !!first.id, name: 'create returns configured summary' ` -> first.configured || !!first.id
26:19 MethodExpression `pass({ run, ok: (await api.list({})).some(r => r.id === first.id), name: 'list contains cr` -> (await api.list({})).every(r => r.id === first.id)
26:50 ConditionalExpression `pass({ run, ok: (await api.list({})).some(r => r.id === first.id), name: 'list contains cr` -> true
35:36 ConditionalExpression `pass({ run, ok: list.filter(r => r.providerId === providerId && r.isDefault).length === 1 ` -> true
35:96 OptionalChaining `pass({ run, ok: list.filter(r => r.providerId === providerId && r.isDefault).length === 1 ` -> list.find(r => r.id === second.id).isDefault
41:19 ConditionalExpression `pass({ run, ok: renamed.label === 'conformance-renamed' && renamed.configured, name: 'meta` -> true
41:19 LogicalOperator `pass({ run, ok: renamed.label === 'conformance-renamed' && renamed.configured, name: 'meta` -> renamed.label === 'conformance-renamed' || renamed.configure
41:19 ConditionalExpression `pass({ run, ok: renamed.label === 'conformance-renamed' && renamed.configured, name: 'meta` -> true

### src/agent-plugins/controllers/agent-plugins.controller.ts
by mutator: {"ArrayDeclaration":3,"BooleanLiteral":2,"LogicalOperator":1,"ConditionalExpression":5,"UpdateOperator":3,"ObjectLiteral":7,"ArrowFunction":2,"OptionalChaining":2}
7:67 ArrayDeclaration `export function createAgentPluginsController({ api, permissions = [] }: { api: AgentPlugin` -> ["Stryker was here"]
9:95 BooleanLiteral `const store = createControllerStore<AgentPluginsState>({ initial: { plugins: null, loading` -> true
9:160 ArrayDeclaration `const store = createControllerStore<AgentPluginsState>({ initial: { plugins: null, loading` -> ["Stryker was here"]
17:48 LogicalOperator `const pendingStillEnabled = rows.some(p => p.pluginId === state.pendingDisable?.pluginId &` -> p.pluginId === state.pendingDisable?.pluginId || p.enabled
17:48 ConditionalExpression `const pendingStillEnabled = rows.some(p => p.pluginId === state.pendingDisable?.pluginId &` -> true
21:44 UpdateOperator `if (!canRead()) return; const ticket = ++generation, version = revision;` -> --generation
22:15 ObjectLiteral `store.set({ patch: { loading: true, error: null } });` -> {}
22:24 ObjectLiteral `store.set({ patch: { loading: true, error: null } });` -> {}
22:35 BooleanLiteral `store.set({ patch: { loading: true, error: null } });` -> false
24:42 ObjectLiteral `const plugins = await api.list({}, { signal: store.signal });` -> {}

### src/agent-plugins/rules.ts
by mutator: {"LogicalOperator":2,"ArrayDeclaration":5,"ConditionalExpression":1,"MethodExpression":1,"Regex":1,"ArrowFunction":1}
14:59 LogicalOperator `return Object.freeze({ pluginId: row.pluginId, version: row.version ?? null, description: ` -> row.version && null
14:93 LogicalOperator `return Object.freeze({ pluginId: row.pluginId, version: row.version ?? null, description: ` -> row.description && null
14:142 ArrayDeclaration `return Object.freeze({ pluginId: row.pluginId, version: row.version ?? null, description: ` -> []
14:287 ArrayDeclaration `return Object.freeze({ pluginId: row.pluginId, version: row.version ?? null, description: ` -> []
27:10 ConditionalExpression `return file.omitted === null && file.content !== null ? null : omissions[file.omitted ?? '` -> true
44:77 MethodExpression `const tokens = (values: readonly string[]) => new Set(values.flatMap(s => s.toLowerCase().` -> s.toLowerCase().split(/[^a-z0-9]+/)
44:99 Regex `const tokens = (values: readonly string[]) => new Set(values.flatMap(s => s.toLowerCase().` -> /[^a-z0-9]/
45:77 ArrowFunction `for (const tier of [[plugin.pluginId], plugin.keywords, plugin.skills.map(s => s.name)]) {` -> () => undefined
36:18 ArrayDeclaration `['compliance', ['compliance', 'privacy', 'gdpr', 'ccpa', 'cpra', 'consent', 'security', 'a` -> []
39:19 ArrayDeclaration `['integration', ['mcp', 'integration', 'connector', 'webhook', 'api']],` -> []

### src/source-control/controllers/source-control.controller.ts
by mutator: {"ArrayDeclaration":1,"ConditionalExpression":7,"BooleanLiteral":2,"UpdateOperator":3,"ObjectLiteral":3,"LogicalOperator":1}
16:68 ArrayDeclaration `export function createSourceControlController({ api, permissions = [] }: { api: SourceCont` -> ["Stryker was here"]
14:90 ConditionalExpression `return Object.freeze(credentials.some(c => c.id === summary.id) ? credentials.map(c => c.i` -> false
17:156 BooleanLiteral `const grants = new Set(permissions), store = createControllerStore<SourceControlState>({ i` -> true
23:44 UpdateOperator `if (!canRead()) return; const ticket = ++generation, revision = credentialRevision; store.` -> --generation
23:99 ObjectLiteral `if (!canRead()) return; const ticket = ++generation, revision = credentialRevision; store.` -> {}
23:108 ObjectLiteral `if (!canRead()) return; const ticket = ++generation, revision = credentialRevision; store.` -> {}
23:119 BooleanLiteral `if (!canRead()) return; const ticket = ++generation, revision = credentialRevision; store.` -> false
26:98 ConditionalExpression `(async () => { try { const credentials = await api.list({}, { signal: store.signal }); if ` -> true
26:291 ConditionalExpression `(async () => { try { const credentials = await api.list({}, { signal: store.signal }); if ` -> true
27:70 ObjectLiteral `(async () => { try { const providers = await api.providers({}, { signal: store.signal }); ` -> {}
