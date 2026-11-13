/**
 * Ratchet ESLint's two per-function complexity rules across production source.
 * Admin retains its 9/9 ceiling; other production code uses 10/10. Test and
 * generated code and pinned migrations are excluded by complexity-eslint.config.mjs.
 * The old list of selected directories silently missed most source after the
 * apps/website move; broad production-root globs avoid repeating that failure.
 *
 * A file-level allowance hid unrelated admin functions, so the baseline identifies
 * functions within each file. A multiset is still necessary: identical anonymous
 * functions must not collapse into a single allowance. Line numbers are diagnostics,
 * not identity, so unrelated edits above a function do not invalidate the baseline.
 *
 * In CI, COMPLEXITY_BASE_REF selects the previous revision of the debt list. This
 * prevents hiding a new or worsened violation by editing that list in the same change.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { complexityScopes } from "./complexity-eslint.config.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEBT_FILE = "development/scripts/src-complexity-debt.json";
const DEBT_PATH = path.join(REPO_ROOT, DEBT_FILE);

type ComplexityRule = "complexity" | "sonarjs/cognitive-complexity";
export interface Violation {
  readonly file: string;
  readonly function: string;
  readonly line: number;
  readonly rule: ComplexityRule;
  readonly value: number;
}
interface EslintMessage {
  ruleId: string | null;
  fatal?: boolean;
  line: number;
  column: number;
  message: string;
}
interface EslintFileResult { filePath: string; messages: EslintMessage[] }
interface FunctionLocation { start: number; end: number; name: string }

/** Stable per-function identity; line and value are allowed to change independently. */
export function violationKey(violation: Violation): string {
  return JSON.stringify([violation.file, violation.function, violation.rule]);
}

export interface DriftResult {
  readonly added: readonly Violation[];
  readonly removed: readonly Violation[];
  readonly worsened: readonly { baseline: Violation; current: Violation }[];
}

/** Compare allowances as multisets so duplicates cannot hide a new violation. */
export function diffAgainstBaseline(baseline: readonly Violation[], current: readonly Violation[]): DriftResult {
  const groups = new Map<string, { baseline: Violation[]; current: Violation[] }>();
  for (const [side, violations] of [["baseline", baseline], ["current", current]] as const) {
    for (const violation of violations) {
      const key = violationKey(violation);
      const group = groups.get(key) ?? { baseline: [], current: [] };
      group[side].push(violation);
      groups.set(key, group);
    }
  }
  const added: Violation[] = [];
  const removed: Violation[] = [];
  const worsened: { baseline: Violation; current: Violation }[] = [];
  for (const group of groups.values()) {
    group.baseline.sort((a, b) => b.value - a.value);
    group.current.sort((a, b) => b.value - a.value);
    const matched = Math.min(group.baseline.length, group.current.length);
    for (let i = 0; i < matched; i++) {
      const previous = group.baseline[i];
      const actual = group.current[i];
      if (actual.value > previous.value) worsened.push({ baseline: previous, current: actual });
    }
    added.push(...group.current.slice(matched));
    removed.push(...group.baseline.slice(matched));
  }
  return { added, removed, worsened };
}

/** Index lexical function names and ranges, including anonymous callbacks and class initializers. */
function functionLocations(file: string, source: string): FunctionLocation[] {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const locations: FunctionLocation[] = [];
  const counts = new Map<string, number>();
  const visit = (node: ts.Node, parents: string[]): void => {
    let nextParents = parents;
    const isFunction = ts.isFunctionLike(node) && "body" in node && node.body;
    const isInitializer = ts.isPropertyDeclaration(node) && node.initializer && !ts.isFunctionLike(node.initializer);
    const isStaticBlock = ts.isClassStaticBlockDeclaration(node);
    if (isFunction || isInitializer || isStaticBlock) {
      const namedNode = node as ts.Node & { name?: ts.Node };
      const parent = node.parent;
      let name = namedNode.name?.getText(tree);
      if (!name && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))) {
        name = parent.name.getText(tree);
      }
      if (!name) name = isStaticBlock ? "<static block>" : "<anonymous>";
      const prefix = [...parents, name].join(".");
      const ordinal = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, ordinal);
      const qualified = `${prefix}#${ordinal}`;
      locations.push({ start: node.getStart(tree), end: node.end, name: qualified });
      nextParents = [...parents, `${name}#${ordinal}`];
    }
    ts.forEachChild(node, child => visit(child, nextParents));
  };
  visit(tree, []);
  return locations;
}

