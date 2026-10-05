/**
 * @file A plugin's manifest-declared content types (`tovu.plugin.json` → `contentTypes`) — parse,
 * plan against what the site already has, and apply through the ONE core write path
 * (`registerContentType`, behind {@link DeclaredContentTypePorts}). AW-7 Tier 1, 2026-10-04.
 *
 * Why this exists: ADR-024 §1 defines Tier-1 as a manifest-only plugin whose first contribution is
 * "content types & fields", but `manifest.ts` only ever parsed-and-stored `contentTypes` (state.spec
 * §2: "UNUSED in v1"). This module is the missing half: a bounded, closed declaration grammar
 * (ADR-024 §5 — Tier-1 is only safe while its surface is non-Turing-complete and bounded) and an
 * idempotent provisioner that runs at enable time.
 *
 * Rules the provisioner keeps (and why):
 * - **Create if missing, never overwrite.** An existing type that already holds every declared field
 *   with the same kind is KEPT (the owner may have added fields of their own through Collections —
 *   that is their data model now). An existing type that disagrees is a CONFLICT and the enable is
 *   refused before anything is written, rather than silently reshaping someone's content.
 * - **A tombstoned type is skipped.** The owner deleted it on purpose; tombstone is terminal and the
 *   key can never be reused (content-types INV-06), so re-enabling the plugin does not resurrect it.
 * - **Retain on disable/uninstall** (ADR-023/ADR-024 retain-by-default): nothing here ever removes a
 *   type. The entries are the owner's content, not the plugin's.
 * - **Owner `site`.** Types are registered under the default `ext.site` envelope, not `ext.<plugin>`:
 *   every display path (collection marker, Collection list widget, entries SQL) reads `ext.site`
 *   only, so a plugin-owned envelope would be invisible on the public site. Recorded as a missing
 *   primitive in the AW-7 report.
 *
 * Pure parsing; the plan/apply halves do I/O only through the injected ports.
 */
import {
  CONTENT_TYPE_FIELD_KINDS,
  ContentTypeAlreadyExistsError,
  isContentTypeFieldKind,
  isIndexableFieldKind,
  validateIdentifierGrammar,
  type ContentTypeFieldDef,
  type ContentTypeFieldKind,
  type ContentTypeRecord,
} from "#src/features/content-types/index";
import { SYSTEM_CONTENT_TYPES } from "#src/features/entries/public-list";

import type { PluginManifest, PluginValidationError } from "./manifest.js";

/** ADR-024 §5 bound: how many content types one plugin may declare. */
export const MAX_DECLARED_CONTENT_TYPES = 20;
/** ADR-024 §5 bound: how many fields one declared content type may carry. */
export const MAX_DECLARED_FIELDS = 50;
const MAX_LABEL_LENGTH = 100;
const IDENTIFIER_GRAMMAR_TEXT = "^[a-z][a-z0-9_]{0,63}$";

/** Keys core owns: `post`/`page` are permanently reserved by the content-types package, and the
 *  system types (widgets, widget areas, menus) are platform plumbing. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(["post", "page", ...SYSTEM_CONTENT_TYPES]);
const DECL_KEYS: ReadonlySet<string> = new Set(["key", "label", "fields"]);
const FIELD_KEYS: ReadonlySet<string> = new Set(["name", "kind", "required", "queryable"]);

/** One validated content-type declaration, already in core's `ContentTypeFieldDef` shape. */
export interface DeclaredContentType {
  readonly key: string;
  readonly label: string;
  readonly fields: readonly ContentTypeFieldDef[];
}

export interface ParseDeclaredContentTypesResult {
  readonly decls: readonly DeclaredContentType[];
  readonly errors: readonly PluginValidationError[];
}

