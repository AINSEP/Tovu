// Owner limits inside files a step touches. Usage: node fn-sizes.mjs <repoRoot> <file> [<file> ...] [--all]
// Prints file length and every function over 50 lines or over complexity 10 (all functions with --all).
// Lines = lines of the function that are neither blank nor comment-only (ESLint max-lines-per-function with skipBlankLines + skipComments).
// Complexity = ESLint `complexity` (classic): 1 + if, ?:, loop, case, catch, &&, ||, ??, ?. and default parameter values are NOT counted.
import ts from 'typescript'; import fs from 'node:fs'; import path from 'node:path';
const [root, ...rest] = process.argv.slice(2); const all = rest.includes('--all'); const files = rest.filter((a) => a !== '--all');
for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8'); const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true);
  const lines = text.split('\n'); const commentOnly = new Set();
  const scan = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, text); const codeLines = new Set();
  for (let t = scan.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scan.scan()) {
    if (t === ts.SyntaxKind.WhitespaceTrivia || t === ts.SyntaxKind.NewLineTrivia) continue;
    const a = sf.getLineAndCharacterOfPosition(scan.getTokenStart()).line, b = sf.getLineAndCharacterOfPosition(scan.getTokenEnd()).line;
    for (let i = a; i <= b; i++) (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia ? commentOnly : codeLines).add(i);
  }
  const rows = [];
  const visit = (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) && n.body) {
      const a = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line, b = sf.getLineAndCharacterOfPosition(n.end).line;
      let count = 0; for (let i = a; i <= b; i++) if (codeLines.has(i)) count++;
      let cx = 1; const walk = (m) => { if (m !== n && (ts.isFunctionLike(m))) return;
        if (ts.isIfStatement(m) || ts.isConditionalExpression(m) || ts.isForStatement(m) || ts.isForInStatement(m) || ts.isForOfStatement(m) || ts.isWhileStatement(m) || ts.isDoStatement(m) || ts.isCatchClause(m) || ts.isCaseClause(m)) cx++;
        if (ts.isBinaryExpression(m) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(m.operatorToken.kind)) cx++;
        ts.forEachChild(m, walk); }; walk(n);
      const name = n.name?.getText(sf) ?? (ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(sf) : ts.isPropertyAssignment(n.parent) ? n.parent.name.getText(sf) : '(anonymous)');
      rows.push({ name, from: a + 1, to: b + 1, lines: count, cx });
    }
    ts.forEachChild(n, visit);
  }; visit(sf);
  const over = rows.filter((r) => all || r.lines > 50 || r.cx > 10);
  console.log(`${rel}: ${lines.length - (text.endsWith("\n") ? 1 : 0)} lines (${codeLines.size} code lines, the number max-lines checks), ${rows.length} functions, ${rows.filter((r) => r.lines > 50).length} over 50 lines (${rows.filter((r) => r.lines > 80).length} over 80), ${rows.filter((r) => r.cx > 10).length} over complexity 10`);
  for (const r of over) console.log(`   ${r.name} :${r.from}-${r.to}  lines=${r.lines}  complexity=${r.cx}`);
}
