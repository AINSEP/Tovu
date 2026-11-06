import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import type { CredentialWarning } from "./hooks/site-transfer-dependencies.hooks";
import { credentialFileCount } from "./hooks/use-share-credential-gate.hooks";
import { SiteFlagIcon } from "./sites-visuals";

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

/** Each file once, with every kind of credential it may hold: warnings arrive one per file and kind. */
function warningsByFile({ warnings }: { warnings: readonly CredentialWarning[] }, _options = {}): [string, string[]][] {
  const files = new Map<string, string[]>();
  for (const { path, kind } of warnings) {
    const kinds = files.get(path) ?? [];
    if (!kinds.includes(kind)) kinds.push(kind);
    files.set(path, kinds);
  }
  return [...files];
}

/** A collapsed list of each file and what it may contain; native details keeps keyboard and screen-reader behavior. */
export function CredentialWarningList({ warnings, t }: { warnings: readonly CredentialWarning[]; t: Translate }) {
  if (!warnings.length) return null;
  return (
    <details className="site-transfer-credential-files">
      <summary>{t("Show files")}</summary>
      <ul>
        {warningsByFile({ warnings }).map(([path, kinds]) => (
          <li key={path}>
            <code className="site-transfer-credential-path">{path}</code>
            {kinds.map(kind => <span key={kind} className="site-transfer-credential-kind">{kind}</span>)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Every export and import notice is a small yellow warning sign beside the row's status, never a box
 * (owner, 2026-11-05). InfoTip is the shared hover, tap and keyboard tooltip. Renders nothing with no notices.
 */
export function TransferNoticeTip({ notices, t }: { notices: readonly string[]; t: Translate }) {
  if (!notices.length) return null;
  return (
    <span className="site-transfer-notice-tip">
      <InfoTip icon={<SiteFlagIcon size={16} />} triggerLabel={t("Warning")} label={notices.join("\n")} agentHandle={false} />
    </span>
  );
}
