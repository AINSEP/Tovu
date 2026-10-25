| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/tokens.ts | 2 | 0 | 1 | 0 | 0 | 0.0% |
| src/node/stub-guard.ts | 148 | 107 | 21 | 0 | 2 | 83.6% |
| src/text-suppression.ts | 219 | 170 | 25 | 0 | 6 | 87.2% |
| src/manifest.ts | 331 | 248 | 30 | 0 | 0 | 89.2% |
| src/store.ts | 52 | 41 | 3 | 0 | 0 | 93.2% |
| src/publication-guard.ts | 56 | 45 | 3 | 0 | 0 | 93.8% |
| src/stub-guard.ts | 133 | 101 | 6 | 0 | 0 | 94.4% |
| src/runtime-compat.ts | 5 | 5 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 946 killed 717 survived 89 nocov 0 score 88.96%

### src/tokens.ts
by mutator: {"ObjectLiteral":1}
9:56 ObjectLiteral `export const ArtifactStoreToken = token<ArtifactStore>({ id: 'jini.artifactStore' });` -> {}

### src/node/stub-guard.ts
by mutator: {"ConditionalExpression":9,"LogicalOperator":2,"EqualityOperator":6,"OptionalChaining":2,"ArrayDeclaration":1,"BlockStatement":1}
48:9 ConditionalExpression `if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid artifact sidecar');` -> false
48:9 LogicalOperator `if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid artifact sidecar');` -> !info.isFile() && info.size > maxBytes
48:27 ConditionalExpression `if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid artifact sidecar');` -> false
48:27 EqualityOperator `if (!info.isFile() || info.size > maxBytes) throw new Error('Invalid artifact sidecar');` -> info.size >= maxBytes
51:12 EqualityOperator `while (length < bytes.length) {` -> length <= bytes.length
58:9 EqualityOperator `if (length > maxBytes) throw new Error('Artifact sidecar exceeds the byte limit');` -> length >= maxBytes
90:9 EqualityOperator `if (Buffer.byteLength(raw, 'utf8') > MAX_SIDECAR_BYTES) return null;` -> Buffer.byteLength(raw, 'utf8') >= MAX_SIDECAR_BYTES
92:16 OptionalChaining `const id = parsed?.metadata?.identifier;` -> parsed?.metadata.identifier

### src/text-suppression.ts
by mutator: {"ConditionalExpression":11,"EqualityOperator":2,"MethodExpression":6,"Regex":6}
68:9 ConditionalExpression `if (text.length <= 0) return;` -> false
68:9 EqualityOperator `if (text.length <= 0) return;` -> text.length < 0
79:21 ConditionalExpression `if (!close || close.index === undefined) {` -> false
97:17 ConditionalExpression `if (open && open.index !== undefined) {` -> true
154:10 EqualityOperator `while (index >= min) {` -> index > min
157:9 ConditionalExpression `if (index === 0) break;` -> true
166:7 ConditionalExpression `if (text.includes('>')) return null;` -> false
185:12 ConditionalExpression `return compact.length === 0 || canonicals.some((c) => c.startsWith(compact) || compact.sta` -> false

### src/manifest.ts
by mutator: {"ConditionalExpression":15,"LogicalOperator":4,"EqualityOperator":5,"Regex":1,"MethodExpression":2,"ObjectLiteral":2,"BooleanLiteral":1}
81:7 ConditionalExpression `if (!value || typeof value !== 'object' || Array.isArray(value)) return false;` -> false
81:7 LogicalOperator `if (!value || typeof value !== 'object' || Array.isArray(value)) return false;` -> (!value || typeof value !== 'object') && Array.isArray(value
81:7 ConditionalExpression `if (!value || typeof value !== 'object' || Array.isArray(value)) return false;` -> false
81:7 LogicalOperator `if (!value || typeof value !== 'object' || Array.isArray(value)) return false;` -> !value && typeof value !== 'object'
81:17 ConditionalExpression `if (!value || typeof value !== 'object' || Array.isArray(value)) return false;` -> false
83:10 ConditionalExpression `return proto === Object.prototype || proto === null;` -> true
94:7 EqualityOperator `if (value.length > maxLen) return `${field} exceeds max length (${maxLen})`;` -> value.length >= maxLen
101:7 EqualityOperator `if (value.length > MAX_SUPPORTING_FILE_LENGTH) {` -> value.length >= MAX_SUPPORTING_FILE_LENGTH
