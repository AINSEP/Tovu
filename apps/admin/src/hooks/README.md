# Admin shell hooks (host)

## Wiring

- `@jini-ai/admin/shell/hooks/admin-execution-credential-port.hooks` owns the
  `AdminExecutionCredentialPort` type, `UNSET_ADMIN_EXECUTION_CREDENTIAL` and
  `createFakeAdminExecutionCredentialPort`. This folder keeps
  `admin-execution-credential-dependencies.hooks.ts`, the live binding to `lib/execution-settings`.
- `@jini-ai/admin/shell/hooks/use-sites-sidebar-nav.hooks` owns the Sites label hook. The host
  (`components/SitesSidebarNav.tsx`) injects `port` (`defaultSitesPort`), `useSitesSnapshot` and
  `translateNavLabel` (`lib/admin-nav-i18n`).
- Host composition that stays here: `admin-locale-dependencies`, `assistant-chats-dependencies`,
  `assistant-chats-port`, `use-admin-telemetry`, `use-settings-slice` and
  `use-standing-draft-autosave`. They bind host libs, or use names the admin kit does not offer yet.
