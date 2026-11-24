import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";

/** Route data shared by panel renderers and the host's module bridge. */
export interface PanelRouteContext {
  readonly view: string | null;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
}

/** The host supplies its fallback screen so the panel registry never imports navigation. */
export interface PanelRenderContext extends PanelRouteContext {
  readonly Placeholder: import("react").ComponentType<{ sectionId: string; agentHandle?: string; useAdminLocaleHook: UseAdminLocaleHook }>;
  /** The host's one locale hook, for route loading copy, the Placeholder and module mounts. */
  readonly useAdminLocaleHook: UseAdminLocaleHook;
}
