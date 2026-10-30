/** AST import discovery over git's exact file inventory. Never loads application modules. */
import path from "node:path";
import ts from "typescript";
import type { Optional } from "./coverage-changed-model.js";

export interface ModuleScan { imports: string[]; complexity: number; runtimeReasons: string[]; mockCount: number; declaredFunctions: string[]; generated: boolean }
export interface Alias { pattern: string; targets: readonly string[] }

function runtimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.length === 0 || clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

const branchKinds = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement, ts.SyntaxKind.CatchClause, ts.SyntaxKind.CaseClause,
]);

function branches(node: ts.Node): number {
  if (branchKinds.has(node.kind)) return 1;
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return 1;
  return 0;
}

function declaredName({ node, ast }: { node: ts.Node; ast: ts.SourceFile }, _optional: Optional = {}): string {
  const named = node as ts.FunctionDeclaration;
  if (named.name) return named.name.getText(ast);
  if (ts.isConstructorDeclaration(node)) return "constructor";
  const parent = node.parent;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))) return parent.name.getText(ast);
  return "(anonymous)";
}

function exportHasRuntime({ node }: { node: ts.ExportDeclaration }, _optional: Optional = {}): boolean {
  if (node.isTypeOnly || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return false;
  const clause = node.exportClause;
  return !clause || !ts.isNamedExports(clause) || clause.elements.length === 0 || clause.elements.some((element) => !element.isTypeOnly);
}

function staticImport({ node }: { node: ts.Node }, _optional: Optional = {}): string | undefined {
  if (ts.isImportDeclaration(node) && runtimeImport(node) && ts.isStringLiteral(node.moduleSpecifier)) return node.moduleSpecifier.text;
  if (ts.isExportDeclaration(node) && exportHasRuntime({ node })) return (node.moduleSpecifier as ts.StringLiteral).text;
  return importEqualsSpecifier({ node });
}
function importEqualsSpecifier({ node }: { node: ts.Node }, _optional: Optional = {}): string | undefined {
  if (!ts.isImportEqualsDeclaration(node) || node.isTypeOnly || !ts.isExternalModuleReference(node.moduleReference)) return undefined;
  const expression = node.moduleReference.expression;
  return expression && ts.isStringLiteral(expression) ? expression.text : undefined;
}

function scanCall({ node, ast, addImport, runtimeReasons }: {
  node: ts.CallExpression; ast: ts.SourceFile; addImport: (specifier: string) => void; runtimeReasons: Set<string>;
}, _optional: Optional = {}): number {
  const callee = node.expression.getText(ast);
  const first = node.arguments[0];
  if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || callee === "require") && first && ts.isStringLiteralLike(first)) addImport(first.text);
  if (/^(?:globalThis\.)?fetch$|^(?:[\w$]+\.)?(?:spawn|spawnSync|execFile|execFileSync|fork|createConnection)$/.test(callee)) runtimeReasons.add(`direct runtime call ${callee}; isolate network/real process behavior behind a port`);
  if (/\.(?:evaluate|evaluateHandle|executeJavaScript)$/.test(callee)) runtimeReasons.add(`possible serialized browser/process execution (${callee}); Node coverage cannot prove remote execution`);
  return /^(vi\.(?:mock|doMock)|mock\.module|jest\.(?:mock|doMock))$/.test(callee) ? 1 : 0;
}

function isFunction(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}

export function scanModule({ file, source }: { file: string; source: string }, _optional: Optional = {}): ModuleScan {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>(), runtimeReasons = new Set<string>();
  const declaredFunctions: string[] = [];
  const comments = ts.getLeadingCommentRanges(source, 0) ?? [];
  const generated = comments.some((comment) => /@generated\b|\bauto[- ]generated\b|\bautomatically generated\b/i.test(source.slice(comment.pos, comment.end)));
  const stack: number[] = [1];
  let complexity = 1, mockCount = 0;
  const addImport = (specifier: string) => {
    imports.add(specifier);
    if (/^(electron(?:\/|$)|(?:node:)?(?:child_process|worker_threads|net|http|https|tls)$)/.test(specifier)) runtimeReasons.add(`direct runtime dependency ${specifier}; consider an injected port`);
  };
  const visit = (node: ts.Node) => {
    const fn = isFunction(node);
    if (fn) {
      stack.push(1);
      declaredFunctions.push(declaredName({ node, ast }));
    }
    stack[stack.length - 1]! += branches(node);
    const specifier = staticImport({ node });
    if (specifier !== undefined) addImport(specifier);
    if (ts.isCallExpression(node)) mockCount += scanCall({ node, ast, addImport, runtimeReasons });
    ts.forEachChild(node, visit);
    if (fn) complexity = Math.max(complexity, stack.pop()!);
  };
  visit(ast);
  return { imports: [...imports], complexity: Math.max(complexity, stack[0]!), runtimeReasons: [...runtimeReasons], mockCount, declaredFunctions, generated };
}

