| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/security/security.module.ts | 18 | 6 | 6 | 0 | 0 | 50.0% |
| src/security/conformance/security-api.conformance.ts | 110 | 58 | 30 | 4 | 0 | 63.0% |
| src/security/controllers/other-credentials.controller.ts | 121 | 81 | 32 | 1 | 0 | 71.1% |
| src/security/adapters/memory.ts | 315 | 255 | 25 | 0 | 0 | 91.1% |
| src/security/controllers/access-tokens.controller.ts | 206 | 177 | 16 | 0 | 0 | 91.7% |
| src/security/controllers/root-key.controller.ts | 195 | 166 | 13 | 0 | 0 | 92.7% |
| src/security/rules.ts | 302 | 220 | 16 | 0 | 0 | 93.2% |
| src/core/manifest/rules.ts | 111 | 95 | 6 | 0 | 0 | 94.1% |
| src/security/adapters/http.ts | 278 | 195 | 10 | 0 | 0 | 95.1% |
| src/core/transport/http.ts | 101 | 79 | 2 | 0 | 0 | 97.5% |
| src/contracts/credential-management.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/contracts/media-picker.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/contracts/playground-render-target.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/core/permissions/rules.ts | 5 | 4 | 0 | 0 | 0 | 100.0% |
| src/core/routing/rules.ts | 80 | 66 | 0 | 0 | 0 | 100.0% |
| src/core/transport/errors.ts | 8 | 7 | 0 | 0 | 0 | 100.0% |
| src/security/ports.ts | 6 | 3 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 1862 killed 1415 survived 156 nocov 5 ignored 286 score 89.78%

### src/security/security.module.ts
by mutator: {"ObjectLiteral":4,"ArrayDeclaration":2}
4:122 ObjectLiteral `export const securityModule = defineAdminModule({ id: 'security', requires: { securityApi:` -> {}
4:307 ArrayDeclaration `export const securityModule = defineAdminModule({ id: 'security', requires: { securityApi:` -> []
4:331 ObjectLiteral `export const securityModule = defineAdminModule({ id: 'security', requires: { securityApi:` -> {}
4:390 ObjectLiteral `export const securityModule = defineAdminModule({ id: 'security', requires: { securityApi:` -> {}
4:496 ArrayDeclaration `export const securityModule = defineAdminModule({ id: 'security', requires: { securityApi:` -> []
4:540 ObjectLiteral `export const securityModule = defineAdminModule({ id: 'security', requires: { securityApi:` -> {}

### src/security/conformance/security-api.conformance.ts
by mutator: {"ConditionalExpression":14,"EqualityOperator":1,"ArrayDeclaration":2,"MethodExpression":4,"ArrowFunction":4,"LogicalOperator":5,"ObjectLiteral":2,"OptionalChaining":1,"BooleanLiteral":1}
9:102 MethodExpression `const connection = { providerId: provider.id, [provider.tokenField]: secret, ...Object.fro` -> provider.fields
9:125 ArrowFunction `const connection = { providerId: provider.id, [provider.tokenField]: secret, ...Object.fro` -> () => undefined
9:166 ArrowFunction `const connection = { providerId: provider.id, [provider.tokenField]: secret, ...Object.fro` -> () => undefined
10:25 ArrayDeclaration `const ids: string[] = [];` -> ["Stryker was here"]
14:105 ConditionalExpression `const renamed = await target.update({ id: a.id, patch: { label: `Renamed ${suffix}` } }, {` -> true
14:105 LogicalOperator `const renamed = await target.update({ id: a.id, patch: { label: `Renamed ${suffix}` } }, {` -> renamed.id === a.id || renamed.label === `Renamed ${suffix}`
14:105 ConditionalExpression `const renamed = await target.update({ id: a.id, patch: { label: `Renamed ${suffix}` } }, {` -> true
14:128 ConditionalExpression `const renamed = await target.update({ id: a.id, patch: { label: `Renamed ${suffix}` } }, {` -> true
15:61 ObjectLiteral `const replaced = await target.update({ id: a.id, patch: { connection } }, {}); check(!JSON` -> {}
16:120 ConditionalExpression `await target.update({ id: b.id, patch: { isDefault: true } }, {}); const listed = await ta` -> true
nocov lines: 9

