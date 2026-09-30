import type { AdminPublishTargetDescriptor } from "@/lib/api";

/**
 * @file The deploy registry's targets as `GET .../system/publish-targets` returns them — a copy of
 * the shape `content/agent-plugins/deploy/tovu-deploy-targets.json` produces, for the admin's unit
 * tests. The admin itself names no host: every label, field and help string below reaches the UI
 * only through this response.
 */

const TOKEN = { name: "token", label: "Access token", required: true, secret: true as const };

export const GITHUB_PAGES_TARGET: AdminPublishTargetDescriptor = {
  id: "github-pages",
  label: "GitHub Pages",
  configFields: [
    { name: "owner", label: "Owner", required: true, help: "The GitHub user or organization that owns the repository." },
    { name: "repo", label: "Repository", required: true, help: "The site is served from /<repository>." },
    { name: "branch", label: "Branch", required: false, help: "Defaults to gh-pages." },
  ],
  credential: {
    tokenField: "token",
    vendorLabel: "GitHub",
    tokenPageUrl: "https://github.com/settings/tokens",
    fields: [{ ...TOKEN, label: "Personal access token", help: "Needs write access to the repository's contents." }],
  },
  projectName: { label: "Commit message", help: "Used as the commit message on the gh-pages branch." },
};

export const VERCEL_TARGET: AdminPublishTargetDescriptor = {
  id: "vercel",
  label: "Vercel",
  configFields: [{ name: "teamId", label: "Team ID", required: false, help: "Only for a team account." }],
  credential: { tokenField: "token", tokenPageUrl: "https://vercel.com/account/tokens", fields: [{ ...TOKEN, help: "Vercel: Account settings > Tokens." }] },
  projectName: { label: "Vercel project name", help: "Vercel finds or creates a project with this name on every publish." },
};

export const NETLIFY_TARGET: AdminPublishTargetDescriptor = {
  id: "netlify",
  label: "Netlify",
  configFields: [],
  credential: { tokenField: "token", fields: [{ ...TOKEN, label: "Personal access token" }] },
  projectName: { label: "Site name", help: "Netlify finds or creates a site with this name on every publish." },
};

export const CLOUDFLARE_PAGES_TARGET: AdminPublishTargetDescriptor = {
  id: "cloudflare-pages",
  label: "Cloudflare Pages",
  configFields: [],
  credential: {
    tokenField: "token",
    vendorLabel: "Cloudflare",
    help: "Needs an API token with Cloudflare Pages Edit permission, plus the account ID.",
    tokenPageUrl: "https://dash.cloudflare.com/profile/api-tokens",
    fields: [
      { ...TOKEN, label: "API token" },
      { name: "accountId", label: "Account ID", required: true, help: "Shown on the Cloudflare dashboard's account home page." },
    ],
  },
  projectName: { label: "Project name", help: "Cloudflare Pages finds or creates a project with this name on every publish." },
};

/** A host with no saved credential and no config fields — proves the admin needs neither. */
export const PLAIN_TARGET: AdminPublishTargetDescriptor = { id: "plain-host", label: "Plain Host", configFields: [] };

export const PUBLISH_TARGETS: readonly AdminPublishTargetDescriptor[] = [GITHUB_PAGES_TARGET, VERCEL_TARGET, NETLIFY_TARGET, CLOUDFLARE_PAGES_TARGET];

/** The targets that take a saved credential, in registry order. */
export const CREDENTIAL_TARGET_IDS: readonly string[] = PUBLISH_TARGETS.filter((target) => target.credential !== undefined).map((target) => target.id);