function declError(message: string): PluginValidationError {
  return { code: "CONTENT_TYPE_DECL_INVALID", file: null, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeyErrors(raw: Record<string, unknown>, allowed: ReadonlySet<string>, where: string): PluginValidationError[] {
  return Object.keys(raw)
    .filter((key) => !allowed.has(key))
    .map((key) => declError(`${where} has an unknown key '${key}'`));
}

function optionalFlag(raw: Record<string, unknown>, flag: "required" | "queryable", where: string, errors: PluginValidationError[]): boolean {
  const value = raw[flag];
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  errors.push(declError(`${where} '${flag}' must be a boolean`));
  return false;
}

/** The name/kind half of one field — returns the validated pair, or `undefined` after recording why. */
function fieldIdentity(raw: Record<string, unknown>, typeKey: string, errors: PluginValidationError[]): { name: string; kind: ContentTypeFieldKind } | undefined {
  const name = raw.name;
  if (typeof name !== "string" || !validateIdentifierGrammar({ value: name })) {
    errors.push(declError(`content type '${typeKey}' field name '${String(name)}' must match ${IDENTIFIER_GRAMMAR_TEXT}`));
    return undefined;
  }
  const kind = raw.kind;
  if (!isContentTypeFieldKind({ value: kind })) {
    errors.push(declError(`content type '${typeKey}' field '${name}' has kind '${String(kind)}'; allowed: ${CONTENT_TYPE_FIELD_KINDS.join("|")}`));
    return undefined;
  }
  return { name, kind: kind as ContentTypeFieldKind };
}

/** One `fields[]` entry. Collects every problem it finds; returns the field only when it has none. */
function parseField(raw: unknown, index: number, typeKey: string): { field?: ContentTypeFieldDef; errors: PluginValidationError[] } {
  if (!isRecord(raw)) return { errors: [declError(`content type '${typeKey}' field ${index} must be an object`)] };
  const where = `content type '${typeKey}' field '${String(raw.name)}'`;
  const errors = unknownKeyErrors(raw, FIELD_KEYS, where);
  const identity = fieldIdentity(raw, typeKey, errors);
  const required = optionalFlag(raw, "required", where, errors);
  const queryable = optionalFlag(raw, "queryable", where, errors);
  if (identity && queryable && !isIndexableFieldKind({ value: identity.kind })) {
    errors.push(declError(`${where} has storage-only kind '${identity.kind}' and cannot be queryable`));
  }
  if (!identity || errors.length > 0) return { errors };
  return { field: { name: identity.name, kind: identity.kind, required, queryable }, errors };
}

function duplicateNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  return [...duplicates];
}

function parseFields(raw: unknown, typeKey: string): { fields: ContentTypeFieldDef[]; errors: PluginValidationError[] } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_DECLARED_FIELDS) {
    return { fields: [], errors: [declError(`content type '${typeKey}' must declare 1-${MAX_DECLARED_FIELDS} fields`)] };
  }
  const parsed = raw.map((field, index) => parseField(field, index, typeKey));
  const fields = parsed.flatMap((result) => (result.field ? [result.field] : []));
  const errors = parsed.flatMap((result) => result.errors);
  for (const name of duplicateNames(fields.map((field) => field.name))) {
    errors.push(declError(`content type '${typeKey}' declares field '${name}' more than once`));
  }
  return { fields, errors };
}

function keyErrors(key: unknown, index: number): PluginValidationError[] {
  if (typeof key !== "string") return [declError(`contentTypes[${index}].key must be a string`)];
  if (!validateIdentifierGrammar({ value: key })) return [declError(`content type key '${key}' must match ${IDENTIFIER_GRAMMAR_TEXT}`)];
  if (RESERVED_KEYS.has(key)) return [declError(`content type key '${key}' is reserved by core`)];
  return [];
}

function labelValid(label: unknown): label is string {
  return typeof label === "string" && label.trim().length > 0 && label.length <= MAX_LABEL_LENGTH;
}

