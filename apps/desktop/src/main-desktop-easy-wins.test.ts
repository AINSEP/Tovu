import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Electron cannot import under node. Execute the actual registered callback with native effects
// injected, so an unconditional quit cannot pass. Kept as a cut-out on purpose: the
// window-all-closed handler is a one-line app-lifecycle rule that lives only in the Electron entry
// (src/main/index.ts), with no module to test it through. Every other case this file held (site-window
// close and reopen, the admin window's minimum size, the updater's preference handling, Dock
// restore) is now tested through the real modules in src/main/windows/, src/main/updates/ and
// src/main/boot/.
const source = fs.readFileSync(new URL('./main/index.ts', import.meta.url), 'utf8');
const sf = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function handler(event: string): string {
  let result: string | undefined;
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && n.expression.name.text === 'on' && n.arguments[0]?.getText(sf) === JSON.stringify(event)) {
      result = n.arguments[1]?.getText(sf);
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert.ok(result, event);
  return ts.transpile(`return (${result});`, { target: ts.ScriptTarget.ES2022 });
}

test('closing all windows quits Windows/Linux, while macOS keeps the app alive', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    let quits = 0;
    new Function('process', 'app', handler('window-all-closed'))({ platform }, { quit: () => quits++ })();
    assert.equal(quits, platform === 'darwin' ? 0 : 1);
  }
});
