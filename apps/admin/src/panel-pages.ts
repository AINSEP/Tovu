import { lazy } from "react";

/**
 * Tovu's route components. Declaring a lazy component evaluates no feature module; React loads
 * the owning feature's public entry only when that page renders. Related detail routes share
 * their feature chunk and keep the keys/props declared in panels.tsx. Redirects and the Forms
 * bridge stay eager: Jini keeps Forms List eager to let its API read escape saturated streams;
 * adding a native import before that read would restore the documented loading deadlock.
 * Jini already loads the Form Editor itself lazily beneath this bridge.
 * React owns promise caching and forwards failed imports to the existing root error handling.
 * Use these components only beneath the panel registry's Suspense boundary.
 */
export const Skills = lazy(() => import("./features/skills/Skills").then(module => ({ default: module.Skills })));
export const Themes = lazy(() => import("./features/themes").then(module => ({ default: module.Themes })));
export const ThemeExplore = lazy(() => import("./features/themes").then(module => ({ default: module.ThemeExplore })));
export const AdminUi = lazy(() => import("./features/admin-ui").then(module => ({ default: module.AdminUi })));
export const Dashboard = lazy(() => import("./features/dashboard").then(module => ({ default: module.Dashboard })));
export const ImportExport = lazy(() => import("./features/import-export").then(module => ({ default: module.ImportExport })));
export const CookieConsent = lazy(() => import("./features/consent").then(module => ({ default: module.CookieConsent })));
export const PostEditor = lazy(() => import("./features/posts").then(module => ({ default: module.PostEditor })));
export const Posts = lazy(() => import("./features/posts").then(module => ({ default: module.Posts })));
export const PageEditor = lazy(() => import("./features/pages").then(module => ({ default: module.PageEditor })));
export const Pages = lazy(() => import("./features/pages").then(module => ({ default: module.Pages })));
export const Members = lazy(() => import("./features/members").then(module => ({ default: module.Members })));
export const Comments = lazy(() => import("./features/comments").then(module => ({ default: module.Comments })));
export const Analytics = lazy(() => import("./features/analytics").then(module => ({ default: module.Analytics })));
export const Library = lazy(() => import("./features/library").then(module => ({ default: module.Library })));
export const Menus = lazy(() => import("./features/menus").then(module => ({ default: module.Menus })));
export const MenuEditor = lazy(() => import("./features/menus").then(module => ({ default: module.MenuEditor })));
export { IntegrationDeliveries, IntegrationsRedirect } from "./features/integrations";
export const Providers = lazy(() => import("./features/providers").then(module => ({ default: module.Providers })));
export const Users = lazy(() => import("./features/users").then(module => ({ default: module.Users })));
export const Authentication = lazy(() => import("./features/authentication").then(module => ({ default: module.Authentication })));
export const Roles = lazy(() => import("./features/roles").then(module => ({ default: module.Roles })));
export const SettingsUi = lazy(() => import("./features/settings").then(module => ({ default: module.SettingsUi })));
export const Seo = lazy(() => import("./features/seo").then(module => ({ default: module.Seo })));
export const Redirects = lazy(() => import("./features/redirects").then(module => ({ default: module.Redirects })));
export const Plugins = lazy(() => import("./features/plugins").then(module => ({ default: module.Plugins })));
export const AgentPlugins = lazy(() => import("./features/plugins").then(module => ({ default: module.AgentPlugins })));
export { FormsList, FormEditor } from "./features/forms";
export const Collections = lazy(() => import("./features/collections").then(module => ({ default: module.Collections })));
export const CollectionEntries = lazy(() => import("./features/collections").then(module => ({ default: module.CollectionEntries })));
export const CollectionEntryEditor = lazy(() => import("./features/collections").then(module => ({ default: module.CollectionEntryEditor })));
export const Taxonomy = lazy(() => import("./features/taxonomy").then(module => ({ default: module.Taxonomy })));
export const Trash = lazy(() => import("./features/trash").then(module => ({ default: module.Trash })));
export const Email = lazy(() => import("./features/email").then(module => ({ default: module.Email })));
export const EmailTemplateEditor = lazy(() => import("./features/email").then(module => ({ default: module.EmailTemplateEditor })));
export const Database = lazy(() => import("./features/database").then(module => ({ default: module.Database })));
export const Recovery = lazy(() => import("./features/recovery").then(module => ({ default: module.Recovery })));
export const Deployment = lazy(() => import("./features/deployment").then(module => ({ default: module.Deployment })));
export const SourceControl = lazy(() => import("./features/source-control").then(module => ({ default: module.SourceControl })));
export const Security = lazy(() => import("./features/security").then(module => ({ default: module.Security })));
export const Observability = lazy(() => import("./features/observability").then(module => ({ default: module.Observability })));
export const WidgetsLibrary = lazy(() => import("./features/widgets").then(module => ({ default: module.WidgetsLibrary })));
export const WidgetInstanceEditor = lazy(() => import("./features/widgets").then(module => ({ default: module.WidgetInstanceEditor })));
export const WidgetRegions = lazy(() => import("./features/widgets").then(module => ({ default: module.WidgetRegions })));
export const WidgetRegionEditor = lazy(() => import("./features/widgets").then(module => ({ default: module.WidgetRegionEditor })));
export { WorkspaceRedirect } from "./features/workspace/WorkspaceRedirect";
export const AiAssistant = lazy(() => import("./features/ai-assistant").then(module => ({ default: module.AiAssistant })));
export const Playground = lazy(() => import("./features/playground").then(module => ({ default: module.Playground })));
export const Sites = lazy(() => import("./features/sites").then(module => ({ default: module.Sites })));
export const Media = lazy(() => import("./features/media").then(module => ({ default: module.Media })));
