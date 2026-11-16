// Read-only census of catch handlers that never read the caught value. Usage: node catch-census.cjs <repoRoot> <dir...>
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const root = process.argv[2]; const dirs = process.argv.slice(3);
const SKIP = /(^|\/)(node_modules|dist|build|coverage|__tests__|__mocks__|__fixtures__|fixtures|vendor|release|sites)(\/|$)|\.(test|spec|typecheck|stories)\.|\.d\.ts$|\.min\.js$/;
const files = []; (function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p = path.join(d,e.name); const rel = path.relative(root,p); if (SKIP.test(rel)) continue; if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(e.name) && fs.statSync(p).size < 400000) files.push(p); } });
for (const d of dirs) if (fs.existsSync(path.join(root,d))) (function(){ const w=(dd)=>{ for (const e of fs.readdirSync(dd,{withFileTypes:true})) { const p=path.join(dd,e.name); const rel=path.relative(root,p); if (SKIP.test(rel)) continue; if (e.isDirectory()) w(p); else if (/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(e.name) && fs.statSync(p).size<400000) files.push(p);} }; w(path.join(root,d)); })();
const c = { files: files.length, catchClauses: 0, promiseCatch: 0, dropped: 0, d_emptyNoComment: 0, d_emptyComment: 0, d_rethrowNew: 0, d_returns: 0, d_logsFixed: 0, d_other: 0, pc_dropped: 0, pc_empty: 0, pc_constant: 0, pc_other: 0 };
const mentions = (node, name) => { let hit = false; (function v(n){ if (hit) return; if (ts.isIdentifier(n) && n.text === name) { hit = true; return; } ts.forEachChild(n, v); })(node); return hit; };
const has = (node, pred) => { let hit=false; (function v(n){ if (hit) return; if (pred(n)) { hit=true; return; } if (ts.isFunctionLike(n)) return; ts.forEachChild(n,v); })(node); return hit; };
for (const f of files) { const text = fs.readFileSync(f,'utf8'); const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, /\.tsx|\.jsx/.test(f) ? ts.ScriptKind.TSX : undefined);
  (function visit(n){
    if (ts.isCatchClause(n)) { c.catchClauses++; const b = n.variableDeclaration && ts.isIdentifier(n.variableDeclaration.name) ? n.variableDeclaration.name.text : null;
      const reads = b ? mentions(n.block, b) : (n.variableDeclaration ? true : false);
      if (!reads) { c.dropped++; const body = n.block.getText(sf);
        if (n.block.statements.length === 0) { /\/\/|\/\*/.test(body) ? c.d_emptyComment++ : c.d_emptyNoComment++; }
        else if (has(n.block, x => ts.isThrowStatement(x))) c.d_rethrowNew++;
        else if (has(n.block, x => ts.isCallExpression(x) && /(^|\.)(log|info|warn|error|debug)$/.test(x.expression.getText(sf)))) c.d_logsFixed++;
        else if (has(n.block, x => ts.isReturnStatement(x))) c.d_returns++;
        else c.d_other++; } }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'catch' && n.arguments.length >= 1) { const fn = n.arguments[0];
      if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) { c.promiseCatch++; const p = fn.parameters[0]; const nm = p && ts.isIdentifier(p.name) ? p.name.text : null;
        const reads = nm ? mentions(fn.body, nm) : (p ? true : false);
        if (!reads) { c.pc_dropped++; const b = fn.body; if (ts.isBlock(b) && b.statements.length === 0) c.pc_empty++; else if (!ts.isBlock(b) && (b.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(b) && b.text === 'undefined') || ts.isVoidExpression(b) || ts.isLiteralExpression(b) || b.kind===ts.SyntaxKind.FalseKeyword || b.kind===ts.SyntaxKind.TrueKeyword || ts.isObjectLiteralExpression(b) || ts.isArrayLiteralExpression(b))) c.pc_constant++; else c.pc_other++; } } }
    ts.forEachChild(n, visit); })(sf); }
console.log(JSON.stringify(c));
