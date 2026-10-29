/** The merged-into-`ext.{pluginId}` shape a `beforeSave` filter returns (state.spec.md §2
 * `SdkSurface.ExtPatch`). Values are restricted to the four JSON-primitive types BR-06's field
 * `type` vocabulary supports (`string | integer | number | boolean` — `integer` collapses to
 * `number` at the JS/TS type level; BR-06's validator distinguishes integer-vs-number at the
 * value level, not the type level). */
export type ExtPatch = Readonly<Record<string, string | number | boolean>>;

/**
 * The read-only entry snapshot a `beforeSave` filter receives (REQ-05, RT-001). A v1 filter
 * cannot mutate core entry fields — this type has no setters, and every field is `readonly`
 * (ADR-024 §3: plain, serializable, never a live ORM row). `ext` reflects every OTHER plugin's
 * already-written namespaces at the time this filter runs (TB-01 composition order) — never this
 * plugin's own not-yet-written patch.
 */
export interface ContentEntryDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  /** Per-entry meta description when available; omitted when the host has no override. */
  readonly metaDescription?: string;
  readonly slug: string;
  readonly status: "draft" | "published";
  readonly bodyJson: Readonly<Record<string, unknown>>;
  readonly ext: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}
