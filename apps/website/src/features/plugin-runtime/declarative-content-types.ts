/**
 * @file A plugin's manifest-declared content types (`tovu.plugin.json` → `contentTypes`) — Tovu's
 * binding of the plugin-owned rules in `@jini-ai/plugins/host` (`createDeclarativeContentTypes`) to
 * this site's content-type vocabulary and reserved keys. AW-7 Tier 1, 2026-10-04; split by owner in
 * EXTRACT-S6 L1a. The bounds, grammar, tier rule, plan and apply live in Jini, with their rationale;
 * this module keeps every old export and signature so its callers (`host-binding.ts`, the
 * content-type write binding in `server/runtime/composition/declared-content-types.ts`, tests) are
 * unchanged.
 *
 * Host rules this binding keeps (the provisioner itself names no envelope or vocabulary):
 * - **Owner `site`.** Types are registered under the default `ext.site` envelope, not `ext.<plugin>`:
 *   every display path (collection marker, Collection list widget, entries SQL) reads `ext.site`
 *   only, so a plugin-owned envelope would be invisible on the public site. Recorded as a missing
 *   primitive in the AW-7 report.
 *   @agent-note `createDeclaredContentTypePorts` must keep registering with no `owner`, so a
 *   declared type stays in `ext.site`; the same ports object serves both plan and apply.
 * - @agent-note The vocabulary below is the CMS's own (`@jini-ai/cms/content-types`), the same rules
 *   `registerContentType` enforces; the grammar text is printed in saved/compared diagnostics, so
 *   its bytes stay exactly as before. A lost create race is recognized only as
 *   `ContentTypeAlreadyExistsError`; every other register error is rethrown unchanged.
 * - @agent-note ONE bound instance serves discovery (`validateManifest`), install and enable.
 */
import {
  CONTENT_TYPE_FIELD_KINDS,
  ContentTypeAlreadyExistsError,
  isContentTypeFieldKind,
  isIndexableFieldKind,
  validateIdentifierGrammar,
} from "@jini-ai/cms/content-types";
import {
  createDeclarativeContentTypes,
  type ApplyDeclaredContentTypesResult,
  type DeclarativeManifestView,
  type DeclaredContentTypeDefinition,
  type DeclaredContentTypeDefinitionPlan,
  type DeclaredContentTypeWritePorts,
  type ParseDeclaredContentTypesResult,
} from "@jini-ai/plugins/host";

import { SYSTEM_CONTENT_TYPES } from "../../contracts/core/system-content-types.js";

export { MAX_DECLARED_CONTENT_TYPES, MAX_DECLARED_FIELDS, MAX_DECLARED_QUERYABLE_FIELDS } from "@jini-ai/plugins/host";
export type { ApplyDeclaredContentTypesResult, DeclarativeManifestView, DeclaredContentTypeOutcome, ParseDeclaredContentTypesResult } from "@jini-ai/plugins/host";
export type DeclaredContentType = DeclaredContentTypeDefinition;
export type DeclaredContentTypePorts = DeclaredContentTypeWritePorts;
export type DeclaredContentTypePlan = DeclaredContentTypeDefinitionPlan;

const declarative = createDeclarativeContentTypes(
  {
    cms: {
      fieldKinds: CONTENT_TYPE_FIELD_KINDS,
      isFieldKind: isContentTypeFieldKind,
      isIndexable: isIndexableFieldKind,
      validateIdentifier: validateIdentifierGrammar,
      identifierGrammar: "^[a-z][a-z0-9_]{0,63}$",
      isAlreadyExists: ({ error }) => error instanceof ContentTypeAlreadyExistsError,
    },
    /** Keys core owns: `post`/`page` are permanently reserved by the content-types package, and the
     *  system types (widgets, widget areas, menus) are platform plumbing. */
    reservedKeys: ["post", "page", ...SYSTEM_CONTENT_TYPES],
  },
  {}
);

/** Parses a manifest's raw `contentTypes` value. Collect-all, never throws. */
export function parseDeclaredContentTypes(required: { value: unknown }, _optional: Record<string, never> = {}): ParseDeclaredContentTypesResult {
  return declarative.parse(required);
}

/** The declarative half of a manifest's validation (contentTypes + the tier-1 no-code rule). */
export function validateDeclarativeManifest(required: { manifest: DeclarativeManifestView }, _optional: Record<string, never> = {}): ParseDeclaredContentTypesResult {
  return declarative.validateManifest(required);
}

/** Decides, without writing anything, what enabling would do to each declared type. */
export async function planDeclaredContentTypes(
  required: { ports: Pick<DeclaredContentTypePorts, "findByKey">; workspaceId: string; decls: readonly DeclaredContentType[] },
  _optional: Record<string, never> = {}
): Promise<DeclaredContentTypePlan> {
  return declarative.plan(required);
}

/** Carries out a conflict-free plan; a lost create race is judged against the winning type. */
export async function applyDeclaredContentTypes(
  required: { ports: DeclaredContentTypePorts; workspaceId: string; pluginId: string; plan: DeclaredContentTypePlan },
  _optional: Record<string, never> = {}
): Promise<ApplyDeclaredContentTypesResult> {
  return declarative.apply(required);
}
