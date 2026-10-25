| file | mutants | killed | survived | no-cov | timeout | score |
|---|---|---|---|---|---|---|
| src/ingest.ts | 435 | 315 | 45 | 0 | 1 | 87.5% |
| src/repo.memory.ts | 25 | 22 | 3 | 0 | 0 | 88.0% |
| src/forwarding.ts | 164 | 137 | 6 | 0 | 0 | 95.8% |
| src/salt.ts | 17 | 12 | 0 | 0 | 0 | 100.0% |
| src/ports.ts | 1 | 1 | 0 | 0 | 0 | 100.0% |

TOTAL mutants 642 killed 487 survived 54 nocov 0 score 90.02%

### src/ingest.ts
by mutator: {"BlockStatement":2,"ConditionalExpression":17,"MethodExpression":4,"EqualityOperator":4,"ArrowFunction":2,"ArrayDeclaration":2,"ArithmeticOperator":2,"LogicalOperator":6,"UnaryOperator":1,"Regex":5}
61:53 BlockStatement `try { return decodeURIComponent(segment); } catch { return segment; }` -> {}
235:7 ConditionalExpression `if (!ip.includes("::")) {` -> false
235:27 BlockStatement `if (!ip.includes("::")) {` -> {}
236:12 MethodExpression `return ip.split(":").filter((group) => group.length > 0);` -> ip.split(":")
236:44 ConditionalExpression `return ip.split(":").filter((group) => group.length > 0);` -> true
236:44 EqualityOperator `return ip.split(":").filter((group) => group.length > 0);` -> group.length >= 0
240:29 MethodExpression `const headGroups = head ? head.split(":").filter((group) => group.length > 0) : [];` -> head.split(":")
240:63 ConditionalExpression `const headGroups = head ? head.split(":").filter((group) => group.length > 0) : [];` -> true
