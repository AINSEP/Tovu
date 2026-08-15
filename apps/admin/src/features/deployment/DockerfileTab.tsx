import type { AdminDockerfileSource } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { dockerfileLineCountLabel } from "./deployment-i18n";
import { LayersIcon } from "./deployment-visuals";
import { useWiredDockerfileSource } from "./hooks/use-dockerfile-source.hooks";

/**
 * @file Dockerfile tab — the repo-root `Dockerfile`'s contents, fetched from and now also written to
 * `.../system/dockerfile` (`src/server/routes/admin/system/dockerfile-source.ts`).
 *
 * ## Third pass (2026-08-15) — read-only became editable
 *
 * This file's own header used to say "Read-only on purpose: there is no write route" as the reason
 * this tab could never save an edit. That stopped being true the same day, mid-session: the backend
 * gained `PUT .../system/dockerfile` (`system.write`-gated, distinct from `GET`'s `system.read`) so
 * that both a human here and the `deployment_set_dockerfile` agent tool can write the same file — but
 * only the agent side got wired up at first. The AI assistant could edit the Dockerfile through its
 * tool; the human owner, looking at this exact screen, could not. This pass closes that gap: the
 * `<pre><code>` viewer is now a `<textarea>` bound to `useDockerfileSource`'s `draft`, with a Save
 * button next to Copy/Download.
 *
 * The "no Dockerfile yet" empty state gained the same editor rather than staying a dead end — the
 * write route creates the file if it doesn't exist (`writeDockerfileSource`'s own doc), so a human
 * typing a fresh Dockerfile into this screen and clicking Save is exactly as valid as the agent tool
 * calling `deployment_set_dockerfile` on a workspace with no Dockerfile yet. The illustrated
 * "Not generated yet" block from the second pass stays exactly as it was, ahead of the editor, rather
 * than being replaced by it — this tab still owes the reader an honest "this doesn't exist yet"
 * before handing them a blank box to fill in.
 *
 * Saving does not build, validate, or deploy anything — same as before, just now said twice: once in
 * the pre-existing "Building is a terminal command…" footer line (still true, still there), and once
 * in a new second line that names the Save button specifically, since a reader who has just watched
 * this tab grow a Save button has a new, reasonable reason to wonder whether it also rebuilds.
 *
 * `useDirtyGuard` is wired for the one form of "leaving with unsaved changes" this tab can protect
 * against on its own — closing or reloading the browser tab (`beforeunload`). It is deliberately NOT
 * wired to `TabBar`'s own tab-switch or to sidebar navigation: `Deployment.tsx`'s `deploymentTabPanel`
 * unmounts this component when the operator switches to another of the five tabs, same as leaving any
 * other screen in this admin, and NO editor screen in this app guards THAT kind of navigation today
 * (only in-app "back" links some screens wire individually) — extending that pattern app-wide is a
 * separate, larger decision than "make this one tab editable."
 */
export interface DockerfileTabProps {
  /** DI seam for tests — same convention as every other wired-hook prop in this app. */
  useDockerfileSourceHook?: typeof useWiredDockerfileSource;
}

/** Resolves {@link DockerfileTabProps.useDockerfileSourceHook} to the real hook when a caller
 *  passes none — same reasoning as `OverviewTab.tsx`'s `resolveDeploymentOverviewHook`. */
function resolveDockerfileSourceHook(
  override: typeof useWiredDockerfileSource | undefined
): typeof useWiredDockerfileSource {
  return override ?? useWiredDockerfileSource;
}

/** Triggers a browser file download of `contents` as `Dockerfile` — plain DOM manipulation with no
 *  state of its own to expose, so it stays a local function rather than living in the hook (see
 *  `use-dockerfile-source.hooks.ts`'s header for why `copy` DOES live there but this doesn't).
 *  `URL.revokeObjectURL` after the click so the blob URL doesn't leak for the rest of the page's
 *  lifetime — the anchor never needs to be appended to the document for `.click()` to fire it. */
