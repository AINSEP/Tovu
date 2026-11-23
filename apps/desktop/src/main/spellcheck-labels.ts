import type { SpellCheckLabels } from "@jini-ai/desktop-host/electron/usability";

/** This app's right-click spelling-menu wording, supplied to `@jini-ai/desktop-host/shell/spellcheck-menu`. */
export const SPELLCHECK_MENU_LABELS: SpellCheckLabels = {
  noSuggestions: "No suggestions", addToDictionary: "Add to Dictionary",
  cut: "Cut", copy: "Copy", paste: "Paste", selectAll: "Select All",
};
