import type { AdminDockerfileSource } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { useWiredDockerfileSource } from "./hooks/use-dockerfile-source.hooks";

/**
 * @file Dockerfile tab — read-only view of the repo-root `Dockerfile`'s current contents, fetched
 * from `GET .../system/dockerfile` (`src/server/routes/admin/system/dockerfile-source.ts`).
 * Read-only on purpose: there is no write route, and this tab must not imply the admin can rebuild
 * or edit-and-save itself. Building is a `docker build …` command run in a terminal — the footer
 * note says so, and there is no build button anywhere on this tab.
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

/** The "not generated yet" empty state — `snapshot.exists === false`. Explains what will appear
 *  here rather than just saying "empty", per the brief's own instruction. */
function DockerfileEmptyState({ t }: { t: Translate }) {
  return (
    <div className="card">
      <div className="empty-state">
        <p>{t("Not generated yet")}</p>
        <p className="page-description">
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
      <div className="deployment-provider-row">
        <h2>{t("Dockerfile")}</h2>
        <div className="page-actions">
          <button type="button" className="btn-secondary" onClick={onCopy}>
            {copied ? t("Copied!") : t("Copy")}
          </button>
          <button type="button" className="btn-secondary" onClick={() => downloadDockerfile(contents)}>
            {t("Download")}
          </button>
        </div>
      </div>
      <pre className="deployment-dockerfile-viewer">
        <code>{contents}</code>
      </pre>
      <p className="field-hint">{t("Building is a terminal command (docker build …), not a button here.")}</p>
    </div>
  );
}

export function DockerfileTab(props: DockerfileTabProps) {
  const useDockerfileSourceHook = resolveDockerfileSourceHook(props.useDockerfileSourceHook);
  const { snapshot, error, copied, copy, t } = useDockerfileSourceHook();

  if (error && !snapshot) return <div className="notice error">{error}</div>;
  if (!snapshot) return <div className="notice">{t("Loading Dockerfile…")}</div>;

  return (
    <div>
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
