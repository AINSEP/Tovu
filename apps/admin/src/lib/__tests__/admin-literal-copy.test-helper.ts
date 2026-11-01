import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Test-only syntax guard; runtime translation remains owned by the existing translators. */
export type LiteralCopy = { file: string; line: number; kind: string; text: string };

const VISIBLE_PROPS = new Set([
  "aria-label", "aria-description", "aria-placeholder", "aria-roledescription", "aria-valuetext",
  "title", "placeholder", "alt", "label", "description", "helperText", "emptyMessage", "loadingMessage", "emptyDescription",
]);
const EXCLUDED_DIRECTORIES = new Set([
  "__tests__", "__mocks__", "__fixtures__", "fixtures", "tests", "test", "node_modules", "devtools",
]);

/** Select production TS/JS sources. Dictionaries, fixtures and fake ports carry data, not UI.
 * O(path length); pure. */
export function isCopySource({ file }: { file: string }, _options = {}): boolean {
  const parts = file.split(/[\\/]/);
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) return false;
  if (!/\.[cm]?[jt]sx?$/.test(file)) return false;
  return !/(?:\.d\.ts$|-i18n\.[jt]sx?$|(?:^|[./-])(?:test|spec|stories|story|fixture|fake|in-memory)(?:[./-]|$))/.test(file);
}

/** Only expressions that can themselves produce visible strings, never call arguments or tests.
 * O(expression nodes + literal length) time/space; pure. */
function literalParts(node: ts.Node, parts: Array<{ node: ts.Node; text: string }> = []): Array<{ node: ts.Node; text: string }> {
  // One local accumulator avoids repeatedly copying nested concatenation/template branches.
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) parts.push({ node, text: node.text });
  else if (ts.isTemplateExpression(node)) {
    parts.push({ node: node.head, text: node.head.text });
    for (const span of node.templateSpans) {
      literalParts(span.expression, parts);
      parts.push({ node: span.literal, text: span.literal.text });
    }
  }
  else if (ts.isConditionalExpression(node)) {
    literalParts(node.whenTrue, parts);
    literalParts(node.whenFalse, parts);
  }
  else if (ts.isBinaryExpression(node)) binaryParts(node, parts);
  else if (ts.isArrayLiteralExpression(node)) node.elements.forEach((element) => literalParts(element, parts));
  else wrappedParts(node, parts);
  return parts;
}

/** Unwrap expression syntax; identifiers and calls need data-flow analysis and are out of scope. */
function wrappedParts(node: ts.Node, parts: Array<{ node: ts.Node; text: string }>): void {
  if (ts.isJsxExpression(node)) {
    if (node.expression) literalParts(node.expression, parts);
  }
  else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    literalParts(node.expression, parts);
  }
}

/** Comparisons produce booleans, whereas concatenation and fallbacks can render their operands. */
function binaryParts(node: ts.BinaryExpression, parts: Array<{ node: ts.Node; text: string }>): void {
  const operator = node.operatorToken.kind;
  if (operator === ts.SyntaxKind.AmpersandAmpersandToken) literalParts(node.right, parts);
  else if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(operator)) {
    literalParts(node.left, parts);
    literalParts(node.right, parts);
  }
}

/** Identify a JSX string sink, including custom component accessibility/display props. */
function sinkKind(node: ts.Node): string | undefined {
  if (ts.isJsxText(node)) return "text";
  if (ts.isJsxAttribute(node) && VISIBLE_PROPS.has(node.name.getText())) return node.name.getText();
  if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) return "expression";
  return undefined;
}

/** Parse copy at JSX sinks without executing application modules. O(source length) time/space.
 * Punctuation/numbers are not prose; exact brands/protocols use site-specific baseline entries. */
export function findLiteralCopy({ file, source }: { file: string; source: string }, _options = {}): LiteralCopy[] {
  if (!isCopySource({ file })) return [];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings: LiteralCopy[] = [];
  function visit(node: ts.Node): void {
    const kind = sinkKind(node);
    if (kind) {
      const value = ts.isJsxAttribute(node) ? node.initializer : node;
      for (const part of value ? literalParts(value) : []) {
        const text = part.text.replace(/\s+/g, " ").trim();
        if (/\p{L}/u.test(text)) {
          findings.push({ file, line: parsed.getLineAndCharacterOfPosition(part.node.getStart(parsed)).line + 1, kind, text });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return findings;
}

/** Read production files under an explicit root; no symlinks or installed/generated trees.
 * O(total source bytes) time/space, synchronous test-only filesystem I/O; read failures propagate. */
export function scanCopySources({ root, directory }: { root: string; directory: string }, _options = {}): LiteralCopy[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) return [];
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return scanCopySources({ root, directory: full });
    const file = path.relative(root, full).split(path.sep).join("/");
    if (!entry.isFile() || !isCopySource({ file })) return [];
    return findLiteralCopy({ file, source: readFileSync(full, "utf8") });
  });
}

/** File + sink + normalized literal + multiplicity ratchet. Lines are diagnostic only, so fixes
 * and line shifts pass, while an extra identical literal fails. O(actual + baseline) time/space.
 * Pure; never mutates inputs. Remove resolved baseline entries during translation reviews. */
export function newLiteralCopy({ actual, baseline }: { actual: readonly LiteralCopy[]; baseline: readonly LiteralCopy[] }, _options = {}): LiteralCopy[] {
  const remaining = new Map<string, number>();
  const key = (site: LiteralCopy) => JSON.stringify([site.file, site.kind, site.text]);
  for (const site of baseline) remaining.set(key(site), (remaining.get(key(site)) ?? 0) + 1);
  return actual.filter((site) => {
    const count = remaining.get(key(site)) ?? 0;
    if (count === 0) return true;
    remaining.set(key(site), count - 1);
    return false;
  });
}
