import assert from 'node:assert/strict';
import ts from 'typescript';
import React from 'react';

/** Execute a private function's actual source without importing the whole Electron UI. */
export function sourceFunction(source: string, name: string, bindings: Record<string, unknown> = {}): any {
  const file = ts.createSourceFile('renderer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `missing function ${name}`);
  const code = ts.transpileModule(declaration.getText(file).replace(/^export\s+/, ''), {
    fileName: 'renderer.tsx',
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const globals = { React, ...bindings };
  return new Function(...Object.keys(globals), `${code}\nreturn ${name};`)(...Object.values(globals));
}

/** Walk the elements actually returned by a component, including private child components. */
export function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  if (typeof element.type === 'function') return elements((element.type as any)(element.props));
  return [element, ...elements(element.props.children)];
}

/** Small synchronous hook runner: state, callback closures, effect dependencies and cleanup. */
export function hookHarness() {
  const states: any[] = [];
  const setters: any[] = [];
  const effects: { deps: readonly unknown[]; cleanup?: () => void }[] = [];
  let cursor = 0;
  let dirty = false;
  let queued: (() => void)[] = [];
  const bindings = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === 'function' ? initial() : initial;
        setters[index] = (next: any) => {
          const value = typeof next === 'function' ? next(states[index]) : next;
          if (!Object.is(value, states[index])) { states[index] = value; dirty = true; }
        };
      }
      return [states[index], setters[index]];
    },
    useCallback(callback: any) { cursor++; return callback; },
    useEffect(effect: () => (() => void) | void, deps: readonly unknown[]) {
      const index = cursor++;
      const previous = effects[index];
      if (previous && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      queued.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() || undefined };
      });
    },
  };
  return {
    bindings,
    render<T>(run: () => T): T {
      let result: T;
      for (let count = 0; count < 20; count++) {
        cursor = 0; dirty = false; queued = [];
        result = run();
        for (const effect of queued) effect();
        if (!dirty) return result;
      }
      throw new Error('hook did not settle');
    },
    cleanup() { for (const effect of effects) effect?.cleanup?.(); },
  };
}
