import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyRowToText, loadTs, StaleRowError, GrammarError, run } from '../apply-repoint.mjs';

const ts = loadTs();
const row = (o) => ({ repo: 'jini', file: 'a.ts', old_spec: 'old', names: '', new_spec: 'new', rename: '', phase: 'wave', ...o });
const go = (text, o, file = 'a.ts') => applyRowToText(ts, text, file, row(o));

test('moves a name into a new import in place, keeping the rest', () => {
  const r = go("import { a, b } from 'old';\nuse(a, b);\n", { names: 'a' });
  assert.equal(r.text, "import { b } from 'old';\nimport { a } from 'new';\nuse(a, b);\n");
});

test('removes an import left empty and replaces it with the new one in place', () => {
  const r = go("// keep me\nimport { a } from 'old';\nx;\n", { names: 'a' });
  assert.equal(r.text, "// keep me\nimport { a } from 'new';\nx;\n");
});

test('merges into an existing import of new_spec (multi-line, trailing comma)', () => {
  const r = go("import { a } from 'old';\nimport {\n  z,\n} from 'new';\n", { names: 'a' });
  assert.equal(r.text, "import {\n  z,\n  a,\n} from 'new';\n");
});

test('type-only: import type stays import type; inline type stays inline', () => {
  assert.equal(go("import type { T } from 'old';\n", { names: 'type T' }).text, "import type { T } from 'new';\n");
  assert.equal(go("import { a, type T } from 'old';\n", { names: 'type T' }).text, "import { a } from 'old';\nimport type { T } from 'new';\n");
  assert.equal(go("import type { T } from 'old';\nimport { v } from 'new';\n", { names: 'type T' }).text, "import { v, type T } from 'new';\n");
  assert.equal(go("import type { T } from 'old';\nimport type { U } from 'new';\n", { names: 'type T' }).text, "import type { U, T } from 'new';\n");
});

test('alias is kept', () => {
  assert.equal(go("import { a as b } from 'old';\n", { names: 'a as b' }).text, "import { a as b } from 'new';\n");
});

test('rename renames the import and every use, not members or other modules', () => {
  const src = "import { Old } from 'old';\nconst x: Old = Old.make();\nconst o = { Old };\nfoo.Old;\nconst y = <Old />;\n";
  const r = go(src, { names: 'Old', rename: 'Old->New' }, 'a.tsx');
  assert.equal(r.text, "import { New } from 'new';\nconst x: New = New.make();\nconst o = { Old: New };\nfoo.Old;\nconst y = <New />;\n");
});

test('rename with alias hint keeps the local name; existing alias is untouched', () => {
  assert.equal(go("import { Sel } from 'old';\nSel;\n", { names: 'Sel', rename: 'Sel->WSel (import { WSel as Sel })' }).text, "import { WSel as Sel } from 'new';\nSel;\n");
  assert.equal(go("import { Sel as S } from 'old';\nS;\n", { names: 'Sel as S', rename: 'Sel->WSel' }).text, "import { WSel as S } from 'new';\nS;\n");
});

test('rename refuses when the file declares its own binding of that name', () => {
  assert.throws(() => go("import { Old } from 'old';\nfunction f(Old) { return Old; }\n", { names: 'Old', rename: 'Old->New' }), StaleRowError);
});

test('default import survives when the last named import moves', () => {
  assert.equal(go("import D, { a } from 'old';\n", { names: 'a' }).text, "import D from 'old';\nimport { a } from 'new';\n");
});

test('export-from: names move with the line kept; DROP deletes names then the line', () => {
  assert.equal(go("export { a, b } from 'old';\n", { names: 'a', old_spec: 'export-from old' }).text, "export { b } from 'old';\nexport { a } from 'new';\n");
  assert.equal(go("export { a, b } from 'old';\n", { names: 'b', old_spec: 'export-from old', new_spec: 'DROP' }).text, "export { a } from 'old';\n");
  assert.equal(go("x;\nexport { a } from 'old';\ny;\n", { names: 'a', old_spec: 'export-from old', new_spec: 'DROP' }).text, 'x;\ny;\n');
  assert.equal(go("x;\nexport * from 'old';\ny;\n", { names: '*', old_spec: 'export * from old', new_spec: 'DROP' }).text, 'x;\ny;\n');
  assert.equal(go("export * from 'old';\n", { names: '*', old_spec: 'export * from old', new_spec: 'KEEP' }).status, 'skip');
});

