// Import-edge extractor (read-only), revision 2: runtime classification comes from REAL compiler emission, per project.
//
//   node edges.mjs <repoRoot> <out.json> --project <tsconfig> [--within <dir>] [--alias '#src/=apps/website/src/'] [--emit program|transpile]
//   node edges.mjs <repoRoot> <out.json> --packages <dir> [--extra-project <tsconfig>] [--scope @jini-ai/]
//        --packages      : every `tsc -p <config>` of each package's build script
//        --extra-project : a project measured although it is not a tsc build (sources a bundler builds with the same tsconfig)
//
// Which files: the files of the build tsconfig(s) (include/exclude/extends resolved by TypeScript itself), minus test files
// (`__tests__/`, `*.test.*`, `*.spec.*`, `*.typecheck.*`) unless --tests. Projects with `noEmit: true` are not build projects.
// Which statements are runtime: each file is emitted with ITS project's compilerOptions and an `after` transformer records
// which source import/export-from statements are still present in the JavaScript. So `verbatimModuleSyntax`,
// `isolatedModules`, `importsNotUsedAsValues` and `preserveValueImports` are honoured because the compiler applies them.
//   --emit transpile : single-file emit (what `isolatedModules` builds, tsx and esbuild do). Default for --packages.
//   --emit program   : full-program `tsc` emit with type information (what `tsc -p` does without isolatedModules). Default for --project.
// Kinds:
//   runtime : the statement is present in the emitted JavaScript. Sub-flags:
//               empty  = it survives only as `import {} from "x"` / `export {} from "x"` (verbatimModuleSyntax + all-inline-`type` names)
//               unused = it survives although no imported name is used as a value (verbatimModuleSyntax keeps unused value imports)
//   erased  : written without `type`, dropped by the compiler because no name is used as a value. Fragile: one value use makes it runtime.
//   type    : `import type`, `export type … from`, all-inline-`type` names when the compiler drops them, or an `import('x').T` type node.
// dynamic=true marks `import()` / `require()`.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const [root, out, ...rest] = process.argv.slice(2);
const opt = { projects: [], aliases: [], within: null, packages: null, emit: null, tests: false };
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--alias') { const [a, b] = rest[++i].split('='); opt.aliases.push([a, b]); }
  else if (rest[i] === '--project') opt.projects.push({ config: rest[++i], pkg: null });
  else if (rest[i] === '--extra-project') opt.projects.push({ config: rest[++i], pkg: null, extra: true });
  else if (rest[i] === '--within') opt.within = path.join(root, rest[++i]) + path.sep;
  else if (rest[i] === '--packages') opt.packages = rest[++i];
  else if (rest[i] === '--emit') opt.emit = rest[++i];
  else if (rest[i] === '--tests') opt.tests = true;
  else if (rest[i] === '--scope') opt.scope = rest[++i];
}
const emitMode = opt.emit ?? (opt.packages ? 'transpile' : 'program');
const TEST_FILE = /(^|\/)__tests__\/|\.(test|spec|typecheck)\.[cm]?tsx?$/;
const SOURCE_FILE = /\.(ts|tsx|mts|cts)$/;
// --packages: production code is what a build project compiles under `<packages>/<name>/src/` (every package sets rootDir: src).
const inProductionRoot = (rel) => !opt.packages || new RegExp(`^${opt.packages}/[^/]+/src/`).test(rel);

