import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_CAPABILITIES } from "@jini-ai/agentic";
import { SITE_ASSISTANT_TOOL_SCHEMAS } from "../tools.js";
import { googleParametersOf } from "@jini-ai/agent-runtime/providers/tool-turn";
import { buildSiteGuideRegistrations, VISITOR_SITE_GUIDE_SCHEMA } from "#src/server/runtime/composition/site-guide-tools";

// 2026-11-03, live tovu.dev: every visitor chat on a Gemini site failed before answering —
// "GenerateContentRequest.tools[0].function_declarations[3].parameters.properties[topic].items:
// field predicate failed: $type == Type.ARRAY". Gemini's function declarations take a single
// `type` per schema and `items` only on arrays; one bad tool rejects the whole request. Every
// schema a visitor can be offered must therefore stay inside that subset.
const ALLOWED = new Set(["type", "description", "enum", "properties", "required", "items", "minItems", "maxItems",
  "minLength", "maxLength", "minimum", "maximum", "format", "nullable", "additionalProperties", "pattern", "default"]);

function problems(schema: unknown, path: string): string[] {
  if (!schema || typeof schema !== "object") return [];
  const node = schema as Record<string, unknown>;
  const found: string[] = [];
  if (Array.isArray(node.type)) found.push(`${path}: type is a list ${JSON.stringify(node.type)}`);
  if (node.items !== undefined && node.type !== "array") found.push(`${path}: items on a non-array (${JSON.stringify(node.type)})`);
  for (const key of Object.keys(node)) if (!ALLOWED.has(key)) found.push(`${path}: keyword ${key}`);
  for (const [name, child] of Object.entries((node.properties ?? {}) as Record<string, unknown>)) found.push(...problems(child, `${path}.${name}`));
  if (node.items) found.push(...problems(node.items, `${path}[]`));
  return found;
}

test("every schema offered to site visitors fits Gemini's function-declaration subset", () => {
  const offered = [
    ...SITE_ASSISTANT_TOOL_SCHEMAS.map(schema => ({ name: schema.name, parameters: schema.parameters })),
    ...PAGE_CAPABILITIES.map(capability => ({ name: capability.id, parameters: capability.inputSchema })),
    { name: "site_guide", parameters: VISITOR_SITE_GUIDE_SCHEMA },
  ];
  assert.deepEqual(offered.flatMap(schema => problems(schema.parameters, schema.name)), []);
});

// 2026-11-09, live tovu.dev admin chat on Gemini: describe_tool publishes site_guide to the next
// request, and that turn ended with no reply, while describing a plain-schema tool answered normally.
test("the admin site_guide entry stays inside Gemini's subset after the real provider projection", () => {
  const { descriptor } = buildSiteGuideRegistrations({ deps: {} as never })[0]!;
  const parameters = googleParametersOf({ descriptor });
  assert.deepEqual(problems(parameters, "site_guide"), []);
});
