/** Runner-independent Git denominator report. Owner brief: all-files coverage, 2026-10-20.
 * Hit identities use line + ordinal for branches/functions because LCOV lacks columns.
 * Cross-run instrumentation must retain branch ordering; counts are estimates otherwise.
 * Jini extraction candidate: kept here under the dispatch's explicit three-file scope.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { mergeLcov } from './coverage-changed-model.js';

type Options = Record<string, never>;
type Hits = Record<string, number>;
interface Image { file: string; lines: Hits; branches: Hits; functions: Hits }
interface Metric { covered: number; total: number; pct: number }
interface Metrics { lines: Metric; branches: Metric; functions: Metric }
interface Row extends Metrics { file: string; area: string; status: 'LOADED' | 'NEVER-LOADED'; hits: Omit<Image, 'file'> }
interface Exclusion { group: string; count: number; examples: string[] }
export interface AllFilesReport {
  files: Row[]; totals: Metrics; runnerTotals: Metrics; neverLoaded: number;
  areas: { area: string; files: number; neverLoaded: number; totals: Metrics }[];
  exclusions: Exclusion[]; unmatched: { input: string; file: string }[];
  excludedCoverage: { input: string; file: string; matched: string }[];
  warnings: string[];
}
interface Input { name: string; text: string }
export interface CoveragePorts {
  listFiles(input: { repo: string }): string[];
  readText(input: { file: string }): string;
  writeText(input: { file: string; text: string }): void;
}

function exclusionGroup({ file }: { file: string }, _options: Options = {}): string | undefined {
  const basename = file.split('/').at(-1)!;
  if (!/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file)) return 'non-source';
  if (/(^|\/)(node_modules|dist|build|out|coverage)(\/|$)/.test(file)) return 'dependencies/build/output';
  if (/(^|\/)(__tests__|fixtures|e2e)(\/|$)/.test(file) || /\.(test|spec|fixture)\./.test(basename)) return 'test/fixture';
  if (/\.d\.ts$/.test(file)) return 'declaration';
  if (/(^|\/)generated\//.test(file) || /\.generated\./.test(basename)) return 'generated';
  return undefined;
}

function typeStatement({ node }: { node: ts.Statement }, _options: Options = {}): boolean {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return true;
  if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    return !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings)
      && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(e => e.isTypeOnly);
  }
  if (ts.isImportEqualsDeclaration(node)) return node.isTypeOnly;
  if (!ts.isExportDeclaration(node)) return false;
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false;
  if (clause.elements.length === 0) return !node.moduleSpecifier;
  return clause.elements.every(e => e.isTypeOnly);
}

/** Analyze runtime statement start lines, function bodies and branch arms without executing source.
 * @returns AST estimates for missing records; no I/O. O(AST nodes) time and space.
 */
export function analyzeSource({ file, text }: { file: string; text: string }, _options: Options = {}): { typeOnly: boolean; image: Image } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const image: Image = { file, lines: {}, branches: {}, functions: {} };
  const visit = (node: ts.Node): void => {
    if (ts.isStatement(node) && typeStatement({ node })) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (ts.isStatement(node) && !ts.isBlock(node) && !ts.isEmptyStatement(node)) image.lines[line] = 0;
    if (ts.isFunctionLike(node) && 'body' in node && node.body) image.functions[node.pos] = 0;
    let arms = 0;
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) arms = 2;
    if (ts.isCaseClause(node) || ts.isDefaultClause(node)) arms = 1;
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) arms = 2;
    for (let arm = 0; arm < arms; arm++) image.branches[`${node.pos}:${arm}`] = 0;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { typeOnly: source.statements.every(node => typeStatement({ node })), image };
}

