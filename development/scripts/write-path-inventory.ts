/**
 * ADR-041 item 5 Phase 0 deliverable — typed AST write-path inventory.
 *
 * Anchors on two complementary, cross-validating denominators (never text grep,
 * so it follows types rather than names):
 *
 *   1. The closed set of `sqliteTable` exports in `src/db/schema.ts`.
 *      For each table symbol, every project-wide reference is resolved via the
 *      TS language service and classified read vs. write by its enclosing
 *      Drizzle call (`.insert/.update/.delete` vs `.select/.from`).
 *
 *   2. Every Port/Repo/Sink/Store interface method whose name isn't a known
 *      reader prefix (find, get, list, count, exists, lookup), or
 *      whose implementation body contains durable/memory mutation evidence —
 *      this catches table-less and memory-only writers denominator 1
 *      structurally cannot reach.
 *
 * For every resolved write call site, emits: contract method, implementing
 * class(es), caller, file/line, and a coverage class
 * (executeCommand / same_tx_outbox / sequential_outbox / ledger_only / none / unknown).
 *
 * Usage:
 *   npx tsx scripts/write-path-inventory.ts [--table=<sqliteTable export name>] [--json] [--check]
 *
 * `--table=<name>` restricts denominator 1 to a single table — the de-risk
 * step ADR-041 item 5 itself recommends before trusting the full 35-table run.
 * `--check` compares against `scripts/write-path-inventory.baseline.json` and
 * exits non-zero on drift (new mutating methods with no coverage class, or
 * methods present in the baseline but missing from this run) — the CI gate.
 */

import { Project, Node, SyntaxKind, type MethodDeclaration, type FunctionDeclaration, type VariableDeclaration } from "ts-morph";
import * as path from "node:path";
import * as fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCHEMA_FILE = path.join(ROOT, "src/db/schema.ts");
const BASELINE_FILE = path.join(import.meta.dirname, "write-path-inventory.baseline.json");

const READER_PREFIX = /^(find|get|list|count|exists|lookup)([A-Z]|$)/;
const PORT_LIKE_INTERFACE = /(Port|Repo|Sink|Store)$/;