### src/security/controllers/other-credentials.controller.ts
by mutator: {"ArrayDeclaration":1,"BooleanLiteral":4,"ObjectLiteral":8,"ConditionalExpression":11,"LogicalOperator":5,"UpdateOperator":2,"EqualityOperator":1,"MethodExpression":1}
7:204 BooleanLiteral `const store = createControllerStore({ initial: { rows: [] as readonly OtherCredentialSumma` -> true
9:54 ObjectLiteral `try { const rows = await api.list({ store: id }, { signal: store.signal }); if (ticket ===` -> {}
9:85 ConditionalExpression `try { const rows = await api.list({ store: id }, { signal: store.signal }); if (ticket ===` -> true
10:17 ConditionalExpression `catch { if (ticket === generation) store.set({ patch: { errors: { ...store.getSnapshot().e` -> true
9:125 ObjectLiteral `try { const rows = await api.list({ store: id }, { signal: store.signal }); if (ticket ===` -> {}
13:9 ConditionalExpression `if (store.signal.aborted || !grants.has('security.read')) return; const ticket = ++generat` -> false
13:9 LogicalOperator `if (store.signal.aborted || !grants.has('security.read')) return; const ticket = ++generat` -> store.signal.aborted && !grants.has('security.read')
13:86 UpdateOperator `if (store.signal.aborted || !grants.has('security.read')) return; const ticket = ++generat` -> --generation
13:110 ObjectLiteral `if (store.signal.aborted || !grants.has('security.read')) return; const ticket = ++generat` -> {}
13:119 ObjectLiteral `if (store.signal.aborted || !grants.has('security.read')) return; const ticket = ++generat` -> {}
nocov lines: 5

### src/security/adapters/memory.ts
by mutator: {"ArrayDeclaration":3,"ConditionalExpression":16,"LogicalOperator":3,"MethodExpression":1,"Regex":2}
13:55 ArrayDeclaration `export function createMemorySecurityApi({ providers = [], rows = [] }: { providers?: reado` -> ["Stryker was here"]
13:66 ArrayDeclaration `export function createMemorySecurityApi({ providers = [], rows = [] }: { providers?: reado` -> ["Stryker was here"]
18:72 ConditionalExpression `return patch.isDefault ?? initial?.isDefault ?? !items.some(r => r.kind === kind && r.prov` -> true
18:72 LogicalOperator `return patch.isDefault ?? initial?.isDefault ?? !items.some(r => r.kind === kind && r.prov` -> r.kind === kind || r.providerId === providerId
18:72 ConditionalExpression `return patch.isDefault ?? initial?.isDefault ?? !items.some(r => r.kind === kind && r.prov` -> true
18:91 ConditionalExpression `return patch.isDefault ?? initial?.isDefault ?? !items.some(r => r.kind === kind && r.prov` -> true
27:90 ConditionalExpression `function check(label: string, providerId: string, id?: string) { if (items.some(r => r.kin` -> true
29:49 ConditionalExpression `if (row.isDefault) items = items.map(r => r.kind === kind && r.providerId === row.provider` -> true
29:49 LogicalOperator `if (row.isDefault) items = items.map(r => r.kind === kind && r.providerId === row.provider` -> r.kind === kind || r.providerId === row.providerId
29:49 ConditionalExpression `if (row.isDefault) items = items.map(r => r.kind === kind && r.providerId === row.provider` -> true

### src/security/controllers/access-tokens.controller.ts
by mutator: {"ArrayDeclaration":1,"BooleanLiteral":2,"ObjectLiteral":4,"UpdateOperator":2,"ConditionalExpression":5,"LogicalOperator":1,"ArrowFunction":1}
9:67 ArrayDeclaration `export function createAccessTokensController({ api, permissions = [] }: { api: SecurityApi` -> ["Stryker was here"]
11:190 BooleanLiteral `const store = createControllerStore({ initial: { rows: [] as readonly CredentialSummary[],` -> true
16:44 ObjectLiteral `const ticket = ++generation; store.set({ patch: { loading: true } });` -> {}
16:20 UpdateOperator `const ticket = ++generation; store.set({ patch: { loading: true } });` -> --generation
16:53 ObjectLiteral `const ticket = ++generation; store.set({ patch: { loading: true } });` -> {}
16:64 BooleanLiteral `const ticket = ++generation; store.set({ patch: { loading: true } });` -> false
20:72 ObjectLiteral `try { const rows = await credentialStore({ api, kind }).list({}, { signal: store.signal })` -> {}
21:19 ConditionalExpression `catch { if (ticket === generation) store.set({ patch: { errors: { ...store.getSnapshot().e` -> true
24:35 ConditionalExpression `await Promise.all(tasks); if (ticket === generation) store.set({ patch: { loading: false }` -> true
38:104 ConditionalExpression `store.set({ patch: { draft: null, rows: Object.freeze([...store.getSnapshot().rows.filter(` -> true

