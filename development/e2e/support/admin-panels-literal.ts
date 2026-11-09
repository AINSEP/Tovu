import ts from "typescript";

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/** A `.map(panel => ({ ...panel, render: … }))` keeps every panel's literal id and nav: the
 * callback returns an object whose first member spreads its parameter and which overrides neither. */
function isIdentityPreservingPanelMap(call: ts.CallExpression): boolean {
  const [callback] = call.arguments;
  if (call.arguments.length !== 1 || !callback || !ts.isArrowFunction(callback) || callback.parameters.length !== 1) return false;
  const parameter = callback.parameters[0]!.name;
  if (!ts.isIdentifier(parameter) || ts.isBlock(callback.body)) return false;
  const body = unwrap(callback.body);
  if (!ts.isObjectLiteralExpression(body)) return false;
  const [first, ...rest] = body.properties;
  if (!first || !ts.isSpreadAssignment(first) || !ts.isIdentifier(first.expression) || first.expression.text !== parameter.text) return false;
  return rest.every(member => {
    if (ts.isSpreadAssignment(member)) return false;
    const name = staticPropertyName(member.name);
    return name !== undefined && name !== "id" && name !== "nav";
  });
}

/** `id`, `"id"` and `'id'` all name the same key; a computed name (`["id"]`, `[key]`) is unknown. */
function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

/**
 * The literal panel array that `ADMIN_PANELS` in `apps/admin/src/panels.tsx` is built from.
 * Since 3b8c3a13 `ADMIN_PANELS` is `PANELS.map(...)` (each render wrapped in Suspense) over the
 * literal `PANELS`; follow that one hop. Any other shape throws, so a source change can never
 * silently shrink the journeys that are generated from this manifest.
 */
export function adminPanelsLiteral(source: ts.SourceFile, name = "ADMIN_PANELS"): ts.ArrayLiteralExpression {
  const declarations = new Map<string, ts.VariableDeclaration>();
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const seen = new Set<string>();
  let current = name;
  for (;;) {
    if (seen.has(current)) throw new Error(`${name} resolves through a cycle at ${current}.`);
    seen.add(current);
    const initializer = declarations.get(current)?.initializer;
    if (!initializer) throw new Error(`${current} not found in ${source.fileName}; update the admin panel manifest reader.`);
    const value = unwrap(initializer);
    if (ts.isArrayLiteralExpression(value)) return value;
    if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) && value.expression.name.text === "map"
      && ts.isIdentifier(value.expression.expression) && isIdentityPreservingPanelMap(value)) {
      current = value.expression.expression.text;
      continue;
    }
    throw new Error(`${current} must be a literal array or an id/nav-preserving .map over one; update the admin panel manifest reader.`);
  }
}