/** One `contentTypes[]` entry. */
function parseDecl(raw: unknown, index: number): { decl?: DeclaredContentType; errors: PluginValidationError[] } {
  if (!isRecord(raw)) return { errors: [declError(`contentTypes[${index}] must be an object`)] };
  const errors = [...unknownKeyErrors(raw, DECL_KEYS, `contentTypes[${index}]`), ...keyErrors(raw.key, index)];
  const key = String(raw.key);
  if (!labelValid(raw.label)) errors.push(declError(`content type '${key}' needs a label of 1-${MAX_LABEL_LENGTH} characters`));
  const fields = parseFields(raw.fields, key);
  errors.push(...fields.errors);
  if (errors.length > 0) return { errors };
  return { decl: { key, label: raw.label as string, fields: fields.fields }, errors };
}

/**
 * Parses a manifest's raw `contentTypes` value. Collect-all, never throws (same contract as
 * `validateManifest`). `undefined`/`null` declare nothing.
 *
 * @complexity O(t · f) over declared types and their fields — both bounded by the MAX_* constants.
 */
export function parseDeclaredContentTypes(required: { value: unknown }, _optional: Record<string, never> = {}): ParseDeclaredContentTypesResult {
  const { value } = required;
  if (value === undefined || value === null) return { decls: [], errors: [] };
  if (!Array.isArray(value)) return { decls: [], errors: [declError("'contentTypes' must be an array")] };
  if (value.length > MAX_DECLARED_CONTENT_TYPES) {
    return { decls: [], errors: [declError(`'contentTypes' declares more than ${MAX_DECLARED_CONTENT_TYPES} content types`)] };
  }
  const parsed = value.map((entry, index) => parseDecl(entry, index));
  const decls = parsed.flatMap((result) => (result.decl ? [result.decl] : []));
  const errors = parsed.flatMap((result) => result.errors);
  for (const key of duplicateNames(decls.map((decl) => decl.key))) {
    errors.push(declError(`content type key '${key}' is declared more than once`));
  }
  return { decls, errors };
}

/** The manifest arrays only executable code can use — a Tier-1 plugin has none to use them with. */
const CODE_SURFACES = ["capabilities", "hooks", "fields"] as const;

/**
 * The declarative half of a manifest's validation: its `contentTypes`, plus — for a `tier-1`
 * plugin — the rule that it declares no code surface. Hooks, capability grants and `ext` fields
 * all exist to be used by plugin code, and a Tier-1 plugin is never imported (ADR-024 §1: "zero
 * executable code"), so declaring one is either a mistake or an attempt to look like something it
 * is not.
 *
 * Kept out of `manifest.ts` on purpose for now: that file is being changed by the in-flight
 * conflict-detection work (2026-10-04). Folding this call into `validateManifest()` — so discovery
 * lists a bad declaration as `invalid` instead of failing at enable — is the follow-up.
 */
export function validateDeclarativeManifest(required: { manifest: PluginManifest }, _optional: Record<string, never> = {}): ParseDeclaredContentTypesResult {
  const { manifest } = required;
  const parsed = parseDeclaredContentTypes({ value: manifest.contentTypes });
  if (manifest.tier !== "tier-1") return parsed;
  const surfaceErrors = CODE_SURFACES.filter((surface) => manifest[surface].length > 0).map((surface) => ({
    code: "TIER1_DECLARES_CODE_SURFACE",
    file: null,
    message: `a declarative (tier-1) plugin cannot declare '${surface}' — only code can use them`,
  }));
  return { decls: parsed.decls, errors: [...surfaceErrors, ...parsed.errors] };
}

/**
 * The two content-type operations the provisioner needs. `register` is core's `registerContentType`
 * bound by the composition root (see `createDeclaredContentTypePorts`); it returns core's `Result`
 * rather than throwing for an expected rejection.
 */
