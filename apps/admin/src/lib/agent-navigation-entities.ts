import type { PageEntityLookup, ResolvedPageEntity } from "@jini-ai/agentic";
import { api } from "./api";

/** Product lookups use the same authenticated read APIs as each editor. A missing row refuses
 * navigation; an authorization or transport error propagates. No handle suffix is constructed. */
const lookups: Readonly<Record<string, (required: { id: string }) => Promise<ResolvedPageEntity | null>>> = {
  "agent-plugin": async ({ id }, _options = {}) => {
    const { agentPlugins } = await api.listAgentPlugins();
    const plugin = agentPlugins.find(row => row.pluginId === id);
    if (!plugin) return null;
    return { params: {}, query: { tab: plugin.enabled ? "installed" : "downloaded" }, control: { query: plugin.pluginId, role: "button", intent: "details" } };
  },
  page: async ({ id }, _options = {}) => {
    const { post } = await api.getPage({ id });
    return { params: { slug: post.slug } };
  },
  post: async ({ id }, _options = {}) => {
    const { post } = await api.getPost({ id });
    return { params: { postId: post.id } };
  },
  menu: async ({ id }, _options = {}) => {
    const { menu } = await api.getMenu({ id });
    return { params: { menuId: menu.id } };
  },
  widget: async ({ id }, _options = {}) => {
    const { widget } = await api.getWidget({ id });
    return { params: { widgetId: widget.id } };
  },
};

/** Entity type admission happens against the published panel before this adapter is called. */
export const lookupAdminNavigationEntity: PageEntityLookup = async ({ type, id }, _options = {}) => {
  // `hasOwn` guards prototype keys ("toString"); every own entry of `lookups` is a function.
  const lookup = Object.hasOwn(lookups, type) ? lookups[type] : undefined;
  return lookup ? lookup({ id }) : null;
};
