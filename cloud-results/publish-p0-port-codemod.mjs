#!/usr/bin/env node
// P0.5b codemod: converts port-interface members to `(required: { ... }, optional?: {})` and rewrites
// every implementer (class method, object-literal method or arrow property, fake) and every call found
// through the TypeScript language service.
//   mode `wrap`: positional parameters become the keys of one required object (the interface's own
//                parameter names; an implementer that names a parameter differently keeps its name via
//                `{ record: row }`)
//   mode `opt` : the member already takes one named object; only `optional?: {}` is appended to the
//                interface member (implementers with fewer parameters stay assignable)
// Usage: node cloud-results/publish-p0-port-codemod.mjs wrap:publish-content/peers.ts:PublishContentPeerRepoPort.insert ...
import fs from "node:fs";
import { Project, SyntaxKind, Node } from "ts-morph";

const specs = process.argv.slice(2).map((a) => { const [mode, rest] = [a.slice(0, a.indexOf(":")), a.slice(a.indexOf(":") + 1)]; const [f, member] = rest.split(":"); const [owner, name] = member.split("."); return { mode, file: `apps/website/src/features/${f}`, owner, name }; });
const project = new Project({ tsConfigFilePath: "tsconfig.tests.json" });
const manual = [];

function findMember(sf, owner, name) {
  const hits = sf.getDescendants().filter((n) => (Node.isMethodSignature(n) || Node.isPropertySignature(n)) && n.getName() === name
    && n.getAncestors().some((p) => (Node.isInterfaceDeclaration(p) || Node.isTypeAliasDeclaration(p)) && p.getName() === owner));
  if (hits.length !== 1) throw new Error(`${owner}.${name}: ${hits.length} members found`);
  return hits[0];
}
const paramsOf = (m) => (Node.isMethodSignature(m) ? m.getParameters() : m.getTypeNode().getParameters());
const fnLikeOf = (decl) => {
  if (Node.isMethodDeclaration(decl) || Node.isMethodSignature(decl)) return decl;
  if (Node.isPropertyAssignment(decl) || Node.isPropertyDeclaration(decl)) { const i = decl.getInitializer(); return i && (Node.isArrowFunction(i) || Node.isFunctionExpression(i)) ? i : null; }
  return null;
};

for (const { mode, file, owner, name } of specs) {
  const sf = project.getSourceFileOrThrow(file);
  const member = findMember(sf, owner, name);
  const params = paramsOf(member);
  const edits = new Map(); const push = (f, e) => edits.set(f, [...(edits.get(f) ?? []), e]);
  if (mode === "opt") {
    const last = params[params.length - 1];
    push(sf, { start: last.getEnd(), end: last.getEnd(), text: ", optional?: {}" });
  } else {
    const names = params.map((p) => p.getName());
    const types = params.map((p) => p.getTypeNode().getText());
    const newDecl = `required: { ${names.map((n, i) => `${n}: ${types[i]}`).join("; ")} }, optional?: {}`;
    push(sf, { start: params[0].getStart(), end: params[params.length - 1].getEnd(), text: newDecl });
    const nameNode = member.getNameNode();
    for (const ref of nameNode.findReferencesAsNodes()) {
      if (ref === nameNode) continue;
      const parent = ref.getParent();
      const decl = Node.isPropertyAssignment(parent) || Node.isMethodDeclaration(parent) || Node.isPropertyDeclaration(parent) ? parent : null;
      if (decl && decl.getNameNode() === ref) {
        const fn = fnLikeOf(decl);
        if (!fn) { manual.push(`${ref.getSourceFile().getFilePath()}:${ref.getStartLineNumber()} ${name} (not a function)`); continue; }
        const ps = fn.getParameters();
        if (ps.length === 0) continue;
        if (ps.length > names.length || ps.some((p) => !Node.isIdentifier(p.getNameNode()))) { manual.push(`${ref.getSourceFile().getFilePath()}:${ref.getStartLineNumber()} ${name} (implementer shape)`); continue; }
        const keys = ps.map((p, i) => (p.getName() === names[i] ? names[i] : `${names[i]}: ${p.getName()}`));
        const annotated = ps.every((p) => p.getTypeNode());
        const text = `{ ${keys.join(", ")} }${annotated ? `: { ${ps.map((p, i) => `${names[i]}: ${p.getTypeNode().getText()}`).join("; ")} }` : ""}`;
        push(ref.getSourceFile(), { start: ps[0].getStart(), end: ps[ps.length - 1].getEnd(), text });
        continue;
      }
      let callee = ref;
      if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ref) callee = parent;
      const call = callee.getParent();
      if (Node.isCallExpression(call) && call.getExpression() === callee) {
        const args = call.getArguments();
        if (args.length === 0) continue;
        if (args.some((a) => Node.isSpreadElement(a))) { manual.push(`${call.getSourceFile().getFilePath()}:${call.getStartLineNumber()} spread ${name}`); continue; }
        const pairs = args.slice(0, names.length).map((a, i) => (a.getText() === names[i] ? names[i] : `${names[i]}: ${a.getText()}`));
        push(call.getSourceFile(), { start: args[0].getStart(), end: args[args.length - 1].getEnd(), text: `{ ${pairs.join(", ")} }` });
      } else if (!Node.isImportSpecifier(parent)) manual.push(`${ref.getSourceFile().getFilePath()}:${ref.getStartLineNumber()} ${name}`);
    }
  }
  for (const [f, list] of edits) {
    let text = f.getFullText();
    for (const e of list.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    f.replaceWithText(text);
  }
  console.log(`converted ${owner}.${name} (${mode})`);
}
for (const f of project.getSourceFiles()) if (!f.isSaved()) f.saveSync();
if (manual.length) console.log("MANUAL:\n" + [...new Set(manual)].join("\n"));
