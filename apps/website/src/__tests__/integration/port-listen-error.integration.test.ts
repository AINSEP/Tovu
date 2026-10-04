import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the actual boot listener without binding a socket in the test runner.
test("boot preserves non-EADDRINUSE listen errors and never reports a successful exit", () => {
  const source = readFileSync(new URL("../../index.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  let listener: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "server.on" &&
        ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "error") listener = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(listener, "the real boot error listener must be found");
  const compiled = ts.transpileModule(`const handler = ${listener.getText(parsed)}; handler;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const exits: number[] = [];
  const messages: unknown[][] = [];
  const handler = runInNewContext(compiled, {
    port: 4321,
    process: { exit: (code: number) => { exits.push(code); } },
    console: { error: (...args: unknown[]) => { messages.push(args); } },
  }) as (error: Error) => void;
  for (const code of ["EACCES", "EPERM"]) {
    const error = Object.assign(new Error(`listen ${code} denied`), { code });
    assert.throws(() => handler(error), (thrown) => thrown === error);
  }
  assert.deepEqual(exits, [], "unexpected listen errors must not be swallowed into an exit");
  assert.deepEqual(messages, [], "non-port-collision errors must retain their original diagnosis");
});
