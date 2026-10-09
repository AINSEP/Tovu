import { ToolInputError, type ToolHandler, type ToolRegistration } from "@jini-ai/core";

/**
 * @file One generic batch shape, `items: [...]`, for the tools an import or a theme build calls
 * many times in a row (owner, 2026-10-08: a site import made 8 `content_post_create`, 7
 * `web_fetch_page`, 7 `theme_read_file` and 6 `theme_import_file_from_url` calls one by one, each
 * its own card). A listed tool keeps its id, its single-call input and its result; it ALSO accepts
 * `{ ...sharedFields, items: [ {...}, ... ] }` and runs the item inputs in order in ONE call, so
 * one call is one card.
 *
 * Why the same tool ids, not a `*_bulk` tool per resource or one `batch_run(toolId, items)` tool:
 * a second id per resource is a parallel path that would need its own permission, approval class,
 * search entry and card, and a generic dispatcher tool would need an approval class covering every
 * tool it can reach. Extending the existing ids keeps all of that exactly as it is.
 *
 * Ordering (see `tool-registrations.ts`): applied AFTER the approval policy, so the wrapped handler
 * is the approved one and every item is classified (and, for a class that asks, confirmed) on its
 * own input. Applied before it, a batch would be classified on the top-level fields alone, and an
 * item with `status: "published"` inside `items` would be classified as a plain edit. Permission
 * checks stay inside each domain handler, which runs once per item exactly as for a single call.
 *
 * Items run sequentially, never in parallel: several items may touch the same file or theme (two
 * edits to one stylesheet must apply in order), and a fetch batch to one host stays inside
 * `web_fetch_page`'s per-host politeness limit instead of bursting.
 *
 * NEEDS-JINI: this is a pure `ToolRegistration` transform with no Tovu dependency, a sibling of
 * Jini's `applyApprovalPolicy`; move it to `@jini-ai/core` when that package is next touched.
 */

/** One tool that accepts `items`. `itemDefaults` sit under the caller's own fields: a batch that
 *  returns every item's full body could overflow one tool result, so a reader can default to a
 *  smaller window per item that the caller may still raise. */
export interface BatchableTool {
  readonly toolId: string;
  readonly maxItems?: number;
  readonly itemDefaults?: Readonly<Record<string, unknown>>;
}

/** Used when a {@link BatchableTool} names no `maxItems`. */
export const DEFAULT_MAX_BATCH_ITEMS = 25;

/**
 * The high-volume tools of a site import and a theme build. Screenshots stay out: their result is
 * an image the transport delivers from a single call's top-level result.
 */
export const BATCHABLE_TOOLS: readonly BatchableTool[] = [
  { toolId: "content_post_create" },
  { toolId: "content_post_update" },
  { toolId: "pages_write_html" },
  { toolId: "media_import_from_url" },
  { toolId: "theme_import_file_from_url" },
  { toolId: "theme_read_file", maxItems: 20 },
  { toolId: "theme_write_file" },
  { toolId: "theme_edit_file" },
  // 10 pages x 8,000 characters keeps one result near what a single default fetch used to return.
  { toolId: "web_fetch_page", maxItems: 10, itemDefaults: { maxChars: 8_000 } },
];

/** One item's outcome. `error` is the domain's own message without the appended input schema,
 *  which the tool already publishes and which would otherwise repeat once per failed item. */
export type BatchItemResult =
  | { readonly index: number; readonly ok: true; readonly result: unknown }
  | { readonly index: number; readonly ok: false; readonly error: string };

/** What a batch call returns. A failed item never stops the ones after it. */
export interface BatchResult {
  readonly batch: true;
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly results: readonly BatchItemResult[];
}

/** A JSON object: not null, not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ObjectSchema {
  readonly type?: unknown;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

/**
 * The descriptor a batchable tool publishes: its own schema plus an `items` array, its top-level
 * `required` list moved into the `items` description (a batch call sets those per item or once at
 * the top level), and one sentence appended to its description.
 *
 * @param required.descriptor - The tool's registered descriptor.
 * @param required.tool - Its batch settings.
 * @returns A new descriptor; the input is not mutated.
 * @throws {Error} If the tool publishes no object schema, or already has an `items` property
 * (the batch field would shadow it) — both developer errors caught at composition time.
 * @complexity O(p) in the schema's top-level property count.
 */
