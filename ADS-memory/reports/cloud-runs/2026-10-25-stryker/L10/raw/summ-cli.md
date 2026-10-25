| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/version-command.ts | 79 | 47 | 20 | 0 | 0 | 70.1% |
| src/daemon-command.ts | 97 | 52 | 22 | 0 | 0 | 70.3% |
| src/run-command.ts | 340 | 204 | 58 | 0 | 2 | 77.9% |
| src/prompt.ts | 160 | 102 | 23 | 0 | 0 | 81.6% |
| src/redact.ts | 35 | 28 | 4 | 0 | 0 | 87.5% |
| src/main.ts | 178 | 134 | 16 | 0 | 2 | 89.3% |
| src/introspection.ts | 62 | 47 | 5 | 0 | 0 | 90.4% |
| src/errors.ts | 110 | 88 | 9 | 0 | 0 | 90.7% |
| src/http.ts | 260 | 203 | 15 | 0 | 2 | 93.1% |
| src/flags.ts | 130 | 115 | 6 | 0 | 2 | 95.0% |
| src/daemon-url.ts | 73 | 63 | 2 | 0 | 0 | 96.9% |
| src/command-registry.ts | 64 | 56 | 1 | 0 | 1 | 98.2% |
| src/local-daemon-discovery.ts | 14 | 11 | 0 | 0 | 0 | 100.0% |
| src/tokens.ts | 2 | 1 | 0 | 0 | 0 | 100.0% |
| src/usage.ts | 31 | 24 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 1635 killed 1175 survived 181 nocov 0 score 86.65%

### src/version-command.ts
by mutator: {"LogicalOperator":2,"ConditionalExpression":10,"EqualityOperator":2,"ObjectLiteral":5,"ArrayDeclaration":1}
51:12 LogicalOperator `write: deps.writeErr ?? defaultWriteErr,` -> deps.writeErr && defaultWriteErr
53:9 ConditionalExpression `...(deps.exitCodes !== undefined ? { exitCodes: deps.exitCodes } : {}),` -> true
65:9 ConditionalExpression `...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),` -> true
66:9 ConditionalExpression `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> true
66:9 ConditionalExpression `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> false
66:9 EqualityOperator `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> deps.writeErr === undefined
66:39 ObjectLiteral `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> {}
67:9 ConditionalExpression `...(deps.exit !== undefined ? { exit: deps.exit } : {}),` -> true

### src/daemon-command.ts
by mutator: {"LogicalOperator":1,"ConditionalExpression":7,"EqualityOperator":2,"ObjectLiteral":9,"ArrayDeclaration":3}
57:12 LogicalOperator `write: deps.writeErr ?? defaultWriteErr,` -> deps.writeErr && defaultWriteErr
59:9 ConditionalExpression `...(deps.exitCodes !== undefined ? { exitCodes: deps.exitCodes } : {}),` -> true
71:9 ConditionalExpression `...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),` -> true
72:9 ConditionalExpression `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> true
72:9 ConditionalExpression `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> false
72:9 EqualityOperator `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> deps.writeErr === undefined
72:39 ObjectLiteral `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> {}
73:9 ConditionalExpression `...(deps.exit !== undefined ? { exit: deps.exit } : {}),` -> true

### src/run-command.ts
by mutator: {"ConditionalExpression":17,"EqualityOperator":5,"ObjectLiteral":27,"ArrayDeclaration":8,"BlockStatement":1}
74:9 ConditionalExpression `...(deps.exitCodes !== undefined ? { exitCodes: deps.exitCodes } : {}),` -> true
86:9 ConditionalExpression `...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),` -> true
87:9 ConditionalExpression `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> true
87:9 ConditionalExpression `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> false
87:9 EqualityOperator `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> deps.writeErr === undefined
87:39 ObjectLiteral `...(deps.writeErr !== undefined ? { write: deps.writeErr } : {}),` -> {}
88:9 ConditionalExpression `...(deps.exit !== undefined ? { exit: deps.exit } : {}),` -> true
89:9 ConditionalExpression `...(deps.exitCodes !== undefined ? { exitCodes: deps.exitCodes } : {}),` -> true

### src/prompt.ts
by mutator: {"ConditionalExpression":5,"BooleanLiteral":3,"BlockStatement":3,"OptionalChaining":4,"EqualityOperator":3,"ObjectLiteral":4,"LogicalOperator":1}
99:94 ConditionalExpression `const readLimits: ReadLimits = { maxBytes: options.maxBytes ?? DEFAULT_MAX_READ_BYTES, ...` -> true
111:43 ConditionalExpression `const stream = createReadStream(path, limits.signal !== undefined ? { signal: limits.signa` -> true
126:11 ConditionalExpression `if (settled) return;` -> false
127:17 BooleanLiteral `settled = true;` -> false
162:33 BlockStatement `const cleanup = (): void => {` -> {}
168:36 BlockStatement `const pauseStdin = (): void => {` -> {}
169:7 OptionalChaining `(process.stdin as unknown as { pause?: () => void }).pause?.();` -> (process.stdin as unknown as {
  pause?: () => void;
}).paus
173:11 EqualityOperator `if (total > limits.maxBytes) {` -> total >= limits.maxBytes

### src/main.ts
by mutator: {"ConditionalExpression":5,"EqualityOperator":2,"MethodExpression":1,"ObjectLiteral":7,"ArrayDeclaration":1}
174:7 ConditionalExpression `if (!token.startsWith('--')) return null;` -> false
176:15 EqualityOperator `const key = eq >= 0 ? token.slice(2, eq) : token.slice(2);` -> eq > 0
178:53 EqualityOperator `return { key: key as GlobalFlagName, inlineValue: eq >= 0 ? token.slice(eq + 1) : undefine` -> eq > 0
195:11 ConditionalExpression `...(discover !== undefined ? { discover } : {}),` -> true
208:10 ConditionalExpression `return argv.length === 0 || argv[0] === '--help' || argv[0] === '-h';` -> false
214:71 MethodExpression `return argv[0] === '--version' || argv[0] === '-v' ? ['version', ...argv.slice(1)] : argv;` -> argv
225:39 ConditionalExpression `const commandDeps = { ...ports, ...(fetchImpl === undefined ? {} : { fetchImpl }) };` -> false
115:32 ObjectLiteral `const ROOT_USAGE = renderUsage({ usage: ['jini <command> [...args]'] }, { description: 'CL` -> {}

### src/http.ts
by mutator: {"ConditionalExpression":10,"OptionalChaining":3,"LogicalOperator":1,"BlockStatement":1}
43:33 ConditionalExpression `const cause = err !== null && typeof err === 'object' ? (err as { cause?: unknown }).cause` -> true
69:7 ConditionalExpression `if (code !== null && SANDBOX_DENIAL_CODES.has(code)) {` -> true
97:25 OptionalChaining `const contentLength = resp.headers?.get?.('content-length');` -> resp.headers?.get('content-length')
98:7 ConditionalExpression `if (contentLength === null || contentLength === undefined) return;` -> false
98:7 LogicalOperator `if (contentLength === null || contentLength === undefined) return;` -> contentLength === null && contentLength === undefined
98:7 ConditionalExpression `if (contentLength === null || contentLength === undefined) return;` -> false
98:33 ConditionalExpression `if (contentLength === null || contentLength === undefined) return;` -> false
119:13 BlockStatement `} finally {` -> {}
