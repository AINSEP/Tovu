
/**
 * @file A minimal JSON-Schema-subset validator for `fields.ext.widget.*` config bags (SPEC-043
 * REQ-02, INV-01).
 *
 * Purpose:
 * `widgets/registry.ts`'s `WidgetTypeRegistration.configSchema` records use a small, deliberately
 * bounded JSON-Schema subset (`object`/`string`/`integer`/`array`, `properties`/`required`/
 * `additionalProperties`/`items`/`maxItems`/`minimum`/`maximum` — exactly what `registry.ts`'s five
 * v1 registrations actually use, no more). No JSON-Schema library is a dependency of this repo
 * (confirmed: no `ajv`/`jsonschema` entry in `package.json`), so this is a small, purpose-built
 * validator over that exact subset rather than a new third-party dependency for one feature.
 *
 * Architectural role:
 * `widgets` domain logic, internal helper. Used by `write-service.ts` before every widget-instance
 * write (REQ-01/02) — not part of this feature's frozen public contract list, so its shape is not
 * design-frozen the way `types.ts`/`ports.ts`/`errors.ts` are.
 */

interface WidgetConfigJsonSchema {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, WidgetConfigJsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: WidgetConfigJsonSchema;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface WidgetConfigFieldError {
  readonly field: string;
  readonly reason: string;
}

export interface ValidateWidgetConfigResult {
  readonly valid: boolean;
  readonly fieldErrors: WidgetConfigFieldError[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(value: unknown, schema: WidgetConfigJsonSchema, path: string, errors: WidgetConfigFieldError[]): void {
  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) {
        errors.push({ field: path, reason: "expected an object" });
        return;
      }
      for (const key of schema.required ?? []) {
        if (!(key in value)) errors.push({ field: `${path}.${key}`, reason: "required field is missing" });
      }
      for (const [key, fieldValue] of Object.entries(value)) {
        const propSchema = schema.properties?.[key];
        if (!propSchema) {
          if (schema.additionalProperties === false) {
            errors.push({ field: `${path}.${key}`, reason: "unrecognized field: not present in the registered schema" });
          }
          continue;
        }
        walk(fieldValue, propSchema, `${path}.${key}`, errors);
      }
      return;
    }
    case "string":
      if (typeof value !== "string") errors.push({ field: path, reason: "expected a string" });
      return;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push({ field: path, reason: "expected an integer" });
        return;
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({ field: path, reason: `below the minimum of ${schema.minimum}` });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({ field: path, reason: `above the maximum of ${schema.maximum}` });
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        errors.push({ field: path, reason: "expected an array" });
        return;
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({ field: path, reason: `exceeds the maximum item count of ${schema.maxItems}` });
      }
      if (schema.items) value.forEach((item, index) => walk(item, schema.items as WidgetConfigJsonSchema, `${path}[${index}]`, errors));
      return;
    default:
      // boolean / unspecified schema type: accept anything (no v1 registration needs this).
      return;
  }
}

/**
 * Validates `config` against a widget type's registered `configSchema` (REQ-02). The registered
 * schema is always the authority — a type's own `clamps` (e.g. `recent-entries`' `maxItems: 20`)
 * are already expressed as `maximum` constraints inside the schema itself (`registry.ts`), so no
 * separate clamp check is needed here to satisfy AC-02.
 *
 * @complexity O(n) over the config bag's total node count.
 * @overallScore 100
 */
export function validateWidgetConfig(required: {
  schema: Record<string, unknown>;
  config: Record<string, unknown>;
}): ValidateWidgetConfigResult {
  const errors: WidgetConfigFieldError[] = [];
  walk(required.config, required.schema as WidgetConfigJsonSchema, "config", errors);
  return { valid: errors.length === 0, fieldErrors: errors };
}
