#!/usr/bin/env node
/**
 * Gate B (P12 GATE-B): the Tovu extraction-boundary RATCHET.
 *
 * Bound (to-be-extracted) code must not depend on host code. Existing debt is frozen per
 * (rule, source, target, kind) in development/boundaries/extraction-debt.json with an exact count
 * of physical reference sites. This check fails on:
 *   - a new finding key, or a count above its allowance;
 *   - an allowance that grew versus the trusted base (same-change growth cannot excuse itself);
 *   - a stale allowance (the live count fell): run `--write-shrink` and commit it ("update baseline");
 *   - inventory validation errors, including narrowing versus the base inventory.
 *
 * Modes:
 *   (default)          check
 *   --print-baseline   print the debt JSON computed from the live tree (seed/review only)
 *   --write-shrink     rewrite the debt file with exact lower counts and zero rows removed; refuses
 *                      new keys or higher counts; byte-idempotent
 *   --with-report      first run `depcruise --config .dependency-cruiser.mjs apps/website/src`
 *                      exactly as `check:boundaries` used to (same stdout, exit code preserved)
 *
 * Trusted base: EXTRACTION_BASE_REF (default HEAD), read with `git show <ref>:<file>`. The all-zero
 * SHA (a new branch push) falls back to the previous commit, or the first commit. An unresolvable
 * ref fails closed. A base that predates the debt/inventory files is the one-time bootstrap.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadInventory, validateInventory } from "./lib/extraction-inventory.mjs";
import { computeFindings, sortEntries } from "./lib/extraction-graph.mjs";

const DEBT_FILE = "development/boundaries/extraction-debt.json";
const INVENTORY_FILE = "development/boundaries/extraction-inventory.json";
const DEPCRUISE = path.resolve(import.meta.dirname, "../../node_modules/dependency-cruiser/bin/dependency-cruise.mjs");
const KEY_FIELDS = ["rule", "source", "target", "kind"];
const ZERO_SHA = /^0{40}$/;

class GateError extends Error {}

function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Resolves EXTRACTION_BASE_REF to a commit, with SIZE_BASE_REF's zero-SHA fallback. */
function resolveBase(root, _optional = {}) {
  const requested = process.env.EXTRACTION_BASE_REF || "HEAD";
  let ref = requested;
  if (ZERO_SHA.test(requested)) {
    const previous = git(root, ["rev-parse", "--verify", "--quiet", "HEAD~1^{commit}"]);
    ref = previous.status === 0 ? previous.stdout.trim() : git(root, ["rev-list", "--max-parents=0", "HEAD"]).stdout.trim().split("\n")[0];
  }
  const verified = git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (!ref || verified.status !== 0) throw new GateError(`cannot read trusted base ${JSON.stringify(requested)} (fail closed)`);
  return verified.stdout.trim();
}

/** A file's JSON at the base commit, or null when the base predates the file. */
function readAtBase(root, base, file) {
  const listed = git(root, ["ls-tree", "--name-only", base, "--", file]);
  if (listed.status !== 0) throw new GateError(`cannot list ${file} at ${base}: ${listed.stderr.trim()}`);
  if (!listed.stdout.trim()) return null;
  const shown = git(root, ["show", `${base}:${file}`]);
  if (shown.status !== 0) throw new GateError(`cannot read ${file} at ${base}: ${shown.stderr.trim()}`);
  try { return JSON.parse(shown.stdout); } catch (error) { throw new GateError(`invalid JSON in ${file} at ${base}: ${error.message}`); }
}

const keyOf = (entry) => KEY_FIELDS.map((field) => entry[field]).join("\0");

/** Canonical bytes: sorted entries, one per line, fixed field order. */
export function serializeDebt(required, _optional = {}) {
  const entries = sortEntries({ entries: required.entries }).map((entry) => JSON.stringify({
    rule: entry.rule, source: entry.source, target: entry.target, kind: entry.kind, count: entry.count, owner: entry.owner,
  }));
  const body = entries.length === 0 ? "[]" : `[\n    ${entries.join(",\n    ")}\n  ]`;
  return `{\n  "seedSha": ${JSON.stringify(required.seedSha)},\n  "entries": ${body}\n}\n`;
}