test('vi.mock and dynamic import strings', () => {
  assert.equal(go("vi.mock('old', () => ({}));\n", { old_spec: "vi.mock('old')", names: 'mock' }).text, "vi.mock('new', () => ({}));\n");
  assert.equal(go("type T = import('old').T;\nconst m = await import('old');\n", { old_spec: "import('old')", names: 'type T' }).text, "type T = import('new').T;\nconst m = await import('new');\n");
  assert.equal(go("type A = import('old').A;\ntype B = import('old').B;\n", { old_spec: "import('old')", names: 'type A' }).text, "type A = import('new').A;\ntype B = import('old').B;\n");
});

test('idempotent: second application changes nothing', () => {
  const cases = [
    ["import { a, b } from 'old';\n", { names: 'a' }],
    ["import { Old } from 'old';\nOld;\n", { names: 'Old', rename: 'Old->New' }],
    ["export { a } from 'old';\n", { names: 'a', old_spec: 'export-from old', new_spec: 'DROP' }],
    ["vi.mock('old');\n", { old_spec: "vi.mock('old')", names: 'mock' }],
  ];
  for (const [src, o] of cases) {
    const once = go(src, o);
    const twice = go(once.text, o);
    assert.equal(twice.text, once.text);
    assert.equal(twice.status, 'already');
  }
});

test('stale row: names in neither spec throw', () => {
  assert.throws(() => go("import { b } from 'old';\n", { names: 'a' }), StaleRowError);
  assert.throws(() => go("vi.mock('other');\n", { old_spec: "vi.mock('old')", names: 'mock' }), StaleRowError);
});

test('KEEP / MANUAL rows are skipped', () => {
  assert.equal(go("import { a } from 'old';\n", { names: 'a', new_spec: 'KEEP' }).status, 'skip');
  assert.equal(go("import { a } from 'old';\n", { names: 'a', new_spec: 'MANUAL' }).status, 'skip');
});

test('CLI run: stale row refuses, writes nothing, exit code 1; clean run writes; rerun is a no-op; dry-run writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoint-'));
  fs.writeFileSync(path.join(dir, 'a.ts'), "import { a } from 'old';\n");
  fs.writeFileSync(path.join(dir, 'b.ts'), "import { q } from 'old';\n");
  const tsv = (rows) => {
    const f = path.join(dir, `t${Math.random()}.tsv`);
    fs.writeFileSync(f, ['repo\tfile\told_spec\tnames\tnew_spec\trename\tphase\tnote', ...rows].join('\n') + '\n');
    return f;
  };
  const quiet = () => {};
  const bad = tsv(['jini\ta.ts\told\ta\tnew\t\twave\t', 'jini\tb.ts\told\tzzz\tnew\t\twave\t', 'jini\ta.ts\told\tm\tMANUAL\t\twave\tby hand']);
  const r1 = run(['--tsv', bad, '--repo-root', `jini=${dir}`], quiet);
  assert.equal(r1.code, 1);
  assert.equal(r1.manual.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'a.ts'), 'utf8'), "import { a } from 'old';\n");
  const good = tsv(['jini\ta.ts\told\ta\tnew\t\twave\t']);
  run(['--tsv', good, '--repo-root', dir, '--dry-run'], quiet);
  assert.equal(fs.readFileSync(path.join(dir, 'a.ts'), 'utf8'), "import { a } from 'old';\n");
  assert.equal(run(['--tsv', good, '--repo-root', dir], quiet).code, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'a.ts'), 'utf8'), "import { a } from 'new';\n");
  const r3 = run(['--tsv', good, '--repo-root', dir], quiet);
  assert.equal(r3.count.already, 1);
  assert.equal(r3.results.filter((x) => x.changed).length, 0);
});

// ---- applier v2 (P-APPLY2) ----

const same = (o) => ({ old_spec: 'k', new_spec: 'k', ...o });

test('in-place rename: same specifier, import name and every use in the file change', () => {
  const src = "import { StorageKernel, other } from 'k';\nconst x: StorageKernel = make();\nconst o = { StorageKernel };\nfoo.StorageKernel;\n";
  const r = go(src, same({ names: 'StorageKernel', rename: 'StorageKernel->KyselyKernel' }));
  assert.equal(r.status, 'applied');
  assert.equal(r.text, "import { KyselyKernel, other } from 'k';\nconst x: KyselyKernel = make();\nconst o = { StorageKernel: KyselyKernel };\nfoo.StorageKernel;\n");
});