function candidates(base: string): string[] {
  const out = [base];
  if (/\.(?:js|jsx|mjs|cjs)$/.test(base)) {
    const stem = base.replace(/\.[^.]+$/, "");
    out.push(...[".ts", ".tsx", ".mts", ".cts"].map((extension) => stem + extension));
  }
  if (!/\.[cm]?[jt]sx?$/.test(base)) {
    for (const extension of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]) out.push(base + extension, `${base}/index${extension}`);
  }
  return out.map((file) => path.posix.normalize(file));
}

export function resolveLocalImport({ file, specifier, files }: { file: string; specifier: string; files: ReadonlySet<string> }, { aliases = [] }: { aliases?: readonly Alias[] } = {}): string | undefined {
  const bases: string[] = [];
  if (specifier.startsWith(".")) bases.push(path.posix.join(path.posix.dirname(file), specifier));
  else if (specifier.startsWith("#src/")) bases.push(`apps/website/src/${specifier.slice(5)}`);
  else if (specifier.startsWith("@/") && file.startsWith("apps/admin/")) bases.push(`apps/admin/src/${specifier.slice(2)}`);
  for (const alias of aliases) bases.push(...aliasBases({ alias, specifier }));
  return bases.flatMap(candidates).find((candidate) => files.has(candidate));
}

function aliasBases({ alias, specifier }: { alias: Alias; specifier: string }, _optional: Optional = {}): readonly string[] {
  const at = alias.pattern.indexOf("*");
  if (at < 0) return alias.pattern === specifier ? alias.targets : [];
  const head = alias.pattern.slice(0, at), tail = alias.pattern.slice(at + 1);
  if (!specifier.startsWith(head) || !specifier.endsWith(tail)) return [];
  const value = specifier.slice(head.length, tail ? -tail.length : undefined);
  return alias.targets.map((target) => target.replace("*", value));
}

export interface TestPick { test: string; changedFile?: string; reason: string }

export function discoverTests({ changed, modules, reported = [], inventory = new Set(modules.keys()) }: {
  changed: readonly string[]; modules: ReadonlyMap<string, ModuleScan>; reported?: readonly string[]; inventory?: ReadonlySet<string>;
}, { cap = 20, totalCap = 200, aliases = [] }: { cap?: number; totalCap?: number; aliases?: readonly Alias[] } = {}) {
  validateCaps({ cap, totalCap });
  const files = new Set([...modules.keys()].filter((file) => inventory.has(file)));
  const reverse = reverseImports({ files, modules, aliases });
  const byFile = new Map<string, string[]>(), importingByFile = new Map<string, string[]>();
  const { errors, warnings, validReported } = reportedTests({ reported, inventory, modules });
  const queues = new Map<string, TestPick[]>(), allCandidates = new Set(validReported);
  for (const changedFile of changed) {
    const importing = importingTests({ changedFile, reverse });
    const { candidates, rank } = rankedTests({ changedFile, files, reverse, importing, validReported });
    byFile.set(changedFile, candidates);
    importingByFile.set(changedFile, [...importing].sort());
    for (const test of candidates) allCandidates.add(test);
    queues.set(changedFile, candidates.slice(0, cap).map((test) => ({ test, changedFile,
      reason: ["report TESTS TO RUN", "own directory / feature tests", "direct importer (one hop), ranked by path proximity", "wider transitive importer, ranked by path proximity"][rank(test)]! })));
  }
  const { tests, picks } = selectTests({ validReported, byFile, queues, cap, totalCap });
  warnUnselectedFiles({ queues, tests, warnings });
  return { tests, omitted: [...allCandidates].filter((test) => !tests.includes(test)), byFile, importingByFile, errors, warnings, picks };
}

function validateCaps({ cap, totalCap }: { cap: number; totalCap: number }, _optional: Optional = {}): void {
  if (!Number.isInteger(cap) || cap < 1 || cap > 200) throw new Error("Test cap must be an integer from 1 to 200");
  if (!Number.isInteger(totalCap) || totalCap < 1 || totalCap > 2000) throw new Error("Total test cap must be an integer from 1 to 2000");
}

function reverseImports({ files, modules, aliases }: { files: Set<string>; modules: ReadonlyMap<string, ModuleScan>; aliases: readonly Alias[] }, _optional: Optional = {}) {
  const reverse = new Map<string, Set<string>>();
  for (const file of files) {
    for (const specifier of modules.get(file)!.imports) {
      const dependency = resolveLocalImport({ file, specifier, files }, { aliases: file.startsWith("apps/admin/") ? aliases : [] });
      if (!dependency) continue;
      const consumers = reverse.get(dependency) ?? new Set(); consumers.add(file); reverse.set(dependency, consumers);
    }
  }
  return reverse;
}

