/**
 * tool-guide-collect.ts — reads the model-facing strings out of source files for `check-tool-guides.ts`,
 * with the TypeScript compiler API (never a regex over source), and walks JSON-schema `description`s.
 *
 * Three readers, one per way a string is known to reach a model (tool-call-fixes S4a):
 * `registryTexts` (a booted descriptor), `localToolTexts` (the `name`/`description` of MCP-local tool
 * objects and the `INSTRUCTIONS` constant) and `literalTexts` (every string or template chunk of a
 * declared guide module). Plain-text content files (`.md`, `.json`) are one text each.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";

import type { GuideSource, GuideSourceKind } from "./tool-guide-scan.js";

/** The registry's view of one tool; only what the scan reads. */
export interface DescriptorText {
  readonly id: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Every `description` string in a JSON schema, with the dotted property path it sits at. Depth-bounded. */
function schemaDescriptions({ schema, path, depth }: { schema: unknown; path: string; depth: number }): { path: string; text: string }[] {
  if (!isRecord(schema) || depth > 8) return [];
  const own = typeof schema.description === "string" ? [{ path, text: schema.description }] : [];
  const children = Object.entries(schema).flatMap(([key, value]) => {
    if (key === "properties" && isRecord(value)) {
      return Object.entries(value).flatMap(([name, property]) => schemaDescriptions({ schema: property, path: `${path}.${name}`, depth: depth + 1 }));
    }
    if (Array.isArray(value)) return value.flatMap((item, index) => schemaDescriptions({ schema: item, path: `${path}[${index}]`, depth: depth + 1 }));
    return key === "description" ? [] : schemaDescriptions({ schema: value, path: `${path}.${key}`, depth: depth + 1 });
  });
  return [...own, ...children];
}

/** Every property name declared anywhere in a JSON schema (an argument or an alias, never a tool). */
export function schemaPropertyNames({ schema, depth = 0 }: { schema: unknown; depth?: number }): string[] {
  if (!isRecord(schema) || depth > 8) return [];
  return Object.entries(schema).flatMap(([key, value]) => {
    if (key === "properties" && isRecord(value)) {
      return Object.entries(value).flatMap(([name, property]) => [name, ...schemaPropertyNames({ schema: property, depth: depth + 1 })]);
    }
    return Array.isArray(value) ? value.flatMap((item) => schemaPropertyNames({ schema: item, depth: depth + 1 })) : schemaPropertyNames({ schema: value, depth: depth + 1 });
  });
}

/** Source A: each descriptor's `description` and every schema `description`, one text each. */
export function registryTexts({ descriptors }: { readonly descriptors: readonly DescriptorText[] }): GuideSource[] {
  return descriptors.flatMap(({ id, description, inputSchema }) => [
    ...(description === undefined ? [] : [{ path: `registry:${id}.description`, kind: "registry" as const, text: description }]),
    ...schemaDescriptions({ schema: inputSchema, path: "inputSchema", depth: 0 }).map(({ path, text }) => ({ path: `registry:${id}.${path}`, kind: "registry" as const, text })),
  ]);
}

/** The text of a string-like node, or `undefined`: a literal, a template chunk, or `'a' + 'b'` joined. */
function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return literalText(node.expression);
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return undefined;
  const left = literalText(node.left);
  const right = literalText(node.right);
  return left === undefined || right === undefined ? undefined : left + right;
}

const lineOf = ({ file, node }: { file: ts.SourceFile; node: ts.Node }): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

function parse({ path, text }: { path: string; text: string }): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Calls `visit` for every node below `root`, parents first. */
function walk({ root, visit }: { root: ts.Node; visit: (node: ts.Node) => void }): void {
  visit(root);
  ts.forEachChild(root, (child) => walk({ root: child, visit }));
}

/** The string chunks one node contributes: a literal, a binary-joined literal, or the chunks of a template. */
function chunksOf(node: ts.Node): string[] {
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  const text = literalText(node);
  return text === undefined ? [] : [text];
}

/** Source C: every string literal and template chunk of one TypeScript file, except import/export specifiers. */
export function literalTexts({ path, text, kind }: { path: string; text: string; kind: GuideSourceKind }): GuideSource[] {
  const file = parse({ path, text });
  const found: GuideSource[] = [];
  walk({ root: file, visit: (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    for (const chunk of chunksOf(node)) found.push({ path: `${path}:${lineOf({ file, node })}`, kind, text: chunk });
  } });
  return found;
}

/** The initializer node of a property named `name`/`description`, or of a const named `INSTRUCTIONS`. */
function modelFacingInitializer(node: ts.Node): ts.Node | undefined {
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && (node.name.text === "name" || node.name.text === "description")) return node.initializer;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "INSTRUCTIONS") return node.initializer;
  return undefined;
}

/** Source B: `name`/`description` values and the `INSTRUCTIONS` constant of MCP-local tool files, and the `name` values found. */
export function localToolTexts({ path, text }: { path: string; text: string }): { texts: GuideSource[]; names: string[] } {
  const file = parse({ path, text });
  const texts: GuideSource[] = [];
  const names: string[] = [];
  walk({ root: file, visit: (node) => {
    const initializer = modelFacingInitializer(node);
    if (initializer === undefined) return;
    for (const chunk of chunksOf(initializer)) texts.push({ path: `${path}:${lineOf({ file, node })}`, kind: "mcp-local", text: chunk });
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "name") {
      const name = literalText(initializer);
      if (name !== undefined && /^[a-z][a-z0-9_]*$/.test(name)) names.push(name);
    }
  } });
  return { texts, names };
}

/** A guide module as one or many texts: TypeScript by literal, Markdown whole, JSON by its string values. */
export function guideModuleTexts({ path, absolute }: { path: string; absolute: string }): GuideSource[] {
  const text = readFileSync(absolute, "utf8");
  if (path.endsWith(".md")) return [{ path, kind: "guide", text }];
  if (path.endsWith(".json")) return [...jsonStrings({ value: JSON.parse(text) as unknown })].map((value) => ({ path, kind: "guide" as const, text: value }));
  return literalTexts({ path, text, kind: "guide" });
}

function* jsonStrings({ value }: { value: unknown }): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* jsonStrings({ value: item });
  else if (isRecord(value)) for (const item of Object.values(value)) yield* jsonStrings({ value: item });
}