function downloadDockerfile(contents: string): void {
  const blob = new Blob([contents], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Dockerfile";
  anchor.click();
  URL.revokeObjectURL(url);
}

/** How many lines the editor's current draft has. A trailing newline is not a line, hence the
 *  `trimEnd` — otherwise every file that ends the way text files should would report one line too
 *  many. Counts `draft`, not the last-saved `snapshot.contents`, so the count tracks what the
 *  operator is actually looking at, including unsaved edits.
 *  @complexity O(n) in the draft's length, once per render of an already-in-memory string. */
function countLines(draft: string): number {
  if (!draft) return 0;
  return draft.trimEnd().split("\n").length;
}

/** The "not generated yet" illustrated block — `snapshot.exists === false`. Unchanged from the
 *  second pass: still a composed block rather than the default `.empty-state`'s two centered grey
 *  sentences, because this remains a durable, truthful state of the product ("nothing here yet"),
 *  not a transient one. What changed is that this block no longer speaks for the whole empty case by
 *  itself — `dockerfileTabBody` now renders the editor card right below it, so the reader's very
 *  next move can be "write one." */
function DockerfileEmptyState({ t }: { t: Translate }) {
  return (
    <div className="card">
      <div className="deployment-empty">
        <span className="deployment-empty-mark">
          <LayersIcon size={22} />
        </span>
        {/* A real `<h2>` for the same reason `HistoryTab.tsx`'s own empty state documents: in this
            state it is the tab's only heading. */}
        <h2 className="deployment-empty-title">{t("No Dockerfile yet")}</h2>
        <p className="deployment-empty-body">
          {t("No Dockerfile exists at the repo root yet. Once one is added, its contents will appear here.")}
        </p>
      </div>
    </div>
  );
}

/** The editable Dockerfile card: Copy/Download/Save actions, the line count, an "unsaved changes"
 *  pill, and the textarea itself — the one card that renders in BOTH the "exists" and "doesn't exist
 *  yet" cases (see `dockerfileTabBody`), since the write route makes both cases the same underlying
 *  action (replace the file's bytes with `draft`). */
function DockerfileEditorCard({
  exists,
  draft,
  setDraft,
  isDirty,
  saving,
  saveError,
  saved,
  copied,
  onCopy,
  onSave,
  t,
}: {
  exists: boolean;
  draft: string;
  setDraft: (value: string) => void;
  isDirty: boolean;
  saving: boolean;
  saveError: string | null;
  saved: boolean;
  copied: boolean;
  onCopy: () => void;
  onSave: () => void;
  t: Translate;
}) {
  // Copy/Download act on `draft` — see `use-dockerfile-source.hooks.ts`'s header for why the copy
  // handler itself reads `draft` rather than the last-saved `snapshot`. There is nothing worth
  // copying or downloading out of an empty, untouched box, so both are disabled on a blank draft
  // rather than handing the operator an empty file with no feedback about why.
  const hasContent = draft.length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">{t("Dockerfile")}</h2>
        <div className="card-head-actions">
          <span className="deployment-provider-cost">{dockerfileLineCountLabel(t, countLines(draft))}</span>
          {isDirty ? <span className="status status-warning">{t("Unsaved changes")}</span> : null}
          {saved ? <span className="save-ok">{t("Saved")}</span> : null}
          <button type="button" className="btn-secondary" onClick={onCopy} disabled={!hasContent}>
            {/* `aria-live="polite"` so the label's swap to "Copied!" is announced — an action whose
                only feedback is a silent visual change is invisible to a screen-reader user. */}
            <span aria-live="polite">{copied ? t("Copied!") : t("Copy")}</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => downloadDockerfile(draft)}
            disabled={!hasContent}
          >
            {t("Download")}
          </button>
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? t("Saving…") : t("Save")}
          </button>
        </div>
      </div>
      <div className="deployment-card-body">
        {!exists ? (
          <p className="deployment-action-reason">{t("No Dockerfile exists yet. Write one below, then save to create it.")}</p>
        ) : null}
        {saveError ? (
          <p className="save-error" role="alert">
            {saveError}
          </p>
        ) : null}
        <textarea
          className="deployment-dockerfile-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          translate="no"
          aria-label={t("Dockerfile contents")}
        />
        <p className="deployment-action-reason">
          {t("Building is a terminal command (docker build …), not a button here.")}
        </p>
        <p className="deployment-action-reason">
          {t("Saving here only replaces the file's contents — it does not build or deploy anything.")}
        </p>
      </div>
    </div>
  );
}

export function DockerfileTab(props: DockerfileTabProps) {
  const useDockerfileSourceHook = resolveDockerfileSourceHook(props.useDockerfileSourceHook);
  const { snapshot, draft, setDraft, isDirty, error, saving, saveError, saved, copied, copy, save, t } =
    useDockerfileSourceHook();

  if (error && !snapshot) return <div className="notice error">{error}</div>;
  if (!snapshot) return <div className="notice">{t("Loading Dockerfile…")}</div>;

  return (
    <div className="deployment-tab">
      {error ? <div className="notice error">{error}</div> : null}
      {dockerfileTabBody(snapshot, {
        draft,
        setDraft,
        isDirty,
        saving,
        saveError,
        saved,
        copied,
        onCopy: () => void copy(),
        onSave: () => void save(),
        t,
      })}
    </div>
  );
}

/** Dispatches the loaded snapshot's two shapes (missing vs. present) as a flat function rather than
 *  a ternary inline in `DockerfileTab`'s own JSX — same complexity-gate reasoning
 *  `Deployment.tsx`'s `deploymentTabPanel` documents. The editor card renders in BOTH shapes now (see
 *  `DockerfileEditorCard`'s own doc); only the illustrated empty-state block is conditional. */
function dockerfileTabBody(
  snapshot: AdminDockerfileSource,
  editor: {
    draft: string;
    setDraft: (value: string) => void;
    isDirty: boolean;
    saving: boolean;
    saveError: string | null;
    saved: boolean;
    copied: boolean;
    onCopy: () => void;
    onSave: () => void;
    t: Translate;
  }
) {
  return (
    <>
      {!snapshot.exists ? <DockerfileEmptyState t={editor.t} /> : null}
      <DockerfileEditorCard exists={snapshot.exists} {...editor} />
    </>
  );
}
