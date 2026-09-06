import { useState } from "react";

/**
 * @file State/behavior for `JsonFieldControl` (`CollectionEntryEditor.tsx`) — a `json`-kind
 * dynamic field's own textarea buffer and parse gate, pulled out per this admin's "no functions or
 * derived logic in a .tsx file" rule.
 *
 * The textarea keeps its own local text buffer, independent of the parsed value the parent holds:
 * `onChange` only fires — and only ever fires with a value that parsed — when the current buffer
 * is valid JSON. An in-progress edit that is momentarily invalid JSON (a half-typed bracket, a
 * trailing comma) never reaches the parent's `extFields` state, so the last *valid* value stays
 * there untouched until the buffer parses again. This is what keeps a save mid-edit from silently
 * replacing the field's stored value with `undefined` or a parse failure.
 */

/** Renders `value` as the textarea's initial buffer. `undefined` (no stored value yet) prints as
 *  `"null"` — the same way a `json`-kind field with nothing stored round-trips through the server. */
function stringifyFieldValue(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value, null, 2);
}

export interface JsonFieldControlState {
  /** The textarea's current buffer — may be invalid JSON mid-edit. */
  text: string;
  /** True while `text` does not currently parse as JSON. Reflects the BUFFER, not the last value
   *  handed to `onChange` — the stored value is never in an invalid state. */
  parseError: boolean;
  /** The textarea's `onChange` handler: always updates the buffer, and forwards the parsed value
   *  to `onChange` only when the buffer parses. */
  handleTextChange: (nextText: string) => void;
}

/**
 * @complexity O(n) in the edited text's length once per call (`JSON.parse`); state is a single
 * string buffer plus a boolean flag, not a growing history.
 */
export function useJsonFieldControl(props: { value: unknown; onChange: (value: unknown) => void }): JsonFieldControlState {
  const [text, setText] = useState(() => stringifyFieldValue(props.value));
  const [parseError, setParseError] = useState(false);

  function handleTextChange(nextText: string) {
    setText(nextText);
    try {
      const parsed: unknown = JSON.parse(nextText);
      setParseError(false);
      props.onChange(parsed);
    } catch {
      setParseError(true);
    }
  }

  return { text, parseError, handleTextChange };
}
