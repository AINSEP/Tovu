import type { AdminTaxonomyWithTerms, AdminTerm } from "../../lib/api";
import { termDepth, otherMergeTargets } from "./rules";
import { useNewTermForm } from "./hooks/use-new-term-form.hooks";
import { useNewTaxonomyForm } from "./hooks/use-new-taxonomy-form.hooks";
import { useMergeTermSection } from "./hooks/use-merge-term-section.hooks";
import { useTermDetailPanel } from "./hooks/use-term-detail-panel.hooks";
import { useTaxonomy } from "./hooks/use-taxonomy.hooks";

/**
 * @file Categories & Tags screen (design-spec.md §2, ADR-044) — the `/admin/taxonomy` route.
 * Markup only.
 *
 * State and API calls live in one hook per component: `hooks/use-new-term-form.hooks.ts`,
 * `hooks/use-new-taxonomy-form.hooks.ts`, `hooks/use-merge-term-section.hooks.ts`,
 * `hooks/use-term-detail-panel.hooks.ts`, `hooks/use-taxonomy.hooks.ts` (the top-level screen).
 * `termDepth`, `otherMergeTargets`, and `findSelectedTerm` (used inside `use-taxonomy.hooks.ts`)
 * live in `rules.ts`.
 *
 * Structural reference: `Settings.tsx`'s two-pane namespace-list + detail-panel layout
 * (design-spec.md §0.3/§2.2) — reuses `.settings-body`/`.settings-row`/`.settings-namespace-*`
 * verbatim rather than inventing new list/detail classes.
 *
 * Scope note (disclosed): list/create-taxonomy/create-term/rename-term/assign-terms/merge-term are
 * backed by real routes; merge-term (ADR-044, SPEC-018 C-207) is wired to the real
 * `core/gated-mutations`-backed ceremony (Session 5-6 backend gap closure). Reparent and Deprecate
 * — named in design-spec.md §2.3/§2.4 — still have no route (`renameTerm`'s own route only accepts
 * `newName`, no `parentId`; no deprecate-term route was wired). Rather than render dead buttons for
 * those two, this screen omits them entirely.
 *
 * Also disclosed: the production `Term` type (`features/taxonomy/write-service.ts`) has no `slug`
 * field — design-spec.md §2.3 assumed one; this screen does not render a slug control.
 *
 * SPEC-037 REQ-02: `NewTaxonomyForm` wires the previously-unused `api.createTaxonomy` — a plain
 * name + hierarchical-toggle form above the taxonomy list, reusing `NewTermForm`'s shape.
 */

export interface NewTermFormProps {
  taxonomy: AdminTaxonomyWithTerms;
  onCreated: () => void;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. */
  useNewTermFormHook?: typeof useNewTermForm;
}