test('in-place rename: alias hint keeps the local name; an existing alias is untouched; relative specs work', () => {
  assert.equal(go("import { Old } from './p.js';\nOld;\n", same({ old_spec: './p.js', new_spec: './p.js', names: 'Old', rename: 'Old->New (import { New as Old })' })).text, "import { New as Old } from './p.js';\nOld;\n");
  assert.equal(go("import { Old as O } from 'k';\nO;\n", same({ names: 'Old as O', rename: 'Old->New' })).text, "import { New as O } from 'k';\nO;\n");
});

test('in-place rename: rerun is already; neither name present is stale; a clashing binding of the new name is stale', () => {
  const row1 = same({ names: 'Old', rename: 'Old->New' });
  assert.equal(go("import { New } from 'k';\nNew;\n", row1).status, 'already');
  assert.throws(() => go("import { z } from 'k';\n", row1), StaleRowError);
  assert.throws(() => go("import { Old } from 'k';\nimport { New } from 'elsewhere';\n", row1), StaleRowError);
});

test('in-place rename of an export-from and of an inline import() qualifier', () => {
  assert.equal(go("export { Old, z } from 'k';\n", same({ old_spec: 'export-from k', new_spec: 'k', names: 'Old', rename: 'Old->New' })).text, "export { New, z } from 'k';\n");
  const r = go("type A = import('k').Old;\ntype B = import('k').Other;\n", same({ old_spec: "import('k')", names: 'Old', rename: 'Old->New' }));
  assert.equal(r.text, "type A = import('k').New;\ntype B = import('k').Other;\n");
  assert.equal(go("type A = import('k').New;\n", same({ old_spec: "import('k')", names: 'Old', rename: 'Old->New' })).status, 'already');
});

test('type-argument template with a placeholder: moves the import, rewrites each use, adds the extra import', () => {
  const src = "import type { StorageKernel } from 'old';\nimport { z } from 'zz';\nfunction f(k: StorageKernel<DB>, m: StorageKernel<Map<string, number>>): StorageKernel<DB> { return k; }\n";
  const r = go(src, { names: 'type StorageKernel', rename: 'StorageKernel<X> => StorageKernel<Kysely<X>, X> (core; add import type {Kysely} from "kysely")' });
  assert.equal(r.status, 'applied');
  assert.equal(r.text, "import type { StorageKernel } from 'new';\nimport { z } from 'zz';\nimport type { Kysely } from 'kysely';\nfunction f(k: StorageKernel<Kysely<DB>, DB>, m: StorageKernel<Kysely<Map<string, number>>, Map<string, number>>): StorageKernel<Kysely<DB>, DB> { return k; }\n");
});

test('type-argument template with a placeholder: a use without exactly one type argument is stale', () => {
  const row2 = { names: 'type StorageKernel', rename: 'StorageKernel<X> => StorageKernel<Kysely<X>, X> (add import type {Kysely} from "kysely")' };
  assert.throws(() => go("import type { StorageKernel } from 'old';\nlet k: StorageKernel;\n", row2), StaleRowError);
});

test('type-argument template without a placeholder: bare uses (incl. heritage) are replaced, generic uses are left', () => {
  const src = "import type { MigrationStep } from 'old';\nimport type { KyselyKernel } from 'db';\nconst a: MigrationStep = x;\nconst b: MigrationStep<Other> = y;\ninterface I extends MigrationStep {}\n";
  const r = go(src, { names: 'type MigrationStep', rename: 'MigrationStep => MigrationStep<KyselyKernel<unknown>> (MigrationStep from core)' });
  assert.equal(r.text, "import type { MigrationStep } from 'new';\nimport type { KyselyKernel } from 'db';\nconst a: MigrationStep<KyselyKernel<unknown>> = x;\nconst b: MigrationStep<Other> = y;\ninterface I extends MigrationStep<KyselyKernel<unknown>> {}\n");
});

test('type-argument template: an identifier the template needs that the file neither imports nor adds is stale', () => {
  assert.throws(() => go("import type { MigrationStep } from 'old';\nlet a: MigrationStep;\n", { names: 'type MigrationStep', rename: 'MigrationStep => MigrationStep<KyselyKernel<unknown>>' }), /KyselyKernel/);
  const ok = go("import type { MigrationStep } from 'old';\nlet a: MigrationStep;\n", { names: 'type MigrationStep', rename: 'MigrationStep => MigrationStep<KyselyKernel<unknown>> (add/merge import type { KyselyKernel } from "@jini-ai/db/kernel")' });
  assert.equal(ok.text, "import type { MigrationStep } from 'new';\nimport type { KyselyKernel } from '@jini-ai/db/kernel';\nlet a: MigrationStep<KyselyKernel<unknown>>;\n");
});

