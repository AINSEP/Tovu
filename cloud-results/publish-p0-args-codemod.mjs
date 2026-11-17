#!/usr/bin/env node
// P0.5a codemod: converts the non-conforming exported functions named on the command line to the
// owner's `(required, optional = {})` shape and rewrites every call site found through the
// TypeScript language service (production code and tests). Behaviour-free: the parameter names
// become the keys of the required object, destructured in the signature, so no body changes.
//   - one required bag (`input: FooInput`)  -> append `_optional = {}`; callers are unchanged
//   - positional value(s) / two required bags -> `({ a, b }: { a: TA; b: TB }, _optional = {})`
// Usage: node cloud-results/publish-p0-args-codemod.mjs publish-content/peers.ts:createPublishContentPeer ...
// Prints every reference it could not rewrite (passed as a value, typeof, spread arguments).
import fs from "node:fs";
import { Project, SyntaxKind, Node } from "ts-morph";

const BAG = /(Input|Inputs|Deps|Args|Params|Options|Config|Context|Ctx|Request|Spec|Ports?|Required|Bag|Env)$/;
const targets = process.argv.slice(2).map((a) => { const [f, n] = a.split(":"); return { file: `apps/website/src/features/${f}`, name: n }; });
const project = new Project({ tsConfigFilePath: "tsconfig.tests.json", skipFileDependencyResolution: false });
const isEmptyObj = (e) => e && Node.isObjectLiteralExpression(e) && e.getProperties().length === 0;
const isRequiredObject = (p) => {
  if (Node.isObjectBindingPattern(p.getNameNode())) return true;
  const t = p.getTypeNode();
  if (!t) return false;
  if (Node.isTypeLiteral(t)) return true;
  return Node.isTypeReference(t) && BAG.test(t.getTypeName().getText());
};
const optionalParamOf = (p) => /^_?optional$/.test(p.getName()) && isEmptyObj(p.getInitializer());

function findFn(sf, name) {
  const decl = sf.getFunction(name);
  if (decl) return { fn: decl, nameNode: decl.getNameNode() };
  const v = sf.getVariableDeclaration(name);
  const init = v?.getInitializer();
  if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) return { fn: init, nameNode: v.getNameNode() };
  throw new Error(`no exported function ${name} in ${sf.getFilePath()}`);
}

const indentLines = (text, pad) => text.split("\n").map((l, i) => (i === 0 ? l : l ? pad + l : l)).join("\n");
const columnOf = (node) => node.getStart() - node.getSourceFile().getFullText().lastIndexOf("\n", node.getStart() - 1) - 1;

function wrapText(params, multiline) {
  const keys = []; const types = [];
  for (const p of params) {
    const nameNode = p.getNameNode();
    if (!Node.isIdentifier(nameNode)) throw new Error(`destructured positional parameter ${p.getText()}`);
    const name = p.getName(); const type = p.getTypeNode()?.getText();
    if (!type) throw new Error(`untyped parameter ${name}`);
    const init = p.getInitializer();
    const optional = p.hasQuestionToken() || init;
    keys.push(init ? `${name} = ${init.getText()}` : name);
    types.push(`${name}${optional ? "?" : ""}: ${indentLines(type, "  ")}`);
  }
  if (!multiline) return `{ ${keys.join(", ")} }: { ${types.join("; ")} }`;
  const pad = " ".repeat(columnOf(params[0]));
  return `{ ${keys.join(", ")} }: {\n${types.map((t) => `${pad}  ${t};`).join("\n")}\n${pad}}`;
}

function callArgsText(args, names) {
  const used = args.slice(0, names.length);
  const pairs = used.map((a, i) => (a.getText() === names[i] ? names[i] : `${names[i]}: ${a.getText()}`));
  const rest = args.slice(names.length).map((a) => a.getText());
  const first = args[0]; const last = args[args.length - 1];
  const multiline = first.getSourceFile().getFullText().slice(first.getStart(), last.getEnd()).includes("\n");
  if (!multiline) return `{ ${pairs.join(", ")} }${rest.length ? `, ${rest.join(", ")}` : ""}`;
  const pad = " ".repeat(columnOf(first));
  const body = pairs.map((p) => `${pad}  ${indentLines(p, "  ")}`).join(",\n");
  return `{\n${body}\n${pad}}${rest.length ? `, ${rest.join(", ")}` : ""}`;
}

const manual = [];
for (const { file, name } of targets) {
  const sf = project.getSourceFileOrThrow(file);
  const { fn, nameNode } = findFn(sf, name);
  const params = fn.getParameters();
  const optParam = params.length && optionalParamOf(params[params.length - 1]) ? params[params.length - 1] : null;
  const required = optParam ? params.slice(0, -1) : params;
  const bagOnly = required.length === 1 && isRequiredObject(required[0]);
  const calls = [];
  for (const ref of nameNode.findReferencesAsNodes()) {
    if (ref === nameNode) continue;
    const parent = ref.getParent();
    let callee = ref;
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ref) callee = parent;
    const call = callee.getParent();
    if (Node.isCallExpression(call) && call.getExpression() === callee) calls.push(call);
    else if (!Node.isImportSpecifier(parent) && !Node.isExportSpecifier(parent) && !Node.isImportClause(parent)) manual.push(`${ref.getSourceFile().getFilePath().split("features/")[1] ?? ref.getSourceFile().getFilePath()}:${ref.getStartLineNumber()} ${name}`);
  }
  const edits = new Map(); // file -> [{start,end,text}]
  const push = (f, e) => edits.set(f, [...(edits.get(f) ?? []), e]);
  if (bagOnly) {
    if (!optParam) { const last = required[0]; push(sf, { start: last.getEnd(), end: last.getEnd(), text: ", _optional = {}" }); }
  } else {
    const names = required.map((p) => p.getName());
    const multiline = params[0].getText().includes("\n") || params.length > 1 && params[0].getStartLineNumber() !== params[params.length - 1].getStartLineNumber();
    const sep = multiline ? `,\n${" ".repeat(columnOf(params[0]))}` : ", ";
    const newParams = `${wrapText(required, multiline)}${sep}${optParam ? optParam.getText() : "_optional = {}"}`;
    push(sf, { start: params[0].getStart(), end: params[params.length - 1].getEnd(), text: newParams });
    for (const call of calls) {
      const args = call.getArguments();
      if (args.length === 0) continue;
      if (args.some((a) => Node.isSpreadElement(a))) { manual.push(`${call.getSourceFile().getFilePath()}:${call.getStartLineNumber()} spread ${name}`); continue; }
      push(call.getSourceFile(), { start: args[0].getStart(), end: args[args.length - 1].getEnd(), text: callArgsText(args, names) });
    }
  }
  for (const [f, list] of edits) {
    let text = f.getFullText();
    for (const e of list.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    f.replaceWithText(text);
  }
  console.log(`converted ${file.split("features/")[1]}:${name} (${bagOnly ? "bag" : "wrap"}; ${calls.length} calls)`);
}
for (const f of project.getSourceFiles()) if (!f.isSaved()) f.saveSync();
if (manual.length) console.log("MANUAL references:\n" + [...new Set(manual)].join("\n"));