// Durable/memory mutation evidence scanned in an implementing method's body.
const MUTATION_EVIDENCE: RegExp[] = [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /onConflictDoUpdate/,
  /db\.transaction\s*\(/,
  /\.set\s*\(/, // Map.set(...) / drizzle .set(...)
  /\.push\s*\(/,
  /\.splice\s*\(/,
  /writeFile\s*\(/,
  /\brm\s*\(/,
  /\bunlink\s*\(/,
  /\.put\s*\(/,
  /\.remove\s*\(/,
  /\.run\s*\(/, // raw better-sqlite3 statement execution
  /\.prepare\s*\(/,
];

type Coverage =
  | "executeCommand"
  | "same_tx_outbox"
  | "sequential_outbox"
  | "ledger_only"
  | "none"
  | "unknown";

interface WriteSite {
  source: "table" | "port";
  contractMethod: string;
  implementingClass?: string;
  caller: string;
  file: string;
  line: number;
  coverageClass: Coverage;
}

function relFile(node: Node): string {
  return path.relative(ROOT, node.getSourceFile().getFilePath());
}

function enclosingFunctionName(node: Node): string {
  const fn = node.getFirstAncestor(
    (a) =>
      Node.isFunctionDeclaration(a) ||
      Node.isMethodDeclaration(a) ||
      Node.isArrowFunction(a) ||
      Node.isFunctionExpression(a) ||
      Node.isConstructorDeclaration(a)
  );
  if (!fn) return "(module scope)";
  if (Node.isMethodDeclaration(fn) || Node.isConstructorDeclaration(fn)) {
    const cls = fn.getFirstAncestor(Node.isClassDeclaration);
    const clsName = cls?.getName() ?? "(anon class)";
    return `${clsName}.${fn.getName?.() ?? "constructor"}`;
  }
  if (Node.isFunctionDeclaration(fn)) return fn.getName() ?? "(anon function)";
  // Arrow/function expression: try the nearest variable declaration name.
  const varDecl = fn.getFirstAncestor(Node.isVariableDeclaration);
  return varDecl?.getName() ?? "(anonymous)";
}

function isFunctionLike(n: Node): boolean {
  return (
    Node.isFunctionDeclaration(n) ||
    Node.isMethodDeclaration(n) ||
    Node.isArrowFunction(n) ||
    Node.isFunctionExpression(n)
  );
}

const NON_PRODUCTION_FILE = /(__tests__|\.test\.ts$)/;

/**
 * A repo/port adapter method (e.g. `SqliteMemberSubscriptionRepo.save()`) is a
 * dumb persistence method — it never itself calls `executeCommand`/
 * `outbox.enqueue`/`appendRevision`; that orchestration lives one or more
 * layers up, in whatever service function/method actually calls `.save(...)`
 * on an injected repo instance. `findReferencesAsNodes()` on the method/
 * function declaration resolves those call sites project-wide: TS's language
 * service follows the interface/implementation relationship, so a reference
 * search seeded on the concrete class method also surfaces call sites reached
 * only through the port's interface type (e.g. `deps.repo.save(post)` where
 * `deps.repo: PostRepoPort`), not just call sites against the concrete class
 * directly.
 *
 * Filters out non-call references the same symbol search incidentally pulls
 * in: the interface's own method signature, and sibling implementations'
 * method declarations (e.g. `repo.memory.ts`'s own `save`) — none of those
 * sit under a `CallExpression` whose callee is the reference itself, so the
 * shape check below excludes them without needing to special-case
 * declaration kinds. Also drops references from test files — unit tests
 * routinely call a service/repo method directly with mocked deps, bypassing
 * whatever real orchestration (`executeCommand`, outbox) wraps it in
 * production, and that must not leak into the production coverage class.
 */
function findCallSites(declOrMethod: MethodDeclaration | FunctionDeclaration | VariableDeclaration): Node[] {
  const refs = declOrMethod.findReferencesAsNodes();
  const sites: Node[] = [];
  for (const ref of refs) {
    if (NON_PRODUCTION_FILE.test(ref.getSourceFile().getFilePath())) continue;

    const parent = ref.getParent();
    if (!parent) continue;

    // `x.method(...)` — ref is the tail of a property access that is itself called.
    if (Node.isPropertyAccessExpression(parent)) {
      const call = parent.getParent();
      if (call && Node.isCallExpression(call) && call.getExpression() === parent) sites.push(ref);
      continue;
    }

    // bare `fn(...)` — ref is the callee identifier directly.
    if (Node.isCallExpression(parent) && parent.getExpression() === ref) {
      sites.push(ref);
    }
  }
  return sites;
}

/**
 * The nearest declaration enclosing `node` that `findCallSites` can seed a
 * project-wide reference search from: a method, a top-level function
 * declaration, or a named-const arrow/function-expression (via its
 * `VariableDeclaration`). Anonymous closures with no assignable name (e.g. an
 * inline callback argument with no enclosing named binding) are a dead end —
 * there is no symbol to search references for, so the walk stops there.
 */
function nearestReferenceableDecl(node: Node): MethodDeclaration | FunctionDeclaration | VariableDeclaration | undefined {
  const fn = isFunctionLike(node) ? node : node.getFirstAncestor(isFunctionLike);
  if (!fn) return undefined;
  if (Node.isMethodDeclaration(fn) || Node.isFunctionDeclaration(fn)) return fn;
  if (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) {
    const varDecl = fn.getFirstAncestor(Node.isVariableDeclaration);
    return varDecl; // undefined if it's an unnamed inline callback — dead end, handled by caller
  }
  return undefined;
}

/**
 * Widest enclosing function-like scope: walks outward through nested
 * anonymous closures (e.g. an inline `execute: () => ...` callback argument
 * passed into an outer `await executeCommand({ ... })` call in the SAME
 * function) so the text scan below sees the whole unit of work, not just the
 * innermost arrow. Stops at the first non-function-like ancestor (a class
 * body, module scope), so it never merges two unrelated methods/functions.
 */
function widestFunctionScope(node: Node): Node {
  const start = isFunctionLike(node) ? node : node.getFirstAncestor(isFunctionLike);
  if (!start) return node.getSourceFile();
  let current: Node = start;
  for (;;) {
    const outer = current.getFirstAncestor(isFunctionLike);
    if (!outer) return current;
    current = outer;
  }
}

function classifySelf(node: Node): Coverage {
  const fn = widestFunctionScope(node);
  const text = fn.getText();

  if (/\bexecuteCommand\s*\(/.test(text)) return "executeCommand";

  if (/outbox\s*\.\s*enqueue\s*\(/.test(text)) {
    const txAncestor = node.getFirstAncestor((a) => /db\.transaction\s*\(/.test(a.getText()));
    return txAncestor ? "same_tx_outbox" : "sequential_outbox";
  }

  if (/\bappendRevision\s*\(|_ledger\b|Ledger\s*\./.test(text)) return "ledger_only";

  return "none";
}

const MAX_CALL_GRAPH_HOPS = 4;

/**
 * `classifySelf` only sees signals textually present in `node`'s own widest
 * function scope. That is enough when the write and its `executeCommand`/
 * outbox/ledger wrapper live in the same function (settings/forms
 * write-services), but not when a repo's dumb `save()` is called from a pure
 * business-logic function (`post.ts`'s `createPost`) that itself does no
 * orchestration — the `executeCommand(...)` call lives one layer further up,
 * in the route handler that wraps `createPost(...)` as its command's
 * `mutation.execute` callback. Those two functions share no AST ancestry
 * (different files/functions linked only by a call reference), so this walks
 * the actual call graph outward — via `findCallSites` seeded on the enclosing
 * named declaration — until a hop's own scope shows a signal, a hop runs out
 * of (production) callers, or `MAX_CALL_GRAPH_HOPS` is spent.
 *
 * When a hop fans out to multiple production callers with different
 * outcomes, this returns the first non-`"none"` result found (deterministic,
 * but not exhaustive) rather than silently picking a single "correct" one —
 * a genuine simplification, noted here rather than hidden.
 */
function classifyCoverage(node: Node, depth = 0, seen: Set<Node> = new Set()): Coverage {
  const direct = classifySelf(node);
  if (direct !== "none") return direct;
  if (depth >= MAX_CALL_GRAPH_HOPS) return "none";

  const decl = nearestReferenceableDecl(node);
  if (!decl || seen.has(decl)) return "none";
  seen.add(decl);

  const callers = findCallSites(decl);
  for (const caller of callers) {
    const result = classifyCoverage(caller, depth + 1, seen);
    if (result !== "none") return result;
  }
  return "none";
}

// ---------- Denominator 1: sqliteTable exports ----------

function collectTableWriteSites(project: Project, tableFilter?: string): WriteSite[] {
  const schemaFile = project.getSourceFileOrThrow(SCHEMA_FILE);
  const sites: WriteSite[] = [];

  for (const decl of schemaFile.getVariableDeclarations()) {
    if (!decl.hasExportKeyword() && !decl.isExported()) continue;
    const init = decl.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;
    if (init.getExpression().getText() !== "sqliteTable") continue;

    const tableName = decl.getName();
    if (tableFilter && tableName !== tableFilter) continue;

    const nameNode = decl.getNameNode();
    const refs = nameNode.findReferencesAsNodes();

    for (const ref of refs) {
      if (ref.getSourceFile().getFilePath() === schemaFile.getFilePath()) continue; // skip the declaration site itself

      const call = ref.getFirstAncestor(Node.isCallExpression);
      if (!call) continue; // type-only usage (e.g. typeof posts.$inferSelect) — not a query site

      const calleeText = call.getExpression().getText();
      const isWrite = /\.(insert|update|delete)$/.test(calleeText);
      const isRead = /\.(select|from|query)$/.test(calleeText) || /\bquery\./.test(calleeText);
      if (!isWrite) {
        if (isRead) continue;
        continue; // unrecognized call shape against a table symbol — not classified as a write site
      }

      sites.push({
        source: "table",
        contractMethod: `${tableName} via ${calleeText}`,
        caller: enclosingFunctionName(ref),
        file: relFile(ref),
        line: ref.getStartLineNumber(),
        coverageClass: classifyCoverage(ref),
      });
    }
  }

  return sites;
}

// ---------- Denominator 2: *Port/*Repo/*Sink/*Store interface methods ----------

function collectPortWriteSites(project: Project): WriteSite[] {
  const sites: WriteSite[] = [];

  const interfaces = project
    .getSourceFiles()
    .filter((sf) => !sf.getFilePath().includes("__tests__") && !sf.getFilePath().endsWith(".test.ts"))
    .flatMap((sf) => sf.getInterfaces())
    .filter((i) => PORT_LIKE_INTERFACE.test(i.getName()));

  const allClasses = project
    .getSourceFiles()
    .filter((sf) => !sf.getFilePath().includes("__tests__") && !sf.getFilePath().endsWith(".test.ts"))
    .flatMap((sf) => sf.getClasses());

  for (const iface of interfaces) {
    const ifaceName = iface.getName();
    const implementors = allClasses.filter((cls) =>
      cls.getImplements().some((impl) => impl.getExpression().getText() === ifaceName)
    );

    for (const method of iface.getMethods()) {
      const methodName = method.getName();
      const nameMatchesReader = READER_PREFIX.test(methodName);

      if (implementors.length === 0) {
        // No resolvable implementation body — classify by name alone.
        if (!nameMatchesReader) {
          sites.push({
            source: "port",
            contractMethod: `${ifaceName}.${methodName}`,
            caller: "(no implementation found in project)",
            file: relFile(method),
            line: method.getStartLineNumber(),
            coverageClass: "unknown",
          });
        }
        continue;
      }

      for (const cls of implementors) {
        const implMethod = cls.getMethod(methodName);
        if (!implMethod) continue; // inherited/mixin — not directly resolvable here

        const body = implMethod.getBody();
        const bodyText = body ? body.getText() : "";
        const hasMutationEvidence = MUTATION_EVIDENCE.some((re) => re.test(bodyText));

        if (!nameMatchesReader || hasMutationEvidence) {
          // The repo/adapter method's own body is never where executeCommand/
          // outbox/ledger orchestration lives — walk UP to its actual callers
          // (across the whole project, resolved via the interface too) and
          // classify each caller's enclosing scope instead. One row per
          // distinct caller — different call sites can have different
          // coverage, so this deliberately does not collapse to one verdict.
          const callSites = findCallSites(implMethod);

          if (callSites.length === 0) {
            sites.push({
              source: "port",
              contractMethod: `${ifaceName}.${methodName}`,
              implementingClass: cls.getName(),
              caller: "(no caller found in project)",
              file: relFile(implMethod),
              line: implMethod.getStartLineNumber(),
              coverageClass: "unknown",
            });
            continue;
          }

          for (const site of callSites) {
            sites.push({
              source: "port",
              contractMethod: `${ifaceName}.${methodName}`,
              implementingClass: cls.getName(),
              caller: enclosingFunctionName(site),
              file: relFile(site),
              line: site.getStartLineNumber(),
              coverageClass: classifyCoverage(site),
            });
          }
        }
      }
    }
  }

  return sites;
}

// ---------- Baseline diff / CI gate ----------

function siteKey(s: WriteSite): string {
  return `${s.contractMethod}::${s.implementingClass ?? ""}::${s.file}`;
}

function runCheck(sites: WriteSite[]): number {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`No baseline at ${path.relative(ROOT, BASELINE_FILE)} — run without --check first to create one.`);
    return 1;
  }
  const baseline: WriteSite[] = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const baselineKeys = new Set(baseline.map(siteKey));
  const currentKeys = new Set(sites.map(siteKey));

  const newUnclassified = sites.filter(
    (s) => !baselineKeys.has(siteKey(s)) && (s.coverageClass === "unknown" || s.coverageClass === "none")
  );
  const disappeared = baseline.filter((s) => !currentKeys.has(siteKey(s)));

  let failed = false;
  if (newUnclassified.length > 0) {
    failed = true;
    console.error(`\n${newUnclassified.length} new mutating write path(s) with no coverage class (none/unknown):`);
    for (const s of newUnclassified) {
      console.error(`  - ${s.contractMethod} (${s.file}:${s.line}) [${s.coverageClass}]`);
    }
  }
  if (disappeared.length > 0) {
    failed = true;
    console.error(`\n${disappeared.length} baseline write path(s) missing from this run (renamed/removed without updating the baseline?):`);
    for (const s of disappeared) {
      console.error(`  - ${s.contractMethod} (${s.file}:${s.line})`);
    }
  }

  if (!failed) {
    console.log("Write-path inventory matches baseline — no new uncovered mutating paths, nothing missing.");
    return 0;
  }
  console.error(
    "\nUpdate scripts/write-path-inventory.baseline.json (rerun with --json > baseline) once these are triaged."
  );
  return 1;
}

// ---------- main ----------

function main() {
  const args = process.argv.slice(2);
  const tableArg = args.find((a) => a.startsWith("--table="))?.split("=")[1];
  const asJson = args.includes("--json");
  const check = args.includes("--check");

  const project = new Project({ tsConfigFilePath: path.join(ROOT, "tsconfig.json") });

  const tableSites = collectTableWriteSites(project, tableArg);
  const portSites = tableArg ? [] : collectPortWriteSites(project);
  const sites = [...tableSites, ...portSites].sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
  );

  if (check) {
    process.exit(runCheck(sites));
  }

  if (asJson) {
    console.log(JSON.stringify(sites, null, 2));
    return;
  }

  console.log(`# Write-path inventory (${sites.length} sites)\n`);
  console.log("| Contract method | Implementing class | Caller | File:Line | Coverage |");
  console.log("|---|---|---|---|---|");
  for (const s of sites) {
    console.log(
      `| ${s.contractMethod} | ${s.implementingClass ?? "—"} | ${s.caller} | ${s.file}:${s.line} | ${s.coverageClass} |`
    );
  }

  const byCoverage = sites.reduce<Record<string, number>>((acc, s) => {
    acc[s.coverageClass] = (acc[s.coverageClass] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n## Summary by coverage class\n`);
  for (const [k, v] of Object.entries(byCoverage)) console.log(`- ${k}: ${v}`);
}

main();
