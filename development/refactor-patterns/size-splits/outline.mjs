#!/usr/bin/env node
// Structural outline of a source file for the size splits: every top-level declaration with its
// line range, ESLint-style line count (blank + comment lines skipped, same rule as
// development/scripts/size-hotspots.mjs) and the same-file names it uses; then, for every function
// over --fn-limit, its body statements the same way. Why: split plans name declarations, not line
// numbers, so a plan stays valid while other edits shift lines; this re-derives the ranges.
// Each long-function statement also lists the local names it declares ("decl") and the earlier
// locals/params it reads ("uses"), so a plan can group statements into helpers by data flow.
// Usage: node outline.mjs [--fn-limit 100] [--file-limit 500] [--root <repo dir>] [--check] <file> [<file> ...]
// --check: print only what is still over a limit and exit 1 if anything is (the per-file done check).
// Read-only. Files resolve from cwd; TypeScript is loaded from <root>/node_modules (default: cwd).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const FN_LIMIT = Number(opt("--fn-limit", 100));
const FILE_LIMIT = Number(opt("--file-limit", 500));
const CHECK = argv.includes("--check") ? (argv.splice(argv.indexOf("--check"), 1), true) : false;
let over = 0;
const ROOT = path.resolve(opt("--root", process.cwd()));
const ts = createRequire(path.join(ROOT, "package.json"))("typescript");

const one = (s, n = 70) => s.replace(/\s+/g, " ").trim().slice(0, n);
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)
  || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

function fnLabel(f) {
  const p = f.parent;
  return f.name?.getText() ?? (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) ? p.name.getText() : p && ts.isCallExpression(p) ? `<arg of ${one(p.expression.getText(), 40)}>` : "<anonymous>");
}

