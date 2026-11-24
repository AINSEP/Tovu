import { createFormsCapabilityCard } from "@jini-ai/cms/forms/capability-card";
import { createContentCapabilityCard } from "@jini-ai/cms/posts/capability-card";
import { createWidgetsCapabilityCard } from "@jini-ai/cms/widgets/capability-card";

/** The Tovu permission ids, tool names and admin routes bound into the learning cards `@jini-ai/cms` owns. */
export const contentCapabilityCard = createContentCapabilityCard({
  host: { permission: "content.read", inspectTool: "content_read.content_post", adminHref: "/admin/posts" },
});
export const formsCapabilityCard = createFormsCapabilityCard({
  host: { permission: "admin.forms.manage", inspectTool: "content_read.form_definition", adminHref: "/admin/forms" },
});
export const widgetsCapabilityCard = createWidgetsCapabilityCard({
  host: {
    permission: "widgets.read",
    inspectInstancesTool: "content_read.widget_instance",
    inspectRegionsTool: "content_read.widget_region",
    adminHref: "/admin/widgets",
  },
});