function readDebt(root) {
  const file = path.join(root, DEBT_FILE);
  if (!fs.existsSync(file)) throw new GateError(`${DEBT_FILE} is missing (fail closed; seed it with --print-baseline)`);
  const text = fs.readFileSync(file, "utf8");
  let debt;
  try { debt = JSON.parse(text); } catch (error) { throw new GateError(`invalid JSON in ${DEBT_FILE}: ${error.message}`); }
  if (typeof debt.seedSha !== "string" || !Array.isArray(debt.entries)) throw new GateError(`${DEBT_FILE} must be { seedSha, entries[] }`);
  const keys = new Set(debt.entries.map(keyOf));
  const problems = keys.size === debt.entries.length ? [] : [`${DEBT_FILE}: duplicate entry keys`];
  if (serializeDebt(debt) !== text) problems.push(`${DEBT_FILE}: not in canonical form (sorted, one entry per line); run --write-shrink`);
  return { debt, problems };
}

function describe(finding) {
  const witness = finding.witness ? `\n      witness: ${finding.witness.join(" -> ")}` : "";
  return `${finding.rule} ${finding.source} -> ${finding.target} [${finding.kind}] x${finding.count}${witness}`;
}

const countsByKey = (debt) => (debt ? new Map(debt.entries.map((entry) => [keyOf(entry), entry.count])) : null);
const label = (entry) => `${entry.rule} ${entry.source} -> ${entry.target} [${entry.kind}]`;

/** Live findings that are new or above their allowance. */
function excessProblems(required, _optional = {}) {
  const allowed = countsByKey(required.debt);
  return required.findings.flatMap((finding) => {
    const allowance = allowed.get(keyOf(finding)) ?? 0;
    if (allowance === 0) return [`new finding: ${describe(finding)}`];
    return finding.count > allowance ? [`above allowance (${allowance}): ${describe(finding)}`] : [];
  });
}

/** Allowances that grew versus the trusted base, or exceed the live count (stale). */
function allowanceProblems(required, _optional = {}) {
  const live = new Map(required.findings.map((finding) => [keyOf(finding), finding.count]));
  const base = countsByKey(required.baseDebt);
  const problems = [];
  for (const entry of required.debt.entries) {
    // Bootstrap (no debt file at the base) has nothing to compare growth against.
    const baseCount = base ? base.get(keyOf(entry)) ?? 0 : entry.count;
    if (entry.count > baseCount) problems.push(`allowance growth vs base (${baseCount} -> ${entry.count}): ${label(entry)}`);
    const liveCount = live.get(keyOf(entry)) ?? 0;
    if (liveCount < entry.count) problems.push(`stale allowance (${entry.count}, live ${liveCount}): ${label(entry)}; update baseline with --write-shrink`);
  }
  return problems;
}

function ratchetProblems(required, _optional = {}) {
  return [...excessProblems(required), ...allowanceProblems(required)];
}

/** --write-shrink: lower allowances to live counts; never adds keys or raises past current/base. */
function shrink(required, _optional = {}) {
  const { findings, debt, baseDebt } = required;
  const base = baseDebt ? new Map(baseDebt.entries.map((entry) => [keyOf(entry), entry.count])) : null;
  const ceiling = new Map(debt.entries.map((entry) => [keyOf(entry), Math.min(entry.count, base ? base.get(keyOf(entry)) ?? 0 : entry.count)]));
  const refused = findings.filter((finding) => finding.count > (ceiling.get(keyOf(finding)) ?? 0));
  if (refused.length > 0) return { refused };
  const live = new Map(findings.map((finding) => [keyOf(finding), finding.count]));
  const entries = debt.entries
    .map((entry) => ({ ...entry, count: Math.min(entry.count, live.get(keyOf(entry)) ?? 0) }))
    .filter((entry) => entry.count > 0);
  return { bytes: serializeDebt({ seedSha: debt.seedSha, entries }) };
}

