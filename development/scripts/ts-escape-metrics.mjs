#!/usr/bin/env node
/**
 * AST-accurate count of TypeScript type-escape hatches: `any` in type position and
 * non-null assertions (`!`).
 *
 * Exists because a regex-based count on this codebase was found (2026-08-28 swarm debate,
 * verified independently by 3 reviewers) to badly overcount `any` — `\bany\b` matches the
 * English word "any" in comments/strings/prose, not just the TypeScript keyword, and the repo
 * is ~37% comment lines. Every replacement candidate tried during that debate that was ALSO a
 * regex (even a comment-stripped one) was independently found wrong by a later reviewer. Only
 * a real TypeScript-AST walk is trusted for THESE two — that is what this script does.
 *
 * Deliberately does NOT cover `@ts-ignore`/`@ts-expect-error` (2026-08-29, caught in review): an
 * earlier version of this script tried to AST-walk comment trivia for those too and introduced 4
 * new bugs (non-global regex under-counting multi-directive comments, wrong line numbers, counting
 * PROSE ABOUT the directive as a real one, missing at least one genuine directive) — worse than the
 * plain grep it was meant to replace. `@ts-ignore`/`@ts-expect-error` are unambiguous literal
 * tokens that don't occur in English prose the way "any" does, so a grep for them (still done in
 * `code-metrics.py`'s `grep_counts()`) was never the broken half of the original metric. Do not
 * re-add a comment-trivia walker here without a real fix for all 4 of those failure modes.
 *
 * Every file is tagged `is_test` (matches `code-metrics.py`'s own `TEST_PATH_RE`) so callers can
 * report production vs. test counts separately — an earlier version silently mixed them into one
 * unlabeled total, which was flagged for being exactly the kind of unearned-confidence number this
 * whole rewrite exists to stop producing (2026-08-29 review).
 *
 * Usage: node development/scripts/ts-escape-metrics.mjs <target-dir>
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const TEST_PATH_RE = /(^|\/)(__tests__|__mocks__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".vite") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function scanFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);

  const hits = { explicitAny: [], nonNullAssertion: [] };

  function lineOf(pos) {
    return source.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      hits.explicitAny.push(lineOf(node.getStart(source)));
    }
    if (ts.isNonNullExpression(node)) {
      hits.nonNullAssertion.push(lineOf(node.getStart(source)));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  return hits;
}

function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    process.stderr.write("usage: ts-escape-metrics.mjs <target-dir>\n");
    process.exit(2);
  }
  const files = walk(path.resolve(target), []);
  const totals = { explicit_any: 0, non_null_assertion: 0 };
  const totalsProduction = { explicit_any: 0, non_null_assertion: 0 };
  const totalsTest = { explicit_any: 0, non_null_assertion: 0 };
  const byFile = [];
  for (const f of files) {
    const rel = path.relative(process.cwd(), f);
    const isTest = TEST_PATH_RE.test(rel);
    const hits = scanFile(f);
    totals.explicit_any += hits.explicitAny.length;
    totals.non_null_assertion += hits.nonNullAssertion.length;
    const bucket = isTest ? totalsTest : totalsProduction;
    bucket.explicit_any += hits.explicitAny.length;
    bucket.non_null_assertion += hits.nonNullAssertion.length;
    if (hits.explicitAny.length || hits.nonNullAssertion.length) {
      byFile.push({
        file: rel,
        is_test: isTest,
        explicit_any: hits.explicitAny,
        non_null_assertion: hits.nonNullAssertion,
      });
    }
  }
  const result = {
    files_scanned: files.length,
    totals,
    totals_production: totalsProduction,
    totals_test: totalsTest,
    by_file: byFile,
  };
  process.stdout.write(JSON.stringify(result));
}

main();