export interface DeclaredContentTypePorts {
  findByKey(params: { workspaceId: string; key: string }): Promise<ContentTypeRecord | null>;
  register(input: {
    workspaceId: string;
    key: string;
    label: string;
    fields: ContentTypeFieldDef[];
    actorId: string;
  }): Promise<{ ok: true } | { ok: false; error: Error }>;
}

export type DeclaredContentTypeOutcome = "create" | "keep" | "skip-tombstoned";

export interface DeclaredContentTypePlan {
  readonly items: ReadonlyArray<{ readonly decl: DeclaredContentType; readonly outcome: DeclaredContentTypeOutcome }>;
  /** Human-readable reasons the plugin cannot be turned on. Non-empty ⇒ `items` is empty. */
  readonly conflicts: readonly string[];
}

/** Why `existing` cannot serve as `decl`'s type, one reason per disagreeing field. */
function incompatibilities(decl: DeclaredContentType, existing: ContentTypeRecord): string[] {
  const reasons: string[] = [];
  for (const field of decl.fields) {
    const held = existing.fields.find((candidate) => candidate.name === field.name);
    if (!held) reasons.push(`content type '${decl.key}' already exists without field '${field.name}'`);
    else if (held.kind !== field.kind) reasons.push(`content type '${decl.key}' already exists with field '${field.name}' as '${held.kind}', not '${field.kind}'`);
  }
  return reasons;
}

/**
 * Decides, without writing anything, what enabling would do to each declared type. A conflict on
 * ANY type refuses the whole plan, so an enable never leaves half a plugin's types behind.
 *
 * @complexity O(t) port reads plus O(t · f²) field comparison, all manifest-bounded.
 */
export async function planDeclaredContentTypes(
  required: { ports: Pick<DeclaredContentTypePorts, "findByKey">; workspaceId: string; decls: readonly DeclaredContentType[] },
  _optional: Record<string, never> = {}
): Promise<DeclaredContentTypePlan> {
  const { ports, workspaceId, decls } = required;
  const items: Array<{ decl: DeclaredContentType; outcome: DeclaredContentTypeOutcome }> = [];
  const conflicts: string[] = [];
  for (const decl of decls) {
    const existing = await ports.findByKey({ workspaceId, key: decl.key });
    if (!existing) items.push({ decl, outcome: "create" });
    else if (existing.status === "tombstone") items.push({ decl, outcome: "skip-tombstoned" });
    else {
      const reasons = incompatibilities(decl, existing);
      if (reasons.length === 0) items.push({ decl, outcome: "keep" });
      conflicts.push(...reasons);
    }
  }
  return conflicts.length > 0 ? { items: [], conflicts } : { items, conflicts };
}

export interface ApplyDeclaredContentTypesResult {
  readonly created: readonly string[];
  readonly kept: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Carries out a conflict-free plan. Each create is recorded as `plugin:<id>` so the content-type
 * revision log says which plugin made the type; losing a concurrent create race to an identical
 * request counts as kept (the type exists, which is the goal). Any other failure is rethrown as-is.
 */
export async function applyDeclaredContentTypes(
  required: { ports: DeclaredContentTypePorts; workspaceId: string; pluginId: string; plan: DeclaredContentTypePlan },
  _optional: Record<string, never> = {}
): Promise<ApplyDeclaredContentTypesResult> {
  const { ports, workspaceId, pluginId, plan } = required;
  const created: string[] = [];
  const kept: string[] = [];
  const skipped: string[] = [];
  for (const { decl, outcome } of plan.items) {
    if (outcome === "keep") kept.push(decl.key);
    else if (outcome === "skip-tombstoned") skipped.push(decl.key);
    else {
      const result = await ports.register({ workspaceId, key: decl.key, label: decl.label, fields: [...decl.fields], actorId: `plugin:${pluginId}` });
      if (result.ok) created.push(decl.key);
      else if (result.error instanceof ContentTypeAlreadyExistsError) kept.push(decl.key);
      else throw result.error;
    }
  }
  return { created, kept, skipped };
}
