/** Expected public URLs from the 951ef5a06 Add-ons migration, independent of admin implementation. */
export const ADDONS_PANEL_PATHS: Readonly<Record<string, string>> = {
  plugins: "/addons/plugins",
  "agent-plugins": "/addons/agent-plugins",
  skills: "/addons/skills",
  providers: "/addons/integrations",
  integrations: "/addons/integrations?tab=webhooks",
};
