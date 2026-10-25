| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/core/project.ts | 3 | 1 | 1 | 0 | 0 | 50.0% |
| src/node/store.ts | 672 | 362 | 196 | 27 | 2 | 61.9% |
| src/react/use-vibecoding-session.ts | 17 | 11 | 6 | 0 | 0 | 64.7% |
| src/node/project.ts | 453 | 248 | 62 | 61 | 0 | 66.8% |
| src/node/paths.ts | 180 | 121 | 25 | 0 | 1 | 82.9% |
| src/session.ts | 106 | 83 | 14 | 0 | 2 | 85.6% |
| src/html/node/parse5-region-parser.ts | 250 | 168 | 21 | 1 | 2 | 88.4% |
| src/tools.ts | 118 | 88 | 8 | 0 | 0 | 91.7% |
| src/html/edit.ts | 160 | 135 | 7 | 0 | 0 | 95.1% |
| src/html/regions.ts | 163 | 145 | 7 | 0 | 0 | 95.4% |
| src/core/history.ts | 103 | 95 | 1 | 0 | 1 | 99.0% |
| src/core/apply.ts | 35 | 30 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 2260 killed 1487 survived 348 nocov 89 ignored 336 score 77.29%

### src/core/project.ts
by mutator: {"ObjectLiteral":1}
36:26 ObjectLiteral `super(input.message, { cause: input.cause });` -> {}

### src/node/store.ts
by mutator: {"BlockStatement":25,"ObjectLiteral":16,"ConditionalExpression":83,"BooleanLiteral":5,"ArrayDeclaration":20,"LogicalOperator":24,"ArrowFunction":7,"EqualityOperator":21,"OptionalChaining":4,"AssignmentOperator":2,"ArithmeticOperator":5,"MethodExpression":8,"UnaryOperator":1,"Regex":2}
11:54 BlockStatement `function fingerprint(info: Fingerprint): Fingerprint {` -> {}
15:10 LogicalOperator `return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === righ` -> left.size === right.size && left.mtimeMs === right.mtimeMs |
15:10 ConditionalExpression `return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === righ` -> true
15:10 LogicalOperator `return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === righ` -> left.size === right.size || left.mtimeMs === right.mtimeMs
15:10 ConditionalExpression `return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === righ` -> true
15:38 ConditionalExpression `return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === righ` -> true
15:72 ConditionalExpression `return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === righ` -> true
19:40 ArrowFunction `const kept = new Set(after.files.map(file => file.path)), folders = new Set<string>();` -> () => undefined
21:9 ConditionalExpression `if (kept.has(file.path)) continue;` -> false
48:60 ConditionalExpression `return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(chi` -> true
nocov lines: 85,184-185,233,245,261,274,307,340,359,388-389,399,409-410

### src/react/use-vibecoding-session.ts
by mutator: {"ArrowFunction":1,"ArrayDeclaration":5}
54:31 ArrowFunction `const refresh = useCallback(() => session.refresh(), [session]);` -> () => undefined
54:56 ArrayDeclaration `const refresh = useCallback(() => session.refresh(), [session]);` -> []
55:97 ArrayDeclaration `const readPart = useCallback<VibecodingSession['readPart']>((args) => session.readPart(arg` -> []
58:5 ArrayDeclaration `[session],` -> []
60:50 ArrayDeclaration `const undo = useCallback(() => session.undo(), [session]);` -> []
61:50 ArrayDeclaration `const redo = useCallback(() => session.redo(), [session]);` -> []