const notes = [];
if (opt.packages) {
  for (const name of fs.readdirSync(path.join(root, opt.packages)).sort()) {
    const dir = path.join(opt.packages, name);
    const manifest = path.join(root, dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const build = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts?.build ?? '';
    const configs = [...build.matchAll(/\btsc\s+(?:-p|--project)\s+(\S+)/g)].map((m) => m[1]);
    if (!configs.length) notes.push(`${name}: build script runs no tsc project; not measured`);
    for (const config of configs) opt.projects.push({ config: path.join(dir, config), pkg: name });
  }
}

/**
 * tsc compiles the listed files AND every source file they import (`files: [one.ts]` still emits what one.ts imports).
 * Follows relative specifiers on disk until nothing new is found.
 */
function withImportedFiles(listed) {
  const seen = new Set(listed.map((f) => path.resolve(f)));
  const queue = [...seen];
  while (queue.length) {
    const file = queue.pop();
    if (!SOURCE_FILE.test(file) || file.endsWith('.d.ts')) continue;
    for (const { fileName: spec } of ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true).importedFiles) {
      if (!spec.startsWith('.')) continue;
      const base = path.resolve(path.dirname(file), spec);
      const hit = [base.replace(/\.(js|mjs)$/, '.ts'), base.replace(/\.(js|jsx)$/, '.tsx'), base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find((c) => SOURCE_FILE.test(c) && fs.existsSync(c));
      if (hit && !seen.has(hit)) { seen.add(hit); queue.push(hit); }
    }
  }
  return [...seen];
}

/** One parsed build project: its options (as tsc resolves them through `extends`) and its production files. */
function loadProject({ config, pkg, extra }) {
  const configPath = path.join(root, config);
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
  const o = parsed.options;
  if (o.noEmit && !extra) { notes.push(`${config}: noEmit project, skipped`); return null; }
  const all = withImportedFiles(parsed.fileNames).filter((f) => SOURCE_FILE.test(f) && !f.endsWith('.d.ts') && (!opt.within || f.startsWith(opt.within)) && inProductionRoot(path.relative(root, f)));
  const files = all.filter((f) => opt.tests || !TEST_FILE.test(path.relative(root, f)));
  const settings = {
    verbatimModuleSyntax: !!o.verbatimModuleSyntax, isolatedModules: !!o.isolatedModules,
    importsNotUsedAsValues: o.importsNotUsedAsValues ?? null, preserveValueImports: !!o.preserveValueImports,
    module: ts.ModuleKind[o.module ?? ts.ModuleKind.CommonJS],
  };
  return { config, pkg, parsed, files, testFilesExcluded: all.length - files.length, settings };
}
const projects = opt.projects.map(loadProject).filter(Boolean);

// file -> project that owns its emission (first build project that lists it; a second listing with other settings is reported)
const owner = new Map();
for (const p of projects) for (const f of p.files) {
  const prev = owner.get(f);
  if (!prev) owner.set(f, p);
  else if (JSON.stringify(prev.settings) !== JSON.stringify(p.settings)) notes.push(`${path.relative(root, f)}: compiled by ${prev.config} and ${p.config} with different module settings`);
}
const files = [...owner.keys()].sort();
const fileSet = new Set(files);

/** Emit one project and return, per file, the start offsets of the import/export-from statements that survive. */
function retainedStatements(project) {
  const retained = new Map(); // file -> Map(sourceStatementStart -> { empty })
  const record = (sf) => {
    const map = new Map();
    map.synthesized = 0;
    for (const st of sf.statements) {
      const isImport = ts.isImportDeclaration(st);
      if (!isImport && !(ts.isExportDeclaration(st) && st.moduleSpecifier) && !ts.isImportEqualsDeclaration(st)) continue;
      const original = ts.getOriginalNode(st);
      // The compiler adds imports of its own (the JSX runtime). They have no source statement and are always external.
      if (!original || original.pos < 0) { map.synthesized += 1; continue; }
      const clause = isImport ? st.importClause : null;
      const emptyImport = !!clause && !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length === 0;
      const emptyExport = ts.isExportDeclaration(st) && !!st.exportClause && ts.isNamedExports(st.exportClause) && st.exportClause.elements.length === 0;
      map.set(original.getStart(ts.getSourceFileOfNode(original)), { empty: emptyImport || emptyExport });
    }
    retained.set(path.resolve(sf.fileName), map);
  };
  const after = [() => (sf) => { record(sf); return sf; }];
  if (emitMode === 'program') {
    const program = ts.createProgram({ rootNames: project.parsed.fileNames, options: { ...project.parsed.options, declaration: false, declarationMap: false, sourceMap: false, noEmitOnError: false, incremental: false, composite: false } });
    for (const f of project.files) program.emit(program.getSourceFile(f), () => {}, undefined, false, { after });
  } else {
    // Single-file emit. `module` is forced to ESNext: transpileModule cannot read package.json to pick the ESM/CJS format,
    // and import elision does not depend on the module format.
    const compilerOptions = { ...project.parsed.options, module: ts.ModuleKind.ESNext, moduleResolution: undefined, declaration: false, declarationMap: false, sourceMap: false, composite: false, incremental: false };
    for (const f of project.files) {
      const res = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions, fileName: f, transformers: { after } });
      // Self-check: the transformer's view must equal the import statements in the JavaScript text that was produced.
      const js = ts.createSourceFile('x.js', res.outputText, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS);
      const inText = js.statements.filter((s) => ts.isImportDeclaration(s) || (ts.isExportDeclaration(s) && s.moduleSpecifier)).length;
      const seen = retained.get(path.resolve(f));
      if (inText !== seen.size + seen.synthesized) throw new Error(`emit self-check failed for ${f}: ${inText} in text vs ${seen.size} + ${seen.synthesized} synthesized`);
    }
  }
  return retained;
}
const retainedByFile = new Map();
for (const p of projects) {
  const mine = retainedStatements(p);
  for (const f of p.files) if (owner.get(f) === p) retainedByFile.set(f, mine.get(path.resolve(f)) ?? new Map());
}

