# mail-status

Host-side mail status: tool registrations, provider operations, test send, readiness and feedback setup.
The catalogs, permission ids/grant registrar and `mailDomainDepsFrom` live in
`@jini-ai/user-management/mail/status/*`.

## Wiring

- `registerMailPermissionGrants` is called with the composition's grant registry in
  `server/runtime/composition/app-permission-grants.ts`.
- `mailDomainDepsFrom` is called with the route/tool deps bag in `./delivery-tool-registrations.ts` and
  `server/inbound/admin-http/routes/system/mail-activity.ts`.
