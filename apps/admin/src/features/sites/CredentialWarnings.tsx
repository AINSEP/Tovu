import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import type { CredentialWarning } from "./hooks/site-transfer-dependencies.hooks";
import { credentialFileCount } from "./hooks/use-share-credential-gate.hooks";

/**
 * @file The credential warning copy and file list shared by the Export and Import tabs (owner,
 * 2026-11-03: credential-looking content is kept and the user is told where). Paths and kind
 * labels come from the server; matched values never reach the admin.
 */

/** "This export/import may contain credentials in N files." Literal keys so every locale carries them. */
export function credentialSummary({ subject, warnings, t }: { subject: "export" | "import"; warnings: readonly CredentialWarning[]; t: Translate }, _options = {}): string {
  const count = credentialFileCount(warnings);
  if (subject === "import") {
    return count === 1 ? t("This import may contain credentials in 1 file.") : interpolate({ template: t("This import may contain credentials in {count} files."), vars: { count } });
  }
  if (count === 0) return t("This export may contain credentials.");
  return count === 1 ? t("This export may contain credentials in 1 file.") : interpolate({ template: t("This export may contain credentials in {count} files."), vars: { count } });
}

/** A collapsed list of each file and what it may contain; native details keeps keyboard and screen-reader behavior. */
export function CredentialWarningList({ warnings, t }: { warnings: readonly CredentialWarning[]; t: Translate }) {
  if (!warnings.length) return null;
  return (
    <details className="site-transfer-credential-files">
      <summary>{t("Show files")}</summary>
      <ul>
        {warnings.map(warning => (
          <li key={`${warning.path}\n${warning.kind}`}>
            <code className="site-transfer-credential-path">{warning.path}</code>
            <span className="site-transfer-credential-kind">{warning.kind}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The import's non-blocking notice: imports need no acknowledgement. */
export function ImportCredentialNotice({ warnings, t }: { warnings: readonly CredentialWarning[] | undefined; t: Translate }) {
  if (!warnings?.length) return null;
  return (
    <div className="notice warning site-transfer-credentials" role="status">
      <p>{credentialSummary({ subject: "import", warnings, t })}</p>
      <CredentialWarningList warnings={warnings} t={t} />
    </div>
  );
}
