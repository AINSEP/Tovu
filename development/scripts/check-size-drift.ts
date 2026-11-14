/** Ratchet the two ESLint size rules using the production complexity scope and debt comparison. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  diffAgainstBaseline, functionLocations, REPO_ROOT, runEslint,
  type EslintFileResult, type EslintMessage, type FunctionLocation, type Violation,
} from "./check-src-complexity-drift.ts";
import { complexityScopes } from "./complexity-eslint.config.mjs";
import { sizeExceptions, type SizeException } from "./size-eslint.config.mjs";

const DEBT_FILE = "development/scripts/size-debt.json";
const CHECKER_FILE = "development/scripts/check-size-drift.ts";
const POLICY_FILE = "development/scripts/size-exceptions.json";

function offsetsFor(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") offsets.push(i + 1);
  return offsets;
}

function sizeFunction(message: EslintMessage, offsets: number[], locations: FunctionLocation[]): string | undefined {
  const offset = offsets[message.line - 1] + message.column - 1;
  return locations.filter(location => location.isFunction && location.headStart <= offset && location.end > offset)
    .sort((a, b) => (a.end - a.headStart) - (b.end - b.headStart))[0]?.name;
}

/** Preserve the same lexical identities as the complexity ratchet, including nested functions. */
function readViolations(result: EslintFileResult): Violation[] {
  const file = path.relative(REPO_ROOT, result.filePath).split(path.sep).join("/");
  const messages = result.messages.filter(message => {
    if (message.fatal || message.ruleId === null) throw new Error(`${file}:${message.line}: ${message.message}`);
    return message.ruleId === "max-lines" || message.ruleId === "max-lines-per-function";
  });
  if (!messages.length) return [];
  const source = readFileSync(result.filePath, "utf8");
  const offsets = offsetsFor(source);
  const locations = functionLocations(file, source);
  return messages.map(message => {
    const match = /has too many lines \((\d+)\)/i.exec(message.message);
    const name = message.ruleId === "max-lines" ? "<file>" : sizeFunction(message, offsets, locations);
    if (!name || !match) throw new Error(`Cannot identify size violation at ${file}:${message.line}: ${message.message}`);
    const rule = message.ruleId === "max-lines" ? "max-lines" : "max-lines-per-function";
    return { file, function: name, line: message.line, rule, value: Number(match[1]) };
  });
}

/** Scan the production scope with only the two size rules. */
export function findSizeViolations(_input: Record<string, never> = {}, _options: Record<string, never> = {}): Violation[] {
  return runEslint({ config: "development/scripts/size-eslint.config.mjs", scopes: complexityScopes }).flatMap(readViolations);
}

function exceptionFor(violation: Violation): SizeException | undefined {
  return sizeExceptions.entries.find(entry => {
    if (entry.repo !== "tovu" || entry.file !== violation.file) return false;
    if (violation.rule === "max-lines") return !entry.function;
    return entry.function && entry.identity === violation.function;
  });
}

/** Keep owner-accepted exceptions separate from the shrink-only debt list. */
export function partitionExceptions(
  { violations }: { violations: readonly Violation[] }, _options: Record<string, never> = {},
): { debt: Violation[]; accepted: { violation: Violation; reason: string }[] } {
  const debt: Violation[] = [];
  const accepted: { violation: Violation; reason: string }[] = [];
  for (const violation of violations) {
    const exception = exceptionFor(violation);
    if (exception) accepted.push({ violation, reason: exception.reason });
    else debt.push(violation);
  }
  return { debt, accepted };
}

function printViolation(violation: Violation): string {
  return `${violation.file}:${violation.line} ${violation.function} [${violation.rule}] ${violation.value}`;
}

function validDebtEntry(entry: Violation): boolean {
  const identity = typeof entry.file === "string" && typeof entry.function === "string";
  const numbers = Number.isInteger(entry.line) && entry.line > 0 && Number.isInteger(entry.value) && entry.value > 0;
  const rule = entry.rule === "max-lines" || entry.rule === "max-lines-per-function";
  return identity && numbers && rule;
}

