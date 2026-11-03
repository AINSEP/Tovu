import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Reading the entry must never execute its listeners, registry publication or process hooks.
export const daemonEntrySource = ts.createSourceFile(
  'agent-daemon-server.ts',
  readFileSync(new URL('../../agent-daemon-server.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);
