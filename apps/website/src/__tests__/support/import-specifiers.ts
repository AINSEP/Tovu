import ts from "typescript";

/** Shared boundary-test scanner: use the language parser so comments and strings cannot invent edges.
 * Runtime guards omit erased type edges; feature ownership guards retain them by default.
 * @complexity O(n) time and space in source length; performs no I/O or module evaluation.
 */
export function importSpecifiers({ source }: { source: string }, options: { runtimeOnly?: boolean; fileName?: string } = {}): string[] {
  const file = ts.createSourceFile(options.fileName ?? "boundary.ts", source, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  function visit(node: ts.Node): void {
    const specifier = staticSpecifier(node, options) ?? callSpecifier(node) ?? importEqualsSpecifier(node, options);
    if (specifier !== undefined) specifiers.push(specifier);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return specifiers;
}

function staticSpecifier(node: ts.Node, options: { runtimeOnly?: boolean }): string | undefined {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return undefined;
  if (!node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier)) return undefined;
  const typeOnly = ts.isImportDeclaration(node) ? isTypeOnlyImport(node) : isTypeOnlyExport(node);
  return options.runtimeOnly && typeOnly ? undefined : node.moduleSpecifier.text;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return !clause.name && !!bindings && ts.isNamedImports(bindings)
    && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly);
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  return !!node.exportClause && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly);
}

function callSpecifier(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const loadsModule = node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === "require");
  const argument = node.arguments[0];
  return loadsModule && argument && ts.isStringLiteralLike(argument) ? argument.text : undefined;
}

function importEqualsSpecifier(node: ts.Node, options: { runtimeOnly?: boolean }): string | undefined {
  if (!ts.isImportEqualsDeclaration(node)) return undefined;
  if (options.runtimeOnly && node.isTypeOnly) return undefined;
  if (!ts.isExternalModuleReference(node.moduleReference)) return undefined;
  const expression = node.moduleReference.expression;
  return expression && ts.isStringLiteralLike(expression) ? expression.text : undefined;
}