/** Index suffixes once; ambiguous suffixes remain unmatched rather than guessing a file. O(path segments). */
function suffixIndex({ files }: { files: string[] }, _options: Options = {}): Map<string, string | null> {
  const index = new Map<string, string | null>();
  for (const file of files) {
    const parts = file.split('/');
    for (let offset = 0; offset < parts.length; offset++) {
      const suffix = parts.slice(offset).join('/');
      index.set(suffix, index.has(suffix) ? null : file);
    }
  }
  // A complete tracked path is stronger evidence than a shared partial suffix.
  for (const file of files) index.set(file, file);
  return index;
}
function matchPath({ file, index }: { file: string; index: Map<string, string | null> }, _options: Options = {}): string | undefined {
  const parts = file.trim().replaceAll('\\', '/').replace(/^\.\//, '').split('/');
  for (let offset = 0; offset < parts.length; offset++) {
    const suffix = parts.slice(offset).join('/');
    if (index.has(suffix)) return index.get(suffix) ?? undefined;
  }
  return undefined;
}
function putMax({ target, key, hits }: { target: Hits; key: string; hits: number }, _options: Options = {}): void {
  if (!Number.isFinite(hits) || hits < 0) throw new TypeError(`Invalid hit count: ${hits}`);
  target[key] = Math.max(target[key] ?? 0, hits);
}
function ordinalKey({ line, counts }: { line: number | null; counts: Map<number | null, number> }, _options: Options = {}): string {
  const ordinal = counts.get(line) ?? 0;
  counts.set(line, ordinal + 1);
  return `${line}:${ordinal}`;
}
function parseLcovImages({ text }: { text: string }, { onMalformed }: { onMalformed?: (message: string) => void } = {}): Image[] {
  const images: Image[] = [];
  // Parse each record separately: the shared parser's duplicate-layout warnings are scope-specific.
  const blocks = text.replaceAll('\r\n', '\n').split(/(?<=^end_of_record\s*$)/m);
  for (const block of blocks) for (const record of parseLcovBlock({ block, onMalformed })) {
    const image: Image = { file: record.file, lines: Object.fromEntries(record.lines), branches: {}, functions: {} };
    const branches = new Map<number | null, number>(), functions = new Map<number | null, number>();
    for (const [key, hits] of record.branches) image.branches[ordinalKey({ line: Number(key.split(',')[0]), counts: branches })] = hits;
    for (const fn of record.functions.values()) image.functions[ordinalKey({ line: fn.line, counts: functions })] = fn.hits;
    images.push(image);
  }
  return images;
}
/** One record whose summary counters disagree with its detail lines (node:test lcov does this for
 * symlinked files outside the repo, 2026-10-21 cloud canary) must not sink the whole report: skip it
 * and say so. */
function parseLcovBlock({ block, onMalformed }: { block: string; onMalformed?: (message: string) => void }) {
  try { return [...mergeLcov({ text: block, normalizePath: file => file }).values()]; } catch (error) {
    onMalformed?.(error instanceof Error ? error.message : String(error));
    return [];
  }
}
interface Location { start: { line: number }; end: { line: number } }
interface IstanbulFile {
  path?: string; statementMap: Record<string, Location>; s: Hits;
  fnMap: Record<string, { loc: Location; decl?: Location }>; f: Hits;
  branchMap: Record<string, { line?: number; loc: Location; locations: Location[] }>; b: Record<string, number[]>;
}
function parseJsonImages({ text }: { text: string }, _options: Options = {}): Image[] {
  const data: Record<string, IstanbulFile> = JSON.parse(text);
  return Object.entries(data).map(([file, record]) => {
    const image: Image = { file: record.path ?? file, lines: {}, branches: {}, functions: {} };
    for (const [id, loc] of Object.entries(record.statementMap)) putMax({ target: image.lines, key: String(loc.start.line), hits: record.s[id] });
    const functions = new Map<number | null, number>(), branches = new Map<number | null, number>();
    for (const [id, fn] of Object.entries(record.fnMap)) image.functions[ordinalKey({ line: (fn.decl ?? fn.loc).start.line, counts: functions })] = record.f[id];
    for (const [id, branch] of Object.entries(record.branchMap)) {
      const line = branch.line ?? branch.loc.start.line;
      for (const hits of record.b[id]) image.branches[ordinalKey({ line, counts: branches })] = hits;
    }
    return image;
  });
}
function metric({ hits, never = false }: { hits: Hits; never?: boolean }, _options: Options = {}): Metric {
  const values = Object.values(hits), covered = values.filter(hit => hit > 0).length, total = values.length;
  return { covered, total, pct: total ? covered * 100 / total : never ? 0 : 100 };
}
function metrics({ image, never = false }: { image: Omit<Image, 'file'>; never?: boolean }, _options: Options = {}): Metrics {
  return { lines: metric({ hits: image.lines, never }), branches: metric({ hits: image.branches, never }), functions: metric({ hits: image.functions, never }) };
}
function totals({ rows }: { rows: Row[] }, _options: Options = {}): Metrics {
  const result = metrics({ image: { lines: {}, branches: {}, functions: {} } });
  for (const axis of ['lines', 'branches', 'functions'] as const) {
    const covered = rows.reduce((sum, row) => sum + row[axis].covered, 0);
    const total = rows.reduce((sum, row) => sum + row[axis].total, 0);
    result[axis] = { covered, total, pct: total ? covered * 100 / total : 100 };
  }
  return result;
}
function areaFor({ file }: { file: string }, _options: Options = {}): string {
  const parts = file.split('/');
  if (['packages', 'apps'].includes(parts[0]) && parts.length > 2) return parts.slice(0, 2).join('/');
  return parts.length > 1 ? parts[0] : '(root)';
}

/** Build an all-tracked-source report from text inputs; no filesystem or process access.
 * @returns Full report, including unmatched records and mutually exclusive exclusion groups.
 * @throws Malformed coverage input. O(source AST size + coverage size + files log files).
 */
export function buildReport({ sources, inputs }: { sources: ReadonlyMap<string, string>; inputs: Input[] }, _options: Options = {}): AllFilesReport {
  const excluded = new Map<string, string[]>();
  for (const group of ['non-source', 'dependencies/build/output', 'test/fixture', 'declaration', 'generated', 'type-only']) excluded.set(group, []);
  const estimates = new Map<string, Image>();
  for (const [file, text] of sources) {
    let group = exclusionGroup({ file });
    if (!group) {
      const analysis = analyzeSource({ file, text });
      if (analysis.typeOnly) group = 'type-only';
      else estimates.set(file, analysis.image);
    }
    if (group) excluded.get(group)!.push(file);
  }
  const index = suffixIndex({ files: [...sources.keys()] });
  const coverage = new Map<string, Image>();
  const unmatched: AllFilesReport['unmatched'] = [], excludedCoverage: AllFilesReport['excludedCoverage'] = [];
  const malformed: string[] = [];
  for (const input of inputs) {
    const images = input.text.trimStart().startsWith('{') ? parseJsonImages({ text: input.text }) : parseLcovImages({ text: input.text }, { onMalformed: message => malformed.push(`${input.name}: skipped malformed LCOV record — ${message}`) });
    for (const image of images) {
      const file = matchPath({ file: image.file, index });
      if (!file) { unmatched.push({ input: input.name, file: image.file }); continue; }
      if (!estimates.has(file)) { excludedCoverage.push({ input: input.name, file: image.file, matched: file }); continue; }
      const target = coverage.get(file) ?? { file, lines: {}, branches: {}, functions: {} };
      for (const axis of ['lines', 'branches', 'functions'] as const) for (const [key, hits] of Object.entries(image[axis])) putMax({ target: target[axis], key, hits });
      coverage.set(file, target);
    }
  }
  const files = [...estimates].map(([file, estimate]): Row => {
    const image = coverage.get(file) ?? estimate, never = !coverage.has(file);
    return { file, area: areaFor({ file }), status: never ? 'NEVER-LOADED' : 'LOADED', hits: { lines: image.lines, branches: image.branches, functions: image.functions }, ...metrics({ image, never }) };
  }).sort((a, b) => (b.lines.total - b.lines.covered) - (a.lines.total - a.lines.covered) || a.file.localeCompare(b.file));
  const grouped = new Map<string, Row[]>();
  for (const row of files) {
    const rows = grouped.get(row.area) ?? [];
    rows.push(row);
    grouped.set(row.area, rows);
  }
  const areas = [...grouped.keys()].sort().map(area => {
    const rows = grouped.get(area)!;
    return { area, files: rows.length, neverLoaded: rows.filter(row => row.status === 'NEVER-LOADED').length, totals: totals({ rows }) };
  });
  return { files, totals: totals({ rows: files }), runnerTotals: totals({ rows: files.filter(row => row.status === 'LOADED') }),
    neverLoaded: files.filter(row => row.status === 'NEVER-LOADED').length, areas,
    exclusions: [...excluded].map(([group, paths]) => ({ group, count: paths.length, examples: paths.sort().slice(0, 5) })), unmatched, excludedCoverage,
    warnings: ['NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).', 'LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.', 'LOADED means a coverage record exists, including zero-hit include records.', ...malformed] };
}
function display({ metric }: { metric: Metric }, _options: Options = {}): string { return `${metric.covered}/${metric.total} (${metric.pct.toFixed(2)}%)`; }
function escapeCell({ text }: { text: string }, _options: Options = {}): string { return text.replaceAll('|', '\\|').replaceAll('\n', ' '); }

/** Render the same JSON evidence as Markdown, with no row truncation. O(report size). */
export function renderReport({ report }: { report: AllFilesReport }, _options: Options = {}): string {
  const axes = ['lines', 'branches', 'functions'] as const;
  const lines = ['# All-files coverage', '', '| Metric | TRUE: all files | RUNNER: records only |', '| --- | --- | --- |'];
  for (const axis of axes) lines.push(`| ${axis} | ${display({ metric: report.totals[axis] })} | ${display({ metric: report.runnerTotals[axis] })} |`);
  lines.push('', `Never-loaded files: **${report.neverLoaded}** / ${report.files.length}`, '', ...report.warnings.map(w => `- ${w}`), '', '## Exclusions (first matching group)', '', '| Group | Files | Up to 5 examples |', '| --- | ---: | --- |');
  for (const group of report.exclusions) lines.push(`| ${group.group} | ${group.count} | ${group.examples.map(text => escapeCell({ text })).join(', ')} |`);
  lines.push('', '## Packages / top-level areas', '', '| Area | Files | Never loaded | Lines | Branches | Functions |', '| --- | ---: | ---: | --- | --- | --- |');
  for (const area of report.areas) lines.push(`| ${escapeCell({ text: area.area })} | ${area.files} | ${area.neverLoaded} | ${axes.map(axis => display({ metric: area.totals[axis] })).join(' | ')} |`);
  lines.push('', '## Files (largest uncovered line gap first)', '', '| File | Status | Uncovered lines | Lines | Branches | Functions |', '| --- | --- | ---: | --- | --- | --- |');
  for (const row of report.files) lines.push(`| ${escapeCell({ text: row.file })} | ${row.status} | ${row.lines.total - row.lines.covered} | ${axes.map(axis => display({ metric: row[axis] })).join(' | ')} |`);
  lines.push('', '## Full never-loaded list', '', ...report.files.filter(row => row.status === 'NEVER-LOADED').map(row => `- ${escapeCell({ text: row.file })}`), '', '## Unmatched coverage records', '');
  for (const row of report.unmatched) lines.push(`- ${escapeCell({ text: row.input })}: ${escapeCell({ text: row.file })}`);
  lines.push('', '## Coverage records excluded from denominator', '');
  for (const row of report.excludedCoverage) lines.push(`- ${escapeCell({ text: row.input })}: ${escapeCell({ text: row.file })} → ${escapeCell({ text: row.matched })}`);
  return lines.join('\n') + '\n';
}

/** Read inputs and write both reports through injected ports. Errors propagate to the CLI edge. */
export function runReport({ repo, coverage, out, ports }: { repo: string; coverage: string[]; out: string; ports: CoveragePorts }, { roots = [] }: { roots?: string[] } = {}): AllFilesReport {
  // --root scopes the denominator to product code (e.g. Jini vendors AI-Dev-Shop as tracked files);
  // no roots = the whole repo.
  const inRoots = (file: string) => !roots.length || roots.some(root => file === root || file.startsWith(`${root.replace(/\/+$/, '')}/`));
  const sources = new Map(ports.listFiles({ repo }).filter(inRoots).map(file => [file, exclusionGroup({ file }) ? '' : ports.readText({ file: path.join(repo, file) })]));
  const inputs = coverage.map(file => ({ name: file, text: ports.readText({ file }) }));
  const report = buildReport({ sources, inputs });
  ports.writeText({ file: path.join(out, 'coverage-all-files.json'), text: JSON.stringify(report, null, 2) + '\n' });
  ports.writeText({ file: path.join(out, 'coverage-all-files.md'), text: renderReport({ report }) });
  return report;
}

/** CLI adapter, intentionally report-only: diagnostics never change the exit status. */
export function main({ args, ports, log }: { args: string[]; ports: CoveragePorts; log: (message: string) => void }, _options: Options = {}): void {
  try {
    let repo: string | undefined, out: string | undefined;
    const coverage: string[] = [], roots: string[] = [];
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index], value = args[index + 1];
      if (!value || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
      if (flag === '--repo') repo = value;
      else if (flag === '--out') out = value;
      else if (flag === '--coverage') coverage.push(value);
      else if (flag === '--root') roots.push(value);
      else throw new TypeError(`Unknown option ${flag}`);
    }
    if (!repo || !out || !coverage.length) throw new TypeError('Usage: --repo <root> --coverage <file>... --out <dir> [--root <dir>...]');
    const report = runReport({ repo: path.resolve(repo), coverage, out, ports }, { roots });
    log(`All-files: ${report.files.length} files; ${report.neverLoaded} NEVER-LOADED; lines ${display({ metric: report.totals.lines })}`);
  } catch (error) { log(`Coverage report unavailable: ${error instanceof Error ? error.message : String(error)}`); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main({ args: process.argv.slice(2), log: message => console.log(message), ports: {
    // Tracked + untracked-not-ignored, minus files deleted in the working tree: the report describes
    // the tree as it stands (uncommitted refactors add/remove files), not the last commit.
    listFiles: ({ repo }) => execFileSync('git', ['-C', repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(file => file && existsSync(path.join(repo, file))),
    readText: ({ file }) => readFileSync(file, 'utf8'),
    writeText: ({ file, text }) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); },
  } });
}
