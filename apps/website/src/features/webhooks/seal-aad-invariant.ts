import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/**
 * @file Enforces, as a repo-scanning static check, that no production call to
 * `SecretSealerPort.seal()` under `apps/website/src` omits `aad`.
 *
 * ## The gap this closes
 * `ports.ts`'s own header documents `aad` as optional at the PORT level, on purpose: the sealer is
 * a general-purpose AEAD primitive (see `secret-sealer.aesgcm.test.ts`'s "backward compatibility: a
 * value sealed with no aad still opens with no aad" case), and a hypothetical table with no natural
 * row identity to bind is explicitly allowed to seal with none. That is the right call for the
 * PRIMITIVE. It is the wrong call for CREDENTIAL STORES specifically: every credential-shaped table
 * in this codebase has an obvious identity to bind (workspace + provider + credential id, at
 * minimum), and the 2026-09-02 audit found `external_mcp_servers` had shipped sealing OAuth tokens
 * with no `aad` for exactly that reason — nothing enforced that every store actually uses the
 * binding the primitive makes available. This file is that enforcement, layered ON TOP of the
 * deliberately-permissive primitive rather than changing it: `SecretSealerPort.seal()`'s `aad`
 * parameter stays optional (removing the `?` would also invalidate the sealer's own documented
 * backward-compatibility contract and its regression test), and this check instead makes "every
 * ACTUAL call site in this codebase happens to always pass aad" an enforced fact instead of an
 * unenforced accident.
 *
 * ## Why an AST scan, not a type-level port change
 * See above — the port's optionality is a deliberate, tested, documented design choice for the
 * primitive, not an oversight. Narrowing it to `aad: string` would contradict that design and break
 * `secret-sealer.aesgcm.test.ts`'s own backward-compatibility test. The invariant this codebase
 * actually wants ("every CREDENTIAL STORE call site passes aad") is a policy about call sites, not
 * about the primitive's shape, so it belongs in a call-site check, not the type.
 *
 * ## Why an AST scan, not a one-line grep
 * A single-line regex on `.seal(` misses any call whose arguments span multiple lines —
 * `connector-credential-store.ts`'s `sealCredentials` helper is exactly this shape, and is the
 * concrete case that produced a wrong AAD count earlier in this effort. This walks the real
 * `ts.SourceFile` AST (same technique `ts-escape-metrics.mjs` already uses in this repo for
 * AST-accurate `any`/non-null-assertion counts) so call-site shape and formatting can never hide an
 * argument from it.
 *
 * ## Scope and precision trade-off
 * This matches every `CallExpression` whose callee is a property access named exactly `seal`,
 * anywhere under `apps/website/src` (excluding test files) — NOT resolved through the type checker
 * against `SecretSealerPort` specifically. That is a deliberate simplicity/robustness trade-off, not
 * an oversight: a full `ts.Program` + checker resolution would be strictly more precise (it could
 * tell a `SecretSealerPort.seal()` call apart from an unrelated future `.seal()` method on some
 * other type), but building a type-checked program over this monorepo's workspace-linked
 * `@jini-ai/*` packages is slower and more failure-prone than this check needs to be, and — checked
 * at the time this was written (`grep -rn "seal(" apps/website/src`, cross-referenced against every
 * real call site) — `SecretSealerPort.seal` is the ONLY `.seal(` method call anywhere in
 * `apps/website/src` today. The failure direction if that ever stops being true is a FALSE POSITIVE
 * (an unrelated `.seal()` gets flagged and needs an explicit exemption), never a false negative on
 * an actual credential-sealing call — the safe direction for a security gate to fail in.
 *
 * ## What counts as a violation
 * A matched call whose single argument is an object literal with:
 *   - no `aad` property at all (`reason: "missing-aad"`), or
 *   - an `aad` property whose value is the literal identifier `undefined`
 *     (`reason: "aad-literally-undefined"`).
 * A matched call whose argument is NOT a single plain object literal — built via a spread, passed
 * as a pre-built variable, or anything else this scan can't statically see into — is fail-closed
 * reported as `"unresolved-argument-shape"` rather than silently treated as compliant. Every one of
 * the 11 real `.seal()` call sites in this codebase today passes a literal object inline, so this
 * fail-closed branch has zero real hits currently; a future call site would have to actively choose
 * a shape this scan can't see through, and gets flagged rather than waved past by default.
 *
 * `open()` is deliberately NOT covered here: its `aad` stays conditional on each row's own
 * `aadVersion`/`oauthAadVersion` field so legacy pre-migration rows (sealed before this codebase
 * required aad) can still be decrypted — see each store's own `sealCredentials`/`openCredentials`
 * pair. Enforcing "always pass aad" on `open()` would break that legitimate backward-compatibility
 * path, not catch a bug.
 *
 * Usage: npx tsx apps/website/src/features/webhooks/seal-aad-invariant.ts
 * Exit codes: 0 = every `.seal()` call site under scope supplies `aad`. 1 = at least one does not,
 *             or has a shape this scan can't verify.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const DEFAULT_SCAN_ROOT = path.join(REPO_ROOT, "apps", "website", "src");

function isTestFile(file: string): boolean {
  return /__tests__|\.test\.|\.spec\./.test(file);
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !isTestFile(full)) out.push(full);
  }
  return out;
}

export interface SealViolation {
  /** Repo-root-relative path (real-scan mode) or the caller-supplied display path (unit-test mode). */
  file: string;
  /** 1-based line number of the call expression's start. */
  line: number;
  /** The call expression's source text, whitespace-collapsed to one line for reporting. */
  text: string;
  reason: "missing-aad" | "aad-literally-undefined" | "unresolved-argument-shape";
}

