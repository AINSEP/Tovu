/**
 * Outbox-bridge composition check (report-only; no CI pipeline exists in this repo yet to wire
 * this into as a blocking step — same disclosed posture as `check:inventory`).
 *
 * Background (`ADS-memory/.local-artifacts/agent-reports/20260803-jini-outbox-contract.md`):
 * `@jini-ai/cms` ships three chokepoint families whose write functions declare their OWN narrow
 * `OutboxPort` (`enqueue(event: {name, payload})`), decoupled on purpose from the durable
 * infrastructure adapter's full `DomainEvent` contract (`id`/`workspaceId`/`occurredAt`). Jini
 * ships one bridge function per family — `toEntryOutbox`, `toContentTypeOutbox`,
 * `toTaxonomyOutbox` — that fills in the missing fields before forwarding to the real adapter.
 * Every correct call site wraps the raw adapter with the matching bridge before calling the
 * chokepoint function. `src/widgets/*` did not, at 8 call sites across 4 files, because it never
 * factored a single deps-composer the way every other domain did — two independently-written
 * `widgetsDeps()` helpers both independently omitted the same wrap. That bug is invisible to this
 * repo's test suite: no domain-level test (including ones named `*.integration.test.ts`) exercises
 * the real `SqliteOutboxAdapter` that would have thrown `NOT NULL constraint failed:
 * outbox_events.id` at runtime — every test stubs `outbox` with something that accepts any shape.
 *
 * This script closes that hole statically, without needing the real adapter: it finds every call
 * to a chokepoint function in `src/` (excluding tests, which legitimately stub `outbox` on
 * purpose) and verifies the `outbox` value reaching it is wrapped by the correct bridge call, not
 * a raw pass-through (`deps.outbox`, `routeDeps.outbox`, or equivalent).
 *
 * Deliberately narrow, not a general "does this expression have the right type" checker — TypeScript
 * already does that job and still let this bug through, because a raw adapter structurally satisfies
 * the narrow port's *call signature* under method-parameter bivariance (see the report's evidence
 * item 9). This script instead hard-codes the finite, currently-complete list of chokepoint
 * functions and their required bridge, and flags anything that doesn't visibly route through it —
 * a shape check, not a type check, chosen specifically because it catches what the type system does
 * not. New chokepoint functions/bridges must be added to `CHOKEPOINTS` below by hand; an unknown
 * function is invisible to this script by design (see file header note on scope).
 *
 * Same-file helper indirection is resolved two ways: a `deps: helper(...)` call, and a top-level
 * SPREAD of one inside a literal (`deps: { ...entriesWriteDeps(deps, ws), onWritten: ... }`), up to
 * `MAX_RESOLVE_DEPTH` hops. The spread form was added 2026-08-03: `widgets/write-service.ts` moved
 * to it as part of the outbox fix, and the resolver — which only understood the direct-call form —
 * reported its three correct call sites as UNRESOLVED. Fail-closed produced three false positives
 * on already-correct code, which is exactly the failure mode that erodes trust in a guard; the fix
 * is to teach the resolver the shape, never to relax the default.
 *
 * Anything this script cannot resolve is still reported as UNRESOLVED and treated as a failure
 * (fail closed on the unrecognized shape, per this check's whole reason for existing), not silently
 * passed — see the report's addendum for why a wall of false positives was checked for and not
 * found before choosing this default.
 *
 * Scope note (2026-08-03): this script checks that the bridge is CALLED, not what it is called
 * WITH. The `workspaceId` half of the same bug — the bridges themselves omitted it, so every write
 * threw `NOT NULL constraint failed: outbox_events.workspace_id` — is now enforced by the type
 * system instead: the bridges declare `workspaceId: string` as a required dep and declare it on the
 * wrapped port's event type, so omitting it is a compile error. That half genuinely did not need a
 * shape check; this half still does, because a raw adapter satisfies the narrow port's call
 * signature under method-parameter bivariance and always will.
 *
 * Usage: npx tsx development/scripts/check-outbox-bridge.ts
 *        npx tsx development/scripts/check-outbox-bridge.ts --dir <path>   (scan an alternate
 *        directory instead of `src/` — used to self-test this script against synthetic fixtures
 *        without needing production violations to exist; production behavior is unaffected)
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const dirFlagIndex = process.argv.indexOf("--dir");
const SRC_DIR = dirFlagIndex === -1 ? path.join(REPO_ROOT, "src") : path.resolve(process.argv[dirFlagIndex + 1]);

/** One entry per Jini chokepoint family. `functions` are the exact exported write-function names
 * that require `outbox`; `bridge` is the one adapter call that legitimately produces a value for
 * their narrow `OutboxPort`. Sourced directly from `@jini-ai/cms`'s `entries/write-service.ts`,
 * `content-types/write-service.ts` + `lifecycle.ts`, and `taxonomy/write-service.ts` (verified
 * function-by-function against which ones actually declare/use an `outbox` dep — e.g.
 * `updateContentTypeFields`/`reactivateContentType` deliberately do NOT take one and are excluded). */
