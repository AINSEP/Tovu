import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { useWiredTermPicker } from "./hooks/use-term-picker.hooks";

/**
 * @file The Categories & Tags box the post, page and collection-entry editors mount (design-spec.md
 * §1.6) — markup only. The boxes start ticked for the terms the content holds, and Save makes it hold
 * exactly the ticked ones; state, loads and the save live in `hooks/use-term-picker.hooks.ts`.
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
  const { taxonomies, hidden, subject, selected, toggle, loading, dirty, saving, message, error, save, t } = useTermPickerHook({
    contentType: props.contentType,
    contentId: props.contentId,
  });

  if (hidden) return null;

  // Term ids are database row ids — globally unique across every taxonomy, not just within one —
  // so one flat handle list across all taxonomies is correct.
  const termHandles = buildAgentListHandles(
    "term-picker-term",
    taxonomies.flatMap(({ terms }) => terms.map((term) => term.id)),
  );
  let termHandleIndex = 0;

  return (
    <div className="term-picker">
      <h3>{t("Categories & Tags")}</h3>
      <p className="muted-cell">
        {loading ? t("Loading categories & tags…") : t("Tick the categories and tags that apply, then save.")}
      </p>
      {taxonomies.map(({ taxonomy, terms }) => (
        <fieldset key={taxonomy.id}>
          <legend>{taxonomy.name}</legend>
          {terms.length === 0 ? (
            <p className="muted-cell">{t("No terms yet.")}</p>
          ) : (
            terms.map((term) => {
              // Consumed in rendered (taxonomy, then term) order, matching how `termHandles` was
              // built above via the identical `flatMap` order.
              const handle = termHandles[termHandleIndex];
              termHandleIndex += 1;
              return (
                <label key={term.id} className="term-picker-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.has(term.id)}
                    disabled={loading}
                    onChange={() => toggle(term.id)}
                    {...agentHandle(handle, {
                      role: "checkbox",
                      label: `Tag this ${subject} with the "${taxonomy.name}" term "${term.name}"`,
                    })}
                  />
                  {term.name}
                </label>
              );
            })
          )}
        </fieldset>
      ))}
      {/* `term-picker-actions` is a spacing-only hook layered on `.editor-actions`, same pattern
          as `FormEditor.tsx`'s `.form-actions`: `.editor-actions` sets direction/gap/alignment but
          deliberately no outer margin, and this row follows a stack of `<fieldset>`s with nothing
          else separating them. Scoped here rather than added to `.editor-actions` itself, which is
          shared with screens where a blanket top margin would be wrong. */}
      <span className="editor-actions term-picker-actions">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          {...agentHandle("term-picker-save", {
            role: "button",
            label: `Save this ${subject}'s categories and tags as checked above`,
          })}
        >
          {saving ? t("Saving…") : t("Save categories & tags")}
        </button>
        {message ? <span className="save-ok">{message}</span> : null}
        {error ? <span className="save-error">{error}</span> : null}
      </span>
    </div>
  );
}
