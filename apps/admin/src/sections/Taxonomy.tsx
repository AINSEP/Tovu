import { useEffect, useMemo, useState } from "react";
import { ApiError, api, describeApiError, type AdminTaxonomyWithTerms, type AdminTerm } from "../lib/api";

/**
 * @file Categories & Tags screen (design-spec.md §2, ADR-044) — the `/admin/taxonomy` route.
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

/** Depth of `term` within its taxonomy's `parentId` chain, bounded against cycles by a visited
 * set (server-side cycle detection should prevent one, but this render helper never trusts that
 * blindly). */
function termDepth(required: { term: AdminTerm; byId: Map<string, AdminTerm> }): number {
  const { term, byId } = required;
  let depth = 0;
  let current: AdminTerm | undefined = term;
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parentId);
    depth += 1;
    if (depth > 32) break; // defensive bound, not an expected real depth
  }
  return depth;
}

function NewTermForm(props: {
  taxonomy: AdminTaxonomyWithTerms;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createTerm(
        { taxonomyId: props.taxonomy.taxonomy.id, name: name.trim() },
        { parentId: props.taxonomy.taxonomy.hierarchical && parentId ? parentId : null }
      );
      setName("");
      setParentId("");
      props.onCreated();
    } catch (e) {
      setError(describeApiError(e, "Failed to create term"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="notice taxonomy-new-term-form" onSubmit={submit}>
      <label htmlFor={`new-term-name-${props.taxonomy.taxonomy.id}`}>New term in {props.taxonomy.taxonomy.name}</label>
      <span className="editor-actions">
        <input
          id={`new-term-name-${props.taxonomy.taxonomy.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Term name"
        />
        {props.taxonomy.taxonomy.hierarchical ? (
          <select aria-label="Parent term" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">(top level)</option>
            {props.taxonomy.terms.map((t) => (
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

/** New-taxonomy form (REQ-02) — name + hierarchical toggle, calling `api.createTaxonomy`. Mirrors
 * `NewTermForm`'s local-state/submit/error shape. */
function NewTaxonomyForm(props: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [hierarchical, setHierarchical] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createTaxonomy({ name: name.trim(), hierarchical });
      setName("");
      setHierarchical(false);
      props.onCreated();
    } catch (e) {
      setError(describeApiError(e, "Failed to create taxonomy"));
    } finally {
      setSaving(false);
    }
  }

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

type MergeStep = "idle" | "planned" | "confirmed";

function MergeTermSection(props: { taxonomy: AdminTaxonomyWithTerms; term: AdminTerm; onMerged: () => void }) {
  const otherTerms = props.taxonomy.terms.filter((t) => t.id !== props.term.id);
  const [intoTermId, setIntoTermId] = useState("");
  const [step, setStep] = useState<MergeStep>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ planId: string; planHash: string; overlappingContentCount: number } | null>(null);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);

  useEffect(() => {
    setIntoTermId("");
    setStep("idle");
    setError(null);
    setPlan(null);
    setConfirmationToken(null);
  }, [props.term.id]);

  if (otherTerms.length === 0) return null;

  async function startPlan() {
    if (!intoTermId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.planMergeTerm({ fromTermId: props.term.id, intoTermId });
      setPlan({ planId: r.planId, planHash: r.planHash, overlappingContentCount: r.details.overlappingContentCount });
      setStep("planned");
    } catch (e) {
      setError(describeApiError(e, "Failed to plan the merge"));
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.confirmMergeTerm({ fromTermId: props.term.id, planId: plan.planId, planHash: plan.planHash });
      setConfirmationToken(r.confirmationToken);
      setStep("confirmed");
    } catch (e) {
      setError(describeApiError(e, "Failed to confirm the merge"));
    } finally {
      setBusy(false);
    }
  }

  async function doExecute() {
    if (!confirmationToken) return;
    setBusy(true);
    setError(null);
    try {
      await api.executeMergeTerm({ fromTermId: props.term.id, intoTermId, confirmationToken });
      props.onMerged();
    } catch (e) {
      setError(describeApiError(e, "Failed to execute the merge"));
    } finally {
      setBusy(false);
    }
  }

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
            term and merge <strong>{props.term.name}</strong> away. Confirming issues a one-time execution
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

function TermDetailPanel(props: {
  taxonomy: AdminTaxonomyWithTerms;
  term: AdminTerm;
  onRenamed: () => void;
  onMerged: () => void;
}) {
  const [newName, setNewName] = useState(props.term.name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewName(props.term.name);
    setMessage(null);
    setError(null);
  }, [props.term.id, props.term.name]);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === props.term.name) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.renameTerm({ termId: props.term.id, newName: newName.trim() });
      setMessage("Renamed.");
      props.onRenamed();
    } catch (e) {
      setError(describeApiError(e, "Failed to rename term"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-detail-panel">
      <h2>{props.term.name}</h2>
      <p className="muted-cell">{props.taxonomy.taxonomy.name}</p>
      <div className="settings-layer-grid">
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Status</span>
          <span className={`status status-${props.term.status}`}>{props.term.status}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Parent</span>
          <span>{props.term.parentId ? props.taxonomy.terms.find((t) => t.id === props.term.parentId)?.name ?? props.term.parentId : "—"}</span>
        </div>
        <div className="settings-layer-cell">
          <span className="settings-layer-label">Version</span>
          <span>{props.term.version}</span>
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
      <MergeTermSection taxonomy={props.taxonomy} term={props.term} onMerged={props.onMerged} />
    </div>
  );
}

export function Taxonomy() {
  const [taxonomies, setTaxonomies] = useState<AdminTaxonomyWithTerms[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);

  function load() {
    api
      .listTaxonomies()
      .then((r) => setTaxonomies(r.items))
      .catch((e) => setError(describeApiError(e, "failed to load taxonomies")));
  }

  useEffect(load, []);

  const selected = useMemo(() => {
    if (!taxonomies || !selectedTermId) return null;
    for (const group of taxonomies) {
      const term = group.terms.find((t) => t.id === selectedTermId);
      if (term) return { taxonomy: group, term };
    }
    return null;
  }, [taxonomies, selectedTermId]);

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
                      const parentName = term.parentId ? byId.get(term.parentId)?.name : undefined;
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
