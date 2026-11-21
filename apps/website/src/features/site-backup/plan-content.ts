import { SiteBackupPlanStore, type SiteBackupPlan as JiniSiteBackupPlan } from "@jini-ai/devops/backup/plan-store";

import type { BackupRepositoryState } from "@jini-ai/devops/source-control";
import type { PlannedDiskFile, SiteBackupInclude, SiteBackupScope, SkippedSiteBackupFile } from "./sources.js";

/** Everything `site_backup_push` needs from the plan, so it never re-derives what the human saw. */
export interface SiteBackupCommonContent {
  readonly credentialWarnings?: readonly import("./credential-warnings.js").CredentialWarning[];
  readonly include: SiteBackupInclude;
  /** `null` when the database scope is off. */
  readonly database: { readonly bytes: Buffer; readonly watermarkAtCapture: number } | null;
  readonly files: readonly PlannedDiskFile[];
  readonly skipped: readonly SkippedSiteBackupFile[];
  readonly scopeNotes: Partial<Record<SiteBackupScope, string>>;
  /** Database snapshot plus every disk file, in bytes (the manifest is not counted). */
  readonly totalBytes: number;
  readonly site: { readonly name: string; readonly folderName: string };
  readonly schema: { readonly index: number; readonly tag: string };
  readonly tovuVersion: string;
  /** When the plan (and its database snapshot) was made — the manifest's `createdAt`. */
  readonly createdAt: string;
}

/** Repository fields remain source-compatible; ZIP targets never need a credential or git state. */
export interface SiteBackupPlanContent extends SiteBackupCommonContent {
  readonly target?: { readonly kind: "repository" };
  readonly credentialLabel: string;
  readonly owner: string;
  readonly repo: string;
  readonly folder: string;
  readonly commitMessage: string;
  /** Branch, tip and tree at plan time. The push commits on THIS parent, so a branch that moved in
   *  between is refused by GitHub's non-force ref update. */
  readonly repository: BackupRepositoryState;
}

export interface SiteSharePlanContent extends SiteBackupCommonContent {
  readonly notices?: readonly string[];
  readonly encryptedKeys?: typeof import("./saved-keys-port.js").ENCRYPTED_KEYS_DESCRIPTOR;
  readonly sealedPassword?: import("@jini-ai/platform/secrets").SealedSecret;

  readonly target: { readonly kind: "zip" };
  readonly profile: "share";
  readonly media?: readonly import("./archive-manifest.js").ArchiveMedia[];
  readonly plugins?: readonly import("./archive-manifest.js").ArchivePlugin[];
  readonly bufferedFiles?: readonly { readonly path: string; readonly content: Buffer }[];
  readonly staticSite?: import("./static-copy.js").StaticSiteMetadata;
  readonly staticSiteOmitted?: string;
}

export type SiteBackupPlan = JiniSiteBackupPlan<SiteBackupPlanContent>;
export type TovuBackupPlanStore = SiteBackupPlanStore<SiteBackupPlanContent>;

/** The process-wide store the tools use unless a test injects its own. */
export const siteBackupPlanStore = new SiteBackupPlanStore<SiteBackupPlanContent>({});
