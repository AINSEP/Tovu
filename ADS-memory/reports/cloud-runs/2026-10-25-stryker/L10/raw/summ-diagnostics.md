| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/web-evidence/lazy-browser.ts | 93 | 71 | 17 | 0 | 0 | 80.7% |
| src/web-evidence/public-page.ts | 307 | 236 | 52 | 1 | 0 | 81.7% |
| src/observability/config.ts | 33 | 24 | 5 | 0 | 0 | 82.8% |
| src/redaction.ts | 92 | 61 | 11 | 0 | 0 | 84.7% |
| src/web-evidence/page-work-budget.ts | 55 | 44 | 7 | 0 | 0 | 86.3% |
| src/core/secrets-only.ts | 598 | 440 | 68 | 0 | 0 | 86.6% |
| src/web-evidence/playwright-runtime.ts | 34 | 21 | 3 | 0 | 0 | 87.5% |
| src/web-evidence/render-page.ts | 296 | 233 | 29 | 1 | 3 | 88.6% |
| src/observability/otel.ts | 156 | 118 | 14 | 0 | 0 | 89.4% |
| src/discovery-filesystem.ts | 10 | 9 | 1 | 0 | 0 | 90.0% |
| src/web-evidence/collect-page-evidence.ts | 163 | 119 | 13 | 0 | 0 | 90.2% |
| src/web-evidence/playwright-browser.ts | 157 | 121 | 11 | 0 | 0 | 91.7% |
| src/web-evidence/same-origin.ts | 88 | 56 | 5 | 0 | 0 | 91.8% |
| src/domain-dns/index.ts | 235 | 186 | 15 | 0 | 0 | 92.5% |
| src/observability/instrumentation.ts | 170 | 133 | 8 | 0 | 0 | 94.3% |
| src/web-evidence/request-guard.ts | 351 | 267 | 16 | 0 | 1 | 94.3% |
| src/manifest.ts | 22 | 17 | 1 | 0 | 0 | 94.4% |
| src/node-ports.ts | 46 | 40 | 2 | 0 | 0 | 95.2% |
| src/zip.ts | 25 | 20 | 1 | 0 | 0 | 95.2% |
| src/observability/hooks.ts | 24 | 23 | 1 | 0 | 0 | 95.8% |
| src/sources.ts | 71 | 63 | 1 | 0 | 0 | 98.4% |
| src/agent-logs.ts | 131 | 104 | 1 | 0 | 0 | 99.0% |
| src/contract.ts | 3 | 0 | 0 | 0 | 0 | 100.0% |
| src/observability/index.ts | 5 | 5 | 0 | 0 | 0 | 100.0% |
| src/observability/node.ts | 4 | 4 | 0 | 0 | 0 | 100.0% |
| src/observability/noop.ts | 10 | 10 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 3179 killed 2425 survived 282 nocov 2 score 89.52%

### src/web-evidence/lazy-browser.ts
by mutator: {"ConditionalExpression":8,"ArithmeticOperator":1,"MethodExpression":1,"BooleanLiteral":3,"BlockStatement":2,"ObjectLiteral":1,"OptionalChaining":1}
44:9 ConditionalExpression `if (idleTimer === null) return;` -> false
53:9 ConditionalExpression `if (closing === null) return;` -> false
69:30 ArithmeticOperator `active = Math.max(0, active - 1);` -> active + 1
69:18 MethodExpression `active = Math.max(0, active - 1);` -> Math.min(0, active - 1)
70:13 ConditionalExpression `if (browser === launching) browser = null;` -> true
77:11 ConditionalExpression `if (idleCloseMs === undefined || browser === null) return;` -> false
108:22 BooleanLiteral `let acquired = false;` -> true
109:82 ConditionalExpression `const release = () => { if (!released) { released = true; active -= 1; if (acquired) lazy.` -> true

