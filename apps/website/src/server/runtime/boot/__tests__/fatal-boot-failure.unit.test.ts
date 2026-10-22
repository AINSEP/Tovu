import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { reportFatalBootFailure } from "../process-error-guards.js";

function fixture() {
  const events: Array<string | number> = [];
  const options = {
    log: (message: string): void => { events.push(message); },
    exit: (code: number): void => { events.push(code); },
  };
  return { events, options };
}

test("a lost running lock rejects boot into one actionable diagnostic followed by exit 1", async () => {
  const { events, options } = fixture();
  await Promise.reject(new Error("Running lock ownership was lost.")).catch((error: unknown) => {
    reportFatalBootFailure({ error }, options);
  });
  assert.equal(events.length, 2);
  assert.match(String(events[0]), /Tovu failed to start: Running lock ownership was lost/);
  assert.match(String(events[0]), /Restart Tovu/);
  assert.equal(events[1], 1);
});

test("other composition and readiness failures also exit, with a single diagnostic line", () => {
  const { events, options } = fixture();
  reportFatalBootFailure({ error: new Error("composition failed\nadditional detail") }, options);
  assert.equal(events.length, 2);
  assert.match(String(events[0]), /composition failed additional detail/);
  assert.doesNotMatch(String(events[0]), /[\r\n]/);
  assert.equal(events[1], 1);
});

test("the raw reason reaches the log so the stack survives in server.log", () => {
  const reasons: unknown[] = [];
  const error = new Error("composition failed");
  reportFatalBootFailure({ error }, { log: (_message, reason) => { reasons.push(reason); }, exit: () => {} });
  assert.deepEqual(reasons, [error]);
});

test("non-Error rejections retain their reason and fail boot", () => {
  const { events, options } = fixture();
  reportFatalBootFailure({ error: "boot cancelled" }, options);
  assert.match(String(events[0]), /boot cancelled/);
  assert.equal(events[1], 1);
});

test("a broken diagnostic sink cannot leave the startup listener alive", () => {
  const { events, options } = fixture();
  const failure = new Error("stderr closed");
  assert.throws(() => reportFatalBootFailure({ error: new Error("boot failed") }, {
    ...options, log: () => { throw failure; },
  }), failure);
  assert.deepEqual(events, [1]);
});

test("the real index entrypoint catches main's rejection with the fatal boot adapter", () => {
  const file = new URL("../../../../index.ts", import.meta.url);
  const ast = ts.createSourceFile(file.pathname, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const boot = ast.statements.find((statement) => ts.isExpressionStatement(statement)
    && ts.isVoidExpression(statement.expression)
    && ts.isCallExpression(statement.expression.expression)
    && statement.expression.expression.expression.getText(ast) === "main().catch");
  assert.ok(boot && ts.isExpressionStatement(boot) && ts.isVoidExpression(boot.expression));
  const call = boot.expression.expression;
  assert.ok(ts.isCallExpression(call));
  assert.equal(call.arguments.length, 1);
  const handler = call.arguments[0];
  assert.ok(ts.isArrowFunction(handler) && ts.isCallExpression(handler.body));
  assert.equal(handler.body.expression.getText(ast), "reportFatalBootFailure");
  assert.equal(handler.parameters.length, 1);
  const required = handler.body.arguments[0];
  assert.ok(required && ts.isObjectLiteralExpression(required));
  assert.equal(required.properties.length, 1);
  const reason = required.properties[0];
  assert.ok(ts.isShorthandPropertyAssignment(reason));
  assert.equal(reason.name.text, "error");
  assert.equal(handler.parameters[0].name.getText(ast), reason.name.text);
});

/** Production's only caller (`index.ts`) passes no ports: the defaults must be the real
 * `console.error` and `process.exit(1)`. Both are stubbed on the real globals so the test process
 * itself survives while the default wiring is still the code under test. */
test("default ports report on console.error and exit the real process with code 1", (t) => {
  const logged: unknown[][] = [];
  const exits: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  t.mock.method(process, "exit", ((code?: number) => { exits.push(code); }) as never);
  const error = new Error("default port failure");
  reportFatalBootFailure({ error });
  assert.deepEqual(exits, [1]);
  assert.equal(logged.length, 1);
  assert.match(String(logged[0]?.[0]), /^\[boot\] Tovu failed to start: default port failure\./);
  assert.equal(logged[0]?.[1], error);
});
