# providers

## Wiring

- `providers-host-ports.ts` binds `@jini-ai/admin/screens/providers/api/providers-api`'s
  `createProvidersApi` once to this app's `request` and `WORKSPACE_ID`; callers import `providersApi`
  from there.