function readDebt(raw: string): Violation[] {
  const parsed = JSON.parse(raw) as { version?: number; violations?: Violation[] };
  if (parsed.version !== 1 || !Array.isArray(parsed.violations)) throw new Error("Invalid size debt format");
  for (const entry of parsed.violations) {
    if (!validDebtEntry(entry)) {
      throw new Error(`Invalid size debt entry: ${JSON.stringify(entry)}`);
    }
  }
  return parsed.violations;
}

function gitAtBase(base: string, args: string[]): string {
  return execFileSync("git", [...args, base], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}

function sourceMatchesBase(base: string, file: string): boolean {
  try {
    return gitAtBase(`${base}:${file}`, ["show"]) === readFileSync(path.join(REPO_ROOT, file), "utf8");
  } catch {
    // An unreadable base or source cannot justify waiving the debt ratchet.
    return false;
  }
}

/** Do not allow additions or increases to the recorded debt in the same change as a violation. */
function checkDebtHistory(current: readonly Violation[], measured: readonly Violation[]): boolean {
  const base = process.env.SIZE_BASE_REF;
  if (!base) return true;
  const files = gitAtBase(base, ["ls-tree", "-r", "--name-only"]).trim().split("\n");
  if (!files.includes(DEBT_FILE)) {
    if (files.includes(CHECKER_FILE)) throw new Error("Base revision is missing its size debt list");
    console.log("check:size — capturing the first size debt snapshot.");
    return true;
  }
  const previous = gitAtBase(`${base}:${DEBT_FILE}`, ["show"]);
  const drift = diffAgainstBaseline(readDebt(previous), current);
  const policy = files.includes(POLICY_FILE)
    ? JSON.parse(gitAtBase(`${base}:${POLICY_FILE}`, ["show"])) as { limits?: { functionLines?: number } }
    : undefined;
  const from50 = policy?.limits?.functionLines === 50;
  const inflated = diffAgainstBaseline(measured, current);
  const inaccurateFiles = new Set([...inflated.added, ...inflated.worsened.map(item => item.current)].map(entry => entry.file));
  const unchanged = new Map<string, boolean>();
  // The owner approved a fresh 80-line baseline; only remeasure unchanged base files, without inflating debt.
  const isMigrationDebt = (entry: Violation): boolean => {
    if (!from50 || inaccurateFiles.has(entry.file)) return false;
    if (!unchanged.has(entry.file)) unchanged.set(entry.file, sourceMatchesBase(base, entry.file));
    return unchanged.get(entry.file) === true;
  };
  const added = drift.added.filter(entry => !isMigrationDebt(entry));
  const worsened = drift.worsened.filter(item => !isMigrationDebt(item.current));
  for (const entry of added) console.error(`Added debt is not allowed: ${printViolation(entry)}`);
  for (const { baseline, current: entry } of worsened) {
    console.error(`Increased debt is not allowed: ${printViolation(entry)} (was ${baseline.value})`);
  }
  return added.length === 0 && worsened.length === 0;
}

export function main(_input: Record<string, never> = {}, _options: Record<string, never> = {}): void {
  const baseline = readDebt(readFileSync(path.join(REPO_ROOT, DEBT_FILE), "utf8"));
  const all = findSizeViolations();
  const { debt, accepted } = partitionExceptions({ violations: all });
  const historyOk = checkDebtHistory(baseline, debt);
  const { added, removed, worsened } = diffAgainstBaseline(baseline, debt);
  for (const { violation, reason } of accepted) console.log(`Accepted exception: ${printViolation(violation)} — ${reason}`);
  for (const entry of added) console.error(`New violation: ${printViolation(entry)}`);
  for (const { baseline: before, current } of worsened) {
    console.error(`Worsened violation: ${printViolation(current)} (baseline ${before.value})`);
  }
  for (const entry of removed) console.error(`Delete stale debt entry: ${printViolation(entry)}`);
  const hasViolationDrift = added.length + removed.length + worsened.length > 0;
  if (!historyOk || hasViolationDrift) {
    process.exitCode = 1;
    return;
  }
  const functions = all.filter(entry => entry.rule === "max-lines-per-function").length;
  console.log(`check:size — ok: ${all.length} violations (${functions} functions, ${all.length - functions} files); ${debt.length} debt entries, ${accepted.length} accepted exceptions.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