function resolve(fromFile, spec) {
  let base = null;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else for (const [a, b] of opt.aliases) if (spec.startsWith(a)) { base = path.join(root, b, spec.slice(a.length)); break; }
  if (!base) return null;
  const cands = [base, base.replace(/\.(js|mjs)$/, '.ts'), base.replace(/\.(js|jsx)$/, '.tsx'), base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of cands) if (fileSet.has(c)) return c;
  return { unresolved: base };
}

const edges = [];
const scoped = []; // imports of `--scope` packages (e.g. @jini-ai/), classified the same way; feeds the package graph
const unresolved = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const retained = retainedByFile.get(file);
  const imports = []; // {spec, line, start, names:[{name, local, typeOnly}], sideEffect, declTypeOnly, form}
  const localToImport = new Map();
  const valueUsed = new Set();
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const imp = { spec: st.moduleSpecifier.text, line: lineOf(st), start: st.getStart(sf), names: [], sideEffect: !st.importClause, declTypeOnly: !!st.importClause?.isTypeOnly, form: 'import' };
      const ic = st.importClause;
      if (ic) {
        if (ic.name) imp.names.push({ name: 'default', local: ic.name.text, typeOnly: imp.declTypeOnly });
        if (ic.namedBindings) {
          if (ts.isNamespaceImport(ic.namedBindings)) imp.names.push({ name: '*', local: ic.namedBindings.name.text, typeOnly: imp.declTypeOnly });
          else for (const el of ic.namedBindings.elements) imp.names.push({ name: (el.propertyName ?? el.name).text, local: el.name.text, typeOnly: imp.declTypeOnly || el.isTypeOnly });
        }
      }
      for (const n of imp.names) localToImport.set(n.local, n);
      imports.push(imp);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const imp = { spec: st.moduleSpecifier.text, line: lineOf(st), start: st.getStart(sf), names: [], sideEffect: false, declTypeOnly: !!st.isTypeOnly, form: 'export-from' };
      if (!st.exportClause) imp.names.push({ name: '*', local: '*', typeOnly: imp.declTypeOnly, reexport: true });
      else if (ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) imp.names.push({ name: (el.propertyName ?? el.name).text, local: el.name.text, typeOnly: imp.declTypeOnly || el.isTypeOnly, reexport: true });
      else imp.names.push({ name: '*', local: st.exportClause.name.text, typeOnly: imp.declTypeOnly, reexport: true });
      imports.push(imp);
    } else if (ts.isImportEqualsDeclaration(st) && ts.isExternalModuleReference(st.moduleReference) && ts.isStringLiteral(st.moduleReference.expression)) {
      imports.push({ spec: st.moduleReference.expression.text, line: lineOf(st), start: st.getStart(sf), names: [{ name: '=', local: st.name.text, typeOnly: !!st.isTypeOnly, reexport: true }], sideEffect: false, declTypeOnly: !!st.isTypeOnly, form: 'import=' });
    }
  }

  const skipAsName = (node) => {
    const p = node.parent;
    if (!p) return false;
    if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
    if (ts.isQualifiedName(p) && p.right === node) return true;
    if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isEnumMember(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === node) return true;
    if (ts.isBindingElement(p) && p.propertyName === node) return true;
    if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return true;
    if (ts.isJsxAttribute(p) && p.name === node) return true;
    return false;
  };
  // Syntactic value-use scan. It no longer decides `runtime`; it only tells `unused` (kept without a value use) apart.
  const visit = (node, inType) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isExportDeclaration(node)) {
      if (!node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text;
          if (!node.isTypeOnly && !el.isTypeOnly && localToImport.has(local)) valueUsed.add(local);
        }
      }
      return;
    }
    let nextInType = inType;
    if (ts.isHeritageClause(node)) {
      const cls = node.parent && (ts.isClassDeclaration(node.parent) || ts.isClassExpression(node.parent));
      if (cls && node.token === ts.SyntaxKind.ExtendsKeyword) {
        for (const t of node.types) { visit(t.expression, false); t.typeArguments?.forEach((a) => visit(a, true)); }
        return;
      }
      nextInType = true;
    } else if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isTypeParameterDeclaration(node)) nextInType = true;
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      imports.push({ spec: node.argument.literal.text, line: lineOf(node), names: [{ name: node.qualifier ? node.qualifier.getText(sf) : '*', local: '', typeOnly: true }], sideEffect: false, declTypeOnly: true, form: 'import-type-node' });
    }
    if (ts.isCallExpression(node)) {
      const a0 = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && a0 && ts.isStringLiteralLike(a0)) imports.push({ spec: a0.text, line: lineOf(node), names: [{ name: '(dynamic)', local: '', typeOnly: false, reexport: true }], sideEffect: false, declTypeOnly: false, form: 'dynamic-import', dynamic: true });
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && a0 && ts.isStringLiteralLike(a0)) imports.push({ spec: a0.text, line: lineOf(node), names: [{ name: '(require)', local: '', typeOnly: false, reexport: true }], sideEffect: false, declTypeOnly: false, form: 'require', dynamic: true });
    }
    if (ts.isIdentifier(node) && !nextInType && localToImport.has(node.text) && !skipAsName(node)) valueUsed.add(node.text);
    ts.forEachChild(node, (c) => visit(c, nextInType));
  };
  visit(sf, false);

  for (const imp of imports) {
    const names = imp.names.map((n) => ({ name: n.name, use: n.typeOnly ? 'type' : (n.reexport || valueUsed.has(n.local)) ? 'value' : 'erased' }));
    const syntacticRuntime = imp.sideEffect || names.some((n) => n.use === 'value');
    let kind; let empty = false; let unused = false;
    if (imp.dynamic) kind = 'runtime';
    else if (imp.form === 'import-type-node') kind = 'type';
    else if (retained.has(imp.start)) { kind = 'runtime'; empty = retained.get(imp.start).empty; unused = !syntacticRuntime && !empty; }
    else kind = imp.declTypeOnly || (names.length && names.every((n) => n.use === 'type')) ? 'type' : 'erased';
    // `predicted` = what revision 1's purely syntactic rule said; kept so the difference can be counted.
    const predicted = syntacticRuntime ? 'runtime' : names.length && names.every((n) => n.use === 'type') ? 'type' : 'erased';
    const row = { from: path.relative(root, file), line: imp.line, form: imp.form, kind, empty, unused, predicted, dynamic: !!imp.dynamic, sideEffect: imp.sideEffect, names };
    const r = resolve(file, imp.spec);
    if (!r) { if (opt.scope && imp.spec.startsWith(opt.scope)) scoped.push({ ...row, spec: imp.spec }); continue; } // external package / node builtin
    if (r.unresolved) { unresolved.push({ from: path.relative(root, file), spec: imp.spec, line: imp.line }); continue; }
    edges.push({ ...row, to: path.relative(root, r) });
  }
}
const projectReport = projects.map((p) => ({ config: p.config, pkg: p.pkg, files: p.files.length, testFilesExcluded: p.testFilesExcluded, ...p.settings }));
const srcRel = opt.within ? path.relative(root, opt.within) : opt.packages;
fs.writeFileSync(out, JSON.stringify({ root, srcRel, emitMode, projects: projectReport, notes, files: files.map((f) => path.relative(root, f)), edges, scoped, unresolved }));
const c = {}; for (const e of edges) { const k = e.kind + (e.empty ? '+empty' : '') + (e.unused ? '+unused' : '') + (e.dynamic ? '+dynamic' : ''); c[k] = (c[k] || 0) + 1; }
const drift = edges.filter((e) => e.kind !== e.predicted && !e.dynamic && e.form !== 'import-type-node');
console.log(JSON.stringify({ emitMode, projects: projects.length, files: files.length, edges: edges.length, byKind: c, differsFromSyntacticRule: drift.length, unresolved: unresolved.length, notes: notes.length }));
