import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

type BareListener = { file: string; line: number; call: string };
const ROOT = path.resolve(import.meta.dirname, "../../../../..");
const BASELINE = path.join(import.meta.dirname, "fixtures/bare-test-listeners.baseline.json");

/** Walk repository sources and test helpers, excluding installed/generated trees and symlinks. */
function testFiles({ directory }: { directory: string }, _options = {}): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".git", "dist", "build", "coverage", ".next", ".cache"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles({ directory: file });
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(file)) return [];
    return /\/(?:__tests__|tests?|e2e)\/|(?:^|[./-])(?:test|spec)[.-]/.test(file) ? [file] : [];
  });
}

/** Parse calls rather than comments/strings; never open a socket. O(n) in source length. */
function bareListeners({ file, source }: { file: string; source: string }, _options = {}): BareListener[] {
  if (!source.includes("listen")) return [];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const calls: BareListener[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "listen") {
      const [port, host] = node.arguments;
      if (port && ts.isNumericLiteral(port) && Number(port.text) === 0
        && (!host || !ts.isStringLiteralLike(host))) {
        calls.push({ file, line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1, call: node.getText(parsed) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return calls;
}

/** Exact call text + file + multiplicity ratchet: line shifts/removals are allowed, additions fail. */
function newListeners({ actual, baseline }: { actual: BareListener[]; baseline: BareListener[] }, _options = {}): BareListener[] {
  const remaining = new Map<string, number>();
  const key = (call: BareListener) => JSON.stringify([call.file, call.call]);
  for (const call of baseline) remaining.set(key(call), (remaining.get(key(call)) ?? 0) + 1);
  return actual.filter((call) => {
    const count = remaining.get(key(call)) ?? 0;
    if (count === 0) return true;
    remaining.set(key(call), count - 1);
    return false;
  });
}

test("bare-listener scanner catches callback/multiline calls, ignoring comments, strings and explicit hosts", () => {
  const source = `
    // server.listen(0);
    const example = "server.listen(0)";
    server.listen(0, "127.0.0.1");
    server.listen(8080);
    server.listen(0);
    app.listen(\n 0, () => {});
    probe.listen(0, resolve);
  `;
  assert.deepEqual(bareListeners({ file: "fixture.test.ts", source }).map(({ call }) => call), [
    "server.listen(0)", "app.listen(\n 0, () => {})", "probe.listen(0, resolve)",
  ]);
});

test("baseline cannot conceal a new file, changed call, or extra identical call", () => {
  const original = { file: "existing.test.ts", line: 1, call: "server.listen(0)" };
  const moved = { ...original, line: 10 };
  const otherFile = { ...original, file: "new.test.ts" };
  const otherCall = { ...original, call: "app.listen(0)" };
  assert.deepEqual(newListeners({ baseline: [original], actual: [moved, otherFile, otherCall, moved] }), [otherFile, otherCall, moved]);
  assert.deepEqual(newListeners({ baseline: [original], actual: [] }), []);
});

test("no new bare listen(0) calls in repository tests or their helpers", () => {
  // Existing debt exceeds the authorized 40-file migration cap. Do not regenerate this baseline
  // to admit additions: bind to 127.0.0.1 (or use startTestServer) and remove resolved entries.
  const baseline: BareListener[] = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const files = ["apps", "content", "development", "packages"].flatMap((directory) => testFiles({ directory: path.join(ROOT, directory) }));
  assert.ok(files.length > 0, "must inspect real tests");
  const actual = files.flatMap((file) => bareListeners({ file: path.relative(ROOT, file), source: fs.readFileSync(file, "utf8") }));
  const additions = newListeners({ actual, baseline });
  assert.deepEqual(additions, [], `Bind test listeners to 127.0.0.1:\n${additions.map(({ file, line }) => `${file}:${line}`).join("\n")}`);
});
