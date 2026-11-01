/**
 * @file GENERATED — do not edit by hand. The admin app's agent-navigable screens (id, sidebar label,
 * route path relative to `/admin`), exactly as `apps/admin/src/lib/agent-pages.ts`'s
 * `listAdminAgentScreens()` derives them from `panels.tsx`'s `ADMIN_PANELS`.
 *
 * Checked in because the server cannot import that browser bundle. Guarded by
 * `apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts`, which fails when this list and
 * `ADMIN_PANELS` disagree. Regenerate from `apps/admin`:
 *   UPDATE_ADMIN_SCREENS_MANIFEST=1 npx vitest run src/lib/__tests__/admin-screens-manifest.unit.test.ts
 */

import type { AgentNavigationScreen } from "@jini-ai/agentic";

export const ADMIN_SCREENS: readonly AgentNavigationScreen[] = [
  {"id":"dashboard","label":"Overview","description":"Review site status, recent activity and useful next steps.","path":"/","routeTemplates":["/"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"sites","label":"Sites","description":"Manage sites and switch between connected workspaces.","path":"/sites","routeTemplates":["/sites"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"import-export","label":"Import & Export","description":"Import content and export a portable copy of your site.","path":"/import-export","routeTemplates":["/import-export"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"ai-assistant","label":"AI Assistant","description":"Configure the assistant, agent runtimes and model access.","path":"/ai-assistant","routeTemplates":["/ai-assistant"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"pages","label":"Pages","description":"Create and edit site pages and their content.","path":"/pages","routeTemplates":["/pages","/pages/:slug"],"allowedQueryParams":{},"entityTargets":[{"type":"page","routeTemplate":"/pages/:slug"}]},
  {"id":"posts","label":"Posts","description":"Write, edit and organize posts.","path":"/posts","routeTemplates":["/posts","/posts/:postId"],"allowedQueryParams":{},"entityTargets":[{"type":"post","routeTemplate":"/posts/:postId"}]},
  {"id":"media","label":"Media","description":"Upload and organize images, videos and other media.","path":"/media","routeTemplates":["/media"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"library","label":"Library","description":"Browse saved assets and reusable content.","path":"/library","routeTemplates":["/library"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"collections","label":"Collections","description":"Define content collections and edit their entries.","path":"/collections","routeTemplates":["/collections","/collections/:contentTypeKey/:entryId","/collections/:contentTypeKey"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"menus","label":"Menus","description":"Build navigation menus and arrange their links.","path":"/menus","routeTemplates":["/menus","/menus/new","/menus/:menuId"],"allowedQueryParams":{},"entityTargets":[{"type":"menu","routeTemplate":"/menus/:menuId"}]},
  {"id":"widgets","label":"Widgets","description":"Create widgets and place them in site regions.","path":"/widgets","routeTemplates":["/widgets","/widgets/regions","/widgets/regions/:regionKey","/widgets/new","/widgets/:widgetId"],"allowedQueryParams":{"type":null},"entityTargets":[{"type":"widget","routeTemplate":"/widgets/:widgetId"}]},
  {"id":"widget-regions","label":"Widget Regions","description":"Create widgets and place them in site regions.","path":"/widgets/regions","routeTemplates":["/widgets/regions","/widgets/regions/:regionKey","/widgets/new","/widgets/:widgetId"],"allowedQueryParams":{"type":null},"entityTargets":[]},
  {"id":"taxonomy","label":"Categories & Tags","description":"Organize content with categories and tags.","path":"/taxonomy","routeTemplates":["/taxonomy"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"forms","label":"Forms","description":"Create forms and review submissions.","path":"/forms","routeTemplates":["/forms","/forms/:formId/submissions","/forms/:formId"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"users","label":"Users","description":"Manage admin users and their account access.","path":"/users","routeTemplates":["/users","/users/change-password"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"authentication","label":"Authentication","description":"Configure sign-in methods and authentication providers.","path":"/authentication","routeTemplates":["/authentication"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"roles","label":"Roles & Permissions","description":"Manage roles and the permissions they grant.","path":"/roles","routeTemplates":["/roles"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"members","label":"Members","description":"Manage site members and their access.","path":"/members","routeTemplates":["/members"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"comments","label":"Comments","description":"Review and moderate comments.","path":"/comments","routeTemplates":["/comments"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"themes","label":"Themes","description":"Choose, customize and manage site themes.","path":"/themes","routeTemplates":["/themes","/themes/explore"],"allowedQueryParams":{"theme":null,"page":null,"file":null,"tab":null},"entityTargets":[]},
  {"id":"admin-ui","label":"Admin UI","description":"Customize the admin interface and its appearance.","path":"/admin-ui","routeTemplates":["/admin-ui"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"playground","label":"Playground","description":"Explore available components and interface examples.","path":"/playground","routeTemplates":["/playground"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"plugins","label":"Plugins","description":"Manage site plugins: install, inspect and turn them on or off.","path":"/addons/plugins","routeTemplates":["/addons/plugins"],"allowedQueryParams":{"tab":null,"plugin":null},"entityTargets":[]},
  {"id":"agent-plugins","label":"Agent Plugins","description":"Manage agent plugins: install, view details, turn on/off.","path":"/addons/agent-plugins","routeTemplates":["/addons/agent-plugins"],"allowedQueryParams":{"tab":["installed","downloaded","add","marketplace"]},"entityTargets":[{"type":"agent-plugin","routeTemplate":"/addons/agent-plugins"}]},
  {"id":"skills","label":"Skills","description":"Manage the skills available to your agents.","path":"/addons/skills","routeTemplates":["/addons/skills"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"providers","label":"Integrations","description":"Connect integrations and configure provider access.","path":"/addons/integrations","routeTemplates":["/addons/integrations"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"integrations","label":"Integrations","description":"Review webhook subscriptions and delivery results.","path":"/addons/integrations?tab=webhooks","routeTemplates":["/addons/integrations","/addons/integrations/:subscriptionId"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"orders","label":"Orders","description":"Review customer orders and their status.","path":"/orders","routeTemplates":["/orders"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"products","label":"Products","description":"Manage products and their catalog details.","path":"/products","routeTemplates":["/products"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"subscriptions","label":"Subscriptions","description":"Review and manage customer subscriptions.","path":"/subscriptions","routeTemplates":["/subscriptions"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"billing","label":"Billing","description":"Review billing settings and payment information.","path":"/billing","routeTemplates":["/billing"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"database","label":"Database","description":"Inspect database status, migrations and maintenance actions.","path":"/database","routeTemplates":["/database"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"recovery","label":"Recovery","description":"Review restore points and recover site data.","path":"/recovery","routeTemplates":["/recovery"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"deployment","label":"Deployment","description":"Configure deployment targets and publish your site.","path":"/deployment","routeTemplates":["/deployment"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"source-control","label":"Source Control","description":"Connect a source repository and manage synchronization.","path":"/source-control","routeTemplates":["/source-control"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"access-tokens","label":"Secrets","description":"Manage secrets, credentials and access tokens.","path":"/access-tokens","routeTemplates":["/access-tokens"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"observability","label":"Observability","description":"Inspect operational health, traces and errors.","path":"/observability","routeTemplates":["/observability"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"activity-log","label":"Activity Log","description":"Review changes and activity across your site.","path":"/activity-log","routeTemplates":["/activity-log"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"settings","label":"Settings","description":"Configure site preferences and platform settings.","path":"/settings","routeTemplates":["/settings"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"consent","label":"Cookie Consent","description":"Configure cookie consent and privacy preferences.","path":"/consent","routeTemplates":["/consent"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"workspace","label":"Workspace","description":"Manage workspace preferences and connections.","path":"/workspace","routeTemplates":["/workspace"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"email","label":"Email","description":"Manage email delivery and message templates.","path":"/email","routeTemplates":["/email","/email/templates/:templateId"],"allowedQueryParams":{"tab":null,"p":null},"entityTargets":[]},
  {"id":"trash","label":"Trash","description":"Review deleted items and restore or permanently remove them.","path":"/trash","routeTemplates":["/trash"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"seo","label":"SEO & Metadata","description":"Manage search metadata and site visibility.","path":"/seo","routeTemplates":["/seo"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
  {"id":"redirects","label":"Redirects","description":"Manage URL redirects and retired destinations.","path":"/redirects","routeTemplates":["/redirects"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"newsletter","label":"Newsletter","description":"Manage newsletter subscribers and campaigns.","path":"/newsletter","routeTemplates":["/newsletter"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"analytics","label":"Analytics","description":"Review site traffic and visitor activity.","path":"/analytics","routeTemplates":["/analytics"],"allowedQueryParams":{},"entityTargets":[]},
  {"id":"appearance","label":"Appearance","description":"Customize the appearance of your site.","path":"/appearance","routeTemplates":["/appearance"],"allowedQueryParams":{"tab":null},"entityTargets":[]},
];