test('type-argument template: rerun is already', () => {
  const r = go("import type { MigrationStep } from 'new';\nlet a: MigrationStep<KyselyKernel<unknown>>;\n", { names: 'type MigrationStep', rename: 'MigrationStep => MigrationStep<KyselyKernel<unknown>>' });
  assert.equal(r.status, 'already');
});

test('add import: merges into an existing import of that spec, once; never duplicates', () => {
  const o = { names: 'type MigrationStep', rename: 'MigrationStep => MigrationStep<K<unknown>> (add import type { K } from "kk")' };
  assert.equal(go("import type { MigrationStep } from 'old';\nimport type { J } from 'kk';\nlet a: MigrationStep;\n", o).text, "import type { MigrationStep } from 'new';\nimport type { J, K } from 'kk';\nlet a: MigrationStep<K<unknown>>;\n");
  assert.equal(go("import type { MigrationStep } from 'old';\nimport type { K } from 'kk';\nlet a: MigrationStep;\n", o).text, "import type { MigrationStep } from 'new';\nimport type { K } from 'kk';\nlet a: MigrationStep<K<unknown>>;\n");
  assert.throws(() => go("import type { MigrationStep } from 'old';\nimport type { K } from 'other';\nlet a: MigrationStep;\n", o), StaleRowError);
});

test('unknown syntax in rename or action is a GrammarError (the old applier ignored `=>`)', () => {
  assert.throws(() => go("import { a } from 'old';\n", { names: 'a', rename: 'a => b' }), GrammarError);
  assert.throws(() => go("import { a } from 'old';\n", { names: 'a', rename: 'class moves verbatim into x.ts' }), GrammarError);
  assert.throws(() => go("import { a } from 'old';\n", { names: 'a', rename: 'a->b, and then some' }), GrammarError);
  assert.throws(() => go("import { a } from 'old';\n", { names: 'a', rename: 'Old<X> => Old<Y<Z>>' }), GrammarError);
  assert.throws(() => go("import { a } from 'old';\n", { names: 'a', rename: 'a->b', action: 'a => b' }), GrammarError);
  assert.throws(() => go("import { Old } from 'old';\n", { names: 'Old', rename: 'Old => Old<U> (frobnicate the thing)' }), GrammarError);
  assert.ok(go("import { a } from 'old';\n", { names: 'a', rename: '', action: 'SK-CORE+MOVE' }));
});

test('CLI run: a grammar error is reported as ERROR, nothing written, exit 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repoint-'));
  fs.writeFileSync(path.join(dir, 'a.ts'), "import { a } from 'old';\n");
  fs.writeFileSync(path.join(dir, 'b.ts'), "import { q } from 'old';\n");
  const f = path.join(dir, 't.tsv');
  fs.writeFileSync(f, ['repo\tfile\told_spec\tnames\tnew_spec\trename\tphase\tnote', 'jini\ta.ts\told\ta\tnew\t\twave\t', 'jini\tb.ts\told\tq\tnew\tq => r\twave\t'].join('\n') + '\n');
  const lines = [];
  const r = run(['--tsv', f, '--repo-root', dir], (l) => lines.push(l));
  assert.equal(r.code, 1);
  assert.equal(r.count.error, 1);
  assert.equal(r.count.stale, 0);
  assert.ok(lines.some((l) => l.startsWith('ERROR ')));
  assert.equal(fs.readFileSync(path.join(dir, 'a.ts'), 'utf8'), "import { a } from 'old';\n");
});

test('add import after a last import the same row deletes: no overlapping edits', () => {
  const r = go("import { z } from 'zz';\nimport type { MigrationStep } from 'old';\nlet a: MigrationStep;\n", { names: 'type MigrationStep', rename: 'MigrationStep => MigrationStep<K<unknown>> (add import type { K } from "kk")', new_spec: 'zz' });
  assert.equal(r.text, "import { z, type MigrationStep } from 'zz';\nimport type { K } from 'kk';\nlet a: MigrationStep<K<unknown>>;\n");
});