function outline(file) {
  const text = fs.readFileSync(path.resolve(file), "utf8");
  const kind = /\.(tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(js|mjs|cjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const chars = text.split("");
  const seen = new Set();
  const blank = (pos) => {
    for (const r of ts.getLeadingCommentRanges(text, pos) ?? []) {
      if (seen.has(r.pos)) continue; seen.add(r.pos);
      for (let i = r.pos; i < r.end; i++) if (chars[i] !== "\n") chars[i] = " ";
    }
  };
  if (text.startsWith("#!")) for (let i = 0; i < text.indexOf("\n"); i++) chars[i] = " ";
  const walkAll = (n) => { blank(n.getFullStart()); for (const c of n.getChildren(sf)) walkAll(c); };
  walkAll(sf);
  const code = chars.join("").split("\n").map((l) => l.trim() !== "");
  const prefix = [0]; for (const c of code) prefix.push(prefix.at(-1) + (c ? 1 : 0));
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  const cnt = (n) => prefix[lineOf(n.end) + 1] - prefix[lineOf(n.getStart(sf))];
  const rng = (n) => `L${lineOf(n.getStart(sf)) + 1}-${lineOf(n.end) + 1} (${cnt(n)})`;
  const note = (n) => {
    const rs = ts.getLeadingCommentRanges(text, n.getFullStart()) ?? [];
    if (!rs.length) return "";
    const c = text.slice(rs[0].pos, rs[0].end).replace(/^\/\*\*?|\*\/$|^\/\/\s?/g, "").split("\n").map((l) => l.replace(/^\s*\*\s?|^\s*\/\/\s?/, "")).find((l) => l.trim());
    return c ? `  // ${one(c, 80)}` : "";
  };
  const declNames = (s) => {
    if (ts.isVariableStatement(s)) return s.declarationList.declarations.map((d) => d.name.getText());
    if (s.name) return [s.name.getText()];
    if (ts.isExportAssignment(s)) return ["default"];
    return [];
  };
  const tops = sf.statements.filter((s) => !ts.isImportDeclaration(s));
  const topNames = new Set(tops.flatMap(declNames));
  const refsOf = (n, own) => {
    const r = new Set();
    const v = (c) => { if (ts.isIdentifier(c) && topNames.has(c.text) && !own.includes(c.text)) r.add(c.text); ts.forEachChild(c, v); };
    v(n);
    return [...r];
  };
  const kindOf = (s) => ts.isFunctionDeclaration(s) ? "function" : ts.isClassDeclaration(s) ? "class" : ts.isInterfaceDeclaration(s) ? "interface"
    : ts.isTypeAliasDeclaration(s) ? "type" : ts.isEnumDeclaration(s) ? "enum" : ts.isVariableStatement(s) ? (s.declarationList.declarations.some((d) => d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) ? "const-fn" : "const")
    : ts.isExportDeclaration(s) ? "re-export" : ts.isExportAssignment(s) ? "export-default" : ts.SyntaxKind[s.kind];
  const exported = (s) => (ts.getCombinedModifierFlags?.(s) ?? 0) & ts.ModifierFlags.Export || ts.isExportAssignment(s) || (ts.isVariableStatement(s) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
  const imports = sf.statements.filter(ts.isImportDeclaration);
  const out = [`FILE ${file}  ${prefix.at(-1)} counted / ${code.length} raw lines; ${imports.length} imports`];
  for (const s of tops) {
    const names = declNames(s);
    const refs = refsOf(s, names);
    out.push(`  ${rng(s)} ${kindOf(s)} ${names.join(",") || one(s.getText(sf), 50)}${exported(s) ? " [export]" : ""}${refs.length ? ` uses: ${refs.slice(0, 12).join(",")}${refs.length > 12 ? ",…" : ""}` : ""}${note(s)}`);
    if (ts.isClassDeclaration(s)) for (const m of s.members) if (cnt(m) >= 15) out.push(`      ${rng(m)} member ${m.name ? m.name.getText() : "?"}${note(m)}`);
  }
  if (CHECK) {
    const msgs = [];
    if (prefix.at(-1) > FILE_LIMIT) msgs.push(`OVER file ${file} ${prefix.at(-1)} > ${FILE_LIMIT}`);
    const vv = (n) => { if (isFn(n) && n.body && cnt(n) > FN_LIMIT) msgs.push(`OVER function ${file} ${fnLabel(n)} L${lineOf(n.getStart(sf)) + 1} ${cnt(n)} > ${FN_LIMIT}`); ts.forEachChild(n, vv); };
    vv(sf);
    over += msgs.length;
    return msgs.length ? msgs.join("\n") : `OK ${file} ${prefix.at(-1)} lines`;
  }
  const bindNames = (b, acc = []) => { if (!b) return acc; if (ts.isIdentifier(b)) acc.push(b.text); else if (ts.isObjectBindingPattern(b) || ts.isArrayBindingPattern(b)) for (const e of b.elements) if (!ts.isOmittedExpression(e)) bindNames(e.name, acc); return acc; };
  const declsOf = (st) => ts.isVariableStatement(st) ? st.declarationList.declarations.flatMap((d) => bindNames(d.name))
    : (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name ? [st.name.text] : [];
  // long functions: body statements
  const longFns = [];
  const v = (n) => { if (isFn(n) && n.body && cnt(n) > FN_LIMIT) longFns.push(n); ts.forEachChild(n, v); };
  v(sf);
  for (const f of longFns) {
    const p = f.parent;
    const name = fnLabel(f);
    out.push(`  FN ${name} ${rng(f)} params: ${one(f.parameters.map((x) => x.getText()).join(", "), 120)}`);
    const body = ts.isBlock(f.body) ? f.body.statements : [f.body];
    const known = new Set(f.parameters.flatMap((x) => bindNames(x.name)));
    for (const st of body) {
      let label = one(st.getText(sf).split("\n")[0], 90);
      const decl = declsOf(st);
      const used = new Set();
      const uv = (c) => { if (ts.isIdentifier(c) && known.has(c.text) && !decl.includes(c.text)) used.add(c.text); ts.forEachChild(c, uv); };
      uv(st);
      const flow = `${decl.length ? ` decl: ${decl.slice(0, 10).join(",")}${decl.length > 10 ? ",…" : ""}` : ""}${used.size ? ` uses: ${[...used].slice(0, 14).join(",")}${used.size > 14 ? ",…" : ""}` : ""}`;
      for (const d of decl) known.add(d);
      // a returned object literal / JSX: list its first-level parts so a split can name them
      out.push(`      ${rng(st)} ${label}${flow ? `  |${flow}` : ""}${note(st)}`);
      const ret = ts.isReturnStatement(st) ? st.expression : !ts.isBlock(f.body) && st === f.body ? st : undefined;
      let e = ret; while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e))) e = e.expression;
      if (e && ts.isObjectLiteralExpression(e) && cnt(e) > 30) for (const pr of e.properties) if (cnt(pr) >= 8) out.push(`          ${rng(pr)} prop ${pr.name ? pr.name.getText() : one(pr.getText(), 40)}`);
      if (e && (ts.isJsxElement(e) || ts.isJsxFragment(e)) && cnt(e) > 30) for (const ch of e.children) if (cnt(ch) >= 8) out.push(`          ${rng(ch)} jsx ${one(ch.getText().split("\n")[0], 60)}`);
    }
  }
  return out.join("\n");
}
for (const f of argv) { try { console.log(outline(f)); } catch (e) { over++; console.log(`FILE ${f} ERROR ${e.message}`); } }
if (CHECK && over) process.exitCode = 1;
