import type { DeploymentCapability } from "@jini-ai/devops/deploy/react/rules";

/**
 * What a static export can and cannot serve.
 *
 * Every row restates something this panel already asserted in prose, so the list adds legibility
 * and no new claims: the three `false` rows are the three items in the tab's own existing warning
 * ("No checkout, no admin online, no assistant, no dynamic anything"), and the one `true` row is
 * what `apps/website/src/features/site-export/route-manifest.ts` actually resolves — home, products and theme pages plus every
 * published post, which is also exactly what the Static Site tab's own build copy says the exporter
 * writes.
 *
 * This describes the OUTPUT of an export, which exists and works today from the CLI. It is not a
 * claim that this screen can trigger one — that is the disabled action's own separate, stated
 * reason.
 */
export const STATIC_SITE_CAPABILITIES: readonly DeploymentCapability[] = [
  { id: "content", labelKey: "Pages, posts & products", supported: true },
  { id: "checkout", labelKey: "Checkout & orders", supported: false },
  { id: "admin", labelKey: "Admin panel, online", supported: false },
  { id: "assistant", labelKey: "AI assistant", supported: false },
] as const;

/**
 * What the full server serves — the same four rows, all supported, which is the whole point of
 * showing them side by side: the difference between the two paths becomes a shape you can see
 * rather than two sentences you have to hold in your head and diff.
 *
 * This describes the full server's capabilities for the Overview comparison. Deployment
 * provisioning is handled by the deploy plugin; the old Full Site provider list was retired.
 */
export const FULL_SITE_CAPABILITIES: readonly DeploymentCapability[] = STATIC_SITE_CAPABILITIES.map((row) => ({
  ...row,
  supported: true,
}));

export const envVarNotes: Readonly<Record<string, string>> = {
  TOVU_ADMIN_PASSWORD: "Falls back to a public default.",
  TOVU_ADMIN_USER: 'Falls back to "admin".',
  TOVU_SITE_KEY: "Required to boot in production. Missing locally shows as a 503 on the AI Assistant screen instead.",
  JINI_AGENT_DAEMON_PORT: "Falls back to port 4319.",
};
export const unsafeOwnerPasswordVar = "TOVU_ADMIN_PASSWORD";
export const copy = {
  fullSiteGetLine: "The complete Tovu server — admin, assistant, checkout, everything works.",
  unsafeOwnerPasswordLabel: "Still the default — set TOVU_ADMIN_PASSWORD.",
  credentialSubtitle: "Save your {credential} so Tovu can publish on your behalf.",
};