/** Convert ESLint's JSON locations and measured values into reviewable debt entries. */
function readViolations(result: EslintFileResult): Violation[] {
  const file = path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/");
  const relevant = result.messages.filter(message => {
    if (message.fatal || message.ruleId === null) throw new Error(`${file}:${message.line}: ${message.message}`);
    return message.ruleId === "complexity" || message.ruleId === "sonarjs/cognitive-complexity";
  });
  if (relevant.length === 0) return [];
  const source = readFileSync(result.filePath, "utf8");
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") offsets.push(i + 1);
  const locations = functionLocations(file, source);
  return relevant.map(message => {
    const offset = offsets[message.line - 1] + message.column - 1;
    const location = locations.filter(candidate => candidate.start <= offset && candidate.end > offset)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    const match = message.ruleId === "complexity"
      ? /complexity of (\d+)/i.exec(message.message)
      : /complexity from (\d+)/i.exec(message.message);
    if (!location || !match) throw new Error(`Cannot identify complexity violation at ${file}:${message.line}: ${message.message}`);
    return { file, function: location.name, line: message.line, rule: message.ruleId as ComplexityRule, value: Number(match[1]) };
  });
}

/** Run only the two complexity rules and fail closed on scanner or parser failures. */
export function findViolations(): Violation[] {
  const args = [
    path.join(REPO_ROOT, "node_modules/eslint/bin/eslint.js"),
    "--no-config-lookup", "--config", "development/scripts/complexity-eslint.config.mjs",
    "--no-inline-config", "--no-error-on-unmatched-pattern", "--no-warn-ignored", "--format", "json",
    ...complexityScopes,
  ];
  let raw: string;
  try {
    raw = execFileSync(process.execPath, args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  } catch (error) {
    // Exit 1 is ESLint's normal result for findings; exit 2 is a configuration/tool failure.
    const failure = error as { status?: number; stdout?: string };
    if (failure.status !== 1 || !failure.stdout) throw error;
    raw = failure.stdout;
  }
  return (JSON.parse(raw) as EslintFileResult[]).flatMap(readViolations);
}

function printViolation(violation: Violation): string {
  return `${violation.file}:${violation.line} ${violation.function} [${violation.rule}] ${violation.value}`;
}

/** Validate the committed debt format before trusting it as an allowance. */
function readDebt(raw: string): Violation[] {
  const debt = JSON.parse(raw) as { version?: number; violations?: Violation[] };
  if (debt.version !== 2 || !Array.isArray(debt.violations)) throw new Error("Invalid complexity debt format");
  for (const entry of debt.violations) {
    if (typeof entry.file !== "string" || typeof entry.function !== "string" ||
        !Number.isInteger(entry.line) || entry.line < 1 || !Number.isInteger(entry.value) || entry.value < 1 ||
        (entry.rule !== "complexity" && entry.rule !== "sonarjs/cognitive-complexity")) {
      throw new Error(`Invalid complexity debt entry: ${JSON.stringify(entry)}`);
    }
  }
  return debt.violations;
}

/** Compare the proposed debt against CI's base, allowing the one-time legacy-format migration. */
function checkDebtHistory(current: readonly Violation[]): boolean {
  const base = process.env.COMPLEXITY_BASE_REF;
  if (!base) return true;
  const raw = execFileSync("git", ["show", `${base}:${DEBT_FILE}`], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const previous = JSON.parse(raw) as { version?: number; violations?: unknown[] };
  if (previous.version === undefined && previous.violations?.every(entry => typeof entry === "object" && entry !== null && "reason" in entry)) {
    console.log("check:complexity — replacing the legacy baseline with the first unified snapshot.");
    return true;
  }
  const drift = diffAgainstBaseline(readDebt(raw), current);
  for (const entry of drift.added) console.error(`Added debt is not allowed: ${printViolation(entry)}`);
  for (const { baseline, current: entry } of drift.worsened) {
    console.error(`Increased debt is not allowed: ${printViolation(entry)} (was ${baseline.value})`);
  }
  return drift.added.length === 0 && drift.worsened.length === 0;
}

export function main(): void {
  const debt = readDebt(readFileSync(DEBT_PATH, "utf8"));
  const historyOk = checkDebtHistory(debt);
  const current = findViolations();
  const { added, removed, worsened } = diffAgainstBaseline(debt, current);
  for (const entry of added) console.error(`New violation: ${printViolation(entry)}`);
  for (const { baseline, current: entry } of worsened) {
    console.error(`Worsened violation: ${printViolation(entry)} (baseline ${baseline.value})`);
  }
  for (const entry of removed) console.error(`Delete stale debt entry: ${printViolation(entry)}`);
  if (!historyOk || added.length || removed.length || worsened.length) {
    process.exitCode = 1;
    return;
  }
  const cyclomatic = current.filter(entry => entry.rule === "complexity").length;
  console.log(`check:complexity — ok: ${current.length} entries (${cyclomatic} cyclomatic, ${current.length - cyclomatic} cognitive).`);
}

// Importers use the scanner and diff without accidentally launching ESLint or exiting the process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