function NewTermForm({ taxonomy, onCreated, useNewTermFormHook = useNewTermForm }: NewTermFormProps) {
  const { name, setName, parentId, setParentId, error, saving, submit } = useNewTermFormHook({ taxonomy, onCreated });

  return (
    <form className="notice taxonomy-new-term-form" onSubmit={submit}>
      <label htmlFor={`new-term-name-${taxonomy.taxonomy.id}`}>New term in {taxonomy.taxonomy.name}</label>
      <span className="editor-actions">
        <input
          id={`new-term-name-${taxonomy.taxonomy.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Term name"
        />
        {taxonomy.taxonomy.hierarchical ? (
          <select aria-label="Parent term" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">(top level)</option>
            {taxonomy.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        {/* Secondary — repeated once per taxonomy group, not this page's one headline create
            ("Create taxonomy" above owns that). */}
        <button type="submit" className="btn-secondary" disabled={saving}>
          {saving ? "Saving…" : "Add term"}
        </button>
      </span>
      {error ? (
        <span className="save-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export interface NewTaxonomyFormProps {
  onCreated: () => void;
  useNewTaxonomyFormHook?: typeof useNewTaxonomyForm;
}

/** New-taxonomy form (REQ-02) — name + hierarchical toggle, calling `api.createTaxonomy`. Mirrors
 * `NewTermForm`'s local-state/submit/error shape. */
function NewTaxonomyForm({ onCreated, useNewTaxonomyFormHook = useNewTaxonomyForm }: NewTaxonomyFormProps) {
  const { name, setName, hierarchical, setHierarchical, error, saving, submit } = useNewTaxonomyFormHook({ onCreated });

  return (
    <form className="notice taxonomy-new-term-form" onSubmit={submit}>
      <label htmlFor="new-taxonomy-name">New taxonomy</label>
      <span className="editor-actions">
        <input
          id="new-taxonomy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Category"
        />
        <label>
          <input type="checkbox" checked={hierarchical} onChange={(e) => setHierarchical(e.target.checked)} />
          Hierarchical
        </label>
        {/* The one page-level primary — the entry point for the whole feature. Everything below
            (per-group "Add term", the merge wizard's "Plan"/"Confirm") is scoped and repeated
            rather than a single headline action, so those stay secondary; see their own comments. */}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Create taxonomy"}
        </button>
      </span>
      {error ? (
        <span className="save-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export interface MergeTermSectionProps {
  taxonomy: AdminTaxonomyWithTerms;
  term: AdminTerm;
  onMerged: () => void;
  useMergeTermSectionHook?: typeof useMergeTermSection;
}

function MergeTermSection({ taxonomy, term, onMerged, useMergeTermSectionHook = useMergeTermSection }: MergeTermSectionProps) {
  const otherTerms = otherMergeTargets(taxonomy, term.id);
  const { intoTermId, setIntoTermId, step, busy, error, plan, confirmationToken, startPlan, doConfirm, doExecute } = useMergeTermSectionHook({
    term,
    onMerged,
  });

  if (otherTerms.length === 0) return null;

  return (
    <div className="notice taxonomy-merge-section">
      <h3>Merge into another term</h3>
      {error ? <span className="save-error">{error}</span> : null}

      {step === "idle" ? (
        <span className="editor-actions">
          <select aria-label="Merge into" value={intoTermId} onChange={(e) => setIntoTermId(e.target.value)}>
            <option value="">Choose a term…</option>
            {otherTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {/* Secondary throughout this wizard's first two steps — planning/confirming a merge
              commits nothing yet ("nothing is merged yet" below), so neither reads as this
              screen's primary action. Only Execute (genuinely irreversible) escalates. */}
          <button type="button" className="btn-secondary" onClick={startPlan} disabled={!intoTermId || busy}>
            {busy ? "Planning…" : "Plan merge"}
          </button>
        </span>
      ) : null}

      {step === "planned" && plan ? (
        <div>
          <p>
            This will move {plan.overlappingContentCount} overlapping content assignment(s) onto the target
            term and merge <strong>{term.name}</strong> away. Confirming issues a one-time execution
            token — nothing is merged yet.
          </p>
          <button type="button" className="btn-secondary" onClick={doConfirm} disabled={busy}>
            {busy ? "Confirming…" : "Confirm merge"}
          </button>
        </div>
      ) : null}

      {step === "confirmed" && confirmationToken ? (
        <div>
          <p>Confirmed. Executing merges the terms now — this cannot be undone.</p>
          {/* Genuinely irreversible, per the copy right above — `.btn-danger`, unlike Plan/Confirm. */}
          <button type="button" className="btn-danger" onClick={doExecute} disabled={busy}>
            {busy ? "Merging…" : "Execute merge"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export interface TermDetailPanelProps {
  taxonomy: AdminTaxonomyWithTerms;
  term: AdminTerm;
  onRenamed: () => void;
  onMerged: () => void;
  useTermDetailPanelHook?: typeof useTermDetailPanel;
}

function TermDetailPanel({ taxonomy, term, onRenamed, onMerged, useTermDetailPanelHook = useTermDetailPanel }: TermDetailPanelProps) {
  const { newName, setNewName, saving, message, error, rename } = useTermDetailPanelHook({ term, onRenamed });

  return (
    <div className="settings-detail-panel">
      <h2>{term.name}</h2>
      <p className="muted-cell">{taxonomy.taxonomy.name}</p>
      <div className="settings-layer-grid">
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Status</span>
          <span className={`status status-${term.status}`}>{term.status}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Parent</span>
          <span>{term.parentId ? taxonomy.terms.find((t) => t.id === term.parentId)?.name ?? term.parentId : "—"}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Version</span>
          <span>{term.version}</span>
        </div>
      </div>
      <form onSubmit={rename} className="collections-field-row">
        <label htmlFor="term-rename-input">Rename</label>
        <input id="term-rename-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <span className="editor-actions">
          <button type="submit" className="btn-secondary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
        </span>
      </form>
      <MergeTermSection taxonomy={taxonomy} term={term} onMerged={onMerged} />
    </div>
  );
}

export interface TaxonomyProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  nothing and behave exactly as before. */
  useTaxonomyHook?: typeof useTaxonomy;
}

export function Taxonomy({ useTaxonomyHook = useTaxonomy }: TaxonomyProps = {}) {
  const { taxonomies, error, selectedTermId, setSelectedTermId, selected, load } = useTaxonomyHook();

  if (error && !taxonomies) return <div className="notice error">{error}</div>;
  if (!taxonomies) return <div className="notice">Loading taxonomies…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Categories &amp; Tags</h1>
          <p className="page-description">Organize content with taxonomies and terms — categories, tags, and any custom hierarchy you define.</p>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}

      <NewTaxonomyForm onCreated={load} />

      <div className="settings-body">
        <div className="settings-namespace-list">
          {taxonomies.map((group) => {
            const byId = new Map(group.terms.map((t) => [t.id, t]));
            return (
              <section key={group.taxonomy.id} className="settings-namespace-group">
                <h2>{group.taxonomy.name}</h2>
                {group.terms.length === 0 ? (
                  <p className="muted-cell">No terms yet.</p>
                ) : (
                  <ul role="list" className="settings-row-list">
                    {group.terms.map((term) => {
                      const depth = group.taxonomy.hierarchical ? termDepth({ term, byId }) : 0;
                      // Gated on `hierarchical` for the same reason `depth` is: a term's
                      // `parentId` can still be set on a taxonomy that has since been switched to
                      // flat (or seeded with one before hierarchical mode existed), and this row
                      // renders with zero indentation either way. Without this gate the
                      // `aria-label` below announced a "subcategory of" relationship a
                      // screen-reader user could not corroborate from the (unindented) visual
                      // layout — an accessibility mismatch between the two channels describing the
                      // same row.
                      const parentName =
                        group.taxonomy.hierarchical && term.parentId ? byId.get(term.parentId)?.name : undefined;
                      return (
                        <li
                          key={term.id}
                          role="listitem"
                          className={`settings-row${selectedTermId === term.id ? " is-selected" : ""}`}
                          style={depth > 0 ? { marginLeft: `${depth * 1.1}rem` } : undefined}
                          aria-label={parentName ? `${term.name}, subcategory of ${parentName}` : undefined}
                          onClick={() => setSelectedTermId(term.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedTermId(term.id);
                            }
                          }}
                          tabIndex={0}
                          aria-selected={selectedTermId === term.id}
                        >
                          <span className="settings-row-key">{term.name}</span>
                          <span className={`status status-${term.status}`}>{term.status}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <NewTermForm taxonomy={group} onCreated={load} />
              </section>
            );
          })}
        </div>

        {selected ? (
          <TermDetailPanel
            taxonomy={selected.taxonomy}
            term={selected.term}
            onRenamed={load}
            onMerged={() => {
              setSelectedTermId(null);
              load();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