### src/security/controllers/root-key.controller.ts
by mutator: {"ArrayDeclaration":1,"BooleanLiteral":3,"UpdateOperator":4,"ObjectLiteral":3,"ConditionalExpression":2}
10:62 ArrayDeclaration `export function createRootKeyController({ api, permissions = [] }: { api: RootKeyPort; per` -> ["Stryker was here"]
12:163 BooleanLiteral `const store = createControllerStore({ initial: { status: null as RootKeyStatus | null, pre` -> true
12:258 BooleanLiteral `const store = createControllerStore({ initial: { status: null as RootKeyStatus | null, pre` -> true
16:44 UpdateOperator `if (!allowed()) return; const ticket = ++generation; store.set({ patch: { loading: true } ` -> --generation
17:47 ObjectLiteral `try { const status = await api.status({}, { signal: store.signal }); if (ticket === genera` -> {}
19:19 ConditionalExpression `finally { if (ticket === generation) store.set({ patch: { loading: false } }); }` -> true
36:45 ObjectLiteral `return execute(() => api.generate({}, { signal: store.signal }), 'Root key ready');` -> {}
41:22 UpdateOperator `const ticket = ++generation; store.set({ patch: { loading: true, preview: null, confirm: '` -> --generation
41:66 BooleanLiteral `const ticket = ++generation; store.set({ patch: { loading: true, preview: null, confirm: '` -> false
42:61 ObjectLiteral `try { const preview = await api.previewStartFresh({}, { signal: store.signal }); if (ticke` -> {}

### src/security/rules.ts
by mutator: {"ConditionalExpression":3,"LogicalOperator":3,"MethodExpression":3,"OptionalChaining":1,"ObjectLiteral":6}
21:33 ConditionalExpression `return `${providers.find(p => p.kind === row.kind && p.id === row.providerId)?.label ?? ro` -> true
21:33 LogicalOperator `return `${providers.find(p => p.kind === row.kind && p.id === row.providerId)?.label ?? ro` -> p.kind === row.kind || p.id === row.providerId
21:33 ConditionalExpression `return `${providers.find(p => p.kind === row.kind && p.id === row.providerId)?.label ?? ro` -> true
21:56 ConditionalExpression `return `${providers.find(p => p.kind === row.kind && p.id === row.providerId)?.label ?? ro` -> true
25:13 MethodExpression `const q = query.trim().toLowerCase();` -> query
26:151 LogicalOperator `return rows.filter(row => (category === 'all' || credentialCategory({ row }) === category)` -> row.baseUrl && ''
26:170 LogicalOperator `return rows.filter(row => (category === 'all' || credentialCategory({ row }) === category)` -> row.accountLabel && ''
32:137 MethodExpression `return rows.some(r => r.kind === draft.kind && r.id !== draft.id && (draft.kind === 'custo` -> r.label
39:20 MethodExpression `if (draft.id && !draft.token.trim()) return null;` -> draft.token
58:91 OptionalChaining `const extras = provider ? provider.fields.filter(f => f.name !== provider.tokenField && dr` -> draft.values[f.name].trim

### src/security/adapters/http.ts
by mutator: {"ConditionalExpression":10}
7:9 ConditionalExpression `...(row.accountLabel !== undefined ? { accountLabel: row.accountLabel } : {}), ...(kind ==` -> true
47:16 ConditionalExpression `return { ...(entry.baseUrl !== undefined ? { baseUrl: entry.baseUrl } : {}), ...(entry.mod` -> true
47:84 ConditionalExpression `return { ...(entry.baseUrl !== undefined ? { baseUrl: entry.baseUrl } : {}), ...(entry.mod` -> true
47:146 ConditionalExpression `return { ...(entry.baseUrl !== undefined ? { baseUrl: entry.baseUrl } : {}), ...(entry.mod` -> true
61:220 ConditionalExpression `async function request<T>(path: string, method: 'GET' | 'PUT' | 'DELETE', options: Request` -> true
85:214 ConditionalExpression `async function request<T>(suffix: string, method: 'GET' | 'POST', options: RequestOptions,` -> true
86:171 ConditionalExpression `function result(r: RootKeyResult): RootKeyResult { return { outcome: r.outcome, fingerprin` -> true
86:234 ConditionalExpression `function result(r: RootKeyResult): RootKeyResult { return { outcome: r.outcome, fingerprin` -> true
86:300 ConditionalExpression `function result(r: RootKeyResult): RootKeyResult { return { outcome: r.outcome, fingerprin` -> true
88:265 ConditionalExpression `async status(_r, o = {}) { const r = await request<RootKeyStatus>('', 'GET', o); return { ` -> true
