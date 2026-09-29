// @ts-check
import { createBackupPusher } from "./backup-push.mjs";
import { createSiteCommitter } from "./commit-site.mjs";
import { createFileWriter, createGitDataClient } from "./write-files.mjs";

/**
 * @file GitHub source-control provider for the Tovu `github` plugin.
 *
 * Core knows only the generic contract (`apps/website/src/features/source-control/provider-module.ts`)
 * and loads this file through its source-control registry, because Tovu shipped it. Everything
 * GitHub-specific about committing the site, writing files through a saved credential, pushing a
 * site backup and reading a token's account name lives in this directory. Plain JS, no npm imports:
 * an installed plugin has none, so everything else comes from the kit core passes in.
 *
 * @typedef {{
 *   fetch(url: string, init: RequestInit): Promise<Response>,
 *   redirectGuardInit(init: RequestInit): RequestInit,
 *   assertNotRedirected(response: Response, hostName: string): void,
 *   isRedirectRefusal(error: unknown): boolean,
 *   httpClient: { send(request: { method: string, url: string, headers: Record<string, string>, body?: string,
 *     timeoutMs: number }): Promise<{ status: number, bodyText: string }> },
 *   describeTransportError(error: unknown): { refusal: string | undefined, logDetail: string },
 * }} Kit
 */

const GITHUB_API = "https://api.github.com";

/** Bounds the account-name probe: a human is waiting on the credential form. */
const ACCOUNT_LABEL_PROBE_TIMEOUT_MS = 10_000;

export default {
  /** @param {{ kit: Kit }} context */
  create({ kit }) {
    const git = createGitDataClient(kit);
    const writer = createFileWriter(git);
    const backup = createBackupPusher(git);
    return {
      apiOrigin: GITHUB_API,
      commitSite: createSiteCommitter(kit),

      /**
       * `GET /user` -> `login`, the public name GitHub prints in every profile URL (never email, plan
       * or org membership). Best effort: any failure is `null`, never a throw.
       * @param {string} token
       */
      async readAccountLabel(token) {
        try {
          const resp = await kit.fetch(`${GITHUB_API}/user`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(ACCOUNT_LABEL_PROBE_TIMEOUT_MS),
          });
          if (!resp.ok) return null;
          const body = await resp.json();
          const login = typeof body === "object" && body !== null ? body.login : undefined;
          return typeof login === "string" && login !== "" ? login : null;
        } catch {
          return null;
        }
      },

      planFileWrite: writer.planFileWrite,
      commitFiles: writer.commitFiles,
      inspectBackupRepository: backup.inspectBackupRepository,
      uploadBackupBlob: backup.uploadBackupBlob,
      commitBackupTree: backup.commitBackupTree,
    };
  },
};