/**
 * Core per-file scanner, unit-testable directly against synthetic source text (no filesystem, no
 * `ts.Program`). Finds every `<expr>.seal(...)` call and checks its argument shape.
 *
 * @complexity O(n) single AST walk, n = node count in the parsed file.
 */
export function findSealCallsInSource(sourceText: string, displayPath: string): SealViolation[] {
  const scriptKind = displayPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(displayPath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const violations: SealViolation[] = [];

  function lineOf(pos: number): number {
    return source.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "seal") {
      const violation = checkSealCallArguments(node, source, displayPath, lineOf);
      if (violation) violations.push(violation);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  return violations;
}

function checkSealCallArguments(
  call: ts.CallExpression,
  source: ts.SourceFile,
  displayPath: string,
  lineOf: (pos: number) => number,
): SealViolation | null {
  const line = lineOf(call.getStart(source));
  const text = call.getText(source).replace(/\s+/g, " ").trim();

  if (call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0])) {
    return { file: displayPath, line, text, reason: "unresolved-argument-shape" };
  }

  for (const prop of call.arguments[0].properties) {
    if (ts.isSpreadAssignment(prop)) {
      // Can't statically know whether the spread includes `aad` — fail closed rather than guess.
      return { file: displayPath, line, text, reason: "unresolved-argument-shape" };
    }
    if (!prop.name || !ts.isIdentifier(prop.name) || prop.name.text !== "aad") continue;
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer) && prop.initializer.text === "undefined") {
      return { file: displayPath, line, text, reason: "aad-literally-undefined" };
    }
    return null; // `aad` present with a real value, or shorthand `{ aad }` — compliant.
  }

  return { file: displayPath, line, text, reason: "missing-aad" };
}

/** Real-repo scan: every non-test `.ts`/`.tsx` file under `scanRoot`, reported paths relative to
 * the repo root. Defaults to `apps/website/src` — the only surface `SecretSealerPort.seal()` is
 * called from today. */
export function findSealCallsWithoutAad(scanRoot: string = DEFAULT_SCAN_ROOT): SealViolation[] {
  const violations: SealViolation[] = [];
  for (const file of collectTsFiles(scanRoot)) {
    const sourceText = fs.readFileSync(file, "utf8");
    violations.push(...findSealCallsInSource(sourceText, path.relative(REPO_ROOT, file)));
  }
  return violations;
}

function main(): void {
  const violations = findSealCallsWithoutAad();

  if (violations.length === 0) {
    console.log("check:seal-aad — OK: every SecretSealerPort.seal() call site under apps/website/src supplies aad.");
    return;
  }

  console.error(`check:seal-aad — ${violations.length} .seal() call site(s) do not verifiably supply aad:`);
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} [${v.reason}] ${v.text}`);
  }
  console.error(`\nEvery credential store's seal() call must pass its own row-identity aad (see any of the\nexisting */aad.ts helpers for the pattern) — or, if this really is a call this scan can't see\nthrough safely, resolve it explicitly rather than leaving it unresolved.`);
  process.exit(1);
}

// Guarded, matching `check-theme-replaced-elements.ts`/`check-src-complexity-drift.ts`: this file's
// exported functions are imported directly by `__tests__/seal-aad-invariant.test.ts`, and an
// unguarded `main()` would scan the real repo (and `process.exit(1)` if it ever regresses) as a
// side effect of that import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