function temporary({ file }: { file: string }, _optional: Optional = {}): boolean {
  return file.split("/").some((part) => part.startsWith("_tmp-"));
}
function isTest(file: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !temporary({ file }) && !/\/(?:fixtures|__fixtures__|node_modules|dist|build|coverage|generated|__generated__)\//.test(file);
}
function reportedTests({ reported, inventory, modules }: { reported: readonly string[]; inventory: ReadonlySet<string>; modules: ReadonlyMap<string, ModuleScan> }, _optional: Optional = {}) {
  const errors: string[] = [], warnings: string[] = [], validReported: string[] = [];
  for (const test of [...new Set(reported)]) {
    if (temporary({ file: test })) warnings.push(`Ignored temporary reported test: ${test}`);
    else if (!inventory.has(test)) errors.push(`Reported test is missing from git inventory (tracked + untracked): ${test}`);
    else if (!modules.has(test)) errors.push(`Reported test is missing: ${test}`);
    else if (isTest(test)) validReported.push(test);
  }
  return { errors, warnings, validReported };
}
function importingTests({ changedFile, reverse }: { changedFile: string; reverse: Map<string, Set<string>> }, _optional: Optional = {}) {
  const queue = [changedFile], seen = new Set(queue), importing = new Set<string>();
  for (let at = 0; at < queue.length; at++) {
    for (const consumer of reverse.get(queue[at]!) ?? []) {
      if (isTest(consumer)) importing.add(consumer);
      if (!seen.has(consumer)) { seen.add(consumer); queue.push(consumer); }
    }
  }
  return importing;
}
function proximity({ source, test }: { source: string; test: string }, _optional: Optional = {}): number {
  const a = path.posix.dirname(source).split("/"), b = path.posix.dirname(test).split("/");
  let shared = 0;
  while (shared < Math.min(a.length, b.length) && a[shared] === b[shared]) shared++;
  return a.length + b.length - 2 * shared;
}
function rankedTests({ changedFile, files, reverse, importing, validReported }: {
  changedFile: string; files: Set<string>; reverse: Map<string, Set<string>>; importing: Set<string>; validReported: string[];
}, _optional: Optional = {}) {
  const directory = path.posix.dirname(changedFile), stem = path.posix.basename(changedFile).replace(/\.[^.]+$/, "");
  const feature = /^(.*\/features\/[^/]+)(?:\/|$)/.exec(changedFile)?.[1];
  const own = [...files].filter((test) => isTest(test) && (
    test.startsWith(`${directory}/__tests__/`) || (feature && test.startsWith(`${feature}/`)) ||
    (path.posix.dirname(test) === directory && path.posix.basename(test).startsWith(`${stem}.`))));
  const direct = new Set([...(reverse.get(changedFile) ?? [])].filter(isTest));
  const candidates = [...new Set([...own, ...importing])];
  const rank = (test: string) => validReported.includes(test) ? 0 : own.includes(test) ? 1 : direct.has(test) ? 2 : 3;
  // Shared repo __tests__ directories can contain hundreds of unrelated tests. Resolve
  // directory-distance ties using the source basename before alphabetical ordering.
  const nameDistance = (test: string) => path.posix.basename(test).startsWith(`${stem}.`) ? 0 : 1;
  candidates.sort((a, b) => rank(a) - rank(b) || proximity({ source: changedFile, test: a }) - proximity({ source: changedFile, test: b }) || nameDistance(a) - nameDistance(b) || (a < b ? -1 : a > b ? 1 : 0));
  return { candidates, rank };
}
function selectTests({ validReported, byFile, queues, cap, totalCap }: {
  validReported: string[]; byFile: Map<string, string[]>; queues: Map<string, TestPick[]>; cap: number; totalCap: number;
}, _optional: Optional = {}) {
  const tests: string[] = [], picks: TestPick[] = [];
  const pick = (entry: TestPick) => {
    if (tests.includes(entry.test)) return;
    if (tests.length >= totalCap) return;
    tests.push(entry.test); picks.push(entry);
  };
  // Standalone report tests are also authoritative even when there is no changed source.
  for (const test of validReported) {
    const related = [...byFile.values()].some((entries) => entries.includes(test));
    if (!related || [...queues.values()].some((entries) => entries.some((entry) => entry.test === test))) pick({ test, reason: "report TESTS TO RUN" });
  }
  // Each source gets its nearest remaining test before any source gets its next slot.
  // Shared tests count once globally, while each file retains its own capped queue.
  for (let round = 0; round < cap; round++) {
    for (const entries of queues.values()) if (entries[round]) pick(entries[round]!);
  }
  return { tests, picks };
}

function warnUnselectedFiles({ queues, tests, warnings }: { queues: Map<string, TestPick[]>; tests: string[]; warnings: string[] }, _optional: Optional = {}): void {
  for (const [file, entries] of queues) {
    if (entries.length && !entries.some((entry) => tests.includes(entry.test))) warnings.push(`Total cap leaves no selected tests for changed file: ${file}`);
  }
}
