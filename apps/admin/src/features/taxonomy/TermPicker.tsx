import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { useWiredTermPicker } from "./hooks/use-term-picker.hooks";

/**
 * @file The Categories & Tags box the post, page and collection-entry editors mount (design-spec.md
 * §1.6) — markup only. The boxes start ticked for the terms the content holds, and Save makes it hold
 * exactly the ticked ones; state, loads and the save live in `hooks/use-term-picker.hooks.ts`.
 *
 * Each row also takes a typed name — ticks the matching term or creates it — when the admin may
 * create terms (see the hook's header).
 *
 * Mount it only for content that exists (a saved post/page/entry has an id to tag).
 */
export function TermPicker(props: {
  /** `post`, `page`, or a collection's content-type key. */
  contentType: string;
  contentId: string;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers pass nothing. */
  useTermPickerHook?: typeof useWiredTermPicker;
}) {
  const useTermPickerHook = props.useTermPickerHook ?? useWiredTermPicker;
  const picker = useTermPickerHook({
    contentType: props.contentType,
    contentId: props.contentId,
  });
  const { taxonomies, hidden, subject, selected, toggle, loading, dirty, saving, message, error, save, t } = picker;

  if (hidden) return null;

  // Term ids are database row ids — globally unique across every taxonomy, not just within one —
  // so one flat handle list across all taxonomies is correct.
  const termHandles = buildAgentListHandles({ prefix: "term-picker-term", ids: taxonomies.flatMap(({ terms }) => terms.map((term) => term.id)) }
  );
  let termHandleIndex = 0;
  const taxonomyIds = taxonomies.map(({ taxonomy }) => taxonomy.id);
  const addInputHandles = buildAgentListHandles({ prefix: "term-picker-new-term", ids: taxonomyIds });
  const addTriggerHandles = buildAgentListHandles({ prefix: "term-picker-open-new-term", ids: taxonomyIds });
  const addButtonHandles = buildAgentListHandles({ prefix: "term-picker-add-term", ids: taxonomyIds });

  return (
    <section className="card term-picker">
      <h3 className="card-title">{t("Categories & Tags")}</h3>
      <p className="card-lead">
        {loading ? t("Loading categories & tags…") : t("Tick the categories and tags that apply, then save.")}
      </p>
      {/* One row per taxonomy: its name on the left, its terms on the right. The `<fieldset>` is
          kept for the group's accessible name (its `<legend>`); `styles.css`'s `.term-picker-group`
          strips its browser border and floats the legend so it sits in the row like any label. */}
      <div className="term-picker-groups">
        {taxonomies.map(({ taxonomy, terms }, groupIndex) => {
          const id = taxonomy.id;
          const showInput = picker.showAddInput(id);
          const suggestions = picker.suggestions(id);
          const createError = picker.createError(id);
          return (
            <fieldset key={id} className="term-picker-group">
              <legend className="field-label">{taxonomy.name}</legend>
              <div className="term-picker-body">
                {terms.length === 0 && !showInput ? <p className="field-hint">{t("No terms yet.")}</p> : null}
                {terms.length > 0 ? (
                  <div className="term-picker-terms">
                    {terms.map((term) => {
                      // Consumed in rendered (taxonomy, then term) order, matching how `termHandles`
                      // was built above via the identical `flatMap` order.
                      const handle = termHandles[termHandleIndex];
                      termHandleIndex += 1;
                      return (
                        <label key={term.id} className="form-checkbox-field">
                          <input
                            type="checkbox"
                            checked={selected.has(term.id)}
                            disabled={loading}
                            onChange={() => toggle(term.id)}
                            {...agentHandle({ handle }, {
                              role: "checkbox",
                              label: `Tag this ${subject} with the "${taxonomy.name}" term "${term.name}"`,
                            })}
                          />
                          {term.name}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {picker.showAddTrigger(id) ? (
                  <button
                    type="button"
                    className="btn-ghost term-picker-add-trigger"
                    onClick={() => picker.setAddOpen(id, true)}
                    {...agentHandle({ handle: addTriggerHandles[groupIndex]! }, {
                      role: "button",
                      label: `Open the box for adding a new "${taxonomy.name}" term to this ${subject}`,
                    })}
                  >
                    {t("+ Add term")}
                  </button>
                ) : null}
                {showInput ? (
                  // Not a `<form>`: the box can sit inside an editor's own form; the hook's key
                  // handler stops Enter from submitting it.
                  <span className="term-picker-add">
                    <input
                      aria-label={t("Term name")}
                      placeholder={t("Type a name, then press Enter")}
                      value={picker.newTermName(id)}
                      list={suggestions.length > 0 ? `term-picker-suggestions-${id}` : undefined}
                      disabled={loading}
                      onChange={(e) => picker.setNewTermName(id, e.target.value)}
                      onKeyDown={(e) => picker.onNewTermKeyDown(id, e)}
                      {...agentHandle({ handle: addInputHandles[groupIndex]! }, {
                        role: "field",
                        label: `A "${taxonomy.name}" term name to tag this ${subject} with — an existing one is ticked, a new one is created then ticked; press Enter`,
                      })}
                    />
                    {suggestions.length > 0 ? (
                      <datalist id={`term-picker-suggestions-${id}`}>
                        {suggestions.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void picker.addTerm(id)}
                      disabled={loading || picker.creating(id) || !picker.newTermName(id).trim()}
                      {...agentHandle({ handle: addButtonHandles[groupIndex]! }, {
                        role: "button",
                        label: `Tick the typed "${taxonomy.name}" term, creating it if it does not exist yet`,
                      })}
                    >
                      {picker.creating(id) ? t("Saving…") : t("Add term")}
                    </button>
                  </span>
                ) : null}
                {createError ? (
                  <span className="save-error" role="alert">
                    {createError}
                  </span>
                ) : null}
              </div>
            </fieldset>
          );
        })}
      </div>
      {/* `term-picker-actions` is a spacing-only hook layered on `.editor-actions`, same pattern
          as `FormEditor.tsx`'s `.form-actions`: `.editor-actions` sets direction/gap/alignment but
          deliberately no outer margin, and this row follows the taxonomy rows with nothing else
          separating them. Scoped here rather than added to `.editor-actions` itself, which is
          shared with screens where a blanket top margin would be wrong. */}
      <span className="editor-actions term-picker-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={save}
          disabled={saving || !dirty}
          {...agentHandle({ handle: "term-picker-save" }, {
            role: "button",
            label: `Save this ${subject}'s categories and tags as checked above`,
          })}
        >
          {saving ? t("Saving…") : t("Save categories & tags")}
        </button>
        {message ? <span className="save-ok">{message}</span> : null}
        {error ? <span className="save-error">{error}</span> : null}
      </span>
    </section>
  );
}