export function batchDescriptorFor(
  { descriptor, tool }: { descriptor: ToolRegistration["descriptor"]; tool: BatchableTool },
  _optional: Record<string, never> = {},
): ToolRegistration["descriptor"] {
  const schema = descriptor.inputSchema as ObjectSchema | undefined;
  if (!isPlainObject(schema) || !isPlainObject(schema.properties)) {
    throw new Error(`batch-tool-inputs.ts: '${descriptor.id}' publishes no object inputSchema, so it cannot take items`);
  }
  if (Object.hasOwn(schema.properties, "items")) {
    throw new Error(`batch-tool-inputs.ts: '${descriptor.id}' already has an 'items' input, so the batch field would shadow it`);
  }
  const maxItems = tool.maxItems ?? DEFAULT_MAX_BATCH_ITEMS;
  const requiredFields = schema.required ?? [];
  const { required: _required, ...rest } = schema;
  const needs = requiredFields.length > 0 ? ` Each item needs ${requiredFields.join(", ")} (here or once at the top level).` : "";
  const items = {
    type: "array",
    minItems: 1,
    maxItems,
    description:
      `Batch: up to ${maxItems} inputs run in ONE call, in order. Each item takes the same fields as a single call; ` +
      `fields set at the top level apply to every item, and an item's own value wins.${needs}`,
    items: { type: "object", description: "One item: the same fields as a single call of this tool." },
  };
  return {
    ...descriptor,
    description:
      `${descriptor.description ?? ""} Batch: to do several at once, pass items: [{...}, ...] (up to ${maxItems}) in ONE call instead of one call per item. ` +
      "Returns { batch: true, total, succeeded, failed, results: [{ index, ok, result | error }] }; one item's failure does not stop the others.",
    inputSchema: { ...rest, properties: { ...schema.properties, items } },
  };
}

/** The domain message without `withSchemaOnRejection`'s appended schema. */
function itemErrorMessage({ error, toolId }: { error: unknown; toolId: string }): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(` Schema for '${toolId}': `)[0] ?? message;
}

/** Validates the batch half of an input and returns its items, or throws a caller-actionable error. */
function readItems({ items, toolId, maxItems }: { items: unknown; toolId: string; maxItems: number }): readonly Record<string, unknown>[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ToolInputError({ message: `${toolId}: 'items' must be a non-empty array of inputs` });
  }
  if (items.length > maxItems) {
    throw new ToolInputError({ message: `${toolId}: 'items' has ${items.length} entries; the most one call takes is ${maxItems}. Split them into several calls.` });
  }
  const bad = items.findIndex((item) => !isPlainObject(item));
  if (bad !== -1) throw new ToolInputError({ message: `${toolId}: items[${bad}] must be an object of this tool's input fields` });
  return items as Record<string, unknown>[];
}

/**
 * Wraps one registration so its handler also accepts `items`. An input without an `items` key goes
 * to the original handler untouched, so every existing single call behaves exactly as before.
 *
 * @param required.registration - The registration to extend (already approval-wrapped).
 * @param required.tool - Its batch settings.
 * @returns The registration with {@link batchDescriptorFor}'s descriptor and a batch-aware handler.
 * @throws {Error} At composition time, per {@link batchDescriptorFor}. The returned handler throws
 * {@link ToolInputError} for a malformed `items`, and `AbortError` if the call is cancelled between
 * items; an item's own failure is reported in its result instead.
 * @complexity O(n) sequential original-handler calls for n items.
 */
export function withBatchInput(
  { registration, tool }: { registration: ToolRegistration; tool: BatchableTool },
  _optional: Record<string, never> = {},
): ToolRegistration {
  const toolId = registration.descriptor.id;
  const maxItems = tool.maxItems ?? DEFAULT_MAX_BATCH_ITEMS;
  const original = registration.handler;
  const handler: ToolHandler = async (ctx, options) => {
    if (!isPlainObject(ctx.input) || !Object.hasOwn(ctx.input, "items")) return original(ctx, options);
    const { items: rawItems, ...shared } = ctx.input;
    const items = readItems({ items: rawItems, toolId, maxItems });
    const results: BatchItemResult[] = [];
    for (const [index, item] of items.entries()) {
      ctx.signal.throwIfAborted();
      const input = { ...tool.itemDefaults, ...shared, ...item };
      try {
        results.push({ index, ok: true, result: await original({ ...ctx, input }, options) });
      } catch (error) {
        results.push({ index, ok: false, error: itemErrorMessage({ error, toolId }) });
      }
    }
    const succeeded = results.filter((result) => result.ok).length;
    return { batch: true, total: results.length, succeeded, failed: results.length - succeeded, results } satisfies BatchResult;
  };
  return { ...registration, descriptor: batchDescriptorFor({ descriptor: registration.descriptor, tool }), handler };
}

/**
 * Applies {@link withBatchInput} to every listed tool present in `registrations`; every other
 * registration is returned as the same object. A listed id that is not registered is skipped (a
 * domain may be absent in a narrower composition, e.g. a test building one domain).
 *
 * @param required.registrations - The assembled registration list.
 * @param optional.tools - Defaults to {@link BATCHABLE_TOOLS}.
 * @returns A new list in the same order.
 * @complexity O(r + b) for r registrations and b batchable tools.
 */
export function applyBatchInputs(
  { registrations }: { registrations: readonly ToolRegistration[] },
  { tools = BATCHABLE_TOOLS }: { tools?: readonly BatchableTool[] } = {},
): ToolRegistration[] {
  const byId = new Map(tools.map((tool) => [tool.toolId, tool]));
  return registrations.map((registration) => {
    const tool = byId.get(registration.descriptor.id);
    return tool ? withBatchInput({ registration, tool }) : registration;
  });
}
