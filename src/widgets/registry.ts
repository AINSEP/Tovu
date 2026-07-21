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
 * `getWidgetTypeRegistration` is the sole lookup accessor over this data — a pure, O(1) function
 * with no I/O and no reference to resolver code, kept here (unlike `forms/manifest.ts`'s stricter
 * zero-function convention, which exists specifically for a hypothetical future loader retrofit
 * this file has no equivalent of) because every other registry in this codebase
 * (`identity/permissions.ts`) pairs its data with a plain accessor the same way.
 *
 * How it relates to the project:
 * - Read by `resolvers/index.ts` (dispatch), `write-service.ts` (config validation, REQ-02/03),
 *   and any admin/AI surface that needs to know what a widget type declares.
 * - Static/type-only until the registry itself is imported and iterated — no side effects at
 *   module load time.
 */
import type { WidgetTypeKey, WidgetTypeRegistration } from "./types";

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

/** The complete v1 widget-type registry (REQ-09). */
export const WIDGET_TYPE_REGISTRATIONS: readonly WidgetTypeRegistration[] = [
  TEXT_REGISTRATION,
  SOCIAL_LINKS_REGISTRATION,
  RECENT_ENTRIES_REGISTRATION,
  MENU_REGISTRATION,
  CONTACT_FORM_REGISTRATION,
];

/** The sole lookup accessor over the registry — pure, O(1), no I/O. */
export function getWidgetTypeRegistration(typeKey: WidgetTypeKey): WidgetTypeRegistration | undefined {
  return WIDGET_TYPE_REGISTRATIONS.find((registration) => registration.typeKey === typeKey);
}
