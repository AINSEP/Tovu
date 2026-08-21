/**
 * @file The v1 widget-type registry (SPEC-043 REQ-07..10, ADR-047 Debate Fold-In Amendment 3).
 *
 * Purpose:
 * Each `WidgetTypeRegistration` below is plain, JSON-serializable data — schema, capability
 * class, placement contexts, cost clamps, and (for dynamic types) a `resolverId` string. No
 * registration record imports or references executable behavior directly; `resolverId` is a
 * pointer that only ever resolves through `resolvers/index.ts`'s closed `CORE_RESOLVERS` map
 * (REQ-08) — never a dynamic import, `eval`, or arbitrary function reference. This is the split
 * Amendment 3 requires: type *registration* is data (Tier-1-safe, this file); type *behavior* is
 * core-owned code in v1, ADR-024 Tier-2/3-gated for any future plugin-contributed dynamic type
 * (`resolvers/`).
 *
 * `getWidgetTypeRegistration`/`findWidgetTypeRegistration` are the two lookup accessors over this
 * data — pure, O(1) functions with no I/O and no reference to resolver code, kept here (unlike
 * `forms/manifest.ts`'s stricter zero-function convention, which exists specifically for a
 * hypothetical future loader retrofit this file has no equivalent of) because every other registry
 * in this codebase (`identity/permissions.ts`) pairs its data with a plain accessor the same way.
 * The split is deliberate, not incidental: `getWidgetTypeRegistration` is total and only accepts a
 * `typeKey` the type system has actually proven is one of the five registered keys; a caller
 * holding a merely-asserted `WidgetTypeKey` (cast from an HTTP body or decoded JSON, not narrowed)
 * must use the partial `findWidgetTypeRegistration` instead — see each function's own doc.
 *
 * How it relates to the project:
 * - Read by `resolvers/index.ts` (dispatch), `write-service.ts` (config validation, REQ-02/03),
 *   and any admin/AI surface that needs to know what a widget type declares.
 * - Static/type-only until the registry itself is imported and iterated — no side effects at
 *   module load time.
 */
import type { WidgetTypeKey, WidgetTypeRegistration } from "./types.js";

/** `text` — static, no resolver (REQ-10). A single free-form rich-text field. */
const TEXT_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "text",
  capability: "static",
  configSchema: {
    type: "object",
    properties: { body: { type: "string" } },
    required: ["body"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 0 },
};

/** `social-links` — static, no resolver. An ordered list of `{ platform, url }` pairs. */
const SOCIAL_LINKS_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "social-links",
  capability: "static",
  configSchema: {
    type: "object",
    properties: {
      links: {
        type: "array",
        items: {
          type: "object",
          properties: { platform: { type: "string" }, url: { type: "string" } },
          required: ["platform", "url"],
          additionalProperties: false,
        },
        maxItems: 20,
      },
    },
    required: ["links"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 0 },
};

/**
 * `recent-entries` — dynamic, `query` capability. `maxItems` is clamped at the
 * REGISTRATION level (the ceiling any instance's own config may request) AND
 * re-enforced at the orchestration layer (REQ-25) — defense in depth, not
 * redundant: this value is what a resolver *may* return at most; the
 * orchestrator enforces it independent of the resolver's own discipline.
 */
const RECENT_ENTRIES_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "recent-entries",
  capability: "query",
  configSchema: {
    type: "object",
    properties: {
      maxItems: { type: "integer", minimum: 1, maximum: 20 },
      // REQ-32/EC-03: a taxonomy-term-target soft reference, extracted into entry_refs with
      // targetKind 'term' (no safe-delete guarantee) — see core/entry-refs/extractor.ts.
      categoryTermId: { type: "string", "x-ref-target": "term" },
    },
    required: ["maxItems"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { maxItems: 20, timeoutMs: 500 },
  resolverId: "recent-entries",
};

/** `menu` — dynamic, `entry-reference` capability. Delegates entirely to `navigation/resolver.ts`. */
const MENU_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "menu",
  capability: "entry-reference",
  configSchema: {
    type: "object",
    // REQ-31: menuRef is an entry-target ref, extracted into entry_refs — see
    // core/entry-refs/extractor.ts (matches the CONTACT_FORM_REGISTRATION 'x-ref-target' pattern
    // below).
    properties: { menuRef: { type: "string", "x-ref-target": "entry" } },
    required: ["menuRef"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 500 },
  resolverId: "menu",
};

/**
 * `contact-form` — dynamic, `form` capability. A thin adapter over `src/forms/`
 * (REQ-36..39) — this registration carries no submission/rate-limit/mail
 * config of its own; `formDefinitionId` is a ref-typed field extracted into
 * `entry_refs` (REQ-31).
 */
const CONTACT_FORM_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "contact-form",
  capability: "form",
  configSchema: {
    type: "object",
    properties: {
      formDefinitionId: { type: "string", "x-ref-target": "entry" },
      successMessage: { type: "string" },
    },
    required: ["formDefinitionId"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 500 },
  resolverId: "contact-form",
};

/**
 * The complete v1 widget-type registry (REQ-09), keyed by the closed `WidgetTypeKey` union rather
 * than held as an array. This is what makes `getWidgetTypeRegistration` below total: TypeScript
 * proves every member of the union has an entry, so the accessor's return type carries no
 * `| undefined` for a genuinely-narrowed key. Iterate with `Object.values(...)` where the whole
 * table is needed (e.g. `agent-tools.ts`'s published-type-list).
 */
export const WIDGET_TYPE_REGISTRATIONS: Readonly<Record<WidgetTypeKey, WidgetTypeRegistration>> = {
  text: TEXT_REGISTRATION,
  "social-links": SOCIAL_LINKS_REGISTRATION,
  "recent-entries": RECENT_ENTRIES_REGISTRATION,
  menu: MENU_REGISTRATION,
  "contact-form": CONTACT_FORM_REGISTRATION,
};

/**
 * The total lookup accessor — pure, O(1), no I/O. Only valid for a `typeKey` already narrowed to
 * `WidgetTypeKey` by the type system itself (a literal, or a value whose type was proven, not
 * asserted). For a raw/untrusted string that merely claims to be a `WidgetTypeKey` (an HTTP body
 * field cast at the boundary, e.g. `server/routes/admin/widgets/create.ts`, or a value decoded out
 * of stored JSON via `entry-payload.ts`'s `parseWidgetInstancePayload`), `undefined` is genuinely
 * reachable — use `findWidgetTypeRegistration` instead; do not smuggle an unverified string past
 * this signature with a cast.
 */
export function getWidgetTypeRegistration(typeKey: WidgetTypeKey): WidgetTypeRegistration {
  return WIDGET_TYPE_REGISTRATIONS[typeKey];
}

/**
 * The partial lookup accessor for a raw, untrusted string that has not been proven to be a
 * `WidgetTypeKey` — only asserted to be one at some upstream boundary (an HTTP body field, or a
 * value decoded out of stored JSON). Returns `undefined` for any string that isn't one of the five
 * registered keys, which callers at those boundaries must handle for real (see
 * `write-service.ts`'s `WidgetTypeUnregisteredError`, `resolvers/index.ts`'s `"unknown-type"`).
 */
export function findWidgetTypeRegistration(raw: string): WidgetTypeRegistration | undefined {
  return Object.values(WIDGET_TYPE_REGISTRATIONS).find((registration) => registration.typeKey === raw);
}