const CHOKEPOINTS: { family: string; functions: string[]; bridge: string }[] = [
  { family: "entries", functions: ["createEntry", "updateEntry", "publishEntry", "unpublishEntry"], bridge: "toEntryOutbox" },
  { family: "content-types", functions: ["registerContentType", "deprecateContentType", "tombstoneContentType"], bridge: "toContentTypeOutbox" },
  { family: "taxonomy", functions: ["createTaxonomy", "createTerm", "renameTerm", "assignTerms"], bridge: "toTaxonomyOutbox" },
];

const FUNCTION_TO_BRIDGE = new Map<string, { family: string; bridge: string }>();
for (const { family, functions, bridge } of CHOKEPOINTS) {
  for (const fn of functions) FUNCTION_TO_BRIDGE.set(fn, { family, bridge });
}
const CALL_PATTERN = new RegExp(`\\b(${[...FUNCTION_TO_BRIDGE.keys()].join("|")})\\s*\\(`, "g");

interface Finding {
  kind: "violation" | "unresolved";
  file: string;
  line: number;
  fn: string;
  bridge: string;
  detail: string;
}

/** Walks `src/`, skipping `node_modules`, build output, and test files — test doubles are allowed
 * (expected, even) to stub `outbox` with an accept-anything shape; this check is about production
 * composition code reaching a real adapter, not test isolation. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Returns a same-length string with every `//`/`/* *‍/` comment and every string/template literal
 * blanked out to spaces (newlines preserved so line numbers stay valid). Scanning and
 * bracket-matching both run against this "stripped" copy so comment text (e.g. a doc comment that
 * literally says `-> createEntry (write-service.ts): ...`) can never register as a real call or
 * desync bracket depth; final human-readable snippets are still sliced from the ORIGINAL source at
 * the same indices, since stripping only replaces characters, it never removes them.
 */
