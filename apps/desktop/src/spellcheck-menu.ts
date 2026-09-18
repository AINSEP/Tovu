/**
 * @file The right-click spelling-suggestions menu — Electron shows NO native context menu of its
 * own on any `webContents` (unlike a real browser tab), so without this, right-clicking a
 * misspelled word in an editing surface does nothing at all.
 *
 * Registered against two different `webContents`, both from `main.ts`'s `openSitesHomeWindow`: the
 * sites home window's own top-level page (its few text fields — site names, search), and every
 * project tab's `<webview>` guest (via `did-attach-webview`, which is where the real prose lives —
 * the embedded site admin's `FormEditor` and page content). `spellcheck` itself needs no separate
 * enable step: Electron's own `webPreferences` default (`spellcheck: true`) already covers both,
 * and nothing in `webview-guest-policy.ts` overrides it. This file only builds the menu Chromium's
 * `context-menu` event hands the ingredients for but never shows on its own.
 *
 * `buildSpellCheckMenuTemplate` is the whole decision, kept separate from
 * {@link registerSpellCheckContextMenu} for the same reason `find-menu.ts`'s `sendFindToggle` is
 * split from `findMenu`: a plain function is what `spellcheck-menu.test.ts` can call directly,
 * without a real Electron `Menu` or `webContents` to drive it.
 *
 * No `electron` import at module scope — the one place a real `Menu` is needed is an injected
 * default parameter, so this stays testable under plain `node --test` the same way
 * `find-in-page-ipc.ts` keeps `BrowserWindow` at arm's length.
 */
import type { MenuItemConstructorOptions } from "electron";

/** The subset of Electron's own `ContextMenuParams` this file reads. */
export interface SpellCheckContextMenuParams {
  isEditable: boolean;
  misspelledWord: string;
  dictionarySuggestions: string[];
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

/** How many suggestions to offer before the rest are just noise — matches Chrome's own cap. */
const MAX_SUGGESTIONS = 5;

/**
 * Builds the right-click menu for one `context-menu` event: spelling suggestions (and "Add to
 * Dictionary") when the click landed on a misspelled word, then the ordinary edit commands when the
 * target is editable. Returns `[]` for a click with nothing to offer — neither a misspelling nor an
 * editable target — which callers treat as "show no menu" rather than an empty one.
 *
 * @param handlers.replace applies one suggestion, replacing the misspelled word.
 * @param handlers.addToDictionary remembers the misspelled word as correctly spelled from now on.
 * @complexity O(k) in the offered suggestion count, capped at {@link MAX_SUGGESTIONS}.
 */
export function buildSpellCheckMenuTemplate(
  params: SpellCheckContextMenuParams,
  handlers: {
    replace: (word: string) => void;
    addToDictionary: (word: string) => void;
    cut: () => void;
    copy: () => void;
    paste: () => void;
    selectAll: () => void;
  },
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];

  if (params.misspelledWord.length > 0) {
    const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
    if (suggestions.length === 0) {
      template.push({ label: "No suggestions", enabled: false });
    } else {
      for (const suggestion of suggestions) {
        template.push({ label: suggestion, click: () => handlers.replace(suggestion) });
      }
    }
    template.push({ type: "separator" }, { label: "Add to Dictionary", click: () => handlers.addToDictionary(params.misspelledWord) });
  }

  if (params.isEditable) {
    if (template.length > 0) template.push({ type: "separator" });
    template.push(
      { label: "Cut", enabled: params.editFlags.canCut, click: () => handlers.cut() },
      { label: "Copy", enabled: params.editFlags.canCopy, click: () => handlers.copy() },
      { label: "Paste", enabled: params.editFlags.canPaste, click: () => handlers.paste() },
      { type: "separator" },
      { label: "Select All", enabled: params.editFlags.canSelectAll, click: () => handlers.selectAll() },
    );
  }

  return template;
}

/** The slice of a `webContents` {@link registerSpellCheckContextMenu} drives — real or faked in
 *  tests. `replaceMisspelling`/`cut`/`copy`/`paste`/`selectAll` are Electron's own `WebContents`
 *  methods; `session.addWordToSpellCheckerDictionary` is scoped to THIS contents' own session, which
 *  is what makes a guest's dictionary additions follow that project's own partition. */
export interface SpellCheckWebContents {
  on(event: "context-menu", listener: (event: unknown, params: SpellCheckContextMenuParams) => void): unknown;
  replaceMisspelling(text: string): void;
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
  session: { addWordToSpellCheckerDictionary(word: string): void };
}

/** The slice of Electron's `Menu` (the class, not an instance) this file needs. A fake of it is
 *  what tests pass; production leaves it at its default, the real `Menu`. */
export interface MenuBuilder {
  buildFromTemplate(template: MenuItemConstructorOptions[]): { popup(): void };
}

/**
 * Wires one `webContents`' `context-menu` event to {@link buildSpellCheckMenuTemplate} and pops the
 * result. A click with nothing to offer (see that function's own doc) shows no menu at all, rather
 * than an empty native popup.
 *
 * @param menuBuilder Electron's `Menu`, or a fake with `buildFromTemplate`. Required rather than
 *   defaulted: this module keeps no `electron` import of its own (see this file's own header), and
 *   `main.ts` already holds `Menu` from its own top-level import, so there is nothing a default
 *   here could resolve that the caller does not already have.
 * @complexity O(1) to register; each popup is `buildSpellCheckMenuTemplate`'s own cost.
 */
export function registerSpellCheckContextMenu(webContents: SpellCheckWebContents, menuBuilder: MenuBuilder): void {
  webContents.on("context-menu", (_event, params) => {
    const template = buildSpellCheckMenuTemplate(params, {
      replace: (word) => webContents.replaceMisspelling(word),
      addToDictionary: (word) => webContents.session.addWordToSpellCheckerDictionary(word),
      cut: () => webContents.cut(),
      copy: () => webContents.copy(),
      paste: () => webContents.paste(),
      selectAll: () => webContents.selectAll(),
    });
    if (template.length === 0) return;
    menuBuilder.buildFromTemplate(template).popup();
  });
}
