import { Icon } from "@jini-ai/ui";
import { useT } from "@jini-ai/chat/react";

import { useFsFolderIndicator } from "./FsFolderIndicator.hooks";

/**
 * @file The chat composer's folder control — renders above the composer's textarea (passed as
 * `AssistantDock.tsx`'s `leadingAccessory`, the same slot `SelectedAgentPluginTray` uses) so the
 * operator can see, at a glance, which folder (if any) the assistant's `fs_list_files`/
 * `fs_read_file` tools can currently reach outside this repo/site (`custom` in
 * `features/fs-files/layout.ts`), and change it in one action.
 *
 * Deliberately its own small pill, not a reuse of `.jini-attachment-tray`/`.jini-attachment-chip`:
 * those classes are scoped (see `assistant.css`'s own comment on that block) to being the ONLY
 * thing rendered inside `.jini-composer-leading` besides this one, and already carry a
 * remove-button/no-edit-affordance shape built for a list of many chips, not this control's single
 * always-present indicator plus its own inline editor. New, minimal CSS lives in `assistant.css`
 * under `.tovu-fs-folder-indicator`.
 *
 * PATH ONLY: picking or typing a folder here never uploads or reads its contents — see
 * `FsFolderIndicator.hooks.ts` and `custom-root-store.ts`'s own headers. Nothing renders a file
 * tree or preview; the only round trip is the path string itself.
 */
export function FsFolderIndicator() {
  const state = useFsFolderIndicator();
  const t = useT();

  // Before the initial GET settles, render nothing rather than a flash of "No folder" that would
  // immediately be replaced — `path` is `undefined` only for that first instant (see the hook's
  // own doc), never once real state is known.
  if (state.path === undefined) return null;

  if (state.editing) {
    return (
      <form
        className="tovu-fs-folder-indicator tovu-fs-folder-indicator--editing"
        onSubmit={(e) => {
          e.preventDefault();
          state.submit();
        }}
      >
        <span className="tovu-fs-folder-indicator__icon">
          <Icon name="folder" size={14} />
        </span>
        <input
          type="text"
          className="tovu-fs-folder-indicator__input"
          value={state.draft}
          onChange={(e) => state.setDraft(e.target.value)}
          placeholder="/absolute/path/to/a/folder"
          aria-label={t("Folder path for the assistant to read")}
          autoFocus
          disabled={state.pending}
        />
        <button type="submit" className="tovu-fs-folder-indicator__action" disabled={state.pending || state.draft.trim().length === 0}>
          {t("Set")}
        </button>
        <button type="button" className="tovu-fs-folder-indicator__action" onClick={state.cancelEditing} disabled={state.pending}>
          {t("Cancel")}
        </button>
        {state.error ? (
          <span className="tovu-fs-folder-indicator__error" role="alert">
            {state.error}
          </span>
        ) : null}
      </form>
    );
  }

  return (
    <div className="tovu-fs-folder-indicator">
      <button
        type="button"
        className="tovu-fs-folder-indicator__chip"
        onClick={state.startEditing}
        title={state.path ?? t("No folder set — click to give the assistant access to one")}
      >
        <span className="tovu-fs-folder-indicator__icon">
          <Icon name="folder" size={14} />
        </span>
        <span className="tovu-fs-folder-indicator__label">{state.path ? folderBaseName(state.path) : t("No folder set")}</span>
      </button>
      {state.path ? (
        <button
          type="button"
          className="tovu-fs-folder-indicator__action tovu-fs-folder-indicator__remove"
          onClick={state.clear}
          title={t("Stop sharing this folder")}
          aria-label={t("Stop sharing this folder")}
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
}

/** Last path segment for display only — the full path stays available via the chip's `title`
 *  tooltip. A trailing separator (`/foo/bar/`) is stripped first so it names `bar`, not `""`. Never
 *  used for anything but a label: every actual request still sends `state.path`/`state.draft`
 *  verbatim. Splits on both separators so a Windows-style path pasted into the browser field still
 *  gets a sensible label. */
function folderBaseName(fullPath: string): string {
  const trimmed = fullPath.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/);
  return segments[segments.length - 1] || fullPath;
}