### src/node/project.ts
by mutator: {"ArrayDeclaration":7,"ObjectLiteral":26,"MethodExpression":5,"BooleanLiteral":6,"BlockStatement":11,"ConditionalExpression":39,"ArrowFunction":12,"UnaryOperator":2,"EqualityOperator":13,"LogicalOperator":2}
28:50 ConditionalExpression `return left.generation === right.generation && left.revisionId === right.revisionId;` -> true
36:7 EqualityOperator `if (changes.length > limits.maxChanges) fail('LIMIT', 'too many changes in one turn');` -> changes.length >= limits.maxChanges
44:33 ArrayDeclaration `assertCandidatePaths({ paths: [...files.keys()] });` -> []
51:31 BlockStatement `if (change.op === 'create') {` -> {}
52:9 ConditionalExpression `if (files.has(path)) fail('INVALID_CHANGE', `file already exists: ${path}`);` -> false
55:7 ConditionalExpression `if (change.content.length > limits.maxFileBytes) fail('LIMIT', `file exceeds byte limit: $` -> false
55:7 EqualityOperator `if (change.content.length > limits.maxFileBytes) fail('LIMIT', `file exceeds byte limit: $` -> change.content.length >= limits.maxFileBytes
57:7 EqualityOperator `if (bytes.byteLength > limits.maxFileBytes) fail('LIMIT', `file exceeds byte limit: ${path` -> bytes.byteLength >= limits.maxFileBytes
61:7 ConditionalExpression `if (files.size > limits.maxFiles) fail('LIMIT', 'candidate exceeds file count');` -> false
61:7 EqualityOperator `if (files.size > limits.maxFiles) fail('LIMIT', 'candidate exceeds file count');` -> files.size >= limits.maxFiles
nocov lines: 77-79,90-91,102,130,144,151-153,185-186,242-243,259,264-265,268-269,272-277,293-300,308-312,321,328

### src/node/paths.ts
by mutator: {"MethodExpression":4,"BlockStatement":1,"ConditionalExpression":6,"LogicalOperator":2,"EqualityOperator":2,"Regex":3,"ArithmeticOperator":4,"ObjectLiteral":3}
21:10 MethodExpression `return path.normalize('NFC').toLowerCase().toUpperCase().toLowerCase();` -> path.normalize('NFC').toLowerCase().toUpperCase().toUpperCas
21:10 MethodExpression `return path.normalize('NFC').toLowerCase().toUpperCase().toLowerCase();` -> path.normalize('NFC').toLowerCase().toLowerCase()
21:10 MethodExpression `return path.normalize('NFC').toLowerCase().toUpperCase().toLowerCase();` -> path.normalize('NFC').toUpperCase()
28:46 BlockStatement `for (const value of Object.values(limits)) {` -> {}
29:9 ConditionalExpression `if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('project limits must b` -> false
29:9 LogicalOperator `if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('project limits must b` -> !Number.isSafeInteger(value) && value <= 0
29:41 ConditionalExpression `if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('project limits must b` -> false
29:41 EqualityOperator `if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('project limits must b` -> value < 0
42:7 EqualityOperator `if (segments.length > maxDepth) throw new ProjectError({ code: 'LIMIT', message: 'path exc` -> segments.length >= maxDepth
48:19 ConditionalExpression `if (!segment || segment === '.' || segment === '..' || /[<>:"|?*\x00-\x1f\x7f]/.test(segme` -> false

### src/session.ts
by mutator: {"ObjectLiteral":1,"ConditionalExpression":11,"ArrowFunction":1,"LogicalOperator":1}
151:12 ObjectLiteral `commit({ status: 'loading' });` -> {}
158:11 ConditionalExpression `if (applyTurn) partContent.clear();` -> true
158:11 ConditionalExpression `if (applyTurn) partContent.clear();` -> false
172:9 ConditionalExpression `if (applyTurn) partContent.clear();` -> false
192:13 ConditionalExpression `if (applyTurn) partContent.clear();` -> true
192:13 ConditionalExpression `if (applyTurn) partContent.clear();` -> false
196:50 ConditionalExpression `for (const id of partContent.keys()) if (!known.has(id)) partContent.delete(id);` -> true
193:41 ArrowFunction `const known = new Set(parts.map((p) => p.id));` -> () => undefined
207:13 ConditionalExpression `if (applyTurn) partContent.clear();` -> true
207:13 ConditionalExpression `if (applyTurn) partContent.clear();` -> false

### src/html/node/parse5-region-parser.ts
by mutator: {"ArrayDeclaration":2,"LogicalOperator":4,"ConditionalExpression":9,"ObjectLiteral":1,"UnaryOperator":4,"EqualityOperator":1,"BooleanLiteral":1}
137:7 LogicalOperator `if (node.nodeName !== "#text" || !("parentNode" in node)) return false;` -> node.nodeName !== "#text" && !("parentNode" in node)
137:7 ConditionalExpression `if (node.nodeName !== "#text" || !("parentNode" in node)) return false;` -> false
139:10 ConditionalExpression `return parent !== null && "tagName" in parent && TEXT_BODY_ELEMENTS.has(parent.tagName);` -> true
139:10 LogicalOperator `return parent !== null && "tagName" in parent && TEXT_BODY_ELEMENTS.has(parent.tagName);` -> parent !== null && "tagName" in parent || TEXT_BODY_ELEMENTS
139:10 ConditionalExpression `return parent !== null && "tagName" in parent && TEXT_BODY_ELEMENTS.has(parent.tagName);` -> true
139:10 LogicalOperator `return parent !== null && "tagName" in parent && TEXT_BODY_ELEMENTS.has(parent.tagName);` -> parent !== null || "tagName" in parent
139:10 ConditionalExpression `return parent !== null && "tagName" in parent && TEXT_BODY_ELEMENTS.has(parent.tagName);` -> true
169:35 ObjectLiteral `if (!location?.startTag) return { start: -1, end: -1, innerStart: -1, innerEnd: -1 };` -> {}
169:44 UnaryOperator `if (!location?.startTag) return { start: -1, end: -1, innerStart: -1, innerEnd: -1 };` -> +1
169:53 UnaryOperator `if (!location?.startTag) return { start: -1, end: -1, innerStart: -1, innerEnd: -1 };` -> +1
nocov lines: 312
