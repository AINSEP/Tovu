import type { AdminDockerfileSource } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { dockerfileLineCountLabel } from "./deployment-i18n";
import { LayersIcon } from "./deployment-visuals";
import { useWiredDockerfileSource } from "./hooks/use-dockerfile-source.hooks";

/**
 * @file Dockerfile tab — read-only view of the repo-root `Dockerfile`'s current contents, fetched
 * from `GET .../system/dockerfile` (`src/server/routes/admin/system/dockerfile-source.ts`).
 * Read-only on purpose: there is no write route, and this tab must not imply the admin can rebuild
 * or edit-and-save itself. Building is a `docker build …` command run in a terminal — the footer
 * note says so, and there is no build button anywhere on this tab.
 *
 * ## Second pass (2026-08-15) — what changed and why
 *
 * The Copy/Download actions were laid out with `.deployment-provider-row`, a class belonging to the
 * Full Site tab's provider rows, because no primitive existed for "card title on the left, its
 * actions on the right". `.card-head` (`styles.css`) is that primitive now, so this tab uses it and
 * the borrowed class goes back to meaning one thing.
 *
 * The viewer itself was a borderless `--surface-3` slab inside a `--surface` card, which read as a
 * hole punched in the card rather than a panel sitting in it — it was also the only element across
 * the five tabs with no border. It is now `--surface-2` with the same hairline every other bounded
 * region on this screen uses.
 *
 * The line count is new and is derived, not invented: it counts the newlines in the fetched
 * `contents`. It exists because a scrollable pane with no length indicator gives the reader no idea
 * whether they are looking at a 20-line file or a 200-line one until they scroll to the end.
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

/** How many lines the fetched source has. A trailing newline is not a line, hence the `trimEnd` —
 *  otherwise every file that ends the way text files should would report one line too many.
 *  @complexity O(n) in the source length, once per render of a file that is already in memory. */
function countLines(contents: string): number {
  return contents.trimEnd().split("\n").length;
}

/** The "not generated yet" state — `snapshot.exists === false`. A composed block rather than the
 *  default `.empty-state`'s two centered grey sentences: this is a durable state of the product,
 *  not a transient one, and a truthful "this does not exist yet" should still look deliberate. */
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

/** The loaded, existing Dockerfile's viewer: Copy/Download actions, the scrollable source block,
 *  and the "this is a terminal command, not a button" footer note. */
function DockerfileSourceViewer({
  contents,
  copied,
  onCopy,
  t,
}: {
  contents: string;
  copied: boolean;
  onCopy: () => void;
  t: Translate;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">{t("Dockerfile")}</h2>
        <div className="card-head-actions">
          <span className="deployment-provider-cost">{dockerfileLineCountLabel(t, countLines(contents))}</span>
          <button type="button" className="btn-secondary" onClick={onCopy}>
            {/* `aria-live="polite"` so the label's swap to "Copied!" is announced — an action whose
                only feedback is a silent visual change is invisible to a screen-reader user. */}
            <span aria-live="polite">{copied ? t("Copied!") : t("Copy")}</span>
          </button>
          <button type="button" className="btn-secondary" onClick={() => downloadDockerfile(contents)}>
            {t("Download")}
          </button>
        </div>
      </div>
      <div className="deployment-card-body">
        <pre className="deployment-dockerfile-viewer" tabIndex={0} translate="no">
          <code>{contents}</code>
        </pre>
        <p className="deployment-action-reason">{t("Building is a terminal command (docker build …), not a button here.")}</p>
      </div>
    </div>
  );
}

export function DockerfileTab(props: DockerfileTabProps) {
  const useDockerfileSourceHook = resolveDockerfileSourceHook(props.useDockerfileSourceHook);
  const { snapshot, error, copied, copy, t } = useDockerfileSourceHook();

  if (error && !snapshot) return <div className="notice error">{error}</div>;
  if (!snapshot) return <div className="notice">{t("Loading Dockerfile…")}</div>;

  return (
    <div className="deployment-tab">
      {error ? <div className="notice error">{error}</div> : null}
      {dockerfileTabBody(snapshot, { copied, onCopy: () => void copy(), t })}
    </div>
  );
}

/** Dispatches the loaded snapshot's two shapes (missing vs. present) as a flat function rather than
 *  a ternary inline in `DockerfileTab`'s own JSX — same complexity-gate reasoning
 *  `Deployment.tsx`'s `deploymentTabPanel` documents. */
function dockerfileTabBody(
  snapshot: AdminDockerfileSource,
  actions: { copied: boolean; onCopy: () => void; t: Translate }
) {
  if (!snapshot.exists || snapshot.contents === null) return <DockerfileEmptyState t={actions.t} />;
  return (
    <DockerfileSourceViewer contents={snapshot.contents} copied={actions.copied} onCopy={actions.onCopy} t={actions.t} />
  );
}