### src/web-evidence/public-page.ts
by mutator: {"ObjectLiteral":7,"MethodExpression":3,"ConditionalExpression":15,"ArithmeticOperator":5,"OptionalChaining":3,"Regex":2,"EqualityOperator":10,"AssignmentOperator":2,"LogicalOperator":4,"BooleanLiteral":1,"ArrayDeclaration":1}
35:35 MethodExpression `if (!url.startsWith(prefix) || !url.endsWith(suffix)) return false;` -> url.startsWith(suffix)
40:22 ConditionalExpression `if (found < 0 || found + part.length > end) return false;` -> false
40:22 ArithmeticOperator `if (found < 0 || found + part.length > end) return false;` -> found - part.length
41:14 ArithmeticOperator `offset = found + part.length;` -> found - part.length
52:23 MethodExpression `const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content` -> Object.entries(headers).find(([key]) => key.toLowerCase() ==
52:23 OptionalChaining `const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content` -> Object.entries(headers).find(([key]) => key.toLowerCase() ==
52:23 OptionalChaining `const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content` -> Object.entries(headers).find(([key]) => key.toLowerCase() ==
52:63 ConditionalExpression `const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content` -> true
nocov lines: 178

### src/redaction.ts
by mutator: {"Regex":11}
5:29 Regex `const URL_QUERY_SECRET_RE = /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|access` -> /([?&#])(token|password|secret|key|dsn|api[_-]key|auth|acces
5:29 Regex `const URL_QUERY_SECRET_RE = /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|access` -> /([?&#])(token|password|secret|key|dsn|api[^_-]?key|auth|acc
5:29 Regex `const URL_QUERY_SECRET_RE = /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|access` -> /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|acce
5:29 Regex `const URL_QUERY_SECRET_RE = /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|access` -> /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|acce
5:29 Regex `const URL_QUERY_SECRET_RE = /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|access` -> /([?&#])(token|password|secret|key|dsn|api[_-]?key|auth|acce
11:24 Regex `const BARE_SECRET_RE = /(^|[\s,;])(access_token|refresh_token|id_token|api[_-]?key|passwor` -> /(^|[\s,;])(access_token|refresh_token|id_token|api[_-]key|p
11:24 Regex `const BARE_SECRET_RE = /(^|[\s,;])(access_token|refresh_token|id_token|api[_-]?key|passwor` -> /(^|[\s,;])(access_token|refresh_token|id_token|api[^_-]?key
11:24 Regex `const BARE_SECRET_RE = /(^|[\s,;])(access_token|refresh_token|id_token|api[_-]?key|passwor` -> /(^|[\s,;])(access_token|refresh_token|id_token|api[_-]?key|

### src/core/secrets-only.ts
by mutator: {"ConditionalExpression":12,"LogicalOperator":4,"Regex":43,"OptionalChaining":1,"BooleanLiteral":3,"EqualityOperator":1,"ObjectLiteral":1,"ArrayDeclaration":1,"MethodExpression":1,"ArrowFunction":1}
221:7 ConditionalExpression `if (content.length < 20 || /\s/.test(content) || !/[a-z]/i.test(content) || !/\d/.test(con` -> false
221:7 LogicalOperator `if (content.length < 20 || /\s/.test(content) || !/[a-z]/i.test(content) || !/\d/.test(con` -> (content.length < 20 || /\s/.test(content)) && !/[a-z]/i.tes
221:7 ConditionalExpression `if (content.length < 20 || /\s/.test(content) || !/[a-z]/i.test(content) || !/\d/.test(con` -> false
221:7 LogicalOperator `if (content.length < 20 || /\s/.test(content) || !/[a-z]/i.test(content) || !/\d/.test(con` -> content.length < 20 && /\s/.test(content)
221:7 ConditionalExpression `if (content.length < 20 || /\s/.test(content) || !/[a-z]/i.test(content) || !/\d/.test(con` -> false
221:53 Regex `if (content.length < 20 || /\s/.test(content) || !/[a-z]/i.test(content) || !/\d/.test(con` -> /[^a-z]/i
224:8 Regex `if (!/^[A-Za-z0-9_\-+/=.]{20,}$/.test(content)) return false;` -> /^[A-Za-z0-9_\-+/=.]{20,}/
224:8 Regex `if (!/^[A-Za-z0-9_\-+/=.]{20,}$/.test(content)) return false;` -> /[A-Za-z0-9_\-+/=.]{20,}$/

### src/web-evidence/render-page.ts
by mutator: {"ObjectLiteral":6,"BooleanLiteral":3,"ConditionalExpression":8,"MethodExpression":2,"LogicalOperator":3,"EqualityOperator":2,"Regex":1,"ArrowFunction":1,"BlockStatement":3,"OptionalChaining":1}
90:29 BooleanLiteral `if (!page.locator) return false;` -> true
90:7 ConditionalExpression `if (!page.locator) return false;` -> false
102:9 ConditionalExpression `if (locator.isVisible && !await budget.run({ work: () => locator.isVisible!() })) return f` -> false
103:50 ObjectLiteral `await budget.run({ work: () => locator.click({ timeout: Math.min(500, budget.remainingMs()` -> {}
103:61 MethodExpression `await budget.run({ work: () => locator.click({ timeout: Math.min(500, budget.remainingMs()` -> Math.max(500, budget.remainingMs())
139:40 MethodExpression `const allowed = Object.fromEntries(CONTEXT_OPTION_KEYS.filter(key => contextOptions[key] !` -> CONTEXT_OPTION_KEYS
139:74 ConditionalExpression `const allowed = Object.fromEntries(CONTEXT_OPTION_KEYS.filter(key => contextOptions[key] !` -> true
143:9 LogicalOperator `if (budget.remainingMs() <= 0 || signal.aborted) {` -> budget.remainingMs() <= 0 && signal.aborted
nocov lines: 146

### src/observability/otel.ts
by mutator: {"OptionalChaining":1,"LogicalOperator":1,"ConditionalExpression":3,"Regex":5,"ObjectLiteral":3,"EqualityOperator":1}
13:15 OptionalChaining `const code = (error as { code?: unknown } | null)?.code;` -> (error as {
  code?: unknown;
} | null).code
14:6 LogicalOperator `if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;` -> typeof code === 'string' || /^[A-Z][A-Z0-9_]{1,63}$/.test(co
14:6 ConditionalExpression `if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;` -> true
14:34 Regex `if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;` -> /[A-Z][A-Z0-9_]{1,63}$/
14:34 Regex `if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;` -> /^[A-Z][A-Z0-9_]{1,63}/
22:49 Regex `return redactSecretShapes({ text: path.replace(/[?#][\s\S]*$/, ''), policy: {} }).text;` -> /[?#][\s\S]*/
22:49 Regex `return redactSecretShapes({ text: path.replace(/[?#][\s\S]*$/, ''), policy: {} }).text;` -> /[?#][\S\S]*$/
30:41 Regex `'url.scheme': parsed.protocol.replace(/:$/, ''), 'server.address': parsed.hostname,` -> /:/

### src/web-evidence/collect-page-evidence.ts
by mutator: {"ObjectLiteral":3,"MethodExpression":1,"ArithmeticOperator":1,"ConditionalExpression":3,"EqualityOperator":2,"BlockStatement":1,"LogicalOperator":1,"BooleanLiteral":1}
184:60 ObjectLiteral `const origin = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId }` -> {}
222:30 ObjectLiteral `await new PageWorkBudget({ timeoutMs: Math.max(0, SITE_EVIDENCE_LIMITS.maxTotalMs - (now()` -> {}
222:43 MethodExpression `await new PageWorkBudget({ timeoutMs: Math.max(0, SITE_EVIDENCE_LIMITS.maxTotalMs - (now()` -> Math.min(0, SITE_EVIDENCE_LIMITS.maxTotalMs - (now() - start
222:90 ArithmeticOperator `await new PageWorkBudget({ timeoutMs: Math.max(0, SITE_EVIDENCE_LIMITS.maxTotalMs - (now()` -> now() + startedAt
226:28 ObjectLiteral `return report({ browser: { status: "available" }, pages, skipped: [...skipped, ...runtimeS` -> {}
240:7 ConditionalExpression `if (remainingMs <= 0) {` -> false
240:7 EqualityOperator `if (remainingMs <= 0) {` -> remainingMs < 0
240:25 BlockStatement `if (remainingMs <= 0) {` -> {}

### src/web-evidence/playwright-browser.ts
by mutator: {"ObjectLiteral":2,"ConditionalExpression":5,"BlockStatement":2,"EqualityOperator":2}
73:56 ObjectLiteral `const structureLimits: PageStructureLimits = {` -> {}
82:15 ConditionalExpression `if (request.consentAcceptSelector !== undefined) {` -> true
119:15 BlockStatement `} finally {` -> {}
147:21 BlockStatement `} catch (error) {` -> {}
148:11 ConditionalExpression `if (error instanceof PageWorkTimeout) throw error;` -> true
148:11 ConditionalExpression `if (error instanceof PageWorkTimeout) throw error;` -> false
170:11 ConditionalExpression `if (error instanceof PageWorkTimeout) throw error;` -> false
256:9 ConditionalExpression `...(input.blockedReason !== undefined ? { blockedReason: input.blockedReason } : {}),` -> true

### src/domain-dns/index.ts
by mutator: {"Regex":1,"ConditionalExpression":5,"MethodExpression":5,"EqualityOperator":1,"ArithmeticOperator":1,"ObjectLiteral":2}
61:24 Regex `const reservedName = /\.(?:local|localhost|internal|invalid|test|onion)$/.test(domain);` -> /\.(?:local|localhost|internal|invalid|test|onion)/
69:36 ConditionalExpression `if (typeof value !== "string" || value.length > 254 || value.trim() !== value || /[/\\?#@:` -> false
69:58 ConditionalExpression `if (typeof value !== "string" || value.length > 254 || value.trim() !== value || /[/\\?#@:` -> false
69:58 MethodExpression `if (typeof value !== "string" || value.length > 254 || value.trim() !== value || /[/\\?#@:` -> value
75:52 ConditionalExpression `if (!Array.isArray(value) || value.length < 1 || value.length > 6 || new Set(value).size !` -> false
75:52 EqualityOperator `if (!Array.isArray(value) || value.length < 1 || value.length > 6 || new Set(value).size !` -> value.length >= 6
75:113 MethodExpression `if (!Array.isArray(value) || value.length < 1 || value.length > 6 || new Set(value).size !` -> value.some(type => DNS_TYPES.includes(type))
89:10 MethodExpression `return [...new Set(records.map(({ value }) => type === "AAAA" ? new URL(`https://[${value}` -> [...new Set(records.map(({
  value
}) => type === "AAAA" ? n

### src/web-evidence/request-guard.ts
by mutator: {"BooleanLiteral":2,"BlockStatement":2,"ConditionalExpression":5,"ArithmeticOperator":4,"ObjectLiteral":1,"EqualityOperator":2}
104:25 BooleanLiteral `{ allowDataRequests = false }: { allowDataRequests?: boolean } = {},` -> true
93:11 BlockStatement `} catch {` -> {}
179:7 ConditionalExpression `if (!REDIRECT_STATUSES.has(resource.status)) return undefined;` -> false
180:70 ConditionalExpression `const location = Object.entries(resource.headers).find(([name]) => name.toLowerCase() === ` -> true
217:40 ArithmeticOperator `{ maxRequests = 300, maxTotalBytes = 60 * 1024 * 1024, maxResourceBytes = 15 * 1024 * 1024` -> 60 * 1024 / 1024
217:40 ArithmeticOperator `{ maxRequests = 300, maxTotalBytes = 60 * 1024 * 1024, maxResourceBytes = 15 * 1024 * 1024` -> 60 / 1024
217:77 ArithmeticOperator `{ maxRequests = 300, maxTotalBytes = 60 * 1024 * 1024, maxResourceBytes = 15 * 1024 * 1024` -> 15 * 1024 / 1024
217:77 ArithmeticOperator `{ maxRequests = 300, maxTotalBytes = 60 * 1024 * 1024, maxResourceBytes = 15 * 1024 * 1024` -> 15 / 1024