function runReport(root) {
  // Byte-compatible with the old `check:boundaries` tail (GB.3): same bin, config and path set,
  // inherited stdio so its stdout is passed through untouched.
  const result = spawnSync(process.execPath, [DEPCRUISE, "--config", ".dependency-cruiser.mjs", "apps/website/src"], { cwd: root, stdio: "inherit" });
  return result.status ?? 1;
}

function loadInventories(root, base) {
  let inventory;
  try { inventory = loadInventory({ root }); } catch (error) { throw new GateError(error.message); }
  const baseInventory = readAtBase(root, base, INVENTORY_FILE);
  const errors = validateInventory({ inventory, root }, baseInventory ? { base: baseInventory } : {});
  return { inventory, errors: errors.map((error) => `inventory: ${error}`) };
}

function headSha(root) {
  const head = git(root, ["rev-parse", "HEAD"]);
  return head.status === 0 ? head.stdout.trim() : "unknown";
}

async function printBaseline(root, inventory) {
  const { findings, errors } = await computeFindings({ root, inventory });
  if (errors.length > 0) throw new GateError(errors.join("\n"));
  for (const finding of findings) if (finding.witness) process.stderr.write(`${describe(finding)}\n`);
  process.stdout.write(serializeDebt({ seedSha: headSha(root), entries: findings }));
  return 0;
}

async function writeShrink(root, inventory, baseDebt) {
  const { findings, errors } = await computeFindings({ root, inventory });
  if (errors.length > 0) throw new GateError(errors.join("\n"));
  const { debt } = readDebt(root);
  const result = shrink({ findings, debt, baseDebt });
  if (result.refused) {
    for (const finding of result.refused) console.error(`refused (new key or higher count): ${describe(finding)}`);
    return 1;
  }
  fs.writeFileSync(path.join(root, DEBT_FILE), result.bytes);
  console.log(`${DEBT_FILE}: shrunk to ${JSON.parse(result.bytes).entries.length} entries`);
  return 0;
}

function summarize(findings) {
  const byRule = {};
  for (const finding of findings) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + finding.count;
  const total = findings.reduce((sum, finding) => sum + finding.count, 0);
  return `${findings.length} keys, ${total} occurrences ${JSON.stringify(byRule)}`;
}

async function check(root, context) {
  const { inventory, baseDebt, problems: early } = context;
  const { findings, errors } = await computeFindings({ root, inventory });
  const { debt, problems: format } = readDebt(root);
  const problems = [...early, ...errors, ...format, ...ratchetProblems({ findings, debt, baseDebt })];
  console.log(`extraction boundaries: live ${summarize(findings)}; allowances ${debt.entries.length}${baseDebt ? "" : " (bootstrap: base has no debt file)"}`);
  for (const problem of problems) console.log(`  FAIL ${problem}`);
  if (problems.length === 0) console.log("  ok: no new, raised or stale extraction-boundary debt");
  return problems.length === 0 ? 0 : 1;
}

async function main(argv) {
  const root = process.cwd();
  const flags = new Set(argv);
  const reportStatus = flags.has("--with-report") ? runReport(root) : 0;
  if (flags.has("--with-report")) process.stdout.write("\n== extraction boundaries ==\n");
  let status;
  try {
    const base = resolveBase(root);
    const { inventory, errors } = loadInventories(root, base);
    if (flags.has("--print-baseline") || flags.has("--write-shrink")) {
      if (errors.length > 0) throw new GateError(errors.join("\n"));
      status = flags.has("--print-baseline") ? await printBaseline(root, inventory) : await writeShrink(root, inventory, readAtBase(root, base, DEBT_FILE));
    } else {
      status = await check(root, { inventory, baseDebt: readAtBase(root, base, DEBT_FILE), problems: errors });
    }
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    console.error(`extraction boundaries: ${error.message}`);
    status = 2;
  }
  return reportStatus || status;
}

process.exitCode = await main(process.argv.slice(2));
