import type { PostRecord } from "../features/post/index.js";
import type { PresentationSettingsRecord } from "../features/presentation/index.js";
import type { WorkspaceRecord } from "../features/workspace/index.js";

/**
 * @file SPEC-003 — install-dir compatibility-surface schemas (state.spec.md §2).
 *
 * Purpose:
 * Single source of truth for the two install-dir JSON file shapes (`ConfigJson`,
 * `SiteMetaJson`) and the starter template's data shapes (`TemplateJson`,
 * `TemplateSeedContent`). These are additive-only compatibility surfaces shared with the
 * future desktop host (ADR-011/ADR-012) — see api.spec.md §7.
 *
 * Architectural role:
 * Type-only module; no runtime logic, no imports beyond other type-only modules.
 */

/** `config.json` — static site identity (state.spec.md §2). Never written by `serve`. */
export interface ConfigJson {
  /** Required, 1..200 chars after trim (behavior.spec.md §4). */
  name: string;
  /** Optional; informational until a routing/deploy spec consumes it. */
  domain: string | null;
  /** Optional; 2nd in `serve`'s port precedence (BR-02). */
  port: number | null;
}

/** `.site-meta.json` — provenance + compatibility stamp; presence is init's commit marker (INV-02). */
export interface SiteMetaJson {
  /** Generated at init; host-level identity distinct from `workspaceId` (OQ-04). */
  siteId: string;
  /** `"starter"` in v1. */
  templateId: string;
  /** Semver, read from `template.json` at init time. */
  templateVersion: string;
  /** Latest applied migration INDEX; monotonically non-decreasing (INV-05). */
  schemaVersion: number;
  /** Latest applied migration TAG/hash — identity, for divergence detection (REQ-05, RT-005). */
  schemaTag: string;
  createdAt: string;
}

/** `templates/<id>/template.json` — repo data, read-only at runtime (INV-03). */
export interface TemplateJson {
  id: string;
  version: string;
  name: string;
  defaultConfig: {
    name: string | null;
    port: number | null;
  };
}

/** `templates/<id>/seed-content.json`'s on-disk shape — declarative, no code (state.spec.md §2). */
export interface TemplateSeedContent {
  workspace: WorkspaceRecord;
  entries: PostRecord[];
  presentation: PresentationSettingsRecord;
}
