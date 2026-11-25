/**
 * @file Env-read AST walk, shared by `hygiene-audit.mjs` (inventory) and `check-env-schema.mjs`
 * (enforcement). Side-effect free: TypeScript is injected and nothing runs at import.
 *
 * Returns `[name, source, line]` rows. Assignment targets and `delete` operands are writes, not
 * reads, so they are not reported; a dynamic `process.env[expr]` read is reported as `<dynamic…>`.
 */

const unwrapWith = (ts) => (n) => { while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isParenthesizedExpression(n) || ts.isTypeAssertionExpression?.(n))) n = n.expression; return n; };
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

function envMatchers({ ts, aliases }) {
  const unwrap = unwrapWith(ts);
  const isProcEnv = (e) => { e = unwrap(e); return ts.isPropertyAccessExpression(e) && e.name.text === "env" && /^(globalThis\.)?process$/.test(e.expression.getText()); };
  const isMetaEnv = (e) => { e = unwrap(e); return ts.isPropertyAccessExpression(e) && e.name.text === "env" && e.expression.getText() === "import.meta"; };
  // injected env objects: `env.X`, `deps.env.X`, `env[NAME]` — plus aliases of process.env
  const isEnvObj = (e) => { e = unwrap(e); return (ts.isIdentifier(e) && (e.text === "env" || aliases.has(e.text))) || (ts.isPropertyAccessExpression(e) && e.name.text === "env" && !isProcEnv(e) && !isMetaEnv(e)); };
  return { unwrap, isProcEnv, isMetaEnv, isEnvObj };
}

function isWriteTarget({ ts, n }) {
  const p = n.parent;
  if (p && ts.isDeleteExpression(p)) return true;
  return Boolean(p && ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken);
}

function readDeclaration({ ts, sf, n, m, aliases, reads }) {
  if (!n.initializer || !m.isProcEnv(n.initializer)) return;
  if (ts.isIdentifier(n.name)) aliases.add(n.name.text);
  else if (ts.isObjectBindingPattern(n.name)) for (const el of n.name.elements) { const k = el.propertyName ?? el.name; if (ts.isIdentifier(k) || ts.isStringLiteral(k)) reads.push([k.text, "destructure", lineOf(sf, el)]); }
}

function readPropertyAccess({ ts, sf, n, m, aliases, reads }) {
  const e = n.expression;
  if (m.isProcEnv(e)) reads.push([n.name.text, "process.env", lineOf(sf, n)]);
  else if (m.isMetaEnv(e)) reads.push([n.name.text, "import.meta.env", lineOf(sf, n)]);
  else if (ts.isIdentifier(e) && aliases.has(e.text)) reads.push([n.name.text, "alias", lineOf(sf, n)]);
  else if (m.isEnvObj(e) && /^[A-Z][A-Z0-9_]{2,}$/.test(n.name.text)) reads.push([n.name.text, "env-param", lineOf(sf, n)]);
}

function readElementAccess({ ts, sf, n, m, consts, aliases, reads }) {
  const a = m.unwrap(n.argumentExpression);
  const literal = a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : undefined;
  const k = literal ?? (ts.isIdentifier(a) && typeof consts.get(a.text) === "string" ? consts.get(a.text) : undefined);
  const direct = m.isProcEnv(n.expression) || (ts.isIdentifier(n.expression) && aliases.has(n.expression.text));
  if (k && /^[A-Z_][A-Z0-9_]*$/.test(k)) reads.push([k, direct ? "process.env[]" : "env-param[]", lineOf(sf, n)]);
  else if (direct) reads.push([ts.isIdentifier(a) ? `<dynamic:${a.text}>` : "<dynamic>", "dynamic", lineOf(sf, n)]);
}

function isNameLiteral({ ts, n }) {
  return ts.isStringLiteral(n) && /^(TOVU|JINI)_[A-Z0-9_]{2,}$/.test(n.text) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent);
}

/** Every env read in one parsed source file. `consts` maps top-level string constants to their text. */
export function collectEnvReads({ ts, sourceFile, consts }, _optional = {}) {
  const sf = sourceFile;
  const reads = []; // [name, source, line]
  const aliases = new Set();
  const m = envMatchers({ ts, aliases });
  const ctx = { ts, sf, m, consts, aliases, reads };
  const visit = (n) => {
    if (ts.isVariableDeclaration(n)) readDeclaration({ ...ctx, n });
    if (ts.isPropertyAccessExpression(n)) { if (!isWriteTarget({ ts, n })) readPropertyAccess({ ...ctx, n }); }
    else if (ts.isElementAccessExpression(n) && (m.isProcEnv(n.expression) || m.isEnvObj(n.expression))) { if (!isWriteTarget({ ts, n })) readElementAccess({ ...ctx, n }); }
    else if (isNameLiteral({ ts, n })) reads.push([n.text, "name-literal", lineOf(sf, n)]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return reads;
}
