import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { SuggestInput } from "@jini-ai/ui/admin-widgets";
import { useId } from "react";
import type { AdminTaxonomyWithTerms } from "@/lib/api";
import { useWiredTermPicker, type TermPickerController } from "./hooks/use-term-picker.hooks";
import { useTermListReveal } from "./hooks/use-term-list-reveal.hooks";

/**
 * @file The Categories & Tags box the post, page and collection-entry editors mount (design-spec.md
 * §1.6) — markup only. The boxes start ticked for the terms the content holds, and Save makes it hold
 * exactly the ticked ones; state, loads and the save live in `hooks/use-term-picker.hooks.ts`.
 *
 * Each row also takes a typed name — ticks the matching term or creates it — when the admin may
 * create terms (see the hook's header).
 *
 * A long row folds: it shows a few terms (ticked first) with a "See more" that reveals up to 100,
 * plus a search box past 100 — see `TermChecklist` below (owner, 2026-10-22).
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
  // Keyed by id, not render position: a row shows only some of its terms ("See more"), and a
  // term's handle must not change with what else is on screen.
  const termIds = taxonomies.flatMap(({ terms }) => terms.map((term) => term.id));
  const termHandles = buildAgentListHandles({ prefix: "term-picker-term", ids: termIds });
  const termHandleById = new Map(termIds.map((termId, index) => [termId, termHandles[index]!]));
  const taxonomyIds = taxonomies.map(({ taxonomy }) => taxonomy.id);
  const addInputHandles = buildAgentListHandles({ prefix: "term-picker-new-term", ids: taxonomyIds });
  const addTriggerHandles = buildAgentListHandles({ prefix: "term-picker-open-new-term", ids: taxonomyIds });
  const addButtonHandles = buildAgentListHandles({ prefix: "term-picker-add-term", ids: taxonomyIds });
  const moreHandles = buildAgentListHandles({ prefix: "term-picker-more", ids: taxonomyIds });
  const searchHandles = buildAgentListHandles({ prefix: "term-picker-search", ids: taxonomyIds });

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
                  <TermChecklist
                    taxonomy={taxonomy}
                    terms={terms}
                    picker={picker}
                    handles={{
                      term: (termId) => termHandleById.get(termId)!,
                      more: moreHandles[groupIndex]!,
                      search: searchHandles[groupIndex]!,
                    }}
                  />
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
                    {/* Our own suggestion list, not a native `<datalist>`: Chrome on macOS draws that
                        as a dark bubble and adds a large ▼ to the box, unstyleable (owner,
                        2026-10-10: "why does the dropdown look so funny?"). Picking a suggestion
                        ticks that term right away. */}
                    <SuggestInput
                      aria-label={t("Term name")}
                      placeholder={t("Type a name, then press Enter")}
                      value={picker.newTermName(id)}
                      suggestions={suggestions}
                      onPick={(name) => picker.pickSuggestion(id, name)}
                      disabled={loading}
                      onValueChange={(value) => picker.setNewTermName(id, value)}
                      onKeyDown={(e) => picker.onNewTermKeyDown(id, e)}
                      agentHandle={addInputHandles[groupIndex]!}
                      agentLabel={`A "${taxonomy.name}" term name to tag this ${subject} with — an existing one is ticked, a new one is created then ticked; press Enter`}
                    />
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

/**
 * One taxonomy row's checkboxes. Shows the first few, with ticked terms first; "See more" reveals
 * up to 100 and "Show less" folds them back; past 100 a search box finds any term (owner,
 * 2026-10-22: "looking at all this up front is a lot"). What shows is `rules.ts`'s `termListView`.
 */
function TermChecklist(props: {
  taxonomy: AdminTaxonomyWithTerms["taxonomy"];
  terms: AdminTaxonomyWithTerms["terms"];
  picker: TermPickerController;
  handles: { term: (termId: string) => string; more: string; search: string };
}) {
  const { taxonomy, terms, picker, handles } = props;
  const { selected, toggle, loading, subject, t } = picker;
  const reveal = useTermListReveal({ terms, selected, loading });
  const listId = useId();
  return (
    <>
      {reveal.searchable ? (
        <input
          type="search"
          className="term-picker-search"
          aria-label={t("Search terms")}
          aria-controls={listId}
          placeholder={t("Search terms")}
          autoComplete="off"
          value={reveal.query}
          onChange={(event) => reveal.setQuery(event.target.value)}
          {...agentHandle({ handle: handles.search }, {
            role: "field",
            label: `Filter the "${taxonomy.name}" terms shown for this ${subject} by name`,
          })}
        />
      ) : null}
      <div id={listId} className="term-picker-terms">
        {reveal.shown.map((term) => (
          <label key={term.id} className="form-checkbox-field">
            <input
              type="checkbox"
              checked={selected.has(term.id)}
              disabled={loading}
              onChange={() => toggle(term.id)}
              {...agentHandle({ handle: handles.term(term.id) }, {
                role: "checkbox",
                label: `Tag this ${subject} with the "${taxonomy.name}" term "${term.name}"`,
              })}
            />
            {term.name}
          </label>
        ))}
      </div>
      {reveal.canToggle ? (
        <button
          type="button"
          className="link-button term-picker-more"
          aria-expanded={reveal.expanded}
          aria-controls={listId}
          onClick={reveal.toggleExpanded}
          {...agentHandle({ handle: handles.more }, {
            role: "button",
            label: `Show more or fewer of the "${taxonomy.name}" terms`,
          })}
        >
          {reveal.expanded ? t("Show less") : t("See more")}
        </button>
      ) : null}
    </>
  );
}
