# security

## Wiring

- `SecurityPermissionsPort` comes from `@jini-ai/admin/security/host/hooks/security-permissions-port.hooks`;
  `hooks/security-permissions-dependencies.hooks.ts` implements it over `authApi`.
- `SiteKeyTab.tsx` calls `@jini-ai/admin/security/host/SiteKeyTab.hooks`'s `useRevealedKeyCopy({ hex })`
  (pure React; nothing injected).