function stripCommentsAndStrings(source: string): string {
  const out = source.split("");
  let i = 0;
  while (i < out.length) {
    const ch = out[i];
    const next = out[i + 1];
    if (ch === "/" && next === "/") {
      while (i < out.length && out[i] !== "\n") {
        out[i] = " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < out.length && !(out[i] === "*" && out[i + 1] === "/")) {
        if (out[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < out.length) {
        out[i] = " ";
        out[i + 1] = " ";
        i += 2;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      out[i] = " ";
      i++;
      while (i < out.length && out[i] !== quote) {
        if (out[i] === "\\") {
          out[i] = " ";
          i++;
          if (i < out.length) out[i] = " ";
        } else if (out[i] !== "\n") {
          out[i] = " ";
        }
        i++;
      }
      if (i < out.length) {
        out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Returns the index 1 past `stripped[openIndex]`'s matching close bracket. `stripped` must
 * already have comments/strings blanked (see `stripCommentsAndStrings`) so raw depth counting is
 * safe; `openIndex` must point at one of `( { [`. */
function matchBracketEnd(stripped: string, openIndex: number): number {
  const open = stripped[openIndex];
  const close = open === "(" ? ")" : open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = openIndex; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return stripped.length;
}

/** Extracts the value text of `key:` inside `strippedObjectText` (starting at its own `{`),
 * stopping at the first top-level comma or the object's own closing brace. `originalObjectText`
 * must be the same-length, non-stripped text at the same offsets, used only for the returned
 * snippet. Returns null if `key` isn't found as a top-level property. */
function extractFieldValue(strippedObjectText: string, originalObjectText: string, key: string): string | null {
  const fieldPattern = new RegExp(`(?:^|[{,])\\s*${key}\\s*:`, "g");
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(strippedObjectText))) {
    let depth = 0;
    for (let i = 0; i < match.index; i++) {
      const ch = strippedObjectText[i];
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    if (depth !== 1) continue; // not directly inside the outer `{` (depth 1) — nested, skip

    const valueStart = match.index + match[0].length;
    let i = valueStart;
    let depth2 = 0;
    while (i < strippedObjectText.length) {
      const ch = strippedObjectText[i];
      if (ch === "(" || ch === "{" || ch === "[") depth2++;
      else if (ch === ")" || ch === "]") depth2--;
      else if (ch === "}") {
        if (depth2 === 0) break;
        depth2--;
      } else if (ch === "," && depth2 === 0) {
        break;
      }
      i++;
    }
    return originalObjectText.slice(valueStart, i).trim();
  }
  return null;
}

/** Finds a same-file helper's returned/produced object-literal text (both stripped and original
 * slices, same offsets), resolving `function name(...) { ... return {...}; }` and
 * `const name = (...) => {...}` / `const name = (...) => ({...})` forms. Null if not found. */
function resolveHelperObjectLiteral(
  stripped: string,
  original: string,
  helperName: string
): { stripped: string; original: string } | null {
  const declPattern = new RegExp(`(?:function\\s+${helperName}\\s*\\(|const\\s+${helperName}\\s*=)`);
  const declMatch = declPattern.exec(stripped);
  if (!declMatch) return null;

  const lookahead = stripped.slice(declMatch.index, declMatch.index + 400);
  const exprArrow = /=>\s*\(\s*\{/.exec(lookahead);
  if (exprArrow) {
    const braceIndex = declMatch.index + exprArrow.index + exprArrow[0].length - 1;
    const end = matchBracketEnd(stripped, braceIndex);
    return { stripped: stripped.slice(braceIndex, end), original: original.slice(braceIndex, end) };
  }

  const braceStart = stripped.indexOf("{", declMatch.index);
  if (braceStart === -1) return null;
  const bodyEnd = matchBracketEnd(stripped, braceStart);
  const bodyStripped = stripped.slice(braceStart, bodyEnd);
  const returnMatch = /return\s*\{/.exec(bodyStripped);
  if (!returnMatch) return null;
  const innerBraceIndex = braceStart + returnMatch.index + returnMatch[0].length - 1;
  const end = matchBracketEnd(stripped, innerBraceIndex);
  return { stripped: stripped.slice(innerBraceIndex, end), original: original.slice(innerBraceIndex, end) };
}

/** Names of same-file helpers spread at the TOP level of `strippedObjectText` (its own `{` at
 * index 0), i.e. `{ ...entriesWriteDeps(deps, ws), onWritten }`. Only call-expression spreads are
 * returned — a bare `...deps` spread names no helper to resolve and is reported by the caller as
 * unresolved rather than guessed at. Depth is counted from the object's own brace so nested
 * objects' spreads are ignored. */
function topLevelSpreadHelpers(strippedObjectText: string): string[] {
  const names: string[] = [];
  const pattern = /\.\.\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(strippedObjectText))) {
    let depth = 0;
    for (let i = 0; i < match.index; i++) {
      const ch = strippedObjectText[i];
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    if (depth === 1) names.push(match[1]);
  }
  return names;
}

/** Max same-file helper hops followed when looking for `outbox`. Every real composition site in
 * this repo resolves within 2 (call -> `entriesWriteDeps()` -> its own literal); the cap exists so
 * a mutually-recursive helper pair can never spin this script. */
const MAX_RESOLVE_DEPTH = 4;

/**
 * Finds the `outbox:` value reaching a chokepoint, following top-level spreads of same-file
 * helpers when the object doesn't declare `outbox` directly.
 *
 * This is the shape `src/widgets/write-service.ts` uses — `deps: { ...entriesWriteDeps(deps, ws),
 * onWritten: ... }` — where the bridge lives inside the spread helper, not in the literal. Before
 * this resolution existed the script reported those three call sites as UNRESOLVED (fail-closed),
 * which read as "3 findings" against code that was already correct. Failing closed was the right
 * default; the fix is to teach the resolver the shape, not to relax the default.
 *
 * Returns `{ value }` on success, or `{ unresolvedDetail }` describing why it gave up.
 */
function findOutboxValue(
  stripped: string,
  original: string,
  objStripped: string,
  objOriginal: string,
  depth: number,
  seen: Set<string>
): { value: string } | { unresolvedDetail: string } {
  const direct = extractFieldValue(objStripped, objOriginal, "outbox");
  if (direct !== null) return { value: direct };

  const spreads = topLevelSpreadHelpers(objStripped);
  if (spreads.length === 0) {
    return { unresolvedDetail: "resolved `deps` object has no `outbox:` field and no same-file helper spread to follow (chokepoint requires one)" };
  }
  if (depth >= MAX_RESOLVE_DEPTH) {
    return { unresolvedDetail: `\`outbox\` not found within ${MAX_RESOLVE_DEPTH} same-file helper hops (spreads: ${spreads.join(", ")})` };
  }

  const failures: string[] = [];
  for (const name of spreads) {
    if (seen.has(name)) continue;
    seen.add(name);
    const helper = resolveHelperObjectLiteral(stripped, original, name);
    if (helper === null) {
      failures.push(`spread \`...${name}(...)\` not resolvable in the same file`);
      continue;
    }
    const nested = findOutboxValue(stripped, original, helper.stripped, helper.original, depth + 1, seen);
    if ("value" in nested) return nested;
    failures.push(`via \`...${name}(...)\`: ${nested.unresolvedDetail}`);
  }
  return { unresolvedDetail: `resolved \`deps\` object has no \`outbox:\` field; ${failures.join("; ")}` };
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

function checkFile(original: string, relPath: string): Finding[] {
  const stripped = stripCommentsAndStrings(original);
  const findings: Finding[] = [];
  CALL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CALL_PATTERN.exec(stripped))) {
    const fnName = match[1];
    const { bridge } = FUNCTION_TO_BRIDGE.get(fnName)!;
    const parenIndex = match.index + match[0].length - 1;
    const callArgsEnd = matchBracketEnd(stripped, parenIndex);
    const callArgsStripped = stripped.slice(parenIndex, callArgsEnd);
    const callArgsOriginal = original.slice(parenIndex, callArgsEnd);
    const line = lineOf(original, match.index);

    const depsValue = extractFieldValue(callArgsStripped, callArgsOriginal, "deps");
    if (depsValue === null) {
      findings.push({ kind: "unresolved", file: relPath, line, fn: fnName, bridge, detail: "no `deps:` field found in the call arguments" });
      continue;
    }

    let resolved: { stripped: string; original: string } | null = null;
    if (depsValue.trimStart().startsWith("{")) {
      // Re-locate the object literal within the (stripped) call-args text to get aligned offsets.
      const relOffset = callArgsOriginal.indexOf(depsValue);
      const absOffset = parenIndex + (relOffset === -1 ? 0 : relOffset);
      const objStrippedStart = stripped.indexOf("{", absOffset);
      const objEnd = matchBracketEnd(stripped, objStrippedStart);
      resolved = { stripped: stripped.slice(objStrippedStart, objEnd), original: original.slice(objStrippedStart, objEnd) };
    } else {
      const helperCallMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(depsValue);
      if (helperCallMatch) {
        resolved = resolveHelperObjectLiteral(stripped, original, helperCallMatch[1]);
        if (resolved === null) {
          findings.push({
            kind: "unresolved",
            file: relPath,
            line,
            fn: fnName,
            bridge,
            detail: `\`deps: ${depsValue}\` — helper \`${helperCallMatch[1]}\` not found (or not resolvable) in the same file`,
          });
          continue;
        }
      } else {
        findings.push({ kind: "unresolved", file: relPath, line, fn: fnName, bridge, detail: `\`deps: ${depsValue}\` is neither an object literal nor a same-file helper call` });
        continue;
      }
    }

    const outboxResult = findOutboxValue(stripped, original, resolved.stripped, resolved.original, 1, new Set());
    if ("unresolvedDetail" in outboxResult) {
      findings.push({ kind: "unresolved", file: relPath, line, fn: fnName, bridge, detail: outboxResult.unresolvedDetail });
      continue;
    }
    const outboxValue = outboxResult.value;

    const wrapped = new RegExp(`^${bridge}\\s*\\(`).test(outboxValue);
    if (!wrapped) {
      findings.push({ kind: "violation", file: relPath, line, fn: fnName, bridge, detail: `outbox: ${outboxValue}` });
    }
  }
  return findings;
}

function main(): void {
  const files = collectSourceFiles(SRC_DIR);
  const findings: Finding[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!CALL_PATTERN.test(stripCommentsAndStrings(source))) continue;
    const relPath = path.relative(REPO_ROOT, file);
    findings.push(...checkFile(source, relPath));
  }

  const violations = findings.filter((f) => f.kind === "violation");
  const unresolved = findings.filter((f) => f.kind === "unresolved");

  if (findings.length === 0) {
    console.log("check:outbox-bridge — OK: every chokepoint call site wraps `outbox` with its required bridge.");
    return;
  }

  if (violations.length > 0) {
    console.error(`check:outbox-bridge — ${violations.length} OUTBOX_BRIDGE_SKIPPED finding(s):`);
    for (const f of violations) {
      console.error(`  ${f.file}:${f.line} — \`${f.fn}(...)\` needs \`${f.bridge}(...)\`, got: ${f.detail}`);
    }
  }
  if (unresolved.length > 0) {
    console.error(`check:outbox-bridge — ${unresolved.length} UNRESOLVED finding(s) (failing closed — verify by hand):`);
    for (const f of unresolved) {
      console.error(`  ${f.file}:${f.line} — \`${f.fn}(...)\`: ${f.detail}`);
    }
  }
  console.error("\nFix: wrap the raw outbox adapter with the named bridge before it reaches the chokepoint call, e.g. `outbox: toEntryOutbox(deps)` (see server/routes/admin/entries/create.ts for the reference pattern).");
  process.exitCode = 1;
}

main();
