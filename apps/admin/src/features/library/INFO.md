# features/library (host)

The Library screen's markup (`Library.tsx`), its dictionary (`library-i18n.ts`, held in the host) and
the host bindings. Rules, tab helpers, the port and the `useLibrary` state hook live in
`@jini-ai/admin/screens/library/*`.

## Wiring

- `hooks/library-dependencies.hooks.ts` binds `LibraryPort` to the admin media/users/auth API clients.
- `hooks/use-wired-library.hooks.ts` (`useWiredLibrary`) injects that port, the admin locale, the
  Library dictionary, `describeApiError` (`lib/admin-http/request`) and `readFileAsBase64`
  (`features/media/rules`) into `useLibrary`; `Library.tsx` takes it as its `useLibraryHook` default.
- `useWiredLibrary` also injects `useContentRefreshSubscription`
  (`@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks`); `Library.tsx` passes the shell
  router's `navigate` into `goToLibraryTab({ tabId, navigate })`.
