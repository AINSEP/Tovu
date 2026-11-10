import ts from "typescript";

/** Declarations that bind a name in some scope (property names and labels are not bindings). */
function bindsName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent || (parent as { name?: ts.Node }).name !== node) return false;
  return ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)
    || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent)
    || ts.isClassExpression(parent) || ts.isEnumDeclaration(parent) || ts.isImportClause(parent)
    || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent) || ts.isImportEqualsDeclaration(parent);
}

/**
 * Resolve an identifier used as a literal tab id (Security.tsx's `ACCESS_TOKENS_TAB`) to its
 * string, reading the identifier's own already-parsed source file. Supported only when the file
 * binds that name exactly once, as a top-level `const NAME = "literal"`. Any other binding of the
 * same name (a nested const, parameter, import, …) could be the one in scope, so it throws rather
 * than guess and generate the wrong journey.
 */
export function topLevelConstString(identifier: ts.Identifier): string {
  const source = identifier.getSourceFile();
  const name = identifier.text;
  const bindings: ts.Identifier[] = [];
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === name && bindsName(node)) bindings.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (bindings.length !== 1) throw new Error(`${name} is bound ${bindings.length} times in ${source.fileName}; only one top-level const string is supported.`);
  const declaration = bindings[0]!.parent;
  const list = declaration.parent;
  if (!ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const)
    || !ts.isVariableStatement(list.parent) || list.parent.parent !== source) {
    throw new Error(`${name} in ${source.fileName} is not a top-level const.`);
  }
  if (!declaration.initializer || !ts.isStringLiteral(declaration.initializer)) throw new Error(`${name} in ${source.fileName} is not initialized with a string literal.`);
  return declaration.initializer.text;
}
