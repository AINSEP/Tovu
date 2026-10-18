/** Public chat always uses the in-process provider and its literal anonymous capability list.
 * Owner CLI settings and legacy demo opt-ins cannot enter this boundary. */
export type SiteAssistantMode = "byok" | "cli";
export interface SiteAssistantModeResolution { readonly mode: SiteAssistantMode; readonly refusedReason?: string }
export interface SiteAssistantModeEnv {
  readonly TOVU_SITE_ASSISTANT_MODE?: string;
  readonly TOVU_SITE_ASSISTANT_ALLOW_CLI?: string;
  readonly NODE_ENV?: string;
}
/** No owner setting or full-access environment switch is accepted by this public policy. */
export function resolveSiteAssistantMode(env: SiteAssistantModeEnv): SiteAssistantModeResolution {
  const requested = env.TOVU_SITE_ASSISTANT_MODE?.trim().toLowerCase();
  if (!requested || requested === "byok") return { mode: "byok" };
  return { mode: "byok", refusedReason: requested === "cli"
    ? "Visitor CLI execution is disabled locally and in production, regardless of TOVU_SITE_ASSISTANT_ALLOW_CLI; native access is owner-only."
    : `TOVU_SITE_ASSISTANT_MODE="${requested}" is not a recognized mode (expected byok); using byok` };
}
